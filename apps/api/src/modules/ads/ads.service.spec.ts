import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AdsService } from './ads.service';

/**
 * AdsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * En kritik iddia METRİKSİZ REKLAMIN GÖRÜNMESİ. `insights_daily` ile INNER
 * JOIN yapmak duraklatılmış ya da yeni bir reklamı listeden düşürüyor ve
 * kullanıcı "reklamım nerede" diye panelin bozuk olduğunu düşünüyor. Bu, veri
 * kaybı gibi görünmeyen ama aynı etkiyi yapan bir hata.
 *
 * İkinci grup TÜRETİLMİŞ METRİĞE GÖRE SIRALAMA: istemcide sıralamak yalnızca
 * o sayfayı sıralar ve "en yüksek CPA'lı reklam" sorusunu yanlış yanıtlar.
 */

let h: Harness;
let svc: AdsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const CAMPAIGN = '66666666-6666-6666-6666-666666666666';
const GROUP = '77777777-7777-7777-7777-777777777777';

const RANGE = { from: '2026-08-04', to: '2026-08-05' };
const QUERY_BASE = {
  ...RANGE,
  sort: 'spend' as const,
  dir: 'desc' as const,
  page: 1,
  pageSize: 25,
};

async function seedHierarchy(): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, objective, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, 'meta', 'c1', 'Kampanya A', 'OUTCOME_LEADS', 'active', 'daily', now())`,
    [CAMPAIGN, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'g1', 'Reklam Seti A1', 'active', 'none', now())`,
    [GROUP, CAMPAIGN, IDS.adAccount, IDS.client],
  );
}

async function seedCreative(id: string, externalId: string, over: Record<string, unknown> = {}) {
  await h.q(
    `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, creative_type,
                            headline, primary_text, cta_type, destination_url, asset_urls, updated_at)
     VALUES ($1, $2, $3, 'meta', $4, $5, $6, $7, $8, $9, $10::jsonb, now())`,
    [
      id,
      IDS.adAccount,
      IDS.client,
      externalId,
      over.creativeType ?? 'SHARE',
      over.headline ?? 'Ailenize Yeni Bir Yuva',
      over.primaryText ?? 'Kuşadası Davutlar’da denize 800m',
      over.ctaType ?? 'LEARN_MORE',
      over.destinationUrl ?? 'https://gardenvillaskusadasi.com/',
      JSON.stringify(over.assetUrls ?? ['https://img/1.jpg']),
    ],
  );
}

async function seedAd(params: {
  id: string;
  externalId: string;
  name: string;
  status?: string;
  reviewStatus?: string | null;
  disapproval?: unknown;
  creativeId?: string | null;
  deleted?: boolean;
}): Promise<void> {
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name,
                      status, review_status, disapproval_reasons, creative_id, deleted_at, raw, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', $5, $6, $7::"EntityStatus", $8, $9::jsonb, $10, $11, $12::jsonb, now())`,
    [
      params.id,
      GROUP,
      IDS.adAccount,
      IDS.client,
      params.externalId,
      params.name,
      params.status ?? 'active',
      params.reviewStatus ?? null,
      params.disapproval === undefined ? null : JSON.stringify(params.disapproval),
      params.creativeId ?? null,
      params.deleted ? new Date() : null,
      JSON.stringify({ id: params.externalId }),
    ],
  );
}

