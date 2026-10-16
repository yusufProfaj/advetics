import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { kitleImzasi, kitlelereGoreTopla, kitleImzasiOzeti, type KitleSetGirdisi, type TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * ═══ HEDEF KİTLE PERFORMANSI ═══
 *
 * Reklam Yöneticisi › Hedef kitleler: "hangi kitleden ne dönüş geldi".
 * Meta'nın ilgi alanı kırılımı yok; kitle setin hedeflemesinden okunuyor ve
 * aynı hedeflemeli setler tek satırda toplanıyor. İki tehlike sınanıyor:
 *   (1) Meta'nın geri okumada eklediği alanlar (location_types, sıralama)
 *       aynı kitleyi İKİ satıra bölüp toplamı dağıtmamalı;
 *   (2) hedeflemesi okunamayan set (Google) satırdan ATILMAMALI: toplam
 *       harcama sessizce eksik görünürdü.
 */
const set = (o: Partial<KitleSetGirdisi> & { setId: string }): KitleSetGirdisi => ({
  setAdi: o.setId,
  kampanyaAdi: null,
  platform: 'meta',
  targeting: null,
  currency: 'TRY',
  impressions: 1000,
  clicks: 10,
  spend: 100,
  conversions: 2,
  conversionValue: 0,
  ...o,
});

const GOLF_IZMIR = {
  geo_locations: { regions: [{ key: '35', name: 'İzmir' }], location_types: ['home', 'recent'] },
  age_min: 25,
  age_max: 44,
  genders: [2],
  flexible_spec: [{ interests: [{ id: '1', name: 'Golf' }, { id: '2', name: 'Otomobil' }] }],
};

describe('kitle imzası (saf)', () => {
  it('KRİTİK: Meta’nın eklediği alanlar ve sıra aynı kitleyi bölmüyor', () => {
    const a = kitleImzasi('meta', GOLF_IZMIR);
    const b = kitleImzasi('meta', {
      ...GOLF_IZMIR,
      geo_locations: { regions: [{ key: '35', name: 'İzmir' }] },
      flexible_spec: [{ interests: [{ id: '2', name: 'Otomobil' }, { id: '1', name: 'Golf' }] }],
      targeting_automation: { advantage_audience: 0 },
      brand_safety_content_filter_levels: ['FACEBOOK_STANDARD'],
    });
    expect(a.anahtar).toBe(b.anahtar);
    expect(kitleImzasiOzeti(a)).toBe('İzmir · 25-44 yaş · Kadın · ilgi: Golf, Otomobil');
  });

  it('farklı yaş farklı kitle; 65 "65 ve üzeri"', () => {
    expect(kitleImzasi('meta', { ...GOLF_IZMIR, age_max: 54 }).anahtar).not.toBe(kitleImzasi('meta', GOLF_IZMIR).anahtar);
    expect(kitleImzasiOzeti(kitleImzasi('meta', { geo_locations: { countries: ['TR'] }, age_min: 18, age_max: 65 }))).toBe('TR · 18+ yaş · geniş kitle');
  });

  it('adres çevresi koordinatla değil sayı ve yarıçapla yazılıyor', () => {
    const o = kitleImzasiOzeti(
      kitleImzasi('meta', {
        geo_locations: {
          custom_locations: [
            { latitude: 38.48907, longitude: 27.081299, radius: 8, distance_unit: 'kilometer' },
            { latitude: 38.566958, longitude: 27.063446, radius: 8, distance_unit: 'kilometer' },
          ],
        },
        age_min: 25,
      }),
    );
    expect(o).toBe('2 adres çevresi (8 km) · 25+ yaş · geniş kitle');
    expect(o).not.toContain('38.48907');
  });

  it('özel kitle ve hariç tutulan kitle özette', () => {
    const o = kitleImzasiOzeti(
      kitleImzasi('meta', {
        geo_locations: { countries: ['TR'] },
        custom_audiences: [{ id: '9', name: 'Site ziyaretçileri' }],
        excluded_custom_audiences: [{ id: '8', name: 'Alıcılar' }],
      }),
    );
    expect(o).toContain('özel kitle: Site ziyaretçileri');
    expect(o).toContain('1 kitle hariç');
  });

  it('Google ve hedeflemesiz set "bilinmiyor", NEDENİYLE', () => {
    const g = kitleImzasi('google', null);
    expect(g.tur).toBe('bilinmiyor');
    expect(g.tur === 'bilinmiyor' && g.neden).toMatch(/Google/);
  });
});

describe('kitlelere göre toplama (saf)', () => {
  it('KRİTİK: aynı kitledeki setler toplanır, hedeflemesiz setler ATILMAZ', () => {
    const r = kitlelereGoreTopla([
      set({ setId: 'a', targeting: GOLF_IZMIR, spend: 300, conversions: 3 }),
      set({ setId: 'b', targeting: { ...GOLF_IZMIR, geo_locations: { regions: [{ key: '35', name: 'İzmir' }] } }, spend: 200, conversions: 2 }),
      set({ setId: 'c', targeting: { geo_locations: { countries: ['TR'] } }, spend: 50, conversions: 0 }),
      set({ setId: 'g', platform: 'google', spend: 70, conversions: 1 }),
    ]);
    expect(r.toplamSet).toBe(4);
    expect(r.satirlar).toHaveLength(3);
    const golf = r.satirlar[0]!;
    expect(golf).toMatchObject({ setSayisi: 2, spend: 500, conversions: 5, cpa: 100, ornekSetId: 'a' });
    // Bilinmeyen en sonda ama SAYILIYOR: dört setin harcamasının tamamı satırlarda.
    expect(r.satirlar.at(-1)).toMatchObject({ tur: 'bilinmiyor', platform: 'google', spend: 70 });
    expect(r.satirlar.reduce((a, s) => a + s.spend, 0)).toBe(620);
    // Dönüşümsüz kitlede EBM tanımsız, sıfır değil.
    expect(r.satirlar.find((s) => s.setSayisi === 1 && s.tur === 'hedefleme')!.cpa).toBeNull();
  });

  it('para birimi farklı setler aynı satıra girmiyor', () => {
    const r = kitlelereGoreTopla([set({ setId: 'a', targeting: GOLF_IZMIR }), set({ setId: 'b', targeting: GOLF_IZMIR, currency: 'USD' })]);
    expect(r.satirlar).toHaveLength(2);
  });

  it('sınır aşılırsa gizlenen sayısı söylenir', () => {
    const r = kitlelereGoreTopla(
      [1, 2, 3].map((i) => set({ setId: `s${i}`, targeting: { age_min: 18 + i } })),
      2,
    );
    expect(r.satirlar).toHaveLength(2);
    expect(r.gizlenenKitle).toBe(1);
  });
});

describe('MetricsService.kitleler (gerçek sorgu)', () => {
  let h: Harness;
  let svc: MetricsService;
  const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;
  const KAMPANYA = '66666666-6666-4666-8666-666666666661';
  const SETLER = ['77777777-7777-4777-8777-777777777771', '77777777-7777-4777-8777-777777777772', '77777777-7777-4777-8777-777777777773'];

  beforeAll(async () => {
    h = await createHarness();
    svc = new MetricsService({ withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService);
  });
  afterAll(async () => h.close());
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    await h.q(`UPDATE ad_accounts SET sync_enabled = true WHERE id = $1`, [IDS.adAccount]);
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
       VALUES ($1, $2, $3, 'meta', 'c1', 'Kampanya A', 'active', 'daily', now())`,
      [KAMPANYA, IDS.adAccount, IDS.client],
    );
    const hedefler = [GOLF_IZMIR, { ...GOLF_IZMIR, geo_locations: { regions: [{ key: '35', name: 'İzmir' }] } }, { geo_locations: { countries: ['TR'] } }];
    for (const [i, id] of SETLER.entries()) {
      await h.q(
        `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, targeting, updated_at)
         VALUES ($1, $2, $3, $4, 'meta', $5, $6, 'active', 'none', $7::jsonb, now())`,
        [id, KAMPANYA, IDS.adAccount, IDS.client, `g${i}`, `Set ${i}`, JSON.stringify(hedefler[i])],
      );
      // Kampanya seviyesi satırı TEK (toplam 600 ₺): sorgu onu saymamalı.
      const seviyeler = i === 0 ? ([['ad_group', id, (i + 1) * 100_000_000], ['campaign', KAMPANYA, 600_000_000]] as const) : ([['ad_group', id, (i + 1) * 100_000_000]] as const);
      for (const [seviye, varlik, harcama] of seviyeler) {
        await h.q(
          `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
             date, breakdown_key, impressions, clicks, spend_micros, conversions, conversion_value_micros, currency, reach)
           VALUES ($1, $2, 'meta', $3::"EntityLevel", $4, $5, '2026-10-05', '', 1000, 10, $6, 2, 0, 'TRY', 0)`,
          [IDS.client, IDS.adAccount, seviye, varlik, `x${i}`, String(harcama)],
        );
      }
    }
  });

  it('KRİTİK: setin harcaması kitle satırına bir kez, kampanya seviyesi karışmadan', async () => {
    const r = await svc.kitleler(CTX, { from: '2026-10-01', to: '2026-10-31' } as never);
    expect(r.toplamSet).toBe(3);
    expect(r.setSiniri).toBeNull();
    expect(r.satirlar).toHaveLength(2);
    const golf = r.satirlar.find((s) => s.ozet.includes('Golf'))!;
    // 100 + 200 ₺ (iki set aynı kitle); kampanya seviyesi satırları sayılsaydı iki katı olurdu.
    expect(golf).toMatchObject({ setSayisi: 2, spend: 300, conversions: 4 });
    expect(r.satirlar.reduce((a, s) => a + s.spend, 0)).toBe(600);
  });

  it('KRİTİK: kampanya düzeyinde set karşılığı olmayan harcama SÖYLENİYOR (canlı ölçüm, 2026-10-16)', async () => {
    expect((await svc.kitleler(CTX, { from: '2026-10-01', to: '2026-10-31' } as never)).setDisiHarcama).toEqual([]);
    await h.q(`UPDATE insights_daily SET spend_micros = 700000000 WHERE entity_level = 'campaign'`);
    const r = await svc.kitleler(CTX, { from: '2026-10-01', to: '2026-10-31' } as never);
    expect(r.setDisiHarcama).toEqual([{ currency: 'TRY', tutar: 100 }]);
  });

  it('dönem dışı harcama girmiyor', async () => {
    const r = await svc.kitleler(CTX, { from: '2026-10-06', to: '2026-10-31' } as never);
    expect(r.satirlar).toEqual([]);
  });
});
