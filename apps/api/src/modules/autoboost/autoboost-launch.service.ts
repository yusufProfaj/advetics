import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  autoBoostPresetSettingsSchema,
  boostNameBase,
  MEDIA_TYPE_LABELS,
  type MediaType,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetUploaderService } from '../assets/asset-uploader.service';
import { BoostExecutorService } from '../boosts/boost-executor.service';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';

/**
 * "ONAYLA VE BOOSTLA" — kartın yayına dönüştüğü yer.
 *
 * ═══ META YOLU MEVCUT, DOĞRULANMIŞ KODU KULLANIYOR ═══
 *
 * Yeni bir yayın yolu YAZILMADI. Kart onaylandığında `boosts` satırı açılıyor
 * ve yayın `BoostExecutorService.createApproved` üzerinden gidiyor — canlıda
 * çalışan, `destination_type`, Instagram kreatifi ve kreatif doğrulaması dahil
 * bütün dersleri taşıyan yol. İkinci bir yol yazmak, o derslerin ikinci kez
 * öğrenilmesi demekti.
 *
 * Yan fayda: harcama muhasebesi (K19) ve ağaç kaydı kendiliğinden çalışıyor,
 * çünkü ikisi de `boosts` satırına bağlı.
 */
@Injectable()
export class AutoBoostLaunchService {
  private readonly logger = new Logger(AutoBoostLaunchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executor: BoostExecutorService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly uploader: AssetUploaderService,
  ) {}

