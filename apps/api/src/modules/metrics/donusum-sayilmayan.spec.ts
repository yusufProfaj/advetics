import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Prisma } from '@prisma/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RuleInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { RulesService } from '../rules/rules.service';
import {
  DONUSUMSUZ_GOOGLE_TEKLIFLERI,
  DONUSUMSUZ_META_HEDEFLERI,
  donusumSayilmiyorCumlesi,
  donusumsuzHedefSql,
  donusumsuzVarlikSql,
} from './donusum-sayilmayan';

/**
 * ═══ DÖNÜŞÜM İÇİN KURULMAMIŞ KAMPANYA — GERÇEK SORGU (PGlite) ═══
 *
 * Para harcayan sessiz hata: THRUPLAY/REACH kampanyasında `conversions` her
 * gün 0 ve "7 günde dönüşüm 0 ise durdur" kuralı çalışan video reklamını
 * durduruyordu. Burada kural motorunun GERÇEK sorgusu koşuyor; yardımcının
 * SQL'i üç seviyede ayrıca sınanıyor (TypeScript bir kolon adını ya da
 * bağlı parametre tipini göremez).
 */

let h: Harness;
let svc: RulesService;
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true } as TenantContext;
const NOW = new Date('2026-08-07T09:00:00Z');

beforeAll(async () => {
  h = await createHarness();
  svc = new RulesService({
    withTenant: async <T>(_ctx: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

let sira = 0;
async function kampanya(platform: 'meta' | 'google', over: { objective?: string; bid?: string | null } = {}): Promise<string> {
  sira++;
  const id = `6a6a6a6a-0000-4000-8000-${String(sira).padStart(12, '0')}`;
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, objective, status, budget_mode, budget_amount_micros, bid_strategy, updated_at)
     VALUES ($1, $2, $3, $4::"Platform", $5, $6, $7, 'active', 'daily', 100000000, $8, now())`,
    [id, IDS.adAccount, IDS.client, platform, `k-${sira}`, `K${sira}`, over.objective ?? 'OUTCOME_LEADS', over.bid ?? null],
  );
  return id;
}
async function set(campaignId: string, platform: 'meta' | 'google', hedef: string | null): Promise<string> {
  sira++;
  const id = `7a7a7a7a-0000-4000-8000-${String(sira).padStart(12, '0')}`;
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, optimization_goal, updated_at)
     VALUES ($1, $2, $3, $4, $5::"Platform", $6, 'Set', 'active', 'daily', $7, now())`,
    [id, campaignId, IDS.adAccount, IDS.client, platform, `s-${sira}`, hedef],
  );
  return id;
}
async function reklam(adGroupId: string, platform: 'meta' | 'google'): Promise<string> {
  sira++;
  const id = `8a8a8a8a-0000-4000-8000-${String(sira).padStart(12, '0')}`;
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $2, $3, $4, $5::"Platform", $6, 'Reklam', 'active', now())`,
    [id, adGroupId, IDS.adAccount, IDS.client, platform, `r-${sira}`],
  );
  return id;
}
async function metrik(entityId: string, level: 'campaign' | 'ad_group' | 'ad'): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
       impressions, clicks, spend_micros, conversions, conversion_value_micros, currency, reach, raw_metrics, fetched_at)
     VALUES ($1, $2, 'meta', $3::"EntityLevel", $4, 'ext', '2026-08-05', '', 50000, 1000, 1000000000, 0, 0, 'TRY', 20000, '{}'::jsonb, '2026-08-07T06:00:00Z')`,
    [IDS.client, IDS.adAccount, level, entityId],
  );
}
const kural = (level: RuleInput['level']): RuleInput =>
  ({
    name: `Dönüşüm yoksa durdur (${level})`,
    clientId: IDS.client,
    level,
    conditions: [{ metric: 'conversions', operator: 'lte', value: 0, window: 'last_7d' }],
    combinator: 'and',
    action: { type: 'pause' },
    guard: { minImpressions: 0, minClicks: 0, minSpend: 0, minDaysWithData: 0 },
    cooldownMinutes: 0,
    maxActionsPerRun: 20,
    maxDataAgeHours: 36,
    enabled: true,
  }) as RuleInput;

async function hedefKodu(seviye: 'campaign' | 'ad_group' | 'ad', id: string): Promise<string | null> {
  const tablo = { campaign: 'campaigns', ad_group: 'ad_groups', ad: 'ads' }[seviye];
  const [r] = await h.db.$queryRaw<Array<{ kod: string | null; var: boolean }>>(
    Prisma.sql`SELECT ${donusumsuzHedefSql(seviye, 'e')} AS kod, ${donusumsuzVarlikSql(seviye, 'e')} AS var
                 FROM ${Prisma.raw(tablo)} e WHERE e.id = ${id}::uuid`,
  );
  expect(r!.var).toBe(r!.kod !== null);
  return r!.kod;
}

describe('kural motoru — "dönüşüm 0 → durdur"', () => {
  it('KRİTİK: THRUPLAY ve REACH kampanyası DURDURULMAZ, sebep hedefiyle kayıtta; form kampanyası durdurulur', async () => {
    const video = await kampanya('meta', { objective: 'OUTCOME_ENGAGEMENT' });
    const erisim = await kampanya('meta', { objective: 'OUTCOME_AWARENESS' });
    const form = await kampanya('meta');
    await set(video, 'meta', 'THRUPLAY');
    await set(erisim, 'meta', 'REACH');
    await set(form, 'meta', 'LEAD_GENERATION');
    for (const k of [video, erisim, form]) await metrik(k, 'campaign');

    const r = await svc.create(CTX, kural('campaign'));
    const out = await svc.evaluateRule(CTX, r.id, NOW);
    const bul = (id: string) => out.actions.find((a) => a.entityId === id)!;
    expect(bul(video).outcome).toBe('skipped_no_conversion_signal');
    expect(bul(video).reason).toContain('hedef: video izlenme');
    expect(bul(erisim).outcome).toBe('skipped_no_conversion_signal');
    expect(bul(erisim).reason).toContain('hedef: erişim');
    expect(bul(form).outcome).toBe('eligible');
    // `rule_action_logs.reason` VARCHAR(500): en uzun hedef adı bile sığmalı.
    for (const a of out.actions) expect(a.reason.length).toBeLessThan(500);
  });

  it('KRİTİK: Google görüntüleme teklifi (TARGET_CPV) ve Demand Gen tıklaması atlanır; dönüşüm teklifli Google kampanyası değerlendirilir', async () => {
    const cpv = await kampanya('google', { objective: 'VIDEO', bid: 'TARGET_CPV' });
    const dg = await kampanya('google', { objective: 'DEMAND_GEN', bid: 'TARGET_SPEND' });
    const eylem = await kampanya('google', { objective: 'VIDEO', bid: 'TARGET_CPA' });
    const aramaTik = await kampanya('google', { objective: 'SEARCH', bid: 'TARGET_SPEND' });
    for (const k of [cpv, dg, eylem, aramaTik]) await metrik(k, 'campaign');

    const r = await svc.create(CTX, kural('campaign'));
    const out = await svc.evaluateRule(CTX, r.id, NOW);
    const bul = (id: string) => out.actions.find((a) => a.entityId === id)!;
    expect(bul(cpv).outcome).toBe('skipped_no_conversion_signal');
    expect(bul(dg).outcome).toBe('skipped_no_conversion_signal');
    expect(bul(dg).reason).toContain('Demand Gen');
    // Video kanalı TEK BAŞINA yetmez: TARGET_CPA video eylem kampanyası dönüşüm için.
    expect(bul(eylem).outcome).toBe('eligible');
    // Arama ağında tıklama teklifi bilerek listede değil.
    expect(bul(aramaTik).outcome).toBe('eligible');
  });

  it('reklam seti ve reklam seviyesinde de atlanır (set hedefinden / kampanyanın teklifinden)', async () => {
    const mk = await kampanya('meta');
    const videoSet = await set(mk, 'meta', 'THRUPLAY');
    const formSet = await set(mk, 'meta', 'LEAD_GENERATION');
    const gk = await kampanya('google', { objective: 'VIDEO', bid: 'MANUAL_CPV' });
    const gSet = await set(gk, 'google', 'VIDEO_TRUE_VIEW_IN_STREAM');
    for (const s of [videoSet, formSet, gSet]) await metrik(s, 'ad_group');
    const rs = await svc.create(CTX, kural('ad_group'));
    const out = await svc.evaluateRule(CTX, rs.id, NOW);
    const bul = (id: string) => out.actions.find((a) => a.entityId === id)!;
    expect(bul(videoSet).outcome).toBe('skipped_no_conversion_signal');
    expect(bul(gSet).outcome).toBe('skipped_no_conversion_signal');
    expect(bul(formSet).outcome).toBe('eligible');

    const ad = await reklam(videoSet, 'meta');
    const formAd = await reklam(formSet, 'meta');
    await metrik(ad, 'ad');
    await metrik(formAd, 'ad');
    const ra = await svc.create(CTX, kural('ad'));
    const outA = await svc.evaluateRule(CTX, ra.id, NOW);
    expect(outA.actions.find((a) => a.entityId === ad)!.outcome).toBe('skipped_no_conversion_signal');
    expect(outA.actions.find((a) => a.entityId === formAd)!.outcome).toBe('eligible');
  });
});

describe('yardımcının SQL\'i — üç seviye', () => {
  it('KRİTİK: her Meta hedefi tanınır; hedefsiz ve dönüşüm hedefli set NULL', async () => {
    for (const hedef of Object.keys(DONUSUMSUZ_META_HEDEFLERI)) {
      const k = await kampanya('meta');
      const s = await set(k, 'meta', hedef);
      expect(await hedefKodu('ad_group', s)).toBe(hedef);
      expect(await hedefKodu('campaign', k)).toBe(hedef);
    }
    const k = await kampanya('meta');
    const s = await set(k, 'meta', 'OFFSITE_CONVERSIONS');
    await set(k, 'meta', null);
    expect(await hedefKodu('campaign', k)).toBeNull();
    expect(await hedefKodu('ad_group', s)).toBeNull();
  });

  it('Meta hedef adı Google setinde ANLAM TAŞIMAZ (platform süzgeci)', async () => {
    // LinkedIn/Google `optimization_goal` başka sözlük; adaş bir değer
    // (ör. IMPRESSIONS) Google setini yanlışlıkla atlatmamalı.
    const k = await kampanya('google', { objective: 'SEARCH', bid: 'MAXIMIZE_CONVERSIONS' });
    const s = await set(k, 'google', 'IMPRESSIONS');
    expect(await hedefKodu('ad_group', s)).toBeNull();
    expect(await hedefKodu('campaign', k)).toBeNull();
  });

  it('cümle tek yerden: hedef adı ve kodu yoksa hedefsiz', () => {
    expect(donusumSayilmiyorCumlesi('THRUPLAY')).toBe(
      'Değerlendirilemedi: kampanya dönüşüm için kurulmamış (hedef: video izlenme); dönüşüm 0 bir ölçüm değil',
    );
    expect(donusumSayilmiyorCumlesi(null)).not.toContain('hedef:');
  });
});

/**
 * TEK KAYNAK: kural motoru, sinyaller ve İyileştir aynı yardımcıyı okuyor.
 * Eski arama-yalnız yardımcı ya da elle yazılmış bir hedef karşılaştırması
 * geri gelirse yeni hedef (video) o tüketicide sessizce unutulur.
 */
describe('kaynak taraması — tek yardımcı', () => {
  const MODULLER = join(__dirname, '..');
  const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const dosyalar = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? dosyalar(p) : p.endsWith('.ts') && !p.endsWith('.spec.ts') ? [p] : [];
    });

  it('KRİTİK: üç tüketici yardımcıyı ÇAĞIRIYOR', () => {
    const tuketiciler = {
      'rules/rules.service.ts': 'donusumsuzHedefSql(rule.level',
      'iyilestir/iyilestir.service.ts': "donusumsuzVarlikSql('campaign', 'c')",
      'sinyal/sinyal-hesap.service.ts': "donusumsuzVarlikSql('campaign', 'c')",
      'rules/rule-evaluator.ts': 'donusumSayilmiyorCumlesi(snapshot.donusumsuzHedef)',
    };
    for (const [dosya, cagri] of Object.entries(tuketiciler)) {
      const k = yorumsuz(readFileSync(join(MODULLER, dosya), 'utf8'));
      expect(k, dosya).toContain(cagri);
    }
  });

  it('KRİTİK: hedef listesi başka bir dosyada elle karşılaştırılmıyor (yazma yolları hariç)', () => {
    // Yazma yolları (`reklam/`, `connections/`, `ad-builder/`, `draft-tree/`)
    // hedefi KURUYOR; okuma tarafında karşılaştırma yalnız yardımcıda olmalı.
    const KODLAR = [...Object.keys(DONUSUMSUZ_META_HEDEFLERI), ...Object.keys(DONUSUMSUZ_GOOGLE_TEKLIFLERI)];
    const KURAN = ['/reklam/', '/connections/', '/ad-builder/', '/draft-tree/', '/autoboost/', '/boosts/'];
    const ihlal: string[] = [];
    for (const p of dosyalar(MODULLER)) {
      if (p.endsWith('donusum-sayilmayan.ts') || KURAN.some((k) => p.includes(k))) continue;
      const k = yorumsuz(readFileSync(p, 'utf8'));
      if (KODLAR.some((kod) => k.includes(`'${kod}'`)) || /aramaVarligiSql|arama-kampanyasi/.test(k)) {
        ihlal.push(p.slice(MODULLER.length));
      }
    }
    expect(ihlal).toEqual([]);
  });
});
