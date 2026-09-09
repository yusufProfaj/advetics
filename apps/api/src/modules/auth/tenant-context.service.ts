import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  isOrgScopedRole,
  isOrgAdminRole,
  resolvePermissions,
  type Permission,
  type Role,
  type TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { RequestActor } from '../../common/types/request';

/**
 * Rol genişliği sıralaması — en geniş yetki en başta.
 *
 * `Record<Role, number>` OLMASI ÖNEMLİ: yeni rol eklenince TypeScript burayı
 * derleme hatasıyla gösteriyor. Düz bir nesne ya da `Partial` olsaydı yeni
 * rol sessizce `undefined` sıralanır ve birden çok üyeliği olan kullanıcının
 * "en geniş rolü" rastgele seçilirdi.
 *
 * SIRA YETKİ KÜMELERİYLE TUTARLI OLMAK ZORUNDA. Analist ilk bakışta müşteri
 * hizmetlerinden "daha dar" duruyor (kampanya kurmuyor) ama yetki kümesi
 * onun ÜST KÜMESİ: `sync.trigger`, `bulk.write` ve `user.read` fazladan.
 * Sıralamayı sezgiyle vermek, iki üyeliği olan bir kullanıcının dar rolünü
 * "en geniş" seçtirir ve panelde eksik ekran olarak görünür.
 * `rol-yetkileri.spec.ts` sırayı kümelerle karşılaştırıyor.
 */
const ROLE_RANK: Record<Role, number> = {
  owner: 7,
  admin: 6,
  ad_manager: 5,
  manager: 4,
  analyst: 3,
  customer_service: 2,
  client_viewer: 1,
};

/** Sıralamayı testin okuyabilmesi için dışa açık. */
export const ROL_SIRASI: Readonly<Record<Role, number>> = ROLE_RANK;

export interface ResolvedIdentity {
  actor: RequestActor;
  context: TenantContext;
  memberships: Array<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    role: Role;
  }>;
  /** Seçilebilir workspace'ler — org yöneticisi için org'daki tümü. */
  availableClients: Array<{ id: string; name: string; status: string }>;
  /**
   * Kullanıcının ÜST HESABI ve altındaki şirketler — yoksa null.
   *
   * `availableClients` ile aynı gerekçe: bu liste `memberships`ten
   * TÜRETİLEMEZ. Üst hesap altındaki kardeş şirketlerde kullanıcının hiç
   * `memberships` satırı YOK; yetkisi `ManagerMembership`ten geliyor.
   */
  managerAccount: {
    id: string;
    name: string;
    /** Bu üst hesap altında kullanıcının geçebileceği şirketler. */
    organizations: Array<{ id: string; name: string; slug: string }>;
  } | null;
}

/**
 * Kullanıcının kimliğinden RLS bağlamını üretir.
 *
 * Bu, uygulama katmanı ile veritabanı katmanı arasındaki tek köprüdür:
 * burada hesaplanan `clientIds` ve `isOrgAdmin` değerleri, doğrudan
 * PostgreSQL oturum değişkenlerine yazılır ve tüm RLS politikalarını sürer.
 * Burada yapılan bir hata, veritabanı seviyesinde yanlış izolasyon demektir.
 *
 * PrismaAdminService kullanır — bağlamı kurmak için gereken okuma, bağlamın
 * kendisinden önce gelmek zorundadır (tavuk-yumurta).
 */
@Injectable()
export class TenantContextService {
  constructor(private readonly db: PrismaAdminService) {}

