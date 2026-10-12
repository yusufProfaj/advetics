import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignActionsService } from '../campaign-actions/campaign-actions.service';
import { etkiIsi, isNotu, type TxLike } from './etki-hesap';

/**
 * ═══ ETKİ İŞİ — GERÇEK VERİTABANI (PGlite) ═══
 *
 * Keşif ve değerlendirme GERÇEK sorgularıyla koşuyor (kopya sorgu yok).
 * Fark içinde fark hesabı ÇALIŞTIRILARAK sınanıyor: elle hesaplanmış
 * sayılar (aşağıda yorumda) işin yazdığı `etki_orani` ile karşılaştırılıyor.
 *
 * Takvim: değişiklik 1 Eylül (İstanbul). Öncesi 18-31 Ağustos, plasebo
 * 4-17 Ağustos, 7. gün sonrası 2-8 Eylül, ölçüm en erken 12 Eylül
 * (8 + 3 gün dönüşüm bekleme + 1).
 */

let h: Harness;
const db = () => h.db as unknown as TxLike;

const K1 = 'c1000000-0000-4000-8000-000000000001';
const K2 = 'c2000000-0000-4000-8000-000000000002';
const K3 = 'c3000000-0000-4000-8000-000000000003';
const S1A = 'a1a00000-0000-4000-8000-0000000000a1';
const S1B = 'a1b00000-0000-4000-8000-0000000000b1';
const S2 = 'a2000000-0000-4000-8000-000000000002';
const S3 = 'a3000000-0000-4000-8000-000000000003';
const R1 = 'f1000000-0000-4000-8000-000000000001';
const R2 = 'f2000000-0000-4000-8000-000000000002';
const CLIENT_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const RULE = 'e0000000-0000-4000-8000-00000000000e';
const RUN = 'e1000000-0000-4000-8000-00000000000e';

const DEGISIKLIK = '2026-09-01T09:00:00Z';
const ILK_OLCUM = '2026-09-12';
const simdi = (gun: string) => new Date(`${gun}T05:00:00Z`);

function gunler(bas: string, son: string): string[] {
  const r: string[] = [];
  for (let d = new Date(`${bas}T00:00:00Z`); d.toISOString().slice(0, 10) <= son; d.setUTCDate(d.getUTCDate() + 1)) {
    r.push(d.toISOString().slice(0, 10));
  }
  return r;
}

