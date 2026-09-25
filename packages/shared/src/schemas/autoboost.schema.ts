import { z } from 'zod';

/**
 * ADVETICS 1.0 — OTOMATİK BOOST (Instagram + YouTube).
 *
 * AKIŞ: yeni gönderi/video gelir → onay kuyruğuna kart düşer → kullanıcı
 * "Onayla ve Boostla" der → reklam kayıtlı ön ayarla yayına girer. Form yok.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * KAVRAM EŞLEŞMESİ — yeni tablo AÇILMADAN ÖNCE var olanlar kullanıldı
 * ─────────────────────────────────────────────────────────────────────────
 * · "Workspace"        = mevcut `clients` tablosu. Zaten RLS'li kiracı
 *                        varlığı (`app.can_access_client`). İkinci bir
 *                        kiracı tablosu açmak bütün politikaları
 *                        çiftlerdi.
 * · "ReportingMetric"  = mevcut `insights_daily`. Normalize metrikler,
 *                        döviz çevrimi ve bayatlık damgası orada.
 * · 90 günlük ingest   = mevcut `sync_jobs` + `initial_backfill` iş tipi.
 * · "PlatformConnection" = mevcut `platform_connections`.
 *
 * GERÇEKTEN YENİ OLAN İKİ ŞEY: ön ayarlar ve onay kuyruğu.
 */

// -----------------------------------------------------------------------------
// Platform ayrımı
// -----------------------------------------------------------------------------

/**
 * 1.0'da platform iki YÜZEYE karşılık geliyor: `meta` → Instagram,
 * `google` → YouTube.
 *
 * YENİ BİR ENUM AÇILMADI. Depoda `Platform` zaten `meta | google` ve YouTube
 * bir platform değil, Google'ın bir yüzeyi — spec'teki `'META' | 'YOUTUBE'`
 * ikisini aynı eksene koyuyor ve o eksen bir gün Google Arama eklendiğinde
 * bozulurdu.
 */
export const autoBoostPlatformSchema = z.enum(['meta', 'google']);
export type AutoBoostPlatform = z.infer<typeof autoBoostPlatformSchema>;

// -----------------------------------------------------------------------------
// Ön ayar — platforma özgü kısım
// -----------------------------------------------------------------------------

/**
 * META (Instagram) ön ayarı.
 *
 * Alanlar canlıda çalışan boost yolundan geliyor; uydurulmadı. `objective`
 * seçenekleri kasıtlı olarak DAR: bu üründe hedef kullanıcı reklamcılık
 * bilmiyor ve üçten fazla seçenek karar felci üretiyor.
 */
export const metaPresetSettingsSchema = z.object({
  platform: z.literal('meta'),
  /**
   * Meta'da hedef her zaman OUTCOME_ENGAGEMENT; değişen şey ad set'teki
   * `destination_type`. Bunu kullanıcıya "amaç" diye göstermek doğru ama
   * altındaki alan farklı — eşleme sunucuda yapılıyor.
   */
  goal: z.enum(['engagement', 'reach', 'profile_visits']).default('engagement'),
  /**
   * Kayıtlı kitle seçilirse DİĞER hedefleme alanları YOK SAYILIYOR.
   *
   * Kitle Meta'da kendi lokasyonunu, yaşını ve cinsiyetini taşıyor; ikisini
   * birleştirmek "kesişim mi birleşim mi" sorusunu bizim cevaplamamız demek
   * ve yanlış cevap sessizce yanlış kitleye harcıyor.
   */
  savedAudienceId: z.string().min(1).max(64).nullable().default(null),
  /**
   * Lokasyonlar TÜRÜYLE birlikte tutuluyor.
   *
   * İlk sürümde yalnızca anahtar gönderiliyordu ve sunucu hepsini şehir
   * sanıyordu: Meta "integer bekleniyor, TR geldi" ile reddediyordu. Ayrıca
   * Meta bu kovaları BİRLEŞİM olarak uyguluyor — "Türkiye + İzmir" Türkiye
   * geneli demek ve HİÇBİR HATA VERMİYOR.
   */
  locations: z
    .array(
      z.object({
        key: z.string().min(1).max(64),
        type: z.enum(['country', 'region', 'city']),
        /**
         * OKUNABİLİR AD — YALNIZCA GÖSTERİM İÇİN.
         *
         * Şema uzun süre yalnızca `key` tutuyordu ve şehir anahtarı Meta'nın
         * sayısal kimliği: panelde "2343687" yazıyordu. "Kimi hedefliyorum"
         * sorusunun cevabı okunamıyordu ve kullanıcı ön ayarı açmadan
         * göremiyordu.
         *
         * META'YA GİTMİYOR: `meta-targeting.ts` lokasyonu alan alan
         * kuruyor (`{ key }`), yani bu alan istek gövdesine sızmıyor.
         *
         * İSTEĞE BAĞLI: alan eklenmeden kaydedilmiş ön ayarlar geçerli
         * kalıyor ve gösterimde anahtara düşülüyor. Zorunlu yapmak, var olan
         * her ön ayarı bir gecede geçersiz kılardı.
         */
        label: z.string().min(1).max(120).optional(),
      }),
    )
    .max(25)
    .default([]),
  ageMin: z.number().int().min(13).max(65).default(18),
  ageMax: z.number().int().min(13).max(65).default(65),
  genders: z.enum(['all', 'male', 'female']).default('all'),
});

