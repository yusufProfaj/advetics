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
  /** Seçilebilir müşteriler — org yöneticisi için org'daki tümü. */
  availableClients: Array<{ id: string; name: string; status: string }>;
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

  async resolve(userId: string, requestedClientId?: string | null): Promise<ResolvedIdentity> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        orgId: true,
        email: true,
        fullName: true,
        status: true,
        organization: { select: { status: true } },
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
    if (user.memberships.length === 0) {
      throw new UnauthorizedException('Hiçbir müşteriye erişim yetkiniz tanımlı değil');
    }

    // Arşivlenmiş müşteriler erişim listesinden düşer.
    const scopedMemberships = user.memberships.filter(
      (m) => m.clientId === null || m.client?.status !== 'archived',
    );

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
        where: { orgId: user.orgId, status: { not: 'archived' } },
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
        orgId: user.orgId,
        clientIds,
        activeClientId,
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
    };
  }
}
