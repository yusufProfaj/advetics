import type { Platform } from '@advetics/shared';

/**
 * Platform adapter sözleşmesi.
 *
 * Meta ve Google'ın OAuth akışları, hesap modelleri ve hata kodları taban tabana
 * farklı. Bu interface o farkı TEK yerde soğuruyor; üst katmanlar (bağlantı
 * yönetimi, Modül 3 sync worker'ları, Modül 5 kural motoru) hangi platformla
 * konuştuklarını bilmiyor.
 *
 * Kapsam kilidi: yalnızca `meta` ve `google` implementasyonu vardır ve olacaktır.
 */

// -----------------------------------------------------------------------------
// Normalize edilmiş hata modeli
// -----------------------------------------------------------------------------

/**
 * Platform hatalarının ortak dili.
 *
 * Modül 3'teki circuit breaker ve adaptif hız sınırlayıcı bu sınıflandırmaya
 * göre karar verecek. Ham platform kodlarıyla (Meta #190, Google
 * AUTHENTICATION_ERROR) çalışmak, her karar noktasında iki ayrı eşleme tablosu
 * taşımak demek olurdu.
 */
export type PlatformErrorKind =
  /** Kota aşıldı. Backoff + kuyruğa iade. */
  | 'rate_limited'
  /** Token geçersiz/süresi dolmuş. Bağlantı `needs_reauth` olur, sync durur. */
  | 'invalid_token'
  /** Token geçerli ama bu kaynak için yetki yok. Yeniden denemek anlamsız. */
  | 'permission_denied'
  /** Geçici sunucu hatası. Retry edilebilir. */
  | 'transient'
  /** Kalıcı hata (silinmiş varlık, geçersiz alan). Retry edilmez → DLQ. */
  | 'permanent';

export class PlatformApiError extends Error {
  constructor(
    readonly platform: Platform,
    readonly kind: PlatformErrorKind,
    message: string,
    readonly detail?: {
      httpStatus?: number;
      platformCode?: string | number;
      platformSubcode?: string | number;
      retryAfterSeconds?: number;
      raw?: unknown;
    },
  ) {
    super(message);
    this.name = 'PlatformApiError';
  }

  /** Bu hata tekrar denemeye değer mi? */
  get retryable(): boolean {
    return this.kind === 'rate_limited' || this.kind === 'transient';
  }
}

// -----------------------------------------------------------------------------
// Kota telemetrisi (Modül 3'te kullanılacak)
// -----------------------------------------------------------------------------

/**
 * Her API yanıtından çıkarılan kota durumu.
 *
 * Meta bunu `X-Business-Use-Case-Usage` header'ında ÜÇ ayrı yüzde olarak verir;
 * Google hiç vermez, yalnızca tükendiğinde hata döndürür. Adapter bu farkı
 * gizler ve `ad_accounts.rate_limit_state` kolonuna yazılacak tek bir şekil üretir.
 *
 * SDK yerine doğrudan REST kullanmamızın ana sebebi bu: SDK'lar header'ları
 * soyutlayıp gizliyor, biz onları ham olarak okumak zorundayız.
 */
export interface RateLimitSnapshot {
  /** Meta: call_count / total_cputime / total_time yüzdelerinin en yükseği. */
  usagePercent?: number;
  callCountPct?: number;
  cpuTimePct?: number;
  totalTimePct?: number;
  /** Google: bu istekte tüketilen operasyon sayısı. */
  operationsUsed?: number;
  retryAfterSeconds?: number;
  observedAt: string;
}

// -----------------------------------------------------------------------------
// OAuth
// -----------------------------------------------------------------------------

export interface AuthorizeUrlParams {
  state: string;
  redirectUri: string;
  /** Kullanıcıyı hesap seçim ekranına zorla (yeniden yetkilendirmede gerekli). */
  forceReconsent?: boolean;
}

export interface OAuthTokens {
  accessToken: string;
  /** Google'da zorunlu (access token 1 saatte dolar), Meta'da genelde yok. */
  refreshToken?: string;
  expiresAt?: Date;
  grantedScopes: string[];
  /** Platform tarafındaki kullanıcı/işletme kimliği. */
  externalUserId: string;
  /** UI'da gösterilecek ad. */
  accountLabel: string;
}

