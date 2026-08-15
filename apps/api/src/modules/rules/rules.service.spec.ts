import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { RuleInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { RulesService } from './rules.service';

/**
 * RulesService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * Karar mantığı `rule-evaluator.spec.ts` içinde ayrıca ve saf olarak test
 * ediliyor. BURADA test edilen şey SQL: pencere toplamları, bekleme süresi
 * sorgusu, bütçe oranı ve seviyeye göre değişen tablo. Bunların hiçbirini
 * TypeScript görmüyor — yanlış bir kolon adı ya da eksik bir cast yalnızca
 * çalışma anında ortaya çıkıyor.
 */

let h: Harness;
let svc: RulesService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const CAMPAIGN = '66666666-6666-6666-6666-666666666666';
const CAMPAIGN_B = '66666666-6666-6666-6666-66666666666b';
const AD_GROUP = '77777777-7777-7777-7777-777777777777';
const AD = '88888888-8888-8888-8888-888888888888';

function ruleInput(over: Partial<RuleInput> = {}): RuleInput {
  return {
    name: 'EBM koruması',
    clientId: IDS.client,
    level: 'campaign',
    conditions: [{ metric: 'cpa', operator: 'gt', value: 250, window: 'last_7d' }],
    combinator: 'and',
    action: { type: 'pause' },
    guard: { minImpressions: 0, minClicks: 0, minSpend: 0, minDaysWithData: 0 },
    cooldownMinutes: 0,
    maxActionsPerRun: 20,
    maxDataAgeHours: 36,
    enabled: true,
    ...over,
  } as RuleInput;
}

async function seedCampaign(
  id: string,
  name: string,
  over: { status?: string; budgetMode?: string; budgetMicros?: string | null } = {},
): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name,
       objective, status, budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $2, $3, 'meta', $4, $5, 'OUTCOME_LEADS', $6::"EntityStatus",
             $7::"BudgetMode", $8, now())`,
    [
      id,
      IDS.adAccount,
      IDS.client,
      `ext-${id.slice(0, 8)}`,
      name,
      over.status ?? 'active',
      over.budgetMode ?? 'daily',
      over.budgetMicros === undefined ? '100000000' : over.budgetMicros,
    ],
  );
}

async function seedInsight(params: {
  entityId: string;
  level?: string;
  date: string;
  spendMicros?: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  reach?: number;
  fetchedAt?: string;
}): Promise<void> {
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, reach, raw_metrics, fetched_at)
     VALUES ($1, $2, 'meta', $3::"EntityLevel", $4, 'ext', $5::date, '',
             $6, $7, $8, $9, 0, 'TRY', $10, '{}'::jsonb, $11::timestamptz)`,
    [
      IDS.client,
      IDS.adAccount,
      params.level ?? 'campaign',
      params.entityId,
      params.date,
      params.impressions ?? 50_000,
      params.clicks ?? 1000,
      params.spendMicros ?? '1000000000',
      params.conversions ?? 0,
      params.reach ?? 20_000,
      params.fetchedAt ?? '2026-08-07T06:00:00Z',
    ],
  );
}

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

// -----------------------------------------------------------------------------
// CRUD ve mod
// -----------------------------------------------------------------------------

