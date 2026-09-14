/**
 * Rol ve yetki tanımları.
 *
 * Bu dosya sistemin TEK yetki kaynağıdır. Backend guard'ları ve frontend
 * UI gizleme mantığı aynı matristen beslenir — ikisinin ayrışması, kullanıcıya
 * tıklayabildiği ama 403 alacağı butonlar göstermek demektir.
 *
 * ═══ YEDİ ROLDEN ÜÇE — VE BİR BAYRAK ═══
 *
 * Bir süre yedi rol vardı (owner, admin, ad_manager, manager, analyst,
 * customer_service, client_viewer) ve kullanıcının tarifi *"çok fazla yetki
 * var, ne neye yarıyor"* idi. Yedi rolün beşi ajans personelinin
 * tonlarıydı ve hiçbiri panelde AYRI bir ekran açmıyordu — yalnızca aynı
 * ekranda birkaç düğmeyi kapatıyordu. Seçerken tahmin etmek gerekiyordu ve
 * tahmin yanlışsa belirtisi "tıkladım, 403" ya da "ekran boş".
 *
 * Bugün üç rol ve bir bayrak var; hepsi kullanıcının kendi cümlesiyle
 * tanımlı:
 *
 *   · SAHİP (`users.platform_admin`) — Advetics'i işleten hesap. Her şeyi
 *     yapar; üst hesap kurar, paket seçer, bütün üst hesaplara geçer. BİR
 *     ROL DEĞİL: roller bir üst hesabın ya da şirketin İÇİNDE anlamlı, bu
 *     yetki ikisini de aşıyor. Panelden verilemez (`db:platform-admin`).
 *   · YÖNETİCİ (`admin`) — verildiği kapsamın tamamını yönetir: kişi
 *     ekler, şirket açar/siler, platform bağlar. Üst hesapta verilirse
 *     bütün şirketler, tek şirkette verilirse o şirket. Başka bir üst
 *     hesabı GÖREMEZ.
 *   · REKLAM YÖNETİCİSİ (`ad_manager`) — yetkilendirildiği şirketlerin
 *     workspace'lerini yönetir: reklam yayınlar, kural/bütçe yazar, hesap
 *     atar, veriyi günceller. Kişi ekleyemez, şirket açamaz/silemez.
 *   · MÜŞTERİ (`client_viewer`) — workspace'in kendi giriş hesabı. Yalnızca
 *     Genel Bakış, Reklam Keşfi ve Raporlar; tarih aralığını değiştirir,
 *     verisini görür ve günceller. Reklam ekranlarını görmez.
 *
 * `owner` KALKTI: her şirkette "sahip" diye ikinci bir yönetici tutmanın
 * tek karşılığı kullanılmayan `org.billing` yetkisiydi; asıl Sahip tek bir
 * hesap ve bayrakla anlatılıyor. Veritabanındaki eski satırlar
 * `roller_uce_indi` migration'ıyla `admin`e taşındı.
 */

export const ROLES = ['admin', 'ad_manager', 'client_viewer'] as const;

export type Role = (typeof ROLES)[number];

/**
 * ═══ İKİ AYRI KAVRAM, İKİ AYRI LİSTE ═══
 *
 * Uzun süre tek bir liste vardı ve `isOrgAdmin` bayrağı İKİ İŞİ birden
 * yapıyordu: (1) kullanıcının org'daki BÜTÜN müşterilerin verisini görmesi,
 * (2) kullanıcı oluşturma, üyelik verme, müşteri silme kapılarının açılması.
 *
 * Reklam yöneticisi rolü ikisini ayırmayı zorunlu kıldı: ajans genelinde
 * çalışıyor (her müşterinin hesabını bağlar, atar) ama personel hesabı
 * açamamalı ve müşteri silememeli. Tek listede kalsaydı seçenek şuydu —
 * ya rolü org geneli yapıp hesap ele geçirme yetkisi vermek, ya da org
 * geneli yapmayıp ajans genelinde çalışamaz hâle getirmek.
 */

