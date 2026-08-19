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
  /**
   * HEDEF URL. Demand Gen reklamı bir varış noktası istiyor; video
   * izlenmesinin kendisi hedef olamıyor (CPV yok).
   */
  finalUrl: z.string().url().max(2048),
  /**
   * MARKA ADI — v24'ten beri ZORUNLU.
   *
   * `DemandGenVideoResponsiveAdInfo.business_name` proto'da "Required" ve
   * onsuz reklam oluşturulamıyor. Bu, "kullanıcı yalnızca videoyu seçip
   * yayınlar" akışının Google'da neden mümkün olmadığının bir parçası.
   */
  businessName: z.string().min(1).max(25),

  /**
   * LOGO — v24'ten beri ZORUNLU ve ayrı bir Asset kaydı gerektiriyor.
   *
   * Görsel Arşivi'ndeki bir varlığın kimliği. Yayın anında Google'a
   * yükleniyor ve kaynak adı `asset_platform_refs` tablosuna önbellekleniyor
   * — Meta'nın `image_hash`'i için zaten kullanılan tablo, aynı gerekçeyle:
   * hesap başına bir kez yüklemek yeterli.
   *
   * MÜŞTERİ BAŞINA BİR KEZ seçiliyor ve bütün videolarda kullanılıyor; akış
   * yine tek tıkla kalıyor, yalnızca kurulum bir adım uzuyor.
   */
  logoAssetId: z.string().uuid(),

  /**
   * Başlıklar ve açıklamalar. Reklam metni ön ayardan geliyor çünkü 1.0'ın
   * vaadi "form doldurmadan yayınla" — video geldiğinde sorulacak bir şey
   * kalmamalı.
   *
   * ═══ SINIRLAR DAHA SIKI OLANDAN ALINDI ═══
   *
   * Google'ın KENDİ dokümanları çelişiyor: bir yardım sayfası başlık için 40
   * karakter ve "en az 3 tane" derken diğeri 30 karakter ve "1-5" diyor. API
   * proto'su ise HİÇBİR sınır belgelemiyor ve resmî örnekler her alandan tek
   * tane gönderiyor.
   *
   * Çelişkide sıkı olanı seçmek, reddedilen bir isteği ekranda önlemek demek;
   * gevşek olanı seçmek "kabul edildi sandım, Google reddetti" demek olurdu.
   * Gerçek sınır ilk canlı çağrıda netleşecek.
   */
  headlines: z.array(z.string().min(1).max(30)).min(1).max(5),
  longHeadlines: z.array(z.string().min(1).max(90)).min(1).max(5),
  descriptions: z.array(z.string().min(1).max(90)).min(1).max(5),
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

export interface AutoBoostQueueItemRecord {
  id: string;
  clientId: string;
  clientName: string;
  platform: AutoBoostPlatform;
  /** Instagram medya kimliği ya da YouTube video kimliği. */
  externalId: string;
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

export const autoBoostDecisionSchema = z.object({
  approve: z.boolean(),
});

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
