import { Injectable } from '@nestjs/common';
import type { AutoBoostPlatform } from '@advetics/shared';
import { Prisma } from '@prisma/client';
import { YOUTUBE_HESAP_KOSULU, youtubeHesabiEngeli, youtubeHesabiSec } from './youtube-hesabi';
import { CANLI_BOOST_SQL } from '../boosts/canli-boost';
import {
  abonelikSagligi,
} from './youtube-websub';
import {
  autoBoostPresetSettingsSchema,
  type AutoBoostQueueItemRecord,
  type AutoBoostQueuePerformance,
  type AutoBoostQueueList,
  type AutoBoostSubscriptionHealth,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { seviyeLiterali } from '../metrics/seviye-literali';

/**
 * Performans toplamı KAMPANYA seviyesinden okunuyor.
 *
 * Boost tek bir kampanya açıyor; reklam seviyesinden toplamak aynı sayıyı
 * daha pahalı üretirdi ve `insights_daily` üzerindeki kısmi indeks kampanya
 * seviyesi için kurulu. Literal üreticisinden geçmek ZORUNLU: bağlı parametre
 * kısmi indeksi kullanılamaz hâle getiriyor (`seviye-literali.ts`).
 */
const KAMPANYA_SEVIYESI = seviyeLiterali('campaign');

/**
 * BİLDİRİM HAVUZUNUN OKUMA YOLU.
 *
 * Kart, kullanıcının tek tıkla PARA HARCAYACAĞI düğme. Bu yüzden her satır
 * kendisiyle birlikte iki şey taşıyor: hangi ön ayarla yayınlanacağı ve
 * yayınlanamayacaksa NEDEN.
 *
 * "Onaylanamıyor" demek yetmiyor — bu ekranda daha önce tam olarak o hataya
 * düşüldü ve kullanıcı sebebi kendi kurulumunda aradı.
 */
@Injectable()
export class AutoBoostReadService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * YouTube aboneliklerinin sağlığı — ölü adam düğmesi.
   *
   * Kiralamanın sessizce dolması, hub'ın aboneliği reddetmesi ve yenileme
   * işinin kaybolması; üçü de panelde "hiç kart gelmiyor" olarak görünüyor ve
   * üçünün yapılacak işi farklı. Bu uç o ayrımı yapıyor.
   */
  async subscriptionHealth(
    ctx: TenantContext,
    clientId: string,
  ): Promise<AutoBoostSubscriptionHealth[]> {
    const scoped = { ...ctx, activeClientId: clientId };
    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<
        Array<{
          social_profile_id: string;
          channel_name: string;
          verified_at: Date | null;
          lease_seconds: number | null;
          last_notification_at: Date | null;
          denied_reason: string | null;
          signature_seen_at: Date | null;
        }>
      >(Prisma.sql`
        SELECT s.social_profile_id::text AS social_profile_id, sp.name AS channel_name,
               s.verified_at, s.lease_seconds, s.last_notification_at,
               s.denied_reason, s.signature_seen_at
        FROM auto_boost_subscriptions s
        JOIN social_profiles sp ON sp.id = s.social_profile_id
        WHERE s.client_id = ${clientId}::uuid
        ORDER BY sp.name
      `),
    );

    const now = new Date();
    return rows.map((r) => {
      /*
       * REDDEDİLME EN ÖNCELİKLİ. Kiralama hesabı da sorunlu diyecektir ama
       * söylenmesi gereken şey hub'ın sebebi — "yeniden izlemeye al" mesajı
       * reddedilmiş bir abonelikte işe yaramaz.
       */
      const saglik = r.denied_reason
        ? {
            ok: false,
            message:
              `YouTube bildirim aboneliği reddedildi: ${r.denied_reason}. ` +
              'Kanalı yeniden eklemeyi dene.',
          }
        : abonelikSagligi({
            now,
            verifiedAt: r.verified_at,
            leaseSeconds: r.lease_seconds,
          });

      return {
        socialProfileId: r.social_profile_id,
        channelName: r.channel_name,
        ok: saglik.ok,
        message: saglik.message,
        verifiedAt: r.verified_at?.toISOString() ?? null,
        lastNotificationAt: r.last_notification_at?.toISOString() ?? null,
        deniedReason: r.denied_reason,
        signatureLocked: r.signature_seen_at !== null,
      };
    });
  }

  async listQueue(ctx: TenantContext, clientId: string): Promise<AutoBoostQueueList> {
    const scoped = { ...ctx, activeClientId: clientId };

    const rows = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<QueueRow[]>(Prisma.sql`
        SELECT * FROM (
        SELECT q.id::text AS id, q.client_id::text AS client_id, cl.name AS client_name,
               q.platform::text AS platform, q.external_id, q.title, q.thumbnail_url,
               q.permalink, q.media_type, q.published_at, q.status,
               q.error, q.external_campaign_id, q.created_at, q.launched_at,
               q.signature_state,
               kmp.id::text AS kampanya_id,
               perf.gun, perf.spend_micros, perf.impressions, perf.clicks, perf.conversions,
               aktif.biter AS aktif_boost_biter,
               kendi.status AS boost_durumu,
               sp.name AS profile_name,
               sp.linked_ad_account_id::text AS linked_ad_account_id,
               la.platform::text AS linked_platform,
               la.client_id::text AS linked_client_id,
               gh.idler AS google_hesaplari,
               p.id::text AS preset_id, p.enabled AS preset_enabled,
               p.budget_mode, p.daily_budget_micros, p.total_budget_micros,
               p.duration_days, p.settings,
               COUNT(*) OVER () AS total
        FROM auto_boost_queue_items q
        JOIN clients cl ON cl.id = q.client_id
        -- DIŞ BİRLEŞİM, İÇ BİRLEŞİM DEĞİL: social_profiles RLS'li ve
        -- politikası havuzdaki satırı (client_id IS NULL) yalnızca org yöneticisine
        -- açıyor. Kanal workspace'ten çıkarıldığı an, o workspace'in
        -- kullanıcısı KENDİ kartlarının TAMAMINI kaybederdi — kartlar
        -- duruyor, sadece süsleme alanı görünmüyor.
        LEFT JOIN social_profiles sp ON sp.id = q.social_profile_id
        -- KANALA BAĞLI HESABIN PLATFORMU VE SAHİBİ: YouTube kartında bağlı
        -- hesap Meta ya da başka workspace'inse yok sayılıyor. Karar
        -- youtubeHesabiSec içinde; burada yalnızca girdileri okunuyor.
        LEFT JOIN ad_accounts la ON la.id = sp.linked_ad_account_id
        -- WORKSPACE'İN GOOGLE ADS HESAPLARI — tek hesap varsa kendiliğinden
        -- kullanılıyor. Koşul çözümleyiciyle AYNI sabitten.
        LEFT JOIN LATERAL (
          SELECT array_agg(aa.id::text ORDER BY aa.id) AS idler
          FROM ad_accounts aa
          WHERE aa.client_id = q.client_id AND ${Prisma.raw(YOUTUBE_HESAP_KOSULU)}
        ) gh ON true
        -- ÖN AYAR AYNI ÇÖZÜMLEME SIRASIYLA: profil bazlı varsayılanı eziyor.
        -- Sıra kuyruk beslemesindekiyle AYNI olmak zorunda; ayrışırsa kartta
        -- gösterilen ayar ile yayınlanan ayar farklı olur.
        LEFT JOIN LATERAL (
          SELECT * FROM auto_boost_presets ap
          WHERE ap.client_id = q.client_id AND ap.platform = q.platform
            AND (ap.social_profile_id = q.social_profile_id OR ap.social_profile_id IS NULL)
          ORDER BY ap.social_profile_id NULLS LAST
          LIMIT 1
        ) p ON true
        -- ═══ YAYINDAKİ BOOSTUN SONUCU ═══
        --
        -- Kampanya satırı yapı taramasından geliyor ve boost açıldıktan
        -- SONRA oluşuyor; yani yeni yayınlanan bir kartta satır HENÜZ YOK.
        -- Bu yüzden iki aşama ayrı: kampanya bulunamadıysa "veri gelmedi",
        -- bulunup metriği yoksa "gösterim yok". İkisini aynı boş alana
        -- çevirmek, kullanıcıyı çalışan bir kampanyayı aramaya gönderirdi.
        --
        -- DIŞ BİRLEŞİM ZORUNLU: campaigns ve insights_daily RLS'li ve iç
        -- birleşim kartın KENDİSİNİ süzerdi.
        LEFT JOIN LATERAL (
          SELECT c.id FROM campaigns c
          WHERE c.client_id = q.client_id AND c.external_id = q.external_campaign_id
          LIMIT 1
        ) kmp ON q.external_campaign_id IS NOT NULL
        LEFT JOIN LATERAL (
          -- GÜN SAYISI DA OKUNUYOR ve bu satır kritik: toplamlar COALESCE ile
          -- sıfıra düşüyor, yani "hiç satır yok" ile "satırlar sıfır" AYNI
          -- görünüyordu. İkisi farklı iş: birincisinde metrik senkronizasyonu
          -- henüz koşmadı, ikincisinde kampanya gerçekten gösterim almadı.
          SELECT COUNT(*)::int AS gun,
                 COALESCE(SUM(i.spend_micros), 0)::text AS spend_micros,
                 COALESCE(SUM(i.impressions), 0)::int AS impressions,
                 COALESCE(SUM(i.clicks), 0)::int AS clicks,
                 COALESCE(SUM(i.conversions), 0)::float8 AS conversions
          FROM insights_daily i
          WHERE i.entity_level = ${KAMPANYA_SEVIYESI} AND i.entity_id = kmp.id
        ) perf ON kmp.id IS NOT NULL
        -- ═══ TEKRAR BOOSTLAMANIN ÖNÜNDEKİ ENGEL ═══
        --
        -- boosts_active_post_uniq kısmi tekil indeksi aynı gönderi için
        -- ikinci bir aktif boost'a izin vermiyor. Engeli onay anında
        -- öğrenmek, kullanıcıya sebebi yazmayan bir veritabanı hatası
        -- göstermek olurdu; kart düğmeyi baştan kapatıp tarihi yazıyor.
        LEFT JOIN LATERAL (
          SELECT b.created_on_platform_at + make_interval(days => b.duration_days) AS biter
          FROM boosts b
          JOIN organic_posts op ON op.id = b.organic_post_id
          WHERE op.social_profile_id = q.social_profile_id
            AND op.external_id = q.external_id
            AND b.status IN (${CANLI_BOOST_SQL})
          LIMIT 1
        ) aktif ON true
        -- KARTIN KENDİ BOOST'U — ustteki aktif birlesimiyle AYNI SEY DEGIL.
        -- O, gonderi icin canli HERHANGI bir boost ariyor (tekrar boostlama
        -- engeli); bu ise bu kartin yayina aldigi kaydin durumu ve kartin
        -- hangi dugmeleri gosterecegini o belirliyor.
        -- (SQL yorumunda ters tirnak YASAK — sablonu ortasindan kapatiyor.)
        LEFT JOIN boosts kendi ON kendi.id = q.boost_id
        WHERE q.client_id = ${clientId}::uuid
        ORDER BY
          -- ═══ SEÇİM SIRASI GÖSTERİM SIRASIYLA AYNI DEĞİL ═══
          --
          -- Kullanıcı kartların GÖNDERİ TARİHİNE göre sıralanmasını istedi ve
          -- yayınlananlar listede kalıyor. Yalnızca tarihe göre sıralayıp 50
          -- satır almak, yüzlerce yayınlanmış gönderisi olan bir workspace'te
          -- ONAY BEKLEYEN kartları limitin altında bırakırdı: kullanıcının
          -- yapacak işi olan kart ekrandan sessizce düşerdi.
          --
          -- Bu yüzden LİMİTİ bekleyenler kazanıyor, SIRAYI tarih: dıştaki
          -- sorgu aynı satırları gönderi tarihine göre yeniden diziyor.
          CASE WHEN q.status = 'pending' THEN 0 ELSE 1 END,
          q.published_at DESC NULLS LAST,
          q.created_at DESC
        LIMIT 50
      ) t
      ORDER BY
        -- GÖSTERİM SIRASI: GÖNDERİNİN yayın tarihi — reklamın değil.
        -- Tarihi olmayan kart (nadiren YouTube bildiriminde eksik gelir) en
        -- sona düşüyor; kuyruğa giriş anına göre sıralamak onu araya
        -- serpiştirip sıralamayı okunmaz yapardı.
        published_at DESC NULLS LAST,
        created_at DESC
      `),
    );

    const items = rows.map((r) => this.toRecord(r));

    return {
      items,
      total: Number(rows[0]?.total ?? 0),
      emptyReason: items.length === 0 ? await this.bosSebep(scoped, clientId) : null,
    };
  }

  /**
   * ═══ BOŞ LİSTE NEDEN BOŞ ═══
   *
   * Tek bir cümle yazıyordu: "yeni bir gönderi yayınlandığında kart burada
   * belirir". O cümle DÖRT ayrı hâli aynı kefeye koyuyor ve üçünde YANLIŞ:
   *
   *   · workspace'e hiç sosyal profil atanmamış → kart hiç gelmeyecek
   *   · profil var ama ön ayar yok → kart üretilmiyor
   *   · ön ayar var ama hiç gönderi çekilmemiş → süpürme koşmamış
   *   · her şey yerinde, gerçekten yeni gönderi yok → doğru cümle
   *
   * Kullanıcının bildirdiği belirti tam da buydu: "bazı şirketlerin
   * workspace'lerinde autoboost gelmiyor". Ekran sebebi söylemediği için
   * teşhis kodda aranıyordu. Bu projenin kendi kuralı: boş liste NEDENİNİ
   * söylemek zorunda.
   */
  private async bosSebep(scoped: TenantContext, clientId: string): Promise<string> {
    const [durum] = await this.prisma.withTenant(scoped, (tx) =>
      tx.$queryRaw<
        Array<{ sayfa: number; kanal: number; on_ayar: number; gonderi: number }>
      >(Prisma.sql`
        SELECT
          -- SAYFA VE KANAL AYRI SAYILIYOR: YouTube kanalında izleme anahtarı
          -- BİLEREK KAPALI (içerik süpürmeyle değil bildirimle geliyor), yani
          -- tek koşullu bir sayım yalnızca kanalı olan bir workspace'e
          -- "hiç hesap atanmamış" derdi.
          (SELECT count(*)::int FROM social_profiles
            WHERE client_id = ${clientId}::uuid AND sync_enabled) AS sayfa,
          (SELECT count(*)::int FROM social_profiles
            WHERE client_id = ${clientId}::uuid
              AND profile_type = 'youtube_channel') AS kanal,
          (SELECT count(*)::int FROM auto_boost_presets
            WHERE client_id = ${clientId}::uuid AND enabled) AS on_ayar,
          (SELECT count(*)::int FROM organic_posts
            WHERE client_id = ${clientId}::uuid) AS gonderi
      `),
    );

    if (!durum || durum.sayfa + durum.kanal === 0) {
      return (
        'Bu workspace’e izlenen bir Instagram sayfası ya da YouTube kanalı ' +
        'atanmamış. Platform Bağlantıları ekranından hesabı bu workspace’e ata.'
      );
    }
    if (durum.on_ayar === 0) {
      return (
        'Otomatik boost ön ayarı yok. Ön ayar olmadan kart üretilmiyor: ' +
        'bütçe ve süre bilinmeden onaylanabilir bir kart oluşmaz.'
      );
    }
    /*
     * GÖNDERİ SAYISI YALNIZCA INSTAGRAM İÇİN BİR CEVAP.
     *
     * `organic_posts` tablosuna YouTube hiç yazmıyor: video kartı bildirimden
     * doğrudan kuyruğa giriyor. Koşulu kanala da uygulamak, kanalı olan her
     * workspace'e sonsuza kadar "hiç gönderi çekilmemiş" dedirtirdi.
     */
    if (durum.sayfa > 0 && durum.gonderi === 0) {
      return (
        'Sayfadan henüz hiç gönderi çekilmemiş. Gönderiler 15 dakikada bir ' +
        'taranıyor; yeni bağlanan bir sayfada ilk tarama biraz sürebilir.'
      );
    }
    return (
      'Onay bekleyen içerik yok. Yeni bir Instagram gönderisi ya da YouTube ' +
      'videosu yayınlandığında kart burada belirir.'
    );
  }

  private toRecord(r: QueueRow): AutoBoostQueueItemRecord {
    /*
     * AYARLAR ZOD İLE OKUNUYOR, ham JSON olarak DEĞİL.
     *
     * Kolonda JSONB duruyor ve `$queryRaw` denetimsiz bir dönüşüm — tip yalan
     * söyleyebilir. Doğrulamadan geçirmek, bozuk bir kaydın panelde
     * "hazır" görünüp yayında patlamasını engelliyor.
     */
    const parsed = r.settings ? autoBoostPresetSettingsSchema.safeParse(r.settings) : null;

    const preset =
      r.preset_id && parsed?.success
        ? {
            id: r.preset_id,
            clientId: r.client_id,
            platform: r.platform as AutoBoostPlatform,
            socialProfileId: null,
            socialProfileName: r.profile_name,
            enabled: r.preset_enabled ?? false,
            budgetMode: (r.budget_mode ?? 'daily') as 'daily' | 'lifetime',
            budgetMicros: String(r.total_budget_micros ?? r.daily_budget_micros ?? 0),
            durationDays: r.duration_days ?? 0,
            settings: parsed.data,
            updatedAt: r.created_at.toISOString(),
          }
        : null;

    return {
      id: r.id,
      clientId: r.client_id,
      clientName: r.client_name,
      platform: r.platform as AutoBoostPlatform,
      externalId: r.external_id,
      title: r.title,
      thumbnailUrl: r.thumbnail_url,
      permalink: r.permalink,
      mediaType: r.media_type,
      publishedAt: r.published_at?.toISOString() ?? null,
      /*
       * KARTIN GELDİĞİ HESAP KARTTA YAZIYOR.
       *
       * Bir workspace'te birden çok Instagram hesabı ve YouTube kanalı
       * olabiliyor; hangisinden geldiği yazmadığında kullanıcı onayladığı
       * içeriğin hangi markaya ait olduğunu göremiyor. Platform rozeti
       * "Instagram" diyor ama hangi Instagram hesabı olduğunu söylemiyor.
       */
      socialProfileName: r.profile_name,
      status: r.status as AutoBoostQueueItemRecord['status'],
      preset,
      blockedReason: this.blockedReason(r, preset !== null, parsed),
      error: r.error,
      externalCampaignId: r.external_campaign_id,
      launchedAt: r.launched_at?.toISOString() ?? null,
      boostDurumu: r.boost_durumu,
      performance: this.performans(r),
      performanceNote: this.performansNotu(r),
      reBoostBlockedReason: this.tekrarEngeli(r),
      createdAt: r.created_at.toISOString(),
    };
  }

  /**
   * Yayına alınmış kartın ölçülen performansı.
   *
   * KAMPANYA SATIRI YOKSA SAYI DA YOK. Sıfır göndermek, henüz senkronize
   * edilmemiş bir kampanyayı "hiç harcamadı" diye göstermek olurdu ve
   * kullanıcı çalışan bir reklamı bozuk sanardı.
   */
  private performans(r: QueueRow): AutoBoostQueuePerformance | null {
    // GÜN SATIRI YOKSA SAYI DA YOK. Sıfır göstermek, metrikleri henüz
    // çekilmemiş bir kampanyayı "hiç gösterim almadı" diye göstermek olurdu.
    if (!r.kampanya_id || !r.gun || r.spend_micros === null) return null;
    return {
      spendMicros: r.spend_micros,
      impressions: r.impressions ?? 0,
      clicks: r.clicks ?? 0,
      conversions: r.conversions ?? 0,
    };
  }

  /**
   * Sayı yoksa NEDEN yok.
   *
   * Üç hâl birbirinden ayrılıyor: kart hiç yayınlanmadı, kampanya henüz
   * senkronize edilmedi, kampanya var ama gün verisi yok. Üçünü aynı boş
   * alana çevirmek bu ekranda daha önce yapıldı ve sebebi teşhis edilemedi.
   */
  private performansNotu(r: QueueRow): string | null {
    if (r.status !== 'launched') return null;
    if (!r.external_campaign_id) {
      return 'Kampanya kimliği kaydedilmemiş; performans eşleştirilemiyor.';
    }
    if (!r.kampanya_id) {
      return 'Kampanya henüz senkronize edilmedi. Rakamlar ilk taramadan sonra görünür.';
    }
    if (!r.gun) {
      return 'Kampanya açıldı, ölçülmüş bir gün verisi henüz yok.';
    }
    return null;
  }

  /**
   * Tekrar boostlamayı engelleyen sebep.
   *
   * Yalnızca SON DURUMDAKİ kartlar tekrar boostlanabiliyor: yayına alınmakta
   * olan bir kartı geri almak, platformda oluşmuş bir kampanyayı kayıtsız
   * bırakırdı.
   */
  private tekrarEngeli(r: QueueRow): string | null {
    if (!TEKRAR_ACIK_DURUMLAR.has(r.status)) {
      return 'Bu kart şu anda işleniyor; tekrar boostlamak için sonucunu bekle.';
    }
    if (r.aktif_boost_biter) {
      const gun = Math.max(
        0,
        Math.ceil((r.aktif_boost_biter.getTime() - Date.now()) / 86_400_000),
      );
      return gun > 0
        ? `Önceki boost hâlâ yayında; ${gun} gün sonra tekrar boostlayabilirsin.`
        : 'Önceki boost hâlâ yayında. Süresi bittiğinde tekrar boostlayabilirsin.';
    }
    return null;
  }

  /**
   * Kart neden onaylanamıyor?
   *
   * HER SEBEP AYRI CÜMLE ve her cümle YAPILACAK İŞİ söylüyor. "Onaylanamıyor"
   * demek, kullanıcıyı sebebi kendi kurulumunda aramaya iter — bu ekranda
   * daha önce tam olarak o oldu.
   */
  private blockedReason(
    r: QueueRow,
    presetVar: boolean,
    parsed: { success: boolean } | null,
  ): string | null {
    if (r.status !== 'pending') return null;

    /*
     * YÖNLENDİRME BU EKRANIN KENDİ DÜĞMESİNE. Bu cümleler bir süre
     * "Kütüphane → Bilgi Bankası" diyordu; ön ayar formu oradan alınıp bu
     * sayfanın üstündeki "Boost ön ayarı" düğmesine taşınınca cümle
     * kullanıcıyı ARTIK ÖN AYAR TAŞIMAYAN bir sayfaya gönderir oldu — üstelik
     * aynı ekrandaki elle boost kutusu doğru yeri gösterdiği için kullanıcı
     * ÇELİŞEN İKİ TALİMAT okuyordu. Ad, `boost-on-ayari.tsx` içindeki düğme
     * etiketiyle BİREBİR aynı olmak zorunda: metindeki ad ekrandakinden
     * ayrışırsa kullanıcı olmayan bir düğmeyi arar.
     */
    if (!r.preset_id) {
      return (
        'Bu platform için otomatik boost ön ayarı yok. Yukarıdaki ' +
        '"Boost ön ayarı" düğmesinden bütçe ve hedefleme tanımla.'
      );
    }
    if (r.preset_enabled === false) {
      return 'Otomatik boost ön ayarı kapalı. "Boost ön ayarı" düğmesinden aç.';
    }
    if (parsed && !parsed.success) {
      // Kaydın kendisi bozuk: panelde "hazır" göstermek, yayında patlayan bir
      // düğme göstermek olurdu.
      return (
        'Ön ayar kaydı okunamadı; "Boost ön ayarı" düğmesinden yeniden kaydet.'
      );
    }
    if (!presetVar) return 'Ön ayar okunamadı.';

    /*
     * REKLAM HESABI HER İKİ PLATFORMDA DA ZORUNLU ve mesaj platforma göre
     * değişiyor: Meta'da "sayfaya bağlı boost hesabı", Google'da "kanala bağlı
     * Google Ads hesabı". Tek bir genel cümle, kullanıcıyı yanlış ekrana
     * yönlendirirdi.
     */
    if (r.platform !== 'meta') {
      /*
       * YOUTUBE: yayınla AYNI karar (`youtubeHesabiSec`). Önceden yalnızca
       * "bağ var mı" soruluyordu; kanalda eski bir META bağı durduğunda kart
       * "hazır" görünüyor, yayın reddediyordu ve çaresi hiçbir ekranda yoktu.
       */
      return youtubeHesabiEngeli(
        youtubeHesabiSec(
          r.linked_ad_account_id && r.linked_platform
            ? { id: r.linked_ad_account_id, platform: r.linked_platform, clientId: r.linked_client_id }
            : null,
          r.client_id,
          r.google_hesaplari ?? [],
        ),
      );
    }
    if (!r.linked_ad_account_id) {
      return (
        'Bu sayfaya bağlı bir reklam hesabı yok. Workspace’ler ekranından ' +
        '“Boost hesabı” seç — reklam o hesaptan faturalandırılıyor.'
      );
    }

    return null;
  }
}