/**
 * Org geneli VERİ erişimi: `membership.clientId === null` tutabilen roller.
 *
 * Kural ters yazılıyor: `client_viewer` DIŞINDA herkes şirket seviyesinde
 * yetkilendirilebilir. Ayırt eden şey rolün genişliği değil, KİMİN hesabı
 * olduğu: ajans personeli şirkete bakar, `client_viewer` ise MÜŞTERİNİN
 * KENDİ giriş hesabı ve sınırı tam olarak workspace — şirket seviyesine
 * çıkarmak, bir workspace'in hesabına komşusunun verisini açmak demek.
 *
 * Veritabanı da aynı kuralı dayatıyor: `memberships_org_scope_role_chk`
 * (`prisma/sql/01_constraints.sql`).
 */
export const ORG_SCOPED_ROLES: readonly Role[] = ROLES.filter((r) => r !== 'client_viewer');

/**
 * Org YÖNETİCİSİ: `isOrgAdmin` bayrağını açan roller.
 *
 * Bu bayrak `@RequireOrgAdmin()` kapılarını (kullanıcı oluşturma, üyelik
 * verme, müşteri silme, bağlantı koparma) ve RLS'teki `app.is_org_admin()`
 * yüklemini besliyor. LİSTE GENİŞLETİLİRKEN o iki yerin ikisi birden
 * düşünülmeli — bayrak tek başına bir yetki değil, bir yetki DEMETİ.
 */
export const ORG_ADMIN_ROLES: readonly Role[] = ['admin'];

/**
 * ═══ HANGİ KAPSAMDA HANGİ ROL VERİLEBİLİR ═══
 *
 * Üç kapsam var ve her kapsamda anlamlı olan roller farklı:
 *
 *   · ÜST HESAP — bütün şirketler. Yönetici (hepsini yönetir) ya da Reklam
 *     Yöneticisi (hepsinde reklam işi yapar). Müşteri hesabı olamaz: onun
 *     sınırı tek workspace.
 *   · ŞİRKET — o şirketin bütün workspace'leri. Aynı iki rol.
 *   · WORKSPACE — tek workspace. Reklam Yöneticisi ya da Müşteri. Yönetici
 *     olamaz: yöneticilik `clientId: null` bir satır ister (`isOrgAdmin`
 *     oradan doğuyor); tek workspace'e bağlı bir "yönetici" hiçbir yönetim
 *     kapısını açamaz ve ekranda yalan söylerdi.
 *
 * Panel seçicileri bu listelerden besleniyor; sunucu şemaları da aynı
 * listeyi doğruluyor. İkisi ayrı yazılsaydı biri diğerinin kabul etmediği
 * bir seçenek gösterirdi.
 */
export const UST_HESAP_ROLLERI: readonly Role[] = ['admin', 'ad_manager'];
export const SIRKET_ROLLERI: readonly Role[] = ['admin', 'ad_manager'];
export const WORKSPACE_ROLLERI: readonly Role[] = ['ad_manager', 'client_viewer'];

/**
 * Yetki anahtarları. `kaynak.eylem` formatı.
 *
 * Yeni bir yetki eklerken ROLE_PERMISSIONS matrisini de güncelle —
 * tanımsız bırakılan yetki varsayılan olarak REDDEDİLİR.
 *
 * `org.billing` ve `rule.revert` KALDIRILDI: ikisini de hiçbir guard ve
 * hiçbir ekran okumuyordu. Kimsenin kontrol etmediği bir yetki, matriste
 * "var" görünüp hiçbir şey yapmayan bir satırdır.
 */
