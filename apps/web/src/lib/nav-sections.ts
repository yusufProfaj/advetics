import { ASISTAN_PLATFORM_ETIKETI, type Permission } from '@advetics/shared';
import type { NavEntry } from '@/components/nav';
import { SAYFA_GIRIS_IZNI } from '@/components/bilgi-bankasi/sekmeler';

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
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1, perm: 'insights.read' },
      /*
       * ═══ MÜŞTERİ HESABI YALNIZCA ÜÇ EKRAN GÖRÜYOR ═══
       *
       * Kullanıcının tanımı: "müşteri = sadece genel bakış, reklam keşfi ve
       * raporlar; reklam kısmını göremez". Bu yüzden Reklamlar ve Kütüphane
       * bölümlerinin HER satırı bir yetki taşıyor — yetkisiz satır herkese
       * görünüyor (süzme opt-in) ve müşteri hesabı Kurallar'ı, Aylık
       * Bütçe'yi, Akıllı Boost'u menüde görürdü. `nav-sections.spec.ts`
       * müşteri hesabının gördüğü etiketleri TAM LİSTE olarak kilitliyor.
       */
      { href: '/auto-boost', label: 'Akıllı Boost', icon: 'boost', module: 7, ready: true, perm: 'boost.read' },
    ],
  },
  {
    title: 'Reklamlar',
    items: [
      { href: '/ads-explorer', label: 'Reklam Keşfi', icon: 'explorer', module: 4, perm: 'insights.read' },
      { href: '/reklam-olustur', label: 'Reklam Oluştur', icon: 'create', module: 4, ready: true, perm: 'bulk.write' },
      {
        /*
         * ═══ AI ASİSTAN: TEK EKRAN, İKİ ASİSTAN ═══
         *
         * `Reklam Oluştur`un ALTINDA ve bilerek: kampanya kurmanın bir
         * başka yolu, ayrı bir iş değil.
         *
         * İKİ ALT SATIR, ÇÜNKÜ İKİ AYRI ASİSTAN. Meta ve Google aynı
         * promptla yönetilemiyor: hedef sözlüğü, bütçe modeli (Google'da
         * bütçe AYRI BİR KAYNAK) ve yazma kısıtları farklı. Tek satır
         * gösterip seçimi sayfanın içine bırakmak, kullanıcıyı menüden
         * sonra ikinci bir seçim yapmaya zorlardı.
         *
         * `bulk.write` — `bulk.read` DEĞİL. Asistan taslak YAZIYOR ve
         * (Faz 2'den sonra) yayın onayı sunacak; müşteri hesabı
         * (`client_viewer`) reklam yayınlayamıyor, dolayısıyla bu satırı da
         * görmüyor. Sayfanın kendi kapısı da aynı anahtarı kullanıyor —
         * ikisi ayrışırsa menüde görünen ama açılmayan bir satır olur.
         */
        href: '/reklam-olustur/ai-asistan',
        label: 'AI Asistan',
        icon: 'ai',
        module: 4,
        ready: true,
        perm: 'bulk.write',
        children: [
          {
            href: '/reklam-olustur/ai-asistan?platform=meta',
            // ETİKET TEK KAYNAKTAN. Menüde ve sayfa başlığında elle yazmak,
            // bir gün birinin değişip diğerinin kalması demekti.
            label: ASISTAN_PLATFORM_ETIKETI.meta,
            icon: 'ai',
            module: 4,
            ready: true,
          },
          {
            href: '/reklam-olustur/ai-asistan?platform=google',
            label: ASISTAN_PLATFORM_ETIKETI.google,
            icon: 'ai',
            module: 4,
            ready: true,
          },
        ],
      },
      { href: '/kurallar', label: 'Kurallar', icon: 'rules', module: 5, ready: true, perm: 'rule.read' },
      /*
       * `budget.write`, `budget.read` DEĞİL. Müşteri hesabı `budget.read`
       * taşıyor — Genel Bakış'taki bütçe tüketimi o yetkiyle okunuyor ve o
       * bilgi kendisine ait. Ama bu ekran bütçe BELİRLEME yeri; okuma
       * yetkisiyle açmak müşteriyi kaydedemeyeceği bir forma götürürdü.
       */
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true, perm: 'budget.write' },
    ],
  },
  {
    title: 'Raporlar',
    items: [
      /*
       * ═══ RAPORLARIN TEK GİRİŞİ ═══
       *
       * Burada üç bağlantı vardı: Raporlar, Rapor Şablonları, Faturalar.
       * Üçü de AYNI belgenin parçasıydı ve ayrı sayfalara bölünmeleri gerçek
       * bir hata üretiyordu: kullanıcı şablonunu ayrı sayfada düzenleyip
       * rapora dönüyor, seçiciden bir ön ayar seçiyor ve düzenlemesi
       * kayboluyordu (seçici yalnızca ön ayarları tanıyordu, kayıtlı
       * şablonları değil). Fatura da rapor mailinin EKİ — tek tüketicisi
       * rapor ekranı.
       *
       * Üçü artık `/raporlar` içinde: şablon seçicide hem ön ayarlar hem
       * kayıtlı şablonlar, faturalar da sekme olarak. Yetki süzgeci
       * kaybolmadı, sayfanın İÇİNE taşındı — `report.write` şablon
       * düzenlemeyi, `report.share` fatura sekmesini açıyor.
       */
      { href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6, perm: 'report.read' },
      {
        href: '/potansiyel-musteriler',
        label: 'Potansiyel Müşteriler',
        icon: 'leads',
        module: 4,
        ready: true,
        perm: 'lead.read',
      },
    ],
  },
  {
    title: 'Kütüphane',
    items: [
      /*
       * BİLGİ BANKASI KÜTÜPHANE'NİN ALTINDA — daha önce Akıllı Boost'un
       * hemen altındaydı ve içeriği o zaman boost ön ayarlarıydı (bkz.
       * `boost-on-ayarlari-formu.tsx`). Artık müşterinin GENEL profili:
       * genel bilgiler, bütçe hedefi, hedef kitle, marka bilgileri, logo —
       * Görsel Arşivi ve Kreatifler'le aynı raf, kampanyadan/boost'tan
       * bağımsız.
       *
       * ═══ `perm` EKLENDİ, GERÇEKÇESİ ═══
       *
       * Satır uzun süre yetkisizdi ve bu bilinçli bir karar değil, eski
       * içeriğin (boost ön ayarı) kalıntısıydı. İçerik müşteri profiline
       * dönünce satırın ilk sekmesi bir süre `clients.notes`u — AJANS İÇİ
       * notu — basıyordu ve yetkisiz menü satırı o sızıntının üç halkasından
       * biriydi. Not alanı tamamen bırakıldı, ama satır artık sayfanın KENDİ
       * giriş yetkisini taşıyor.
       *
       * Yetki `client.read` ve DEĞERİ ELLE YAZILMIYOR: sayfanın kapısıyla
       * aynı sabitten (`SAYFA_GIRIS_IZNI`) geliyor. İkisini ayrı yazmak,
       * birinin değişip diğerinin kalması demekti — menüde görünen ama
       * açılmayan (ya da tersine, gizlenen ama çalışan) bir satır.
       *
       * `client.read` HİÇBİR ROLÜ DIŞARIDA BIRAKMIYOR (client_viewer dahil
       * hepsinde var) — yani bu satır bugün kimseden gizlenmiyor ve
       * gizlenmemeli de: Bilgi Bankası müşterinin KENDİ bilgisi. Yetki yine
       * de yazılı, çünkü `resolvePermissions` override'ı `client.read`i tek
       * bir kullanıcıdan alabiliyor ve o kullanıcıya boş açılan bir sayfa
       * göstermenin anlamı yok.
       */
      {
        href: '/kutuphane/bilgi-bankasi',
        label: 'Bilgi Bankası',
        icon: 'knowledge',
        module: 7,
        ready: true,
        perm: SAYFA_GIRIS_IZNI,
      },
      // Üç ekran da `/assets`/`/forms` uçlarını `bulk.read` ile okuyor —
      // menü aynı yetkiyi taşıyor ki görünen satır her zaman açılsın.
      {
        href: '/kutuphane/gorseller',
        label: 'Görsel Arşivi',
        icon: 'assets',
        module: 2,
        ready: true,
        perm: 'bulk.read',
      },
      { href: '/kutuphane/kreatifler', label: 'Kreatifler', icon: 'assets', module: 4, ready: true, perm: 'bulk.read' },
      { href: '/kutuphane/formlar', label: 'Formlar', icon: 'forms', module: 4, ready: true, perm: 'bulk.read' },
    ],
  },
  {
    /*
     * AJANS İŞİ. `client.read` KULLANILMIYOR: client_viewer'da var (kendi
     * müşterisini okuyabilmeli), ayırt eden şey yönetim yetkisi.
     *
     * ADI "AYARLAR" DEĞİL "SİSTEM YÖNETİMİ": içinde ayar olmayan ekranlar
     * var (Şirketler, Ekip) ve "ayar" kelimesi onları
     * ikinci sınıf gösteriyordu — kullanıcı şirket açmayı bir ayar sanmıyor.
     */
    title: 'Sistem Yönetimi',
    items: [
      {
        /*
         * WORKSPACE'LER AYRI BİR SATIR DEĞİL — ŞİRKETLER'İN İÇİNDE.
         *
         * "Şirketler" ve "Workspace'ler" yan yana iki satırdı ve menünün
         * kendisi hiyerarşiyi yanlış anlatıyordu: workspace şirketin
         * İÇİNDE, kardeşi değil. Yan yana dururken kullanıcı workspace
         * listesine bakarken hangi şirkette olduğunu ekrandan okuyamıyordu.
         * `/ayarlar/musteriler` yönlendiriyor (yer imleri ve panel içi
         * bağlantılar için); alt yolları yerinde duruyor.
         *
         * `org.write` ile kapalı — bu ekran bir kullanıcının ERİŞEBİLDİĞİ
         * ŞİRKET KÜMESİNİ değiştiriyor, yani izolasyonun sınırını.
         * `client.write` (workspace açma) yetmez: `ad_manager` onu taşıyor
         * ama şirket açamamalı. Workspace bölümü bu sayfanın İÇİNDE ve
         * kendi yetkisini ayrıca kontrol ediyor.
         */
        href: '/ayarlar/ust-hesap',
        label: 'Şirketler',
        icon: 'clients',
        module: 1,
        ready: true,
        perm: 'org.write',
      },
      {
        /*
         * ÜST HESAPLAR — ŞİRKETLER'DEN AYRI SATIR.
         *
         * İkisi farklı kapsam: "Şirketler" bir üst hesabın ALTINI yönetiyor,
         * bu satır hesapların KENDİSİNİ (ad, paket, ekip büyüklüğü, silme,
         * yeni hesap). Aynı sayfada toplamak, aktif olmayan bir hesabı
         * düzenlemek için önce ona geçmeyi zorunlu kılıyordu.
         *
         * `org.write` — Şirketler ile aynı anahtar ve aynı gerekçe: bu ekran
         * bir kullanıcının ERİŞEBİLDİĞİ ŞİRKET KÜMESİNİ değiştiriyor.
         * Platform sahibi burada bütün hesapları görüyor; ayrım sunucuda.
         */
        href: '/ayarlar/ust-hesaplar',
        label: 'Üst Hesaplar',
        icon: 'clients',
        module: 1,
        ready: true,
        perm: 'org.write',
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
        /*
         * TEŞHİS EKRANI AYARLAR ALTINDA ve `connection.read` ile kapalı.
         * `insights.read` ile açmak client_viewer'a da gösterirdi: bu ekran
         * platformun ham hata mesajlarını (subcode, fbtrace) basıyor ve o
         * müşteri tarafına ait bir bilgi değil.
         */
        href: '/ayarlar/senkronizasyon',
        label: 'Senkronizasyon Durumu',
        icon: 'sync',
        module: 3,
        ready: true,
        perm: 'connection.read',
      },
      {
        /*
         * `report.share` İLE KAPALI — yönetim izniyle DEĞİL.
         *
         * Bu ekran "başkasının ayarı" kavramı taşımıyor: herkes yalnızca
         * kendi satırını görüyor (RLS). O yüzden yönetici iznine bağlamak
         * yanlış olurdu — danışmanın kendi imzasını düzenlemesi yöneticiye
         * bağlanırdı.
         *
         * Ama izinsiz de bırakılamıyor: `client_viewer` (müşteri hesabı)
         * rapor GÖNDERMİYOR, yalnızca okuyor. İzinsiz bırakmak ona hem bu
         * ekranı hem de tamamı ajans işi olan "Ayarlar" başlığını
         * gösteriyordu — `nav-sections.spec.ts` bunu yakaladı.
         *
         * `report.share` tam olarak "rapor gönderebilir" demek ve e-posta
         * kimliği de onun için gerekiyor.
         */
        href: '/ayarlar/e-posta',
        label: 'E-posta Ayarları',
        icon: 'mail',
        module: 6,
        ready: true,
        perm: 'report.share',
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
  const gorunur = (i: NavEntry): boolean => !i.perm || izinli.has(i.perm);
  return SECTIONS.map((s) => ({
    title: s.title,
    items: s.items.filter(gorunur).map((i) =>
      /*
       * ALT ÖĞELER DE SÜZÜLÜYOR. Kendi `perm`i olmayan alt öğe üstünkini
       * devralıyor (üst zaten süzüldü); kendi anahtarı varsa ayrıca
       * kontrol ediliyor. Süzmeyi atlamak, üst satırı gören ama alt
       * satırında 403 alan bir kullanıcı üretirdi.
       */
      i.children ? { ...i, children: i.children.filter(gorunur) } : i,
    ),
  })).filter((s) => s.items.length > 0);
}
