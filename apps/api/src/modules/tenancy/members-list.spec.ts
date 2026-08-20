import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { MembersService } from './members.service';

/**
 * EKİP LİSTESİ MÜŞTERİ HESAPLARINI TAŞIMIYOR.
 *
 * Ekran adı "Ekip & Yetkiler" ve işi ajans personelini yönetmek. Bir süre
 * müşteri markası için açılan giriş hesapları ajans personeliyle AYNI DÜZ
 * LİSTEDE duruyordu: rol dışında hiçbir ayrım yoktu ve üstteki sayaç ikisini
 * tek bir "N kullanıcı" olarak topluyordu — ajansın kaç çalışanı olduğu
 * ekrandan okunamıyordu.
 *
 * Veritabanına gitmiyoruz: sınanan şey SORGUNUN ŞEKLİ. Koşum ortamı
 * (`pglite-harness`) yalnızca `$queryRaw` veriyor, Prisma'nın model API'sini
 * vermiyor; onu taklit etmek taklidi test etmek olurdu.
 */

const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [] as string[],
  activeClientId: null,
  isOrgAdmin: true,
} as TenantContext;

/** `findMany`'ye giden argümanı yakalayan en küçük düzenek. */
function servis(): { svc: MembersService; args: () => Record<string, unknown> } {
  let yakalanan: Record<string, unknown> = {};
  const prisma = {
    withTenant: <T>(_ctx: TenantContext, fn: (tx: unknown) => Promise<T>) =>
      fn({
        user: {
          findMany: (a: Record<string, unknown>) => {
            yakalanan = a;
            return Promise.resolve([]);
          },
        },
      }),
  } as unknown as PrismaService;

  return {
    svc: new MembersService(prisma, {} as never),
    args: () => yakalanan,
  };
}

describe('ekip listesi süzgeci', () => {
  it('düzenek gerçekten sorguyu yakalıyor', async () => {
    // Yakalama çalışmazsa aşağıdaki iddialar boş bir nesne üzerinde
    // koşar ve "client_viewer yok" her zaman doğru olurdu.
    const { svc, args } = servis();
    await svc.listMembers(CTX);
    expect(Object.keys(args()).length).toBeGreaterThan(0);
    expect(args()).toHaveProperty('select');
  });

  it('KRİTİK: sorguda client_viewer’ı dışlayan bir WHERE var', async () => {
    const { svc, args } = servis();
    await svc.listMembers(CTX);

    // SÜZGEÇ SORGUDA, arayüzde değil: arayüzde süzmek uç noktayı doğrudan
    // çağıran birine listeyi açık bırakırdı.
    expect(args().where).toEqual({
      OR: [
        { memberships: { none: {} } },
        { memberships: { some: { role: { not: 'client_viewer' } } } },
      ],
    });
  });

  it('KRİTİK: HİÇ ÜYELİĞİ OLMAYAN kullanıcı listeden DÜŞMÜYOR', async () => {
    /*
     * `some` en az bir üyelik istiyor; üyeliği olmayan kullanıcı o koşula
     * hiç uymuyor ve listeden tamamen düşüyordu. Üretimde yusuf@ ve ecem@
     * hesapları panelde HİÇ görünmedi ve arayüzde düzeltmeye çalışmak işe
     * yaramadı — satır API'den zaten gelmiyordu.
     */
    const { svc, args } = servis();
    await svc.listMembers(CTX);
    const w = args().where as { OR: Array<Record<string, unknown>> };
    expect(w.OR.some((k) => JSON.stringify(k).includes('"none"'))).toBe(true);
  });

  it('KRİTİK: clientId verilince O WORKSPACE’in listesi — müşteri hesapları DAHİL', async () => {
    /*
     * İKİ LİSTE, İKİ AYRI SORU. Ajans listesi client_viewer'ı dışlıyor
     * (ajansın kaç çalışanı olduğu okunabilmeli). Workspace listesi onları
     * İÇERMEK zorunda: o ekranın bütün amacı müşterinin kendi giriş
     * hesaplarını yönetmek ve başka hiçbir ekranda görünmüyorlar.
     */
    const { svc, args } = servis();
    await svc.listMembers(CTX, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    expect(args().where).toEqual({
      memberships: { some: { clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' } },
    });
    // ROL SÜZGECİ OLMAMALI — olsaydı müşterinin hesapları kendi
    // workspace'inde de görünmez, yani yönetilemez olurdu.
    expect(JSON.stringify(args().where)).not.toContain('client_viewer');
  });

  it('clientId verilmezse ajans listesi — eski davranış korunuyor', async () => {
    const { svc, args } = servis();
    await svc.listMembers(CTX);
    expect(JSON.stringify(args().where)).toContain('client_viewer');
  });

  it('KRİTİK: `some` kullanılıyor, `every` DEĞİL', async () => {
    /*
     * FARK ÖNEMLİ. Bir kişi bir müşteride client_viewer, başka bir yerde
     * manager olabilir — ajans çalışanının kendi test hesabı bunun tipik
     * örneği. O kişi ajans personelidir ve listede KALMALI.
     * `every: { role: { not: 'client_viewer' } }` yazmak onu gizlerdi ve
     * belirtisi "bir çalışan ekip listesinden kayboldu" olurdu.
     */
    const w = args_of(await (async () => {
      const { svc, args } = servis();
      await svc.listMembers(CTX);
      return args();
    })());
    expect(w).toContain('some');
    expect(w).not.toContain('every');
  });
});

/** Sorgu nesnesini metne çevirir — anahtar varlığını sınamak için. */
function args_of(a: Record<string, unknown>): string {
  return JSON.stringify(a.where ?? {});
}
