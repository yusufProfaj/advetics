import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import type { ProviderRegistry } from '../modules/connections/provider.registry';
import type { TokenVaultService } from '../modules/connections/token-vault.service';
import {
  PlatformApiError,
  type DiscoveredInsightRow,
  type FetchContext,
  type IAdPlatformProvider,
  type InsightsRequest,
  type PlatformInsights,
} from '../modules/connections/provider.types';
import type { QuotaGuardService } from './quota-guard.service';
import { InsightsSyncService } from './insights-sync.service';

/**
 * InsightsSyncService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * Test edilen şey ham SQL ve PARTITION davranışı; hiçbiri TypeScript
 * tarafından görülmüyor:
 *
 *   · `insights_daily` aylık RANGE partition'lı. Partition yoksa yazma
 *     "no partition of relation found for row" ile düşüyor ve mesaj sebebi
 *     hiç anlatmıyor.
 *   · Doğal birincil anahtar (date, entity_level, entity_id, breakdown_key)
 *     üzerinden `ON CONFLICT`. Hedef yanlışsa mükerrer satır oluşuyor ve
 *     harcama İKİ KEZ toplanıyor — sessiz ve pahalı.
 *   · `breakdown_key` boş string, NULL DEĞİL: NULL birincil anahtarda hiçbir
 *     zaman eşleşmiyor, yani her senkronizasyon yeni satır yazardı.
 *   · Dış kimlik → iç UUID eşlemesi. Eşlenemeyen satır yazılamıyor.
 */

let h: Harness;
let provider: IAdPlatformProvider & {
  rowsByLevel: Partial<Record<string, DiscoveredInsightRow[]>>;
  complete: boolean;
  requests: InsightsRequest[];
  throwOn?: PlatformApiError;
};
let breakers: Array<{ platform: string; account: string; seconds: number }>;
let svc: InsightsSyncService;

const CAMPAIGN_EXT = 'c1';
const GROUP_EXT = 'g1';
const AD_EXT = 'a1';

function row(over: Partial<DiscoveredInsightRow> = {}): DiscoveredInsightRow {
  return {
    entityExternalId: CAMPAIGN_EXT,
    level: 'campaign',
    date: '2026-08-05',
    currency: 'TRY',
    impressions: 1000,
    clicks: 50,
    spendMicros: 123_450_000n,
    conversions: 3,
    conversionValueMicros: 900_000_000n,
    videoViews: 10,
    engagements: 25,
    reach: 800,
    frequency: 1.25,
    raw: { spend: '123.45' },
    ...over,
  };
}

/**
 * Hiyerarşiyi ekler — metrikler ancak varlıklar varsa yazılabiliyor.
 *
 * `last_structure_sync_at` DE YAZILIYOR ve bu bir detay değil: kampanya
 * satırlarının var olması "yapı taraması koştu" demek. Alan NULL kalırsa
 * metrik çekimi platforma hiç gitmeden tekrar denenebilir hatayla düşüyor —
 * kilitlenmeye karşı konan koruma tam olarak bunu yapıyor.
 */
async function seedHierarchy(): Promise<void> {
  await h.q('UPDATE ad_accounts SET last_structure_sync_at = now() WHERE id = $1', [
    IDS.adAccount,
  ]);
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ('66666666-6666-6666-6666-666666666666', $1, $2, 'meta', $3, 'Kampanya', 'active', 'daily', now())`,
    [IDS.adAccount, IDS.client, CAMPAIGN_EXT],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', $1, $2, 'meta', $3, 'Ad Set', 'active', 'none', now())`,
    [IDS.adAccount, IDS.client, GROUP_EXT],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', $1, $2, 'meta', $3, 'Reklam', 'active', now())`,
    [IDS.adAccount, IDS.client, AD_EXT],
  );
}

const insightRows = async () =>
  h.q<Record<string, string>>(
    `SELECT entity_level, entity_external_id, date::text AS date, breakdown_key,
            impressions, clicks, spend_micros, conversions, conversion_value_micros,
            video_views, engagements, reach, frequency, currency
     FROM insights_daily ORDER BY entity_level, date`,
  );

