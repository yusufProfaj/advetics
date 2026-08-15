/**
 * Rol ve yetki tanımları.
 *
 * Bu dosya sistemin TEK yetki kaynağıdır. Backend guard'ları ve frontend
 * UI gizleme mantığı aynı matristen beslenir — ikisinin ayrışması, kullanıcıya
 * tıklayabildiği ama 403 alacağı butonlar göstermek demektir.
 */

export const ROLES = [
  'owner', // Ajans sahibi. Her şey + faturalama + org silme.
  'admin', // Ajans yöneticisi. Her şey, faturalama hariç.
  'manager', // Kampanya yöneticisi. Kural yazar, bütçe değiştirir.
  'analyst', // Analist. Okur, rapor üretir. Canlı aksiyon alamaz.
  'client_viewer', // Müşteri tarafı. Sadece kendi verisini okur.
] as const;

export type Role = (typeof ROLES)[number];

/** Org geneli erişime sahip roller (membership.clientId === null olabilir). */
export const ORG_SCOPED_ROLES: readonly Role[] = ['owner', 'admin'];

/**
 * Yetki anahtarları. `kaynak.eylem` formatı.
 *
 * Yeni bir yetki eklerken ROLE_PERMISSIONS matrisini de güncelle —
 * tanımsız bırakılan yetki varsayılan olarak REDDEDİLİR.
 */
export const PERMISSIONS = [
  // Kiracılık
  'org.read',
  'org.write',
  'org.billing',
  'client.read',
  'client.write',
  'client.delete',
  'user.read',
  // `user.invite` KALDIRILDI: davet akışı yok, kullanıcı doğrudan ekleniyor
  // ve o da `user.write` altında. İki ayrı yetki tutmak, birine izin verip
  // diğerini unutmanın kapısıydı.
  'user.write',
  'branding.read',
  'branding.write',
  'audit.read',

  // Modül 2 — bağlantılar
  'connection.read',
  'connection.write',

  // Modül 3–4 — veri
  'insights.read',
  'sync.trigger',

  // Modül 4-5 — bütçe
  //
  // `budget.write` AYRI bir yetki: bütçeyi görmek ile DEĞİŞTİRMEK farklı
  // kararlar. Bütçe limiti aynı zamanda otomatik durdurmanın (kill-switch)
  // eşiği; yanlış girilen bir sayı kampanyaları durdurabilir.
  'budget.read',
  'budget.write',

  // Modül 5 — kurallar
  'rule.read',
  'rule.write',
  'rule.activate', // dry_run -> live geçişi. Kasıtlı olarak ayrı bir yetki.
  'rule.revert',

  // Modül 6 — raporlar
  'report.read',
  'report.write',
  'report.share',

  // Modül 7 — auto-boost
  'boost.read',
  'boost.write',
  'boost.approve',

  // Modül 8 — toplu oluşturucu
  'bulk.read',
  'bulk.write',
  'bulk.publish',

  // Potansiyel müşteriler (Lead CRM)
  'lead.read',
  'lead.write',
  /**
   * DIŞA AKTARMA AYRI YETKİ.
   *
   * Okumak kişisel veriyi ekranda göstermek; dışa aktarmak onu sistemden
   * ÇIKARMAK. Dosya bir kez indirildikten sonra silinemiyor, izlenemiyor ve
   * KVKK sorumluluğu bizde kalıyor. İkisini aynı yetkiye bağlamak, "listeye
   * bakabilsin" demenin "listeyi alıp gidebilsin" anlamına gelmesi demek.
   */
  'lead.export',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: readonly Permission[] = PERMISSIONS;

const ADMIN_PERMS: readonly Permission[] = ALL.filter((p) => p !== 'org.billing');

const MANAGER_PERMS: readonly Permission[] = [
  'org.read',
  'client.read',
  'user.read',
  'branding.read',
  'audit.read',
  'connection.read',
  'connection.write',
  'insights.read',
  'sync.trigger',
  'budget.read',
  'budget.write',
  'rule.read',
  'rule.write',
  'rule.activate',
  'rule.revert',
  'report.read',
  'report.write',
  'report.share',
  'boost.read',
  'boost.write',
  'boost.approve',
  'bulk.read',
  'bulk.write',
  'bulk.publish',
  'lead.read',
  'lead.write',
  'lead.export',
];

const ANALYST_PERMS: readonly Permission[] = [
  'org.read',
  'client.read',
  'user.read',
  'branding.read',
  'connection.read',
  'insights.read',
  'sync.trigger',
  // Analist bütçeyi GÖRÜR (rapor ve pacing için gerekli) ama DEĞİŞTİREMEZ.
  'budget.read',
  'rule.read',
  'report.read',
  'report.write',
  'report.share',
  'boost.read',
  'bulk.read',
  'bulk.write', // taslak hazırlayabilir, yayınlayamaz
  'lead.read',
  // Analist kaydı arayıp durumunu ilerletebilir — asıl işi bu. Ama listeyi
  // dosya olarak dışarı ÇIKARAMAZ; o ayrı bir sorumluluk.
  'lead.write',
];

const CLIENT_VIEWER_PERMS: readonly Permission[] = [
  'client.read',
  'insights.read',
  // Müşteri kendi bütçesini görebilmeli: raporda ve panelde bütçe tüketimi
  // gösteriliyor ve o bilgi zaten kendisine ait.
  'budget.read',
  'rule.read',
  'report.read',
  'boost.read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL,
  admin: ADMIN_PERMS,
  manager: MANAGER_PERMS,
  analyst: ANALYST_PERMS,
  client_viewer: CLIENT_VIEWER_PERMS,
};

/**
 * Etkin yetki kümesini hesaplar.
 *
 * `overrides` ince ayar içindir: `{ "rule.activate": false }` ile bir manager'ın
 * kuralları canlıya alması engellenebilir. Override daima rolü ezer — hem
 * kısıtlamak hem genişletmek için kullanılabilir.
 */
export function resolvePermissions(
  role: Role,
  overrides?: Partial<Record<Permission, boolean>> | null,
): Set<Permission> {
  const result = new Set<Permission>(ROLE_PERMISSIONS[role] ?? []);
  if (overrides) {
    for (const [key, allowed] of Object.entries(overrides)) {
      const perm = key as Permission;
      if (!PERMISSIONS.includes(perm)) continue;
      if (allowed) result.add(perm);
      else result.delete(perm);
    }
  }
  return result;
}

export function isOrgScopedRole(role: Role): boolean {
  return ORG_SCOPED_ROLES.includes(role);
}
