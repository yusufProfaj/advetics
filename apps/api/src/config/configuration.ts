import { z } from 'zod';

/**
 * Ortam değişkeni şeması.
 *
 * Uygulama, eksik veya hatalı bir env ile AÇILMAZ. "Sunucu ayakta ama JWT
 * secret'ı boş" durumu, sessizce güvensiz çalışan bir sisteme yol açar.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

  DATABASE_URL: z.string().url(),
  DIRECT_DATABASE_URL: z.string().url(),
  WORKER_DATABASE_URL: z.string().url(),

  /**
   * Redis bağlantısı. Modül 3'ten itibaren ZORUNLU.
   *
   * DİKKAT — PAYLAŞIMLI SUNUCU: bu Redis'i başka canlı siteler de kullanıyor
   * (db0'da 400+ anahtar). Advetics kendi veritabanı numarasını kullanıyor ve
   * tüm anahtarlarını önekliyor. Redis'in kendi yapılandırmasına dokunmuyoruz.
   */
  REDIS_URL: z.string().url().optional(),
  /** Ayrı Redis veritabanı — diğer sitelerin anahtarlarıyla çakışmayı önler. */
  REDIS_DB: z.coerce.number().int().min(0).max(15).default(3),
  /** BullMQ anahtar öneki. Aynı veritabanını paylaşsak bile izolasyon sağlar. */
  REDIS_KEY_PREFIX: z.string().default('advetics'),

  /**
   * Hesap başına dakikadaki azami API çağrısı — mutlak taban.
   *
   * Asıl sinyal platformun bildirdiği kota yüzdesi; bu sayaç ilk çağrılarda
   * (henüz yüzde bilgisi yokken) ve yüzde bildirmeyen Google için tabanı tutuyor.
   */
  QUOTA_CALLS_PER_MINUTE: z.coerce.number().int().min(1).default(60),

  /**
   * Yüklenen reklam görsellerinin kök dizini.
   *
   * VARSAYILAN PROJE İÇİNDE ve bu bilinçli: sunucuda 11 başka site var ve
   * yazma yetkisi olan bir dizini varsayılan yapmak, o dizinin yanlışlıkla
   * paylaşımlı bir yer olması riskini taşır. Üretimde
   * /home/advetics/uploads olarak veriliyor.
   */
  UPLOAD_DIR: z.string().default('var/uploads'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  /**
   * Dinlenecek arayüz. Varsayılan olarak YALNIZCA localhost.
   *
   * API'ye tek meşru giriş Nginx'tir. 0.0.0.0'a bağlanmak, API'yi güvenlik
   * duvarının insafına bırakır — tek bir yanlış UFW kuralı OAuth token'ları ve
   * müşteri verisini internete açar. Nginx başka bir makinedeyse burayı
   * bilinçli olarak değiştir.
   */
  API_HOST: z.string().default('127.0.0.1'),
  API_GLOBAL_PREFIX: z.string().default('api'),
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET en az 32 karakter olmalı'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET en az 32 karakter olmalı'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  AUTH_COOKIE_DOMAIN: z.string().default('localhost'),
  AUTH_COOKIE_SECURE: z
    .string()
    .default('false')
    .transform((v) => v === 'true' || v === '1'),

  ENCRYPTION_KEY_V1: z.string().min(1),
  ENCRYPTION_ACTIVE_KEY_VERSION: z.coerce.number().int().min(1).default(1),

  // ---------------------------------------------------------------------------
  // Modül 2 — Platform kimlik bilgileri
  //
  // Hepsi OPSİYONEL: uygulama bunlar olmadan da açılır, ilgili platformun
  // "Bağlan" butonu pasif görünür. Böylece Meta App Review / Google Developer
  // Token onayı beklenirken geliştirme durmaz.
  // ---------------------------------------------------------------------------

  /** OAuth callback'lerin döneceği kök adres. Üretimde https://advetics.com */
  OAUTH_REDIRECT_BASE_URL: z.string().url().optional(),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  /**
   * Graph API sürümü. Meta her ~3 ayda yeni sürüm çıkarır ve eskiyi ~2 yılda
   * kapatır. CANLIYA ALMADAN ÖNCE güncel sürümü doğrula:
   * https://developers.facebook.com/docs/graph-api/changelog
   */
  META_API_VERSION: z.string().default('v25.0'),

  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  /** Google Ads API developer token. Basic Access onayı gerekir. */
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  /**
   * Google Ads API sürümü. Yılda ~3 sürüm, eskiler ~1 yılda kapanır.
   * CANLIYA ALMADAN ÖNCE doğrula:
   * https://developers.google.com/google-ads/api/docs/release-notes
   */
  GOOGLE_ADS_API_VERSION: z.string().default('v25'),
});