export interface TokenVerification {
  valid: boolean;
  externalUserId?: string;
  grantedScopes?: string[];
  expiresAt?: Date;
  /** Eksik olan zorunlu scope'lar. Dolu ise bağlantı iş görmez. */
  missingScopes?: string[];
}

// -----------------------------------------------------------------------------
// Keşif
// -----------------------------------------------------------------------------

export type NormalizedAccountStatus =
  | 'active'
  | 'paused'
  | 'disabled'
  | 'closed'
  | 'unknown';

export interface DiscoveredAdAccount {
  externalId: string;
  name: string;
  /** ISO 4217. */
  currency: string;
  /** IANA timezone. "Bugün"ün tanımı buna bağlı. */
  timezone: string;
  status: NormalizedAccountStatus;
  /** Google MCC / Meta Business Manager kimliği. */
  managerExternalId?: string;
  raw: unknown;
}

export interface DiscoveredSocialProfile {
  profileType: 'facebook_page' | 'instagram_business';
  externalId: string;
  name: string;
  username?: string;
  pictureUrl?: string;
  /** Sayfa token'ı kullanıcı token'ından ayrıdır ve ayrı şifrelenir. */
  pageAccessToken?: string;
  raw: unknown;
}

// -----------------------------------------------------------------------------
// Yapı senkronizasyonu (L1)
// -----------------------------------------------------------------------------

/**
 * Bir API çağrısı için gereken her şey.
 *
 * `onRateLimit` geri çağrısı bilinçli bir tercih: sağlayıcı kota bekçisini
 * TANIMIYOR. Tanısaydı `providers/` katmanı `queue/` katmanına bağımlı olurdu
 * ve sağlayıcıları izole test etmek imkânsızlaşırdı. Sağlayıcı yalnızca
 * "platform şu yüzdeyi bildirdi" diyor; bununla ne yapılacağına üst katman
 * karar veriyor.
 */
export interface FetchContext {
  accessToken: string;
  /** Meta: `act_<id>` olmadan ham hesap kimliği. Google: `customerId`. */
  accountExternalId: string;
  /**
   * Google MCC kimliği — `login-customer-id` header'ı için.
   *
   * Alt hesap sorgularında ZORUNLU: MCC altındaki bir müşteriyi sorgularken bu
   * header olmadan Google `USER_PERMISSION_DENIED` döner (bkz. google.provider).
   */
  loginCustomerId?: string;
  /** Her yanıttan okunan kota telemetrisi buradan yukarı akar. */
  onRateLimit?: (snapshot: RateLimitSnapshot) => void | Promise<void>;
}

/** Platformların ham durum sözlüklerinden normalize edilmiş durum. */
export type NormalizedEntityStatus =
  | 'active'
  | 'paused'
  | 'deleted'
  | 'pending_review'
  | 'ended'
  | 'unknown';

export type NormalizedBudgetMode = 'daily' | 'lifetime' | 'none';

/** Hiyerarşinin her seviyesinde tekrar eden alanlar. */
interface StructureEntityBase {
  externalId: string;
  name: string;
  status: NormalizedEntityStatus;
  /** Platformun ham durumu — "PAUSED" ile "CAMPAIGN_PAUSED" farkı korunur. */
  effectiveStatus?: string;
  /** Delta senkronizasyonun anahtarı. */
  platformUpdatedAt?: Date;
  raw: unknown;
}

export interface DiscoveredCampaign extends StructureEntityBase {
  objective?: string;
  budgetMode: NormalizedBudgetMode;
  budgetAmountMicros?: bigint;
  bidStrategy?: string;
  startTime?: Date;
  stopTime?: Date;
}

export interface DiscoveredAdGroup extends StructureEntityBase {
  campaignExternalId: string;
  budgetMode: NormalizedBudgetMode;
  budgetAmountMicros?: bigint;
  bidAmountMicros?: bigint;
  optimizationGoal?: string;
  /** Modül 8 toplu oluşturucuda şablon olarak kullanılacak. */
  targeting?: unknown;
  startTime?: Date;
  stopTime?: Date;
}

export interface DiscoveredAd extends StructureEntityBase {
  adGroupExternalId: string;
  creativeExternalId?: string;
  previewUrl?: string;
  reviewStatus?: string;
  disapprovalReasons?: unknown;
}

