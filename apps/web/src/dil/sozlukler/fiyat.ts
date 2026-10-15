import { ikiDil } from '@advetics/shared';

/**
 * Fiyat paketlerinin metni (`components/landing/fiyat.ts`). Rakamlar ve
 * sınırlar burada DEĞİL, `fiyat.ts`te: iki dilde aynı paket aynı fiyatı
 * göstermeli ve rakamın tek evi orası (kullanıcı kararı 2026-10-14).
 * Fonksiyon değerler rakamı parametre alıyor.
 */
export const fiyatSozlugu = ikiDil(
  {
    paket: {
      'kucuk-isletme': {
        ad: 'Küçük İşletme',
        kim: 'Kendi reklamını yöneten tek işletme.',
        ozellikler: [
          'Tek panel: Meta, Google, LinkedIn',
          'AdvCampaign ile reklam kurma',
          'Akıllı Boost (ayda {n} öneri)',
          'Aylık PDF rapor',
          'Ölçüm kurulum sihirbazı',
        ],
        yok: ['Kurallar ile otomatik iyileştirme', 'Beyaz etiketli rapor'],
      },
      sirket: {
        ad: 'Şirket',
        kim: 'Birden çok projesi ve pazarlama ekibi olan şirket.',
        ozellikler: [
          "Küçük İşletme'nin tamamı",
          'AdvStrategy strateji raporu ve onay',
          'Kurallar ile otomatik iyileştirme',
          'Sınırsız Akıllı Boost',
          'Planlı rapor + fatura maili',
          'Yapay zekâ asistanı',
        ],
        yok: ['Beyaz etiketli rapor'],
      },
      ajans: {
        ad: 'Ajans',
        kim: "Müşterilerini Advetics'ten yöneten ajans.",
        ozellikler: [
          'Şirket paketinin tamamı',
          'Müşteri başına workspace',
          'Beyaz etiketli rapor ve mail',
          'Müşteriye salt okunur panel',
          'Ajans havuzu: hesap atama',
          'Öncelikli destek',
        ],
      },
    },
    ajansSiniri: (n: number) => `Taban ${n} workspace · sınırsız kullanıcı`,
    sinirsiz: (ad: string) => `sınırsız ${ad}`,
    birimWorkspace: 'workspace',
    birimReklamHesabi: 'reklam hesabı',
    birimKullanici: 'kullanıcı',
    ekWorkspace: (aralik: string, birFiyat: string, ikiAralik: string, ikiFiyat: string) =>
      `Ek workspace (${aralik}: ${birFiyat}, ${ikiAralik}: ${ikiFiyat})`,
    teklifAl: 'Teklif al',
    ucretsizDene: (gun: number) => `${gun} gün ücretsiz dene`,
    donemAylik: 'Aylık',
    donemYillik: 'Yıllık',
    teklifKonu: (paket: string) => `Advetics ${paket} paketi teklif talebi`,
    teklifGovde: (paket: string, ws: number, donem: string) =>
      'Merhaba,\n\n' +
      `Advetics ${paket} paketi için teklif istiyoruz.\n\n` +
      `Yaklaşık workspace (müşteri) sayısı: ${ws}\n` +
      `Ödeme dönemi: ${donem}\n` +
      'Ajans adı:\n' +
      'Reklam verdiğimiz yerler (Meta, Google, LinkedIn):\n',
    denemeKonu: (paket: string, gun: number) => `Advetics ${paket} paketi ${gun} günlük ücretsiz deneme`,
    denemeGovde: (paket: string, gun: number, donem: string) =>
      'Merhaba,\n\n' +
      `Advetics ${paket} paketini ${gun} gün ücretsiz denemek istiyorum.\n\n` +
      `Ödeme dönemi: ${donem}\n` +
      'Şirket adı:\n' +
      'Reklam verdiğimiz yerler (Meta, Google, LinkedIn):\n',
    tablo: {
      sinirsizHucre: 'Sınırsız',
      ek: (n: number) => `${n} + ek`,
      reklamHesabi: 'Reklam hesabı',
      kullanici: 'Kullanıcı',
      tekPanel: 'Tek panel (Meta, Google, LinkedIn)',
      advCampaign: 'AdvCampaign reklam kurma',
      akilliBoost: 'Akıllı Boost',
      ayda: (n: number) => `Ayda ${n}`,
      kurallar: 'Kurallar',
      planliRapor: 'Planlı rapor maili',
      asistan: 'Yapay zekâ asistanı',
      beyazEtiket: 'Beyaz etiket',
      saltOkunur: 'Müşteriye salt okunur panel',
      var: 'Var',
      yok: 'Yok',
      ozellik: 'Özellik',
      baslik: 'Paketlerin özellik ve sınır karşılaştırması',
    },
    kart: {
      odemeDonemi: 'Ödeme dönemi',
      aylik: 'Aylık',
      yillik: 'Yıllık',
      enCok: 'En çok seçilen',
      aydan: "/ ay'dan",
      ay: '/ ay',
      yillikFatura: 'Yıllık faturalanır · KDV hariç',
      kdvHaric: 'KDV hariç',
      musteriWorkspace: "Müşteri workspace'i",
      taban: (n: number) => `Taban (${n} dahil)`,
      yokOn: 'Yok: ',
    },
  },
  {
    paket: {
      'kucuk-isletme': {
        ad: 'Small Business',
        kim: 'A single business managing its own ads.',
        ozellikler: [
          'One panel: Meta, Google, LinkedIn',
          'Ad creation with AdvCampaign',
          'Smart Boost ({n} suggestions per month)',
          'Monthly PDF report',
          'Tracking setup wizard',
        ],
        yok: ['Automatic optimization with Rules', 'White-label report'],
      },
      sirket: {
        ad: 'Company',
        kim: 'A company with several projects and a marketing team.',
        ozellikler: [
          'Everything in Small Business',
          'AdvStrategy strategy report and approval',
          'Automatic optimization with Rules',
          'Unlimited Smart Boost',
          'Scheduled report + invoice email',
          'AI assistant',
        ],
        yok: ['White-label report'],
      },
      ajans: {
        ad: 'Agency',
        kim: 'An agency managing its clients from Advetics.',
        ozellikler: [
          'Everything in Company',
          'A workspace per client',
          'White-label report and email',
          'Read-only panel for clients',
          'Agency pool: account assignment',
          'Priority support',
        ],
      },
    },
    ajansSiniri: (n) => `Base ${n} workspaces · unlimited users`,
    sinirsiz: (ad) => `unlimited ${ad}`,
    birimWorkspace: 'workspaces',
    birimReklamHesabi: 'ad accounts',
    birimKullanici: 'users',
    ekWorkspace: (aralik, birFiyat, ikiAralik, ikiFiyat) =>
      `Extra workspaces (${aralik}: ${birFiyat}, ${ikiAralik}: ${ikiFiyat})`,
    teklifAl: 'Get a quote',
    ucretsizDene: (gun) => `Try free for ${gun} days`,
    donemAylik: 'Monthly',
    donemYillik: 'Yearly',
    teklifKonu: (paket) => `Advetics ${paket} plan quote request`,
    teklifGovde: (paket, ws, donem) =>
      'Hello,\n\n' +
      `We would like a quote for the Advetics ${paket} plan.\n\n` +
      `Approximate number of workspaces (clients): ${ws}\n` +
      `Billing period: ${donem}\n` +
      'Agency name:\n' +
      'Where we advertise (Meta, Google, LinkedIn):\n',
    denemeKonu: (paket, gun) => `Advetics ${paket} plan ${gun}-day free trial`,
    denemeGovde: (paket, gun, donem) =>
      'Hello,\n\n' +
      `I would like to try the Advetics ${paket} plan free for ${gun} days.\n\n` +
      `Billing period: ${donem}\n` +
      'Company name:\n' +
      'Where we advertise (Meta, Google, LinkedIn):\n',
    tablo: {
      sinirsizHucre: 'Unlimited',
      ek: (n) => `${n} + extra`,
      reklamHesabi: 'Ad accounts',
      kullanici: 'Users',
      tekPanel: 'One panel (Meta, Google, LinkedIn)',
      advCampaign: 'Ad creation with AdvCampaign',
      akilliBoost: 'Smart Boost',
      ayda: (n) => `${n} per month`,
      kurallar: 'Rules',
      planliRapor: 'Scheduled report email',
      asistan: 'AI assistant',
      beyazEtiket: 'White label',
      saltOkunur: 'Read-only panel for clients',
      var: 'Included',
      yok: 'Not included',
      ozellik: 'Feature',
      baslik: 'Feature and limit comparison of the plans',
    },
    kart: {
      odemeDonemi: 'Billing period',
      aylik: 'Monthly',
      yillik: 'Yearly',
      enCok: 'Most popular',
      aydan: '/ mo and up',
      ay: '/ mo',
      yillikFatura: 'Billed yearly · excl. VAT',
      kdvHaric: 'Excl. VAT',
      musteriWorkspace: 'Client workspaces',
      taban: (n) => `Base (${n} included)`,
      yokOn: 'Not included: ',
    },
  },
);