/**
 * GOOGLE (YouTube) ön ayarı.
 *
 * ═══ SPEC'TEN SAPMA — GEREKÇESİ ═══
 * Spec "YouTube Video Views (In-Stream / In-Feed)" ve "Target CPV / Maximum
 * CPV" istiyor. İKİSİ DE API'DEN OLUŞTURULAMIYOR. Google'ın kendi dokümanı:
 * video kampanyalarında API yalnızca okuma ve raporlama yapıyor, oluşturma
 * ve güncelleme yok. CPV teklifi de o kampanya tipine ait.
 *
 * Enum'da `VIDEO_ACTION` gibi değerlerin durması yanıltıcı: istek şema
 * doğrulamasından geçer, iş mantığı reddeder — bu projedeki en pahalı hata
 * tipinin ta kendisi.
 *
 * API'den YouTube video reklamı yayınlamanın TEK yolu Demand Gen:
 * `advertising_channel_type = DEMAND_GEN`, alt tip verilmez.
 *
 * SONUÇ: kullanıcıya "görüntüleme başına ödeme" VAAT EDİLEMİYOR. Teklif
 * seçenekleri Demand Gen'in gerçekten desteklediklerinden ibaret.
 */
export const googlePresetSettingsSchema = z.object({
  platform: z.literal('google'),
  /**
   * Demand Gen'in desteklediği teklif stratejileri. CPV YOK ve olmaması
   * bir eksiklik değil, platformun gerçeği.
   *
   * `maximize_clicks` varsayılan: dönüşüm takibi olmayan hesaplarda
   * `target_cpa` ve `maximize_conversions` öğrenmiyor ve sessizce kötü
   * çalışıyor — bu üründe piksel/etiket hikâyesi henüz yok.
   */
  biddingStrategy: z
    .enum(['maximize_clicks', 'target_cpa', 'maximize_conversions', 'target_cpc'])
    .default('maximize_clicks'),
  /** `target_cpa` / `target_cpc` seçilirse zorunlu — micros. */
  bidTargetMicros: z.string().regex(/^\d+$/).nullable().default(null),
  /*
   * ═══ MARKA, LOGO VE ADRES OTOMATİK — ön ayarda YALNIZCA GEÇERSİZ KILMA ═══
   *
   * Bu üç alan önceden ZORUNLUYDU ve kullanıcının tarifi *"çok büyük
   * angarya"*: marka adı elle yazılıyor, logo Görsel Arşivi'nden seçiliyor,
   * adres elle giriliyordu — hepsi sistemde ZATEN duran bilgiler. Artık
   * yayın anında türetiliyor (`youtube-otomatik.ts`):
   *
   *   · marka adı  → workspace adı, sığmazsa kanal adı
   *   · logo       → Bilgi Bankası logosu, yoksa YouTube kanal görseli
   *   · hedef URL  → workspace'in web sitesi
   *
   * Alanlar şemada İSTEĞE BAĞLI kaldı: eski ön ayarlarda seçilmiş bir logo
   * ya da adres varsa o kullanılıyor. Silmek, kullanıcının bilerek yaptığı
   * seçimi sessizce atmak olurdu.
   *
   * Google'ın kuralları değişmedi: marka adı en fazla 25 karakter, logo
   * zorunlu, Demand Gen bir varış adresi istiyor (CPV yok).
   */
  finalUrl: z.string().url().max(2048).optional(),
  businessName: z.string().min(1).max(25).optional(),
  logoAssetId: z.string().uuid().optional(),
  /*
   * ═══ BAŞLIK VE AÇIKLAMA ÖN AYARDA YOK ═══
   *
   * Önceden burada sabit metinler vardı ve HER VİDEO AYNI başlıkla
   * gidiyordu; videonun kendi başlığı yalnızca kampanya adında
   * kullanılıyordu. Metinler artık her videonun başlığından ve
   * açıklamasından yayın anında üretiliyor. Eski kayıtlarda duran
   * `headlines` alanları şema tarafından atılıyor ve KULLANILMIYOR.
   */
  /** Ülke/bölge anahtarları — Google'ın `geoTargetConstants` kaynak adları. */
  locations: z.array(z.string().min(1).max(64)).max(25).default([]),
  ageRanges: z
    .array(
      z.enum([
        'AGE_RANGE_18_24',
        'AGE_RANGE_25_34',
        'AGE_RANGE_35_44',
        'AGE_RANGE_45_54',
        'AGE_RANGE_55_64',
        'AGE_RANGE_65_UP',
      ]),
    )
    .max(6)
    .default([]),
});