export interface DiscoveredCreative {
  externalId: string;
  creativeType?: string;
  headline?: string;
  primaryText?: string;
  description?: string;
  ctaType?: string;
  destinationUrl?: string;
  displayUrl?: string;
  /**
   * Görsel adresleri — KALİTEYE GÖRE SIRALI, en iyisi başta.
   *
   * `unknown` değil `string[]`: tür belirsizliği çağıran tarafta gereksiz
   * daraltma zorunluluğu üretiyordu ve bu alan hiçbir zaman başka bir şey
   * olmuyor.
   */
  assetUrls?: string[];
  raw: unknown;
}

/**
 * Bir hesabın tüm reklam hiyerarşisi.
 *
 * Neden seviye seviye değil de TEK çağrıda: her platformun en verimli sorgu
 * şekli farklı. Google tek GAQL'de ad_group_ad üzerinden kampanyaya kadar
 * join'liyor; Meta ise edge'leri ayrı ayrı ama Batch API ile tek HTTP
 * isteğinde çekiyor. Seviye başına ayrı metot dayatmak ikisini de en verimsiz
 * biçime zorlardı — Google için 3 ayrı sorgu, Meta için batch'in iptali.
 *
 * `complete: false` kısmi sonucu işaretler (kota tükendi, sayfalama yarıda
 * kaldı). Kısmi sonuçta EKSİK VARLIKLAR SİLİNMİŞ SAYILMAZ — yoksa kotası
 * dolan bir hesabın tüm kampanyaları silinmiş görünürdü.
 */
export interface PlatformStructure {
  campaigns: DiscoveredCampaign[];
  adGroups: DiscoveredAdGroup[];
  ads: DiscoveredAd[];
  creatives: DiscoveredCreative[];
  complete: boolean;
  /** Kaç HTTP çağrısı harcandı — `sync_jobs.api_calls_used` için. */
  apiCalls: number;
}

// -----------------------------------------------------------------------------
// Metrikler (L2 / L3 / L4)
// -----------------------------------------------------------------------------

/** Hangi seviyede metrik isteniyor. `insights_daily.entity_level` ile aynı. */
export type InsightsLevel = 'account' | 'campaign' | 'ad_group' | 'ad';

export interface InsightsRequest {
  level: InsightsLevel;
  /**
   * YYYY-MM-DD. Date nesnesi DEĞİL.
   *
   * Postgres `DATE` → JS `Date` çevrimi saat dilimine göre bir gün kaydırıyor
   * ve metrikler yanlış güne yazılıyor. Tarihler baştan sona string taşınıyor.
   */
  dateFrom: string;
  dateTo: string;
  /** Hesabın zaman dilimi — "gün"ün tanımı buna bağlı. */
  timezone: string;
}

/**
 * Tek bir varlığın tek bir gününe ait metrikler.
 *
 * Para birimi satır başına taşınıyor: bir müşterinin farklı hesapları farklı
 * para biriminde olabiliyor ve harcamayı çevirmeden toplamak sessizce yanlış
 * sonuç üretir.
 */
export interface DiscoveredInsightRow {
  /** Platform tarafındaki varlık kimliği — iç UUID'ye üst katman çeviriyor. */
  entityExternalId: string;
  level: InsightsLevel;
  /** YYYY-MM-DD. */
  date: string;
  currency: string;

  impressions: number;
  clicks: number;
  /** Hesabın para biriminde, micros. */
  spendMicros: bigint;
  conversions: number;
  conversionValueMicros: bigint;
  videoViews: number;
  engagements: number;
  reach: number;
  frequency?: number;

  /**
   * Platformun ham metrik gövdesi.
   *
   * Saklamak zorunlu: "dönüşüm" tanımı kampanya amacına göre değişiyor ve
   * bizim seçtiğimiz aksiyon türleri ileride yanlış çıkabilir. Ham gövde
   * durursa geçmiş veriyi yeniden çekmeden yeniden hesaplayabiliriz.
   */
  raw: unknown;
}

export interface PlatformInsights {
  rows: DiscoveredInsightRow[];
  apiCalls: number;
  /**
   * `false` ise sonuç kısmi (sayfalama kesildi, kota bitti). Kısmi sonuç
   * yazılabilir — metrikler upsert, silme kararı yok — ama işin başarılı
   * sayılmaması gerekiyor, yoksa eksik gün "senkronize edildi" görünür.
   */
  complete: boolean;
}