async function seedAdMetrics(params: {
  adId: string;
  externalId: string;
  date: string;
  spendMicros: string;
  impressions: number;
  clicks: number;
  conversions: number;
  reach?: number;
}): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, reach)
     VALUES ($1, $2, 'meta', 'ad', $3, $4, $5::date, '', $6, $7, $8, $9, 0, 'TRY', $10)`,
    [
      IDS.client,
      IDS.adAccount,
      params.adId,
      params.externalId,
      params.date,
      params.impressions,
      params.clicks,
      params.spendMicros,
      params.conversions,
      params.reach ?? 0,
    ],
  );
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

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (!ctx?.orgId || !ctx?.userId) throw new Error('Tenant bağlamı olmadan sorgu');
      return fn(h.db);
    },
  } as unknown as PrismaService;

  svc = new AdsService(prisma);
});

describe('AdsService.explore', () => {
  describe('metriksiz reklamlar', () => {
    it('REGRESYON: harcaması olmayan reklam listede GÖRÜNÜR', async () => {
      // INNER JOIN olsa bu reklam kaybolurdu ve kullanıcı "reklamım nerede"
      // diye panelin bozuk olduğunu düşünürdü.
      await seedAd({ id: 'a1111111-1111-1111-1111-111111111111', externalId: 'a1', name: 'Yeni Reklam' });

      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.total).toBe(1);
      expect(res.rows[0]!.name).toBe('Yeni Reklam');
      // Metrik yok → sıfır, oranlar null.
      expect(res.rows[0]!.spendMicros).toBe('0');
      expect(res.rows[0]!.ctr).toBeNull();
      expect(res.rows[0]!.cpa).toBeNull();
    });

    it('metriksiz reklam sıralamada EN SONA düşer', async () => {
      await seedAd({ id: 'a1111111-1111-1111-1111-111111111111', externalId: 'a1', name: 'Boş' });
      await seedAd({ id: 'a2222222-2222-2222-2222-222222222222', externalId: 'a2', name: 'Dolu' });
      await seedAdMetrics({
        adId: 'a2222222-2222-2222-2222-222222222222',
        externalId: 'a2',
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 10,
        conversions: 1,
      });

      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.rows.map((r) => r.name)).toEqual(['Dolu', 'Boş']);
    });
  });

  describe('metrik toplama', () => {
    it('tarih aralığındaki günleri toplar', async () => {
      await seedAd({ id: 'a1111111-1111-1111-1111-111111111111', externalId: 'a1', name: 'R1' });
      for (const date of ['2026-08-04', '2026-08-05']) {
        await seedAdMetrics({
          adId: 'a1111111-1111-1111-1111-111111111111',
          externalId: 'a1',
          date,
          spendMicros: '1000000',
          impressions: 100,
          clicks: 10,
          conversions: 1,
        });
      }
      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.rows[0]!.spendMicros).toBe('2000000');
      expect(res.rows[0]!.impressions).toBe(200);
      expect(res.rows[0]!.ctr).toBeCloseTo(10, 6);
    });

    it('aralık dışındaki günü SAYMAZ', async () => {
      await seedAd({ id: 'a1111111-1111-1111-1111-111111111111', externalId: 'a1', name: 'R1' });
      await seedAdMetrics({
        adId: 'a1111111-1111-1111-1111-111111111111',
        externalId: 'a1',
        date: '2026-07-01',
        spendMicros: '9999000000',
        impressions: 1,
        clicks: 0,
        conversions: 0,
      });
      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.rows[0]!.spendMicros).toBe('0');
    });

    it('toplamlar SAYFANIN değil süzgecin tamamının', async () => {
      // UUID'ler AÇIK yazılıyor: dizeyi kırparak üretmek geçersiz UUID
      // veriyordu ve hata testin kendisindeydi.
      const ids = [
        'a1111111-1111-1111-1111-111111111111',
        'a2222222-2222-2222-2222-222222222222',
        'a3333333-3333-3333-3333-333333333333',
      ];
      for (const [i, id] of ids.entries()) {
        await seedAd({ id, externalId: `a${i + 1}`, name: `R${i + 1}` });
        await seedAdMetrics({
          adId: id,
          externalId: `a${i + 1}`,
          date: '2026-08-05',
          spendMicros: '1000000',
          impressions: 10,
          clicks: 1,
          conversions: 0,
        });
      }
      const res = await svc.explore(CTX, { ...QUERY_BASE, pageSize: 1 });
      expect(res.rows).toHaveLength(1);
      expect(res.total).toBe(3);
      // Sayfa toplamı 1.000.000 olurdu ve "3 reklamın harcaması" gibi görünürdü.
      expect(res.totals.spendMicros).toBe('3000000');
    });
  });

  describe('sıralama', () => {
    beforeEach(async () => {
      // A: yüksek harcama, düşük CTR · B: düşük harcama, yüksek CTR
      await seedAd({ id: 'aaaaaaaa-1111-1111-1111-111111111111', externalId: 'a', name: 'A' });
      await seedAd({ id: 'bbbbbbbb-2222-2222-2222-222222222222', externalId: 'b', name: 'B' });
      await seedAdMetrics({
        adId: 'aaaaaaaa-1111-1111-1111-111111111111',
        externalId: 'a',
        date: '2026-08-05',
        spendMicros: '9000000',
        impressions: 10_000,
        clicks: 100,
        conversions: 9,
      });
      await seedAdMetrics({
        adId: 'bbbbbbbb-2222-2222-2222-222222222222',
        externalId: 'b',
        date: '2026-08-05',
        spendMicros: '1000000',
        impressions: 100,
        clicks: 50,
        conversions: 1,
      });
    });

    it('harcamaya göre sıralar', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, sort: 'spend', dir: 'desc' });
      expect(res.rows.map((r) => r.name)).toEqual(['A', 'B']);
    });

    it('REGRESYON: CTR türetilmiş ama SQL içinde sıralanıyor', async () => {
      // A'nın CTR'si %1, B'nin %50. Harcama sırası tam tersi — istemcide
      // sıralamak bu farkı gösteremezdi.
      const res = await svc.explore(CTX, { ...QUERY_BASE, sort: 'ctr', dir: 'desc' });
      expect(res.rows.map((r) => r.name)).toEqual(['B', 'A']);
    });

    it('CPA artan sıralamada en verimli önce', async () => {
      // A: 9/9 = 1 birim CPA · B: 1/1 = 1 birim. Eşit; harcama tie-break.
      const res = await svc.explore(CTX, { ...QUERY_BASE, sort: 'cpa', dir: 'asc' });
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]!.cpa).not.toBeNull();
    });

    it('ada göre alfabetik sıralar', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, sort: 'name', dir: 'asc' });
      expect(res.rows.map((r) => r.name)).toEqual(['A', 'B']);
    });
  });

  describe('süzgeçler', () => {
    beforeEach(async () => {
      await seedCreative('cccccccc-1111-1111-1111-111111111111', 'cr1', {
        headline: 'Deniz Manzaralı Villa',
      });
      await seedAd({
        id: 'aaaaaaaa-1111-1111-1111-111111111111',
        externalId: 'ad-100',
        name: 'Aktif Reklam',
        creativeId: 'cccccccc-1111-1111-1111-111111111111',
      });
      await seedAd({
        id: 'bbbbbbbb-2222-2222-2222-222222222222',
        externalId: 'ad-200',
        name: 'Duraklatılmış Reklam',
        status: 'paused',
      });
      await seedAd({
        id: 'dddddddd-3333-3333-3333-333333333333',
        externalId: 'ad-300',
        name: 'Reddedilmiş Reklam',
        reviewStatus: 'DISAPPROVED',
        disapproval: { global: { Alkol: 'Yaş sınırı gerekli' } },
      });
    });

    it('duruma göre süzer', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, status: 'paused' });
      expect(res.rows.map((r) => r.name)).toEqual(['Duraklatılmış Reklam']);
    });

    it('yalnızca sorunlu reklamları süzer', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, onlyIssues: true });
      expect(res.rows.map((r) => r.name)).toEqual(['Reddedilmiş Reklam']);
      expect(res.rows[0]!.issues).toHaveLength(1);
      expect(res.rows[0]!.issues[0]!.topic).toBe('Alkol');
    });

    it('reklam ADINDA arar', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, q: 'Duraklat' });
      expect(res.rows).toHaveLength(1);
    });

    it('CREATIVE METNİNDE de arar — kullanıcı cümleyi hatırlıyor', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, q: 'Deniz Manzaralı' });
      expect(res.rows.map((r) => r.name)).toEqual(['Aktif Reklam']);
    });

    it('dış kimlikle tam eşleşme arar', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, q: 'ad-200' });
      expect(res.rows.map((r) => r.name)).toEqual(['Duraklatılmış Reklam']);
    });

    it('kampanyaya göre süzer', async () => {
      const res = await svc.explore(CTX, { ...QUERY_BASE, campaignId: CAMPAIGN });
      expect(res.total).toBe(3);
      const other = await svc.explore(CTX, {
        ...QUERY_BASE,
        campaignId: '00000000-0000-0000-0000-000000000000',
      });
      expect(other.total).toBe(0);
    });
  });

  describe('creative ve silinme', () => {
    it('creative içeriğini döner', async () => {
      await seedCreative('cccccccc-1111-1111-1111-111111111111', 'cr1');
      await seedAd({
        id: 'aaaaaaaa-1111-1111-1111-111111111111',
        externalId: 'a1',
        name: 'R1',
        creativeId: 'cccccccc-1111-1111-1111-111111111111',
      });

      const res = await svc.explore(CTX, QUERY_BASE);
      const creative = res.rows[0]!.creative;
      expect(creative).not.toBeNull();
      expect(creative!.headline).toBe('Ailenize Yeni Bir Yuva');
      expect(creative!.ctaType).toBe('LEARN_MORE');
      expect(creative!.assetUrls).toEqual(['https://img/1.jpg']);
    });

    it('creative yoksa null — satır yine görünüyor', async () => {
      await seedAd({ id: 'aaaaaaaa-1111-1111-1111-111111111111', externalId: 'a1', name: 'R1' });
      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.rows[0]!.creative).toBeNull();
    });

    it('silinmiş reklam GÖRÜNÜYOR ve işaretli', async () => {
      // Platformda silinen reklamın geçmiş metrikleri raporda kalmalı;
      // listeden düşürmek geçmişi yok saymak olurdu.
      await seedAd({
        id: 'aaaaaaaa-1111-1111-1111-111111111111',
        externalId: 'a1',
        name: 'Silinmiş',
        deleted: true,
      });
      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.rows[0]!.deleted).toBe(true);
    });
  });

  describe('facet sayımları', () => {
    it('kampanya, durum ve sorun sayılarını verir', async () => {
      await seedAd({ id: 'aaaaaaaa-1111-1111-1111-111111111111', externalId: 'a1', name: 'A' });
      await seedAd({
        id: 'bbbbbbbb-2222-2222-2222-222222222222',
        externalId: 'a2',
        name: 'B',
        status: 'paused',
      });
      await seedAd({
        id: 'dddddddd-3333-3333-3333-333333333333',
        externalId: 'a3',
        name: 'C',
        reviewStatus: 'DISAPPROVED',
      });

      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.facets.campaigns).toEqual([{ id: CAMPAIGN, name: 'Kampanya A', adCount: 3 }]);
      expect(res.facets.statuses.find((s) => s.status === 'paused')?.count).toBe(1);
      expect(res.facets.issueCount).toBe(1);
    });

    it('reklam hesabı facet sayımı verilir', async () => {
      await seedAd({ id: 'a1111111-1111-1111-1111-111111111111', externalId: 'a1', name: 'A' });
      await seedAd({ id: 'a2222222-2222-2222-2222-222222222222', externalId: 'a2', name: 'B' });

      const res = await svc.explore(CTX, QUERY_BASE);
      expect(res.facets.adAccounts).toEqual([
        { id: IDS.adAccount, name: 'Hesap', platform: 'meta', adCount: 2 },
      ]);
    });

    it('hesap seçiliyse kampanya listesi O HESABA daralıyor', async () => {
      // Ajans görünümünde onlarca kampanya var; hepsini listelemek süzgeç
      // panelini kullanılamaz hâle getiriyor.
      await seedAd({ id: 'a1111111-1111-1111-1111-111111111111', externalId: 'a1', name: 'A' });

      const scoped = await svc.explore(CTX, { ...QUERY_BASE, adAccountId: IDS.adAccount });
      expect(scoped.facets.campaigns).toHaveLength(1);

      const other = await svc.explore(CTX, {
        ...QUERY_BASE,
        adAccountId: '00000000-0000-0000-0000-000000000000',
      });
      expect(other.facets.campaigns).toHaveLength(0);
    });

    it('facet sayımları TARİH ARALIĞINDAN bağımsız', async () => {
      // Süzgeç panelinde bir kampanyanın "dün harcama yoktu" diye kaybolması
      // kullanıcıyı şaşırtıyor.
      await seedAd({ id: 'aaaaaaaa-1111-1111-1111-111111111111', externalId: 'a1', name: 'A' });
      const res = await svc.explore(CTX, { ...QUERY_BASE, from: '2020-01-01', to: '2020-01-02' });
      expect(res.facets.campaigns[0]!.adCount).toBe(1);
    });
  });

  describe('sayfalama', () => {
    it('sayfa ve sayfa boyutu uygulanır', async () => {
      for (let i = 1; i <= 5; i++) {
        await seedAd({
          id: `aaaaaaaa-1111-1111-1111-00000000000${i}`,
          externalId: `a${i}`,
          name: `R${i}`,
        });
      }
      const first = await svc.explore(CTX, { ...QUERY_BASE, sort: 'name', dir: 'asc', pageSize: 2 });
      const second = await svc.explore(CTX, {
        ...QUERY_BASE,
        sort: 'name',
        dir: 'asc',
        pageSize: 2,
        page: 2,
      });
      expect(first.rows.map((r) => r.name)).toEqual(['R1', 'R2']);
      expect(second.rows.map((r) => r.name)).toEqual(['R3', 'R4']);
      expect(first.total).toBe(5);
    });
  });
});

describe('AdsService.detail', () => {
  const AD_ID = 'aaaaaaaa-1111-1111-1111-111111111111';

  beforeEach(async () => {
    await seedCreative('cccccccc-1111-1111-1111-111111111111', 'cr1');
    await seedAd({
      id: AD_ID,
      externalId: 'a1',
      name: 'R1',
      creativeId: 'cccccccc-1111-1111-1111-111111111111',
    });
  });

  it('günlük seyri sıralı döner', async () => {
    for (const [date, spend] of [
      ['2026-08-05', '2000000'],
      ['2026-08-04', '1000000'],
    ] as const) {
      await seedAdMetrics({
        adId: AD_ID,
        externalId: 'a1',
        date,
        spendMicros: spend,
        impressions: 100,
        clicks: 10,
        conversions: 1,
        reach: 80,
      });
    }

    const d = await svc.detail(CTX, AD_ID, RANGE.from, RANGE.to);
    expect(d.daily.map((x) => x.date)).toEqual(['2026-08-04', '2026-08-05']);
    expect(d.daily.map((x) => x.spendMicros)).toEqual(['1000000', '2000000']);
    expect(d.spendMicros).toBe('3000000');
  });

  it('erişim çok günde ORTALAMA, toplam değil', async () => {
    for (const date of ['2026-08-04', '2026-08-05']) {
      await seedAdMetrics({
        adId: AD_ID,
        externalId: 'a1',
        date,
        spendMicros: '1000000',
        impressions: 100,
        clicks: 10,
        conversions: 0,
        reach: 80,
      });
    }
    const d = await svc.detail(CTX, AD_ID, RANGE.from, RANGE.to);
    expect(d.reach).toBe(80);
    expect(d.reachKind).toBe('daily_average');
  });

  it('tek günde erişim TAM', async () => {
    await seedAdMetrics({
      adId: AD_ID,
      externalId: 'a1',
      date: '2026-08-05',
      spendMicros: '1000000',
      impressions: 100,
      clicks: 10,
      conversions: 0,
      reach: 80,
    });
    const d = await svc.detail(CTX, AD_ID, '2026-08-05', '2026-08-05');
    expect(d.reach).toBe(80);
    expect(d.reachKind).toBe('exact');
  });

  it('ham platform alanlarını döner', async () => {
    const d = await svc.detail(CTX, AD_ID, RANGE.from, RANGE.to);
    expect(JSON.stringify(d.raw)).toContain('a1');
  });

  it('olmayan reklam için bulunamadı', async () => {
    await expect(
      svc.detail(CTX, '00000000-0000-0000-0000-000000000000', RANGE.from, RANGE.to),
    ).rejects.toThrow(/bulunamadı/);
  });

  it('metriği olmayan reklamda da detay açılır', async () => {
    const d = await svc.detail(CTX, AD_ID, RANGE.from, RANGE.to);
    expect(d.daily).toEqual([]);
    expect(d.spendMicros).toBe('0');
    expect(d.reach).toBeNull();
  });
});
