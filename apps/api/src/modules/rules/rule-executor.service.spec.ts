import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuleInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformApiError } from '../connections/provider.types';
import { RulesService } from './rules.service';
import { RuleExecutorService } from './rule-executor.service';

/**
 * Kural uygulayıcı.
 *
 * NEDEN BU TESTLER: burası platforma DOKUNAN tek yer. Bir hata müşterinin
 * kampanyasını yanlış durdurur ve geri alınamaz. En kritik iddialar:
 *
 *   1. Prova modunda platform ASLA çağrılmıyor.
 *   2. `ads_management` yoksa aksiyon uygulanmıyor ve sebebi AÇIKÇA yazılıyor
 *      — bu, App Review onayı gelene kadar en sık karşılaşılacak durum.
 *   3. Atlanan kararlar da kaydediliyor; "kuralım neden çalışmıyor"un cevabı.
 *   4. Denetim kaydı yalnızca GERÇEKTEN uygulanan aksiyonlar için.
 */

let h: Harness;
let rules: RulesService;
let executor: RuleExecutorService;

const applyAction = vi.fn();
const canWrite = vi.fn();

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const CAMPAIGN = '66666666-6666-6666-6666-666666666666';
const NOW = new Date('2026-08-07T10:00:00Z');

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

async function seedMatchingCampaign(): Promise<void> {
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name,
       objective, status, budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $2, $3, 'meta', 'ext-c1', 'Kampanya A', 'OUTCOME_LEADS', 'active',
             'daily', 100000000, now())`,
    [CAMPAIGN, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency, reach, raw_metrics, fetched_at)
     VALUES ($1, $2, 'meta', 'campaign', $3, 'ext-c1', '2026-08-05', '',
             50000, 1000, 3000000000, 0, 0, 'TRY', 20000, '{}'::jsonb, '2026-08-07T06:00:00Z')`,
    [IDS.client, IDS.adAccount, CAMPAIGN],
  );
}