/**
 * TEKRAR BOOSTLAMAYA AÇIK DURUMLAR — kapsayıcı değil AÇIK LİSTE.
 *
 * `pending` ve `launching` dışarıda: birincisinde zaten karar bekleniyor,
 * ikincisinde platform çağrısı sürüyor ve kartı geri almak, oluşmuş bir
 * kampanyayı kayıtsız bırakırdı. Yeni bir durum eklendiğinde varsayılan
 * DIŞARIDA kalıyor — açık listenin sebebi bu.
 */
const TEKRAR_ACIK_DURUMLAR = new Set(['launched', 'rejected', 'failed']);

interface QueueRow {
  id: string;
  client_id: string;
  client_name: string;
  platform: string;
  external_id: string;
  title: string | null;
  thumbnail_url: string | null;
  permalink: string | null;
  media_type: string | null;
  published_at: Date | null;
  status: string;
  error: string | null;
  external_campaign_id: string | null;
  created_at: Date;
  launched_at: Date | null;
  signature_state: string | null;
  kampanya_id: string | null;
  gun: number | null;
  spend_micros: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  aktif_boost_biter: Date | null;
  boost_durumu: string | null;
  profile_name: string | null;
  linked_ad_account_id: string | null;
  linked_platform: string | null;
  linked_client_id: string | null;
  google_hesaplari: string[] | null;
  preset_id: string | null;
  preset_enabled: boolean | null;
  budget_mode: string | null;
  daily_budget_micros: bigint | null;
  total_budget_micros: bigint | null;
  duration_days: number | null;
  settings: unknown;
  total: bigint;
}