/**
 * AYRIK BİRLEŞİM — yanlış platformun alanını yazmak DERLEYİCİ seviyesinde
 * imkânsız.
 *
 * Tek bir düz nesnede iki platformun alanlarını yan yana tutmak, yarısı her
 * zaman NULL olan bir tablo ve "hangi alan hangi platformda geçerli"
 * sorusunu her okuyanın hatırlamasını gerektiren bir kod demekti.
 */
export const autoBoostPresetSettingsSchema = z.discriminatedUnion('platform', [
  metaPresetSettingsSchema,
  googlePresetSettingsSchema,
]);
export type AutoBoostPresetSettings = z.infer<typeof autoBoostPresetSettingsSchema>;

/** Ayrık birleşimin Meta dalı — yayın yolu bunu tek başına taşıyor. */
export type MetaPresetSettings = Extract<AutoBoostPresetSettings, { platform: 'meta' }>;

// -----------------------------------------------------------------------------
// Ön ayarın kendisi
// -----------------------------------------------------------------------------

/**
 * BÜTÇE İKİ KİPLİ ve kip platforma göre KISITLI.
 *
 * Meta ikisini de destekliyor. Google'da toplam bütçe YOK — bütçe ayrı bir
 * kaynak (`CampaignBudget`) ve günlük. Google'da `lifetime` seçilirse
 * günlük değere bölmek gerekir ve o zaman ekranda yazan toplam ile gerçek
 * harcama ayrışır; bu yüzden kısıt şemada.
 */
export const autoBoostBudgetSchema = z
  .object({
    mode: z.enum(['daily', 'lifetime']),
    /** Ana para biriminde ("300" = 300 ₺). Micros'a sunucuda çevriliyor. */
    amount: z
      .string()
      .regex(/^\d+([.,]\d{1,2})?$/, 'Geçerli bir tutar gir')
      .refine((v) => Number(v.replace(',', '.')) >= 20, {
        message: 'En az 20 ₺ — daha küçük bütçe dağıtım almıyor',
      }),
    durationDays: z.number().int().min(1).max(30),
  })
  .strict();
export type AutoBoostBudget = z.infer<typeof autoBoostBudgetSchema>;

export const autoBoostPresetInputSchema = z
  .object({
    clientId: z.string().uuid(),
    /**
     * Hangi sosyal profil/kanal için. NULL = müşterinin o platformdaki
     * bütün profilleri.
     */
    socialProfileId: z.string().uuid().nullable().default(null),
    enabled: z.boolean().default(true),
    budget: autoBoostBudgetSchema,
    settings: autoBoostPresetSettingsSchema,
  })
  .superRefine((v, ctx) => {
    // GOOGLE'DA TOPLAM BÜTÇE YOK — sebebi yukarıda.
    if (v.settings.platform === 'google' && v.budget.mode === 'lifetime') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['budget', 'mode'],
        message:
          'Google tarafında toplam bütçe yok; bütçe kampanya seviyesinde ve günlük. Günlük bütçe seç.',
      });
    }
    // HEDEF TEKLİF ZORUNLU OLDUĞU HÂLLER. Boş bırakmak, kararı Google'ın
    // hesap varsayılanına bırakmak demek ve aynı kod iki müşteride farklı
    // davranır.
    if (
      v.settings.platform === 'google' &&
      (v.settings.biddingStrategy === 'target_cpa' ||
        v.settings.biddingStrategy === 'target_cpc') &&
      !v.settings.bidTargetMicros
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['settings', 'bidTargetMicros'],
        message: 'Hedef CPA/CPC stratejisinde hedef tutar zorunlu.',
      });
    }
    if (v.settings.platform === 'meta' && v.settings.ageMin > v.settings.ageMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['settings', 'ageMin'],
        message: 'Alt yaş üst yaştan büyük olamaz.',
      });
    }
  });
