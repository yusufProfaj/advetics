import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext, UpdateClientInput } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import { ClientsService } from './clients.service';

/**
 * ═══ KISA AD (SLUG) SESSİZCE DÜŞÜYORDU ═══
 *
 * `PATCH /clients/:id { slug }` 200 dönüyor ama alan yazılmıyordu (canlıda
 * görüldü, 2026-10-12: "denemedeneme-proje" düzeltilemedi). Sınanan:
 * UPDATE'e geçiyor mu, şirket içi çakışma Türkçe cümleyle söyleniyor mu,
 * eşzamanlı istekte tekil indeks ihlali aynı cümleye çevriliyor mu.
 */
const CTX = { orgId: 'o1', userId: 'u1', clientIds: ['c1'], activeClientId: 'c1' } as unknown as TenantContext;
const META = { ip: null, userAgent: null, requestId: 't' };

let yazilan: Record<string, unknown> | null;
let cakisan: { name: string } | null;
let updateHatasi: unknown;
let kayit: Array<Record<string, unknown>>;
let svc: ClientsService;

beforeEach(() => {
  yazilan = null;
  cakisan = null;
  updateHatasi = null;
  kayit = [];
  const tx = {
    client: {
      findUnique: async () => ({ id: 'c1', orgId: 'o1', name: 'Deneme Proje', slug: 'denemedeneme-proje', timezone: 'Europe/Istanbul' }),
      findFirst: async () => cakisan,
      update: async ({ data }: { data: Record<string, unknown> }) => {
        if (updateHatasi) throw updateHatasi;
        yazilan = data;
        return { id: 'c1', slug: 'denemedeneme-proje', ...data };
      },
    },
  };
  const prisma = { withTenant: async <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(tx) } as unknown as PrismaService;
  svc = new ClientsService(prisma, { record: async (_t: unknown, _c: unknown, e: Record<string, unknown>) => void kayit.push(e) } as unknown as AuditService);
});

describe('workspace kısa adı', () => {
  it('KRİTİK: yeni kısa ad UPDATE’e geçiyor ve denetim kaydına giriyor', async () => {
    await svc.update(CTX, 'c1', { slug: 'deneme-proje' } as UpdateClientInput, META);
    expect(yazilan).toMatchObject({ slug: 'deneme-proje' });
    expect(kayit[0]).toMatchObject({ before: { slug: 'denemedeneme-proje' }, after: { slug: 'deneme-proje' } });
  });

  it('aynı kısa ad gönderilirse yazılmaz (gereksiz çakışma kontrolü yok)', async () => {
    await svc.update(CTX, 'c1', { slug: 'denemedeneme-proje', name: 'X' } as UpdateClientInput, META);
    expect(yazilan).not.toHaveProperty('slug');
  });

  it('KRİTİK: şirket içinde başka workspace kullanıyorsa adıyla söylenir, yazılmaz', async () => {
    cakisan = { name: 'Ege Birlik Yapı' };
    await expect(svc.update(CTX, 'c1', { slug: 'ege-birlik-yapi' } as UpdateClientInput, META)).rejects.toThrow(/Ege Birlik Yapı/);
    expect(yazilan).toBeNull();
  });

  it('eşzamanlı istekte tekil ihlali (P2002) aynı Türkçe cümleye çevrilir', async () => {
    updateHatasi = Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
    await expect(svc.update(CTX, 'c1', { slug: 'deneme-proje' } as UpdateClientInput, META)).rejects.toThrow(/kısa adı bu şirkette/);
  });
});
