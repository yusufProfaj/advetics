import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TenantContext } from '@advetics/shared';
import type { AppConfig } from '../../config/configuration';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { TenantContextService } from './tenant-context.service';
import type { TokenService } from './token.service';
import { AuthService } from './auth.service';

/**
 * ═══ BAŞKA ŞİRKETİN WORKSPACE'İNE GEÇİŞ ═══
 *
 * Kullanıcının bildirdiği hâl: *"herhangi bir şirketin workspace'ine
 * girdiğimde başka bir workspace'e geçiş yaparsam görseldeki hatayı
 * veriyor"* — ekranda **"Bu workspace'e erişim yetkiniz yok"**.
 *
 * SEBEP: erişim kontrolü `ctx.clientIds` listesine bakıyordu ve o liste
 * YALNIZCA AKTİF ŞİRKETİN workspace'lerini taşıyor. Seçici bütün ağacı
 * listeliyor, kullanıcı B şirketinin bir workspace'ine tıklıyor, kontrol
 * A şirketinin listesinde onu bulamıyor ve reddediyor. "Tüm şirketler"
 * modunda çalışıyordu (liste orada bütün ajansı kapsıyor), yani arıza
 * yalnızca ŞİRKET kapsamındayken görünüyordu — teşhisi zorlaştıran şey de
 * buydu.
 *
 * Kontrol artık hedef workspace'in ŞİRKETİNE göre yapılıyor. Aşağıdaki
 * testler hem AÇILAN kapıyı hem KAPALI KALAN kapıları sınıyor: yalnızca
 * ilkini yazmak, "her workspace herkese açık" hâlini de geçirirdi.
 */

const AJANS = 'aaaaaaaa-0000-0000-0000-000000000001';
const SIRKET_A = 'aaaaaaaa-0000-0000-0000-00000000000a';
const SIRKET_B = 'aaaaaaaa-0000-0000-0000-00000000000b';
const WS_A1 = 'bbbbbbbb-0000-0000-0000-0000000000a1';
const WS_B1 = 'bbbbbbbb-0000-0000-0000-0000000000b1';
const WS_B2 = 'bbbbbbbb-0000-0000-0000-0000000000b2';
const KULLANICI = 'cccccccc-0000-0000-0000-000000000001';

interface ClientSatiri {
  id: string;
  orgId: string;
  status: string;
  orgStatus: string;
}
interface UyelikSatiri {
  userId: string;
  orgId: string;
  clientId: string | null;
}

const CLIENTLAR: ClientSatiri[] = [
  { id: WS_A1, orgId: SIRKET_A, status: 'active', orgStatus: 'active' },
  { id: WS_B1, orgId: SIRKET_B, status: 'active', orgStatus: 'active' },
  { id: WS_B2, orgId: SIRKET_B, status: 'active', orgStatus: 'active' },
];

let uyelikler: UyelikSatiri[] = [];
let kardesOrglar: string[] = [];
/** Kullanıcının aktif bir üst hesap üyeliği var mı (`assertOrgAccess` buna bakıyor). */
let ustHesapVar = false;

/** `PrismaAdminService`in bu metotta kullanılan yüzeyi. */
function sahteAdmin(): PrismaAdminService {
  return {
    client: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const c = CLIENTLAR.find((x) => x.id === where.id);
        if (!c) return null;
        return {
          orgId: c.orgId,
          status: c.status,
          organization: { status: c.orgStatus },
        };
      },
    },
    organization: {
      // `assertOrgAccess`in üst hesap dalı: kardeş şirket araması.
      findFirst: async ({ where }: { where: { id: string } }) =>
        kardesOrglar.includes(where.id) ? { id: where.id } : null,
    },
    managerMembership: {
      findUnique: async () =>
        ustHesapVar
          ? { managerAccountId: 'mgr-1', managerAccount: { status: 'active' } }
          : null,
    },
    membership: {
      findFirst: async ({ where }: { where: Record<string, unknown> }) => {
        const orgId = where.orgId as string;
        const userId = where.userId as string;
        const or = where.OR as Array<{ clientId: string | null }> | undefined;
        const bulundu = uyelikler.find((u) => {
          if (u.userId !== userId || u.orgId !== orgId) return false;
          if (!or) return true;
          return or.some((k) => k.clientId === u.clientId);
        });
        return bulundu ? { id: 'm1', managerAccountId: null } : null;
      },
    },
  } as unknown as PrismaAdminService;
}