export type AutoBoostPresetInput = z.infer<typeof autoBoostPresetInputSchema>;

export interface AutoBoostPresetRecord {
  id: string;
  clientId: string;
  platform: AutoBoostPlatform;
  socialProfileId: string | null;
  socialProfileName: string | null;
  enabled: boolean;
  budgetMode: 'daily' | 'lifetime';
  budgetMicros: string;
  durationDays: number;
  settings: AutoBoostPresetSettings;
  updatedAt: string;
}

// -----------------------------------------------------------------------------
// Onay kuyruğu
// -----------------------------------------------------------------------------

/**
 * Kuyruk kaydının durumu.
 *
 * `launching` AYRI BİR DURUM ve bu bilinçli: onay ile platformda oluşma
 * arasında saniyeler var ve o aralıkta süreç düşerse kayıt `pending`
 * kalmamalı — kalırsa ikinci kez onaylanır ve İKİNCİ bir reklam açılır.
 * Aynı gerekçeyle `boosts.status` içinde de `creating` var.
 */
export const autoBoostQueueStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'launching',
  'launched',
  'failed',
]);
export type AutoBoostQueueStatus = z.infer<typeof autoBoostQueueStatusSchema>;

/**
 * ═══ YAYINDAKİ BOOSTUN ÖLÇÜLEN PERFORMANSI ═══
 *
 * Kart onaydan önce "ne kadar harcayacağım", onaydan sonra "ne oldu" sorusunu
 * taşıyor ve ikincisinin cevabı bu ekranda hiç yoktu: kullanıcı boostladığı
 * gönderinin sonucunu görmek için Genel Bakış'a gidip kampanyayı aramak
 * zorundaydı.
 *
 * SAYILAR TÜRETİLMİYOR, HAM GELİYOR. CTR ve EBM panelde hesaplanıyor; burada
 * hesaplayıp göndermek, aynı bölmeyi iki yerde yazmak olurdu.
 */
export interface AutoBoostQueuePerformance {
  spendMicros: string;
  impressions: number;
  clicks: number;
  conversions: number;
}

export interface AutoBoostQueueItemRecord {
  id: string;
  clientId: string;
  clientName: string;
  platform: AutoBoostPlatform;
  /** Instagram medya kimliği ya da YouTube video kimliği. */
  externalId: string;
  /**
   * KARTIN GELDİĞİ HESAP — Instagram sayfası ya da YouTube kanalı.
   *
   * Bir workspace'te birden çok hesap olabiliyor ve platform rozeti
   * "Instagram" demekle yetiniyordu: hangi marka hesabından geldiği
   * yazmadığında kullanıcı neyi onayladığını ancak içeriği açarak görüyor.
   *
   * NULL OLABİLİR: hesap havuza geri konmuşsa RLS satırı göstermiyor ve
   * "göremiyorum" ile "yok" aynı şey değil.
   */
  socialProfileName: string | null;
  title: string | null;
  thumbnailUrl: string | null;
  permalink: string | null;
  mediaType: string | null;
  publishedAt: string | null;
  status: AutoBoostQueueStatus;
  /**
   * Karta uygulanacak ön ayarın ÖZETİ — kullanıcı onaylamadan önce ne
   * olacağını görmeli. Ön ayar yoksa null ve kart onaylanamaz.
   */
  preset: AutoBoostPresetRecord | null;
  /** Ön ayar yoksa/uygunsuzsa neden onaylanamadığı. */
  blockedReason: string | null;
  error: string | null;
  externalCampaignId: string | null;
  /**
   * REKLAMIN YAYINA GİRDİĞİ AN — `publishedAt` İLE AYNI ŞEY DEĞİL.
   *
   * `publishedAt` gönderinin Instagram/YouTube'da yayınlandığı tarih; bu ise
   * reklamın açıldığı tarih. Kart ikisini birden gösteriyor çünkü aralarında
   * haftalar olabiliyor ve "ne zaman paylaşıldı" ile "ne zaman boostlandı"
   * iki ayrı soru.
   */
  launchedAt: string | null;
  /**
   * YAYINDAKİ BOOST'UN DURUMU — kartın hangi düğmeleri göstereceğini bu
   * belirliyor.
   *
   * `'active'`  → yayında: duraklat · düzenle · iptal
   * `'paused'`  → duraklatılmış: sürdür · düzenle · iptal
   * diğerleri   → bitmiş: tekrar yayınla · düzenle · yayınlama
   *
   * `null` OLABİLİR ve iki ayrı sebebi var: kart hiç yayınlanmadı ya da
   * YouTube yolundan geçti (orada `boosts` satırı yok, kampanya Google Ads'te
   * yönetiliyor). İkisinde de yayın kontrolü sunulmuyor.
   */
  boostDurumu: string | null;
  /**
   * Yayına alınmış kartın ölçülen performansı. `null` = sayı YOK; sebebi
   * `performanceNote` içinde ve ikisi ayrı: "sıfır harcama" ile "kampanya
   * henüz senkronize edilmedi" aynı şey değil.
   */
  performance: AutoBoostQueuePerformance | null;
  performanceNote: string | null;
  /**
   * Tekrar boostlamayı engelleyen sebep — `null` ise düğme açık.
   *
   * En sık sebep: önceki boost hâlâ yayında. `boosts_active_post_uniq` kısmi
   * tekil indeksi aynı gönderi için ikinci bir aktif boost'a izin vermiyor ve
   * engeli yayın anında öğrenmek, kullanıcıya sebebi yazmayan bir veritabanı
   * hatası göstermek olurdu.
   */
  reBoostBlockedReason: string | null;
  createdAt: string;
}

