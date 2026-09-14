import { ROLE_PERMISSIONS, ROLES, type Permission, type Role } from './roles';

/**
 * ═══ ROLLERİN EKRANDAKİ YÜZÜ — TEK KAYNAK ═══
 *
 * Rol etiketleri ve açıklamaları panelde ÜÇ yerde görünüyor: Ekip ekranındaki
 * karşılaştırma tablosu, kişi ekleme penceresi ve yetki satırındaki seçici.
 * Üçü aynı metni ayrı ayrı yazsaydı bir rolün yetkisi değiştiğinde ekranlar
 * farklı şey anlatırdı ve hangisinin doğru olduğu hiçbir yerde yazmazdı —
 * `team-manager.tsx` içinde bir kopya vardı ve iki kez ayrıştı.
 *
 * Bu dosya `packages/shared`ta çünkü API'nin hata mesajları da rol adını
 * kullanıyor ("Bu kullanıcının zaten … yetkisi var (Yönetici)").
 */

/** Sahip bir rol DEĞİL (bkz. `roles.ts`); ama ekranda bir sütunu var. */
export const SAHIP_ETIKETI = 'Sahip';

export const ROL_ETIKETI: Record<Role, string> = {
  admin: 'Yönetici',
  ad_manager: 'Reklam Yöneticisi',
  client_viewer: 'Müşteri',
};

/**
 * Rolün ne yapabildiği — seçerken tahmin ettirmemek için TEK CÜMLE.
 *
 * Ayrıntılı karşılaştırma `YETKI_SATIRLARI`nda; burası seçicinin altında
 * duran özet.
 */
export const ROL_ACIKLAMASI: Record<Role, string> = {
  admin:
    'Verildiği kapsamın tamamını yönetir: kişi ekler, şirket ve workspace açar, platform bağlar, reklam yayınlar. Başka bir üst hesabı göremez.',
  ad_manager:
    'Yetkilendirildiği şirketlerin workspace’lerini yönetir: reklam yayınlar, kural ve bütçe yazar, reklam hesabı atar, veriyi günceller. Kişi ekleyemez, şirket açamaz.',
  client_viewer:
    'Workspace’in kendi giriş hesabı. Yalnızca Genel Bakış, Reklam Keşfi ve Raporlar; tarih aralığını değiştirir, verisini görür ve günceller. Reklam ekranlarını görmez.',
};

export const SAHIP_ACIKLAMASI =
  'Advetics’i işleten hesap. Her şeyi yapar: üst hesap kurar, paket seçer, bütün üst hesaplara geçer. Panelden verilemez.';

/**
 * ═══ KARŞILAŞTIRMA TABLOSUNUN SATIRLARI — KULLANICI DİLİNDE ═══
 *
 * Google Ads'in "hesap erişim düzeyi" tablosuyla aynı biçim: solda ne
 * yapılabildiği, sütunlarda roller, hücrede işaret. Kullanıcı tam olarak o
 * tabloyu istedi ("yetkilendirirken bunları görebilelim").
 *
 * İŞARETLER YAZILMIYOR, TÜRETİLİYOR. Her satır bir yetki anahtarına bağlı ve
 * hücre `ROLE_PERMISSIONS`tan hesaplanıyor. Elle yazılmış bir ✓ tablosu,
 * matris değiştiğinde ekranda yalan söylemeye başlar ve bunu yalnızca
 * "tıkladım, 403" yaşayan kullanıcı fark eder.
 *
 * `izin: 'sahip'` satırları hiçbir role bağlı değil: yalnızca platform
 * sahibinin yapabildiği işler. Bunlar bir yetki anahtarıyla değil
 * `users.platform_admin` bayrağıyla açılıyor (`manager-account.service.ts`).
 *
 * YETKİ ANAHTARI SEÇİMİ: bir satır birden çok anahtara dokunuyorsa EN DAR
 * olanı yazıyor — "kural yazma ve canlıya alma" için `rule.activate`, çünkü
 * `rule.write` olup `rule.activate` olmayan bir rolde ✓ göstermek "kuralı
 * canlıya alabilirsin" demek olurdu.
 */