/** Bir varlığın günlük metriği, aralıktaki her gün aynı. */
async function metrik(
  seviye: 'campaign' | 'ad_group',
  id: string,
  bas: string,
  son: string,
  g: { harcamaTl: number; tik: number; donusum: number },
): Promise<void> {
  for (const gun of gunler(bas, son)) {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
       VALUES ($1, $2, 'meta', $3, $4, $5, $6, '', 1000, $7, 0, $8, $9, 0, 'TRY')
       ON CONFLICT DO NOTHING`,
      [IDS.client, IDS.adAccount, seviye, id, `x-${id.slice(0, 4)}`, gun, g.tik, String(g.harcamaTl * 1_000_000), g.donusum],
    );
  }
}

const OLAGAN = { harcamaTl: 1000, tik: 100, donusum: 10 }; // TBM 10, DBM 100
const KONTROL = { harcamaTl: 2000, tik: 200, donusum: 20 }; // DBM 100

async function denetim(o: {
  action: string;
  target: string;
  zaman?: string;
  before?: unknown;
  after?: unknown;
  actorType?: 'user' | 'rule';
}): Promise<string> {
  const [r] = await h.q<{ id: string }>(
    `INSERT INTO audit_logs (org_id, client_id, actor_type, actor_id, action, target_type, target_id, before, after, created_at)
     VALUES ($1, $2, $3::"ActorType", $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::timestamptz) RETURNING id::text AS id`,
    [
      IDS.org,
      IDS.client,
      o.actorType ?? 'user',
      o.actorType === 'rule' ? null : IDS.user,
      o.action,
      o.action.split('.')[0],
      o.target,
      JSON.stringify(o.before ?? { status: 'active', budgetMode: 'daily', budgetAmountMicros: '1000000000' }),
      JSON.stringify(o.after ?? {}),
      o.zaman ?? DEGISIKLIK,
    ],
  );
  return r!.id;
}

const butceSonrasi = (mikros: string, iz?: unknown) => ({
  istenen: { amountMicros: mikros, budgetMode: 'daily' },
  dogrulama: 'dogrulandi',
  platformDegeri: 'x',
  ...(iz ? { iz } : {}),
});

async function satirlar() {
  return h.q<{
    kaynak: string;
    kaynak_id: string;
    yol: string;
    yol_ref: string | null;
    kim: string | null;
    tur: string;
    seviye: string;
    varlik_id: string;
    kapsam_seviye: string;
    kapsam_id: string;
    gun: string;
    durum: string;
    sonuc: string | null;
    neden: string | null;
    metrik: string | null;
    etki: number | null;
    nokta: number | null;
    sonraki: string | null;
    birlikte: number;
    olcum: { kontrol?: { varliklar: string[] } | null } | null;
    gozlem: Record<string, unknown> | null;
    client_id: string;
  }>(`SELECT kaynak, kaynak_id, yol, yol_ref, kim, tur, seviye::text, varlik_id::text, kapsam_seviye::text,
             kapsam_id::text, degisiklik_gunu::text AS gun, durum, sonuc, neden, metrik, etki_orani::float8 AS etki,
             nokta_gun::int AS nokta, sonraki_olcum::text AS sonraki, birlikte_olculen::int AS birlikte, olcum, gozlem,
             client_id::text
        FROM degisiklik_etkileri ORDER BY degisiklik_zamani, kaynak_id`);
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
  for (const [id, ad] of [
    [K1, 'Yeniden Pazarlama'],
    [K2, 'Marka'],
    [K3, 'Genel'],
  ] as const) {
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, budget_amount_micros, updated_at)
       VALUES ($1, $2, $3, 'meta', $4, $5, 'active', 'daily', 1000000000, now())`,
      [id, IDS.adAccount, IDS.client, `c-${id.slice(0, 2)}`, ad],
    );
  }
  for (const [id, k, ad] of [
    [S1A, K1, 'Set A'],
    [S1B, K1, 'Set B'],
    [S2, K2, 'Set 2'],
    [S3, K3, 'Set 3'],
  ] as const) {
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, budget_amount_micros, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', $5, $6, 'active', 'daily', 500000000, now())`,
      [id, k, IDS.adAccount, IDS.client, `g-${id.slice(0, 3)}`, ad],
    );
  }
  for (const [id, ad] of [
    [R1, 'Görsel A'],
    [R2, 'Görsel B'],
  ] as const) {
    await h.q(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', $5, $6, 'active', now())`,
      [id, S1A, IDS.adAccount, IDS.client, `r-${id.slice(0, 2)}`, ad],
    );
  }
});

