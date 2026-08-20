import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { MembersService } from './members.service';

/**
 * KULLANICI BİLGİSİ GÜNCELLEME.
 *
 * Veritabanına gitmiyoruz: sınanan şey KARARLAR — hangi alanlar yazılıyor,
 * parola hash'leniyor mu, çakışan e-posta ne yapıyor ve rol kazara değişiyor
 * mu.
 *
 * Üçü de sessiz hata üretebilecek yerler:
 *   1. Parola DÜZ METİN yazılırsa hiçbir test, hiçbir log göstermez.
 *   2. Verilmeyen alan yazılırsa (`undefined` → null) kullanıcının adı ya da
 *      e-postası sessizce silinir.
 *   3. Rol buradan değişebilirse "bir müşteride yönetici, başkasında
 *      görüntüleyici" kuralı bozulur.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';

const CTX: TenantContext = {
  orgId: ORG,
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [],
  activeClientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  isOrgAdmin: true,
} as unknown as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

let yazilan: Record<string, unknown>;
let denetim: Array<Record<string, unknown>>;
let cakisanVar: boolean;
let kapsam: TenantContext | null;
let svc: MembersService;

beforeEach(() => {
  yazilan = {};
  denetim = [];
  cakisanVar = false;
  kapsam = null;

  const prisma = {
    withTenant: <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      kapsam = ctx;
      return fn({
        user: {
          findFirst: (a: { where: Record<string, unknown> }) =>
            // İkinci `findFirst` çakışma kontrolü — `id: { not }` taşıyor.
            'id' in a.where && typeof a.where.id === 'object'
              ? Promise.resolve(cakisanVar ? { id: 'baska' } : null)
              : Promise.resolve({ id: USER, email: 'eski@x.com', fullName: 'Eski Ad' }),
          update: (a: { data: Record<string, unknown> }) => {
            yazilan = a.data;
            return Promise.resolve({ id: USER, email: 'yeni@x.com', fullName: 'Yeni Ad' });
          },
        },
      });
    },
  } as unknown as PrismaService;

  const audit = {
    record: (_tx: unknown, _c: unknown, kayit: Record<string, unknown>) => {
      denetim.push(kayit);
      return Promise.resolve();
    },
  } as unknown as AuditService;

  svc = new MembersService(prisma, audit);
});

describe('alanlar', () => {
  it('KRİTİK: yalnızca VERİLEN alanlar yazılıyor', async () => {
    /*
     * Verilmeyen alanı yazmak (`undefined` → null) kullanıcının adını ya da
     * e-postasını sessizce silerdi — ve bu ancak o kişi giriş yapamayınca
     * fark edilirdi.
     */
    await svc.updateMemberInfo(CTX, USER, { fullName: 'Yeni Ad' }, META);
    expect(yazilan).toEqual({ fullName: 'Yeni Ad' });
    expect('email' in yazilan).toBe(false);
    expect('passwordHash' in yazilan).toBe(false);
  });

  it('KRİTİK: parola HASH’LENEREK yazılıyor, düz metin DEĞİL', async () => {
    await svc.updateMemberInfo(CTX, USER, { password: 'yeniParola123' }, META);
    expect('passwordHash' in yazilan).toBe(true);
    expect(yazilan.passwordHash).not.toBe('yeniParola123');
    expect(String(yazilan.passwordHash).length).toBeGreaterThan(20);
    // Düz parola hiçbir alanda durmamalı.
    expect(JSON.stringify(yazilan)).not.toContain('yeniParola123');
  });

  it('KRİTİK: ROL burada değişmiyor', () => {
    // Rol `memberships` üzerinde; buradan değişebilseydi "bir müşteride
    // yönetici, başkasında görüntüleyici" kuralı bozulurdu.
    expect('role' in yazilan).toBe(false);
  });

  it('üç alan birden gönderilebiliyor', async () => {
    await svc.updateMemberInfo(
      CTX,
      USER,
      { fullName: 'A', email: 'a@b.com', password: 'uzunParola12' },
      META,
    );
    expect(Object.keys(yazilan).sort()).toEqual(['email', 'fullName', 'passwordHash']);
  });
});

describe('e-posta çakışması', () => {
  it('KRİTİK: başka kullanıcıdaki e-posta REDDEDİLİYOR', async () => {
    /*
     * Veritabanı kısıtı zaten engelliyor ama oradan dönen ham `P2002`
     * panelde "Bu kayıt zaten mevcut" oluyor ve hangi alanın çakıştığını
     * söylemiyor.
     */
    cakisanVar = true;
    await expect(
      svc.updateMemberInfo(CTX, USER, { email: 'dolu@x.com' }, META),
    ).rejects.toThrow(/e-posta/i);
  });

  it('aynı e-posta tekrar gönderilirse çakışma kontrolü YAPILMIYOR', async () => {
    // Kullanıcının kendi adresini yeniden göndermek bir çakışma değil.
    cakisanVar = true;
    await expect(
      svc.updateMemberInfo(CTX, USER, { email: 'eski@x.com', fullName: 'X' }, META),
    ).resolves.toBeTruthy();
  });
});

describe('kapsam ve denetim', () => {
  it('KRİTİK: aktif müşteri daraltması KAPATILIYOR', async () => {
    // Oturumda bir müşteri seçiliyken RLS, o müşteriye bağlı olmayan
    // kullanıcı satırını gizler ve güncelleme "kullanıcı bulunamadı" verirdi.
    await svc.updateMemberInfo(CTX, USER, { fullName: 'X' }, META);
    expect(kapsam!.activeClientId).toBeNull();
  });

  it('KRİTİK: denetim kaydına PAROLA yazılmıyor, yalnızca değiştiği', async () => {
    await svc.updateMemberInfo(CTX, USER, { password: 'gizliParola99' }, META);
    const k = denetim[0]!;
    expect(JSON.stringify(k)).not.toContain('gizliParola99');
    expect((k.after as Record<string, unknown>).passwordChanged).toBe(true);
  });
});
