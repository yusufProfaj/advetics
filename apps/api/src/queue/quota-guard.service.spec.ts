import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../config/configuration';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import { QuotaGuardService } from './quota-guard.service';

/**
 * Kota bekçisi davranış testleri.
 *
 * NEDEN BU TEST VAR: bu mantık geliştirme sırasında ÜÇ gerçek hata üretti.
 *   1. Kural aksiyonları için kota rezervi hiç yoktu — adaptif eşik izin
 *      verse bile dakikalık sayaç bütçe değişikliğini reddediyordu.
 *   2. Rezerv eklendikten sonra sayaç PAYLAŞIMLI olduğu için rezerv işe
 *      yaramadı: sınırı aşan sync denemeleri de sayacı artırıyor, sayaç
 *      öncelikli limiti de geçiyordu.
 *   3. `tripBreaker` kota yüzdesini %100'e çiviliyordu ve bu değer breaker'dan
 *      uzun yaşıyordu — 15 dakikalık blok 2 saatlik kilitlenmeye dönüşüyordu.
 *
 * Üçü de SESSİZ hatalar: sistem çalışmaya devam ediyor, log'da bir şey yok,
 * yalnızca müşterinin bütçesi zamanında değişmiyor. Bu yüzden regresyon testi
 * şart — bu davranışları göz kontrolüyle fark etmek imkânsız.
 *
 * Redis yerine `ioredis-mock`: test edilen şey Redis değil, bizim karar
 * mantığımız.
 */
vi.mock('ioredis', async () => {
  const RedisMock = (await import('ioredis-mock')).default;
  return { default: RedisMock };
});

/** callsPerMinute=10 seçildi: %65/%35 bölünmesi tam sayıya oturuyor (6 + 4). */
const CALLS_PER_MINUTE = 10;

/**
 * Her test için benzersiz hesap kimliği.
 *
 * `ioredis-mock` verisini instance'lar ARASINDA paylaşıyor — yeni bir servis
 * kurmak sayaçları sıfırlamıyor. İzolasyonu sağlayan şey anahtarın kendisi,
 * bu yüzden hesap kimliği her testte farklı olmalı.
 */
let seq = 0;
const acct = (): string => `acct-${++seq}`;

function makeGuard(): { guard: QuotaGuardService; logged: Array<Record<string, unknown>> } {
  const logged: Array<Record<string, unknown>> = [];
  const config = {
    redis: { url: 'redis://127.0.0.1:6379', db: 3, keyPrefix: 'advetics' },
    quota: { callsPerMinute: CALLS_PER_MINUTE },
  } as unknown as AppConfig;
  const db = {
    apiUsageLog: {
      create: async (args: { data: Record<string, unknown> }) => {
        logged.push(args.data);
        return args.data;
      },
    },
  } as unknown as PrismaAdminService;

  return { guard: new QuotaGuardService(config, db), logged };
}

/** Platformun bildirdiği kota yüzdesini servise işler. */
async function setUsage(
  guard: QuotaGuardService,
  adAccountId: string,
  usagePercent: number,
  extra: Record<string, number> = {},
): Promise<void> {
  await guard.record({
    platform: 'meta',
    adAccountId,
    endpoint: '/insights',
    snapshot: { usagePercent, observedAt: new Date().toISOString(), ...extra },
  });
}

