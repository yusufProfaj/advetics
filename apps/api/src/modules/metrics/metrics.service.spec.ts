import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * MetricsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * En kritik iddia ÇİFT SAYIM etrafında: `insights_daily` aynı harcamayı DÖRT
 * seviyede tutuyor (hesap, kampanya, ad set, reklam). Seviye filtresi
 * kaybolursa harcama 4 katına çıkıyor — panel "7.612 TRY" yerine "30.448 TRY"
 * gösteriyor ve hata hiçbir yere hata olarak düşmüyor. Bir müşteriye yanlış
 * harcama raporlamak bu projede yapılabilecek en pahalı hatalardan biri.
 *
 * İkinci grup iddia TÜRETİLMİŞ ORAN NULL ANLAMBILIMI: `null` "hesaplanamaz"
 * demek, sıfır demek değil. Lead formu kampanyalarında ROAS uygulanamaz ve
 * "0.00×" göstermek müşteriye kampanyanın battığını söyler.
 */

let h: Harness;
let svc: MetricsService;
let tenantCalls: TenantContext[];

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const CAMPAIGN_ID = '66666666-6666-6666-6666-666666666666';
const GROUP_ID = '77777777-7777-7777-7777-777777777777';
const AD_ID = '88888888-8888-8888-8888-888888888888';

async function seedHierarchy(): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, 'meta', 'c1', 'Kampanya A', 'active', 'daily', now())`,
    [CAMPAIGN_ID, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'g1', 'Reklam Seti A1', 'active', 'none', now())`,
    [GROUP_ID, CAMPAIGN_ID, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'a1', 'Reklam A-1', 'active', now())`,
    [AD_ID, GROUP_ID, IDS.adAccount, IDS.client],
  );
}

/** Aynı harcamayı dört seviyeye de yazar — platformun yaptığı şey bu. */
async function seedMetrics(params: {
  date: string;
  spendMicros: string;
  impressions: number;
  clicks: number;
  conversions: number;
  valueMicros?: string;
  currency?: string;
  reach?: number;
}): Promise<void> {
  const levels: Array<[string, string, string]> = [
    ['account', IDS.adAccount, 'act_999'],
    ['campaign', CAMPAIGN_ID, 'c1'],
    ['ad_group', GROUP_ID, 'g1'],
    ['ad', AD_ID, 'a1'],
  ];
  for (const [level, entityId, externalId] of levels) {
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach)
       VALUES ($1, $2, 'meta', $3::"EntityLevel", $4, $5, $6::date, '', $7, $8, $9, $10, $11, $12, $13)`,
      [
        IDS.client,
        IDS.adAccount,
        level,
        entityId,
        externalId,
        params.date,
        params.impressions,
        params.clicks,
        params.spendMicros,
        params.conversions,
        params.valueMicros ?? '0',
        params.currency ?? 'TRY',
        params.reach ?? 0,
      ],
    );
  }
}

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
  tenantCalls = [];

  // `withTenant` taklidi: bağlamı kaydediyor ve sorguyu koşum ortamının
  // istemcisine devrediyor. Amaç RLS'i test etmek DEĞİL (o ayrı bir paket);
  // servisin RLS yolundan GEÇTİĞİNİ ve toplama SQL'inin doğru olduğunu
  // doğrulamak.
  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (!ctx?.orgId || !ctx?.userId) throw new Error('Tenant bağlamı olmadan sorgu');
      tenantCalls.push(ctx);
      return fn(h.db);
    },
  } as unknown as PrismaService;

  svc = new MetricsService(prisma);
});