// -----------------------------------------------------------------------------
// Adapter
// -----------------------------------------------------------------------------

/**
 * Platforma yazılacak aksiyon.
 *
 * `externalId` platformun kendi kimliği (bizim UUID'miz değil): yazma
 * çağrısında bizim kimliğimizin hiçbir anlamı yok ve çeviriyi sağlayıcının
 * içinde yapmak, her sağlayıcıya aynı join'i yazdırmak olurdu.
 */
export type PlatformActionRequest =
  | { type: 'pause'; level: 'campaign' | 'ad_group' | 'ad'; externalId: string }
  | { type: 'resume'; level: 'campaign' | 'ad_group' | 'ad'; externalId: string }
  | {
      type: 'set_budget';
      level: 'campaign' | 'ad_group';
      externalId: string;
      /** Micros. Günlük mü ömür boyu mu, `budgetMode` söylüyor. */
      amountMicros: bigint;
      budgetMode: 'daily' | 'lifetime';
      /**
       * Hesabın para birimi.
       *
       * Meta bütçeyi para biriminin EN KÜÇÜK BİRİMİNDE istiyor (TRY için
       * kuruş) ve bazı para birimlerinin küsuratı yok (JPY). Çevrimi
       * sağlayıcı yapıyor; micros'u doğrudan göndermek bütçeyi bir milyon
       * katına çıkarırdı.
       */
      currency: string;
    };

export interface PlatformActionResult {
  /** Platformun onayladığı yeni durum — kayda `afterState` olarak yazılıyor. */
  afterState: Record<string, unknown>;
}

/**
 * Organik gönderi — Modül 7 Auto-Boost'un girdisi.
 *
 * Metrikler gönderi ÖMRÜ BOYUNCA toplam, günlük değil. Reklam metriklerinden
 * farklı: orada günlük seri gerekiyor (geri düzeltme, pencere hesapları),
 * burada tek soru "bu gönderi iyi gitti mi".
 */
export interface DiscoveredOrganicPost {
  externalId: string;
  mediaType: 'photo' | 'video' | 'carousel' | 'reel' | 'text' | 'link';
  message?: string;
  permalink?: string;
  thumbnailUrl?: string;
  publishedAt: Date;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
  raw: unknown;
}

/**
 * Boost isteği — mevcut bir organik gönderiden reklam üretmek.
 *
 * Meta'da bu ÜÇ VARLIK demek: kampanya + ad set + reklam. Tek bir "boost"
 * uç noktası yok; Sayfa arayüzündeki "Gönderiyi Öne Çıkar" düğmesi de arka
 * planda bunları oluşturuyor.
 */
export interface BoostRequest {
  /** `act_` öneki OLMADAN reklam hesabı kimliği. */
  adAccountExternalId: string;
  /** Boost edilecek gönderinin platform kimliği. */
  postExternalId: string;
  /** Gönderinin sahibi sayfa — reklam bu sayfa adına yayınlanıyor. */
  pageExternalId: string;
  dailyBudgetMicros: bigint;
  durationDays: number;
  objective: string;
  currency: string;
  /** Kampanya adı — panelde ve Ads Manager'da görünür. */
  name: string;
}

export interface BoostResult {
  externalCampaignId: string;
  externalAdSetId: string;
  externalAdId: string;
}

/**
 * Toplu oluşturma isteği — Modül 8.
 *
 * TEK BİR REKLAM. Meta'nın toplu uç noktası yok; parti döngüsü çağıranın
 * işi. Burada tek satırı almak, kısmi başarıyı satır bazında takip
 * edilebilir kılıyor: 60 satırlık bir istekte 41. satır patlarsa ilk 40'ın
 * ne olduğunu bilmek imkânsız olurdu.
 */
export interface CreateAdRequest {
  adAccountExternalId: string;
  /** Reklamın ekleneceği ad set. */
  adSetExternalId: string;
  pageExternalId: string;
  name: string;
  primaryText?: string;
  headline?: string;
  description?: string;
  linkUrl?: string;
  callToAction?: string;
  /** Meta görsel hash'i ya da video kimliği. */
  mediaRef: string;
}

export interface CreateAdResult {
  externalAdId: string;
  externalCreativeId: string;
}