describe('keşif', () => {
  it('KRİTİK: iz taşıyan bütçe değişikliği tek satır; yol, kim, kapsam ve hesap günü doğru; tekrar koşmak ikinci satır açmıyor', async () => {
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000', { yol: 'iyilestir', ref: 'butce:k1:2026-W36' }) });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    const r = await satirlar();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      kaynak: 'kampanya_eylemi',
      yol: 'iyilestir',
      yol_ref: 'butce:k1:2026-W36',
      kim: 'Test Kullanıcı',
      tur: 'butce_artir',
      seviye: 'campaign',
      kapsam_seviye: 'campaign',
      kapsam_id: K1,
      gun: '2026-09-01',
      durum: 'bekliyor',
      sonraki: ILK_OLCUM,
    });
  });

  it('KRİTİK: hesap günü HESABIN saat diliminde (gece 01:30 İstanbul = UTC önceki gün)', async () => {
    await denetim({ action: 'campaign.pause', target: K1, zaman: '2026-08-31T22:30:00Z', after: { status: 'paused' } });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    expect((await satirlar())[0]?.gun).toBe('2026-09-01');
  });

  it('KRİTİK: kural değişikliği İKİ KEZ ölçülmüyor (rule_action_logs tek kaynak, denetimdeki rule satırı dışarıda)', async () => {
    await h.q(
      `INSERT INTO rules (id, org_id, client_id, ad_account_id, name, level, conditions, action, guard, updated_at)
       VALUES ($1, $2, $3, $4, 'Yüksek maliyet', 'campaign', '[{"metric":"cpa","op":"gt","value":100}]'::jsonb, '{"type":"pause"}'::jsonb, '{}'::jsonb, now())`,
      [RULE, IDS.org, IDS.client, IDS.adAccount],
    );
    await h.q(`INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at) VALUES ($1, $2, $3, false, $4::timestamptz)`, [
      RUN,
      IDS.org,
      RULE,
      DEGISIKLIK,
    ]);
    await h.q(
      `INSERT INTO rule_action_logs (id, org_id, rule_id, run_id, entity_level, entity_id, entity_name, entity_external_id,
         action_type, outcome, reason, before_state, after_state, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'campaign', $4, 'Yeniden Pazarlama', 'c-c1', 'pause', 'applied', 'EBM yüksek',
               '{"status":"active"}'::jsonb, '{"status":"paused"}'::jsonb, $5::timestamptz)`,
      [IDS.org, RULE, RUN, K1, DEGISIKLIK],
    );
    // Savunma: kuralın denetim satırı en kötü hâlde bile (bizim UUID'imizle
    // ve kampanya eylemi adıyla) ikinci satır açmamalı.
    await denetim({ action: 'campaign.pause', target: K1, actorType: 'rule', after: { status: 'paused' } });
    // Ölçülmeyen kural sonucu (prova) satır açmıyor.
    await h.q(
      `INSERT INTO rule_action_logs (id, org_id, rule_id, run_id, entity_level, entity_id, entity_name, entity_external_id,
         action_type, outcome, reason, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'campaign', $4, 'Marka', 'c-c2', 'pause', 'simulated', 'x', $5::timestamptz)`,
      [IDS.org, RULE, RUN, K2, DEGISIKLIK],
    );
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    const r = await satirlar();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ kaynak: 'kural', yol: 'kural', yol_ref: RULE, kim: 'Yüksek maliyet', tur: 'durdur' });
  });

  it('KRİTİK: geri okuması uyuşmayan değişiklik keşifte "ölçülemedi · doğrulanmadı" ile kapanıyor', async () => {
    await denetim({ action: 'ad.pause', target: R1, after: { istenen: { type: 'pause' }, dogrulama: 'uyusmadi', platformDegeri: 'Yayında' } });
    const s = await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    expect(await satirlar()).toEqual([
      expect.objectContaining({ durum: 'olculemedi', neden: 'dogrulanmadi', sonraki: null, kapsam_seviye: 'ad_group', kapsam_id: S1A }),
    ]);
    expect(s.note).toContain('1 doğrulanmamış');
  });

  it('aynı bütçeyi yeniden yazmak ve okunamayan tutar ölçülmüyor; sayısı notta', async () => {
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1000000000') });
    await denetim({ action: 'campaign.set_budget', target: K2, before: { status: 'active' }, after: butceSonrasi('1200000000') });
    await denetim({ action: 'campaign.resume', target: K3, after: { status: 'active' } });
    const s = await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    expect(await satirlar()).toHaveLength(0);
    expect(s.note).toBe('keşif: 0 yeni (2 ölçülmez) · değerlendirme: 0');
  });

  it('eski İyileştir uygulaması (izsiz) ±10 dk içindeki kararla eşleniyor; dışındaki "bilinmiyor" kalıyor', async () => {
    await denetim({ action: 'campaign.pause', target: K1, after: { status: 'paused' } });
    await denetim({ action: 'campaign.pause', target: K2, after: { status: 'paused' } });
    for (const [k, dk, anahtar] of [
      [K1, 5, 'durdur:k1'],
      [K2, 20, 'durdur:k2'],
    ] as const) {
      await h.q(
        `INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, sonuc, user_id, created_at)
         VALUES ($1, $2, $3, 'butce', 'meta', 'uygulandi', $4::jsonb, '{}'::jsonb, $5, $6::timestamptz + make_interval(mins => $7::int))`,
        [IDS.org, IDS.client, anahtar, JSON.stringify({ varlik: { id: k } }), IDS.user, DEGISIKLIK, dk],
      );
    }
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    const r = await satirlar();
    expect(r.find((x) => x.varlik_id === K1)).toMatchObject({ yol: 'iyilestir', yol_ref: 'durdur:k1' });
    expect(r.find((x) => x.varlik_id === K2)).toMatchObject({ yol: 'bilinmiyor', yol_ref: null });
  });

  it('KRİTİK (uçtan uca): CampaignActionsService.uygula’nın yazdığı iz keşifte aynen okunuyor', async () => {
    const prisma = { withTenant: vi.fn(async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db)) } as unknown as PrismaService;
    const durumOku = vi.fn().mockResolvedValue({ status: 'paused', hamDurum: 'PAUSED', dailyBudgetMicros: null, lifetimeBudgetMicros: null });
    const providers = {
      get: () => ({ applyAction: vi.fn().mockResolvedValue({ afterState: {} }), durumOku, canWrite: () => ({ ok: true, missing: [] }) }),
    } as never;
    const svc = new CampaignActionsService(
      prisma,
      providers,
      { getAccessToken: async () => 't' } as never,
      { acquire: vi.fn().mockResolvedValue({ allowed: true }), record: vi.fn() } as never,
      new AuditService({} as never),
      { enqueue: vi.fn() } as never,
    );
    const ctx = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;
    await svc.uygula(ctx, { seviye: 'ad', id: R1 }, { type: 'pause' }, { iz: { yol: 'reklam_yoneticisi', ref: null } });
    await etkiIsi(db(), IDS.adAccount, '2099-01-01', new Date());
    expect(await satirlar()).toEqual([expect.objectContaining({ yol: 'reklam_yoneticisi', tur: 'durdur', kapsam_id: S1A })]);
  });
});

