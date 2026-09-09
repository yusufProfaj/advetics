import { z } from 'zod';

/**
 * Ortam değişkeni şeması.
 *
 * Uygulama, eksik veya hatalı bir env ile AÇILMAZ. "Sunucu ayakta ama JWT
 * secret'ı boş" durumu, sessizce güvensiz çalışan bir sisteme yol açar.
 */
/**
 * BOŞ DİZE = TANIMSIZ.
 *
 * `.env.example` isteğe bağlı satırları `VAR=""` olarak taşıyor — değeri
 * göstermek için değil, satırın VARLIĞINI göstermek için. Ama `z.string()
 * .url()` boş dizeyi GEÇERSİZ sayıyor ve `.optional()` yalnızca `undefined`ı
 * geçiriyor; yani örnek dosyayı olduğu gibi kopyalayan bir sunucuda API HİÇ
 * AÇILMAZDI ve hata mesajı "APP_URL: Invalid url" olurdu — satırı bilerek boş
 * bırakan kişi için anlamsız. Aynı tuzak `.default()` için de var: boş dize
 * "tanımlı" sayıldığı için varsayılan devreye girmiyor.
 */
function bosIseYok<T extends z.ZodTypeAny>(sema: T) {
  return z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), sema);
}

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
  // SİSTEM E-POSTASI
  //
  // Kullanıcının KENDİ SMTP kimliği (`user_email_accounts`) rapor gönderimi
  // için var ve giriş yapmış olmayı gerektiriyor. Şifre sıfırlama maili ise
  // tam olarak GİRİŞ YAPAMAYAN birine gidiyor — o yüzden ayrı, sunucuya ait
  // bir gönderici gerekiyor.
  //
  // HEPSİ OPSİYONEL VE EKSİKLİK AÇILIŞTA PATLAMIYOR. Paylaşımlı sunucuda
  // açılışta hata fırlatmak, yarım yapılandırılmış bir deploy'da API'yi hiç
  // kaldırmamak demek. Eksiklik `mail.eksikSmtpDegiskenleri` ile taşınıyor
  // ve KULLANIM ANINDA, sıfırlama ekranında adıyla söyleniyor.
  // ---------------------------------------------------------------------------
  SMTP_HOST: bosIseYok(z.string().optional()),
  SMTP_PORT: bosIseYok(z.coerce.number().int().min(1).max(65535).default(465)),
  SMTP_SECURE: bosIseYok(
    z
      .string()
      .default('true')
      .transform((v) => v === 'true' || v === '1'),
  ),
  SMTP_USER: bosIseYok(z.string().optional()),
  SMTP_PASS: bosIseYok(z.string().optional()),
  SMTP_FROM_EMAIL: bosIseYok(z.string().email().optional()),
  SMTP_FROM_NAME: bosIseYok(z.string().default('Advetics')),

  /**
   * Panelin DIŞARIDAN görünen kök adresi. Maillerdeki bağlantılar buradan
   * kuruluyor — `localhost` kalırsa kullanıcıya tıklanamayan bir link gider.
   *
   * Verilmezse `OAUTH_REDIRECT_BASE_URL`e düşüyor: ikisi de AYNI paneli
   * gösteriyor ve üretimde o zaten dolu (Meta/Google callback'leri ona
   * bağlı). İki ayrı zorunlu değişken istemek, birinin güncellenip
   * diğerinin unutulduğu klasik ayrışmayı davet ederdi.
   */
  APP_URL: bosIseYok(z.string().url().optional()),

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
   * Leadgen webhook el sıkışma anahtarı.
   *
   * Meta'nın uygulama panelinde girilen sabitle AYNI olmak zorunda. Bizim
   * belirlediğimiz rastgele bir dize; kimlik doğrulamıyor, yalnızca uç
   * noktanın bize ait olduğunu kanıtlıyor. Asıl güvenlik imzada.
   */
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
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

  /*
   * ═══ LINKEDIN ═══
   *
   * Meta/Google gibi OPSİYONEL: uygulamanın onaylı bir ürünü olmadan hiçbir
   * çağrı başarılı olmuyor ve panel onay beklenirken de ayağa kalkmalı.
   * `availability()` eksik anahtarları ekranda LİSTELİYOR.
   */
  LINKEDIN_CLIENT_ID: z.string().optional(),
  LINKEDIN_CLIENT_SECRET: z.string().optional(),

  /*
   * SÜRÜM BAŞLIĞI ZORUNLU VE VARSAYILANI YOK. LinkedIn her istekte
   * `LinkedIn-Version: YYYYMM` bekliyor ve "en yenisi" diye bir davranış
   * uygulamıyor; başlık eksikse istek düşüyor, sürüm ölmüşse HTTP 426
   * dönüyor. Her sürüme yalnızca ~12 ay söz veriliyor, yani bu değer yılda
   * en az bir kez GÜNCELLENMEK ZORUNDA ve bu bir bakım borcu.
   *
   * DEĞER TAKVİMDEN TÜRETİLEMEZ: LinkedIn'in ARALIK SÜRÜMÜ YOK
   * (…202510, 202511, sonra doğrudan 202601). `new Date()`ten ay üreten bir
   * kod her Aralık ayında bütün istekleri düşürürdü. O yüzden sabit ve elle
   * yönetiliyor.
   */
  LINKEDIN_API_VERSION: z.string().regex(/^\d{6}$/, 'LINKEDIN_API_VERSION YYYYMM olmalı').default('202608'),
  /**
   * YouTube Data API v3 anahtarı — Advetics 1.0 bildirim doğrulaması.
   *
   * OAUTH DEĞİL, API ANAHTARI. `videos.list` herkese açık veri okuyor ve
   * kullanıcı adına bir işlem yapmıyor; yeni bir OAuth kapsamı eklemek canlı
   * Google Ads bağlantısının yeniden yetkilendirilmesini gerektirirdi ve
   * CLAUDE.md'ye göre yeniden yetkilendirme daha önce bağlantıları kopardı.
   *
   * İSTEĞE BAĞLI ve bu bilinçli: anahtar yoksa uygulama açılmaya devam
   * ediyor, yalnızca YouTube otomatik boost'u çalışmıyor — ve çalışmadığını
   * SÖYLÜYOR. Zorunlu kılmak, bu özelliği kullanmayan bir kurulumun hiç
   * açılmaması demekti.
   */
  /*
   * `.min(1)` YOK ve bu kasıtlı — `META_APP_ID` ile aynı desen.
   *
   * `.env.example` bu değişkeni BOŞ dizgeyle gönderiyor ve taze bir kopyanın
   * açılması gerekiyor. `.min(1)` eklendiğinde boş dizge şemayı düşürüyor ve
   * uygulama "Ortam değişkenleri geçersiz" ile hiç açılmıyor — yani bu
   * özelliği kullanmayan bir kurulum, kullanmadığı bir anahtar yüzünden
   * çöküyor. Boş dizge zaten falsy; okuyan kod onu "yok" sayıyor.
   */
  YOUTUBE_API_KEY: z.string().optional(),

  /*
   * ═══ AI KAMPANYA ASİSTANI ═══
   *
   * OPSİYONEL — `YOUTUBE_API_KEY` ile aynı desen: anahtar yoksa uygulama
   * açılmaya devam ediyor, yalnızca panel içi sohbet devre dışı kalıyor ve
   * bunu SÖYLÜYOR. Zorunlu kılmak, bu özelliği kullanmayan bir kurulumun
   * (ör. yerel geliştirme) hiç açılmaması demekti.
   *
   * `.min(1)` YOK: `.env.example` boş dizgeyle gönderiyor, boş dizge zaten
   * falsy ve okuyan kod "yok" sayıyor.
   */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Model kimliği elle yönetiliyor — takvimden türetilemez (LinkedIn sürümüyle aynı ders). */
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5'),
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
  /** Sunucunun kendi e-posta göndericisi — şifre sıfırlama gibi oturumsuz akışlar için. */
  mail: {
    /** Maillerdeki bağlantıların kökü. */
    appUrl: string;
    /**
     * Eksiksiz yapılandırılmışsa gönderici kimliği, değilse `null`.
     *
     * TEK KARAR NOKTASI: "SMTP hazır mı" sorusu burada bir kez cevaplanıyor.
     * Her çağıranın alanları tek tek kontrol etmesi, birinin `pass`i
     * unutması ve `undefined` parolayla sessizce başarısız bir gönderim
     * denemesi demekti.
     */
    smtp: {
      host: string;
      port: number;
      secure: boolean;
      user: string;
      pass: string;
      fromEmail: string;
      fromName: string;
    } | null;
    /**
     * `smtp` null ise EKSİK olan ortam değişkenlerinin ADLARI.
     *
     * Boş bir `null` "yapılandırılmamış" ile "yanlış yapılandırılmış"ı aynı
     * sessizliğe çevirirdi; hangi satırın eksik olduğunu söylemek, sunucuya
     * girmeden düzeltilebilir bir arıza demek.
     */
    eksikSmtpDegiskenleri: string[];
  };
  /** Modül 2 — platform kimlik bilgileri. Eksikse ilgili provider devre dışı. */
  platforms: {
    oauthRedirectBaseUrl?: string;
    meta: {
      appId?: string;
      appSecret?: string;
      apiVersion: string;
      webhookVerifyToken?: string;
    };
    google: {
      clientId?: string;
      clientSecret?: string;
      developerToken?: string;
      apiVersion: string;
    };
    linkedin: {
      clientId?: string;
      clientSecret?: string;
      /** `LinkedIn-Version` başlığı — YYYYMM, zorunlu, varsayılanı yok. */
      apiVersion: string;
    };
    /**
     * YouTube — yalnızca OKUMA. Reklam yayını Google Ads bağlantısından
     * gidiyor; bu anahtar bildirimdeki videonun gerçekten o kanala ait
     * olduğunu doğrulamak için.
     */
    youtube: {
      apiKey?: string;
    };
  };
  /** AI kampanya asistanı — anahtar yoksa özellik devre dışı, uygulama yine açılır. */
  aiAssistant: {
    apiKey?: string;
    model: string;
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
    mail: smtpYapilandirmasi(env),
    platforms: {
      oauthRedirectBaseUrl: env.OAUTH_REDIRECT_BASE_URL,
      meta: {
        appId: env.META_APP_ID,
        appSecret: env.META_APP_SECRET,
        apiVersion: env.META_API_VERSION,
        webhookVerifyToken: env.META_WEBHOOK_VERIFY_TOKEN,
      },
      google: {
        clientId: env.GOOGLE_CLIENT_ID,
        clientSecret: env.GOOGLE_CLIENT_SECRET,
        developerToken: env.GOOGLE_ADS_DEVELOPER_TOKEN,
        apiVersion: env.GOOGLE_ADS_API_VERSION,
      },
      linkedin: {
        clientId: env.LINKEDIN_CLIENT_ID,
        clientSecret: env.LINKEDIN_CLIENT_SECRET,
        apiVersion: env.LINKEDIN_API_VERSION,
      },
      youtube: {
        apiKey: env.YOUTUBE_API_KEY,
      },
    },
    aiAssistant: {
      apiKey: env.ANTHROPIC_API_KEY,
      model: env.ANTHROPIC_MODEL,
    },
  };
}