export interface YetkiSatiri {
  /** Ekranda görünen ifade — bir işi anlatıyor, bir anahtar adını değil. */
  baslik: string;
  /** Hangi yetkiyle açılıyor; `'sahip'` = yalnızca platform sahibi. */
  izin: Permission | 'sahip';
}

export interface YetkiGrubu {
  baslik: string;
  satirlar: readonly YetkiSatiri[];
}

export const YETKI_GRUPLARI: readonly YetkiGrubu[] = [
  {
    baslik: 'Görüntüleme',
    satirlar: [
      { baslik: 'Genel Bakış ve Reklam Keşfi — tarih aralığını değiştirme', izin: 'insights.read' },
      { baslik: 'Raporları görüntüleme', izin: 'report.read' },
      { baslik: 'Verileri güncelleme (“Şimdi güncelle”)', izin: 'sync.trigger' },
      { baslik: 'Bütçe tüketimini görme', izin: 'budget.read' },
    ],
  },
  {
    baslik: 'Reklam işleri',
    satirlar: [
      { baslik: 'Reklam oluşturma ve yayınlama', izin: 'bulk.publish' },
      { baslik: 'Akıllı Boost — gönderi öne çıkarma', izin: 'boost.write' },
      { baslik: 'Kural yazma ve canlıya alma', izin: 'rule.activate' },
      { baslik: 'Aylık bütçe belirleme', izin: 'budget.write' },
      { baslik: 'Rapor hazırlama ve gönderme', izin: 'report.share' },
      { baslik: 'Potansiyel müşteri listesini işleme', izin: 'lead.write' },
      { baslik: 'Potansiyel müşteri listesini dışa aktarma', izin: 'lead.export' },
    ],
  },
  {
    baslik: 'Kurulum ve yönetim',
    satirlar: [
      { baslik: 'Workspace açma ve bilgilerini düzenleme', izin: 'client.write' },
      { baslik: 'Platform bağlama ve reklam hesabı atama', izin: 'connection.manage' },
      { baslik: 'Marka (beyaz etiket) ayarları', izin: 'branding.write' },
      { baslik: 'Kişi ekleme ve yetkilendirme', izin: 'user.write' },
      { baslik: 'Şirket açma, silme ve workspace taşıma', izin: 'org.write' },
      { baslik: 'Workspace silme', izin: 'client.delete' },
    ],
  },
  {
    baslik: 'Üst hesap',
    satirlar: [
      { baslik: 'Yeni üst hesap kurma ve paket seçme', izin: 'sahip' },
      { baslik: 'Bütün üst hesaplara geçiş', izin: 'sahip' },
    ],
  },
];

/** Karşılaştırma tablosunun sütunları — Sahip önce, sonra roller geniş→dar. */
export type RolSutunu = 'sahip' | Role;
export const ROL_SUTUNLARI: readonly RolSutunu[] = ['sahip', ...ROLES];

export function sutunEtiketi(sutun: RolSutunu): string {
  return sutun === 'sahip' ? SAHIP_ETIKETI : ROL_ETIKETI[sutun];
}

/**
 * Bir satır bir sütunda işaretli mi.
 *
 * Sahip her satırda ✓: platform sahibi bir üst hesaba geçtiğinde `admin`
 * olarak çözülüyor (`tenant-context.service.ts`), yani rol yetkilerinin
 * hepsini taşıyor; `'sahip'` satırları da tanım gereği onun.
 */
export function yetkiVar(sutun: RolSutunu, izin: YetkiSatiri['izin']): boolean {
  if (sutun === 'sahip') return true;
  if (izin === 'sahip') return false;
  return ROLE_PERMISSIONS[sutun].includes(izin);
}