describe('değerlendirme — fark içinde fark', () => {
  async function standartMetrik(k1Sonra: { harcamaTl: number; tik: number; donusum: number }) {
    await metrik('campaign', K1, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('campaign', K1, '2026-09-01', '2026-09-30', k1Sonra);
    for (const k of [K2, K3]) await metrik('campaign', k, '2026-08-04', '2026-09-30', KONTROL);
  }

  it('KRİTİK: hüküm elle hesaplanan sayıyla aynı; kontrol grubu değişmeyen kampanyalar', async () => {
    /*
     * Deney (K1): öncesi DBM = 14.000 / 140 = 100; sonrası 1.000 ₺, 14 dönüşüm
     * → DBM = 7.000 / 98 = 71,43. Kontrol (K2+K3): DBM 100 → 100.
     * Etki = (71,43 / 100) / (100 / 100) − 1 = −0,2857 → iyileşti.
     */
    await standartMetrik({ harcamaTl: 1000, tik: 100, donusum: 14 });
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ durum: 'sonuclandi', sonuc: 'iyilesti', metrik: 'donusum_basi_maliyet', nokta: 7, sonraki: null, neden: null });
    expect(r!.etki).toBeCloseTo(1000 / 14 / 100 - 1, 6);
    expect(r!.olcum?.kontrol?.varliklar).toEqual([K2, K3]);
  });

  it('KRİTİK: pencerede KENDİ değişikliğimiz olan kampanya kontrolden çıkıyor (ama başka kampanyadaki değişiklik bunu karışık yapmıyor)', async () => {
    await standartMetrik({ harcamaTl: 1000, tik: 100, donusum: 14 });
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await denetim({ action: 'campaign.set_budget', target: K2, zaman: '2026-08-25T09:00:00Z', after: butceSonrasi('1500000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const r = (await satirlar()).find((x) => x.varlik_id === K1)!;
    expect(r).toMatchObject({ durum: 'sonuclandi', sonuc: 'iyilesti' });
    expect(r.olcum?.kontrol?.varliklar).toEqual([K3]);
  });

  it('KRİTİK: kontrol de aynı oranda değiştiyse etki sıfır ("belirgin fark yok") — düz önce/sonra DEĞİL', async () => {
    // Bütün hesap aynı hafta %40 ucuzladı: K1'in kendi düşüşü değişikliğin değil haftanın.
    await metrik('campaign', K1, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('campaign', K1, '2026-09-01', '2026-09-30', { harcamaTl: 600, tik: 100, donusum: 10 });
    for (const k of [K2, K3]) {
      await metrik('campaign', k, '2026-08-04', '2026-08-31', KONTROL);
      await metrik('campaign', k, '2026-09-01', '2026-09-30', { harcamaTl: 1200, tik: 200, donusum: 20 });
    }
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ durum: 'sonuclandi', sonuc: 'fark_yok' });
    expect(r!.etki).toBeCloseTo(0, 6);
  });

  it('KRİTİK: dönüşümler olgunlaşmadan ÖLÇÜLMÜYOR (sonraki ölçüm gününden önce satır bekliyor)', async () => {
    await standartMetrik({ harcamaTl: 1000, tik: 100, donusum: 14 });
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, '2026-09-11', simdi('2026-09-11'));
    expect((await satirlar())[0]).toMatchObject({ durum: 'bekliyor', sonuc: null, nokta: null });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'sonuclandi' });
  });

  it('KRİTİK (CBO): reklam seti bütçesinde aynı kampanyanın kardeş setleri kontrole GİRMİYOR', async () => {
    // Set A'nın bütçesi düşürüldü; Meta kampanya bütçesini Set B'ye aktardı.
    await metrik('ad_group', S1A, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('ad_group', S1A, '2026-09-01', '2026-09-30', { harcamaTl: 500, tik: 50, donusum: 8 });
    await metrik('ad_group', S1B, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('ad_group', S1B, '2026-09-01', '2026-09-30', { harcamaTl: 1500, tik: 150, donusum: 10 });
    for (const s of [S2, S3]) await metrik('ad_group', s, '2026-08-04', '2026-09-30', KONTROL);
    await denetim({ action: 'ad_group.set_budget', target: S1A, before: { status: 'active', budgetMode: 'daily', budgetAmountMicros: '500000000' }, after: butceSonrasi('300000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ tur: 'butce_azalt', kapsam_seviye: 'ad_group', kapsam_id: S1A, durum: 'sonuclandi' });
    expect(r!.olcum?.kontrol?.varliklar).toEqual([S2, S3]);
    // DBM 100 → 62,5; kontrol sabit → −0,375.
    expect(r!.etki).toBeCloseTo(500 / 8 / 100 - 1, 6);
  });

  it('KRİTİK: aynı kampanyada pencere içinde başka değişiklik → "karışık"; aynı gün aynı tür → birlikte ölçülüyor', async () => {
    await standartMetrik({ harcamaTl: 1000, tik: 100, donusum: 14 });
    await metrik('ad_group', S1A, '2026-08-04', '2026-09-30', OLAGAN);
    for (const s of [S2, S3]) await metrik('ad_group', s, '2026-08-04', '2026-09-30', KONTROL);
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await denetim({ action: 'ad.pause', target: R1, zaman: '2026-09-05T09:00:00Z', after: { status: 'paused' } });
    await denetim({ action: 'ad.pause', target: R2, zaman: '2026-09-05T10:00:00Z', after: { status: 'paused' } });
    await etkiIsi(db(), IDS.adAccount, '2026-09-30', simdi('2026-09-30'));
    const r = await satirlar();
    expect(r.find((x) => x.varlik_id === K1)).toMatchObject({ durum: 'olculemedi', neden: 'karisik' });
    // İki reklam aynı gün durduruldu: birbirini karıştırmıyor ama 1 Eylül'deki
    // bütçe değişikliği onların plasebo penceresinde → onlar da karışık.
    expect(r.filter((x) => x.seviye === 'ad').map((x) => [x.neden, x.birlikte])).toEqual([
      ['karisik', 1],
      ['karisik', 1],
    ]);
  });

  it('aynı gün aynı türde iki reklam durdurmak (başka değişiklik yokken) karışık DEĞİL, birlikte ölçülüyor', async () => {
    await metrik('ad_group', S1A, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('ad_group', S1A, '2026-09-01', '2026-09-30', { harcamaTl: 1000, tik: 100, donusum: 12 });
    for (const s of [S2, S3]) await metrik('ad_group', s, '2026-08-04', '2026-09-30', KONTROL);
    await denetim({ action: 'ad.pause', target: R1, after: { status: 'paused' } });
    await denetim({ action: 'ad.pause', target: R2, zaman: '2026-09-01T10:00:00Z', after: { status: 'paused' } });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const r = await satirlar();
    expect(r.map((x) => [x.durum, x.birlikte, x.kapsam_id])).toEqual([
      ['sonuclandi', 1, S1A],
      ['sonuclandi', 1, S1A],
    ]);
  });

  it('KRİTİK: kampanya durdurma → kontrol yok, "ölçülemedi" + GÖZLEM (hüküm yok)', async () => {
    await standartMetrik({ harcamaTl: 0, tik: 0, donusum: 0 });
    await denetim({ action: 'campaign.pause', target: K1, after: { status: 'paused' } });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ kapsam_seviye: 'account', kapsam_id: IDS.adAccount, durum: 'olculemedi', neden: 'kontrol_grubu_yok', sonuc: null, etki: null });
    expect(r!.gozlem).toMatchObject({ onceGunlukDonusum: 10, sonraGunlukDonusum: 0 });
    expect(String(r!.gozlem!.onceGunlukHarcama)).toContain('1.000');
    expect(String(r!.gozlem!.sonraGunlukHarcama)).toMatch(/^0/);
  });

  it('KRİTİK: hesap ölçüm sırasında başka workspace’e taşındıysa "hesap taşındı" (yeni workspace’in harcaması eskisine yazılmıyor)', async () => {
    await standartMetrik({ harcamaTl: 1000, tik: 100, donusum: 14 });
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [CLIENT_B, IDS.org]);
    await h.q(`UPDATE ad_accounts SET client_id = $1 WHERE id = $2`, [CLIENT_B, IDS.adAccount]);
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'olculemedi', neden: 'hesap_tasindi', client_id: IDS.client });
  });

  it('KRİTİK: hacim yetmezse 7 → 14 → 28. gün; son noktada "belli olmadı" ile KAPANIYOR (sonsuz açık satır yok)', async () => {
    const az = { harcamaTl: 50, tik: 5, donusum: 0 };
    await metrik('campaign', K1, '2026-08-04', '2026-10-30', az);
    for (const k of [K2, K3]) await metrik('campaign', k, '2026-08-04', '2026-10-30', az);
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'olcumde', sonuc: 'henuz_belli_degil', neden: 'hacim_yetersiz', nokta: 7, sonraki: '2026-09-19' });
    await etkiIsi(db(), IDS.adAccount, '2026-09-19', simdi('2026-09-19'));
    expect((await satirlar())[0]).toMatchObject({ durum: 'olcumde', nokta: 14, sonraki: '2026-10-03' });
    const s = await etkiIsi(db(), IDS.adAccount, '2026-10-03', simdi('2026-10-03'));
    expect((await satirlar())[0]).toMatchObject({ durum: 'sonuclandi', sonuc: 'belirsiz', nokta: 28, sonraki: null });
    expect(s.note).toContain('1 sonuçlandı');
    // Kapanmış satır bir daha taranmıyor (etkiGecisi kapanmış satırda patlardı).
    await expect(etkiIsi(db(), IDS.adAccount, '2026-12-01', simdi('2026-12-01'))).resolves.toMatchObject({ degerlendirme: { bakilan: 0 } });
  });

  it('kapsamın sonrası penceresinde hiç veri yoksa "veri yok"', async () => {
    await metrik('ad_group', S1A, '2026-08-04', '2026-08-31', OLAGAN);
    await denetim({ action: 'ad.pause', target: R1, after: { status: 'paused' } });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'olculemedi', neden: 'veri_yok' });
  });
});