describe('kural CRUD', () => {
  it('KURAL PROVA MODUNDA DOĞUYOR', async () => {
    // Girdi şemasında `dryRun` alanı yok. Oluştururken canlı işaretleyebilmek
    // `rule.activate` yetkisini anlamsız kılardı.
    const r = await svc.create(CTX, ruleInput());
    expect(r.dryRun).toBe(true);
  });

  it('canlıya alma AYRI bir işlem', async () => {
    const r = await svc.create(CTX, ruleInput());
    const live = await svc.setMode(CTX, r.id, false);
    expect(live.dryRun).toBe(false);
  });

  it('KRİTİK: koşul değişince PROVAYA GERİ DÖNÜYOR', async () => {
    // Canlı bir kuralın eşiğini değiştirmek onu yeni bir kural yapıyor.
    // Aksi hâlde `rule.activate` yetkisi kolayca atlatılırdı: zararsız bir
    // kural onaylatıp sonra koşulunu "EBM > 1" yapmak.
    const r = await svc.create(CTX, ruleInput());
    await svc.setMode(CTX, r.id, false);

    const updated = await svc.update(
      CTX,
      r.id,
      ruleInput({ conditions: [{ metric: 'cpa', operator: 'gt', value: 1, window: 'last_7d' }] }),
    );
    expect(updated.dryRun).toBe(true);
  });

  it('AKSİYON değişince de provaya dönüyor', async () => {
    const r = await svc.create(CTX, ruleInput());
    await svc.setMode(CTX, r.id, false);
    const updated = await svc.update(CTX, r.id, ruleInput({ action: { type: 'pause' } , name: 'Yeni ad' }));
    // Aksiyon aynı, koşul aynı → canlı kalıyor.
    expect(updated.dryRun).toBe(false);

    const changed = await svc.update(
      CTX,
      r.id,
      ruleInput({ name: 'Yeni ad', action: { type: 'adjust_budget', percent: -20 } }),
    );
    expect(changed.dryRun).toBe(true);
  });

  it('ad değişikliği provaya DÖNDÜRMÜYOR', async () => {
    // Yalnızca davranışı değiştiren alanlar onayı geçersiz kılmalı; yazım
    // hatası düzeltmek kuralı yeniden onaylatmayı gerektirmemeli.
    const r = await svc.create(CTX, ruleInput());
    await svc.setMode(CTX, r.id, false);
    const renamed = await svc.update(CTX, r.id, ruleInput({ name: 'EBM koruması v2' }));
    expect(renamed.dryRun).toBe(false);
  });

  it('AYNI İSİMDE ikinci kural olamaz', async () => {
    // Kural adı denetim kaydında görünüyor; iki "EBM koruması" arasında
    // hangisinin tetiklendiğini ayırt etmek imkânsız olurdu.
    await svc.create(CTX, ruleInput());
    await expect(svc.create(CTX, ruleInput())).rejects.toThrow();
  });

  it('BAŞKA MÜŞTERİNİN hesabına kural yazılamaz', async () => {
    const other = '99999999-9999-9999-9999-999999999999';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Diğer', 'diger', now())`,
      [other, IDS.org],
    );
    await expect(
      svc.create(CTX, ruleInput({ clientId: other, adAccountId: IDS.adAccount })),
    ).rejects.toThrow(/bu müşteriye bağlı değil/i);
  });

  it('siliniyor', async () => {
    const r = await svc.create(CTX, ruleInput());
    await svc.remove(CTX, r.id);
    expect(await svc.list(CTX, {})).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------
// Değerlendirme — SQL
// -----------------------------------------------------------------------------

describe('değerlendirme', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  it('eşleşen kampanya aksiyona uygun', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    // 3.000 ₺ / 0 dönüşüm → EBM sonsuz → 250'yi aşıyor.
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });

    const rule = await svc.create(CTX, ruleInput());
    const out = await svc.evaluateRule(CTX, rule.id, NOW);

    expect(out.evaluatedCount).toBe(1);
    expect(out.matchedCount).toBe(1);
    expect(out.actions[0]?.outcome).toBe('eligible');
    expect(out.actions[0]?.entityName).toBe('Kampanya A');
  });

  it('BUGÜNÜN verisi pencereye GİRMİYOR', async () => {
    // Panel, rapor ve bütçe sayfasıyla aynı kural. Gün bitmeden gelen kısmi
    // veri EBM'yi düşük gösterir ve "EBM düşükse bütçeyi artır" kuralı her
    // sabah tetiklenirdi.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-07', spendMicros: '9000000000' });

    const rule = await svc.create(
      CTX,
      ruleInput({ conditions: [{ metric: 'spend', operator: 'gt', value: 100, window: 'last_7d' }] }),
    );
    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.matchedCount).toBe(0);
  });

  it('PENCERE SINIRI: 7 günlük pencere 8 gün öncesini almıyor', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    // Dün 6 Ağustos; 7 günlük pencere 31 Temmuz–6 Ağustos.
    await seedInsight({ entityId: CAMPAIGN, date: '2026-07-30', spendMicros: '9000000000' });
    await seedInsight({ entityId: CAMPAIGN, date: '2026-07-31', spendMicros: '1000000000' });

    const rule = await svc.create(
      CTX,
      ruleInput({ conditions: [{ metric: 'spend', operator: 'gt', value: 5000, window: 'last_7d' }] }),
    );
    // Yalnızca 31 Temmuz sayılıyor → 1.000 ₺ → 5.000'i aşmıyor.
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).matchedCount).toBe(0);
  });

  it('FARKLI PENCERELER tek sorguda doğru toplanıyor', async () => {
    // `UNION ALL` ile pencere başına bir satır kümesi çekiliyor; pencerelerin
    // birbirine karışması sessiz ve fark edilmesi zor bir hata olurdu.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-06', spendMicros: '1000000000' });
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-01', spendMicros: '4000000000' });

    const rule = await svc.create(
      CTX,
      ruleInput({
        conditions: [
          // Dün: 1.000 ₺
          { metric: 'spend', operator: 'gt', value: 500, window: 'last_1d' },
          // Son 7 gün: 5.000 ₺
          { metric: 'spend', operator: 'gt', value: 4500, window: 'last_7d' },
        ],
      }),
    );
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).matchedCount).toBe(1);
  });

  it('SİLİNMİŞ varlık değerlendirilmiyor', async () => {
    // Platform onları zaten reddederdi ve her tur aynı hata kaydedilirdi.
    await seedCampaign(CAMPAIGN, 'Silinmiş', { status: 'deleted' });
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(CTX, ruleInput());
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).evaluatedCount).toBe(0);
  });

  it('BAYAT VERİ aksiyonu engelliyor', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({
      entityId: CAMPAIGN,
      date: '2026-08-05',
      spendMicros: '3000000000',
      fetchedAt: '2026-08-01T06:00:00Z',
    });
    const rule = await svc.create(CTX, ruleInput({ maxDataAgeHours: 36 }));
    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.actions[0]?.outcome).toBe('skipped_stale_data');
  });

  it('TUR SINIRI sessizce kesmiyor', async () => {
    // "20 reklam duraklatıldı" ile "400'den 20'si duraklatıldı, 380'i sınıra
    // takıldı" farklı bilgiler.
    for (let i = 0; i < 4; i++) {
      const id = `6666666${i}-6666-6666-6666-666666666666`;
      await seedCampaign(id, `Kampanya ${i}`);
      await seedInsight({ entityId: id, date: '2026-08-05', spendMicros: '3000000000' });
    }
    const rule = await svc.create(CTX, ruleInput({ maxActionsPerRun: 2 }));
    const out = await svc.evaluateRule(CTX, rule.id, NOW);

    expect(out.matchedCount).toBe(4);
    expect(out.actions.filter((a) => a.outcome === 'eligible')).toHaveLength(2);
    const capped = out.actions.filter((a) => a.outcome === 'skipped_capped');
    expect(capped).toHaveLength(2);
    expect(capped[0]?.reason).toContain('tur sınırına');
  });

  it('HESAP FİLTRESİ uygulanıyor', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const other = '44444444-4444-4444-4444-44444444444b';
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name,
         currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'ext-x', 'Hesap B', 'TRY', 'Europe/Istanbul', true, now())`,
      [other, IDS.org, IDS.client, IDS.connection],
    );
    const rule = await svc.create(CTX, ruleInput({ adAccountId: other }));
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).evaluatedCount).toBe(0);
  });
});

// -----------------------------------------------------------------------------
// Seviyeler
// -----------------------------------------------------------------------------

describe('seviyeler', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  it('AD SET seviyesi kendi tablosundan okunuyor', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id,
         name, status, budget_mode, budget_amount_micros, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'ag-1', 'Ad Set A', 'active', 'daily', 50000000, now())`,
      [AD_GROUP, CAMPAIGN, IDS.adAccount, IDS.client],
    );
    await seedInsight({
      entityId: AD_GROUP,
      level: 'ad_group',
      date: '2026-08-05',
      spendMicros: '3000000000',
    });

    const rule = await svc.create(CTX, ruleInput({ level: 'ad_group', name: 'Ad set kuralı' }));
    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.evaluatedCount).toBe(1);
    expect(out.actions[0]?.entityName).toBe('Ad Set A');
  });

  it('REKLAM seviyesinde bütçe alanları YOK — sorgu yine çalışıyor', async () => {
    // `ads` tablosunda budget_mode kolonu hiç yok. Seviyeye göre kolon
    // seçmeseydik sorgu "column does not exist" ile düşerdi.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id,
         name, status, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'ag-1', 'Ad Set A', 'active', now())`,
      [AD_GROUP, CAMPAIGN, IDS.adAccount, IDS.client],
    );
    await h.q(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id,
         name, status, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'ad-1', 'Reklam A', 'active', now())`,
      [AD, AD_GROUP, IDS.adAccount, IDS.client],
    );
    await seedInsight({ entityId: AD, level: 'ad', date: '2026-08-05', spendMicros: '3000000000' });

    const rule = await svc.create(CTX, ruleInput({ level: 'ad', name: 'Reklam kuralı' }));
    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.evaluatedCount).toBe(1);
    expect(out.actions[0]?.outcome).toBe('eligible');
  });
});

