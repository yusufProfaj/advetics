import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CANLI_BOOST_SQL } from '../boosts/canli-boost';
import {
  AUTOBOOST_TAKILMA_ESIGI_DAKIKA,
  AUTOBOOST_TEKRAR_ACIK_DURUMLAR,
  autoBoostPresetSettingsSchema,
  boostNameBase,
  MEDIA_TYPE_LABELS,
  type MediaType,
  type AutoBoostQueueOverride,
  type YoutubeKartMetinleri,
  type MetaPresetSettings,
  type GooglePresetSettings,
  type TenantContext,
  type YoutubeProvaSonucu,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { butceKipi, butceyiCoz, hedeflemeyiCoz, kartPlatformu, yabanciOzelKitle } from './kart-ozellestirme';
import { YoutubeOtomatikService } from './youtube-otomatik.service';
import { youtubeHesabiEngeli } from './youtube-hesabi';
import type { VideoMetinleri } from './youtube-otomatik';
import {
  VARSAYILAN_KONUM,
  googleAlanHatalari,
  googleYalinKimlik,
} from '../connections/providers/google-demandgen';
import { googleAlanEtiketi } from './youtube-prova';
import { PlatformApiError, type VideoBoostIstegi } from '../connections/provider.types';
import { googleYazmaAcikMi } from '../reklam/yazma-kapisi';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { youtubeUygulananAyar, YOUTUBE_CANLI_BITER_SQL } from './youtube-yayin-durumu';
import { YouTubeApiService } from './youtube-api.service';
import { AssetUploaderService } from '../assets/asset-uploader.service';
import { BoostExecutorService } from '../boosts/boost-executor.service';
import { BoostsService } from '../boosts/boosts.service';
import { metaTargetingFrom } from '../boosts/meta-targeting';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';

/*
 * ═══ ÖN AYARIN NEREDE OLDUĞU TEK YERDE YAZILI ═══
 *
 * Bu cümleler bir süre "Kütüphane → Bilgi Bankası" diyordu. Ön ayar formu
 * oradan alınıp Akıllı Boost sayfasındaki "Boost ön ayarı" modalına taşınınca
 * altı ayrı yerde ELLE yazılmış olan o yönlendirme kullanıcıyı artık ön ayar
 * TAŞIMAYAN bir sayfaya göndermeye başladı — üstelik aynı ekrandaki elle
 * boost kutusu doğru yeri gösterdiği için kullanıcı ÇELİŞEN İKİ TALİMAT
 * okuyordu. Altı kopyanın hepsini bulmak da mümkün olmadı: metin kopyalandığı
 * her yerde ayrı ayrı eskiyor.
 *
 * Bugün tek sabit. İki kural:
 *  1. Düğmenin adı `apps/web/src/components/autoboost/boost-on-ayari.tsx`
 *     içindeki etiketle BİREBİR aynı — metindeki ad ekrandakinden ayrışırsa
 *     kullanıcı olmayan bir düğmeyi arar.
 *  2. SAYFA ADI DA YAZILI ("Akıllı Boost", `nav-sections.ts` etiketi). Bu
 *     hatalar gönderi listesinden de fırlıyor, yani kullanıcı her zaman
 *     düğmenin durduğu sayfada değil; yalnızca "yukarıdaki düğme" demek
 *     oradan gelen kullanıcıyı boşluğa bakmaya gönderirdi.
 */
const ON_AYAR_YERI = 'Akıllı Boost sayfasındaki "Boost ön ayarı" düğmesinden';

/** Kayıt bozuk — hem Meta hem Google yolunda aynı cümle. */
const ON_AYAR_BOZUK = `Ön ayar kaydı okunamadı; ${ON_AYAR_YERI} yeniden kaydet.`;

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
    private readonly boosts: BoostsService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly uploader: AssetUploaderService,
    /** YouTube: marka, logo ve adres otomatik — en sonda, testler konumla geçiriyor. */
    private readonly youtubeOtomatik: YoutubeOtomatikService,
    private readonly youtube: YouTubeApiService,
    /** Google yayınından önce kota: zincirin ORTASINDA bitmesin (P4). */
    private readonly quota: QuotaGuardService,
  ) {}

  async decide(
    ctx: TenantContext,
    queueItemId: string,
    approve: boolean,
    /**
     * SADECE BU KART İÇİN geçerli ayarlar — ön ayarı DEĞİŞTİRMİYOR.
     * Verilmeyen alan ön ayardan geliyor; yarısı boş bir nesne, boş
     * bırakılan alanları sıfırlamak anlamına GELMİYOR.
     */
    override?: AutoBoostQueueOverride,
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

    const kayit = await this.kartiOku(scoped, queueItemId);

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

    /*
     * ÖZELLEŞTİRME BURADA UYGULANIYOR — DALLARDAN ÖNCE.
     *
     * İki yayın dalına ayrı ayrı yazmak, birinin bir gün diğerini
     * tutmaması demekti: Google dalı bütçeyi ön ayardan okumaya devam
     * eder ve kullanıcının girdiği tutar SESSİZCE yok sayılırdı.
     */
    const ozellestirilmis = this.ozellestir(kayit, override);

    /*
     * METİN ÖZELLEŞTİRMESİ YALNIZCA YOUTUBE'DA. Instagram boost'u gönderinin
     * kendi metniyle gidiyor; kabul edip yok saymak, kullanıcının düzeltmesinin
     * hiçbir yere gitmemesi demekti.
     */
    if (override?.texts && kayit.platform !== 'google') {
      throw new BadRequestException('Reklam metni düzenlemesi yalnızca YouTube kartlarında geçerli.');
    }
    // Aynı gerekçe: kabul edip yok saymak, çalışmayan bir seçenek göstermek olurdu.
    if (override?.hedefAdres !== undefined && kayit.platform !== 'google') {
      // Instagram boost'u gönderinin kendisine gidiyor; adres kabul edip
      // yok saymak çalışmayan bir alan göstermek olurdu.
      throw new BadRequestException('Hedef adres yalnızca YouTube kartında değiştirilebilir.');
    }
    if (override?.duraklatilmis !== undefined && kayit.platform !== 'google') {
      throw new BadRequestException('"Duraklatılmış kur" yalnızca YouTube kartlarında geçerli.');
    }

    if (kayit.platform === 'google') {
      return this.launchGoogle(ctx, scoped, ozellestirilmis, override?.texts, override?.duraklatilmis === true, override?.hedefAdres);
    }

    return this.launchMeta(ctx, scoped, ozellestirilmis, override);
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
    override?: AutoBoostQueueOverride,
  ): Promise<{ status: string; message: string }> {
    if (!kayit.preset_id || !kayit.preset_enabled) {
      throw new BadRequestException(
        'Bu workspace için otomatik boost ön ayarı yok ya da kapalı.',
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
        'Bu sayfaya bağlı bir reklam hesabı yok. Workspace’ler ekranından ' +
          '"Boost hesabı" seç — reklam o hesaptan faturalandırılıyor.',
      );
    }

    const ayar = autoBoostPresetSettingsSchema.safeParse(kayit.settings);
    if (!ayar.success || ayar.data.platform !== 'meta') {
      throw new BadRequestException(ON_AYAR_BOZUK);
    }
    /*
     * HEDEFLEME ÖN AYAR AYRIŞTIRILDIKTAN SONRA birleştiriliyor: özelleştirme
     * ham JSON'a değil, DOĞRULANMIŞ nesneye biniyor. Ters sırada bozuk bir
     * ön ayar üstüne yazılan geçerli bir hedefleme, şemadan geçmiş gibi
     * görünürdü.
     */
    const birlesik = hedeflemeyiCoz(ayar.data, override);
    if (birlesik.platform !== 'meta') throw new BadRequestException(ON_AYAR_BOZUK);
    const meta = birlesik;

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

    const boostId = await this.onAyardanBoostAc(scoped, {
      orgId: kayit.org_id,
      clientId: kayit.client_id,
      clientName: kayit.client_name,
      postId: kayit.post_id,
      adAccountId: kayit.linked_ad_account_id,
      postMessage: kayit.title,
      // MEDYA TİPİ KARTTAN. Ada yalnızca gönderi METİNSİZSE giriyor
      // (`boostAssetName` yedeği) ama o durumda "Fotoğraf" yazan bir video
      // reklamı üretiyordu.
      mediaType: (kayit.media_type as MediaType | null) ?? ('photo' as MediaType),
      budgetMode: kayit.budget_mode,
      dailyBudgetMicros: kayit.daily_budget_micros,
      totalBudgetMicros: kayit.total_budget_micros,
      durationDays: kayit.duration_days,
      meta,
      kaynak: 'Bildirim havuzundan onaylandı',
      userId: ctx.userId,
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
    /*
     * `createOneApproved` — TOPLU OLAN DEĞİL. `createApproved(client, 1)`
     * müşterinin onaylı boost'larını EN ESKİDEN alıyor: kural motorundan
     * kalmış daha eski bir onaylı satır varsa o yayınlanır, bizimki
     * `approved` kalır ve dönüş yine `created: 1` olur. O hâlde kart
     * `launched` yazılır ama kampanya kimlikleri NULL gelir — kullanıcı
     * "yayınlandı" görür, ortada bizim gönderimizin reklamı yoktur ve
     * bizim boost'u sonra zamanlanmış tarama kartla ilgisiz yayınlar.
     */
    const sonuc = await this.executor.createOneApproved(
      (fn) => this.prisma.withTenant(scoped, fn),
      boostId,
    );

    if (sonuc.ok) {
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
     * BAŞARISIZ: HATA METNİ `createOneApproved`'DAN GELİYOR. O da `boosts`
     * satırından okuyor — kendi cümlemizi yazmak, Meta'nın söylediğini
     * kaybetmek olurdu ve bu projede en pahalı hata tipi tam olarak o.
     */
    await this.geriAl(scoped, kayit.id, sonuc.error);
    return { status: 'failed', message: sonuc.error };
  }

  /**
   * KARTI VE ÖN AYARINI OKUR — kararın ve metin önizlemesinin TEK sorgusu.
   *
   * Metin ucu kartı ayrı bir sorguyla okusaydı, ikisi bir gün farklı ön
   * ayarı seçerdi (kanal ön ayarı mı workspace ön ayarı mı) ve kullanıcı
   * düzenlerken gördüğü marka adıyla yayınlanan marka adı ayrışırdı.
   */
  /**
   * SADECE BU KART İÇİN bütçe/süre — yayın ve prova AYNI çözümden geçiyor.
   * Ayrı yazılsaydı prova, kullanıcının girdiği tutarı değil ön ayarı sınardı.
   */
  private ozellestir(kayit: KuyrukSatiri, override?: AutoBoostQueueOverride): KuyrukSatiri {
    const butce = butceyiCoz(
      {
        budgetMode: butceKipi(kayit.budget_mode),
        dailyBudgetMicros: kayit.daily_budget_micros,
        totalBudgetMicros: kayit.total_budget_micros,
        durationDays: kayit.duration_days,
      },
      kartPlatformu(kayit.platform),
      override,
    );
    return {
      ...kayit,
      budget_mode: butce.budgetMode,
      daily_budget_micros: butce.dailyBudgetMicros,
      total_budget_micros: butce.totalBudgetMicros,
      duration_days: butce.durationDays,
      settings: kayit.settings,
    };
  }

  private async kartiOku(scoped: TenantContext, queueItemId: string): Promise<KuyrukSatiri | null> {
    return this.prisma.withTenant(scoped, async (tx) => {
      const [row] = await tx.$queryRaw<KuyrukSatiri[]>(Prisma.sql`
        SELECT q.id::text AS id, q.org_id::text AS org_id, q.client_id::text AS client_id,
               q.platform::text AS platform, q.status, q.external_id,
               q.social_profile_id::text AS social_profile_id, q.title,
               q.media_type,
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
  }

  /**
   * YOUTUBE KARTININ METİNLERİ — yayının üreteceği hâl, hiçbir şey yazmadan.
   *
   * Kart düzenlemesi bunu gösteriyor. Üretici yayınla AYNI (`videodanMetin`):
   * kullanıcı alanlara dokunmadan yayınlarsa gördüğü metin gidiyor.
   * Marka adı logoyu ARŞİVE ALMADAN çözülüyor (`markaAdi`); önizleme bir GET.
   */
  async youtubeMetinleri(ctx: TenantContext, queueItemId: string): Promise<YoutubeKartMetinleri> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    const kayit = await this.kartiOku(scoped, queueItemId);
    if (!kayit) throw new NotFoundException('Kart bulunamadı');
    if (kayit.platform !== 'google') {
      throw new BadRequestException('Reklam metni düzenlemesi yalnızca YouTube kartlarında var.');
    }
    const ayar = autoBoostPresetSettingsSchema.safeParse(kayit.settings);
    const g = ayar.success && ayar.data.platform === 'google' ? ayar.data : null;
    const marka = await this.youtubeOtomatik.markaAdi(scoped, kayit.client_id, kayit.social_profile_id, {
      businessName: g?.businessName,
    });
    if (!marka) {
      throw new BadRequestException('Marka adı üretilemedi: workspace adını kontrol et.');
    }
    const { metin, aciklamaKaynagi } = await this.videodanMetin(kayit, marka);
    return {
      baslik: metin.headlines[0]!,
      uzunBaslik: metin.longHeadlines[0]!,
      aciklama: metin.descriptions[0]!,
      aciklamaKaynagi,
    };
  }

  /**
   * VİDEONUN METNİ — açıklama YouTube'dan TAZE okunuyor.
   *
   * Saklanan bir kopya, kullanıcı açıklamayı YouTube'da düzelttikten sonra
   * eski hâliyle reklama girerdi. OKUNAMAZSA DURMUYOR: açıklamanın yedeği var
   * ve YouTube API'sinin geçici bir hatası yüzünden reklamı engellemek,
   * açıklamasız bir reklamdan pahalı. Sebep log'a yazılıyor ve kaynağı
   * `yedek` olarak dönüyor — ekran bunu söylüyor.
   */
  private async videodanMetin(
    kayit: KuyrukSatiri,
    marka: string,
  ): Promise<{ metin: VideoMetinleri; aciklamaKaynagi: 'video' | 'yedek' }> {
    const video = await this.youtube.getVideo(kayit.external_id);
    if (video.durum !== 'bulundu') {
      this.logger.warn(
        `YouTube açıklaması okunamadı (${kayit.external_id}): ` +
          (video.durum === 'hata' ? video.message : 'video bulunamadı') +
          ' — açıklama yedeği kullanılıyor',
      );
    }
    const aciklama = video.durum === 'bulundu' ? (video.video.description ?? null) : null;
    const metin = this.youtubeOtomatik.metinler(kayit.title, aciklama, marka);
    const yedek = this.youtubeOtomatik.metinler(kayit.title, null, marka).descriptions[0];
    return { metin, aciklamaKaynagi: metin.descriptions[0] === yedek ? 'yedek' : 'video' };
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
   *   3. KAMPANYA EN SONDA YAYINA ALINIYOR ve KONUMU AÇIKÇA yazılıyor.
   *      Bir süre duraklatılmış açılıp elle yayına alınması bekleniyordu
   *      (yazma yolu canlıda denenmemişti); kullanıcı 2026-09-25'te bunu
   *      kaldırıp yayını denemeyi istedi. Konumsuz Demand Gen kampanyası
   *      BÜTÜN ÜLKELERE açıldığı için yayına almanın ön koşulu konum:
   *      ön ayarda seçilmemişse Türkiye (`VARSAYILAN_KONUM`).
   */
  private async launchGoogle(
    ctx: TenantContext,
    scoped: TenantContext,
    kayit: KuyrukSatiri,
    /** Kart düzenlemesinde yazılmış metin — varsa üretilenin yerine. */
    metinOzel?: { baslik: string; uzunBaslik: string; aciklama: string },
    /** Kampanyayı kur ama açma (plan K3, ilk canlı deneme). */
    duraklatilmis = false,
    /** Kartta yazılmış hedef adres — varsa ön ayarın/workspace'in yerine. */
    hedefAdres?: string,
  ): Promise<{ status: string; message: string }> {
    const h = await this.googleHazirla(scoped, kayit, metinOzel, { kanalaYaz: true, hedefAdres });

    /*
     * ═══ GOOGLE YAZMA KESİCİSİ — KİLİTTEN ÖNCE ═══
     *
     * Ajans "Google'a yazmayı durdur" dediyse kart `pending` kalıyor ve
     * sebep yazıyor. Kilitten sonra reddetmek kartı `failed` yapardı.
     * Durum okunamıyorsa da KAPALI (`googleYazmaAcikMi`). Prova bu
     * kontrolden GEÇMİYOR: hiçbir şey yazmıyor ve kesici kapalıyken
     * teşhis yapabilmek tam olarak istenen şey.
     */
    const kapi = await googleYazmaAcikMi((fn) => this.prisma.withTenant(scoped, fn), kayit.client_id);
    if (!kapi.acik) throw new BadRequestException(kapi.sebep);

    await this.kotaKapisi(h.reklamHesabiId);

    const uygulanan = {
      ...youtubeUygulananAyar({
        dailyBudgetMicros: h.istek.dailyBudgetMicros,
        durationDays: h.istek.durationDays,
        konumlar: h.g.locations,
        yaslar: h.g.ageRanges,
      }),
      duraklatilmis,
    };

    /*
     * UYGULANAN AYAR KİLİTLE BİRLİKTE yazılıyor (G5): kart kampanyanın
     * NEYLE kurulduğunu gösteriyor ve tekrar kilidi süreyi buradan okuyor
     * (`YOUTUBE_CANLI_BITER_SQL`). Süreç yarıda ölse de kayıt kalıyor.
     */
    const kilit = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'launching', approved_by = ${ctx.userId}::uuid,
            approved_at = now(), updated_at = now(),
            applied_preset_id = ${kayit.preset_id}::uuid,
            applied_settings = ${JSON.stringify(uygulanan)}::jsonb
        WHERE id = ${kayit.id}::uuid AND status = 'pending'
      `),
    );
    if (kilit === 0) {
      throw new BadRequestException('Bu kart az önce işlendi. Sayfayı yenile.');
    }

    /*
     * Google'ın döndürdüğü kaynaklar — catch dalı bunlara bakarak "kampanya
     * kuruldu mu" sorusunu cevaplıyor. Kurulduysa kart ASLA `failed` olmaz.
     */
    let kurulan: { campaignId: string; adGroupId: string; adId: string; logoAssetResource: string | null } | null = null;
    try {
      const { provider, fetchCtx } = await this.googleBaglami(h.hesap);
      const logo = await this.uploader.googleLogoGirdisi(scoped, {
        assetId: h.logoAssetId,
        adAccountId: h.reklamHesabiId,
        label: `${kayit.client_name} logo`,
      });
      kurulan = await provider.createVideoBoost(fetchCtx, { ...h.istek, logo }, { acilis: duraklatilmis ? 'PAUSED' : 'ENABLED' });

      /*
       * YALIN KİMLİK (G1). Kaynak adı (`customers/1/campaigns/2`) yazılırsa
       * kart yapı taramasının yazdığı kampanya satırıyla hiç eşleşmiyor ve
       * harcama kartta HİÇ görünmüyor.
       */
      await this.prisma.withTenant(scoped, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE auto_boost_queue_items
          SET status = 'launched', launched_at = now(), error = NULL,
              external_campaign_id = ${googleYalinKimlik(kurulan!.campaignId)},
              external_ad_group_id = ${googleYalinKimlik(kurulan!.adGroupId)},
              external_ad_id = ${googleYalinKimlik(kurulan!.adId)},
              updated_at = now()
          WHERE id = ${kayit.id}::uuid
        `),
      );

      // YENİ LOGO ÖNBELLEĞE: sonraki yayınlar aynı görseli tekrar yüklemesin.
      // Düşerse yayın başarılı kalıyor; bir sonraki yayın logoyu yeniden yükler.
      if (kurulan.logoAssetResource) {
        await this.uploader
          .refKaydet(scoped, {
            assetId: h.logoAssetId,
            adAccountId: h.reklamHesabiId,
            platform: 'google',
            ref: kurulan.logoAssetResource,
          })
          .catch((e: unknown) => this.logger.warn(`Logo kaynak adı önbelleğe yazılamadı: ${String(e)}`));
      }

      const yer = h.g.locations.length > 0 ? h.g.locations.map((l) => l.label).join(', ') : 'Türkiye';
      return {
        status: 'launched',
        message: duraklatilmis
          ? `YouTube kampanyası Google Ads'te DURAKLATILMIŞ kuruldu (${yer}, ${h.istek.durationDays} gün). Hesapta kontrol edip oradan başlat.`
          : `YouTube kampanyası yayında (${yer}, ${h.istek.durationDays} gün). Erken durdurmak için Google Ads'i kullan.`,
      };
    } catch (err) {
      /*
       * PLATFORMUN KENDİ MESAJI TAŞINIYOR. Kendi cümlemizi yazmak, Google'ın
       * söylediğini kaybetmek olurdu.
       */
      const mesaj = err instanceof Error ? err.message : String(err);

      /*
       * ═══ KAMPANYA KURULDUYSA KART "BAŞARISIZ" OLAMAZ (P2) ═══
       *
       * Google başarılı döndü ama kaydı yazamadık: kampanya kurulu. Kart
       * `kontrol` oluyor ve kimlikler hata metninde taşınıyor; bu yazma da
       * düşerse kart `launching`te kalıyor ve `takilanlariIsaretle` onu
       * `kontrol` yapıyor.
       */
      if (kurulan) {
        const kimlikler = `kampanya ${googleYalinKimlik(kurulan.campaignId)}, reklam ${googleYalinKimlik(kurulan.adId)}`;
        this.logger.error(`YouTube kampanyası KURULDU ama kayıt yazılamadı (kart ${kayit.id}, ${kimlikler}): ${mesaj}`);
        await this.kontrolGerekli(
          scoped,
          kayit.id,
          `Kampanya Google Ads'te kuruldu (${kimlikler}) ama kayıt yazılamadı: ${mesaj}`,
        ).catch((e: unknown) => this.logger.error(`Kart kontrol olarak da işaretlenemedi: ${String(e)}`));
        return { status: 'kontrol', message: `Kampanya kuruldu ama kayıt yazılamadı. Google Ads'te kontrol et (${kimlikler}).` };
      }

      /*
       * ═══ CEVAP BELİRSİZSE KART "KONTROL" ═══
       *
       * Atomik istekte "yarım kurulum" yok, ama "isteğin akıbeti bilinmiyor"
       * var: zaman aşımı, 5xx ya da 200 ama eksik yanıt. Google isteği
       * uygulamış olabilir; `failed` yapmak tekrar yayına açardı ve kampanya
       * kuruluysa İKİNCİSİ açılırdı. Kalıcı ret (`permanent`, kota,
       * yetki) kesin olarak hiçbir şey kurmadı: `failed`.
       */
      if (err instanceof PlatformApiError && err.kind === 'transient') {
        this.logger.error(`YouTube yayınının akıbeti belirsiz (kart ${kayit.id}): ${mesaj}`);
        await this.kontrolGerekli(
          scoped,
          kayit.id,
          `Google'dan kesin cevap alınamadı; kampanya kurulmuş olabilir. Google Ads'te kontrol et. (${mesaj})`,
        );
        return { status: 'kontrol', message: `Google'dan kesin cevap alınamadı; kampanya kurulmuş olabilir. ${mesaj}` };
      }

      this.logger.error(`YouTube yayını başarısız (kart ${kayit.id}): ${mesaj}`);
      await this.geriAl(scoped, kayit.id, mesaj);
      return { status: 'failed', message: mesaj };
    }
  }

  /**
   * ═══ YAYIN PROVASI — AYNI İSTEK, GOOGLE YALNIZCA DOĞRULUYOR ═══
   *
   * Kartın yayınlanacağı hâli (bütçe, süre, konum, yaş, metin, logo, video)
   * yayın yoluyla AYNI hazırlıktan geçiriyor ve Google'a `validateOnly` ile
   * gönderiyor. Hiçbir şey kurulmuyor, para harcanmıyor, kartın durumu
   * değişmiyor. Canlıda hiç denenmemiş alanların (tarih biçimi, teklif
   * stratejisi, konum seviyesi, metin sayıları, logo kuralları) cevabı burada.
   *
   * Hazırlık hatası (ön ayar yok, site yok…) 400 olarak yükseliyor; Google'ın
   * reddi ise SONUÇ: hangi alanın neden reddedildiği Türkçe yazılıyor.
   */
  async provaGoogle(
    ctx: TenantContext,
    queueItemId: string,
    override?: AutoBoostQueueOverride,
  ): Promise<YoutubeProvaSonucu> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    const kayit = await this.kartiOku(scoped, queueItemId);
    if (!kayit) throw new NotFoundException('Kart bulunamadı');
    if (kayit.platform !== 'google') {
      throw new BadRequestException('Prova yalnızca YouTube kartlarında var.');
    }
    const ozellestirilmis = this.ozellestir(kayit, override);
    const h = await this.googleHazirla(scoped, ozellestirilmis, override?.texts, { kanalaYaz: false, hedefAdres: override?.hedefAdres });
    await this.kotaKapisi(h.reklamHesabiId);

    const acilis = override?.duraklatilmis ? 'PAUSED' : 'ENABLED';
    const { provider, fetchCtx } = await this.googleBaglami(h.hesap);
    const logo = await this.uploader.googleLogoGirdisi(scoped, {
      assetId: h.logoAssetId,
      adAccountId: h.reklamHesabiId,
      label: `${kayit.client_name} logo`,
    });
    const ozet: YoutubeProvaSonucu['ozet'] = {
      kampanyaAdi: h.istek.name,
      gunlukButceMicros: h.istek.dailyBudgetMicros.toString(),
      sureGun: h.istek.durationDays,
      bitis: new Date(Date.now() + h.istek.durationDays * 86_400_000).toISOString().slice(0, 10),
      konumlar: h.g.locations.length > 0 ? h.g.locations.map((l) => l.label) : ['Türkiye'],
      yaslar: h.g.ageRanges,
      kanallar: ['YouTube In-Stream', 'YouTube In-Feed', 'YouTube Shorts'],
      isletmeAdi: h.istek.businessName,
      adres: h.istek.finalUrl,
      videoId: h.istek.videoId,
      baslik: h.istek.headlines[0] ?? '',
      uzunBaslik: h.istek.longHeadlines[0] ?? '',
      aciklama: h.istek.descriptions[0] ?? '',
      logo: 'resource' in logo ? 'kayitli' : 'yeni',
      acilis,
      islemSayisi: 0,
    };
    try {
      const r = await provider.videoBoostProva(fetchCtx, { ...h.istek, logo }, { acilis });
      return { ok: true, ozet: { ...ozet, islemSayisi: r.islemSayisi }, hatalar: [] };
    } catch (err) {
      if (!(err instanceof PlatformApiError)) throw err;
      const alanlar = googleAlanHatalari(err.detail?.raw);
      return {
        ok: false,
        ozet,
        hatalar:
          alanlar.length > 0
            ? alanlar.map((a) => ({
                kod: a.kod,
                mesaj: a.mesaj,
                nerede: googleAlanEtiketi(a.alan),
                alan: a.alan,
                ayrinti: a.ayrinti,
              }))
            : // ALAN AYRINTISI YOKSA genel mesaj — boş liste "ret var ama sebep yok" olurdu.
              [{ kod: err.kind, mesaj: err.message, nerede: null, alan: null, ayrinti: null }],
      };
    }
  }

  /**
   * YAYIN VE PROVANIN ORTAK HAZIRLIĞI — ikisi aynı isteği kurmak zorunda.
   * Ayrı yazılsaydı prova, yayının göndermediği bir şeyi sınardı.
   *
   * `kanalaYaz`: tek Google hesabı varsa yayın onu kanala YAZIYOR (bir
   * sonraki yayında soru olmasın). Prova yazmıyor.
   */
  private async googleHazirla(
    scoped: TenantContext,
    kayit: KuyrukSatiri,
    metinOzel: { baslik: string; uzunBaslik: string; aciklama: string } | undefined,
    secenek: { kanalaYaz: boolean; hedefAdres?: string },
  ): Promise<{
    g: GooglePresetSettings;
    reklamHesabiId: string;
    hesap: { external_id: string; connection_id: string; manager_external_id: string | null };
    logoAssetId: string;
    istek: Omit<VideoBoostIstegi, 'logo'>;
  }> {
    if (!kayit.preset_id || !kayit.preset_enabled) {
      // YAPILACAK İŞ DE YAZILI: kullanıcı ayarın nerede olduğunu aramasın.
      throw new BadRequestException(
        `Bu workspace için YouTube otomatik boost ön ayarı yok ya da kapalı. ${ON_AYAR_YERI} tanımla ya da aç.`,
      );
    }
    const ayar = autoBoostPresetSettingsSchema.safeParse(kayit.settings);
    if (!ayar.success || ayar.data.platform !== 'google') {
      throw new BadRequestException(ON_AYAR_BOZUK);
    }
    const g = ayar.data;

    if (kayit.budget_mode !== 'daily' || !kayit.daily_budget_micros) {
      /*
       * GOOGLE'DA TOPLAM BÜTÇE YOK. Toplam bütçeyi günlüğe bölmek panelde
       * yazan tutarla hesaptan çıkanı ayrıştırırdı.
       */
      throw new BadRequestException(
        'YouTube kampanyası günlük bütçe gerektiriyor; ön ayarda toplam bütçe seçili.',
      );
    }

    /*
     * HANGİ GOOGLE ADS HESABI — kart uyarısıyla AYNI karar. Hiç yoksa ya da
     * birden çoksa tahmin yok; cümle düzeltmenin yerini söylüyor.
     */
    const karar = await this.youtubeOtomatik.reklamHesabi(scoped, kayit.client_id, kayit.social_profile_id);
    const engel = youtubeHesabiEngeli(karar);
    if (engel || (karar.durum !== 'kanal' && karar.durum !== 'tek-hesap')) {
      throw new BadRequestException(engel ?? 'Google Ads hesabı çözümlenemedi.');
    }
    const reklamHesabiId = karar.hesapId;
    if (karar.durum === 'tek-hesap' && secenek.kanalaYaz) {
      await this.youtubeOtomatik.kanalaBagla(scoped, kayit.social_profile_id, reklamHesabiId);
    }

    const [hesap] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ external_id: string; connection_id: string; manager_external_id: string | null }>>(
        Prisma.sql`
          SELECT external_id, connection_id::text AS connection_id, manager_external_id
          FROM ad_accounts WHERE id = ${reklamHesabiId}::uuid
        `,
      ),
    );
    if (!hesap) throw new BadRequestException('Reklam hesabı bulunamadı.');

    /*
     * MARKA, LOGO VE ADRES OTOMATİK — KİLİTTEN ÖNCE. Eksik bir değer burada
     * Türkçe bir cümleyle reddediliyor ve kart `pending` kalıyor.
     */
    const degerler = await this.youtubeOtomatik.yayinDegerleri(scoped, kayit.client_id, kayit.social_profile_id, {
      businessName: g.businessName,
      logoAssetId: g.logoAssetId,
      // KARTIN ADRESİ ÖNCE: adres videoya ait (iki projeli workspace).
      finalUrl: secenek.hedefAdres ?? g.finalUrl,
    });

    /*
     * METİNLER: KARTTA YAZILDIYSA O, YOKSA VİDEODAN (açıklama yayın anında
     * taze okunuyor).
     */
    const metin: VideoMetinleri = metinOzel
      ? { headlines: [metinOzel.baslik], longHeadlines: [metinOzel.uzunBaslik], descriptions: [metinOzel.aciklama] }
      : (await this.videodanMetin(kayit, degerler.businessName)).metin;

    return {
      g,
      reklamHesabiId,
      hesap,
      logoAssetId: degerler.logoAssetId,
      istek: {
        name: boostNameBase({ clientName: kayit.client_name, postMessage: kayit.title, mediaLabel: 'Video', date: new Date() }),
        dailyBudgetMicros: BigInt(kayit.daily_budget_micros),
        durationDays: kayit.duration_days ?? 7,
        videoId: kayit.external_id,
        videoTitle: kayit.title ?? kayit.external_id,
        businessName: degerler.businessName,
        finalUrl: degerler.finalUrl,
        headlines: metin.headlines,
        longHeadlines: metin.longHeadlines,
        descriptions: metin.descriptions,
        konumlar: g.locations.length > 0 ? g.locations.map((l) => l.key) : [VARSAYILAN_KONUM],
        yaslar: g.ageRanges,
      },
    };
  }

  /**
   * YÖNETİCİ (MCC) KİMLİĞİ `login-customer-id` OLARAK GİDİYOR. Canlıda ilk
   * YouTube yayını bu başlık olmadan "User doesn't have permission to access
   * customer" ile düştü (7489428).
   */
  private async googleBaglami(hesap: { external_id: string; connection_id: string; manager_external_id: string | null }) {
    const provider = this.providers.get('google');
    const accessToken = await this.vault.getAccessToken(hesap.connection_id, provider);
    return {
      provider,
      fetchCtx: {
        accessToken,
        accountExternalId: hesap.external_id,
        loginCustomerId: hesap.manager_external_id ?? undefined,
      },
    };
  }

  /**
   * ═══ KOTA — İSTEK GOOGLE'A GİTMEDEN ═══
   *
   * Google kotası her gece doluyor (2026-09-29). Bekçi reddederse kart
   * kilitlenmeden, ne zaman deneneceği yazılarak dönülüyor. Redis yoksa
   * bekçi kapalı (senkronizasyon da kapalı demek); engellemiyoruz ama
   * log'a yazıyoruz.
   */
  private async kotaKapisi(reklamHesabiId: string): Promise<void> {
    if (!this.quota.isEnabled) {
      this.logger.warn('Kota bekçisi kapalı (REDIS_URL yok); YouTube isteği kota kontrolsüz gidiyor.');
      return;
    }
    const gate = await this.quota.acquire({ platform: 'google', adAccountId: reklamHesabiId, layer: 'interactive' });
    if (!gate.allowed) {
      const dakika = Math.max(1, Math.ceil((gate.retryAfterMs ?? 60_000) / 60_000));
      throw new BadRequestException(
        `Google Ads kotası şu an dolu (${gate.reason ?? 'kota'}). Yaklaşık ${dakika} dakika sonra tekrar dene.`,
      );
    }
  }

  /**
   * Kartı `failed` yapar ve sebebini yazar.
   *
   * `pending`E GERİ ALINMIYOR: geri almak, kullanıcının aynı düğmeye tekrar
   * basıp platformda İKİNCİ bir kampanya açmasına izin verirdi. Hata
   * giderildikten sonra kart elle yeniden açılmalı — bilinçli bir sürtünme.
   */
  /**
   * GÖNDERİ LİSTESİNDEN TEK TIKLA YAYIN — "Yayınla" / "Tekrar boostla".
   *
   * KULLANICI HİÇBİR ŞEY GİRMİYOR. Bütçe, süre, hedefleme, kayıtlı kitle ve
   * ad boost ön ayarından geliyor; ekranda yalnızca gönderi ve bir düğme var.
   * İstenen buydu: "ben hiçbir şey girmeyeceğim, elle bilgi bankasını
   * doldurmak dışında" — o cümledeki "bilgi bankası" ön ayar formunun ESKİ
   * yeri; form bugün Akıllı Boost sayfasındaki "Boost ön ayarı" modalında.
   *
   * KUYRUK KARTI AÇILMIYOR ve bu bilinçli. `auto_boost_queue_items` üzerinde
   * (social_profile_id, external_id) TAM tekil indeks var — kısmi değil.
   * Yani bir gönderi için ÖMÜR BOYU tek kart. Buradan kart açmak, aynı
   * gönderiyi ikinci kez yayınlamayı (kullanıcının istediği "tekrar boostla")
   * kalıcı olarak imkânsız kılardı; süpürme o gönderi için kart açmışsa da
   * çakışırdı. Kart "sistem yeni bir gönderi FARK ETTİ" demek; burada farkı
   * kullanıcı ediyor.
   *
   * TEKRAR BOOSTLAMAYI ENGELLEYEN TEK ŞEY `boosts_active_post_uniq`: aynı
   * gönderi için ikinci CANLI boost açılamıyor. Önceki bittikten sonra
   * yenisi serbest ve K20 gereği bu bir uyarı, engel değil.
   */
  async gonderiyiYayinla(
    ctx: TenantContext,
    clientId: string,
    organicPostId: string,
  ): Promise<{ status: string; message: string }> {
    // AKTİF MÜŞTERİ BU İSTEK İÇİN GÖNDERİNİN MÜŞTERİSİ. Kart yolundaki gibi
    // `null` YAPILMIYOR: orada kart başka bir müşteriye ait olabiliyordu,
    // burada müşteriyi çağıran söylüyor ve daraltmayı açık bırakmak RLS'in
    // yanlış müşterinin gönderisini yayınlamasını engelliyor.
    const scoped: TenantContext = { ...ctx, activeClientId: clientId };

    /*
     * ENGEL KONTROLÜ ORTAK FONKSİYONDAN. Elle boost formunun kullandığı
     * fonksiyonun aynısı: canlı boost var mı, sayfaya reklam hesabı bağlı mı,
     * Instagram'ın ana Facebook sayfası biliniyor mu. İkinci bir kopya
     * yazmak, bir gün ayrışacak iki kural demekti.
     */
    const post = await this.prisma.withTenant(scoped, (tx) =>
      this.boosts.gonderiyiOkuVeDogrula(tx, organicPostId, clientId),
    );

    const onAyar = await this.prisma.withTenant(scoped, async (tx) => {
      const [row] = await tx.$queryRaw<OnAyarSatiri[]>(Prisma.sql`
        SELECT ap.id::text AS preset_id, ap.enabled AS preset_enabled,
               ap.budget_mode, ap.daily_budget_micros, ap.total_budget_micros,
               ap.duration_days, ap.settings
        FROM auto_boost_presets ap
        WHERE ap.client_id = ${clientId}::uuid AND ap.platform = 'meta'
          AND (ap.social_profile_id = ${post.social_profile_id}::uuid
               OR ap.social_profile_id IS NULL)
        -- SAYFAYA ÖZEL ÖN AYAR MÜŞTERİ VARSAYILANINI EZİYOR. Sıralama
        -- bildirim havuzu yolundakiyle BİREBİR aynı olmak zorunda: iki yol
        -- aynı gönderi için farklı ön ayar seçerse, hangisinin uygulandığı
        -- düğmeye hangi ekrandan basıldığına bağlı olurdu.
        ORDER BY ap.social_profile_id NULLS LAST
        LIMIT 1
      `);
      return row ?? null;
    });

    if (!onAyar) {
      throw new BadRequestException(
        `Bu workspace için Meta ön ayarı yok. ${ON_AYAR_YERI} bütçeyi, süreyi ` +
          've hedeflemeyi bir kez tanımla — yayın o ayarlarla yapılıyor.',
      );
    }
    if (!onAyar.preset_enabled) {
      throw new BadRequestException(
        `Bu workspace’in Meta ön ayarı kapalı. ${ON_AYAR_YERI} aç.`,
      );
    }

    const ayar = autoBoostPresetSettingsSchema.safeParse(onAyar.settings);
    if (!ayar.success || ayar.data.platform !== 'meta') {
      throw new BadRequestException(ON_AYAR_BOZUK);
    }

    const boostId = await this.onAyardanBoostAc(scoped, {
      orgId: ctx.orgId,
      clientId,
      clientName: post.client_name,
      postId: post.id,
      // `gonderiyiOkuVeDogrula` reklam hesabı yoksa zaten hata fırlattı.
      adAccountId: post.linked_ad_account_id!,
      postMessage: post.message,
      mediaType: post.media_type,
      budgetMode: onAyar.budget_mode,
      dailyBudgetMicros: onAyar.daily_budget_micros,
      totalBudgetMicros: onAyar.total_budget_micros,
      durationDays: onAyar.duration_days,
      meta: ayar.data,
      kaynak: 'Gönderi listesinden yayınlandı',
      userId: ctx.userId,
    });

    if (!boostId) {
      // Kısmi tekil indeks reddetti: arada başka bir sekmede ya da süpürme
      // yoluyla boost açılmış.
      throw new BadRequestException(
        'Bu gönderi için az önce bir boost açılmış. Sayfayı yenile.',
      );
    }

    /*
     * PLATFORM ÇAĞRISI TRANSACTION'IN DIŞINDA. `withTenant` etkileşimli bir
     * transaction açıyor ve Prisma'nın sınırı 5 saniye; Meta'ya yapılan üç
     * çağrı üretimde 12,5 saniye sürdü ve transaction ölünce hata bile
     * kaydedilemedi.
     */
    const sonuc = await this.executor.createOneApproved(
      (fn) => this.prisma.withTenant(scoped, fn),
      boostId,
    );

    if (!sonuc.ok) {
      /*
       * PLATFORMUN KENDİ CÜMLESİ GÖSTERİLİYOR. Kendi metnimizi yazmak, bu
       * projede tek teşhis kaynağı olan mesajı kaybetmek olurdu.
       */
      throw new BadRequestException(sonuc.error);
    }

    return { status: 'launched', message: 'Gönderi yayına alındı.' };
  }

  /**
   * ÖN AYARDAN `boosts` SATIRI AÇAR — ön ayarla yayınlayan İKİ YOL DA buradan.
   *
   * Bildirim havuzu kartı ile gönderi listesindeki "Yayınla" düğmesi aynı
   * kaydı üretmek zorunda. İki ayrı INSERT yazmak, ön ayarın bir alanının
   * (hedefleme, kayıtlı kitle, bütçe kipi) bir yolda uygulanıp diğerinde
   * uygulanmaması demekti — ve fark eden olmazdı, çünkü ikisi de "çalışıyor".
   *
   * `null` DÖNÜYORSA satır AÇILAMADI: kısmi tekil indeks (`boosts_active_post_uniq`)
   * aynı gönderi için ikinci canlı boost'u reddetti. Çağıran bunu kendi
   * bağlamına göre anlatıyor.
   */
  private async onAyardanBoostAc(
    scoped: TenantContext,
    g: OnAyarBoostGirdisi,
  ): Promise<string | null> {
    /*
     * BÜTÇE ALANLARI BURADA DOĞRULANIYOR. Ön ayar satırı bunları zorunlu
     * kılıyor ama sorgudan `null` gelebiliyor (LEFT JOIN eşleşmezse) ve
     * `null` bütçeyle açılan bir boost `boosts_budget_chk`'e takılıp ham bir
     * kısıt hatası üretirdi — kullanıcıya hiçbir şey anlatmayan cinsten.
     */
    if (!g.budgetMode || !g.durationDays) {
      throw new BadRequestException(
        `Ön ayarın bütçesi eksik. ${ON_AYAR_YERI} bütçe ve süreyi kaydet.`,
      );
    }

    /*
     * ÖZEL KİTLE BAŞKA HESABINSA YAYIN DURUYOR. Kitle kimliği reklam
     * hesabına bağlı; sayfaya özel olmayan bir ön ayar birden çok sayfaya
     * hizmet ediyor ve her sayfanın bağlı hesabı farklı olabiliyor. Kitleyi
     * yine göndermek Meta'nın reddi, düşürüp yayınlamak ise kullanıcının
     * "mevcut müşterileri hariç tut" dediği kitleye sessizce harcamak olurdu.
     * Kontrol boost satırı AÇILMADAN: açılmış bir satır kartı "yayında"
     * gösterip bekletirdi.
     */
    const yabanci = yabanciOzelKitle(g.meta, g.adAccountId);
    if (yabanci) {
      throw new BadRequestException(
        `Ön ayardaki “${yabanci.name}” kitlesi ${yabanci.hesapAdi} hesabının; bu sayfanın ` +
          `reklam hesabı farklı. ${ON_AYAR_YERI} kitleyi kaldır.`,
      );
    }

    const adTabani = boostNameBase({
      clientName: g.clientName,
      postMessage: g.postMessage,
      mediaLabel: MEDIA_TYPE_LABELS[g.mediaType],
      date: new Date(),
    });

    return this.prisma.withTenant(scoped, async (tx) => {
      const [b] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO boosts (
          id, org_id, client_id, boost_rule_id, organic_post_id, ad_account_id,
          status, budget_mode, total_budget_micros, daily_budget_micros,
          duration_days, objective, targeting, saved_audience_id,
          reason, approved_by, approved_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${g.orgId}::uuid, ${g.clientId}::uuid,
          -- KURAL YOK: bu boost'u kural değil kullanıcı onayladı.
          NULL, ${g.postId}::uuid, ${g.adAccountId}::uuid,
          'approved', ${g.budgetMode}, ${g.totalBudgetMicros},
          ${g.dailyBudgetMicros}, ${g.durationDays},
          'OUTCOME_ENGAGEMENT',
          -- KAYITLI KİTLE VARSA HEDEFLEME NESNESİ YAZILMIYOR: kitle Meta'da
          -- kendi lokasyonunu ve demografisini taşıyor, ikisini birleştirmek
          -- "kesişim mi birleşim mi" sorusunu bizim cevaplamamız demek.
          ${g.meta.savedAudienceId ? null : JSON.stringify(metaTargetingFrom(g.meta))}::jsonb,
          ${g.meta.savedAudienceId},
          ${`${g.kaynak} — ${adTabani}`.slice(0, 500)},
          ${g.userId}::uuid, now(), now()
        )
        -- CANLI BOOST VARSA ÇAKIŞIR. Çağırandaki kontrol arada geçen sürede
        -- eskimiş olabilir; son söz veritabanının.
        ON CONFLICT DO NOTHING
        RETURNING id::text AS id
      `);
      return b?.id ?? null;
    });
  }

  /**
   * ═══ TEKRAR BOOSTLA ═══
   *
   * Kartı KARARA GERİ AÇIYOR — para harcamıyor. Harcama kararı yine
   * "Onayla"da ve o ayrı bir yetki (`boost.approve`); bu uç yalnızca kartı
   * yeniden onaylanabilir hâle getiriyor, tıpkı geçmiş içerik çekiminin kart
   * üretmesi gibi.
   *
   * ═══ NEDEN YENİ BİR KART AÇILMIYOR ═══
   *
   * `auto_boost_queue_items` tekil anahtarı `(social_profile_id, external_id)`
   * ve bu anahtar bilerek dar: webhook teslimi mükerrer olabiliyor ve ikinci
   * bir kart aynı gönderi için İKİ REKLAM demek. Yani tekrar boost, var olan
   * kaydın durumunu geri almak zorunda.
   *
   * KİMLİKLER SİLİNMİYOR. `external_campaign_id`, `boost_id` ve `launched_at`
   * yerinde kalıyor: kart yeniden onaylanmazsa önceki yayının izi kartta
   * durmaya devam ediyor, onaylanırsa yayın yolu zaten üzerine yazıyor.
   * Silmek, "daha önce boostlanmıştı" bilgisini bu ekrandan sessizce
   * kaldırırdı.
   */
  async tekrarBoostla(
    ctx: TenantContext,
    queueItemId: string,
    /** `kontrol` durumundaki kartta ZORUNLU: kullanıcı platformda baktı. */
    kontrolEdildi = false,
  ): Promise<{ status: string; message: string }> {
    // Karar yolundaki gerekçenin aynısı: daraltma açıkken UPDATE sonrası satır
    // kendi görüş alanının dışına düşebiliyor.
    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const [kayit] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<Array<{ status: string; aktif_biter: Date | null }>>(Prisma.sql`
        SELECT q.status, COALESCE(aktif.biter, ${YOUTUBE_CANLI_BITER_SQL}) AS aktif_biter
        FROM auto_boost_queue_items q
        -- AKTİF BOOST ENGELİ: boosts_active_post_uniq aynı gönderi için
        -- ikinci bir aktif boost'a izin vermiyor. Kartı karara açıp onayda
        -- veritabanı hatası vermek, sebebi yazmayan bir ret olurdu.
        LEFT JOIN LATERAL (
          SELECT b.created_on_platform_at + make_interval(days => b.duration_days) AS biter
          FROM boosts b
          JOIN organic_posts op ON op.id = b.organic_post_id
          WHERE op.social_profile_id = q.social_profile_id
            AND op.external_id = q.external_id
            AND b.status IN (${CANLI_BOOST_SQL})
          LIMIT 1
        ) aktif ON true
        WHERE q.id = ${queueItemId}::uuid
      `),
    );

    if (!kayit) throw new NotFoundException('Kart bulunamadı');

    if (!TEKRAR_ACIK_DURUMLAR.has(kayit.status)) {
      throw new BadRequestException(
        kayit.status === 'pending'
          ? 'Bu kart zaten onay bekliyor.'
          : 'Bu kart şu anda işleniyor; tekrar boostlamak için sonucunu bekle.',
      );
    }

    if (kayit.aktif_biter) {
      throw new BadRequestException(
        'Önceki boost hâlâ yayında. Aynı gönderi için ikinci bir kampanya ' +
          'açılamıyor; süresi bittiğinde tekrar boostlayabilirsin.',
      );
    }

    /*
     * KONTROL GEREKLİ KART YALNIZCA ONAYLA AÇILIYOR. Platformda bu içerik
     * için kampanya olup olmadığını bilen tek taraf hesaba bakan insan;
     * onaysız açmak, bu durumun var oluş sebebini (ikinci kampanya) geri
     * getirirdi.
     */
    if (kayit.status === 'kontrol' && !kontrolEdildi) {
      throw new BadRequestException(
        'Bu kartın kampanyası platformda kurulmuş olabilir. Önce Google Ads / Meta ' +
          'hesabında bu içerik için yayında bir kampanya olmadığını kontrol et, sonra onaylayarak tekrar yayınla.',
      );
    }

    /*
     * DURUM KOŞULU UPDATE'İN İÇİNDE DE VAR. Yukarıdaki okumayla bu yazma
     * arasında başka bir oturum kartı onaylamış olabilir; koşulsuz bir UPDATE
     * yayına alınmakta olan kartı geri açardı.
     */
    const satir = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'pending', error = NULL, updated_at = now()
        WHERE id = ${queueItemId}::uuid
          AND status IN ('launched', 'rejected', 'failed', 'kontrol')
      `),
    );

    if (satir === 0) {
      throw new BadRequestException('Kartın durumu değişti. Sayfayı yenile.');
    }

    return { status: 'pending', message: 'Kart tekrar onay bekliyor.' };
  }

  /**
   * ═══ KARTI KAPAT — "BİR DAHA YAYINLAMA" ═══
   *
   * Yayınlanmış ya da düşmüş bir kartta kullanıcının verebileceği ikinci bir
   * karar var: bu gönderiyi bir daha boostlamayacağım. Kart `rejected`
   * oluyor, "Kapanan" süzgecine düşüyor ve tekrar yayınlama düğmesi
   * göstermiyor.
   *
   * KAMPANYAYA DOKUNMUYOR. Yayındaki bir reklamı durdurmak İPTAL'in işi ve o
   * ayrı bir uç; burada değiştirilen tek şey kartın kendi durumu. İkisini
   * birleştirmek, "listeden kaldır" diyen kullanıcının farkında olmadan
   * yayındaki reklamı durdurması olurdu.
   */
  async kapat(ctx: TenantContext, queueItemId: string): Promise<{ status: string; message: string }> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };

    const n = await this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'rejected', approved_by = ${ctx.userId}::uuid,
            approved_at = now(), updated_at = now()
        WHERE id = ${queueItemId}::uuid
          AND status IN ('pending', 'launched', 'failed', 'kontrol')
      `),
    );

    if (n === 0) {
      /*
       * SIFIR SATIR İKİ ANLAMA GELİYOR ve ikisi de kullanıcıya aynı işi
       * yaptırıyor: kart yok ya da durumu bu arada değişti. Ayırmak için
       * ikinci bir sorgu atmak, kazancı olmayan bir çağrı olurdu.
       */
      throw new BadRequestException('Kart bulunamadı ya da durumu değişti. Sayfayı yenile.');
    }

    return { status: 'rejected', message: 'Kart kapatıldı.' };
  }

  /**
   * ═══ TAKILAN KARTLAR — `launching`TE KALANLAR `kontrol` OLUYOR (P6) ═══
   *
   * Süreç yayının ortasında ölürse (deploy, bellek, zaman aşımı) kart
   * `launching`te kalıyordu ve hiçbir yol onu oradan çıkarmıyordu: ne
   * tekrar yayınlanabiliyor ne kapatılabiliyordu. `pending` ya da `failed`
   * yapmak YANLIŞ olurdu: platformda kampanya kurulmuş olabilir.
   *
   * ZAMANLANMIŞ İŞ DEĞİL, LİSTE OKUNURKEN çalışıyor ve bu bilinçli: kart
   * yalnızca bu ekranda görülüyor, yani ekran açıldığında doğru durumu
   * göstermesi yeterli. Ayrı bir kuyruk işi, kuyruk/zamanlayıcı listesine
   * (`sweep-dates.spec.ts`) yeni bir tür ve bir hata yüzeyi daha demekti.
   * Koşul idempotent; aynı anda iki istek çalışsa da sonuç aynı.
   */
  async takilanlariIsaretle(ctx: TenantContext, clientId: string): Promise<number> {
    const scoped: TenantContext = { ...ctx, activeClientId: null };
    /*
     * `::int` ŞART. Prisma JS sayısını bağlı parametre olarak `bigint`
     * gönderiyor ve Postgres'te `make_interval(mins => bigint)` YOK: üretimde
     * "42883 function does not exist" ile Akıllı Boost listesinin TAMAMI
     * açılmadı (2026-10-09). PGlite parametre tipini kendisi çıkardığı için
     * testler yeşildi. `fonksiyon-parametre-tipi.spec.ts` bunu tarıyor.
     */
    const sebep =
      `Yayın ${AUTOBOOST_TAKILMA_ESIGI_DAKIKA} dakikadan uzun süre tamamlanmadı; ` +
      'kampanya platformda kurulmuş olabilir. Hesapta kontrol et.';
    return this.prisma.withTenant(scoped, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'kontrol',
            error = ${sebep},
            updated_at = now()
        WHERE client_id = ${clientId}::uuid
          AND status = 'launching'
          AND updated_at < now() - make_interval(mins => ${AUTOBOOST_TAKILMA_ESIGI_DAKIKA}::int)
      `),
    );
  }

  private async kontrolGerekli(ctx: TenantContext, id: string, mesaj: string): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE auto_boost_queue_items
        SET status = 'kontrol', error = ${mesaj.slice(0, 1000)}, updated_at = now()
        WHERE id = ${id}::uuid
      `),
    );
  }

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
 * TEKRAR BOOSTLAMAYA AÇIK DURUMLAR.
 *
 * Okuma katmanındaki listeyle aynı olmak zorunda: ayrışırlarsa panel açık bir
 * düğme gösterip sunucu reddeder ve kullanıcı sebebi kendi kurulumunda arar.
 * `autoboost-tekrar-boost.spec.ts` iki listeyi karşılaştırıyor.
 */
const TEKRAR_ACIK_DURUMLAR = new Set<string>(AUTOBOOST_TEKRAR_ACIK_DURUMLAR);

/** Gönderi yolunda okunan ön ayar satırı. */
interface OnAyarSatiri {
  preset_id: string;
  preset_enabled: boolean;
  budget_mode: string | null;
  daily_budget_micros: bigint | null;
  total_budget_micros: bigint | null;
  duration_days: number | null;
  settings: unknown;
}

/** `onAyardanBoostAc` girdisi — iki yayın yolunun ortak sözleşmesi. */
interface OnAyarBoostGirdisi {
  orgId: string;
  clientId: string;
  clientName: string;
  postId: string;
  adAccountId: string;
  /** Ada giren metin: kartta `title`, gönderi listesinde `message`. */
  postMessage: string | null;
  /** Yalnızca METİNSİZ gönderide ada düşüyor (`boostAssetName` yedeği). */
  mediaType: MediaType;
  budgetMode: string | null;
  dailyBudgetMicros: bigint | null;
  totalBudgetMicros: bigint | null;
  durationDays: number | null;
  meta: MetaPresetSettings;
  /** Sebep alanının ilk parçası — boost'un hangi ekrandan doğduğu. */
  kaynak: string;
  userId: string;
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
  media_type: string | null;
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