describe('iş notu', () => {
  it('sıfır satırlık koşu da nedenini söylüyor (succeeded + rows=0 notsuz değil)', async () => {
    const s = await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect(s.rows).toBe(0);
    expect(s.note).toBe('keşif: 0 yeni · değerlendirme: 0');
  });

  it('atanmamış hesapta keşif yok ve not söylüyor', () => {
    expect(isNotu({ yeni: 0, olculmez: 0, dogrulanmadi: 0, varlikYok: 0 }, { bakilan: 1, sonuclandi: 0, henuz: 0, olculemedi: { hesap_tasindi: 1 } }, true)).toBe(
      'keşif: hesap bir workspace’e atanmamış, atlandı · değerlendirme: 1 (0 sonuçlandı, 0 henüz, 1 hesap taşındı)',
    );
  });
});

/*
 * ═══ AJAN 4 · KAPI BULGULARI (2026-10-12) ═══
 *
 * Aşağıdaki iki test KIRMIZI bırakıldı (düzeltme Ajan 2'nin): ikisi de
 * "ölçülen değişiklik" ile "ölçümü bozan değişiklik" sınırının yanlış
 * yerde çizildiğini gösteriyor. Hata yok, log yok; ekranda yanlış bir
 * "İyileşti" yazar.
 */
