import type { Permission } from '@advetics/shared';
import type { NavEntry } from '@/components/nav';

/**
 * Kenar çubuğu — İKİ BÖLÜM.
 *
 * Önce yedi bölüm (Merkez / Oluştur / Yönet / İyileştir / Raporla / Kütüphane /
 * Çalışma Alanı) ve 23 öğe vardı. Sadeleştirmede iki şey yapıldı:
 *
 *   1. EKRANI OLMAYAN 7 ÖĞE ÇIKARILDI. `ready: false` olanlar soluk ve
 *      tıklanamaz basılıyordu — yani menünün üçte biri ölü satırdı ve
 *      kullanıcı hangisinin çalıştığını denemeden bilemiyordu. Sayfaları
 *      yazıldığında geri eklenecekler; menüde durmalarının hiçbir faydası
 *      yoktu. ("Bilgi Bankası" İKİ KEZ geçiyordu: biri çalışan
 *      `/kutuphane/bilgi-bankasi`, diğeri ekranı olmayan `/kutuphane/bilgi`.)
 *
 *   2. YEDİ BAŞLIK İKİYE İNDİ. Ayrım artık iş akışına göre değil YETKİYE
 *      göre: bir workspace'in içinde yapılan işler, ve ajansın workspace'leri
 *      yönettiği yer. Müşteri hesabı ikinciyi hiç görmüyor.
 *
 * SIRA: istenen altı ekran önce. Kalan altısı da ÇALIŞAN ekranlar ve bu
 * yüzden menüde tutuldu — çalışan bir özelliği menüden düşürmek onu sessizce
 * yok etmek olurdu. İstenmiyorlarsa tek tek çıkarılabilir.
 */
export const SECTIONS: Array<{ title: string; items: NavEntry[] }> = [
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1 },
      { href: '/ads-explorer', label: 'Reklam Keşfi', icon: 'explorer', module: 4 },
      { href: '/auto-boost', label: 'Akıllı Boost', icon: 'boost', module: 7, ready: true },
      { href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6 },
      {
        href: '/kutuphane/bilgi-bankasi',
        label: 'Bilgi Bankası',
        icon: 'knowledge',
        module: 7,
        ready: true,
      },
      {
        href: '/kutuphane/gorseller',
        label: 'Görsel Arşivi',
        icon: 'assets',
        module: 2,
        ready: true,
      },

      // ——— İstenen altılının dışında kalanlar. Hepsi ÇALIŞIYOR.
      { href: '/reklam-olustur', label: 'Reklamlar', icon: 'create', module: 4, ready: true },
      {
        href: '/potansiyel-musteriler',
        label: 'Potansiyel Müşteriler',
        icon: 'leads',
        module: 4,
        ready: true,
      },
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true },
      { href: '/kutuphane/formlar', label: 'Formlar', icon: 'forms', module: 4, ready: true },
      { href: '/kutuphane/kreatifler', label: 'Kreatifler', icon: 'assets', module: 4, ready: true },
    ],
  },
  {
    /*
     * AJANS İŞİ. Bu bölümü yalnızca yönetim yetkisi olanlar görüyor ve
     * süzgeç `visibleSections` içinde — bölüm boşalırsa başlığı da
     * basılmıyor. `client.read` KULLANILMIYOR: client_viewer'da var (kendi
     * müşterisini okuyabilmeli), ayırt eden şey yönetim yetkisi.
     */
    title: 'Çalışma Alanı',
    items: [
      {
        href: '/ayarlar/musteriler',
        label: 'Müşteriler',
        icon: 'clients',
        module: 1,
        ready: true,
        perm: 'client.write',
      },
      {
        href: '/ayarlar/baglantilar',
        label: 'Platform Bağlantıları',
        icon: 'plug',
        module: 2,
        ready: true,
        perm: 'connection.read',
      },
      {
        href: '/ayarlar/ekip',
        label: 'Ekip & Yetkiler',
        icon: 'team',
        module: 1,
        ready: true,
        perm: 'user.read',
      },
    ],
  },
];

/**
 * Kullanıcının GÖREBİLECEĞİ bölümler.
 *
 * AYRI BİR DOSYADA ve saf: layout bir sunucu bileşeni ve içindeki bir diziyi
 * sınamak için bütün ağacı render etmek gerekirdi. Menü görünürlüğü bir
 * YETKİ kararı ve yetki kararları sınanmadan yazılmamalı.
 *
 * Boş kalan bölüm HİÇ DÖNMÜYOR — başlığı tek başına basmak, kullanıcıya
 * içine giremeyeceği bir kategori göstermek olurdu.
 */
export function visibleSections(
  permissions: readonly Permission[],
): Array<{ title: string; items: NavEntry[] }> {
  const izinli = new Set(permissions);
  return SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter((i) => !i.perm || izinli.has(i.perm)),
  })).filter((s) => s.items.length > 0);
}
