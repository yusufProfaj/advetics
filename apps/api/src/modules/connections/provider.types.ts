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
  assetUrls?: unknown;
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
// Adapter
// -----------------------------------------------------------------------------

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
}

export const AD_PLATFORM_PROVIDERS = 'AD_PLATFORM_PROVIDERS';