export type Env = z.infer<typeof envSchema>;

export interface AppConfig {
  env: Env['NODE_ENV'];
  isProduction: boolean;
  port: number;
  host: string;
  globalPrefix: string;
  corsOrigins: string[];
  database: { url: string; directUrl: string; workerUrl: string };
  redis: {
    url?: string;
    db: number;
    keyPrefix: string;
  };
  quota: { callsPerMinute: number };
  uploads: { dir: string };
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: string;
    refreshTtl: string;
  };
  cookie: { domain: string; secure: boolean };
  encryption: { keys: Record<number, string>; activeVersion: number };
  /** Modül 2 — platform kimlik bilgileri. Eksikse ilgili provider devre dışı. */
  platforms: {
    oauthRedirectBaseUrl?: string;
    meta: { appId?: string; appSecret?: string; apiVersion: string };
    google: {
      clientId?: string;
      clientSecret?: string;
      developerToken?: string;
      apiVersion: string;
    };
  };
}

export function loadConfig(): AppConfig {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Ortam değişkenleri geçersiz:\n${issues}\n\n.env dosyanı kontrol et.`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === 'production') {
    if (!env.AUTH_COOKIE_SECURE) {
      throw new Error('Üretimde AUTH_COOKIE_SECURE=true olmalı.');
    }
    if (env.JWT_ACCESS_SECRET.includes('degistir') || env.JWT_REFRESH_SECRET.includes('degistir')) {
      throw new Error('Üretimde varsayılan JWT secret değerleri kullanılamaz.');
    }
  }

  return {
    env: env.NODE_ENV,
    isProduction: env.NODE_ENV === 'production',
    port: env.API_PORT,
    host: env.API_HOST,
    globalPrefix: env.API_GLOBAL_PREFIX,
    corsOrigins: env.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    database: {
      url: env.DATABASE_URL,
      directUrl: env.DIRECT_DATABASE_URL,
      workerUrl: env.WORKER_DATABASE_URL,
    },
    redis: {
      url: env.REDIS_URL,
      db: env.REDIS_DB,
      keyPrefix: env.REDIS_KEY_PREFIX,
    },
    quota: { callsPerMinute: env.QUOTA_CALLS_PER_MINUTE },
    uploads: { dir: env.UPLOAD_DIR },
    jwt: {
      accessSecret: env.JWT_ACCESS_SECRET,
      refreshSecret: env.JWT_REFRESH_SECRET,
      accessTtl: env.JWT_ACCESS_TTL,
      refreshTtl: env.JWT_REFRESH_TTL,
    },
    cookie: {
      domain: env.AUTH_COOKIE_DOMAIN,
      secure: env.AUTH_COOKIE_SECURE,
    },
    encryption: {
      keys: { 1: env.ENCRYPTION_KEY_V1 },
      activeVersion: env.ENCRYPTION_ACTIVE_KEY_VERSION,
    },
    platforms: {
      oauthRedirectBaseUrl: env.OAUTH_REDIRECT_BASE_URL,
      meta: {
        appId: env.META_APP_ID,
        appSecret: env.META_APP_SECRET,
        apiVersion: env.META_API_VERSION,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
        apiVersion: env.GOOGLE_ADS_API_VERSION,
      },
    },
  };
}

export const CONFIG = 'APP_CONFIG';