  async decide(
    ctx: TenantContext,
    queueItemId: string,
    approve: boolean,
  ): Promise<{ status: string; message: string }> {
    /*
     * BAĞLAM DARALTMASI KAPATILIYOR (`activeClientId: null`).
     *
     * `app.can_access_client` aktif müşteriye göre süzüyor ve kart başka bir
     * müşteriye aitse UPDATE sonrası satır kendi görüş alanının DIŞINA
     * düşerdi: `new row violates row-level security policy`. WITH CHECK'i
     * gevşetmek çözmüyor, engel SELECT politikasında — çözüm çağıran tarafta
     * daraltmayı kapatmak. `ad-account-pool-rls.spec.ts` bu dersi kilitliyor.
     */
    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const kayit = await this.prisma.withTenant(scoped, async (tx) => {
      const [row] = await tx.$queryRaw<KuyrukSatiri[]>(Prisma.sql`
        SELECT q.id::text AS id, q.org_id::text AS org_id, q.client_id::text AS client_id,
               q.platform::text AS platform, q.status, q.external_id,
               q.social_profile_id::text AS social_profile_id, q.title,
               p.id::text AS post_id,
               sp.linked_ad_account_id::text AS linked_ad_account_id,
               cl.name AS client_name,
               pr.id::text AS preset_id, pr.enabled AS preset_enabled,
               pr.budget_mode, pr.daily_budget_micros, pr.total_budget_micros,
               pr.duration_days, pr.settings
        FROM auto_boost_queue_items q
        JOIN clients cl ON cl.id = q.client_id
        JOIN social_profiles sp ON sp.id = q.social_profile_id
        -- GÖNDERİ KAYDI: Meta yolunda organic_post_id zorunlu ve gönderi
        -- süpürmeden geliyor. YouTube'da karşılığı yok (LEFT JOIN).
        -- (SQL yorumunda ters tırnak YASAK — sablonu ortasindan kapatiyor.)
        LEFT JOIN organic_posts p
          ON p.social_profile_id = q.social_profile_id AND p.external_id = q.external_id
        LEFT JOIN LATERAL (
          SELECT * FROM auto_boost_presets ap
          WHERE ap.client_id = q.client_id AND ap.platform = q.platform
            AND (ap.social_profile_id = q.social_profile_id OR ap.social_profile_id IS NULL)
          ORDER BY ap.social_profile_id NULLS LAST
          LIMIT 1
        ) pr ON true
        WHERE q.id = ${queueItemId}::uuid
      `);
      return row ?? null;
    });

    if (!kayit) throw new NotFoundException('Kart bulunamadı');

    /*
     * YALNIZCA `pending` KARARA AÇIK. Bir kez onaylanmış kartı yeniden
     * onaylamak İKİNCİ bir reklam açardı — ve iki kez para harcardı.
     */
    if (kayit.status !== 'pending') {
      throw new BadRequestException(
        `Bu kart zaten işlendi (durum: ${kayit.status}). Sayfayı yenile.`,
      );
    }

    if (!approve) {
      await this.prisma.withTenant(scoped, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE auto_boost_queue_items
          SET status = 'rejected', approved_by = ${ctx.userId}::uuid,
              approved_at = now(), updated_at = now()
          WHERE id = ${queueItemId}::uuid AND status = 'pending'
        `),
      );
      return { status: 'rejected', message: 'Kart reddedildi.' };
    }

    if (kayit.platform === 'google') return this.launchGoogle(ctx, scoped, kayit);

    return this.launchMeta(ctx, scoped, kayit);
  }

  /**
   * Meta kartını yayına alır.
   *
   * `boosts` SATIRI AÇILIYOR ve yayın mevcut yürütücüden geçiyor. Ayrı bir
   * yol yazmak, canlıda öğrenilmiş her dersi (destination_type, Instagram
   * kreatifi, kreatif doğrulaması, transaction sınırı) ikinci kez öğrenmek
   * demekti.
   */
  private async launchMeta(
    ctx: TenantContext,
    scoped: TenantContext,
    kayit: KuyrukSatiri,
  ): Promise<{ status: string; message: string }> {
    if (!kayit.preset_id || !kayit.preset_enabled) {
      throw new BadRequestException(
        'Bu müşteri için otomatik boost ön ayarı yok ya da kapalı.',
      );
    }
    if (!kayit.post_id) {
      /*
       * GÖNDERİ KAYDI YOKSA YAYINLANAMIYOR. `boosts.organic_post_id` zorunlu
       * ve harcama muhasebesi ona bağlı. Kart var ama gönderi yoksa süpürme
       * arada silmiş demektir — sessizce devam etmek, muhasebesi olmayan bir
       * boost üretirdi.
       */
      throw new BadRequestException(
        'Gönderi kaydı bulunamadı. "Şimdi güncelle" ile gönderileri yenile.',
      );
    }
    if (!kayit.linked_ad_account_id) {
      throw new BadRequestException(
        'Bu sayfaya bağlı bir reklam hesabı yok. Müşteriler ekranından ' +
          '"Boost hesabı" seç — reklam o hesaptan faturalandırılıyor.',
      );
    }

    const ayar = autoBoostPresetSettingsSchema.safeParse(kayit.settings);
    if (!ayar.success || ayar.data.platform !== 'meta') {
      throw new BadRequestException(
        'Ön ayar kaydı okunamadı; Bilgi Bankası’ndan yeniden kaydet.',
      );
    }
    const meta = ayar.data;

    // --- Kartı KİLİTLE (ikinci onay engelleniyor)
    const kilit = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'launching', approved_by = ${ctx.userId}::uuid,
            approved_at = now(), updated_at = now()
        WHERE id = ${kayit.id}::uuid AND status = 'pending'
      `),
    );
    /*
     * KOŞULLU GÜNCELLEME YARIŞA KARŞI. İki kullanıcı aynı anda onaylarsa
     * ikincisinin `WHERE status = 'pending'` koşulu tutmuyor ve sıfır satır
     * güncelleniyor — o da burada duruyor. "Önce oku sonra yaz" yarışı
     * kaybederdi.
     */
    if (kilit === 0) {
      throw new BadRequestException('Bu kart az önce işlendi. Sayfayı yenile.');
    }

    const now = new Date();
    const adTabani = boostNameBase({
      clientName: kayit.client_name,
      postMessage: kayit.title,
      mediaLabel: MEDIA_TYPE_LABELS['photo' as MediaType],
      date: now,
    });

    // --- `boosts` satırını aç (onaylanmış olarak)
    const boostId = await this.prisma.withTenant(scoped, async (tx) => {
      const [b] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO boosts (
          id, org_id, client_id, boost_rule_id, organic_post_id, ad_account_id,
          status, budget_mode, total_budget_micros, daily_budget_micros,
          duration_days, objective, targeting, saved_audience_id,
          reason, approved_by, approved_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${kayit.org_id}::uuid, ${kayit.client_id}::uuid,
          -- KURAL YOK: bu boost'u kural değil kullanıcı onayladı.
          NULL, ${kayit.post_id}::uuid, ${kayit.linked_ad_account_id}::uuid,
          'approved', ${kayit.budget_mode}, ${kayit.total_budget_micros},
          ${kayit.daily_budget_micros}, ${kayit.duration_days},
          'OUTCOME_ENGAGEMENT',
          ${meta.savedAudienceId ? null : JSON.stringify(metaTargeting(meta))}::jsonb,
          ${meta.savedAudienceId},
          ${`Bildirim havuzundan onaylandı — ${adTabani}`.slice(0, 500)},
          ${ctx.userId}::uuid, now(), now()
        )
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id
      `);
      return b?.id ?? null;
    });

    if (!boostId) {
      // Aynı gönderi için canlı boost var — kısmi tekil indeks engelledi.
      await this.geriAl(scoped, kayit.id, 'Bu gönderi için zaten canlı bir boost var.');
      throw new BadRequestException('Bu gönderi için zaten canlı bir boost var.');
    }

    await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items SET boost_id = ${boostId}::uuid, updated_at = now()
        WHERE id = ${kayit.id}::uuid
      `),
    );

    /*
     * YAYIN — ÇALIŞTIRICI VERİLİYOR, HAZIR BİR `tx` DEĞİL.
     *
     * Platform çağrısı transaction'ın DIŞINDA kalmak zorunda: `withTenant`
     * etkileşimli bir transaction açıyor ve Prisma'nın 5 saniyelik sınırı
     * Meta'ya yapılan çağrıların süresinden kısa — üretimde 12,5 saniye
     * ölçüldü ve transaction ölünce hata bile kaydedilemedi.
     */
    const sonuc = await this.executor.createApproved(
      (fn) => this.prisma.withTenant(scoped, fn),
      kayit.client_id,
      1,
    );

    if (sonuc.created > 0) {
      await this.prisma.withTenant(scoped, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE auto_boost_queue_items q
          SET status = 'launched', launched_at = now(), error = NULL,
              external_campaign_id = b.external_campaign_id,
              external_ad_id = b.external_ad_id,
              updated_at = now()
          FROM boosts b
          WHERE q.id = ${kayit.id}::uuid AND b.id = ${boostId}::uuid
        `),
      );
      return { status: 'launched', message: 'Gönderi yayına alındı.' };
    }

    /*
     * BAŞARISIZ: HATA `boosts` SATIRINDA ve oradan karta taşınıyor. Kendi
     * cümlemizi yazmak, Meta'nın söylediğini kaybetmek olurdu — bu projede
     * en pahalı hata tipi tam olarak o.
     */
    const satirlar = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ error: string | null; status: string }>>(Prisma.sql`
        SELECT error, status FROM boosts WHERE id = ${boostId}::uuid
      `),
    );
    const b = satirlar[0];
    const mesaj = b?.error ?? 'Yayın başarısız oldu; sebep kaydedilemedi.';
    await this.geriAl(scoped, kayit.id, mesaj);
    return { status: 'failed', message: mesaj };
  }

  /**
   * YouTube kartını yayına alır — Demand Gen.
   *
   * META YOLUNDAN ÜÇ YAPISAL FARK ve üçü de platformun gerçeği:
   *
   *   1. `boosts` SATIRI AÇILMIYOR. O tablo `organic_post_id` zorunlu kılıyor
   *      ve YouTube videosunun organik gönderi karşılığı yok. Kimlikler
   *      doğrudan kuyruk kaydında duruyor; Google harcaması `insights_daily`
   *      üzerinden zaten senkronize ediliyor.
   *   2. BÜTÇE GÜNLÜK. Google'da toplam bütçe yok — kısıt veritabanında da
   *      var (`auto_boost_presets_google_daily_chk`).
   *   3. KAMPANYA PAUSED KALIYOR. Google yazma yolu canlıda hiç çalışmadı;
   *      ilk gerçek çağrının sonucunu insan görmeden para harcamamalı.
   */
  private async launchGoogle(
    ctx: TenantContext,
    scoped: TenantContext,
    kayit: KuyrukSatiri,
  ): Promise<{ status: string; message: string }> {
    if (!kayit.preset_id || !kayit.preset_enabled) {
      throw new BadRequestException(
        'Bu müşteri için YouTube otomatik boost ön ayarı yok ya da kapalı.',
      );
    }
    if (!kayit.linked_ad_account_id) {
      throw new BadRequestException(
        'Bu kanala bağlı bir Google reklam hesabı yok. Müşteriler ekranından ' +
          'reklam hesabı seç — reklam o hesaptan faturalandırılıyor.',
      );
    }

    const ayar = autoBoostPresetSettingsSchema.safeParse(kayit.settings);
    if (!ayar.success || ayar.data.platform !== 'google') {
      throw new BadRequestException(
        'Ön ayar kaydı okunamadı; Bilgi Bankası’ndan yeniden kaydet.',
      );
    }
    const g = ayar.data;

    if (kayit.budget_mode !== 'daily' || !kayit.daily_budget_micros) {
      /*
       * GOOGLE'DA TOPLAM BÜTÇE YOK. Kısıt veritabanında da var ama burada
       * tekrar kontrol ediliyor: kayıt kısıt eklenmeden önce yazılmış
       * olabilir ve toplam bütçeyi günlüğe bölmek panelde yazan tutarla
       * hesaptan çıkanı ayrıştırırdı.
       */
      throw new BadRequestException(
        'YouTube kampanyası günlük bütçe gerektiriyor; ön ayarda toplam bütçe seçili.',
      );
    }

    /*
     * REKLAM HESABI GOOGLE OLMAK ZORUNDA.
     *
     * `linked_ad_account_id` bir Meta hesabını gösteriyorsa istek Google'a
     * Meta hesap kimliğiyle gider ve "hesap bulunamadı" ile döner — sebebi
     * anlaşılmayan bir hata. Burada kontrol etmek, o hatayı okunabilir bir
     * cümleye çeviriyor.
     */
    const [hesap] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ platform: string; external_id: string; connection_id: string }>>(
        Prisma.sql`
          SELECT platform::text AS platform, external_id, connection_id::text AS connection_id
          FROM ad_accounts WHERE id = ${kayit.linked_ad_account_id}::uuid
        `,
      ),
    );
    if (!hesap) throw new BadRequestException('Reklam hesabı bulunamadı.');
    if (hesap.platform !== 'google') {
      throw new BadRequestException(
        'Bu kanala bağlı hesap bir Google Ads hesabı değil. YouTube reklamı ' +
          'Google Ads hesabından yayınlanıyor; Müşteriler ekranından doğru ' +
          'hesabı seç.',
      );
    }

    // --- Kartı KİLİTLE (Meta yoluyla aynı yarış koruması)
    const kilit = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'launching', approved_by = ${ctx.userId}::uuid,
            approved_at = now(), updated_at = now()
        WHERE id = ${kayit.id}::uuid AND status = 'pending'
      `),
    );
    if (kilit === 0) {
      throw new BadRequestException('Bu kart az önce işlendi. Sayfayı yenile.');
    }

    try {
      const provider = this.providers.get('google');
      const accessToken = await this.vault.getAccessToken(hesap.connection_id, provider);
      const fetchCtx = { accessToken, accountExternalId: hesap.external_id };

      /*
       * LOGO ÖNBELLEKTEN. İlk yayında yükleniyor, sonrakiler kaynak adını
       * `asset_platform_refs`ten okuyor — aynı görseli her videoda yeniden
       * yüklemek kota harcar ve hesapta mükerrer varlık üretir.
       */
      const logoResource = await this.uploader.ensureExternalRef(scoped, {
        assetId: g.logoAssetId,
        adAccountId: kayit.linked_ad_account_id,
        label: `${kayit.client_name} logo`,
        fetchCtx,
        platform: 'google',
      });

      const sonuc = await provider.createVideoBoost(fetchCtx, {
        name: boostNameBase({
          clientName: kayit.client_name,
          postMessage: kayit.title,
          mediaLabel: 'Video',
          date: new Date(),
        }),
        dailyBudgetMicros: BigInt(kayit.daily_budget_micros),
        durationDays: kayit.duration_days ?? 7,
        videoId: kayit.external_id,
        videoTitle: kayit.title ?? kayit.external_id,
        logoAssetResource: logoResource,
        businessName: g.businessName,
        finalUrl: g.finalUrl,
        headlines: g.headlines,
        longHeadlines: g.longHeadlines,
        descriptions: g.descriptions,
      });

      await this.prisma.withTenant(scoped, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE auto_boost_queue_items
          SET status = 'launched', launched_at = now(), error = NULL,
              external_campaign_id = ${sonuc.campaignId},
              external_ad_group_id = ${sonuc.adGroupId},
              external_ad_id = ${sonuc.adId},
              updated_at = now()
          WHERE id = ${kayit.id}::uuid
        `),
      );

      return {
        status: 'launched',
        message:
          'YouTube kampanyası oluşturuldu ve DURAKLATILMIŞ açıldı. Google ' +
          'Ads’te gözden geçirip yayına al — bu yol canlıda ilk kez ' +
          'çalışıyor ve sonucu insan görmeden para harcamamalı.',
      };
    } catch (err) {
      /*
       * PLATFORMUN KENDİ MESAJI TAŞINIYOR. Kendi cümlemizi yazmak, Google'ın
       * söylediğini kaybetmek olurdu — bu projede en pahalı hata tipi tam
       * olarak o.
       */
      const mesaj = err instanceof Error ? err.message : String(err);
      this.logger.error(`YouTube yayını başarısız (kart ${kayit.id}): ${mesaj}`);
      await this.geriAl(scoped, kayit.id, mesaj);
      return { status: 'failed', message: mesaj };
    }
  }

  /**
   * Kartı `failed` yapar ve sebebini yazar.
   *
   * `pending`E GERİ ALINMIYOR: geri almak, kullanıcının aynı düğmeye tekrar
   * basıp platformda İKİNCİ bir kampanya açmasına izin verirdi. Hata
   * giderildikten sonra kart elle yeniden açılmalı — bilinçli bir sürtünme.
   */
  private async geriAl(ctx: TenantContext, id: string, mesaj: string): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'failed', error = ${mesaj.slice(0, 1000)}, updated_at = now()
        WHERE id = ${id}::uuid
      `),
    );
  }
}