/**
 * Taslaktan TAM reklam üretme — Modül 4 (CREATE).
 *
 * `CreateAdRequest`ten FARKLI ve ayrı olması gerekiyor: o, MEVCUT bir ad
 * set'e reklam ekliyor (toplu oluşturucu, kampanya yapısı zaten kurulu).
 * Bu ise kampanya + ad set + kreatif + reklam zincirinin TAMAMINI kuruyor.
 *
 * İkisini tek tipte birleştirmek, yarısı opsiyonel bir alan kümesi üretirdi
 * ve hangi alanın hangi akışta zorunlu olduğu tipten okunamaz olurdu.
 */
/**
 * Kütüphaneden Meta'ya form yayınlama isteği (Formlar kütüphanesi).
 *
 * `publishDraft` içindeki gömülü form oluşturmadan AYRI: orada form reklamın
 * bir parçası ve alanları sabit; burada form başlı başına bir varlık,
 * yeniden kullanılabiliyor ve alanları kullanıcı belirliyor.
 */
export interface CreateLeadFormRequest {
  pageExternalId: string;
  /**
   * SAYFA TOKEN'I — kullanıcı token'ı DEĞİL.
   *
   * `leadgen_forms` uç noktası sayfanın altında yaşıyor ve sayfa token'ı
   * istiyor. Kullanıcı token'ıyla çağrı, izinler doğru olsa bile
   * "(#200) izin gerekiyor" ile dönüyor ve mesaj hangi token'ın eksik
   * olduğunu söylemiyor.
   */
  pageAccessToken: string;
  name: string;
  formType: string;
  headline?: string;
  intro?: string;
  questions: Array<{ type: string } | { type: 'CUSTOM'; label: string; options?: string[] }>;
  privacyPolicyUrl: string;
  privacyPolicyLinkText: string;
  consentBoxes: Array<{ text: string; required: boolean }>;
  thankYouHeadline: string;
  thankYouBody: string;
  thankYouCtaText: string;
  thankYouCtaUrl?: string;
}

export interface PublishDraftRequest {
  adAccountExternalId: string;
  pageExternalId: string;
  name: string;
  /**
   * Kampanya kararları — `goal-mapping.ts` üretiyor.
   *
   * Sağlayıcı bu kararları SORGULAMIYOR, yalnızca Meta'nın anlayacağı biçime
   * çeviriyor. Karar mantığını sağlayıcıya taşımak, onu test edilemez
   * kılardı.
   */
  spec: {
    objective: string;
    optimizationGoal: string;
    billingEvent: string;
    destinationType?: string;
    promotedObject?: Record<string, string>;
    callToAction: string;
  };
  primaryText: string;
  headline?: string;
  description?: string;
  linkUrl?: string;
  whatsappNumber?: string;
  dailyBudgetMicros: bigint;
  /** null = süresiz. */
  endTime: Date | null;
  currency: string;
  /** İlk eleman DAİMA kare — tek görselli yolda o kullanılıyor. */
  images: Array<{ ratio: 'square' | 'vertical' | 'horizontal'; hash: string }>;
  targeting: Record<string, unknown>;
  placements: Record<string, string[]>;
  /** Tek görselde null — basit kreatif yeterli. */
  customizationRules: Array<Record<string, unknown>> | null;
}

export interface PublishDraftResult {
  campaignId: string;
  adSetId: string;
  creativeId: string;
  adId: string;
  /** Yalnızca anlık form tipinde. */
  leadFormId?: string;
}

/**
 * Anahtar kelime performansı satırı — yalnızca Google.
 *
 * Meta'da karşılığı yok: orada hedefleme ilgi alanı ve kitle üzerinden
 * yürüyor, aranan bir kelime yok.
 */
export interface DiscoveredKeywordRow {
  /** Google criterion kimliği — METİN değişse de sabit kalan tekillik anahtarı. */
  externalCriterionId: string;
  keyword: string;
  matchType: 'EXACT' | 'PHRASE' | 'BROAD' | 'UNKNOWN';
  /** Ad group'un PLATFORM kimliği; çağıran bunu kendi UUID'sine çeviriyor. */
  adGroupExternalId?: string;
  /** YYYY-MM-DD */
  date: string;
  impressions: number;
  clicks: number;
  spendMicros: bigint;
  conversions: number;
  conversionValueMicros: bigint;
  currency: string;
}

export interface IAdPlatformProvider {
  readonly platform: Platform;

