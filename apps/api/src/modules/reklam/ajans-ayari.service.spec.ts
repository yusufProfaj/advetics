import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { AjansAyariService } from './ajans-ayari.service';
import { metaYazmaAcikMi } from './yazma-kapisi';

let h: Harness;
let svc: AjansAyariService;
const kayitlar: string[] = [];
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;
const meta = { ip: null, userAgent: null };

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  const audit = { record: async (_tx: unknown, _c: unknown, e: { action: string }) => void kayitlar.push(e.action) } as unknown as AuditService;
  svc = new AjansAyariService(prisma, audit);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  kayitlar.length = 0;
  await h.reset();
  await seedTenant(h);
});

describe('atıf standardı', () => {
  it('seçilene kadar null; seçim kim/ne zaman ile kaydediliyor ve denetime yazılıyor', async () => {
    expect((await svc.atifOku(CTX)).standart).toBeNull();
    const r = await svc.atifSec(CTX, 'tik7_gor1', meta);
    expect(r.standart).toBe('tik7_gor1');
    expect((await svc.atifOku(CTX)).standart).toBe('tik7_gor1');
    expect(kayitlar).toEqual(['ajans_ayari.atif_standardi']);
  });

  it('yönetici olmayan seçemez', async () => {
    await expect(svc.atifSec({ ...CTX, isOrgAdmin: false }, 'tik7', meta)).rejects.toThrow(/yönetici/);
  });
});

describe('"Meta’ya yazmayı durdur"', () => {
  it('KRİTİK: durdurunca kapı kapanır, açınca açılır; ikisi de denetime yazılır', async () => {
    const tx = (fn: (t: never) => Promise<unknown>) => fn(h.db as never);
    await svc.yazmaAnahtari(CTX, true, 'v26 hatası', meta);
    expect(await metaYazmaAcikMi(tx as never, IDS.client)).toEqual({ acik: false, sebep: "Meta'ya yazma ajans tarafından durduruldu: v26 hatası" });
    await svc.yazmaAnahtari(CTX, false, null, meta);
    expect(await metaYazmaAcikMi(tx as never, IDS.client)).toEqual({ acik: true });
    expect(kayitlar).toEqual(['ajans_ayari.meta_yazma_durduruldu', 'ajans_ayari.meta_yazma_acildi']);
  });

  it('sebepsiz durdurma ve yönetici olmayan reddedilir', async () => {
    await expect(svc.yazmaAnahtari(CTX, true, '  ', meta)).rejects.toThrow(/sebebi/);
    await expect(svc.yazmaAnahtari({ ...CTX, isOrgAdmin: false }, true, 'x', meta)).rejects.toThrow(/yönetici/);
  });

  it('anahtar atıf seçimini silmiyor', async () => {
    await svc.atifSec(CTX, 'tik7', meta);
    await svc.yazmaAnahtari(CTX, true, 'olay', meta);
    expect((await svc.atifOku(CTX)).standart).toBe('tik7');
  });
});