export const PERMISSIONS = [
  // Kiracılık
  'org.read',
  'org.write',
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
  /**
   * AJANS DÜZEYİ BAĞLANTI İŞLERİ — `connection.write`ten AYRI.
   *
   * `connection.write` günlük iş: izlemeyi aç/kapat, hesapları yenile, boost
   * hesabını eşle. `connection.manage` ise kurulum: platformu YETKİLENDİR ve
   * havuzdaki bir reklam hesabını/sayfayı bir MÜŞTERİYE ATA.
   *
   * İkisi neden ayrı: atama, bir müşterinin bütün verisinin nereye
   * yazılacağını belirliyor ve yanlış atama iki müşterinin geçmişini
   * birbirine karıştırıyor (bkz. `hesap-verisi-tasima.ts`). Reklam
   * Yöneticisi bunu taşıyor — workspace'i o kuruyor ve reklam hesabı
   * atanmamış bir workspace boş bir kap; taşımasaydı "workspace yönetir"
   * cümlesi içi boş kalırdı.
   */
  'connection.manage',

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

/**
 * Reklam Yöneticisi — "yetkilendirilen şirketlerin workspace'lerini
 * yönetebilir, reklam hesaplarında yayınlama yapabilir, verileri
 * güncelleyebilir" (kullanıcının tanımı).
 *
 * OLMAYANLAR ve NEDENİ:
 *   · `user.write` — kişi eklemek ve yetki vermek hesap ele geçirme kapısı;
 *     Yönetici işi.
 *   · `org.write` — şirket açmak/silmek/taşımak, bir kullanıcının
 *     erişebildiği şirket kümesini değiştiriyor; izolasyonun sınırı.
 *   · `client.delete` — workspace silmek geri alınamıyor (metrik geçmişi
 *     gidiyor); günlük reklam işinin parçası değil.
 *   · `branding.write` — beyaz etiket markası ajansın kimliği.
 */
const AD_MANAGER_PERMS: readonly Permission[] = [
  'org.read',
  'client.read',
  'client.write', // workspace açar ve bilgilerini düzenler
  'user.read', // ekibi görür, değiştiremez
  'branding.read',
  'audit.read',
  'connection.read',
  'connection.write',
  'connection.manage', // platformu yetkilendirir, hesabı workspace'e atar
  'insights.read',
  'sync.trigger',
  'budget.read',
  'budget.write',
  'rule.read',
  'rule.write',
  'rule.activate',
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

/**
 * Müşteri — workspace'in kendi giriş hesabı.
 *
 * "Sadece genel bakış, reklam keşfi ve raporlar; tarihleri değiştirip
 * verisini görebilir, güncelleyebilir; reklam yayınlayamaz, reklam kısmını
 * göremez" (kullanıcının tanımı).
 *
 * `sync.trigger` VAR: "güncelleyebilir" tam olarak "Şimdi güncelle" düğmesi.
 * Kota bekçisi platform çağrısını zaten sınırlıyor; düğmeyi gizlemek
 * müşteriyi "veri neden eski" sorusuyla baş başa bırakırdı.
 *
 * `budget.read` VAR ama Aylık Bütçe ekranı YOK: Genel Bakış'taki bütçe
 * tüketimi bu yetkiyle okunuyor ve o bilgi zaten kendisine ait. Ekranın
 * menü satırı `budget.write` ile kapalı — o ekran bütçe BELİRLEME yeri.
 *
 * `rule.read` ve `boost.read` YOK: ikisi de "reklam kısmı" ve kullanıcı
 * o bölümün müşteriye görünmemesini istedi. Uyarı paneli boost'u yalnızca
 * `boost.read` varsa soruyor, yani bu kararın ikinci bir bedeli yok.
 */
const CLIENT_VIEWER_PERMS: readonly Permission[] = [
  'client.read',
  'insights.read',
  'sync.trigger',
  'budget.read',
  'report.read',
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  admin: ALL,
  ad_manager: AD_MANAGER_PERMS,
  client_viewer: CLIENT_VIEWER_PERMS,
};

/**
 * Etkin yetki kümesini hesaplar.
 *
 * `overrides` ince ayar içindir: `{ "rule.activate": false }` ile bir
 * reklam yöneticisinin kuralları canlıya alması engellenebilir. Override
 * daima rolü ezer — hem kısıtlamak hem genişletmek için kullanılabilir.
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

/** `isOrgAdmin` bayrağını açar mı. `isOrgScopedRole` ile AYNI ŞEY DEĞİL. */
export function isOrgAdminRole(role: Role): boolean {
  return ORG_ADMIN_ROLES.includes(role);
}
