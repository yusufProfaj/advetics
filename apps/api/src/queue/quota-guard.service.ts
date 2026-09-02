import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import type { Platform } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../config/configuration';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import type { RateLimitSnapshot } from '../modules/connections/provider.types';

/**
 * Adaptif kota bekçisi.
 *
 * Bu sınıf mimarinin en önemli tek kararını uygular: HİÇBİR API çağrısı kota
 * kontrolünden geçmeden yapılmaz. Meta'nın Business Use Case kotası hesap
 * bazlıdır ve %100'e ulaşınca hesap DAKİKALARCA bloklanır — o hesabın tüm
 * senkronizasyonu ve kural aksiyonları durur.
 *
 * İki katmanlı savunma:
 *
 *   1. SABİT TABAN — dakikadaki çağrı sayacı. Platform henüz yüzde bildirmemişse
 *      (ilk çağrı) veya hiç bildirmiyorsa (Google) tek koruma bu.
 *   2. ADAPTİF EŞİK — platformun bildirdiği kota yüzdesi. Meta üç ayrı yüzde
 *      döndürüyor (call_count / total_cputime / total_time); en yüksek olan
 *      belirleyicidir, çünkü biri %100'e ulaşınca hesap bloklanır.
 *
 * Katman öncelikleri: kota daraldıkça düşük değerli işler önce kesilir.
 * Kural aksiyonları EN SON kesilir — kota bittiği için bütçe artıramamak,
 * veri güncellenememekten çok daha pahalıdır.
 */

/** Kotanın hangi iş türlerine izin verdiğini belirleyen katman. */
export type QuotaLayer =
  /** Kullanıcının beklediği işlem — "şimdi yenile" butonu. */
  | 'interactive'
  /** Modül 5 kural aksiyonu — bütçe/durum değiştirme. */
  | 'rule_action'
  /** L1 yapı senkronizasyonu. */
  | 'structure'
  /** L2 sıcak metrikler. */
  | 'insights_realtime'
  /** L3 günlük tam metrikler. */
  | 'insights_daily'
  /** L4 geri düzeltme. */
  | 'insights_backfill'
  /** L5 kırılımlar. */
  | 'insights_breakdown'
  /** L6 organik post metrikleri. */
  | 'organic_posts'
  /** L7 ilk backfill. */
  | 'initial_backfill'
  /**
   * Rapor için kreatif görselinin TAZE adresi.
   *
   * Kendi katmanı, çünkü bu trafiğin iki özelliği başka hiçbir katmana
   * benzemiyor: (1) ANONİM tetiklenebiliyor — paylaşım bağlantısı `@Public()`
   * ve linki tarayan bir bot her yüklemede platforma çıkarır; (2) eksik bir
   * kreatif görseli KOZMETİK, oysa kotayı %90'ın üstüne çıkarmak yapı
   * taramasını da reddettirip hesabı KALICI KİLİDE sokuyor. Yani bu iş,
   * kesilecek ilk şey olmalı.
   */
  | 'report_creative';

/**
 * Kota tüketim yüzdesine göre hangi katmanların çalışabileceği.
 *
 * Eşikler mimari dokümandan: %60 altı normal, %60-75 düşük değerliler durur,
 * %75-90 yalnızca çekirdek, %90 üstü yalnızca yazma aksiyonları.
 */
const LAYER_MAX_USAGE: Record<QuotaLayer, number> = {
  // Kullanıcı ekranda bekliyor ve kural aksiyonu para harcıyor — en son kesilir.
  rule_action: 98,
  interactive: 95,
  // Çekirdek okuma: dashboard'un anlamlı kalması buna bağlı.
  structure: 90,
  insights_realtime: 90,
  insights_daily: 90,
  // Geri düzeltme bir gün gecikebilir.
  insights_backfill: 75,
  organic_posts: 75,
  // En pahalı ve en az acil olanlar ilk kesilenler.
  insights_breakdown: 60,
  initial_backfill: 60,
  /*
   * EN DÜŞÜK TAVAN. Anonim bir paylaşım bağlantısından tetiklenebilen tek
   * platform trafiği bu; bir bot ya da meraklı bir ziyaretçi sayfayı tekrar
   * tekrar yükleyerek hesabın kotasını yakarsa YAPI TARAMASI da reddedilir ve
   * hesap kendi kendini kilitler. Kozmetik bir eksik uğruna alınacak risk
   * değil — %50'nin üstünde bu iş hiç yapılmıyor, rapor saklanmış adresle
   * çıkıyor ve sebebi belgede yazıyor.
   */
  report_creative: 50,
};