describe('Ajan 4 kapı — ölçülmeyen ama ölçümü bozan değişiklikler', () => {
  it('BULGU Ö-1: zaten DURMUŞ bir varlığı yeniden "durdur"mak değişiklik değil; ölçüm satırı açmamalı (aynı bütçeyi yeniden yazmanın eşi)', async () => {
    // Reklam Yöneticisi satır içi düğmesi ya da asistan, aynada hâlâ "active"
    // görünen ama platformda çoktan durmuş bir varlığa "durdur" gönderebilir;
    // denetim kaydının before.status'u bunu söylüyor. Etkisi ölçülürse
    // değişmemiş bir şeyin "etkisi" ekrana yazılır.
    await denetim({
      action: 'ad_group.pause',
      target: S1A,
      before: { status: 'paused', budgetMode: 'daily', budgetAmountMicros: '500000000' },
      after: { istenen: { type: 'pause' }, dogrulama: 'dogrulandi', platformDegeri: 'Duraklatıldı' },
    });
    const s = await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    expect(await satirlar()).toHaveLength(0);
    expect(s.note).toContain('1 ölçülmez');
  });

  it('BULGU Ö-2: aynı kapsamda pencere içinde Advetics’ten yapılan YENİDEN BAŞLATMA ölçümü "karışık" yapmalı', async () => {
    // R1 1 Eylül'de durduruldu; aynı setteki R2 3 Eylül'de yeniden başlatıldı.
    // Set seviyesindeki sonrası penceresi iki değişikliğin toplamı; resume
    // OLCULMEYEN_DEGISIKLIKLER'de olduğu için satır açmıyor ve karışıklık
    // sorgusu (degisiklik_etkileri üzerinde) onu HİÇ görmüyor.
    await metrik('ad_group', S1A, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('ad_group', S1A, '2026-09-01', '2026-09-30', { harcamaTl: 1000, tik: 100, donusum: 14 });
    for (const s of [S2, S3]) await metrik('ad_group', s, '2026-08-04', '2026-09-30', KONTROL);
    await denetim({ action: 'ad.pause', target: R1, after: { istenen: { type: 'pause' }, dogrulama: 'dogrulandi', platformDegeri: 'x' } });
    await denetim({
      action: 'ad.resume',
      target: R2,
      zaman: '2026-09-03T09:00:00Z',
      before: { status: 'paused' },
      after: { istenen: { type: 'resume' }, dogrulama: 'dogrulandi', platformDegeri: 'x' },
    });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const r = (await satirlar()).find((x) => x.varlik_id === R1)!;
    expect(r).toMatchObject({ durum: 'olculemedi', neden: 'karisik' });
  });
});

describe('Ajan 2 düzeltmeleri — Ö-1, Ö-2, N-1', () => {
  async function kural() {
    await h.q(
      `INSERT INTO rules (id, org_id, client_id, ad_account_id, name, level, conditions, action, guard, updated_at)
       VALUES ($1, $2, $3, $4, 'Gece başlat', 'ad', '[{"metric":"cpa","op":"gt","value":100}]'::jsonb, '{"type":"resume"}'::jsonb, '{}'::jsonb, now())`,
      [RULE, IDS.org, IDS.client, IDS.adAccount],
    );
    await h.q(`INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at) VALUES ($1, $2, $3, false, $4::timestamptz)`, [RUN, IDS.org, RULE, DEGISIKLIK]);
  }
  async function kuralEylemi(eylem: string, varlik: string, zaman: string, once: unknown, sonra: unknown) {
    await h.q(
      `INSERT INTO rule_action_logs (id, org_id, rule_id, run_id, entity_level, entity_id, entity_name, entity_external_id,
         action_type, outcome, reason, before_state, after_state, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'ad', $4, 'x', 'x', $5, 'applied', 'x', $6::jsonb, $7::jsonb, $8::timestamptz)`,
      [IDS.org, RULE, RUN, varlik, eylem, JSON.stringify(once), JSON.stringify(sonra), zaman],
    );
  }
  async function setMetrigi() {
    await metrik('ad_group', S1A, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('ad_group', S1A, '2026-09-01', '2026-09-30', { harcamaTl: 1000, tik: 100, donusum: 14 });
    for (const s of [S2, S3]) await metrik('ad_group', s, '2026-08-04', '2026-09-30', KONTROL);
  }
  const durdurR1 = () =>
    denetim({ action: 'ad.pause', target: R1, after: { istenen: { type: 'pause' }, dogrulama: 'dogrulandi', platformDegeri: 'x' } });

  it('Ö-1 (kural kaynağı): kural zaten durmuş varlığı "durdurduysa" satır açılmıyor', async () => {
    await kural();
    await kuralEylemi('pause', R1, DEGISIKLIK, { status: 'paused' }, { status: 'paused' });
    const s = await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    expect(await satirlar()).toHaveLength(0);
    expect(s.note).toContain('1 ölçülmez');
  });

  it('Ö-1 sınırı: önceki durumu BİLİNMEYEN durdurma ölçülüyor (eski kayıtlar sessizce ölçümsüz kalmasın)', async () => {
    await denetim({ action: 'ad.pause', target: R1, before: {}, after: { status: 'paused' } });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    expect(await satirlar()).toEqual([expect.objectContaining({ tur: 'durdur', durum: 'bekliyor' })]);
  });

  it('Ö-2: kuralın YENİDEN BAŞLATMASI (rule_action_logs) da ölçümü karışık yapıyor', async () => {
    await setMetrigi();
    await kural();
    await durdurR1();
    await kuralEylemi('resume', R2, '2026-09-03T09:00:00Z', { status: 'paused' }, { status: 'active' });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar()).find((x) => x.varlik_id === R1)).toMatchObject({ durum: 'olculemedi', neden: 'karisik' });
  });

  it('Ö-2: aynı kampanyada pencere içinde AYNI DEĞERİ yeniden yazan bütçe de karışık', async () => {
    await setMetrigi();
    await durdurR1();
    await denetim({
      action: 'ad_group.set_budget',
      target: S1B,
      zaman: '2026-09-04T09:00:00Z',
      before: { status: 'active', budgetMode: 'daily', budgetAmountMicros: '500000000' },
      after: butceSonrasi('500000000'),
    });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const r = await satirlar();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ durum: 'olculemedi', neden: 'karisik' });
  });

  it('Ö-2 sınırı: BAŞKA kampanyadaki başlatma karışık yapmıyor ama o kampanya kontrolden çıkıyor', async () => {
    await setMetrigi();
    await durdurR1();
    await denetim({ action: 'campaign.resume', target: K2, zaman: '2026-09-03T09:00:00Z', before: { status: 'paused' }, after: { status: 'active' } });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ durum: 'sonuclandi', birlikte: 0 });
    expect(r!.olcum?.kontrol?.varliklar).toEqual([S3]);
  });

  async function tasi(zaman: string) {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [CLIENT_B, IDS.org]);
    await h.q(`UPDATE ad_accounts SET client_id = $1 WHERE id = $2`, [CLIENT_B, IDS.adAccount]);
    await h.q(
      `INSERT INTO audit_logs (org_id, client_id, actor_type, actor_id, action, target_type, target_id, created_at)
       VALUES ($1, $2, 'user', $3, 'ad_account.assigned', 'ad_account', $4, $5::timestamptz)`,
      [IDS.org, CLIENT_B, IDS.user, IDS.adAccount, zaman],
    );
  }

  it('N-1: hesap ölçüm penceresi KAPANDIKTAN SONRA taşındıysa ölçüm geçerli ("hesap taşındı" DEĞİL)', async () => {
    await standartMetrikAjan4();
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    await tasi('2026-09-10T09:00:00Z'); // 7. gün penceresi 8 Eylül'de bitti
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'sonuclandi', sonuc: 'iyilesti', client_id: IDS.client });
  });

  it('N-1: taşıma pencerenin İÇİNDEYSE "hesap taşındı"', async () => {
    await standartMetrikAjan4();
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    await tasi('2026-09-05T09:00:00Z');
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'olculemedi', neden: 'hesap_tasindi' });
  });
});