const rowCount = async (): Promise<number> =>
  Number((await h.q<{ n: string }>('SELECT count(*) n FROM insights_daily'))[0]!.n);

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await seedHierarchy();
  breakers = [];

  provider = {
    platform: 'meta',
    rowsByLevel: {},
    complete: true,
    requests: [],
    fetchInsights: async function (ctx: FetchContext, request: InsightsRequest) {
      provider.requests.push(request);
      if (provider.throwOn) throw provider.throwOn;
      if (ctx.onRateLimit) {
        await ctx.onRateLimit({ usagePercent: 30, observedAt: new Date().toISOString() });
      }
      return {
        rows: provider.rowsByLevel[request.level] ?? [],
        apiCalls: 1,
        complete: provider.complete,
      } satisfies PlatformInsights;
    },
  } as never;

  svc = new InsightsSyncService(
    h.db as unknown as PrismaAdminService,
    { get: () => provider } as unknown as ProviderRegistry,
    { getAccessToken: async () => 'token' } as unknown as TokenVaultService,
    {
      record: async () => undefined,
      tripBreaker: async (platform: string, account: string, seconds: number) =>
        void breakers.push({ platform, account, seconds }),
    } as unknown as QuotaGuardService,
  );
});

describe('InsightsSyncService', () => {
  describe('yazma', () => {
    it('kampanya metriklerini doğru değerlerle yazar', async () => {
      provider.rowsByLevel = { campaign: [row()] };

      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });

      expect(result.rows).toBe(1);
      const [written] = await insightRows();
      expect(written).toBeDefined();
      expect(written!.entity_level).toBe('campaign');
      expect(written!.entity_external_id).toBe(CAMPAIGN_EXT);
      expect(written!.date).toBe('2026-08-05');
      expect(Number(written!.impressions)).toBe(1000);
      expect(String(written!.spend_micros)).toBe('123450000');
      expect(Number(written!.conversions)).toBe(3);
      expect(String(written!.conversion_value_micros)).toBe('900000000');
      expect(Number(written!.frequency)).toBeCloseTo(1.25, 4);
      expect(written!.currency).toBe('TRY');
    });

    it('breakdown_key boş STRING olarak yazılır, NULL değil', async () => {
      // NULL olsaydı birincil anahtar hiçbir zaman eşleşmez ve her
      // senkronizasyon mükerrer satır yazardı.
      provider.rowsByLevel = { campaign: [row()] };
      await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      const [written] = await insightRows();
      expect(written!.breakdown_key).toBe('');
    });

    it('her seviye kendi satırını yazar', async () => {
      provider.rowsByLevel = {
        account: [row({ level: 'account', entityExternalId: 'act_999' })],
        campaign: [row()],
        ad_group: [row({ level: 'ad_group', entityExternalId: GROUP_EXT })],
        ad: [row({ level: 'ad', entityExternalId: AD_EXT })],
      };

      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });

      expect(result.rows).toBe(4);
      const levels = (await insightRows()).map((r) => r.entity_level);
      expect(levels.sort()).toEqual(['account', 'ad', 'ad_group', 'campaign']);
    });

    it('birden fazla günü tek turda yazar', async () => {
      provider.rowsByLevel = {
        campaign: [row({ date: '2026-08-03' }), row({ date: '2026-08-04' }), row({ date: '2026-08-05' })],
      };
      await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily',
        dateFrom: '2026-08-03',
        dateTo: '2026-08-05',
      });
      expect(await rowCount()).toBe(3);
    });
  });

  describe('idempotanlık — geri düzeltmenin dayanağı', () => {
    it('aynı gün iki kez çekilince MÜKERRER satır oluşmaz', async () => {
      provider.rowsByLevel = { campaign: [row()] };
      const params = {
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily' as const,
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      };

      await svc.syncAccount(params);
      await svc.syncAccount(params);

      // Mükerrer satır olsaydı harcama raporlarda İKİ KEZ toplanırdı.
      expect(await rowCount()).toBe(1);
    });

    it('atıf penceresi değişince değerler GÜNCELLENİR', async () => {
      const params = {
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily' as const,
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      };
      provider.rowsByLevel = { campaign: [row({ conversions: 3 })] };
      await svc.syncAccount(params);

      // Meta dünün dönüşümlerini günler sonra yukarı çekiyor.
      provider.rowsByLevel = { campaign: [row({ conversions: 7, spendMicros: 200_000_000n })] };
      await svc.syncAccount(params);

      expect(await rowCount()).toBe(1);
      const [written] = await insightRows();
      expect(Number(written!.conversions)).toBe(7);
      expect(String(written!.spend_micros)).toBe('200000000');
    });

    it('fetched_at her turda yenilenir — bayat veri uyarısının dayanağı', async () => {
      const params = {
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily' as const,
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      };
      provider.rowsByLevel = { campaign: [row()] };
      await svc.syncAccount(params);
      await h.q("UPDATE insights_daily SET fetched_at = now() - interval '2 hours'");
      const before = (
        await h.q<{ fetched_at: string }>('SELECT fetched_at FROM insights_daily')
      )[0]!.fetched_at;

      await svc.syncAccount(params);
      const after = (
        await h.q<{ fetched_at: string }>('SELECT fetched_at FROM insights_daily')
      )[0]!.fetched_at;

      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
    });
  });

  describe('kimlik eşleme', () => {
    it('veritabanında olmayan varlığın metriği ATLANIR ve sayılır', async () => {
      provider.rowsByLevel = { campaign: [row(), row({ entityExternalId: 'bilinmeyen' })] };

      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });

      // Sessizce yazmak yabancı bir UUID uydurmak olurdu; atlamak doğru ama
      // sayının görünmesi şart — yapı senkronizasyonunun eksik olduğunu söylüyor.
      expect(result.rows).toBe(1);
      expect(result.skipped).toBe(1);
      expect(await rowCount()).toBe(1);
    });

    it('soft delete edilmiş kampanyanın metriği YAZILIR', async () => {
      // Platformda silinen kampanyanın geçmiş metrikleri raporda kalmalı.
      await h.q('UPDATE campaigns SET deleted_at = now()');
      provider.rowsByLevel = { campaign: [row()] };

      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      expect(result.rows).toBe(1);
    });

    it('hesap seviyesi act_ önekli kimlikle eşlenir', async () => {
      provider.rowsByLevel = {
        account: [row({ level: 'account', entityExternalId: 'act_999' })],
      };
      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      expect(result.rows).toBe(1);
      expect(result.skipped).toBe(0);
    });
  });

  describe('seviye seçimi', () => {
    it('L2 gün içi YALNIZCA hesap ve kampanya çeker', async () => {
      // Ad seviyesinde gün içi veri kotayı 20-50× artırıyor ve gün içinde ad
      // bazlı karar istatistiksel olarak anlamsız.
      await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      expect(provider.requests.map((r) => r.level)).toEqual(['account', 'campaign']);
    });

    it('L3 günlük tüm seviyeleri çeker', async () => {
      await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      expect(provider.requests.map((r) => r.level)).toEqual([
        'account',
        'campaign',
        'ad_group',
        'ad',
      ]);
    });

    it('bilinmeyen iş türü tekrar denenmeden reddedilir', async () => {
      await expect(
        svc.syncAccount({
          adAccountId: IDS.adAccount,
          jobType: 'organic_posts',
          dateFrom: '2026-08-05',
          dateTo: '2026-08-05',
        }),
      ).rejects.toThrow(/seviyesi tanımlı değil/);
    });
  });

  describe('partition davranışı', () => {
    it('geçmiş bir aya yazma çalışır', async () => {
      // Backfill geriye dönük ay yazıyor; partition yoksa Postgres reddeder.
      provider.rowsByLevel = { campaign: [row({ date: '2026-02-14' })] };
      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_backfill',
        dateFrom: '2026-02-14',
        dateTo: '2026-02-14',
      });
      expect(result.rows).toBe(1);
      const [written] = await insightRows();
      expect(written!.date).toBe('2026-02-14');
    });

    it('ay sınırını aşan aralık iki partition’a yazar', async () => {
      provider.rowsByLevel = {
        campaign: [row({ date: '2026-07-31' }), row({ date: '2026-08-01' })],
      };
      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_daily',
        dateFrom: '2026-07-31',
        dateTo: '2026-08-01',
      });
      expect(result.rows).toBe(2);
      const dates = (await insightRows()).map((r) => r.date);
      expect(dates.sort()).toEqual(['2026-07-31', '2026-08-01']);
    });
  });

  describe('bağlı parametre sınırı — chunk\'lama', () => {
    // Üretimde `insights_backfill` büyük hesaplarda (ad seviyesi × 7 günlük
    // pencere) binlerce satır üretebiliyor. Chunk'sız tek INSERT satır başına
    // 18 parametreyle Postgres/Prisma'nın 32.767 sınırını aşıp "too many bind
    // variables" ile DETERMİNİSTİK düşüyordu — satır sayısı değişmediği için
    // her yeniden deneme aynı hatayı üretiyordu.
    //
    // Bu koşum ortamının `$executeRaw`'ı gerçek Prisma İstemcisi DEĞİL (bkz.
    // pglite-harness.ts) — parametre sayısı doğrulamasını yapmıyor, o yüzden
    // hatanın kendisini burada yeniden üretemeyiz. Onun yerine DAVRANIŞI
    // sınıyoruz: CHUNK_SIZE'ı aşan bir satır kümesi BİRDEN FAZLA çağrıya
    // bölünüyor mu. Chunk'lama kaldırılırsa (tek çağrı) bu test düşer.
    it('CHUNK_SIZE\'ı aşan satır kümesi birden fazla $executeRaw çağrısına bölünür', async () => {
      const N = 2500;
      const adIds = Array.from({ length: N }, () => randomUUID());
      const externalIds = Array.from({ length: N }, (_, i) => `bulk-ad-${i}`);

      await h.q(
        `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
         SELECT unnest($1::uuid[]), '77777777-7777-7777-7777-777777777777', $2, $3, 'meta', unnest($4::text[]), 'Reklam', 'active', now()`,
        [adIds, IDS.adAccount, IDS.client, externalIds],
      );

      provider.rowsByLevel = {
        ad: externalIds.map((id) => row({ level: 'ad', entityExternalId: id, date: '2026-08-05' })),
      };

      const execSpy = vi.spyOn(h.db, '$executeRaw');

      const result = await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_backfill',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });

      expect(result.rows).toBe(N);
      expect(await rowCount()).toBe(N);

      /*
       * PARÇA SAYISI SABİT DEĞİL — ve iddia da sabit sayıya bağlanmamalı.
       *
       * Parça boyu artık `toplu-yazma.ts` içinde satır başına GERÇEK
       * parametre sayısından hesaplanıyor; bir kolon eklendiğinde boy
       * kendiliğinden küçülüyor. Buraya "3 çağrı" yazmak, o hesabın
       * doğruluğunu değil bugünkü kolon sayısını kilitlemek olurdu.
       *
       * Kilitlenen ASIL iddia: bölünme GERÇEKTEN oldu ve hiçbir çağrı
       * Postgres'in sınırına yaklaşmadı.
       */
      const insightCalls = execSpy.mock.calls.filter((c) =>
        (c[0] as { text: string }).text.includes('INSERT INTO insights_daily'),
      );
      expect(insightCalls.length).toBeGreaterThan(1);
      for (const c of insightCalls) {
        expect((c[0] as { values: unknown[] }).values.length).toBeLessThan(32_767);
      }

      execSpy.mockRestore();
    });
  });

  describe('hata davranışı', () => {
    it('kısmi sonuç işi BAŞARILI saymaz', async () => {
      // Eksik bir gün "senkronize edildi" görünürse kimse geri dönüp
      // tamamlamıyor ve rapor sessizce eksik kalıyor.
      provider.rowsByLevel = { campaign: [row()] };
      provider.complete = false;

      await expect(
        svc.syncAccount({
          adAccountId: IDS.adAccount,
          jobType: 'insights_realtime',
          dateFrom: '2026-08-05',
          dateTo: '2026-08-05',
        }),
      ).rejects.toThrow(/kısmi/);

      // Ama yazılanlar KAYBEDİLMEZ: metrikler upsert, tekrar yazmak zararsız.
      expect(await rowCount()).toBe(1);
    });

    it('kota hatası devre kesiciyi açar', async () => {
      provider.throwOn = new PlatformApiError('meta', 'rate_limited', 'kota doldu', {
        retryAfterSeconds: 600,
      });

      await expect(
        svc.syncAccount({
          adAccountId: IDS.adAccount,
          jobType: 'insights_realtime',
          dateFrom: '2026-08-05',
          dateTo: '2026-08-05',
        }),
      ).rejects.toThrow(/kota doldu/);

      expect(breakers).toHaveLength(1);
      expect(breakers[0]!.seconds).toBe(600);
    });

    it('kota dışı hata devre kesiciyi AÇMAZ', async () => {
      provider.throwOn = new PlatformApiError('meta', 'permanent', 'Invalid parameter');
      await expect(
        svc.syncAccount({
          adAccountId: IDS.adAccount,
          jobType: 'insights_realtime',
          dateFrom: '2026-08-05',
          dateTo: '2026-08-05',
        }),
      ).rejects.toThrow();
      expect(breakers).toHaveLength(0);
    });
  });

  describe('hesap durumu', () => {
    it('başarılı turda lastInsightsSyncAt güncellenir', async () => {
      provider.rowsByLevel = { campaign: [row()] };
      await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      const [account] = await h.q<{ last_insights_sync_at: string | null }>(
        'SELECT last_insights_sync_at FROM ad_accounts',
      );
      expect(account!.last_insights_sync_at).not.toBeNull();
    });

    it('hesabın zaman dilimi sağlayıcıya geçirilir', async () => {
      // "Gün"ün tanımı hesabın zaman dilimine bağlı; yanlış geçmek metriği
      // bir gün kaydırır.
      await svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_realtime',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      });
      expect(provider.requests[0]!.timezone).toBeTruthy();
    });
  });
});

