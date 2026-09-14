import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { UstHesapEkibiService } from './ust-hesap-ekibi.service';

/**
 * ═══ ÜST HESAP EKİBİ — DALLANMA KARARLARI ═══
 *
 * Veritabanına gitmiyoruz: sınanan şey kapılar ve dallar, SQL değil.
 *
 * Kritik kararlar ve neden kritik oldukları:
 *   1. `isOrgAdmin` KAPI DEĞİL — tek şirketin yöneticisi üst hesaba kişi
 *      ekleyebilse kendini bütün şirketlerin yöneticisi yapardı.
 *   2. Var olan kullanıcının parolasına DOKUNULMUYOR.
 *   3. Başka üst hesabın kullanıcısı "bulunamadı" — varlığı sızmıyor.
 *   4. Yeni kullanıcının ev şirketi üst hesabın İLK şirketi.
 *   5. Son Yönetici düşürülemiyor/silinemiyor; kendi yetkin değiştirilemiyor.
 */
const MGR = 'aaaaaaaa-0000-0000-0000-00000000000f';
const MGR_B = 'bbbbbbbb-0000-0000-0000-00000000000f';
const ORG = '11111111-1111-1111-1111-111111111111';
const BEN = '22222222-2222-2222-2222-222222222222';
const O = '33333333-3333-3333-3333-333333333333';

const META = { ip: null, userAgent: null, requestId: 'test' };

function ctx(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: BEN,
    orgId: ORG,
    managerAccountId: MGR,
    platformAdmin: false,
    isOrgAdmin: true, // BİLEREK true: kapının buna BAKMADIĞI sınanıyor.
    ...over,
  } as TenantContext;
}

interface Calls {
  userCreate: Array<Record<string, unknown>>;
  uyelikCreate: Array<Record<string, unknown>>;
  uyelikUpdate: unknown[];
  uyelikDelete: unknown[];
  audit: string[];
}
let calls: Calls;
let svc: UstHesapEkibiService;
/** Çağıranın üst hesaptaki üyeliği — `null` = üye değil. */
let benimUyeligim: { role: string } | null;
/** `user.findFirst` (e-postayla arama) bunu döndürüyor. */
let mevcutKullanici: Record<string, unknown> | null;
/** `managerMembership.findFirst({ id })` bunu döndürüyor. */
let hedefUyelik: Record<string, unknown> | null;
let kalanYonetici = 1;

const KULLANICI = {
  id: O,
  email: 'o@musteri.com',
  fullName: 'O Kişi',
  status: 'active',
  lastLoginAt: null,
};

beforeEach(() => {
  calls = { userCreate: [], uyelikCreate: [], uyelikUpdate: [], uyelikDelete: [], audit: [] };
  benimUyeligim = { role: 'admin' };
  mevcutKullanici = null;
  hedefUyelik = null;
  kalanYonetici = 1;

  const managerMembership = {
    findFirst: async ({ where }: { where: Record<string, unknown> }) => {
      if (where.userId === BEN) return benimUyeligim;
      if (where.id) return hedefUyelik;
      return null;
    },
    findMany: async () => [],
    count: async () => kalanYonetici,
    create: async ({ data }: { data: Record<string, unknown> }) => {
      calls.uyelikCreate.push(data);
      return { id: 'uyelik-yeni', role: data.role };
    },
    update: async (args: { data: Record<string, unknown> }) => {
      calls.uyelikUpdate.push(args);
      return { id: 'uyelik-1', role: args.data.role };
    },
    delete: async (args: unknown) => {
      calls.uyelikDelete.push(args);
      return {};
    },
  };
  const admin = {
    managerMembership,
    user: {
      findFirst: async () => mevcutKullanici,
      update: async () => {
        throw new Error('user.update ÇAĞRILMAMALI — var olan kullanıcının parolasına dokunulmuyor');
      },
    },
    organization: {
      findFirst: async ({ orderBy }: { orderBy: Record<string, string> }) => {
        // İLK şirket = en eski. Sırasız bir seçim veritabanının keyfine kalır.
        expect(orderBy).toEqual({ createdAt: 'asc' });
        return { id: ORG };
      },
    },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        user: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            calls.userCreate.push(data);
            return { ...KULLANICI, id: 'yeni-user', email: data.email, fullName: data.fullName };
          },
        },
        managerMembership,
      }),
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        calls.audit.push(data.action);
        return {};
      },
    },
  } as unknown as PrismaAdminService;

  svc = new UstHesapEkibiService(admin, new AuditService(admin));
});

