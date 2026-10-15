import { ikiDil } from '@advetics/shared';

/**
 * Tanıtım sitesinin ÇERÇEVE ve sayfa metinleri: menü, alt bilgi, ortak
 * parçalar, sayfa başlıkları ve açıklamaları, çerez bildirimi. İçerik
 * listeleri (özellikler, çözümler, sorular) `site.ts`te.
 *
 * İki dilde AYNI kalan adlar ("Demo", "Advetics", "Workspace") sözlükte
 * DEĞİL, kodda sabit: sözlük bekçisi aynı değeri "çevrilmemiş" sayıyor.
 */
export const siteArayuzSozlugu = ikiDil(
  {
    ortak: {
      demoTalep: 'Demo Talep Et',
      girisYap: 'Giriş Yap',
      rakamlarOrnek: 'Ekrandaki rakamlar örnektir.',
      yakinda: 'Yakında',
      nasilCalisirOk: 'Nasıl çalışır →',
      ayrintilar: 'Ayrıntılar →',
      bilmenizGerekenler: 'Bilmeniz gerekenler',
      kapanisBaslik: 'Kendi hesaplarınızla görün',
      kapanisMetin: 'Kısa bir görüşmede hesaplarınızı bağlayıp kendi rakamlarınızla gösterelim.',
      tumOzellikler: 'Bütün Özellikler',
      tumOzelliklerOk: 'Bütün Özellikler →',
    },
    nav: {
      anaMenu: 'Ana menü',
      anaSayfa: 'Advetics ana sayfa',
      ozellikler: 'Özellikler',
      cozumler: 'Çözümler',
      menu: 'Menü',
    },
    altBilgi: {
      tanim: 'Meta, Google ve LinkedIn reklamları için tek panel. Profaj tarafından geliştirildi.',
      urun: 'Ürün',
      cozumler: 'Çözümler',
      yasal: 'Yasal',
      cerezTercihleri: 'Çerez tercihleri',
      haklar: '© 2026 Advetics. Tüm hakları saklıdır.',
      platform: 'Meta, Google Ads ve LinkedIn Ads reklam yönetim platformu',
    },
    ana: {
      metaBaslik: 'Advetics | Meta, Google ve LinkedIn reklamlarınız tek panelde',
      metaAciklama:
        'Reklamcılık bilmeden reklam verin. Advetics hesaplarınızı izler, kampanyayı kurar, ' +
        'bütçeyi korur ve raporu kendisi gönderir. Siz yalnız onaylarsınız.',
      ust: 'Meta · Google · LinkedIn için tek panel',
      baslik1: 'Ne yapılacağını söyler.',
      baslik2: 'Onaylarsanız yapar.',
      alt:
        'Reklamcılık bilmeniz gerekmez. Advetics hesaplarınızı izler, kampanyayı kurar, ' +
        'bütçeyi korur ve raporu müşterinize kendisi gönderir. Siz yalnız onaylarsınız.',
      nasilGor: 'Nasıl çalıştığını gör ↓',
      baglandigiYerler: 'Bağlandığı yerler',
      nasilCalisir: 'Nasıl çalışır',
      dortAdim: 'Dört adımda yayında.',
      guvenlik: 'Güvenlik',
      guvenlikBaslik: 'Verileriniz sizde, ayrı ve korunuyor.',
      guvenlikMetin:
        'Her müşterinin verisi veritabanı düzeyinde ayrılır; bir müşterinin kullanıcısı diğerinin tek satırını göremez.',
      fiyat: 'Fiyatlandırma',
      ucPaket: 'Üç paket. Taahhüt yok.',
      fiyatAlt: "Reklam bütçeniz platforma doğrudan ödenir; Advetics'e yalnız abonelik ödersiniz.",
      karsilastir: 'Bütün özellikleri karşılaştır →',
      sss: 'Sık sorulanlar',
      merakEdilenler: 'Merak edilenler',
      kapanisBaslik: 'İlk raporunuz bu ay gitsin.',
      kapanisMetin: '30 dakikalık demoda hesabınızı birlikte bağlayalım.',
    },
    ozellikler: {
      metaBaslik: 'Özellikler | Advetics',
      metaAciklama:
        'Advetics ile reklam planlama, kurma, öne çıkarma, iyileştirme, raporlama ve ölçüm kurulumu. ' +
        'Her ekran reklam bilmeyen biri düşünülerek tasarlandı.',
      ust: 'Özellikler',
      baslik: 'Reklamın her adımı için bir ekran',
      ozet: (n: number) =>
        `Advetics ${n} ana parçadan oluşur. Hepsi aynı panelde ve ` +
        'hepsinde son söz sizin: hiçbir değişiklik onayınız olmadan yayına çıkmaz.',
      tumu: 'Bütün özellikler',
    },
    ozellik: {
      neKazandirir: 'Size ne kazandırır',
      panelAdi: (ad: string) => `Paneldeki adı: ${ad}.`,
      nasilCalisir: 'Nasıl çalışır',
      yakindaAciklama: 'Üzerinde çalıştığımız ama henüz panelde olmayan parçalar.',
      digerleri: 'Diğer özellikler',
    },
    cozum: {
      nedenAdvetics: 'Neden Advetics',
      ornekNotu: 'Bu bir örnek senaryodur, gerçek bir müşteri hikâyesi değildir.',
      enCok: 'En çok kullanacağınız özellikler',
    },
    entegrasyonlar: {
      metaAciklama:
        'Advetics Meta (Facebook, Instagram), Google Ads, LinkedIn Ads ve YouTube ile çalışır; ' +
        'Meta Pixel, Google Tag Manager ve Google Analytics 4 kurulumunu kontrol eder.',
      baslik: 'Reklam verdiğiniz yerlere bağlanır',
      ozet:
        'Advetics reklam hesaplarınıza platformların kendi izin ekranıyla bağlanır. ' +
        'Aşağıda her bağlantıyla bugün neler yapılabildiği yazıyor.',
      yakindaAciklama: 'Üzerinde çalıştığımız ama henüz panelde olmayan bağlantılar.',
    },
    fiyat: {
      metaAciklama: (paketler: string, baslangic: string, indirim: number, gun: number) =>
        `Advetics üç paket: ${paketler}. ${baslangic}/ay'dan başlar, ` +
        `yıllık ödemede %${indirim} indirim, ${gun} gün ücretsiz deneme. ` +
        'Reklam bütçeniz doğrudan platformlara ödenir.',
      baslik: 'Büyüklüğünüze göre üç paket.',
      alt: 'Fiyatlar ABD doları cinsindendir, ödeme günün kuruyla TL alınır. KDV hariç.',
      sorular: 'Fiyat soruları',
    },
    guvenlik: {
      metaAciklama:
        'Advetics her şirketin verisini veritabanı düzeyinde ayırır, parola istemez, erişim ' +
        'anahtarlarını şifreli saklar ve yapay zekâ bağlantısını salt okunur tutar.',
      baslik: 'Verileriniz sizde, ayrı ve korunuyor',
      ozet:
        'Reklam hesaplarınızın verisi işinizin bilgisidir. Aşağıda onu nasıl ' +
        'koruduğumuzu teknik terimlere boğmadan anlatıyoruz.',
      nasilKoruyoruz: 'Nasıl koruyoruz',
      kontrol: 'Verinizin kontrolü sizde',
      silBaslik: 'Verilerinizi silin',
      silMetin: 'Hesabınızın ve verilerinizin silinmesini nasıl isteyeceğiniz.',
      gizlilikBaslik: 'Gizlilik politikası',
      gizlilikMetin: 'Hangi veriyi neden topladığımız ve kiminle paylaştığımız.',
    },
    demo: {
      metaAciklama:
        'Advetics demosu için bize yazın. Kısa bir görüşmede hesaplarınızı bağlayıp kendi ' +
        'rakamlarınızla gösterelim.',
      baslik: 'Kendi hesaplarınızla görün',
      ozet:
        'Ekran görüntüsü yerine kendi reklamlarınızı görmek daha çok şey anlatır. ' +
        'Bize yazın, kısa bir görüşmede gösterelim.',
      adimlar: [
        {
          baslik: 'Bize yazın',
          metin: 'Şirketinizi ve reklam verdiğiniz yerleri kısaca anlatın. Şablon mailin içinde hazır.',
        },
        {
          baslik: 'Görüşme ayarlayalım',
          metin: 'Size uygun bir zamanda kısa bir görüşme yapıyoruz. Ne yapmak istediğinizi dinliyoruz.',
        },
        {
          baslik: 'Kendi rakamlarınızla görün',
          metin: 'İsterseniz hesaplarınızı birlikte bağlıyor, paneli kendi verinizle gösteriyoruz.',
        },
        {
          baslik: 'Teklif',
          metin: 'İhtiyacınıza göre hazırlanmış teklifi size gönderiyoruz.',
        },
      ],
      nasilIlerliyoruz: 'Nasıl ilerliyoruz',
      bizeUlasin: 'Bize ulaşın',
      eposta: 'E-posta',
    },
    cerez: {
      baslik: 'Çerezler',
      metin: 'Yalnız oturumunuz ve dil seçiminiz için zorunlu çerez kullanıyoruz. İzleme ya da reklam çerezi yok.',
      politika: 'Çerez Politikası',
      zorunlu: 'Zorunlu',
      zorunluAlt: 'Giriş, oturum ve dil. Kapatılamaz.',
      analitik: 'Analitik',
      analitikAlt: 'Şu an kullanılmıyor.',
      anladim: 'Anladım',
    },
  },
  {
    ortak: {
      demoTalep: 'Request a Demo',
      girisYap: 'Sign In',
      rakamlarOrnek: 'The numbers on screen are examples.',
      yakinda: 'Coming soon',
      nasilCalisirOk: 'How it works →',
      ayrintilar: 'Details →',
      bilmenizGerekenler: 'Good to know',
      kapanisBaslik: 'See it with your own accounts',
      kapanisMetin: "In a short call we'll connect your accounts and show you your own numbers.",
      tumOzellikler: 'All Features',
      tumOzelliklerOk: 'All Features →',
    },
    nav: {
      anaMenu: 'Main menu',
      anaSayfa: 'Advetics home page',
      ozellikler: 'Features',
      cozumler: 'Solutions',
      menu: 'Menu',
    },
    altBilgi: {
      tanim: 'One panel for Meta, Google and LinkedIn ads. Built by Profaj.',
      urun: 'Product',
      cozumler: 'Solutions',
      yasal: 'Legal',
      cerezTercihleri: 'Cookie preferences',
      haklar: '© 2026 Advetics. All rights reserved.',
      platform: 'Ad management platform for Meta, Google Ads and LinkedIn Ads',
    },
    ana: {
      metaBaslik: 'Advetics | Your Meta, Google and LinkedIn ads in one panel',
      metaAciklama:
        'Advertise without knowing advertising. Advetics watches your accounts, builds the campaign, ' +
        'protects the budget and sends the report by itself. You just approve.',
      ust: 'One panel for Meta · Google · LinkedIn',
      baslik1: 'It tells you what to do.',
      // Hero ikinci satırı 1440 px'te 48 px ile tek satıra sığmalı (tanitim.css ölçüsü);
      // "If you approve, it does it." ikiye bölünüyordu (yerelde ölçüldü).
      baslik2: "Approve, and it's done.",
      alt:
        'You do not need to know advertising. Advetics watches your accounts, builds the campaign, ' +
        'protects the budget and sends the report to your client by itself. You just approve.',
      nasilGor: 'See how it works ↓',
      baglandigiYerler: 'Works with',
      nasilCalisir: 'How it works',
      dortAdim: 'Live in four steps.',
      guvenlik: 'Security',
      guvenlikBaslik: 'Your data stays yours, separate and protected.',
      guvenlikMetin:
        "Each client's data is separated at the database level; a user of one client cannot see a single row of another's.",
      fiyat: 'Pricing',
      ucPaket: 'Three plans. No commitment.',
      fiyatAlt: 'Your ad budget is paid directly to the platform; you only pay Advetics a subscription.',
      karsilastir: 'Compare all features →',
      sss: 'FAQ',
      merakEdilenler: 'Frequently asked questions',
      kapanisBaslik: 'Send your first report this month.',
      kapanisMetin: "Let's connect your account together in a 30-minute demo.",
    },
    ozellikler: {
      metaBaslik: 'Features | Advetics',
      metaAciklama:
        'Ad planning, creation, boosting, optimization, reporting and tracking setup with Advetics. ' +
        'Every screen is designed for someone who does not know advertising.',
      ust: 'Features',
      baslik: 'A screen for every step of advertising',
      ozet: (n) =>
        `Advetics is made of ${n} main parts. All of them live in the same panel and ` +
        'in all of them you have the final say: no change goes live without your approval.',
      tumu: 'All features',
    },
    ozellik: {
      neKazandirir: 'What you get',
      panelAdi: (ad) => `Name in the panel: ${ad}.`,
      nasilCalisir: 'How it works',
      yakindaAciklama: 'Parts we are working on that are not in the panel yet.',
      digerleri: 'Other features',
    },
    cozum: {
      nedenAdvetics: 'Why Advetics',
      ornekNotu: 'This is an example scenario, not a real customer story.',
      enCok: 'Features you will use most',
    },
    entegrasyonlar: {
      metaAciklama:
        'Advetics works with Meta (Facebook, Instagram), Google Ads, LinkedIn Ads and YouTube, ' +
        'and checks your Meta Pixel, Google Tag Manager and Google Analytics 4 setup.',
      baslik: 'It connects to where you advertise',
      ozet:
        "Advetics connects to your ad accounts through the platforms' own permission screens. " +
        'Below is what each connection can do today.',
      yakindaAciklama: 'Connections we are working on that are not in the panel yet.',
    },
    fiyat: {
      metaAciklama: (paketler, baslangic, indirim, gun) =>
        `Advetics has three plans: ${paketler}. From ${baslangic}/month, ` +
        `${indirim}% off with annual billing, ${gun}-day free trial. ` +
        'Your ad budget is paid directly to the platforms.',
      baslik: 'Three plans for your size.',
      alt: 'Prices are in US dollars; payment is taken in TRY at the day\'s exchange rate. VAT excluded.',
      sorular: 'Pricing questions',
    },
    guvenlik: {
      metaAciklama:
        "Advetics separates each company's data at the database level, never asks for passwords, " +
        'stores access keys encrypted and keeps the AI connection read-only.',
      baslik: 'Your data stays yours, separate and protected',
      ozet:
        "Your ad account data is your business's information. Below we explain how we " +
        'protect it, without drowning you in technical terms.',
      nasilKoruyoruz: 'How we protect it',
      kontrol: 'You control your data',
      silBaslik: 'Delete your data',
      silMetin: 'How to request deletion of your account and data.',
      gizlilikBaslik: 'Privacy policy',
      gizlilikMetin: 'What data we collect, why, and who we share it with.',
    },
    demo: {
      metaAciklama:
        "Write to us for an Advetics demo. In a short call we'll connect your accounts and show " +
        'you your own numbers.',
      baslik: 'See it with your own accounts',
      ozet:
        'Seeing your own ads says more than a screenshot. ' +
        "Write to us and we'll show you in a short call.",
      adimlar: [
        {
          baslik: 'Write to us',
          metin: 'Briefly describe your company and where you advertise. The email template is ready.',
        },
        {
          baslik: "Let's set up a call",
          metin: 'We have a short call at a time that suits you. We listen to what you want to do.',
        },
        {
          baslik: 'See your own numbers',
          metin: 'If you like, we connect your accounts together and show the panel with your own data.',
        },
        {
          baslik: 'Offer',
          metin: 'We send you an offer prepared for your needs.',
        },
      ],
      nasilIlerliyoruz: 'How it works',
      bizeUlasin: 'Contact us',
      eposta: 'Email',
    },
    cerez: {
      baslik: 'Cookies',
      metin: 'We only use cookies that are required for your session and language choice. No tracking or advertising cookies.',
      politika: 'Cookie Policy',
      zorunlu: 'Required',
      zorunluAlt: 'Sign-in, session and language. Cannot be turned off.',
      analitik: 'Analytics',
      analitikAlt: 'Not used at the moment.',
      anladim: 'Got it',
    },
  },
);
