import type { Permission } from '@advetics/shared';
import type { NavEntry } from '@/components/nav';

/**
 * Kenar çubuğu — KATLANABİLİR bölümler.
 *
 * Bu yapı iki kez değişti ve ikisinin de sebebi ölçüldü:
 *
 *   1. Önce yedi bölüm ve 23 öğe vardı; 7'sinin EKRANI YOKTU (soluk,
 *      tıklanamaz) ve "Bilgi Bankası" iki kez geçiyordu. Ölü satırlar
 *      çıkarıldı ve iki düz gruba indirildi.
 *   2. İki düz grup fazla uzundu: 12 satır tek blokta, hiçbir gruplama
 *      olmadan. Bölümler geri geldi ama artık KATLANABİLİR — kullanıcı
 *      kullanmadığı bölümü kapatıyor ve kapalı kalıyor.
 *
 * İLK BÖLÜM BAŞLIKSIZ ve bu kasıtlı: en sık açılan iki ekran katlanamaz
 * olmalı. Bir başlık altına koymak, onları kapatılabilir yapardı.
 *
 * AYARLAR bölümü yalnızca yönetim yetkisi olanlara görünüyor; süzgeç
 * `visibleSections` içinde ve bölüm boşalırsa başlığı da basılmıyor.
 */
export const SECTIONS: Array<{ title?: string; items: NavEntry[] }> = [
  {
    // BAŞLIKSIZ — katlanamaz. Günlük iş bu iki ekranda başlıyor.
    items: [
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1 },
      { href: '/auto-boost', label: 'Akıllı Boost', icon: 'boost', module: 7, ready: true },
    ],
  },
  {
    title: 'Reklamlar',
    items: [
      { href: '/ads-explorer', label: 'Reklam Keşfi', icon: 'explorer', module: 4 },
      { href: '/reklam-olustur', label: 'Reklam Oluştur', icon: 'create', module: 4, ready: true },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true },
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true },
    ],
  },
  {
    title: 'Raporlar',
    items: [
      { href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6 },
      {
        href: '/potansiyel-musteriler',
        label: 'Potansiyel Müşteriler',
        icon: 'leads',
        module: 4,
        ready: true,
      },
    ],
  },
  {
    title: 'Kütüphane',
    items: [
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
      { href: '/kutuphane/kreatifler', label: 'Kreatifler', icon: 'assets', module: 4, ready: true },
      { href: '/kutuphane/formlar', label: 'Formlar', icon: 'forms', module: 4, ready: true },
    ],
  },
  {
    /*
     * AJANS İŞİ. `client.read` KULLANILMIYOR: client_viewer'da var (kendi
     * müşterisini okuyabilmeli), ayırt eden şey yönetim yetkisi.
     */
    title: 'Ayarlar',
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
): Array<{ title?: string; items: NavEntry[] }> {
  const izinli = new Set(permissions);
  return SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter((i) => !i.perm || izinli.has(i.perm)),
  })).filter((s) => s.items.length > 0);
}