function servis(): AuthService {
  return new AuthService(
    sahteAdmin(),
    {} as PrismaService,
    {} as TokenService,
    {} as TenantContextService,
    {} as AuditService,
    {} as AppConfig,
  );
}

function baglam(over: Partial<TenantContext> = {}): TenantContext {
  return {
    userId: KULLANICI,
    orgId: SIRKET_A,
    clientIds: [WS_A1],
    activeClientId: WS_A1,
    managerAccountId: null,
    tumSirketler: false,
    role: 'admin',
    isOrgAdmin: true,
    permissions: [],
    ...over,
  } as TenantContext;
}

beforeEach(() => {
  uyelikler = [];
  kardesOrglar = [];
  ustHesapVar = false;
});

describe('KRİTİK: başka şirketin workspace’ine geçiş AÇILDI', () => {
  it('ŞİRKET GENELİ üyelik o şirketin workspace’ini açıyor', async () => {
    /*
     * Danışmana "B şirketinin tamamı" yetkisi veriliyor; üyelik satırı
     * `client_id = NULL` ile açılıyor. A şirketindeyken B'nin workspace'ine
     * tıklamak tam da kullanıcının denediği şeydi.
     */
    uyelikler = [{ userId: KULLANICI, orgId: SIRKET_B, clientId: null }];
    await expect(servis().workspaceKapsami(baglam(), WS_B1)).resolves.toBe(SIRKET_B);
    await expect(servis().workspaceKapsami(baglam(), WS_B2)).resolves.toBe(SIRKET_B);
  });

  it('WORKSPACE BAZLI üyelik YALNIZCA kendi satırını açıyor', async () => {
    /*
     * Tek workspace'e yetki verilen danışmana şirketin tamamını açmak,
     * yetkilendirme ekranındaki "şirket" ile "workspace" ayrımını anlamsız
     * kılardı — ve kimse bunu bir ekranda göremezdi.
     */
    uyelikler = [{ userId: KULLANICI, orgId: SIRKET_B, clientId: WS_B1 }];
    await expect(servis().workspaceKapsami(baglam(), WS_B1)).resolves.toBe(SIRKET_B);
    await expect(servis().workspaceKapsami(baglam(), WS_B2)).rejects.toThrow(
      /erişim yetkiniz yok/,
    );
  });

  it('ÜST HESAP kardeş şirketin HER workspace’ini açıyor', async () => {
    /*
     * Ajans yöneticisinin kardeş şirkette üyelik SATIRI olmayabiliyor;
     * erişim üst hesap rolünden geliyor. Orada üyelik aramak, ajans
     * yöneticisini kendi ajansının workspace'lerinden dışarıda bırakırdı.
     */
    ustHesapVar = true;
    kardesOrglar = [SIRKET_B];
    const ctx = baglam({ managerAccountId: 'mgr-1' });
    await expect(servis().workspaceKapsami(ctx, WS_B2)).resolves.toBe(SIRKET_B);
  });
});