/**
 * SMTP alanlarını TEK YERDE toplayıp eksikleri ADIYLA raporlar.
 *
 * `port`, `secure` ve `fromName` varsayılanlı olduğu için eksik sayılmıyor —
 * eksik listesine girselerdi hiç SMTP kurmamış bir sunucuda mesaj yedi
 * değişken sayar ve okunmaz hâle gelirdi.
 */
function smtpYapilandirmasi(env: {
  SMTP_HOST?: string;
  SMTP_PORT: number;
  SMTP_SECURE: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM_EMAIL?: string;
  SMTP_FROM_NAME: string;
  APP_URL?: string;
  OAUTH_REDIRECT_BASE_URL?: string;
}): AppConfig['mail'] {
  const appUrl = (env.APP_URL ?? env.OAUTH_REDIRECT_BASE_URL ?? 'http://localhost:3000').replace(
    /\/+$/,
    '',
  );

  const zorunlu = {
    SMTP_HOST: env.SMTP_HOST,
    SMTP_USER: env.SMTP_USER,
    SMTP_PASS: env.SMTP_PASS,
    SMTP_FROM_EMAIL: env.SMTP_FROM_EMAIL,
  };
  const eksikSmtpDegiskenleri = Object.entries(zorunlu)
    .filter(([, deger]) => !deger)
    .map(([ad]) => ad);

  if (eksikSmtpDegiskenleri.length > 0) {
    return { appUrl, smtp: null, eksikSmtpDegiskenleri };
  }

  return {
    appUrl,
    smtp: {
      host: zorunlu.SMTP_HOST as string,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      user: zorunlu.SMTP_USER as string,
      pass: zorunlu.SMTP_PASS as string,
      fromEmail: zorunlu.SMTP_FROM_EMAIL as string,
      fromName: env.SMTP_FROM_NAME,
    },
    eksikSmtpDegiskenleri: [],
  };
}

export const CONFIG = 'APP_CONFIG';
