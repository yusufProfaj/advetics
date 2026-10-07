import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePermissions, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { gercekYayinAcikMi, PilotGercekYayinService } from './gercek-yayin';

/**
 * ═══ GERÇEK YAYIN ANAHTARI — TEK KAPI ═══
 * Ajans şirketinin satırı belirler; müşteri şirketinin satırı gerçeği
 * açamaz; okunamazsa ve ajans belirsizse KAPALI.
 */
let h: Harness;
let svc: PilotGercekYayinService;
const kayit = vi.fn();
const MA = '12121212-1212-4121-8121-121212121212';
const MUSTERI_ORG = '13131313-1313-4131-8131-131313131313';
const AJANS = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true, role: 'admin', permissions: [...resolvePermissions('admin')] } as unknown as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new PilotGercekYayinService(prisma, { record: kayit } as unknown as AuditService);
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  kayit.mockReset();
  await h.reset();
  await seedTenant(h);
});

async function ustHesap(ajans: string | null) {
  await h.q(`INSERT INTO manager_accounts (id, name, slug, updated_at) VALUES ($1, 'MA', 'ma', now())`, [MA]);
  await h.q(`UPDATE organizations SET manager_account_id = $1 WHERE id = $2`, [MA, IDS.org]);
  await h.q(`INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES ($1, 'Müşteri', 'musteri-org', $2, now())`, [MUSTERI_ORG, MA]);
  if (ajans) await h.q(`UPDATE manager_accounts SET ajans_org_id = $2 WHERE id = $1`, [MA, ajans]);
}
const ac = (org: string, acik = true) =>
  h.q(`INSERT INTO ajans_ayari (org_id, pilot_gercek_yayin, pilot_gercek_yayin_at, pilot_gercek_yayin_sebebi) VALUES ($1, $2, now(), 'sebep') ON CONFLICT (org_id) DO UPDATE SET pilot_gercek_yayin = EXCLUDED.pilot_gercek_yayin`, [org, acik]);

describe('gercekYayinAcikMi', () => {
  it('KRİTİK: varsayılan KAPALI (satır yok)', async () => {
    expect(await gercekYayinAcikMi(h.db, IDS.org)).toEqual({ acik: false, okunamadi: null });
  });

  it('KRİTİK: ajans şirketinin anahtarı müşteri şirketini bağlar; müşterinin kendi satırı AÇAMAZ', async () => {
    await ustHesap(IDS.org);
    await ac(MUSTERI_ORG);
    expect((await gercekYayinAcikMi(h.db, MUSTERI_ORG)).acik).toBe(false);
    await ac(IDS.org);
    await ac(MUSTERI_ORG, false);
    expect((await gercekYayinAcikMi(h.db, MUSTERI_ORG)).acik).toBe(true);
  });

  it('KRİTİK: ajansı belirsiz şirket ve okunamayan anahtar KAPALI', async () => {
    await ustHesap(null);
    await ac(MUSTERI_ORG);
    expect(await gercekYayinAcikMi(h.db, MUSTERI_ORG)).toMatchObject({ acik: false, okunamadi: expect.stringContaining('ajansı') });
    const bozuk = { $queryRaw: async () => { throw new Error('bağlantı yok'); } };
    expect(await gercekYayinAcikMi(bozuk, IDS.org)).toMatchObject({ acik: false, okunamadi: expect.stringContaining('bağlantı yok') });
  });
});

describe('anahtarı değiştirmek', () => {
  it('KRİTİK: ajans yöneticisi açar; iz ve denetim kaydı yazılır', async () => {
    const d = await svc.degistir(AJANS, { acik: true, sebep: 'İlk canlı tur tamamlandı' }, { ip: null, userAgent: null });
    expect(d).toMatchObject({ acik: true, sebep: 'İlk canlı tur tamamlandı', degistiren: 'Test Kullanıcı', degistirebilir: true });
    expect(kayit).toHaveBeenCalledWith(expect.anything(), AJANS, expect.objectContaining({ action: 'ajans_ayari.pilot_gercek_yayin_acildi' }));
  });

  it('KRİTİK: müşteri şirketinden ve yönetici olmayandan değiştirilemez', async () => {
    await ustHesap(IDS.org);
    const musteriSirketi = { ...AJANS, orgId: MUSTERI_ORG } as TenantContext;
    await expect(svc.degistir(musteriSirketi, { acik: true, sebep: 'kendi şirketimde açayım' }, { ip: null, userAgent: null })).rejects.toThrow(/ajans şirketinden/);
    await expect(svc.degistir({ ...AJANS, isOrgAdmin: false } as TenantContext, { acik: true, sebep: 'yönetici değilim ama' }, { ip: null, userAgent: null })).rejects.toThrow(/yalnız ajans yöneticisi/);
    expect(kayit).not.toHaveBeenCalled();
  });

  it('müşteri hesabı durumu göremez', async () => {
    await expect(svc.durum({ ...AJANS, role: 'client_viewer' } as TenantContext)).rejects.toThrow(/ajans hesabından/);
  });
});