// -----------------------------------------------------------------------------
// Bekleme süresi
// -----------------------------------------------------------------------------

describe('bekleme süresi', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  async function seedActionLog(ruleId: string, outcome: string, at: string): Promise<void> {
    const runId = '55555555-5555-5555-5555-55555555555a';
    await h.q(
      `INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at)
       VALUES ($1, $2, $3, true, $4::timestamptz) ON CONFLICT DO NOTHING`,
      [runId, IDS.org, ruleId, at],
    );
    await h.q(
      `INSERT INTO rule_action_logs (id, org_id, rule_id, run_id, entity_level, entity_id,
         entity_name, entity_external_id, action_type, outcome, reason, error, created_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'campaign', $4, 'Kampanya A', 'ext', 'pause',
               $5, 'test', $6, $7::timestamptz)`,
      [IDS.org, ruleId, runId, CAMPAIGN, outcome, outcome === 'failed' ? 'hata' : null, at],
    );
  }

  it('UYGULANAN aksiyon bekleme başlatıyor', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(CTX, ruleInput({ cooldownMinutes: 1440 }));
    await seedActionLog(rule.id, 'applied', '2026-08-07T02:00:00Z');

    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.actions[0]?.outcome).toBe('skipped_cooldown');
  });

  it('PROVA aksiyonu da bekleme başlatıyor', async () => {
    // Prova canlıda ne olacağını gösteriyor; bekleme davranışının provada
    // farklı olması, provanın öngörü değerini bozardı.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(CTX, ruleInput({ cooldownMinutes: 1440 }));
    await seedActionLog(rule.id, 'simulated', '2026-08-07T02:00:00Z');
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).actions[0]?.outcome).toBe('skipped_cooldown');
  });

  it('KRİTİK: ATLANAN kayıt bekleme BAŞLATMIYOR', async () => {
    // "Örneklem yetersiz" diye atlanan bir varlık 24 saat kilitlenirse,
    // örneklem dolduğu anda değil ertesi gün karar verilirdi. Beklemenin
    // amacı salınımı engellemek ve salınım ancak gerçek aksiyonla olur.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(CTX, ruleInput({ cooldownMinutes: 1440 }));
    await seedActionLog(rule.id, 'skipped_guard', '2026-08-07T02:00:00Z');
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).actions[0]?.outcome).toBe('eligible');
  });

  it('BAŞARISIZ aksiyon da bekleme başlatmıyor', async () => {
    // Platform reddetmişse aksiyon gerçekleşmedi; tekrar denenmeli.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(CTX, ruleInput({ cooldownMinutes: 1440 }));
    await seedActionLog(rule.id, 'failed', '2026-08-07T02:00:00Z');
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).actions[0]?.outcome).toBe('eligible');
  });
});