  /**
   * Çekirdek işlev için ZORUNLU scope'lar. Eksikse bağlantı iş görmez ve
   * `needs_reauth` gibi davranır.
   */
  readonly requiredScopes: readonly string[];

  /**
   * Belirli özellikleri açan, olmadan da temel işlevin çalıştığı scope'lar.
   *
   * Neden ayrı: Meta App Review izinleri TEK TEK onaylıyor ve her biri ayrı
   * ekran kaydı + API testi istiyor. Aşamalı başvuru yapmak (önce çekirdek,
   * sonra Auto-Boost) tek büyük başvurudan çok daha az riskli. Hepsini zorunlu
   * saymak, henüz onaylanmamış bir izin yüzünden çalışan bağlantıyı bozuk
   * göstermek demek olurdu.
   */
  readonly optionalScopes: readonly string[];

  /** Yapılandırma eksikse (app id/secret yok) false — UI butonu pasif gösterir. */
  isConfigured(): boolean;

  buildAuthorizeUrl(params: AuthorizeUrlParams): string;

  exchangeCode(code: string, redirectUri: string): Promise<OAuthTokens>;

  /**
   * Token'ı yeniler. Meta'da refresh token kavramı yoktur; oradaki
   * implementasyon uzun ömürlü token'ı takas ederek tazeler.
   */
  refreshTokens(tokens: {
    accessToken: string;
    refreshToken?: string;
  }): Promise<OAuthTokens>;

  verifyToken(accessToken: string): Promise<TokenVerification>;

  /**
   * Token'ı PLATFORM TARAFINDA iptal eder.
   *
   * Yalnızca kendi kaydımızı silmek yetmez: token platformda geçerli kalır.
   * Gizlilik politikamız bağlantı kaldırıldığında "erişimin durduğunu" beyan
   * ediyor — bunu gerçekten yapmak için platformun iptal uç noktasını çağırmak
   * gerekiyor.
   *
   * Başarısız olması bağlantının kaldırılmasını ENGELLEMEMELİ: token zaten
   * geçersiz olabilir, ya da platform erişilemez olabilir. İptal en iyi
   * çabadır, kaydı silmek kesindir.
   */
  revokeToken(tokens: { accessToken: string; refreshToken?: string }): Promise<void>;

  listAdAccounts(accessToken: string): Promise<DiscoveredAdAccount[]>;

  /**
   * Facebook sayfaları ve bağlı Instagram Business hesapları.
   * Google için daima boş dizi döner — orada karşılığı yok.
   */
  listSocialProfiles(accessToken: string): Promise<DiscoveredSocialProfile[]>;

  /**
   * L1 — hesabın reklam hiyerarşisini çeker.
   *
   * `since` verilirse yalnızca o andan sonra değişen varlıklar istenir. Bu
   * DELTA senkronizasyondur ve maliyeti belirleyen tek şeydir: 6 saatte bir
   * 500 kampanyanın tamamını çekmek yerine değişen 3'ünü çekmek kotayı
   * ~%95 azaltıyor.
   *
   * Delta sonucu KISMİDİR: dönmeyen varlık "silinmiş" değil "değişmemiş"
   * demektir. Silinme tespiti yalnızca `since` verilmediğinde (tam tarama)
   * yapılabilir — bkz. `PlatformStructure.complete`.
   */
  fetchStructure(ctx: FetchContext, since?: Date): Promise<PlatformStructure>;

  /**
   * L2/L3/L4 — günlük metrikleri çeker.
   *
   * Tarih aralığı GÜN GÜN dönüyor (tek toplam değil): `insights_daily` günlük
   * granülerlikte ve tek bir toplam satırı geri düzeltmeyi imkânsız kılardı.
   */
  fetchInsights(ctx: FetchContext, request: InsightsRequest): Promise<PlatformInsights>;

  /**
   * YAZMA — kural motorunun platforma dokunduğu tek nokta.
   *
   * Tek bir metot, aksiyon başına ayrı metot değil: çağıran taraf (kural
   * uygulayıcı) hangi aksiyonun hangi platformda desteklendiğini bilmek
   * zorunda kalmasın. Desteklenmeyen bir aksiyon `permanent` hatayla
   * reddediliyor ve o hata kural kaydına yazılıyor.
   *
   * `writeScopes` boş değilse bu yetenek İZİN BEKLİYOR demektir; çağıran
   * önce `canWrite()` sormalı.
   */
  applyAction(ctx: FetchContext, action: PlatformActionRequest): Promise<PlatformActionResult>;