describe('KRİTİK: kapılar KAPALI kaldı', () => {
  it('ERİŞİLEMEYEN şirketin workspace’i REDDEDİLİYOR', async () => {
    // Ne üyelik ne kardeşlik: `assertOrgAccess` atıyor. Kabul etmek,
    // cookie düzenleyerek başka bir kiracıya geçmek demekti.
    await expect(servis().workspaceKapsami(baglam(), WS_B1)).rejects.toThrow(
      /Bu şirkete erişim yetkiniz yok/,
    );
  });

  it('AKTİF ŞİRKETTE bağlamın listesi hâlâ geçerli', async () => {
    /*
     * Yeni yol, aynı şirket içindeki kontrolü GEVŞETMEMELİ: `clientIds`
     * o şirket için zaten doğru cevabı taşıyor.
     */
    const ctx = baglam({ clientIds: [] });
    await expect(servis().workspaceKapsami(ctx, WS_A1)).rejects.toThrow(
      /Bu workspace’e erişim yetkiniz yok/,
    );
    await expect(servis().workspaceKapsami(baglam(), WS_A1)).resolves.toBe(SIRKET_A);
  });

  it('ARŞİVLİ workspace ve PASİF şirket REDDEDİLİYOR', async () => {
    /*
     * Arşivli bir workspace seçiciye hiç düşmüyor ama uç noktaya elle
     * istek atmak mümkün; arşivlemeyi "yalnızca ekranda gizleme"ye
     * çevirmek, silinmiş sanılan bir kiracıyı okunabilir bırakırdı.
     */
    uyelikler = [{ userId: KULLANICI, orgId: SIRKET_B, clientId: null }];
    const b1 = CLIENTLAR.find((c) => c.id === WS_B1);
    if (!b1) throw new Error('fixture bozuk — WS_B1 yok');

    b1.status = 'archived';
    await expect(servis().workspaceKapsami(baglam(), WS_B1)).rejects.toThrow(/bulunamadı/);
    b1.status = 'active';

    b1.orgStatus = 'suspended';
    await expect(servis().workspaceKapsami(baglam(), WS_B1)).rejects.toThrow(/bulunamadı/);
    b1.orgStatus = 'active';
  });

  it('OLMAYAN workspace REDDEDİLİYOR', async () => {
    await expect(
      servis().workspaceKapsami(baglam(), 'dddddddd-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/bulunamadı/);
  });
});

describe('KRİTİK: uç nokta bu metodu KULLANIYOR', () => {
  /*
   * Metodun doğru olması yetmiyor — çağrıldığı da kilitlenmeli. Eski
   * arızanın kendisi bir SIRA hatasıydı: doğru metot vardı ama yanlış
   * kontrolden SONRA çağrılıyordu, yani hiç sırası gelmiyordu.
   */
  const CONTROLLER = readFileSync(resolve(__dirname, 'auth.controller.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );

  it('BOŞA DÜŞME BEKÇİSİ: gövde okundu', () => {
    expect(CONTROLLER).toContain("@Post('switch-client')");
    expect(CONTROLLER.length).toBeGreaterThan(2000);
  });

  it('`switch-client` workspaceKapsami çağırıyor', () => {
    const bas = CONTROLLER.indexOf("@Post('switch-client')");
    const dilim = CONTROLLER.slice(bas, CONTROLLER.indexOf('@Post(', bas + 10));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(300);
    expect(dilim).toContain('this.auth.workspaceKapsami(ctx, dto.clientId)');
  });

  it('KRİTİK: `clientIds` süzgeci workspace seçiminde ARTIK KULLANILMIYOR', () => {
    /*
     * `assertClientAccess(ctx, null)` duruyor ve doğru: org geneli görünüm
     * yetkisini sınıyor. Yasak olan, bir WORKSPACE KİMLİĞİYLE çağrılması —
     * arızanın ta kendisi oydu.
     */
    const bas = CONTROLLER.indexOf("@Post('switch-client')");
    const dilim = CONTROLLER.slice(bas, CONTROLLER.indexOf('@Post(', bas + 10));
    expect(dilim).not.toContain('assertClientAccess(ctx, dto.clientId)');
    expect(dilim).toContain('this.auth.assertClientAccess(ctx, null)');
  });
});