/**
 * Kota durumunun Redis'te yaşama süresi.
 *
 * Aynı zamanda sistemin kendini toparlama yolu: süre dolunca yüzde bilinmiyor
 * sayılır ve bir yoklama çağrısı gider. Bkz. `record()`.
 */
const STATE_TTL_SECONDS = 600;

export interface AcquireResult {
  allowed: boolean;
  /** Reddedildiyse ne kadar sonra tekrar denenmeli. */
  retryAfterMs?: number;
  reason?: string;
  /** Son bilinen kota yüzdesi — log ve teşhis için. */
  usagePercent?: number;
}

@Injectable()
export class QuotaGuardService implements OnModuleDestroy {
  private readonly logger = new Logger(QuotaGuardService.name);
  private readonly client: Redis | null;
  private readonly prefix: string;

  constructor(
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly db: PrismaAdminService,
  ) {
    const { url, db: dbIndex, keyPrefix } = config.redis;
    this.prefix = `${keyPrefix}:quota`;

    // REDIS_URL yoksa AÇILIŞTA FIRLATMIYORUZ.
    //
    // Bu servis global AppModule ağacında; constructor'da fırlatmak Redis
    // erişilemediğinde tüm API'yi — giriş, dashboard, raporlar — düşürüyordu.
    // Kuyruk çalışmaması bir arıza; panelin komple kapanması felaket.
    //
    // Bunun yerine kota kullanılmaya çalışıldığında net bir hata veriyoruz.
    // Worker ayrı davranıyor: Redis'siz worker anlamsız olduğu için açılışta
    // ping başarısız olursa süreç ölüyor (bkz. worker.ts).
    if (!url) {
      this.logger.warn(
        'REDIS_URL tanımlı değil — senkronizasyon kuyruğu ve kota bekçisi devre dışı. ' +
          'API çalışmaya devam ediyor, veri senkronizasyonu yapılmıyor.',
      );
      this.client = null;
    } else {
      // PAYLAŞIMLI REDIS: ayrı veritabanı numarası + anahtar öneki. Diğer
      // sitelerin anahtarlarına dokunmuyoruz.
      this.client = new Redis(url, { db: dbIndex, maxRetriesPerRequest: null });
    }
  }

  /** Kota altyapısı kullanılabilir mi — controller'lar buna göre 503 döner. */
  get isEnabled(): boolean {
    return this.client !== null;
  }

  private get redis(): Redis {
    if (!this.client) {
      throw new Error(
        'REDIS_URL tanımlı değil — kota bekçisi çalışamaz. Sunucudaki .env dosyasına ' +
          'REDIS_URL, REDIS_DB ve REDIS_KEY_PREFIX ekleyin (bkz. .env.example).',
      );
    }
    return this.client;
  }

  async onModuleDestroy(): Promise<void> {
    if (!this.client) return;
    await this.client.quit().catch(() => this.client?.disconnect());
  }

  private stateKey(platform: Platform, adAccountId: string): string {
    return `${this.prefix}:state:${platform}:${adAccountId}`;
  }

  /**
   * Dakikalık pencere sayacı — AYRI KOVA.
   *
   * `bucket` iki değer alıyor: 's' (senkronizasyon) ve 'p' (öncelikli).
   *
   * Neden ayrı: tek sayaçla rezerv çalışmıyor. Sınırı aşan sync denemeleri de
   * sayacı artırıyor (geri almak yarış koşulu yaratır), böylece sayaç öncelikli
   * katmanın limitini de aşıyor ve kural aksiyonu — kendi bütçesi boş olmasına
   * rağmen — reddediliyor. Ayrı kovada sync'in kendi sayacını şişirmesi
   * zararsız: o kova zaten kapanmış, öncelikli kova dokunulmamış duruyor.
   */
  private callKey(platform: Platform, adAccountId: string, bucket: 's' | 'p'): string {
    const minute = Math.floor(Date.now() / 60_000);
    return `${this.prefix}:calls:${bucket}:${platform}:${adAccountId}:${minute}`;
  }