/** Bağlantıya yazma izni ver / al. */
async function setScopes(scopes: string[]): Promise<void> {
  await h.q(`UPDATE platform_connections SET granted_scopes = $1 WHERE id = $2`, [
    scopes,
    IDS.connection,
  ]);
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;

  rules = new RulesService(prisma);
  executor = new RuleExecutorService(
    rules,
    { get: () => ({ platform: 'meta', applyAction, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    // Kota her zaman izin veriyor; kota davranışı kendi paketinde test edili.
    { acquire: async () => ({ allowed: true, usagePercent: 10 }), record: async () => {} } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  applyAction.mockReset();
  canWrite.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  applyAction.mockResolvedValue({ afterState: { status: 'paused' } });
  await setScopes(['ads_read', 'ads_management', 'business_management']);
});

async function logs(): Promise<Array<{ outcome: string; error: string | null; reason: string }>> {
  return h.q(`SELECT outcome, error, reason FROM rule_action_logs ORDER BY created_at`);
}

// -----------------------------------------------------------------------------

describe('prova modu', () => {
  it('KRİTİK: platforma ASLA dokunmuyor', async () => {
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    // Kural prova modunda doğuyor.
    const res = await executor.execute(h.db, CTX, rule, NOW);

    expect(applyAction).not.toHaveBeenCalled();
    expect(res.actionCount).toBe(1);
    expect((await logs())[0]?.outcome).toBe('simulated');
  });

  it('prova kaydı DENETİM KAYDINA yazılmıyor', async () => {
    // Denetim kaydı olan biteni anlatır, olabilecekleri değil.
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    await executor.execute(h.db, CTX, rule, NOW);

    const audit = await h.q<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE actor_type = 'rule'`,
    );
    expect(Number(audit[0]?.count)).toBe(0);
  });

  it('tur kaydı PROVA olarak işaretleniyor', async () => {
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    await executor.execute(h.db, CTX, rule, NOW);
    const runs = await h.q<{ dry_run: boolean }>(`SELECT dry_run FROM rule_runs`);
    expect(runs[0]?.dry_run).toBe(true);
  });

  it('KURAL SONRADAN CANLIYA ALINSA DA geçmiş tur prova kalıyor', async () => {
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    await executor.execute(h.db, CTX, rule, NOW);
    await rules.setMode(CTX, rule.id, false);

    const runs = await h.q<{ dry_run: boolean }>(`SELECT dry_run FROM rule_runs`);
    expect(runs[0]?.dry_run).toBe(true);
  });
});

describe('canlı mod', () => {
  it('platforma yazıyor ve UYGULANDI kaydediyor', async () => {
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    const live = await rules.setMode(CTX, rule.id, false);

    await executor.execute(h.db, CTX, live, NOW);

    expect(applyAction).toHaveBeenCalledTimes(1);
    // Platform kimliği gönderiliyor, bizim UUID'miz değil.
    expect(applyAction.mock.calls[0]?.[1]).toMatchObject({
      type: 'pause',
      level: 'campaign',
      externalId: 'ext-c1',
    });
    const rows = await logs();
    expect(rows[0]?.outcome).toBe('applied');
    // TEK KAYIT. writeLog'dan sonra atılan bir istisna ikinci bir 'failed'
    // satırı yazardı ve ilk satıra bakan bir iddia bunu göremezdi.
    expect(rows).toHaveLength(1);
  });

  it('DENETİM KAYDI actorType=rule ile yazılıyor', async () => {
    // Müşteriye "bütçemi kim değiştirdi" sorusunun cevabı bu tablodan
    // üretiliyor; "sistem" yazması yeterli değil.
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    const live = await rules.setMode(CTX, rule.id, false);
    await executor.execute(h.db, CTX, live, NOW);

    const audit = await h.q<{
      actor_type: string;
      actor_label: string;
      action: string;
      after: Record<string, unknown>;
    }>(`SELECT actor_type, actor_label, action, after FROM audit_logs WHERE actor_type = 'rule'`);

    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_label).toBe('EBM koruması');
    expect(audit[0]?.action).toBe('rule.pause');
    // Gerekçe denetim kaydında: hangi eşikle tetiklendiği sonradan sorulacak.
    expect(String(audit[0]?.after.reason)).toContain('EBM');
  });

  it('BÜTÇE aksiyonunda para birimi ve mod taşınıyor', async () => {
    await seedMatchingCampaign();
    applyAction.mockResolvedValue({
      afterState: { budgetAmountMicros: '80000000', budgetMode: 'daily' },
    });
    const rule = await rules.create(
      CTX,
      ruleInput({ name: 'Bütçe azalt', action: { type: 'adjust_budget', percent: -20 } }),
    );
    const live = await rules.setMode(CTX, rule.id, false);
    await executor.execute(h.db, CTX, live, NOW);

    expect(applyAction.mock.calls[0]?.[1]).toMatchObject({
      type: 'set_budget',
      amountMicros: 80_000_000n,
      budgetMode: 'daily',
      currency: 'TRY',
    });
  });
});

describe('yazma izni', () => {
  it('KRİTİK: ads_management yoksa uygulanmıyor, sebebi AÇIK', async () => {
    // App Review onayı gelene kadar en sık karşılaşılacak durum. Sebep açık
    // yazılmazsa ajans kuralın bozuk olduğunu sanır.
    canWrite.mockReturnValue({ ok: false, missing: ['ads_management'] });
    await setScopes(['ads_read', 'business_management']);
    await seedMatchingCampaign();

    const rule = await rules.create(CTX, ruleInput());
    const live = await rules.setMode(CTX, rule.id, false);
    await executor.execute(h.db, CTX, live, NOW);

    expect(applyAction).not.toHaveBeenCalled();
    const rows = await logs();
    expect(rows[0]?.outcome).toBe('failed');
    expect(rows[0]?.error).toContain('ads_management');
    expect(rows[0]?.error).toContain('prova');
  });

  it('bağlantı etkin değilse ayrı bir sebep veriliyor', async () => {
    // "Bağlantı yok" ile "izin yok" ajans için tamamen farklı işler.
    await h.q(`UPDATE platform_connections SET status = 'needs_reauth' WHERE id = $1`, [
      IDS.connection,
    ]);
    await seedMatchingCampaign();
    const rule = await rules.create(CTX, ruleInput());
    const live = await rules.setMode(CTX, rule.id, false);
    await executor.execute(h.db, CTX, live, NOW);

    const rows = await logs();
    expect(rows[0]?.error).toContain('yeniden bağlanmak');
  });
});

describe('hata yolları', () => {
  it('PLATFORM HATASI kaydediliyor, tur devam ediyor', async () => {
    await seedMatchingCampaign();
    applyAction.mockRejectedValue(
      new PlatformApiError('meta', 'permanent', '(#100) Geçersiz parametre'),
    );
    const rule = await rules.create(CTX, ruleInput());
    const live = await rules.setMode(CTX, rule.id, false);
    const res = await executor.execute(h.db, CTX, live, NOW);

    const rows = await logs();
    expect(rows[0]?.outcome).toBe('failed');
    expect(rows[0]?.error).toContain('#100');
    // TEK kayıt olmalı.
    expect(rows).toHaveLength(1);
    // Başarısız aksiyon sayılmıyor.
    expect(res.actionCount).toBe(0);
    // Tur kendisi başarılı: bir varlığın reddedilmesi turu düşürmemeli.
    const runs = await h.q<{ error: string | null }>(`SELECT error FROM rule_runs`);
    expect(runs[0]?.error).toBeNull();
  });

  it('BAŞARISIZ kayıt DENETİM KAYDINA yazılmıyor', async () => {
    await seedMatchingCampaign();
    applyAction.mockRejectedValue(new PlatformApiError('meta', 'permanent', 'hata'));
    const rule = await rules.create(CTX, ruleInput());
    const live = await rules.setMode(CTX, rule.id, false);
    await executor.execute(h.db, CTX, live, NOW);

    const audit = await h.q<{ count: string | number }>(
      `SELECT COUNT(*) AS count FROM audit_logs WHERE actor_type = 'rule'`,
    );
    expect(Number(audit[0]?.count)).toBe(0);
  });
});

describe('tur kaydı', () => {
  it('ATLANAN kararlar da kaydediliyor', async () => {
    // "Kuralım neden hiç çalışmıyor" sorusunun cevabı bu tabloda.
    await seedMatchingCampaign();
    const rule = await rules.create(
      CTX,
      ruleInput({ guard: { minImpressions: 999_999, minClicks: 0, minSpend: 0, minDaysWithData: 0 } }),
    );
    await executor.execute(h.db, CTX, rule, NOW);

    const rows = await logs();
    expect(rows[0]?.outcome).toBe('skipped_guard');
    expect(rows[0]?.reason).toContain('Örneklem yetersiz');
  });

  it('AKSİYON ALINMASA DA tur kaydediliyor', async () => {
    // "Çalıştı, hiçbir varlık koşulu sağlamadı" da bir cevap.
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name,
         objective, status, budget_mode, updated_at)
       VALUES ($1, $2, $3, 'meta', 'ext-c1', 'Sakin', 'OUTCOME_LEADS', 'active', 'daily', now())`,
      [CAMPAIGN, IDS.adAccount, IDS.client],
    );
    const rule = await rules.create(CTX, ruleInput());
    const res = await executor.execute(h.db, CTX, rule, NOW);

    expect(res.matchedCount).toBe(0);
    const runs = await h.q<{ evaluated_count: number; action_count: number }>(
      `SELECT evaluated_count, action_count FROM rule_runs`,
    );
    expect(runs[0]?.evaluated_count).toBe(1);
    expect(runs[0]?.action_count).toBe(0);
  });

  it('TETİKLENME ANI yalnızca aksiyon alınınca güncelleniyor', async () => {
    // Her turda güncellemek "en son ne zaman bir şey yaptı" sorusunu "en son
    // ne zaman çalıştı"ya çevirirdi.
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name,
         objective, status, budget_mode, updated_at)
       VALUES ($1, $2, $3, 'meta', 'ext-c1', 'Sakin', 'OUTCOME_LEADS', 'active', 'daily', now())`,
      [CAMPAIGN, IDS.adAccount, IDS.client],
    );
    const rule = await rules.create(CTX, ruleInput());
    await executor.execute(h.db, CTX, rule, NOW);

    const after = await rules.get(CTX, rule.id);
    expect(after.lastRunAt).not.toBeNull();
    expect(after.lastTriggeredAt).toBeNull();
  });
});

describe('notify aksiyonu', () => {
  it('CANLI modda bile platforma dokunmuyor', async () => {
    // `notify` prova modunun eş anlamlısı değil: canlıda da yalnızca haber
    // veren bir aksiyon. Ajans çoğu kuralı önce böyle çalıştırmak istiyor.
    await seedMatchingCampaign();
    const rule = await rules.create(
      CTX,
      ruleInput({ name: 'Sadece uyar', action: { type: 'notify' } }),
    );
    const live = await rules.setMode(CTX, rule.id, false);
    await executor.execute(h.db, CTX, live, NOW);

    expect(applyAction).not.toHaveBeenCalled();
    expect((await logs())[0]?.outcome).toBe('simulated');
  });
});