describe('QuotaGuardService', () => {
  let guard: QuotaGuardService;
  let logged: Array<Record<string, unknown>>;

  beforeEach(() => {
    ({ guard, logged } = makeGuard());
  });

  describe('adaptif eşik', () => {
    it('kota bilinmiyorken tüm katmanlara izin verir', async () => {
      const id = acct();
      for (const layer of ['initial_backfill', 'insights_daily', 'rule_action'] as const) {
        const r = await guard.acquire({ platform: 'meta', adAccountId: id, layer });
        expect(r.allowed, `${layer} reddedildi: ${r.reason}`).toBe(true);
      }
    });

    it('%65 kotada pahalı katmanları keser, çekirdeği çalıştırır', async () => {
      const id = acct();
      await setUsage(guard, id, 65);

      const breakdown = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'insights_breakdown',
      });
      expect(breakdown.allowed).toBe(false);
      expect(breakdown.reason).toContain('exceeds_layer_limit_60');

      const daily = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'insights_daily',
      });
      expect(daily.allowed).toBe(true);
    });

    it('%92 kotada okumayı keser ama bütçe aksiyonunu geçirir', async () => {
      const id = acct();
      await setUsage(guard, id, 92);

      const daily = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'insights_daily',
      });
      expect(daily.allowed).toBe(false);

      // Kritik: bütçe artıramamak, veri güncellenememekten pahalı.
      const rule = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'rule_action',
      });
      expect(rule.allowed, `rule_action reddedildi: ${rule.reason}`).toBe(true);
    });
  });

  describe('dakikalık sayaç ve kota rezervi', () => {
    it('sync katmanı bütçenin yalnızca %65ini kullanabilir', async () => {
      const id = acct();
      let allowed = 0;
      for (let i = 0; i < CALLS_PER_MINUTE + 4; i++) {
        const r = await guard.acquire({
          platform: 'google',
          adAccountId: id,
          layer: 'insights_daily',
        });
        if (r.allowed) allowed++;
      }
      expect(allowed).toBe(Math.floor(CALLS_PER_MINUTE * 0.65));
    });

    it('REGRESYON: sync bütçesi tükendiğinde rule_action YİNE geçer', async () => {
      const id = acct();
      // Sync kovasını taşırana kadar doldur.
      for (let i = 0; i < CALLS_PER_MINUTE + 2; i++) {
        await guard.acquire({ platform: 'meta', adAccountId: id, layer: 'insights_daily' });
      }
      const sync = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'insights_daily',
      });
      expect(sync.allowed, 'sync kovası dolmalıydı').toBe(false);

      // Rezerv dokunulmamış olmalı: bu iddia iki kez kırıldı.
      const rule = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'rule_action',
      });
      expect(rule.allowed, `rezerv tükenmiş: ${rule.reason}`).toBe(true);

      const interactive = await guard.acquire({
        platform: 'meta',
        adAccountId: id,
        layer: 'interactive',
      });
      expect(interactive.allowed, `rezerv tükenmiş: ${interactive.reason}`).toBe(true);
    });

    it('kota yükseldikçe dakikalık hız kendiliğinden düşer', async () => {
      const count = async (id: string, usage: number): Promise<number> => {
        const g = makeGuard().guard;
        await setUsage(g, id, usage);
        let n = 0;
        for (let i = 0; i < CALLS_PER_MINUTE + 4; i++) {
          const r = await g.acquire({ platform: 'meta', adAccountId: id, layer: 'insights_daily' });
          if (r.allowed) n++;
        }
        return n;
      };

      // %60 altı tam bütçe, %60+ yarı, %75+ çeyrek — sonra %65 sync payı.
      const normal = await count('n', 10);
      const half = await count('h', 65);
      const quarter = await count('q', 78);

      expect(normal).toBeGreaterThan(half);
      expect(half).toBeGreaterThan(quarter);
      expect(quarter).toBeGreaterThanOrEqual(1);
    });

    it('hesaplar birbirinin bütçesini tüketmez', async () => {
      const dolu = acct();
      for (let i = 0; i < CALLS_PER_MINUTE + 4; i++) {
        await guard.acquire({ platform: 'meta', adAccountId: dolu, layer: 'insights_daily' });
      }
      const other = await guard.acquire({
        platform: 'meta',
        adAccountId: acct(),
        layer: 'insights_daily',
      });
      expect(other.allowed).toBe(true);
    });

    it('aynı hesap kimliği farklı platformlarda ayrı sayılır', async () => {
      const shared = acct();
      for (let i = 0; i < CALLS_PER_MINUTE + 4; i++) {
        await guard.acquire({ platform: 'meta', adAccountId: shared, layer: 'insights_daily' });
      }
      const google = await guard.acquire({
        platform: 'google',
        adAccountId: shared,
        layer: 'insights_daily',
      });
      expect(google.allowed).toBe(true);
    });
  });

  describe('circuit breaker', () => {
    it('açıkken rule_action bile reddedilir', async () => {
      const id = acct();
      await guard.tripBreaker('meta', id, 900);
      const r = await guard.acquire({ platform: 'meta', adAccountId: id, layer: 'rule_action' });
      expect(r.allowed).toBe(false);
      expect(r.reason).toBe('circuit_breaker_open');
      // İş bu süre kadar geciktirilmeli; erken dönmek bloğu uzatır.
      expect(r.retryAfterMs).toBeGreaterThan(890_000);
      expect(r.retryAfterMs).toBeLessThanOrEqual(900_000);
    });

    it('REGRESYON: blok kalktığında kesinti kendiliğinden bitmeli', async () => {
      // Bu iddia bir kilitlenmeyi koruyor: tripBreaker eskiden usagePercent=100
      // de yazıyordu ve bunun TTL'i breaker süresinden uzundu. Blok kalktıktan
      // sonra %100 durduğu için tüm katmanlar eşikten reddediliyor, çağrı
      // yapılamadığı için yeni yüzde öğrenilemiyordu — hesap saatlerce ölü.
      const id = acct();
      await guard.tripBreaker('meta', id, -10); // geçmişte bitmiş blok

      const state = await guard.getState('meta', id);
      expect(state.blockedUntil, 'blok kalkmış olmalı').toBeNull();
      expect(state.usagePercent, 'breaker yüzdeyi %100e çivilememeli').toBeLessThan(98);

      const rule = await guard.acquire({ platform: 'meta', adAccountId: id, layer: 'rule_action' });
      expect(rule.allowed, `kilitlenme: ${rule.reason}`).toBe(true);
    });

    it('yalnızca ilgili hesabı durdurur', async () => {
      await guard.tripBreaker('meta', acct(), 900);
      const other = await guard.acquire({
        platform: 'meta',
        adAccountId: acct(),
        layer: 'insights_daily',
      });
      expect(other.allowed).toBe(true);
    });

    it('süre geçmişse tekrar izin verir', async () => {
      const id = acct();
      // Negatif süre = geçmişte biten blok.
      await guard.tripBreaker('meta', id, -10);
      const r = await guard.acquire({ platform: 'meta', adAccountId: id, layer: 'rule_action' });
      expect(r.allowed).toBe(true);
    });
  });

  describe('telemetri', () => {
    it("Meta'nın üç yüzdesinden EN YÜKSEĞİ karar verir", async () => {
      // Bu, mimarinin açık bir kararı: biri %100'e ulaşınca hesap bloklanıyor,
      // yani ortalama değil maksimum belirleyici.
      const id = acct();
      await setUsage(guard, id, 88, { callCountPct: 12, cpuTimePct: 88, totalTimePct: 40 });
      const state = await guard.getState('meta', id);
      expect(state.usagePercent).toBe(88);
    });

    it('üç yüzdeyi api_usage_log tablosuna ayrı ayrı yazar', async () => {
      await setUsage(guard, acct(), 88, { callCountPct: 12, cpuTimePct: 88, totalTimePct: 40 });
      const row = logged.find((r) => r.usagePercent === 88);
      expect(row).toBeDefined();
      expect(row?.cpuTimePct).toBe(88);
      expect(row?.callCountPct).toBe(12);
      expect(row?.totalTimePct).toBe(40);
    });

    it('tablo yazımı hata verse bile akış durmaz', async () => {
      const config = {
        redis: { url: 'redis://127.0.0.1:6379', db: 3, keyPrefix: 'advetics' },
        quota: { callsPerMinute: CALLS_PER_MINUTE },
      } as unknown as AppConfig;
      const brokenDb = {
        apiUsageLog: {
          create: async () => {
            throw new Error('veritabanı düştü');
          },
        },
      } as unknown as PrismaAdminService;
      const g = new QuotaGuardService(config, brokenDb);

      // Telemetri kaybı, senkronizasyonu durdurmaktan iyidir.
      const id = acct();
      await expect(setUsage(g, id, 50)).resolves.toBeUndefined();
      const r = await g.acquire({ platform: 'meta', adAccountId: id, layer: 'insights_daily' });
      expect(r.allowed).toBe(true);
    });
  });

  describe('REDIS_URL tanımlı değilken', () => {
    /**
     * API, Redis olmadan da AYAKTA KALMALI. Kuyruk çalışmaması bir arıza;
     * giriş ve dashboard'un komple kapanması felaket.
     */
    const noRedisConfig = {
      redis: { url: undefined, db: 3, keyPrefix: 'advetics' },
      quota: { callsPerMinute: CALLS_PER_MINUTE },
    } as unknown as AppConfig;
    const db = {} as unknown as PrismaAdminService;

    it('constructor fırlatmaz', () => {
      expect(() => new QuotaGuardService(noRedisConfig, db)).not.toThrow();
    });

    it('isEnabled false, ping false döner', async () => {
      const g = new QuotaGuardService(noRedisConfig, db);
      expect(g.isEnabled).toBe(false);
      expect(await g.ping()).toBe(false);
    });

    it('kullanılmaya çalışılınca .env düzeltmesini söyleyen hata verir', async () => {
      const g = new QuotaGuardService(noRedisConfig, db);
      await expect(
        g.acquire({ platform: 'meta', adAccountId: 'a', layer: 'structure' }),
      ).rejects.toThrow(/REDIS_URL/);
    });

    it('kapanış temiz', async () => {
      const g = new QuotaGuardService(noRedisConfig, db);
      await expect(g.onModuleDestroy()).resolves.toBeUndefined();
    });
  });

  describe('katman limitleri', () => {
    it('rule_action en yüksek, initial_backfill en düşük eşiğe sahip', () => {
      const limits = QuotaGuardService.layerLimits();
      expect(limits.rule_action).toBeGreaterThan(limits.interactive);
      expect(limits.interactive).toBeGreaterThan(limits.insights_daily);
      expect(limits.insights_daily).toBeGreaterThan(limits.insights_backfill);
      expect(limits.insights_backfill).toBeGreaterThan(limits.initial_backfill);
    });
  });
});