  /**
   * Bu bağlantı yazma yapabilir mi.
   *
   * Meta App Review izinleri TEK TEK onaylıyor ve `ads_management` çoğu
   * uygulamada `ads_read`ten aylar sonra geliyor. Onay gelmeden yazmayı
   * denemek, her kural turunda aynı yetki hatasını üretirdi — ajans kuralın
   * bozuk olduğunu sanırdı. Eksik izni ÖNCEDEN söylemek, hatayı sonradan
   * açıklamaktan iyi.
   */
  canWrite(grantedScopes: readonly string[]): { ok: boolean; missing: string[] };

  /**
   * L6 — sosyal profilin organik gönderileri (Modül 7).
   *
   * SAYFA TOKEN'I kullanılıyor, kullanıcı token'ı değil: Meta sayfa
   * içgörülerini yalnızca sayfa token'ıyla veriyor ve o token
   * `SocialProfile.pageAccessTokenEnc` içinde ayrı şifreli duruyor.
   *
   * Google için boş dizi — orada organik gönderi kavramı yok.
   */
  fetchOrganicPosts(params: {
    pageAccessToken: string;
    profileExternalId: string;
    profileType: 'facebook_page' | 'instagram_business';
    /** Bu tarihten sonrasını çek. Verilmezse sağlayıcının varsayılan penceresi. */
    since?: Date;
    onRateLimit?: (snapshot: RateLimitSnapshot) => void | Promise<void>;
  }): Promise<DiscoveredOrganicPost[]>;

  /**
   * Organik gönderiden reklam üretir (Modül 7).
   *
   * `ads_management` gerektiriyor — `canWrite()` önce sorulmalı.
   */
  createBoost(ctx: FetchContext, request: BoostRequest): Promise<BoostResult>;

  /**
   * Görseli reklam hesabına yükler ve hash döner (Modül 4).
   *
   * Meta kreatifte görseli hash ile istiyor, URL ile değil: görselin
   * platformda durması gerekiyor. `name` etiketi
   * `asset_customization_rules` ile eşleşmek zorunda.
   */
  uploadAdImage(ctx: FetchContext, params: { name: string; bytes: Buffer }): Promise<string>;

  /**
   * Taslaktan tam bir reklam üretir (Modül 4).
   *
   * Ara adımlardan biri başarısız olursa öncekiler GERİ ALINMALI: yarım
   * kalmış bir kampanya Ads Manager'ı kirletiyor ve kullanıcı onu elle
   * temizlemek zorunda kalıyor.
   */
  publishDraft(ctx: FetchContext, request: PublishDraftRequest): Promise<PublishDraftResult>;

  /**
   * Kütüphanedeki formu Meta'da oluşturur (Formlar kütüphanesi).
   *
   * DÖNÜŞÜ OLMAYAN BİR İŞLEM. Meta'da oluşan form GÜNCELLENEMİYOR; içeriği
   * değiştirmek yeni bir form oluşturmayı gerektiriyor. Çağıran bunu
   * kullanıcıya söylemeden yayınlamamalı.
   */
  createLeadForm(ctx: FetchContext, request: CreateLeadFormRequest): Promise<string>;

  /**
   * Anahtar kelime performansı — yalnızca Google.
   *
   * Meta boş dizi dönüyor, hata değil: bu bir yetenek farkı, arıza değil.
   * Hata fırlatmak, Meta bağlantısı olan her müşteride senkronizasyonun
   * başarısız görünmesi demek olurdu.
   */
  fetchKeywords(
    ctx: FetchContext,
    request: { dateFrom: string; dateTo: string },
  ): Promise<{ rows: DiscoveredKeywordRow[]; apiCalls: number }>;

  /**
   * Tek bir reklam oluşturur (Modül 8).
   *
   * `ads_management` gerektiriyor. Parti döngüsü çağıranda: her satır ayrı
   * çağrı olduğu için birinin patlaması diğerlerini durdurmuyor.
   */
  createAd(ctx: FetchContext, request: CreateAdRequest): Promise<CreateAdResult>;
}

export const AD_PLATFORM_PROVIDERS = 'AD_PLATFORM_PROVIDERS';