describe('MetricsService', () => {
  describe('özet — çift sayım koruması', () => {
    it('REGRESYON: dört seviyeye yazılmış harcamayı BİR kez sayar', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '7612190000',
        impressions: 106_406,
        clicks: 1901,
        conversions: 52,
      });

      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });

      // Seviye filtresi kaybolsa 4× (30.448.760.000) olurdu.
      expect(s.spendMicros).toBe('7612190000');
      expect(s.impressions).toBe(106_406);
      expect(s.clicks).toBe(1901);
      expect(s.conversions).toBe(52);
    });

    it('birden fazla günü toplar', async () => {
      await seedMetrics({
        date: '2026-08-04',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 10,
        conversions: 1,
      });
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '2000000',
        impressions: 200,
        clicks: 20,
        conversions: 2,
      });

      const s = await svc.summary(CTX, { from: '2026-08-04', to: '2026-08-05' });
      expect(s.spendMicros).toBe('3000000');
      expect(s.impressions).toBe(300);
    });

    it('aralık dışındaki günü SAYMAZ', async () => {
      await seedMetrics({
        date: '2026-08-01',
        spendMicros: '9999000000',
        impressions: 1,
        clicks: 0,
        conversions: 0,
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.spendMicros).toBe('0');
    });

    it('her sorgu tenant bağlamından geçer', async () => {
      await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      // Admin istemcisi kullanmak müşteri izolasyonunu delerdi.
      expect(tenantCalls.length).toBeGreaterThan(0);
      expect(tenantCalls[0]!.orgId).toBe(IDS.org);
    });
  });

  describe('türetilmiş oranlar', () => {
    it('CTR, CPC, CPM, CPA doğru hesaplanır', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000000', // 1000 birim
        impressions: 10_000,
        clicks: 200,
        conversions: 4,
      });

      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.ctr).toBeCloseTo(2, 6); // 200/10000
      expect(s.cpc).toBeCloseTo(5, 6); // 1000/200
      expect(s.cpm).toBeCloseTo(100, 6); // 1000/10000*1000
      expect(s.cpa).toBeCloseTo(250, 6); // 1000/4
    });

    it('REGRESYON: dönüşüm değeri yoksa ROAS null — "0.00×" DEĞİL', async () => {
      // Bu hesabın tamamı lead formu ve WhatsApp; gelir hiç takip edilmiyor.
      // "0.00×" göstermek müşteriye kampanyanın battığını söylerdi.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000000',
        impressions: 100,
        clicks: 10,
        conversions: 5,
        valueMicros: '0',
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.roas).toBeNull();
    });

    it('dönüşüm değeri varsa ROAS hesaplanır', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000000',
        impressions: 100,
        clicks: 10,
        conversions: 5,
        valueMicros: '3000000000',
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.roas).toBeCloseTo(3, 6);
    });

    it('bölen sıfırsa oranlar null — sıfır değil', async () => {
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      // Hiç veri yok. "CTR %0" göstermek "tıklanmıyor" der; doğrusu "veri yok".
      expect(s.ctr).toBeNull();
      expect(s.cpc).toBeNull();
      expect(s.cpa).toBeNull();
      expect(s.roas).toBeNull();
      expect(s.spendMicros).toBe('0');
    });
  });

  describe('önceki dönem', () => {
    it('aynı UZUNLUKTA ve hemen önceki pencereyi okur', async () => {
      // 3 günlük bakış: 08-03..08-05. Önceki dönem 07-31..08-02 olmalı.
      await seedMetrics({
        date: '2026-08-01',
        spendMicros: '5000000',
        impressions: 500,
        clicks: 5,
        conversions: 0,
      });
      await seedMetrics({
        date: '2026-08-04',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 1,
        conversions: 0,
      });

      const s = await svc.summary(CTX, { from: '2026-08-03', to: '2026-08-05' });
      expect(s.spendMicros).toBe('1000000');
      expect(s.previous?.spendMicros).toBe('5000000');
    });

    it('KRİTİK: pencere İSTEKTEN gelirse o kullanılıyor — "önceki yıl" bunu gerektiriyor', async () => {
      /*
       * Pencere bir süre koşulsuz sunucuda türetiliyordu ("aynı uzunlukta,
       * hemen öncesi") ve kullanıcı başka bir karşılaştırma seçemiyordu.
       * Panel pencereyi hesaplayıp EKRANDA YAZIYOR; sunucu ayrı bir hesap
       * yapsaydı yazan dönem ile karşılaştırılan dönem ayrışırdı.
       */
      await seedMetrics({
        date: '2025-08-05',
        spendMicros: '7000000',
        impressions: 700,
        clicks: 7,
        conversions: 0,
      });
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 1,
        conversions: 0,
      });

      const s = await svc.summary(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        compareFrom: '2025-08-05',
        compareTo: '2025-08-05',
      });
      expect(s.spendMicros).toBe('1000000');
      expect(s.previous?.spendMicros).toBe('7000000');
    });

    it('pencere gelmezse ESKİ davranış korunuyor — rapor bu ucu parametresiz çağırıyor', async () => {
      await seedMetrics({
        date: '2026-08-04',
        spendMicros: '5000000',
        impressions: 500,
        clicks: 5,
        conversions: 0,
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.previous?.spendMicros).toBe('5000000');
    });

    it('önceki dönemde veri yoksa null', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 1,
        conversions: 0,
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      // Sıfırlı bir nesne döndürmek "%100 düşüş" gibi görünürdü.
      expect(s.previous).toBeNull();
    });
  });

  describe('coverage — "Tüm zamanlar"ın dayanağı', () => {
    it('en eski ve en yeni veri gününü döndürüyor', async () => {
      // Sabit bir alt sınır (örn. 2020) hem yüzlerce boş günü tarar hem de
      // 400 günlük aralık sınırına takılıp panelde hata sayfası üretirdi.
      for (const date of ['2026-05-23', '2026-07-01', '2026-08-20']) {
        await seedMetrics({
          date,
          spendMicros: '1000000',
          impressions: 100,
          clicks: 1,
          conversions: 0,
        });
      }
      const c = await svc.coverage(CTX, { from: '2026-08-01', to: '2026-08-05' });
      expect(c.earliestDate).toBe('2026-05-23');
      expect(c.latestDate).toBe('2026-08-20');
    });

    it('hiç veri yoksa null — uydurma bir başlangıç YOK', async () => {
      const c = await svc.coverage(CTX, { from: '2026-08-01', to: '2026-08-05' });
      expect(c.earliestDate).toBeNull();
      expect(c.latestDate).toBeNull();
    });
  });

  describe('erişim — toplanamayan metrik', () => {
    it('tek günde erişim TAM ve hesap seviyesinden okunur', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 1000,
        clicks: 10,
        conversions: 0,
        reach: 800,
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      // Dört seviyeye de 800 yazıldı; kampanya seviyesinden toplamak 800'ü
      // mükerrer sayardı. Hesap seviyesinden okumak doğru olan.
      expect(s.reach).toBe(800);
      expect(s.reachKind).toBe('exact');
    });

    it('REGRESYON: çok günde erişim TOPLANMIYOR, ortalama alınıyor', async () => {
      // Aynı kişi iki gün de reklamı görmüş olabilir; 800+800=1600 demek
      // müşteriye iki kat kitle büyüklüğü söylemek olur.
      for (const date of ['2026-08-04', '2026-08-05']) {
        await seedMetrics({
          date,
          spendMicros: '1000000',
          impressions: 1000,
          clicks: 10,
          conversions: 0,
          reach: 800,
        });
      }
      const s = await svc.summary(CTX, { from: '2026-08-04', to: '2026-08-05' });
      expect(s.reach).toBe(800);
      expect(s.reachKind).toBe('daily_average');
    });

    it('farklı günlerde farklı erişim → günlük ortalama', async () => {
      await seedMetrics({
        date: '2026-08-04',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
        reach: 600,
      });
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
        reach: 1000,
      });
      const s = await svc.summary(CTX, { from: '2026-08-04', to: '2026-08-05' });
      expect(s.reach).toBe(800);
    });

    it('hesap seviyesi satırı yoksa erişim null', async () => {
      // Bazı platformlar hesap seviyesi erişim bildirmiyor. Kampanyalardan
      // türetmeye çalışmak yanlış bir sayı üretirdi.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
        reach: 500,
      });
      await h.q(`DELETE FROM insights_daily WHERE entity_level = 'account'`);
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.reach).toBeNull();
    });

    it('tek hesapta hesaplar arası mükerrerlik bayrağı kapalı', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
        reach: 500,
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.reachAcrossAccounts).toBe(false);
    });
  });

  describe('para birimi', () => {
    it('tek para birimi varsa currency dolu', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 1,
        clicks: 0,
        conversions: 0,
        currency: 'TRY',
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.currency).toBe('TRY');
      expect(s.byCurrency).toEqual([{ currency: 'TRY', spendMicros: '1000000' }]);
    });

    it('REGRESYON: karışık para biriminde currency NULL ve dağılım ayrı verilir', async () => {
      // 1 USD + 1 TRY = 2 ne? `fx_rates` çevrimi henüz yok; toplamı tek bir
      // sayı gibi sunmak sessizce yanlış olur.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 1,
        clicks: 0,
        conversions: 0,
        currency: 'TRY',
      });
      await h.q(
        `INSERT INTO insights_daily
           (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
            date, breakdown_key, impressions, clicks, spend_micros, conversions,
            conversion_value_micros, currency)
         VALUES ($1, $2, 'meta', 'campaign', $3, 'c2', '2026-08-05'::date, '', 5, 1, 2000000, 0, 0, 'USD')`,
        [IDS.client, IDS.adAccount, CAMPAIGN_ID],
      ).catch(async () => {
        // Aynı birincil anahtar (date, level, entity, breakdown) — farklı bir
        // varlık gerekiyor. Kampanyayı çoğaltıp ikinci para birimini yazıyoruz.
        await h.q(
          `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
           VALUES ('99999999-9999-9999-9999-999999999999', $1, $2, 'meta', 'c2', 'Kampanya B', 'active', 'daily', now())`,
          [IDS.adAccount, IDS.client],
        );
        await h.q(
          `INSERT INTO insights_daily
             (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
              date, breakdown_key, impressions, clicks, spend_micros, conversions,
              conversion_value_micros, currency)
           VALUES ($1, $2, 'meta', 'campaign', '99999999-9999-9999-9999-999999999999', 'c2',
                   '2026-08-05'::date, '', 5, 1, 2000000, 0, 0, 'USD')`,
          [IDS.client, IDS.adAccount],
        );
      });

      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.currency).toBeNull();
      expect(s.byCurrency).toHaveLength(2);
      expect(s.byCurrency.map((c) => c.currency).sort()).toEqual(['TRY', 'USD']);
    });
  });

  describe('zaman serisi', () => {
    it('REGRESYON: tarihler saat dilimi yüzünden KAYMIYOR', async () => {
      // Prisma DATE'i yerel gece yarısı bir Date olarak veriyor;
      // `toISOString()` UTC+3'te günü bir geriye alıyor ve grafikteki tüm
      // günler kayıyor.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 1,
        conversions: 0,
      });
      const points = await svc.timeseries(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(points).toHaveLength(1);
      expect(points[0]!.date).toBe('2026-08-05');
    });

    it('gün gün ve sıralı döner', async () => {
      for (const [date, spend] of [
        ['2026-08-03', '3000000'],
        ['2026-08-05', '5000000'],
        ['2026-08-04', '4000000'],
      ] as const) {
        await seedMetrics({
          date,
          spendMicros: spend,
          impressions: 10,
          clicks: 1,
          conversions: 0,
        });
      }
      const points = await svc.timeseries(CTX, { from: '2026-08-03', to: '2026-08-05' });
      expect(points.map((p) => p.date)).toEqual(['2026-08-03', '2026-08-04', '2026-08-05']);
      expect(points.map((p) => p.spendMicros)).toEqual(['3000000', '4000000', '5000000']);
    });

    it('veri olmayan gün ATLANIR — sıfırla doldurulmaz', async () => {
      // Harcama olmayan günlerde platform satır döndürmüyor. Sıfır satır
      // uydurmak "o gün reklam durdu" demekle aynı; grafiği çizen katman
      // boşluğu nasıl göstereceğine kendi karar veriyor.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 1,
        clicks: 0,
        conversions: 0,
      });
      const points = await svc.timeseries(CTX, { from: '2026-08-01', to: '2026-08-05' });
      expect(points).toHaveLength(1);
    });
  });

  describe('kırılım', () => {
    it('kampanya seviyesinde ad ve durum döner', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 5,
        conversions: 1,
      });
      const rows = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'campaign',
        limit: 50,
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.name).toBe('Kampanya A');
      expect(rows[0]!.status).toBe('active');
      expect(rows[0]!.platform).toBe('meta');
      expect(rows[0]!.currency).toBe('TRY');
    });

    it('reklam seviyesinde ÜST ad set adı da döner', async () => {
      // Reklam adları ad set'ler arasında tekrar ediyor; üst varlık olmadan
      // tabloda hangi satırın hangisi olduğu ayırt edilemiyor.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 5,
        conversions: 1,
      });
      const rows = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'ad',
        limit: 50,
      });
      expect(rows[0]!.name).toBe('Reklam A-1');
      expect(rows[0]!.parentName).toBe('Reklam Seti A1');
    });

    it('ad set seviyesinde üst KAMPANYA adı döner', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 5,
        conversions: 1,
      });
      const rows = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'ad_group',
        limit: 50,
      });
      expect(rows[0]!.name).toBe('Reklam Seti A1');
      expect(rows[0]!.parentName).toBe('Kampanya A');
    });

    it('üst ad varlık adıyla AYNIYSA gösterilmez', async () => {
      // Meta öne çıkarılan gönderilerde reklamı ad set'le aynı adlandırıyor;
      // aynı metni iki satırda tekrarlamak yalnızca gürültü.
      await h.q(`UPDATE ads SET name = 'Aynı Ad'`);
      await h.q(`UPDATE ad_groups SET name = 'Aynı Ad'`);
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
      });
      const rows = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'ad',
        limit: 50,
      });
      expect(rows[0]!.name).toBe('Aynı Ad');
      expect(rows[0]!.parentName).toBeNull();
    });

    it('harcamaya göre azalan sıralı ve limitli', async () => {
      await h.q(
        `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
         VALUES ('99999999-9999-9999-9999-999999999999', $1, $2, 'meta', 'c2', 'Kampanya B', 'active', 'daily', now())`,
        [IDS.adAccount, IDS.client],
      );
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
      });
      await h.q(
        `INSERT INTO insights_daily
           (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
            date, breakdown_key, impressions, clicks, spend_micros, conversions,
            conversion_value_micros, currency)
         VALUES ($1, $2, 'meta', 'campaign', '99999999-9999-9999-9999-999999999999', 'c2',
                 '2026-08-05'::date, '', 20, 2, 9000000, 0, 0, 'TRY')`,
        [IDS.client, IDS.adAccount],
      );

      const rows = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'campaign',
        limit: 50,
      });
      expect(rows.map((r) => r.name)).toEqual(['Kampanya B', 'Kampanya A']);

      const limited = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'campaign',
        limit: 1,
      });
      expect(limited).toHaveLength(1);
      expect(limited[0]!.name).toBe('Kampanya B');
    });

    it('yapı senkronizasyonu eksikse dış kimlik ad olarak kullanılır', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
      });
      // Kampanya kaydını sil, metrik satırı kalsın.
      await h.q('DELETE FROM insights_daily WHERE entity_level <> $1', ['campaign']);
      await h.q('DELETE FROM ads');
      await h.q('DELETE FROM ad_groups');
      await h.q('DELETE FROM campaigns');

      const rows = await svc.breakdown(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        level: 'campaign',
        limit: 50,
      });
      // "isimsiz satır" göstermekten iyi.
      expect(rows[0]!.name).toBe('c1');
    });
  });

  describe('filtreler', () => {
    it('platform filtresi uygulanır', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
      });
      const meta = await svc.summary(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        platform: 'meta',
      });
      expect(meta.spendMicros).toBe('1000000');

      const google = await svc.summary(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        platform: 'google',
      });
      expect(google.spendMicros).toBe('0');
    });

    it('reklam hesabı filtresi uygulanır', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
      });
      const matching = await svc.summary(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        adAccountId: IDS.adAccount,
      });
      expect(matching.spendMicros).toBe('1000000');

      const other = await svc.summary(CTX, {
        from: '2026-08-05',
        to: '2026-08-05',
        adAccountId: '00000000-0000-0000-0000-000000000000',
      });
      expect(other.spendMicros).toBe('0');
    });
  });

  describe('tazelik', () => {
    it('en son doğrulama zamanı ve hesap sayısı döner', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 10,
        clicks: 1,
        conversions: 0,
      });
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.lastFetchedAt).not.toBeNull();
      expect(s.accountCount).toBe(1);
    });

    it('veri yoksa tazelik null', async () => {
      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.lastFetchedAt).toBeNull();
      expect(s.accountCount).toBe(0);
    });
  });

  /**
   * İZLENMEYEN HESAP FİLTRESİ.
   *
   * Ajans bir müşteriyle çalışmayı bıraktığında hesabı kapatıyor ve o hesabın
   * harcamasının genel toplamdan da çıkmasını bekliyor. Kapatılan hesap
   * toplamda kalmaya devam ederse panel, artık yönetilmeyen bir bütçeyi
   * raporluyor demektir.
   */
  describe('izlenmeyen hesaplar', () => {
    it('KRİTİK: kapalı hesabın verisi toplama girmiyor', async () => {
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000000',
        impressions: 1000,
        clicks: 50,
        conversions: 5,
      });

      const before = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      // Özet yalnızca KAMPANYA seviyesini okuyor (TOTALS_LEVEL); dört seviye
      // toplanmıyor.
      expect(before.spendMicros).toBe('1000000000');

      await h.q(`UPDATE ad_accounts SET sync_enabled = false WHERE id = $1`, [IDS.adAccount]);

      const after = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(after.spendMicros).toBe('0');
    });

    it('VERİ SİLİNMİYOR — hesap açılınca geri geliyor', async () => {
      // Geçici olarak kapatmak geri alınamaz bir kayıp olmamalı; `insights_daily`
      // satırları duruyor, yalnızca sorgudan eleniyorlar.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000000',
        impressions: 1000,
        clicks: 50,
        conversions: 5,
      });
      await h.q(`UPDATE ad_accounts SET sync_enabled = false WHERE id = $1`, [IDS.adAccount]);
      await h.q(`UPDATE ad_accounts SET sync_enabled = true WHERE id = $1`, [IDS.adAccount]);

      const s = await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' });
      expect(s.spendMicros).toBe('1000000000');
    });

    it('GİZLENEN HESAP SAYISI bildiriliyor — sessizce kaybolmuyor', async () => {
      // Sebebini görmeyen kullanıcı "harcama neden düştü" diye sorar. Bu sayı
      // arayüzün o soruyu önceden cevaplamasını sağlıyor.
      await seedMetrics({
        date: '2026-08-05',
        spendMicros: '1000000000',
        impressions: 1000,
        clicks: 50,
        conversions: 5,
      });
      expect((await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' })).hiddenAccounts).toBe(0);

      await h.q(`UPDATE ad_accounts SET sync_enabled = false WHERE id = $1`, [IDS.adAccount]);
      expect((await svc.summary(CTX, { from: '2026-08-05', to: '2026-08-05' })).hiddenAccounts).toBe(1);
    });
  });

});