describe('KAPI: üst hesap üyeliğinin rolü', () => {
  it('KRİTİK: isOrgAdmin true olsa da üst hesapta Yönetici değilse 403', async () => {
    benimUyeligim = { role: 'ad_manager' };
    await expect(
      svc.ekle(ctx(), { email: 'x@y.com', role: 'admin' }, META),
    ).rejects.toMatchObject({ status: 403 });
    expect(calls.uyelikCreate).toEqual([]);
  });

  it('KRİTİK: üye bile değilse 403 — isOrgAdmin yine true', async () => {
    benimUyeligim = null;
    await expect(
      svc.ekle(ctx(), { email: 'x@y.com', role: 'admin' }, META),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('platform sahibi üye olmadan da ekleyebiliyor', async () => {
    benimUyeligim = null;
    await svc.ekle(
      ctx({ platformAdmin: true }),
      { email: 'x@y.com', fullName: 'X Y', password: 'cokGuvenliParola9', role: 'admin' },
      META,
    );
    expect(calls.uyelikCreate).toHaveLength(1);
  });

  it('üst hesap yoksa açık hata', async () => {
    await expect(
      svc.ekle(ctx({ managerAccountId: null }), { email: 'x@y.com', role: 'admin' }, META),
    ).rejects.toThrow(/üst hesap/);
  });
});

describe('ekle — var olan kullanıcı', () => {
  it('KRİTİK: parola KULLANILMIYOR, yalnızca üyelik açılıyor ve yanıt bunu söylüyor', async () => {
    mevcutKullanici = {
      ...KULLANICI,
      organization: { managerAccountId: MGR },
      managerMemberships: [],
    };
    const r = await svc.ekle(
      ctx(),
      { email: KULLANICI.email, password: 'yeniParolaDegil123', role: 'ad_manager' },
      META,
    );
    expect(r.created).toBe(false);
    expect(calls.userCreate).toEqual([]);
    expect(calls.uyelikCreate[0]).toMatchObject({ managerAccountId: MGR, userId: O, role: 'ad_manager' });
    expect(calls.audit).toEqual(['manager_membership.granted']);
  });

  it('KRİTİK: başka üst hesabın kullanıcısı "bulunamadı" — 404, 403 değil', async () => {
    mevcutKullanici = {
      ...KULLANICI,
      organization: { managerAccountId: MGR_B },
      managerMemberships: [],
    };
    await expect(
      svc.ekle(ctx(), { email: KULLANICI.email, role: 'admin' }, META),
    ).rejects.toMatchObject({ status: 404 });
    expect(calls.uyelikCreate).toEqual([]);
  });

  it('zaten ekipteyse 409 ve yol gösteriyor', async () => {
    mevcutKullanici = {
      ...KULLANICI,
      organization: { managerAccountId: MGR },
      managerMemberships: [{ id: 'u', role: 'ad_manager' }],
    };
    await expect(
      svc.ekle(ctx(), { email: KULLANICI.email, role: 'admin' }, META),
    ).rejects.toThrow(/zaten üst hesap ekibinde/);
  });
});

describe('ekle — yeni kullanıcı', () => {
  it('KRİTİK: ad ya da parola eksikse AÇIKÇA söyleniyor, sessizce açılmıyor', async () => {
    await expect(
      svc.ekle(ctx(), { email: 'yeni@x.com', role: 'admin' }, META),
    ).rejects.toThrow(/ad soyad ve parola/);
    expect(calls.userCreate).toEqual([]);
  });

  it('KRİTİK: ev şirketi üst hesabın İLK şirketi, parola HASH, üyelik doğru rolde', async () => {
    const r = await svc.ekle(
      ctx(),
      { email: 'yeni@x.com', fullName: 'Yeni Kişi', password: 'cokGuvenliParola9', role: 'admin' },
      META,
    );
    expect(r.created).toBe(true);
    const u = calls.userCreate[0]!;
    expect(u.orgId).toBe(ORG);
    expect(u.passwordHash).not.toBe('cokGuvenliParola9');
    expect(String(u.passwordHash).startsWith('$argon2id$')).toBe(true);
    expect(calls.uyelikCreate[0]).toMatchObject({ managerAccountId: MGR, userId: 'yeni-user', role: 'admin' });
    expect(calls.audit).toEqual(['manager_membership.user_created']);
  });
});

describe('rol değiştirme ve kaldırma', () => {
  it('KRİTİK: kendi yetkini değiştiremiyorsun', async () => {
    hedefUyelik = { id: 'uyelik-1', role: 'admin', user: { ...KULLANICI, id: BEN } };
    await expect(
      svc.rolDegistir(ctx(), 'uyelik-1', { role: 'ad_manager' }, META),
    ).rejects.toThrow(/Kendi/);
    await expect(svc.kaldir(ctx(), 'uyelik-1', META)).rejects.toThrow(/Kendi/);
    expect(calls.uyelikUpdate).toEqual([]);
    expect(calls.uyelikDelete).toEqual([]);
  });

  it('KRİTİK: son Yönetici düşürülemiyor ve silinemiyor', async () => {
    hedefUyelik = { id: 'uyelik-1', role: 'admin', user: KULLANICI };
    kalanYonetici = 0;
    await expect(
      svc.rolDegistir(ctx(), 'uyelik-1', { role: 'ad_manager' }, META),
    ).rejects.toThrow(/en az bir Yönetici/);
    await expect(svc.kaldir(ctx(), 'uyelik-1', META)).rejects.toThrow(/en az bir Yönetici/);
  });

  it('başka Yönetici varsa düşürme ve silme çalışıyor', async () => {
    hedefUyelik = { id: 'uyelik-1', role: 'admin', user: KULLANICI };
    kalanYonetici = 1;
    const r = await svc.rolDegistir(ctx(), 'uyelik-1', { role: 'ad_manager' }, META);
    expect(r.role).toBe('ad_manager');
    await svc.kaldir(ctx(), 'uyelik-1', META);
    expect(calls.uyelikDelete).toHaveLength(1);
    expect(calls.audit).toEqual(['manager_membership.updated', 'manager_membership.removed']);
  });

  it('Reklam Yöneticisini kaldırmak Yönetici sayımına takılmıyor', async () => {
    hedefUyelik = { id: 'uyelik-1', role: 'ad_manager', user: KULLANICI };
    kalanYonetici = 0;
    await svc.kaldir(ctx(), 'uyelik-1', META);
    expect(calls.uyelikDelete).toHaveLength(1);
  });

  it('başka üst hesabın üyeliği "bulunamadı"', async () => {
    hedefUyelik = null;
    await expect(svc.kaldir(ctx(), 'uyelik-x', META)).rejects.toMatchObject({ status: 404 });
  });
});
