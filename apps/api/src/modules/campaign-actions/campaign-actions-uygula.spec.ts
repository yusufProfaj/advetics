import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PlatformVarlikDurumu } from '../connections/provider.types';
import { CampaignActionsService, karsilastir } from './campaign-actions.service';

/**
 * `CampaignActionsService.uygula` — SEVİYELİ YAZMA + GERİ OKUMA (İyileştir).
 *
 * EN KRİTİK İDDİA: geri okunan değer istenenle UYUŞMAZSA sonuç `uyusmadi`,
 * "doğrulandı" DEĞİL. "200 döndü" bu projede doğrulama sayılmıyor.
 */

let h: Harness;
const KAMPANYA = '99999999-9999-9999-9999-999999999999';
const SET = '88888888-8888-8888-8888-888888888888';
const REKLAM = '77777777-7777-7777-7777-777777777777';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

function durum(ek: Partial<PlatformVarlikDurumu> = {}): PlatformVarlikDurumu {
  return { status: 'paused', hamDurum: 'PAUSED', dailyBudgetMicros: null, lifetimeBudgetMicros: null, ...ek };
}

function kur() {
  const prisma = { withTenant: vi.fn(async (_c: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db)) } as unknown as PrismaService;
  const applyAction = vi.fn().mockResolvedValue({ afterState: {} });
  const durumOku = vi.fn().mockResolvedValue(durum());
  const canWrite = vi.fn().mockReturnValue({ ok: true, missing: [] });
  const providers = { get: () => ({ platform: 'meta', applyAction, durumOku, canWrite }) } as never;
  const vault = { getAccessToken: async () => 'token' } as never;
  const quota = {
    acquire: vi.fn().mockResolvedValue({ allowed: true, usagePercent: 1 }),
    record: vi.fn().mockResolvedValue(undefined),
  } as never;
  const svc = new CampaignActionsService(prisma, providers, vault, quota, new AuditService({} as never), { enqueue: vi.fn() } as never);
  return { svc, applyAction, durumOku, quota };
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
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $2, $3, 'meta', 'c-1', 'Kampanya', 'active', 'none', NULL, now())`,
    [KAMPANYA, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'g-1', 'Set', 'active', 'daily', 100000000, now())`,
    [SET, KAMPANYA, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'a-1', 'Reklam', 'active', now())`,
    [REKLAM, SET, IDS.adAccount, IDS.client],
  );
});

describe('karsilastir (saf)', () => {
  it('benzeri benzerle: durumda status, bütçede yazılan alan', () => {
    expect(karsilastir({ type: 'pause' }, durum())).toBe('dogrulandi');
    expect(karsilastir({ type: 'pause' }, durum({ status: 'active' }))).toBe('uyusmadi');
    expect(karsilastir({ type: 'resume' }, durum({ status: 'active' }))).toBe('dogrulandi');
    expect(karsilastir({ type: 'set_budget', amountMicros: 5n, budgetMode: 'daily' }, durum({ dailyBudgetMicros: 5n }))).toBe('dogrulandi');
    expect(karsilastir({ type: 'set_budget', amountMicros: 5n, budgetMode: 'daily' }, durum({ dailyBudgetMicros: 4n }))).toBe('uyusmadi');
    expect(karsilastir({ type: 'set_budget', amountMicros: 5n, budgetMode: 'daily' }, durum({ lifetimeBudgetMicros: 5n }))).toBe('uyusmadi');
  });
});

describe('uygula — reklam ve set seviyesi', () => {
  it('KRİTİK: reklam seviyesinde istek reklamın kimliği ve ÜST (set) kimliğiyle gidiyor', async () => {
    const { svc, applyAction, durumOku } = kur();
    const r = await svc.uygula(CTX, { seviye: 'ad', id: REKLAM }, { type: 'pause' });
    expect(applyAction).toHaveBeenCalledWith(expect.anything(), { type: 'pause', level: 'ad', externalId: 'a-1', ustExternalId: 'g-1' }, undefined);
    expect(durumOku).toHaveBeenCalledWith(expect.anything(), { level: 'ad', externalId: 'a-1', ustExternalId: 'g-1', currency: 'TRY' });
    expect(r.dogrulama).toBe('dogrulandi');
    expect(r.platformDegeri).toBe('Duraklatıldı');
  });

  it('KRİTİK: geri okunan değer UYUŞMAZSA `uyusmadi` — dogrulandi DEĞİL', async () => {
    const { svc, durumOku } = kur();
    durumOku.mockResolvedValue(durum({ status: 'active', hamDurum: 'ACTIVE' }));
    const r = await svc.uygula(CTX, { seviye: 'ad', id: REKLAM }, { type: 'pause' });
    expect(r.dogrulama).toBe('uyusmadi');
    expect(r.platformDegeri).toBe('Yayında');
  });

  it('KRİTİK: bütçe yuvarlandıysa `uyusmadi` ve platformun değeri yazılıyor', async () => {
    const { svc, durumOku } = kur();
    durumOku.mockResolvedValue(durum({ status: 'active', dailyBudgetMicros: 119_990_000n }));
    const r = await svc.uygula(CTX, { seviye: 'ad_group', id: SET }, { type: 'set_budget', amountMicros: 120_000_000n, budgetMode: 'daily' });
    expect(r.dogrulama).toBe('uyusmadi');
    expect(r.platformDegeri).toMatch(/119,99/);
  });

  it('KRİTİK: geri okuma DÜŞERSE de `uyusmadi` (hata yutulmuyor, başarı da sayılmıyor)', async () => {
    const { svc, durumOku } = kur();
    durumOku.mockRejectedValue(new Error('ağ koptu'));
    const r = await svc.uygula(CTX, { seviye: 'ad', id: REKLAM }, { type: 'pause' });
    expect(r.dogrulama).toBe('uyusmadi');
    expect(r.platformDegeri).toMatch(/geri okunamadı: ağ koptu/);
  });

  it('ayna GERİ OKUNAN değerle güncelleniyor ve denetim kaydı düşüyor', async () => {
    const { svc, durumOku } = kur();
    durumOku.mockResolvedValue(durum({ status: 'active', dailyBudgetMicros: 120_000_000n }));
    await svc.uygula(CTX, { seviye: 'ad_group', id: SET }, { type: 'set_budget', amountMicros: 120_000_000n, budgetMode: 'daily' });
    const [g] = await h.q<{ budget_amount_micros: string }>(`SELECT budget_amount_micros::text FROM ad_groups WHERE id = $1`, [SET]);
    expect(g!.budget_amount_micros).toBe('120000000');
    const log = await h.q<{ action: string; target_type: string }>(`SELECT action, target_type FROM audit_logs`);
    expect(log).toEqual([{ action: 'ad_group.set_budget', target_type: 'ad_group' }]);
  });

  it('reklamın bütçesi yok: set_budget reklam seviyesinde platforma gitmeden reddediliyor', async () => {
    const { svc, applyAction } = kur();
    await expect(svc.uygula(CTX, { seviye: 'ad', id: REKLAM }, { type: 'set_budget', amountMicros: 1n, budgetMode: 'daily' })).rejects.toThrow(/bütçesi yok/);
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('prova: geri okuma ve kayıt YOK', async () => {
    const { svc, durumOku } = kur();
    const r = await svc.uygula(CTX, { seviye: 'campaign', id: KAMPANYA }, { type: 'pause' }, { validateOnly: true });
    expect(r.prova).toBe(true);
    expect(durumOku).not.toHaveBeenCalled();
    expect(await h.q(`SELECT 1 FROM audit_logs`)).toHaveLength(0);
  });

  it('kota doluysa platforma HİÇ gidilmiyor', async () => {
    const { svc, applyAction, quota } = kur();
    (quota as unknown as { acquire: ReturnType<typeof vi.fn> }).acquire.mockResolvedValue({ allowed: false, reason: 'dolu' });
    await expect(svc.uygula(CTX, { seviye: 'ad', id: REKLAM }, { type: 'pause' })).rejects.toThrow(/Kota/);
    expect(applyAction).not.toHaveBeenCalled();
  });
});
