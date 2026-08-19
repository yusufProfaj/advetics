import type { Permission } from '@advetics/shared';
import type { NavEntry } from '@/components/nav';

/**
 * Kenar çubuğu — mimari dokümandaki 7 bölüm.
 *
 * BÖLÜM ADLARI TÜRKÇE ve İŞ DİLİNDE. "CENTRAL" ya da "OPTIMISE" bir yazılım
 * mimarisi terimi; panelde oturan kişi reklam uzmanı bile olsa bunlar ona bir
 * şey söylemiyor. Bölüm adı "orada ne yapacağımı" anlatmalı.
 *
 * SIRA DA BİR ANLAM TAŞIYOR: yukarıdan aşağı bir iş akışı — önce bakarsın
 * (Merkez), sonra yaparsın (Oluştur), sonra kontrol edersin (Yönet),
 * iyileştirirsin, en son raporlarsın.
 */
export const SECTIONS: Array<{ title: string; items: NavEntry[] }> = [
  {
    // 3 CENTRAL — en sık açılan ekran en üstte.
    title: 'Merkez',
    items: [
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1 },
      { href: '/ads-explorer', label: 'Reklam Keşfi', icon: 'explorer', module: 4 },
      { href: '/saglik', label: 'Sağlık Skoru', icon: 'health', module: 3, ready: false },
    ],
  },
  {
    // 4 CREATE
    title: 'Oluştur',
    items: [
      /**
       * TEK GİRİŞ — üç ayrı menü maddesi yerine (tasarım belgesi K6).
       *
       * Kullanıcı "reklam vereceğim" diye geliyor; biz ona "elle mi, kuraldan
       * mı, tablodan mı" diye soruyorduk ve bu üç ayrı zihinsel model demekti.
       * `/reklam-olustur` artık bir giriş kapısı: dört başlangıç noktası ve
       * kampanya listesi. Toplu oluşturma oradan açılıyor, menüde ayrı
       * madde değil.
       */
      { href: '/reklam-olustur', label: 'Reklamlar', icon: 'create', module: 4, ready: true },
      /**
       * AKILLI BOOST MENÜDE KALIYOR çünkü orada yapılan iş reklam oluşturmak
       * değil OTOMASYON AYARI: kural kurmak ve onay kuyruğunu yönetmek.
       * Kuralın ürettiği kampanyalar zaten "Reklamlar" listesinde görünüyor.
       */
      { href: '/auto-boost', label: 'Akıllı Boost', icon: 'boost', module: 7, ready: true },
    ],
  },
  {
    // 5 MANAGE
    title: 'Yönet',
    items: [
      {
        href: '/potansiyel-musteriler',
        label: 'Potansiyel Müşteriler',
        icon: 'leads',
        module: 4,
        ready: true,
      },
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true },
    ],
  },
  {
    // 6 OPTIMISE
    title: 'İyileştir',
    items: [
      // Modül 6 hazır sayılıyor (Raporlar bitti) ama bu ikisinin sayfası YOK.
      // `ready` verilmezse modül numarasına düşülüyor ve ikisi de tıklanabilir
      // görünüp 404 veriyordu.
      { href: '/yorgunluk', label: 'Reklam Yorgunluğu', icon: 'fatigue', module: 6, ready: false },
      { href: '/ab-test', label: 'A/B Test', icon: 'abtest', module: 6, ready: false },
    ],
  },
  {
    // 7 REPORT
    title: 'Raporla',
    items: [{ href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6 }],
  },
  {
    // 2 BASE — henüz tamamen boş, ama yol haritası görünür olsun.
    title: 'Kütüphane',
    items: [
      { href: '/kutuphane/formlar', label: 'Formlar', icon: 'forms', module: 4, ready: true },
      {
        href: '/kutuphane/bilgi-bankasi',
        label: 'Bilgi Bankası',
        icon: 'assets',
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
      /**
       * Kreatif kütüphaneye ait, "Oluştur" altına değil: bir kampanyaya değil
       * MÜŞTERİYE ait ve aynı metin/görsel on kampanyada kullanılabiliyor.
       *
       * Bu, "Oluştur" bölümünün menüde nasıl yeniden kurulacağı kararını
       * (tasarım belgesi K6) vermiyor — Formlar ve Görsel Arşivi'nin yanına
       * üçüncü bir kütüphane girişi eklemek o karardan bağımsız.
       */
      { href: '/kutuphane/kreatifler', label: 'Kreatifler', icon: 'assets', module: 4, ready: true },
      { href: '/kutuphane/kitleler', label: 'Kitleler', icon: 'audience', module: 2, ready: false },
      { href: '/kutuphane/bilgi', label: 'Bilgi Bankası', icon: 'knowledge', module: 2, ready: false },
    ],
  },
  {
    // 1 WORKSPACE — en altta çünkü en seyrek açılıyor.
    //
    // SIRA KURULUM SIRASI. Yeni bir müşteriyi devralan kişi yukarıdan aşağı
    // ilerleyerek işi bitiriyor:
    //
    //   1. Müşteri aç            (şirket)
    //   2. Reklam hesabını bağla (o müşterinin yönetilecek hesapları)
    //   3. Ekibi yetkilendir     (kim hangi müşteriyi görecek)
    //
    // Önceki sıra Platform Bağlantıları'nı en üste koyuyordu ve akışı tersine
    // çeviriyordu: bağlantı ekranı müşteri seçilmeden iş görmüyor ("Önce bir
    // müşteri seç" diyor), yani ilk tıklanan yer çıkmaz sokaktı.
    //
    // Marka ve Denetim Kaydı `ready` DEĞİL: arka uçları hazır (branding,
    // audit-logs uç noktaları çalışıyor) ama ekranları yazılmadı. Modül
    // numaralarına bakılsaydı ikisi de açık görünüp 404 verirdi.
    title: 'Çalışma Alanı',
    items: [
      // YETKİ ANAHTARLARI: `client.read` KULLANILMIYOR — client_viewer onda
      // var (kendi müşterisini okuyabilmeli). Ayırt eden yetki YÖNETİM
      // yetkisi: müşteri eklemek, bağlantı görmek, ekip listelemek.
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
      { href: '/ayarlar/ekip', label: 'Ekip & Yetkiler', icon: 'team', module: 1, ready: true, perm: 'user.read' },
      { href: '/ayarlar/marka', label: 'Marka', icon: 'brand', module: 1, ready: false, perm: 'branding.write' },
      { href: '/ayarlar/denetim', label: 'Denetim Kaydı', icon: 'audit', module: 1, ready: false, perm: 'audit.read' },
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