/**
 * ═══ "ATADIM AMA VERİ GELMİYOR" — HİÇBİR SATIR YAZILAMAYAN İŞ ═══
 *
 * Bu blok canlıda görülen bir belirtinin kaynağını kilitliyor: hesap
 * atanıyor, `structure` ve `initial_backfill` art arda kuyruğa giriyor, worker
 * dördünü paralel çalıştırıyor ve metrik işi yapı işinden ÖNCE bitebiliyor.
 * Kampanya satırı henüz yokken gelen bütün metrikler eşlenemeyip atlanıyordu;
 * iş `succeeded` + `rows=0` kapanıyor ve BİR DAHA denenmiyordu.
 *
 * İki durumu ayırmak şart, çünkü yalnızca biri tekrar denenebilir.
 */
describe('hiçbir satır yazılamayan iş', () => {
  const BILINMEYEN = 'platformda-var-bizde-yok';

  it('YAPI HİÇ KOŞMADIYSA: tekrar denenebilir hata — başarı SAYILMIYOR', async () => {
    await h.q('UPDATE ad_accounts SET last_structure_sync_at = NULL WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = { campaign: [row({ entityExternalId: BILINMEYEN })] };

    await expect(
      svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_backfill',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      }),
    ).rejects.toMatchObject({ kind: 'transient' });

    expect(await rowCount()).toBe(0);
  });

  it('KRİTİK: yapı koşmadıysa PLATFORMA HİÇ ÇAĞRI GİTMİYOR — kilitlenmenin sebebi buydu', async () => {
    /*
     * Canlıda görülen kilitlenme: metrik işi 3.151 satır çekip hiçbirini
     * yazamıyor, beş kez tekrar deneniyor, bu turlar hesabın kota yüzdesini
     * %90'ın üstüne çıkarıyor ve kota bekçisi bundan sonra YAPI TARAMASINI DA
     * reddediyor (`structure` katmanının sınırı da %90). Yapı koşamadığı için
     * metrikler hiç eşlenemiyor — başa dön.
     *
     * Metrik işi, bağlı olduğu yapı işinin kotasını yiyordu.
     */
    await h.q('UPDATE ad_accounts SET last_structure_sync_at = NULL WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = { campaign: [row({ entityExternalId: BILINMEYEN })] };
    provider.requests = [];

    await expect(
      svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'initial_backfill',
        dateFrom: '2026-05-23',
        dateTo: '2026-08-20',
      }),
    ).rejects.toMatchObject({ kind: 'transient' });

    // TEK BİR platform çağrısı bile yapılmamalı.
    expect(provider.requests).toHaveLength(0);
  });

  it('YAPI KOŞTUYSA: başarı sayılıyor — arşivlenmiş kampanya asla eşlenmeyecek', async () => {
    // Meta arşivlenmiş varlıkları hiç döndürmüyor; bu satırlar bizde HİÇBİR
    // ZAMAN olmayacak. Beş kez tekrar denemek beş kez kota harcamak olurdu.
    await h.q('UPDATE ad_accounts SET last_structure_sync_at = now() WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = { campaign: [row({ entityExternalId: BILINMEYEN })] };

    const res = await svc.syncAccount({
      adAccountId: IDS.adAccount,
      jobType: 'insights_backfill',
      dateFrom: '2026-08-05',
      dateTo: '2026-08-05',
    });

    expect(res.rows).toBe(0);
    expect(res.skipped).toBeGreaterThan(0);
    // NOT KALICI OLMAK ZORUNDA: bu cümle olmadan "başarılı · 0 satır" hiçbir
    // şey anlatmıyor ve teşhis yine worker log'una kalıyor.
    expect(res.note).toContain('atlandı');
  });

  it('BİR SATIR BİLE YAZILDIYSA hata yok — kısmi eşleşme tekrar denemeyi hak etmiyor', async () => {
    await h.q('UPDATE ad_accounts SET last_structure_sync_at = now() WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = {
      campaign: [row(), row({ entityExternalId: BILINMEYEN, date: '2026-08-06' })],
    };

    const res = await svc.syncAccount({
      adAccountId: IDS.adAccount,
      jobType: 'insights_backfill',
      dateFrom: '2026-08-05',
      dateTo: '2026-08-06',
    });

    expect(res.rows).toBe(1);
    expect(res.skipped).toBe(1);
  });

  it('ATLANAN SATIR YOKSA boş sonuç hata değil — hesapta o gün veri olmayabilir', async () => {
    await h.q('UPDATE ad_accounts SET last_structure_sync_at = now() WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = { campaign: [] };

    const res = await svc.syncAccount({
      adAccountId: IDS.adAccount,
      jobType: 'insights_backfill',
      dateFrom: '2026-08-05',
      dateTo: '2026-08-05',
    });

    expect(res.rows).toBe(0);
    expect(res.skipped).toBe(0);
  });
});

describe('lastInsightsSyncAt damgası', () => {
  const damga = async (): Promise<string | null> =>
    (
      await h.q<{ t: string | null }>(
        'SELECT last_insights_sync_at::text AS t FROM ad_accounts WHERE id = $1',
        [IDS.adAccount],
      )
    )[0]!.t;

  it('BAŞARISIZ tur damga BIRAKMIYOR — "senkronize edildi" yalanı olmamalı', async () => {
    // Damga bir süre yazmadan ÖNCE atılıyordu: hiçbir satır yazamayan ve
    // tekrar denenmek üzere düşen bir iş bile hesaba taze bir zaman
    // bırakıyordu. Teşhis ekranında "Yapı: hiç · Metrik: 10:46" yan yana
    // duruyor ve "metrik geldi" gibi okunuyordu.
    await h.q(
      'UPDATE ad_accounts SET last_structure_sync_at = NULL, last_insights_sync_at = NULL WHERE id = $1',
      [IDS.adAccount],
    );
    provider.rowsByLevel = { campaign: [row({ entityExternalId: 'bizde-yok' })] };

    await expect(
      svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_backfill',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      }),
    ).rejects.toThrow();

    expect(await damga()).toBeNull();
  });

  it('KISMİ sonuçta da damga yok — eksik gün "çekildi" sayılmamalı', async () => {
    await h.q('UPDATE ad_accounts SET last_insights_sync_at = NULL WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = { campaign: [row()] };
    provider.complete = false;

    await expect(
      svc.syncAccount({
        adAccountId: IDS.adAccount,
        jobType: 'insights_backfill',
        dateFrom: '2026-08-05',
        dateTo: '2026-08-05',
      }),
    ).rejects.toThrow();

    expect(await damga()).toBeNull();
  });

  it('BAŞARILI tur damga bırakıyor', async () => {
    await h.q('UPDATE ad_accounts SET last_insights_sync_at = NULL WHERE id = $1', [
      IDS.adAccount,
    ]);
    provider.rowsByLevel = { campaign: [row()] };

    await svc.syncAccount({
      adAccountId: IDS.adAccount,
      jobType: 'insights_backfill',
      dateFrom: '2026-08-05',
      dateTo: '2026-08-05',
    });

    expect(await damga()).not.toBeNull();
  });
});
