import { ikiDil } from '@advetics/shared';

/**
 * Kenar menüsünün bölüm ve satır adları (`lib/nav-sections.ts`). Menü
 * tanımı Türkçe kalıyor (sayfa adıyla eşliği `nav-sections.spec.ts`
 * kilitliyor); ekrana çizilmeden `menuyuCevir()` bu sözlükten çeviriyor.
 * Ürün adları (AdvStrategy, AdvCampaign, Base) çevrilmez, burada yok.
 * Ayarlar sekmelerinin adı shared'da (`ayarSekmesiAdi`).
 */
export const menuSozlugu = ikiDil(
  {
    bolum: {
      Planla: 'Planla',
      'Oluştur': 'Oluştur',
      'Yönet': 'Yönet',
      'İyileştir': 'İyileştir',
      Raporlar: 'Raporlar',
      Ayarlar: 'Ayarlar',
    },
    satir: {
      'Genel Bakış': 'Genel Bakış',
      'Aylık Bütçe': 'Aylık Bütçe',
      'Akıllı Boost': 'Akıllı Boost',
      'Reklam Yöneticisi': 'Reklam Yöneticisi',
      'Potansiyel Müşteriler': 'Potansiyel Müşteriler',
      'İyileştir': 'İyileştir',
      Raporlar: 'Raporlar',
      'Marka Merkezi': 'Marka Merkezi',
      'Varlıklar': 'Varlıklar',
      'Hesabım': 'Hesabım',
    },
    vurgu: {
      Otomatik: 'Otomatik',
    },
  },
  {
    bolum: {
      Planla: 'Plan',
      'Oluştur': 'Create',
      'Yönet': 'Manage',
      'İyileştir': 'Optimize',
      Raporlar: 'Reports',
      Ayarlar: 'Settings',
    },
    satir: {
      'Genel Bakış': 'Overview',
      'Aylık Bütçe': 'Monthly Budget',
      'Akıllı Boost': 'Smart Boost',
      'Reklam Yöneticisi': 'Ads Manager',
      'Potansiyel Müşteriler': 'Leads',
      'İyileştir': 'Optimize',
      Raporlar: 'Reports',
      'Marka Merkezi': 'Brand Center',
      'Varlıklar': 'Assets',
      'Hesabım': 'My account',
    },
    vurgu: {
      Otomatik: 'Automatic',
    },
  },
);
