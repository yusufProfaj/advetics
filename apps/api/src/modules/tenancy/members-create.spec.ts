import { beforeEach, describe, expect, it } from 'vitest';
import type { CreateMemberInput, TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { AuditService } from '../audit/audit.service';
import { MembersService } from './members.service';

/**
 * EKİBE KULLANICI EKLEME — davet akışının yerine geçen yol.
 *
 * Veritabanına gitmiyoruz: sınanan şey DALLANMA KARARLARI, SQL değil.
 * Prisma'nın model API'sini koşum ortamında taklit etmek, taklidi test etmek
 * olurdu (bkz. pglite-harness'ın kendi notu).
 *
 * Dört karar da sessiz hata üretebilecek yerlerde duruyor:
 *
 *   1. Parola HASH'LENEREK yazılıyor mu — düz metin yazan bir regresyon
 *      hiçbir testte, hiçbir logda görünmez ve felakettir.
 *   2. Mevcut kullanıcının parolası KORUNUYOR mu — "ekip ekle" ekranından
 *      yapılan masum bir işlem, çalışan bir hesabın parolasını sessizce
 *      sıfırlamamalı.
 *   3. Aynı kapsam iki kez verilemiyor mu.
 *   4. Org geneli erişim yalnızca owner/admin'e mi.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CTX: TenantContext = {
  orgId: ORG,
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [CLIENT],
  activeClientId: null,
  isOrgAdmin: true,
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

function input(over: Partial<CreateMemberInput> = {}): CreateMemberInput {
  return {
    email: 'yeni@advetics.com',
    fullName: 'Yeni Kullanıcı',
    password: 'cokGuvenliParola9',
    role: 'manager',
    clientId: CLIENT,
    ...over,
  } as CreateMemberInput;
}

interface Calls {
  userCreate: Array<Record<string, unknown>>;
  userUpdate: unknown[];
  membershipCreate: Array<Record<string, unknown>>;
  audit: string[];
}

let calls: Calls;
let svc: MembersService;
/** `user.findFirst` bu değeri döndürür — null ise kullanıcı yok demek. */
let existingUser: { id: string; memberships: Array<{ clientId: string | null }> } | null;

beforeEach(() => {
  calls = { userCreate: [], userUpdate: [], membershipCreate: [], audit: [] };
  existingUser = null;

  const tx = {
    client: { findUnique: async () => ({ id: CLIENT, name: 'Müşteri' }) },
    user: {
      findFirst: async () => existingUser,
      findUnique: async () =>
        existingUser ? { ...existingUser, email: 'mevcut@advetics.com' } : null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.userCreate.push(data);
        return { id: 'yeni-user', memberships: [] };
      },
      update: async (args: unknown) => {
        calls.userUpdate.push(args);
        return {};
      },
    },
    membership: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        calls.membershipCreate.push(data);
        return {};
      },
    },
    auditLog: {
      create: async ({ data }: { data: { action: string } }) => {
        calls.audit.push(data.action);
        return {};
      },
    },
  };

  const prisma = {
    withTenant: async <T>(_ctx: TenantContext, fn: (t: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;

  svc = new MembersService(prisma, new AuditService(null as unknown as PrismaAdminService));
});

describe('createMember', () => {
  it('yeni kullanıcı oluşturuluyor ve yetkisi veriliyor', async () => {
    const res = await svc.createMember(CTX, input(), META);

    expect(res.created).toBe(true);
    expect(calls.userCreate).toHaveLength(1);
    expect(calls.membershipCreate[0]).toMatchObject({
      userId: 'yeni-user',
      orgId: ORG,
      clientId: CLIENT,
      role: 'manager',
    });
    expect(calls.audit).toEqual(['user.created']);
  });

  it('KRİTİK: parola HASH olarak yazılıyor, düz metin değil', async () => {
    await svc.createMember(CTX, input(), META);

    const written = calls.userCreate[0]!.passwordHash as string;
    expect(written).not.toBe('cokGuvenliParola9');
    // argon2id hash'i bu önekle başlıyor. Önek kontrolü, "bir şey hash'lenmiş"
    // demenin en ucuz ve en kesin yolu.
    expect(written.startsWith('$argon2id$')).toBe(true);
  });

  it('yeni kullanıcı mustChangePassword ile doğuyor', async () => {
    // Zorlama HENÜZ yazılmadı (alanı okuyan yok). Yine de yazıyoruz ki
    // zorlama eklendiği gün bu kullanıcılar da kapsansın — sonradan geriye
    // dönük doldurmak, kimin geçici parolayla kaldığını bilmemek demek.
    await svc.createMember(CTX, input(), META);
    expect(calls.userCreate[0]!.mustChangePassword).toBe(true);
  });

  it('KRİTİK: MEVCUT kullanıcının parolasına DOKUNULMUYOR', async () => {
    existingUser = { id: 'mevcut-user', memberships: [{ clientId: null }] };

    const res = await svc.createMember(CTX, input(), META);

    expect(res.created).toBe(false);
    // Ne oluşturma ne güncelleme: kullanıcı satırına hiç dokunulmadı.
    expect(calls.userCreate).toEqual([]);
    expect(calls.userUpdate).toEqual([]);
    // Yalnızca yeni yetki eklendi.
    expect(calls.membershipCreate).toHaveLength(1);
    expect(calls.audit).toEqual(['membership.granted']);
  });

  it('AYNI kapsam ikinci kez verilemiyor', async () => {
    existingUser = { id: 'mevcut-user', memberships: [{ clientId: CLIENT }] };

    await expect(svc.createMember(CTX, input(), META)).rejects.toThrow(/zaten bu kapsamda/);
    expect(calls.membershipCreate).toEqual([]);
  });

  it('ORG GENELİ erişim yalnızca owner/admin rollerine verilebiliyor', async () => {
    // Bu bir yetki yükseltme kapısı: müşteri seçilmeden verilen bir manager
    // yetkisi, org'daki HER müşteriye erişim demek olurdu.
    await expect(
      svc.createMember(CTX, input({ clientId: null, role: 'manager' }), META),
    ).rejects.toThrow(/Organizasyon geneli/);
    expect(calls.userCreate).toEqual([]);
  });

  it('org geneli admin kabul ediliyor', async () => {
    const res = await svc.createMember(CTX, input({ clientId: null, role: 'admin' }), META);
    expect(res.created).toBe(true);
    expect(calls.membershipCreate[0]).toMatchObject({ clientId: null, role: 'admin' });
  });
});

// -----------------------------------------------------------------------------
// Mevcut kullanıcıya yetki ekleme — parola sormayan yol
// -----------------------------------------------------------------------------

describe('addMembership', () => {
  const USER = '33333333-3333-3333-3333-333333333333';

  it('mevcut kullanıcıya yetki ekliyor ve PAROLAYA hiç dokunmuyor', async () => {
    // Bu uç noktanın var olma sebebi bu: `createMember` parolayı zorunlu
    // istiyor ve var olan birine yetki verirken o alan boşa uydurulmuş bir
    // değer oluyordu.
    existingUser = { id: USER, memberships: [] };

    await svc.addMembership(CTX, { userId: USER, role: 'manager', clientId: CLIENT }, META);

    expect(calls.membershipCreate[0]).toMatchObject({
      userId: USER,
      clientId: CLIENT,
      role: 'manager',
    });
    expect(calls.userCreate).toEqual([]);
    expect(calls.userUpdate).toEqual([]);
    expect(calls.audit).toEqual(['membership.granted']);
  });

  it('AYNI kapsam ikinci kez verilemiyor', async () => {
    existingUser = { id: USER, memberships: [{ clientId: CLIENT }] };

    await expect(
      svc.addMembership(CTX, { userId: USER, role: 'analyst', clientId: CLIENT }, META),
    ).rejects.toThrow(/zaten bu kapsamda/);
    expect(calls.membershipCreate).toEqual([]);
  });

  it('BULUNAMAYAN kullanıcıya yetki verilemiyor', async () => {
    // RLS başka organizasyonun kullanıcısını da göstermiyor; "bulunamadı" ile
    // "senin org'unda değil" aynı cevabı veriyor ve bu kasıtlı.
    existingUser = null;

    await expect(
      svc.addMembership(CTX, { userId: USER, role: 'manager', clientId: CLIENT }, META),
    ).rejects.toThrow(/Kullanıcı bulunamadı/);
  });

  it('ORG GENELİ erişim yalnızca owner/admin rollerine verilebiliyor', async () => {
    existingUser = { id: USER, memberships: [] };

    await expect(
      svc.addMembership(CTX, { userId: USER, role: 'analyst', clientId: null }, META),
    ).rejects.toThrow(/Organizasyon geneli/);
    expect(calls.membershipCreate).toEqual([]);
  });
});