  async resolve(
    userId: string,
    requestedClientId?: string | null,
    /**
     * Panelde seçili ŞİRKET (üst hesap altında geçiş yapılmışsa).
     *
     * `requestedClientId` ile AYNI GÜVEN SEVİYESİNDE: cookie'den geliyor,
     * yani kullanıcının elinde. Aşağıda veritabanından hesaplanan izin
     * listesine karşı doğrulanıyor; geçmezse EV organizasyonuna düşülüyor.
     * Bu değer `app.current_org_id()`yi sürüyor, yani BÜTÜN RLS'in sınırı —
     * doğrulamayı atlamak, cookie düzenleyerek başka bir şirketin verisini
     * okumak demekti.
     */
    requestedOrgId?: string | null,
  ): Promise<ResolvedIdentity> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgId: true,
        email: true,
        fullName: true,
        status: true,
        organization: { select: { status: true } },
        managerMemberships: {
          select: {
            id: true,
            role: true,
            managerAccountId: true,
            managerAccount: { select: { id: true, name: true, status: true } },
          },
        },
        memberships: {
          select: {
            id: true,
            clientId: true,
            role: true,
            permissions: true,
            client: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı');
    if (user.status !== 'active') throw new UnauthorizedException('Hesabınız devre dışı');
    if (user.organization.status !== 'active') {
      throw new UnauthorizedException('Organizasyon askıya alınmış');
    }
    /*
     * ═══ ÜST HESAP (MCC) — KARDEŞ ŞİRKETLERE ERİŞİM ═══
     *
     * `user_id` tekil olduğu için en fazla bir satır var; `[0]` bir seçim
     * DEĞİL, şemanın garantisi (bkz. ManagerMembership).
     */
    const uyelik = user.managerMemberships[0] ?? null;

    /*
     * ROL ORG GENELİ OLMAK ZORUNDA. Kardeş şirkette kullanıcının hiç
     * `memberships` satırı YOK; org geneli olmayan bir rol orada SIFIR
     * workspace görür — yani "geçtim ama hiçbir şey yok" gibi görünen,
     * sebebi hiçbir ekranda yazmayan bir çıkmaz. Askıya alınmış üst hesap
     * da geçiş açmıyor.
     */
    const ustHesap =
      uyelik && uyelik.managerAccount.status === 'active' && isOrgScopedRole(uyelik.role as Role)
        ? uyelik
        : null;

    const kardesSirketler = ustHesap
      ? await this.db.organization.findMany({
          where: { managerAccountId: ustHesap.managerAccountId, status: 'active' },
          orderBy: { name: 'asc' },
          select: { id: true, name: true, slug: true },
        })
      : [];

    /*
     * İZİN LİSTESİ VERİTABANINDAN HESAPLANIYOR, istekten değil. `activeOrgId`
     * bütün RLS politikalarının okuduğu `app.current_org_id()`yi sürüyor;
     * doğrulanmamış bir değer, cookie düzenleyerek başka bir şirketin
     * verisini okumak demekti. Ev organizasyonu HER ZAMAN listede — üst
     * hesabı olmayan kullanıcı için liste tek elemanlı ve davranış değişmiyor.
     */
    const izinliOrgIdler = new Set<string>([user.orgId, ...kardesSirketler.map((o) => o.id)]);
    const activeOrgId =
      requestedOrgId && izinliOrgIdler.has(requestedOrgId) ? requestedOrgId : user.orgId;
    const evdeMi = activeOrgId === user.orgId;

    if (user.memberships.length === 0 && !ustHesap) {
      throw new UnauthorizedException('Hiçbir workspace’e erişim yetkiniz tanımlı değil');
    }

    /*
     * KARDEŞ ŞİRKETTE ÜYELİK SATIRI YOK — üst hesap rolünden SENTETİK bir
     * org geneli üyelik türetiliyor. `clientId: null` olması kritik: aşağıdaki
     * `orgScoped` süzgeci tam olarak buna bakıyor ve org geneli erişim
     * oradan doğuyor.
     */
    const scopedMemberships = evdeMi
      ? // Arşivlenmiş workspace'ler erişim listesinden düşer.
        user.memberships.filter((m) => m.clientId === null || m.client?.status !== 'archived')
      : [
          {
            id: `manager:${ustHesap!.id}`,
            clientId: null,
            role: ustHesap!.role,
            // Üst hesap üyeliği ince ayar TAŞIMIYOR: rol bir şirkette değil,
            // bir danışmanlığın ALTINDAKİ HEPSİNDE geçerli ve tek tek
            // istisna yazmanın yeri o şirketin kendi `memberships` satırı.
            permissions: null,
            client: null,
          } as (typeof user.memberships)[number],
        ];

    const orgScoped = scopedMemberships.filter(
      (m) => m.clientId === null && isOrgScopedRole(m.role as Role),
    );

    /*
     * ORG GENELİ VERİ ERİŞİMİ İLE ORG YÖNETİCİLİĞİ AYRI.
     *
     * `orgScoped.length > 0` = org'daki bütün müşterilerin verisini görür.
     * `isOrgAdmin` = kullanıcı açar, üyelik verir, müşteri siler, bağlantı
     * koparır. Reklam yöneticisi birincisini taşıyor, ikincisini TAŞIMIYOR.
     * İkisini tek bayrakta tutmak, ajans genelinde çalışan bir role personel
     * hesabı açma yetkisi vermek demekti.
     */
    const hasOrgScope = orgScoped.length > 0;
    const isOrgAdmin = orgScoped.some((m) => isOrgAdminRole(m.role as Role));

    // Org geneli yetkili kullanıcılar için erişilebilir client listesini
    // AÇIKÇA genişletiyoruz. RLS'te "hepsi" anlamına gelen bir joker değer
    // tanımlamak, politikalarda kolayca yanlış yerde eşleşen bir kaçak yaratır.
    let clientIds: string[];
    let availableClients: Array<{ id: string; name: string; status: string }>;

    if (hasOrgScope) {
      const all = await this.db.client.findMany({
        // AKTİF organizasyon — ev değil. Üst hesaptan kardeş şirkete geçen
        // kullanıcı o şirketin workspace'lerini görmek zorunda; `user.orgId`
        // yazmak, geçişi yapıp boş bir seçici görmek demekti.
        where: { orgId: activeOrgId, status: { not: 'archived' } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, status: true },
      });
      clientIds = all.map((c) => c.id);
      availableClients = all;
    } else {
      clientIds = scopedMemberships
        .map((m) => m.clientId)
        .filter((id): id is string => id !== null);
      availableClients = scopedMemberships
        .filter((m) => m.client !== null)
        .map((m) => ({
          id: m.client!.id,
          name: m.client!.name,
          status: m.client!.status,
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
    }

    // Aktif müşteri seçimi: istenen değer daima erişim listesine karşı doğrulanır.
    // Doğrulamadan geçmeyen bir istek sessizce yok sayılır (403 değil), çünkü
    // bayat bir cookie yüzünden kullanıcıyı kilitlemenin anlamı yok.
    const activeClientId =
      requestedClientId && clientIds.includes(requestedClientId) ? requestedClientId : null;

    // Etkin rol ve yetkiler:
    //   - Bir müşteri seçiliyse, O müşteriye ait membership belirleyicidir.
    //   - Seçili değilse (org geneli görünüm) en geniş rol kullanılır.
    // Bu ayrım önemli: bir kullanıcı A müşterisinde manager, B'de analyst olabilir.
    const activeMembership = activeClientId
      ? scopedMemberships.find((m) => m.clientId === activeClientId)
      : undefined;

    const effective =
      activeMembership ??
      [...scopedMemberships].sort(
        (a, b) => ROLE_RANK[b.role as Role] - ROLE_RANK[a.role as Role],
      )[0];

    if (!effective) throw new UnauthorizedException('Geçerli bir yetki bulunamadı');

    const overrides = (effective.permissions ?? null) as Partial<
      Record<Permission, boolean>
    > | null;

    const permissions = [...resolvePermissions(effective.role as Role, overrides)];

    return {
      actor: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        fullName: user.fullName,
      },
      context: {
        userId: user.id,
        /*
         * AKTİF şirket — `actor.orgId` (EV şirketi) ile bilerek AYRI.
         * `JwtAuthGuard` token'daki org'u `actor.orgId` ile karşılaştırıyor;
         * buraya aktif değeri yazmak, kardeş şirkete geçen kullanıcının
         * her isteğini "Oturum geçersiz" ile düşürürdü.
         */
        orgId: activeOrgId,
        clientIds,
        activeClientId,
        managerAccountId: ustHesap?.managerAccountId ?? null,
        role: effective.role as Role,
        isOrgAdmin,
        permissions,
      },
      memberships: scopedMemberships.map((m) => ({
        id: m.id,
        clientId: m.clientId,
        clientName: m.client?.name ?? null,
        role: m.role as Role,
      })),
      availableClients,
      managerAccount: ustHesap
        ? {
            id: ustHesap.managerAccount.id,
            name: ustHesap.managerAccount.name,
            organizations: kardesSirketler,
          }
        : null,
    };
  }
}