export interface AutoBoostQueueList {
  items: AutoBoostQueueItemRecord[];
  total: number;
  /** Liste boşsa NEDEN boş — bu projede boş liste sebebini söylemek zorunda. */
  emptyReason: string | null;
}

export const autoBoostQueueQuerySchema = z.object({
  clientId: z.string().uuid(),
  status: autoBoostQueueStatusSchema.optional(),
  platform: autoBoostPlatformSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type AutoBoostQueueQuery = z.infer<typeof autoBoostQueueQuerySchema>;

/**
 * ═══ KART BAZINDA ÖZELLEŞTİRME ═══
 *
 * Ön ayar workspace geneli: "bu müşterinin her gönderisi şu bütçeyle, şu
 * kitleye". Ama tek bir gönderi bazen farklı davranmayı hak ediyor —
 * kampanya dönemindeki bir duyuru, yalnızca bir şehre yapılan bir ilan.
 * Kullanıcının isteği birebir buydu: "sadece o gönderi için kaç gün,
 * toplamda kaç TL, hangi hedef kitle ve şehir".
 *
 * ═══ ÖN AYARI DEĞİŞTİRMİYOR — YALNIZCA BU KARTA UYGULANIYOR ═══
 *
 * Kaydedilmiyor; onay isteğiyle birlikte gidiyor ve `boosts` satırına
 * yazılıyor. Ön ayarı kalıcı değiştirmek, "bir gönderi için" denen bir
 * ayarın sonraki bütün gönderileri sessizce etkilemesi demekti.
 *
 * ALANLARIN HEPSİ İSTEĞE BAĞLI ve verilmeyen alan ÖN AYARDAN geliyor.
 * Yarısı boş bir nesne göndermek, boş bırakılan alanları sıfırlamak
 * anlamına GELMEZ.
 */
export const autoBoostQueueOverrideSchema = z
  .object({
    budget: autoBoostBudgetSchema.optional(),
    /**
     * HEDEFLEME YALNIZCA META'DA. Google (Demand Gen) tarafında kitle ve
     * lokasyon kampanya seviyesinde ve bu ürün orada henüz yazma yapmıyor;
     * kabul edip yok saymak, kullanıcıya çalışan bir alan göstermek olurdu.
     */
    targeting: z
      .object({
        /**
         * Kayıtlı kitle seçilirse DİĞER hedefleme alanları YOK SAYILIYOR —
         * ön ayardaki kuralın aynısı. Kitle Meta'da kendi lokasyonunu ve
         * demografisini taşıyor; ikisini birleştirmek "kesişim mi birleşim
         * mi" sorusunu bizim cevaplamamız demek.
         */
        savedAudienceId: z.string().min(1).max(64).nullable(),
        locations: z
          .array(
            z.object({
              key: z.string().min(1).max(64),
              type: z.enum(['country', 'region', 'city']),
            }),
          )
          .max(25),
        ageMin: z.number().int().min(13).max(65),
        ageMax: z.number().int().min(13).max(65),
        genders: z.enum(['all', 'male', 'female']),
      })
      .optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.targeting && v.targeting.ageMin > v.targeting.ageMax) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['targeting', 'ageMin'],
        message: 'Alt yaş üst yaştan büyük olamaz.',
      });
    }
  });