  /**
   * API çağrısı yapılabilir mi?
   *
   * Reddedilirse çağıran işi KUYRUĞA GERİ KOYMALI, worker'ı bloklamamalı.
   * Beklemek, o worker slotunu başka hesapların işlerine kapatır.
   */
  async acquire(params: {
    platform: Platform;
    adAccountId: string;
    layer: QuotaLayer;
  }): Promise<AcquireResult> {
    const { platform, adAccountId, layer } = params;

    // 1) Circuit breaker açık mı — platform bizi bloklamış.
    const state = await this.redis.hgetall(this.stateKey(platform, adAccountId));
    const blockedUntil = Number(state.blockedUntil ?? 0);
    if (blockedUntil > Date.now()) {
      return {
        allowed: false,
        retryAfterMs: blockedUntil - Date.now(),
        reason: 'circuit_breaker_open',
        usagePercent: Number(state.usagePercent ?? 0),
      };
    }

    // 2) Adaptif eşik — katmanın izin verilen üst sınırı.
    const usagePercent = Number(state.usagePercent ?? 0);
    const maxForLayer = LAYER_MAX_USAGE[layer];
    if (usagePercent >= maxForLayer) {
      // Kota penceresi tipik olarak saatlik yenilenir; 5 dakika sonra tekrar
      // bakmak makul bir denge.
      return {
        allowed: false,
        retryAfterMs: 5 * 60_000,
        reason: `usage_${usagePercent}pct_exceeds_layer_limit_${maxForLayer}`,
        usagePercent,
      };
    }

    // 3) Sabit taban — dakikadaki çağrı sayısı.
    //
    // Eşik, kota daraldıkça küçülüyor: %60 üstünde yarıya, %75 üstünde çeyreğe.
    // Böylece yüzde yükselirken hız kendiliğinden düşüyor ve duvara çarpmadan
    // yavaşlıyoruz.
    let perMinute = this.config.quota.callsPerMinute;
    if (usagePercent >= 75) perMinute = Math.max(1, Math.floor(perMinute / 4));
    else if (usagePercent >= 60) perMinute = Math.max(1, Math.floor(perMinute / 2));

    // KOTA REZERVİ — bütçe iki kovaya bölünüyor.
    //
    // Senkronizasyon %65'ini, kullanıcının beklediği ve para harcayan işler
    // kalan %35'ini kullanıyor. Toplam hiçbir zaman `perMinute`ı aşmıyor ama
    // sync ne kadar tüketirse tüketsin öncelikli kova dokunulmamış kalıyor.
    //
    // Bütçe artıramamak, veri güncellenememekten çok daha pahalı.
    const SYNC_SHARE = 0.65;
    const isPriority = layer === 'rule_action' || layer === 'interactive';
    const syncLimit = Math.max(1, Math.floor(perMinute * SYNC_SHARE));
    const effectiveLimit = isPriority ? Math.max(1, perMinute - syncLimit) : syncLimit;

    const key = this.callKey(platform, adAccountId, isPriority ? 'p' : 's');
    const count = await this.redis.incr(key);
    if (count === 1) {
      // İlk artıştan sonra süre veriyoruz; 120s pencerenin kaymasına tolerans.
      await this.redis.expire(key, 120);
    }

    if (count > effectiveLimit) {
      // Sayacı geri almıyoruz: bu pencerede zaten sınırı aştık, geri almak
      // yarış koşulunda sınırı aşmaya izin verirdi.
      const msToNextMinute = 60_000 - (Date.now() % 60_000);
      return {
        allowed: false,
        retryAfterMs: msToNextMinute + 1_000,
        reason: `rate_limit_${count}/${effectiveLimit}_per_minute_${isPriority ? 'priority' : 'sync'}`,
        usagePercent,
      };
    }

    return { allowed: true, usagePercent };
  }