describe('Ajan 4 kapı — ölçümün sınırları (yeşil, mutasyon bekçisi)', () => {
  it('kontrol grubunda harcaması tek pencerede olan varlık YOK; kontrol boşsa hüküm değil "ölçülemedi · kontrol yok"', async () => {
    // K2 yalnız öncesinde, K3 yalnız sonrasında harcamış: ikisi de kontrol
    // olamaz (oranın paydası ya da payı sıfır). Kontrol boş kalınca sıfıra
    // bölme yerine kontrol_grubu_yok.
    await metrik('campaign', K1, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('campaign', K1, '2026-09-01', '2026-09-30', { harcamaTl: 1000, tik: 100, donusum: 14 });
    await metrik('campaign', K2, '2026-08-04', '2026-08-31', KONTROL);
    await metrik('campaign', K3, '2026-09-02', '2026-09-30', KONTROL);
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ durum: 'olculemedi', neden: 'kontrol_grubu_yok', etki: null, sonraki: null });
  });

  it('harcaması sıfır olan sonrası penceresi (satır var, tutar 0) sıfıra bölmüyor; hacim yetersiz ile ilerliyor', async () => {
    await metrik('campaign', K1, '2026-08-04', '2026-08-31', OLAGAN);
    await metrik('campaign', K1, '2026-09-01', '2026-09-30', { harcamaTl: 0, tik: 0, donusum: 0 });
    for (const k of [K2, K3]) await metrik('campaign', k, '2026-08-04', '2026-09-30', KONTROL);
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    const [r] = await satirlar();
    expect(r).toMatchObject({ durum: 'olcumde', sonuc: 'henuz_belli_degil', neden: 'hacim_yetersiz', etki: null });
  });

  it('havuza dönen hesabın açık satırı "hesap taşındı" ile KAPANIYOR (keşif atlanıyor, değerlendirme sürüyor)', async () => {
    await standartMetrikAjan4();
    await denetim({ action: 'campaign.set_budget', target: K1, after: butceSonrasi('1200000000') });
    await etkiIsi(db(), IDS.adAccount, '2026-09-02', simdi('2026-09-02'));
    await h.q(`UPDATE ad_accounts SET client_id = NULL WHERE id = $1`, [IDS.adAccount]);
    const s = await etkiIsi(db(), IDS.adAccount, ILK_OLCUM, simdi(ILK_OLCUM));
    expect((await satirlar())[0]).toMatchObject({ durum: 'olculemedi', neden: 'hesap_tasindi', sonraki: null });
    expect(s.note).toContain('atanmamış');
  });
});

async function standartMetrikAjan4() {
  await metrik('campaign', K1, '2026-08-04', '2026-08-31', OLAGAN);
  await metrik('campaign', K1, '2026-09-01', '2026-09-30', { harcamaTl: 1000, tik: 100, donusum: 14 });
  for (const k of [K2, K3]) await metrik('campaign', k, '2026-08-04', '2026-09-30', KONTROL);
}