export type AutoBoostQueueOverride = z.infer<typeof autoBoostQueueOverrideSchema>;

export const autoBoostDecisionSchema = z
  .object({
    approve: z.boolean(),
    override: autoBoostQueueOverrideSchema.optional(),
  })
  .superRefine((v, ctx) => {
    /*
     * REDDEDERKEN ÖZELLEŞTİRME ANLAMSIZ ve sessiz bırakmak tehlikeli:
     * kullanıcı bütçeyi düzenleyip yanlışlıkla "Reddet"e basarsa,
     * düzenlemesinin hiçbir yere gitmediğini hiçbir yerde görmezdi.
     */
    if (!v.approve && v.override) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['override'],
        message: 'Reddedilen bir kart için özelleştirme gönderilemez.',
      });
    }
  });
export type AutoBoostDecisionInput = z.infer<typeof autoBoostDecisionSchema>;

// -----------------------------------------------------------------------------
// Abonelik sağlığı — ÖLÜ ADAM DÜĞMESİ
// -----------------------------------------------------------------------------

/**
 * YouTube bildirim aboneliğinin durumu.
 *
 * NEDEN PANELDE GÖRÜNÜYOR: WebSub kiralaması ~10 günde doluyor ve hub HABER
 * VERMİYOR. Yenileme işi de tek noktalı arıza — Redis temizlenip tekrarlı iş
 * kaybolursa bildirim sessizce duruyor. Üç arıza da panelde yalnızca "hiç
 * kart gelmiyor" olarak görünür ve sebebi YouTube'da, kanalda, izinlerde
 * aranır.
 *
 * Bu kayıt o aramayı gereksiz kılıyor.
 */
export interface AutoBoostSubscriptionHealth {
  socialProfileId: string;
  channelName: string;
  ok: boolean;
  /** Sorun varsa NE YAPILACAĞINI söyleyen cümle. */
  message: string | null;
  verifiedAt: string | null;
  lastNotificationAt: string | null;
  /** Hub reddettiyse sebebi — insan müdahalesi gerekiyor. */
  deniedReason: string | null;
  /**
   * İmza kilidi kuruldu mu.
   *
   * Kurulmadıysa koruma yalnızca bildirim adresinin gizli kalmasına
   * dayanıyor ve kullanıcı bunu bilmeli.
   */
  signatureLocked: boolean;
}

// -----------------------------------------------------------------------------
// YouTube — otomatik doldurulan bilgiler
// -----------------------------------------------------------------------------

/**
 * YOUTUBE ÖN AYARININ OTOMATİK DOLAN BİLGİLERİ — ekranda gösterilen ile
 * yayında kullanılan AYNI çözümleyiciden geliyor.
 *
 * Ekran "logo: Bilgi Bankası logosu" derken yayın kanal görselini
 * kullansaydı, kullanıcı gördüğüne güvenip başka bir şey yayınlamış olurdu.
 * Her alan KAYNAĞINI taşıyor: "nereden geldi" bilinmezse değiştirmek için
 * nereye gidileceği de bilinmez.
 */
export interface YoutubeOtomatikOnizleme {
  kanal: { id: string; ad: string; gorsel: string | null } | null;
  marka: {
    deger: string | null;
    kaynak: 'on-ayar' | 'workspace' | 'kanal' | 'kisaltildi' | 'yok';
  };
  logo: {
    /** `profil-logosu` = Bilgi Bankası'nın Logo sekmesindeki workspace logosu. */
    kaynak: 'on-ayar' | 'profil-logosu' | 'kanal' | 'yok';
    /** Ekranda gösterilecek görsel adresi. */
    onizleme: string | null;
  };
  url: { deger: string | null; kaynak: 'on-ayar' | 'workspace' | 'yok' };
  /** Son videodan üretilmiş örnek metinler — yoksa henüz video gelmemiş. */
  ornek: {
    videoBasligi: string;
    baslik: string;
    uzunBaslik: string;
    aciklama: string;
  } | null;
  /** Yayını engelleyen eksikler — boşsa yayınlanabilir. */
  eksikler: string[];
}