  /**
   * Çağrı sonrasında gözlemlenen kotayı kaydeder.
   *
   * Hem Redis durumunu (hızlı karar için) hem `api_usage_log` tablosunu
   * (geçmiş ve teşhis için) günceller. Tablo yazımı hata verirse akış
   * durmaz — telemetri kaybı, senkronizasyonu durdurmaktan iyidir.
   */
  async record(params: {
    platform: Platform;
    adAccountId?: string | null;
    clientId?: string | null;
    endpoint: string;
    snapshot?: RateLimitSnapshot;
    httpStatus?: number;
    errorCode?: string;
    latencyMs?: number;
  }): Promise<void> {
    const { platform, adAccountId, snapshot } = params;

    if (adAccountId && snapshot?.usagePercent !== undefined) {
      const key = this.stateKey(platform, adAccountId);
      await this.redis.hset(key, {
        usagePercent: String(Math.round(snapshot.usagePercent)),
        observedAt: snapshot.observedAt,
      });
      // Kota penceresi saatlik; durumu 2 saat tutmak bayat veriyle karar
      // vermeyi engelliyor. Süre dolarsa yüzde 0 kabul edilir ve normal hıza
      // dönülür — platform yeni yüzdeyi ilk çağrıda bildiriyor.
      // TTL, KURTARMA MEKANİZMASIDIR — yalnızca bayatlık koruması değil.
      //
      // Platform %100 bildirirse hiçbir katman çalışamaz (en yüksek eşik %98).
      // Çağrı yapılamayınca yeni yüzde de öğrenilemez. Tek çıkış yolu bu
      // anahtarın süresinin dolması: süre dolduğunda yüzde 0 kabul edilir,
      // bir çağrı gider ve platform güncel yüzdeyi bildirir.
      //
      // Bu yüzden 10 dakika. Önce 2 saatti ve kotası dolan bir hesap 15
      // dakikalık bir bloktan sonra 2 saat boyunca kilitli kalıyordu.
      await this.redis.expire(key, STATE_TTL_SECONDS);

      if (snapshot.usagePercent >= 95) {
        this.logger.error(
          `Kota kritik: ${platform} hesap ${adAccountId} → %${Math.round(snapshot.usagePercent)}`,
        );
      } else if (snapshot.usagePercent >= 75) {
        this.logger.warn(
          `Kota yükseliyor: ${platform} hesap ${adAccountId} → %${Math.round(snapshot.usagePercent)}`,
        );
      }
    }

    try {
      await this.db.apiUsageLog.create({
        data: {
          platform,
          clientId: params.clientId ?? null,
          adAccountId: adAccountId ?? null,
          endpoint: params.endpoint.slice(0, 255),
          callCountPct: snapshot?.callCountPct ?? null,
          cpuTimePct: snapshot?.cpuTimePct ?? null,
          totalTimePct: snapshot?.totalTimePct ?? null,
          usagePercent:
            snapshot?.usagePercent !== undefined ? Math.round(snapshot.usagePercent) : null,
          operationsUsed: snapshot?.operationsUsed ?? null,
          httpStatus: params.httpStatus ?? null,
          errorCode: params.errorCode?.slice(0, 80) ?? null,
          latencyMs: params.latencyMs ?? null,
        },
      });
    } catch (err) {
      this.logger.warn(`api_usage_log yazılamadı: ${err instanceof Error ? err.message : err}`);
    }
  }

  /**
   * Circuit breaker'ı açar — platform bizi rate limit'ledi.
   *
   * Bu hesabın TÜM işleri süre boyunca durur. Kesinti hesap bazlıdır: bir
   * müşterinin kotasını tüketmesi diğerlerinin senkronizasyonunu yavaşlatmaz.
   */
  async tripBreaker(
    platform: Platform,
    adAccountId: string,
    seconds = 900,
  ): Promise<void> {
    const key = this.stateKey(platform, adAccountId);
    const until = Date.now() + seconds * 1000;
    // YALNIZCA blockedUntil yazıyoruz.
    //
    // Önce `usagePercent: '100'` de yazılıyordu ve bu, breaker'ın kendisinden
    // uzun yaşıyordu: blok kalktıktan sonra %100 durduğu için tüm katmanlar
    // eşikten reddediliyor, çağrı yapılamadığı için yeni yüzde öğrenilemiyor
    // ve hesap saatlerce kilitli kalıyordu. Bloğu blockedUntil zaten
    // sağlıyor; yüzdeyi tekrarlamak kesintiyi uzatmaktan başka iş yapmıyor.
    // %100'e ulaşıldığı bilgisi `api_usage_log`'ta duruyor.
    await this.redis.hset(key, { blockedUntil: String(until) });
    // Durum, breaker'dan uzun yaşamamalı.
    await this.redis.expire(key, Math.max(seconds + 60, STATE_TTL_SECONDS));
    this.logger.error(
      `Circuit breaker açıldı: ${platform} hesap ${adAccountId}, ${seconds}s boyunca tüm işler durdu`,
    );
  }

  /** Teşhis ve sağlık kontrolü için mevcut durum. */
  async getState(
    platform: Platform,
    adAccountId: string,
  ): Promise<{ usagePercent: number; blockedUntil: number | null; observedAt: string | null }> {
    const s = await this.redis.hgetall(this.stateKey(platform, adAccountId));
    const blockedUntil = Number(s.blockedUntil ?? 0);
    return {
      usagePercent: Number(s.usagePercent ?? 0),
      blockedUntil: blockedUntil > Date.now() ? blockedUntil : null,
      observedAt: s.observedAt ?? null,
    };
  }

  /** Bağlantı sağlığı — worker açılışında Redis'in gerçekten erişilebilir olduğunu doğrular. */
  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  /** Hangi katmanın hangi yüzdeye kadar çalıştığı — UI'da göstermek için. */
  static layerLimits(): Record<QuotaLayer, number> {
    return { ...LAYER_MAX_USAGE };
  }
}