/**
 * Ön ayardaki hedeflemeyi Meta nesnesine çevirir.
 *
 * LOKASYON KOVALARI AYRI ve ülke geneli lokasyon seçiliyken GÖNDERİLMİYOR:
 * Meta bu kovaları BİRLEŞİM olarak uyguluyor, yani "Türkiye + İzmir" Türkiye
 * geneli demek ve hiçbir hata vermiyor.
 */
function metaTargeting(m: {
  locations: Array<{ key: string; type: 'country' | 'region' | 'city' }>;
  ageMin: number;
  ageMax: number;
  genders: 'all' | 'male' | 'female';
}): Record<string, unknown> {
  const geo: Record<string, string[]> = {};
  for (const l of m.locations) {
    const kova = l.type === 'country' ? 'countries' : l.type === 'region' ? 'regions' : 'cities';
    (geo[kova] ??= []).push(l.key);
  }
  if (m.locations.length === 0) geo.countries = ['TR'];

  const t: Record<string, unknown> = {
    geo_locations: geo,
    age_min: m.ageMin,
    age_max: m.ageMax,
  };
  if (m.genders !== 'all') t.genders = [m.genders === 'male' ? 1 : 2];
  return t;
}

interface KuyrukSatiri {
  id: string;
  org_id: string;
  client_id: string;
  client_name: string;
  platform: string;
  status: string;
  external_id: string;
  social_profile_id: string;
  title: string | null;
  post_id: string | null;
  linked_ad_account_id: string | null;
  preset_id: string | null;
  preset_enabled: boolean | null;
  budget_mode: string | null;
  daily_budget_micros: bigint | null;
  total_budget_micros: bigint | null;
  duration_days: number | null;
  settings: unknown;
}
