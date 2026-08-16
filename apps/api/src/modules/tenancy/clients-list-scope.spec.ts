import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { ClientsService } from './clients.service';

/**
 * MÜŞTERİ LİSTESİNİN KAPSAMI — bu ekran bir kez üretimde yanlış cevap verdi.
 *
 * Aktif müşteri seçimi RLS'te `can_access_client` üzerinden veriyi seçili
 * müşteriye daraltıyor. Liste o daraltmayla çalıştığında, Çiftçi Grup
 * seçiliyken diğer 11 müşteri "0 hesap" görünüyordu ve ekran "bağlı reklam
 * hesabı yok — bu müşteride hiç veri görünmeyecek" diye UYARIYORDU. Hesaplar
 * yerli yerindeydi (commit 54e4740).
 *
 * Aynı invariant artık ikinci bir işi daha taşıyor: liste hesapların ve
 * sayfaların KENDİSİNİ de döndürüyor. Daraltma geri gelirse hata bu sefer
 * "yanlış sayı" değil, kartların boş görünmesi olur — yine sessiz.
 *
 * Veritabanına gitmiyoruz: sınanan şey KARAR. Prisma'nın iç içe `select`
 * semantiğini taklit etmek, taklidi test etmek olurdu.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CTX: TenantContext = {
  orgId: ORG,
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [CLIENT_A],
  // Panelde A SEÇİLİ — hatanın kaynağı buydu.
  activeClientId: CLIENT_A,
  isOrgAdmin: true,
} as TenantContext;

interface FindManyArgs {
  select: {
    adAccounts?: { select?: Record<string, unknown> };
    socialProfiles?: { select?: Record<string, unknown> };
    _count?: unknown;
  };
}

let seenContext: TenantContext | null = null;
let seenArgs: FindManyArgs | null = null;
let svc: ClientsService;

beforeEach(() => {
  seenContext = null;
  seenArgs = null;

  const tx = {
    client: {
      findMany: async (args: FindManyArgs) => {
        seenArgs = args;
        return [];
      },
    },
  };

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (t: unknown) => Promise<T>) => {
      seenContext = ctx;
      return fn(tx);
    },
  } as unknown as PrismaService;

  svc = new ClientsService(prisma, new AuditService(null as unknown as PrismaAdminService));
});

describe('clients.list — kapsam', () => {
  it('KRİTİK: aktif müşteri daraltması KAPALI', async () => {
    await svc.list(CTX);

    expect(seenContext!.activeClientId).toBeNull();
    // Yetki katmanı DOKUNULMAMIŞ olmalı: kaldırılan tek şey seçim daraltması.
    // `clientIds` daralsaydı portföy yöneticisi kendi müşterilerini de
    // kaybederdi.
    expect(seenContext!.clientIds).toEqual(CTX.clientIds);
    expect(seenContext!.isOrgAdmin).toBe(CTX.isOrgAdmin);
  });

  it('hesaplar ve sayfalar SAYIYLA DEĞİL, kendileriyle dönüyor', async () => {
    // Sayı "bir şey var mı" sorusuna cevap veriyor; havuz modelinde asıl
    // sorulan "HANGİSİ var" ve cevabı yalnızca satırların kendisinde.
    await svc.list(CTX);

    expect(seenArgs!.select.adAccounts).toBeDefined();
    expect(seenArgs!.select.socialProfiles).toBeDefined();
    expect(seenArgs!.select._count).toBeDefined();
  });

  it('hesap satırında syncEnabled DA dönüyor', async () => {
    // Atanmış olmak ile izleniyor olmak farklı ve ikisi panelde birebir aynı
    // görünüyor ("veri yok"). Bayrak gelmezse ekran farkı gösteremez.
    expect(await svc.list(CTX)).toEqual([]);
    expect(seenArgs!.select.adAccounts?.select).toMatchObject({ syncEnabled: true });
  });

  it('KRİTİK: SAYFA satırında da syncEnabled dönüyor', async () => {
    /*
     * Bu alan bir kez unutuldu ve ekran sessizce yalan söyledi: sayfa
     * satırındaki `syncEnabled` gelmeyince tarayıcıda `undefined` oluyor,
     * rozet hep "gönderiler çekilmiyor" kalıyor, düğme hep "izlemeye al"
     * yazıyor ve tıklamadan sonra ekran birebir aynı görünüyor. Kullanıcı
     * için bu "düğme çalışmıyor" demekti — oysa istek gidiyor ve veritabanı
     * güncelleniyordu.
     *
     * Derleyici yakalayamıyor: panel yanıtı `serverApiFetch<ClientRow[]>` ile
     * DENETLENMEDEN dönüştürülüyor, yani tip alanın var olduğunu söylüyor ama
     * kimse doğrulamıyor. Kilit bu yüzden burada.
     */
    await svc.list(CTX);
    expect(seenArgs!.select.socialProfiles?.select).toMatchObject({ syncEnabled: true });
  });
});