// -----------------------------------------------------------------------------
// Bütçe koşulu
// -----------------------------------------------------------------------------

describe('bütçe tüketimi koşulu', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  const budgetRule = () =>
    ruleInput({
      name: 'Bütçe koruması',
      conditions: [{ metric: 'budget_spent_ratio', operator: 'gte', value: 90, window: 'last_7d' }],
    });

  it('HESAP bütçesi varsa hesabın kendi oranı', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '9500000000' });
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros,
         currency, alert_threshold_pct, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, '2026-08-01', 10000000000, 'TRY', 80, now())`,
      [IDS.org, IDS.client, IDS.adAccount],
    );
    // 9.500 / 10.000 = %95 ≥ %90
    const rule = await svc.create(CTX, budgetRule());
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).matchedCount).toBe(1);
  });

  it('HESAP bütçesi yoksa ŞEMSİYE bütçeye düşülüyor', async () => {
    // Yalnızca toplam bütçe tanımlamış bir ajansta bütçe kurallarını tamamen
    // kullanılamaz kılmamak için.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '9500000000' });
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, ad_account_id, month, amount_micros,
         currency, alert_threshold_pct, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, '2026-08-01', 10000000000, 'TRY', 80, now())`,
      [IDS.org, IDS.client],
    );
    const rule = await svc.create(CTX, budgetRule());
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).matchedCount).toBe(1);
  });

  it('BÜTÇE HİÇ YOKSA sessizce atlanmıyor, bildiriliyor', async () => {
    // "Bütçenin %90'ı bittiyse durdur" kuralı bütçe olmadığı için hiç
    // çalışmıyorsa ajans bunu bilmeli.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '9500000000' });
    const rule = await svc.create(CTX, budgetRule());
    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.matchedCount).toBe(0);
    expect(out.actions[0]?.outcome).toBe('skipped_no_budget');
  });
});

