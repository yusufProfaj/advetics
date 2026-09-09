import type { Permission, Role } from '../auth/roles';

/**
 * Kimliği doğrulanmış isteğin taşıdığı bağlam.
 *
 * Bu nesne hem uygulama katmanındaki guard'ları hem de PostgreSQL RLS
 * oturum değişkenlerini besler. İkisi aynı kaynaktan beslendiği için
 * "uygulama izin verdi ama DB reddetti" tutarsızlığı oluşmaz.
 */
export interface TenantContext {
  userId: string;
  orgId: string;

  /**
   * Kullanıcının erişebildiği client id'leri.
   * Org geneli erişimi olan roller (owner/admin) için bu liste org'daki
   * TÜM client'ları içerir — RLS `= ANY(...)` ile çalıştığı için
   * "hepsi" diye bir joker değer tanımlamıyoruz.
   */
  clientIds: string[];

  /** Aktif olarak seçili client (UI'daki client switcher). Org geneli görünümde null. */
  activeClientId: string | null;

  /**
   * Kullanıcının ÜST HESABI (Google MCC karşılığı) — yoksa null.
   *
   * `orgId` ile AYRI: orgId ŞU AN bakılan şirket, bu ise o şirketin (ve
   * kardeşlerinin) bağlı olduğu danışmanlık. RLS'te üst hesap tablolarının
   * TEK sınırı bu değer; onlar `org_id` taşımıyor çünkü var oluş sebepleri
   * birden çok organizasyonu bir arada tutmak.
   */
  managerAccountId: string | null;

  /** En yüksek yetkili rol. Birden fazla membership varsa en genişi seçilir. */
  role: Role;

  /** Org genelinde yetkili mi (owner/admin). RLS'te `is_org_admin` olarak set edilir. */
  isOrgAdmin: boolean;

  permissions: Permission[];
}

/** Denetim kaydı için istek meta verisi. */
export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  requestId: string;
}

export interface AuthenticatedUser {
  id: string;
  orgId: string;
  email: string;
  fullName: string;
  avatarUrl: string | null;
  locale: string;
  status: 'active' | 'invited' | 'disabled';
}

export interface SessionResponse {
  user: AuthenticatedUser;
  organization: { id: string; name: string; slug: string; plan: string };
  memberships: Array<{
    id: string;
    clientId: string | null;
    clientName: string | null;
    role: Role;
  }>;
  activeClientId: string | null;
  permissions: Permission[];
  isOrgAdmin: boolean;
  /**
   * Kullanıcının seçebileceği müşteriler, isimleriyle.
   *
   * `memberships`ten TÜRETİLEMEZ: org geneli yetkili bir kullanıcının
   * (owner/admin) tek bir membership satırı vardır ve `clientId` null'dır.
   * Listeyi membership'lerden çıkarmak, yöneticiye boş bir seçici gösteriyordu
   * — müşteri seçilemediği için bağlantı kurmak imkânsız hâle geliyordu.
   */
  availableClients: Array<{ id: string; name: string; status: string }>;

  /**
   * ŞU AN SEÇİLİ şirket. `organization.id` ile aynı olmayabilir.
   *
   * `organization` kullanıcının EV şirketi (token da onu taşıyor);
   * bu alan üst hesap altında geçilen şirket. İkisini tek alanda tutmak,
   * panelin "hangi şirkettesin" ile "hangi şirkete aitsin" sorularını
   * ayırt edememesi demekti.
   */
  activeOrganizationId: string;

  /**
   * Üst hesap (MCC) ve altındaki şirketler — yoksa null.
   *
   * Şirket değiştiricinin listesi bu. `memberships`ten TÜRETİLEMEZ: kardeş
   * şirketlerde kullanıcının hiç üyelik satırı yok.
   */
  managerAccount: {
    id: string;
    name: string;
    organizations: Array<{ id: string; name: string; slug: string }>;
  } | null;
}