/**
 * ═══ KIRILIM TABLOSUNDA KARŞILAŞTIRMA ═══
 *
 * Özet uçta önceki dönem baştan beri vardı; kırılım tek pencere okuyordu ve
 * "hangi kampanya arttı, hangisi düştü" sorusu tabloda cevapsızdı.
 *
 * Üç kural sessizce bozulabiliyor ve üçü de burada kilitli:
 *   1. Sıralama CARİ döneme bağlı kalmalı.
 *   2. Önceki dönemde verisi olmayan varlıkta `previous` NULL olmalı.
 *   3. Karşılaştırma istenmediğinde ikinci pencere HİÇ okunmamalı.
 */
describe('MetricsService — kırılım karşılaştırması', () => {
  async function kampanya(id: string, ad: string): Promise<void> {
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
       VALUES ($1, $2, $3, 'meta', $4, $5, 'active', 'daily', now())`,
      [id, IDS.adAccount, IDS.client, `ext-${id.slice(0, 6)}`, ad],
    );
  }

  async function metrik(entityId: string, date: string, spend: string, clicks = 10): Promise<void> {
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach)
       VALUES ($1, $2, 'meta', 'campaign', $3, $4, $5::date, '', 1000, $6, $7, 2, 0, 'TRY', 0)`,
      [IDS.client, IDS.adAccount, entityId, `ext-${entityId.slice(0, 6)}`, date, clicks, spend],
    );
  }

  const SORGU = {
    from: '2026-08-08',
    to: '2026-08-14',
    level: 'campaign' as const,
    limit: 50,
    compareFrom: '2026-08-01',
    compareTo: '2026-08-07',
  };

  it('KRİTİK: önceki dönem satır bazında dönüyor', async () => {
    await metrik(CAMPAIGN_ID, '2026-08-10', '2000000', 20);
    await metrik(CAMPAIGN_ID, '2026-08-03', '1000000', 10);

    const rows = await svc.breakdown(CTX, SORGU);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.spendMicros).toBe('2000000');
    expect(rows[0]!.previous?.spendMicros).toBe('1000000');
    expect(rows[0]!.previous?.clicks).toBe(10);
  });

  it('KRİTİK: önceki dönemde verisi OLMAYAN varlıkta previous NULL', async () => {
    // Sıfırlı bir nesne döndürmek YENİ açılmış her kampanyayı "-%100"
    // gösterirdi.
    await metrik(CAMPAIGN_ID, '2026-08-10', '2000000');
    const rows = await svc.breakdown(CTX, SORGU);
    expect(rows[0]!.previous).toBeNull();
  });

  it('KRİTİK: SIRALAMA cari döneme bağlı — yalnızca geçmişte harcayan listeyi kaydırmıyor', async () => {
    /*
     * Sıralama toplam pencereye bağlı olsaydı, ÖNCEKİ dönemde çok harcamış
     * ama şimdi hiç harcamayan bir kampanya listenin başına geçerdi ve
     * "bu kampanya neden burada, hiç harcaması yok" sorusunu doğururdu.
     */
    const ESKI = '77777777-0000-0000-0000-000000000001';
    await kampanya(ESKI, 'Yalnızca geçmişte');
    await metrik(ESKI, '2026-08-03', '90000000');
    await metrik(CAMPAIGN_ID, '2026-08-10', '2000000');

    const rows = await svc.breakdown(CTX, SORGU);
    expect(rows[0]!.name).toBe('Kampanya A');
  });

  it('KRİTİK: karşılaştırma İSTENMEZSE previous NULL ve geçmiş okunmuyor', async () => {
    await metrik(CAMPAIGN_ID, '2026-08-10', '2000000');
    await metrik(CAMPAIGN_ID, '2026-08-03', '1000000');

    const rows = await svc.breakdown(CTX, {
      from: '2026-08-08',
      to: '2026-08-14',
      level: 'campaign',
      limit: 50,
    });
    expect(rows[0]!.previous).toBeNull();
    // Cari dönem geçmişten ETKİLENMEMELİ: pencere genişleseydi 3.000.000
    // çıkardı.
    expect(rows[0]!.spendMicros).toBe('2000000');
  });

  it('cari dönem toplamı ÖNCEKİ dönemi İÇERMİYOR', async () => {
    await metrik(CAMPAIGN_ID, '2026-08-10', '2000000');
    await metrik(CAMPAIGN_ID, '2026-08-03', '1000000');
    const rows = await svc.breakdown(CTX, SORGU);
    expect(rows[0]!.spendMicros).toBe('2000000');
  });

  it('türetilmiş oranlar önceki dönem için de hesaplanıyor', async () => {
    await metrik(CAMPAIGN_ID, '2026-08-10', '2000000', 20);
    await metrik(CAMPAIGN_ID, '2026-08-03', '1000000', 10);
    const rows = await svc.breakdown(CTX, SORGU);
    expect(rows[0]!.previous?.ctr).not.toBeNull();
    expect(rows[0]!.previous?.cpa).not.toBeNull();
  });
});