// -----------------------------------------------------------------------------
// Bütçe değiştirme aksiyonu
// -----------------------------------------------------------------------------

describe('bütçe değiştirme', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  it('yeni bütçe hesaplanıyor ve önceki durum saklanıyor', async () => {
    await seedCampaign(CAMPAIGN, 'Kampanya A', { budgetMicros: '100000000' });
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });

    const rule = await svc.create(
      CTX,
      ruleInput({ name: 'Bütçe azalt', action: { type: 'adjust_budget', percent: -20 } }),
    );
    const out = await svc.evaluateRule(CTX, rule.id, NOW);
    expect(out.actions[0]?.outcome).toBe('eligible');
    expect(out.actions[0]?.targetBudgetMicros).toBe(80_000_000n);
    // Geri alma için yalnızca DEĞİŞEN alan saklanıyor.
    expect(out.actions[0]?.beforeState).toEqual({
      budgetAmountMicros: '100000000',
      budgetMode: 'daily',
    });
  });

  it('CBO kampanyasında bütçe değiştirilmiyor', async () => {
    await seedCampaign(CAMPAIGN, 'CBO', { budgetMode: 'none', budgetMicros: null });
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(
      CTX,
      ruleInput({ name: 'Bütçe azalt', action: { type: 'adjust_budget', percent: -20 } }),
    );
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).actions[0]?.outcome).toBe('skipped_noop');
  });

  it('sonuç aynıysa boş platform çağrısı üretilmiyor', async () => {
    await seedCampaign(CAMPAIGN, 'Tavanda', { budgetMicros: '500000000' });
    await seedInsight({ entityId: CAMPAIGN, date: '2026-08-05', spendMicros: '3000000000' });
    const rule = await svc.create(
      CTX,
      ruleInput({
        name: 'Bütçe artır',
        action: { type: 'adjust_budget', percent: 20, maxBudget: 500 },
      }),
    );
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).actions[0]?.outcome).toBe('skipped_noop');
  });
});

// -----------------------------------------------------------------------------
// Erişim toplamı
// -----------------------------------------------------------------------------

describe('frekans', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  it('ERİŞİM TOPLANMIYOR, ortalaması alınıyor', async () => {
    // Erişim tekil kullanıcı sayısı. Günlük erişimleri toplamak aynı kişiyi
    // her gün yeniden sayar ve frekansı OLDUĞUNDAN DÜŞÜK gösterir —
    // yorgunluk kuralını tam ters yönde bozar.
    await seedCampaign(CAMPAIGN, 'Kampanya A');
    for (const date of ['2026-08-04', '2026-08-05', '2026-08-06']) {
      await seedInsight({ entityId: CAMPAIGN, date, impressions: 30_000, reach: 10_000 });
    }
    // Toplasaydık: 90.000 / 30.000 = 3. Ortalamayla: 90.000 / 10.000 = 9.
    const rule = await svc.create(
      CTX,
      ruleInput({
        name: 'Yorgunluk',
        conditions: [{ metric: 'frequency', operator: 'gt', value: 8, window: 'last_7d' }],
      }),
    );
    expect((await svc.evaluateRule(CTX, rule.id, NOW)).matchedCount).toBe(1);
  });
});
