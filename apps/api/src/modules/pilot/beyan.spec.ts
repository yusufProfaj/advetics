import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolvePermissions, workspaceBeyaniSchema, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { PilotBeyanService } from './beyan.service';
import { uyumProfiliOku } from './uyum-profili';

/** ═══ VERİ ADIMI BEYANI — var olan alanlara yazar, denetçi aynısını okur ═══ */
let h: Harness;
let svc: PilotBeyanService;
const kayit = vi.fn();
const AJANS = { orgId: '99999999-9999-4999-8999-999999999999', userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true, role: 'admin', permissions: [...resolvePermissions('admin')] } as unknown as TenantContext;
const MUSTERI = { ...AJANS, isOrgAdmin: false, role: 'client_viewer', permissions: [...resolvePermissions('client_viewer')] } as unknown as TenantContext;
const meta = { ip: null, userAgent: null };

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new PilotBeyanService(prisma, { record: kayit } as unknown as AuditService);
}, 60_000);
afterAll(async () => h?.close());
beforeEach(async () => {
  kayit.mockReset();
  await h.reset();
  await seedTenant(h);
});

describe('workspace beyanı', () => {
  it('KRİTİK: beyan yokken null (sorulmadı); boş liste yazınca [] ("hiçbiri") ve denetçi aynısını okur', async () => {
    expect(await svc.oku(AJANS, IDS.client)).toMatchObject({ ozelKategoriler: null, beyan: null, sektor: null, sektorEslesmesi: null });
    expect((await uyumProfiliOku(h.db, IDS.client)).ozelKategoriler).toBeNull();
    const b = await svc.yaz(AJANS, { clientId: IDS.client, ozelKategoriler: [], sektor: 'Kahve makinesi üretimi' }, meta);
    expect(b).toMatchObject({ ozelKategoriler: [], beyan: { kim: 'Test Kullanıcı' }, sektor: 'Kahve makinesi üretimi', sektorEslesmesi: ['B2B_URETICI'] });
    const p = await uyumProfiliOku(h.db, IDS.client);
    expect(p).toMatchObject({ ozelKategoriler: [], sektorler: ['B2B_URETICI'] });
    expect(kayit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ orgId: IDS.org }), expect.objectContaining({ action: 'workspace.ozel_kategori_sektor_beyani' }));
  });

  it('kategori seçimi var olan alana yazılır; profil satırı yoksa açılır, varsa güncellenir', async () => {
    await svc.yaz(AJANS, { clientId: IDS.client, ozelKategoriler: ['HOUSING'], sektor: 'İnşaat' }, meta);
    await svc.yaz(AJANS, { clientId: IDS.client, ozelKategoriler: ['HOUSING', 'FINANCIAL_PRODUCTS_SERVICES'], sektor: 'Emlak ofisi' }, meta);
    const [c] = await h.q<{ k: string[] }>('SELECT special_ad_categories AS k FROM clients WHERE id = $1', [IDS.client]);
    // Veritabanı CHECK'i eski adı istiyor; okuyucu yeni ada çeviriyor.
    expect(c!.k).toEqual(['HOUSING', 'CREDIT']);
    expect((await svc.oku(AJANS, IDS.client)).ozelKategoriler).toEqual(['HOUSING', 'FINANCIAL_PRODUCTS_SERVICES']);
    const r = await h.q<{ sektor: string }>('SELECT sektor FROM client_profiles WHERE client_id = $1', [IDS.client]);
    expect(r).toEqual([{ sektor: 'Emlak ofisi' }]);
  });

  it('KRİTİK: müşteri hesabı beyan yazamaz (yasal beyan ajansın)', async () => {
    await expect(svc.yaz(MUSTERI, { clientId: IDS.client, ozelKategoriler: [], sektor: 'Kahve' }, meta)).rejects.toThrow(/ajans yazar/);
    expect((await svc.oku(AJANS, IDS.client)).beyan).toBeNull();
  });

  it('şema: aynı kategori iki kez ve bilinmeyen kategori reddedilir; sektör zorunlu', () => {
    expect(workspaceBeyaniSchema.safeParse({ clientId: IDS.client, ozelKategoriler: ['HOUSING', 'HOUSING'], sektor: 'X1' }).success).toBe(false);
    expect(workspaceBeyaniSchema.safeParse({ clientId: IDS.client, ozelKategoriler: ['CREDIT'], sektor: 'X1' }).success).toBe(false);
    expect(workspaceBeyaniSchema.safeParse({ clientId: IDS.client, ozelKategoriler: [], sektor: ' ' }).success).toBe(false);
  });
});
