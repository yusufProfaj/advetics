import {
  AYARLAR_SEKMELERI,
  MARKA_MERKEZI_IZNI,
  PANEL_YOLLARI,
  STRATEJI_SAYFA_IZNI,
  VARLIKLAR_IZNI,
  ayarlarYolu,
  type AyarlarSekmeKodu,
  type Permission,
} from '@advetics/shared';
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
/** Kenar çubuğunda tek satıra inen bölümün adı. */
export const AYARLAR_BOLUMU = 'Ayarlar';

/**
 * Ayarlar sekmelerindeki KISA ad. Menü etiketi sayfa başlığıyla aynı kalıyor
 * (`nav-sections.spec.ts`); sekme çubuğunda "Platform Bağlantıları ·
 * Senkronizasyon Durumu · E-posta Ayarları" yan yana sığmıyor ve "Ayarlar"
 * sekmesinin içinde "Ayarları" demek tekrar.
 */
const AYAR_KISA_AD_ESKI: Record<string, string> = {
  '/ayarlar/baglantilar': 'Bağlantılar',
  '/ayarlar/senkronizasyon': 'Senkronizasyon',
  '/ayarlar/e-posta': 'E-posta',
  '/ayarlar/ekip': 'Ekip',
  '/ayarlar/okuma-api': 'Okuma API',
};

/** Yeni dört sekmenin kısa adı — sözleşmeden (`AYARLAR_SEKMELERI.kisaAd`). */
const AYAR_KISA_AD_YENI: Record<string, string> = Object.fromEntries(
  AYARLAR_SEKMELERI.map((s) => [s.yol, s.kisaAd]),
);

/**
 * ═══ YEDİ BÖLÜM, İŞİN SIRASIYLA (2026-10-09, kullanıcı kararı) ═══
 *
 * Genel Bakış · Planla · Oluştur · Yönet · İyileştir · Raporlar · Base
 * (+ en altta Ayarlar). Plan: `docs/URUN-YAPISI-PLANI.md`. Adlar TÜRKÇE
 * (CLAUDE.md: "OPTIMISE gibi terimler panelde geçmiyor"); "Base" onaylanmış
 * istisna. Bölümler bir reklamın hayatını sırayla izliyor: önce planla,
 * sonra kur, sonra yönet, sonra iyileştir, sonra raporla.
 *
 * YALNIZCA EKRANI OLAN SATIR. Planın saydığı A/B testi, kreatif yorgunluğu,
 * AI Asistan gibi ekranlar yazılınca gelecek; ekranı olmayan soluk satır
 * 2026-09'da yedi tane birikmişti ve temizlendi (`nav-sections.spec.ts`
 * "ölü satır yok" diye kilitliyor).
 *
 * MÜŞTERİ HESABI HÂLÂ DÖRT EKRAN görüyor: Genel Bakış, AdvStrategy
 * (Planla), Reklam Yöneticisi (Yönet), Raporlar. Değişen yalnızca başlıklar;
 * Oluştur, İyileştir ve Base'in her satırı müşteride olmayan bir yetki
 * taşıyor (süzme opt-in: yetkisiz satır herkese görünür).
 */
function bolumleriKur(
  BASE_SATIRLARI: NavEntry[],
  AYARLAR_SATIRLARI: NavEntry[],
): Array<{ title?: string; items: NavEntry[] }> {
  return [
  {
    // BAŞLIKSIZ — katlanamaz. Günlük iş burada başlıyor.
    items: [
      { href: '/dashboard', label: 'Genel Bakış', icon: 'overview', module: 1, perm: 'insights.read' },
    ],
  },
  {
    /*
     * PLANLA — OLUŞTUR'DAN HEMEN ÖNCE. AdvStrategy'de onaylanan plan
     * AdvCampaign'e aktarılıyor; iki ekran aynı işin ardışık adımları ve
     * menüde de art arda duruyorlar (eskiden aynı bölümde alt alta).
     */
    title: 'Planla',
    items: [
      /*
       * İZİN SÖZLEŞMEDEN (`STRATEJI_SAYFA_IZNI`), elle yazılmıyor: sayfa
       * kapısı aynı sabiti okuyor ve ikisi ayrışırsa menüde görünüp
       * açılmayan bir satır doğar. MÜŞTERİ HESABI BU SATIRI GÖRÜYOR (Ç-5,
       * 2026-10-08): planı panelin içinde ONAYLIYOR, yazamıyor.
       */
      {
        href: '/strateji',
        label: 'AdvStrategy',
        icon: 'plan',
        module: 4,
        ready: true,
        perm: STRATEJI_SAYFA_IZNI,
      },
      /*
       * AYLIK BÜTÇE PLANLA'DA (2026-10-09, kullanıcı: "bütçe Planla'da
       * olsun"). 2026-10-06'dan beri Marka Merkezi'nin bir bölümüydü; eski
       * `?bolum=butce` adresi buraya yönleniyor.
       *
       * `budget.write`, `budget.read` DEĞİL: müşteri hesabı `budget.read`
       * taşıyor (Genel Bakış'taki bütçe tüketimi onunla okunuyor), ama bu
       * ekran bütçe BELİRLEME yeri; okuma yetkisiyle menüden açmak müşteriyi
       * kaydedemeyeceği bir forma götürürdü.
       */
      { href: '/butce', label: 'Aylık Bütçe', icon: 'budget', module: 5, ready: true, perm: 'budget.write' },
    ],
  },
  {
    title: 'Oluştur',
    items: [
      /*
       * AKILLI BOOST OLUŞTUR'UN İLK SATIRI VE ÖNE ÇIKARILMIŞ (2026-09-30'dan
       * beri reklam bölümünün vurgulu satırı; kullanıcının listesinde
       * "Ad Boost" Oluştur'un içinde). `vurgu` yalnızca görünüş.
       */
      {
        href: '/auto-boost',
        label: 'Akıllı Boost',
        icon: 'boost',
        module: 7,
        ready: true,
        perm: 'boost.read',
        vurgu: 'Otomatik',
      },
      /*
       * ADVCAMPAIGN — reklam kurmanın TEK yolu (kullanıcı kararı
       * 2026-10-07). `bulk.write`: sayfanın kendi kapısıyla aynı anahtar,
       * ayrışırsa menüde görünüp açılmayan bir satır olur.
       */
      {
        href: '/reklam',
        label: 'AdvCampaign',
        icon: 'create',
        module: 4,
        ready: true,
        perm: 'bulk.write',
      },
    ],
  },
  {
    /*
     * YÖNET — yayındakini izleme ve gelen sonuçla çalışma. Reklam
     * Yöneticisi (2026-10-09, eski adı Reklam Keşfi) şirketten reklama inen
     * tablo; satır içi durdur/başlat/bütçe sonraki adım. MÜŞTERİ HESABI
     * Reklam Yöneticisi'ni görüyor (yalnız kendi workspace'i).
     */
    title: 'Yönet',
    items: [
      { href: '/ads-explorer', label: 'Reklam Yöneticisi', icon: 'explorer', module: 4, perm: 'insights.read' },
      /*
       * POTANSİYEL MÜŞTERİLER RAPORLAR'DAN GELDİ: form reklamından düşen
       * kişiler bir rapor değil, aranacak bir iş listesi.
       */
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
    /*
     * İYİLEŞTİR — TEK SATIR, TEK SAYFA (Aşama 4, 2026-10-09). Öneriler, AI
     * Asistan ve Kurallar aynı sayfanın sekmeleri (`/iyilestir?sekme=`);
     * `/kurallar` oraya yönleniyor.
     *
     * `rule.read`: sayfa kapısıyla AYNI anahtar. Müşteri hesabı bu yetkiyi
     * taşımıyor ve İyileştir'i görmüyor (MIMARI §5, dört ekran kilidi).
     */
    title: 'İyileştir',
    items: [{ href: '/iyilestir', label: 'İyileştir', icon: 'health', module: 5, ready: true, perm: 'rule.read' }],
  },
  {
    title: 'Raporlar',
    items: [
      /*
       * ═══ RAPORLARIN TEK GİRİŞİ ═══
       *
       * Rapor, şablon ve faturalar AYNI belgenin parçası; ayrı sayfalara
       * bölünmeleri gerçek bir hata üretiyordu (şablon düzenlemesi seçicide
       * kayboluyordu). Üçü `/raporlar` içinde; yetki süzgeci sayfanın İÇİNDE
       * (`report.write` şablon, `report.share` fatura).
       */
      { href: '/raporlar', label: 'Raporlar', icon: 'reports', module: 6, perm: 'report.read' },
    ],
  },
  {
    /*
     * "KÜTÜPHANE" DEĞİL "BASE" (kullanıcı kararı, 2026-10-06). 2026-10-06 ile
     * 2026-10-13 arası tek kapı Marka Merkezi'ydi; 2026-10-13'ten beri İKİ
     * SATIR: Marka Merkezi (seçili workspace'in kurulumu, markası, bilgileri)
     * ve Varlıklar (görsel, kreatif, form, kitle). Satırlar aşağıda
     * `BASE_SATIRLARI_YENI`.
     *
     * ŞİRKET GENELİNDEKİ EKİP EKRANI BURAYA GELMEDİ (2026-10-09): bir
     * workspace'i kimin gördüğü Marka Merkezi › Workspace bilgileri'nde salt
     * okunur yazıyor, yönetimi Ayarlar › Ekip ve güvenlik'te; Ayarlar'daki
     * ekran bütün şirketin kullanıcı ve yetkilerini değiştiriyor ve bir
     * workspace'e bakan ekranda durması kapsamı yanlış anlatırdı.
     *
     * İZİN `client.write`, `client.read` DEĞİL: müşteri hesabı `client.read`
     * taşıyor ve menüsü dört ekranla sınırlı.
     */
    title: 'Base',
    items: BASE_SATIRLARI,
  },
  {
    /*
     * AJANS İŞİ. `client.read` KULLANILMIYOR: client_viewer'da var (kendi
     * müşterisini okuyabilmeli), ayırt eden şey yönetim yetkisi.
     *
     * KENAR ÇUBUĞUNDA TEK SATIR, SAYFADA SEKME (2026-09-30). Bu bölüm
     * yedi satırdı ve menünün yarısını kaplıyordu; kullanıcının isteği
     * *"sidebar'ı sadeleştirebildiğin kadar sadeleştir"*. Liste YETKİNİN
     * TEK KAYNAĞI olarak burada duruyor (rol matrisi testleri bunu
     * kilitliyor); kenar çubuğu bölümü tek bir "Ayarlar" satırına
     * indiriyor (`kenarBolumleri`), `ayarlar/layout.tsx` aynı süzülmüş
     * listeyi sekme olarak çiziyor. İki ayrı liste yazmak, bir sayfanın
     * menüde görünüp sekmede görünmemesi demekti.
     *
     * "Kurulum Sihirbazı" bu bölümden KALKTI: oluşturma düğmeleri zaten
     * Şirketler ve Üst Hesaplar sayfasında ve sihirbaz oradan açılıyor.
     */
    title: AYARLAR_BOLUMU,
    items: AYARLAR_SATIRLARI,
  },
  ];
}


// ═════════════════════════════════════════════════════════════════════════════
// BASE VE AYARLAR SATIRLARI — ESKİ ve YENİ (Ayarlar ve Marka Merkezi
// sadeleştirme, docs/panel-sadelestirme/MIMARI.md)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * ═══ YENİ BASE: MARKA MERKEZİ + VARLIKLAR (Karar B, kullanıcı 2026-10-13) ═══
 *
 * "Base'in tek kapısı Marka Merkezi" kararı DEĞİŞTİ: Varlıklar (görseller,
 * kreatifler, formlar, kitleler) reklam kurarken her gün açılan malzeme ve
 * bir kurulum ekranının iç menüsünde duruyordu. Marka Merkezi artık YALNIZ
 * seçili workspace'in kurulumu, markası ve bilgileri.
 *
 * İzinler SÖZLEŞMEDEN (`MARKA_MERKEZI_IZNI`, `VARLIKLAR_IZNI`): sayfa
 * kapısı aynı sabiti okuyor ve ikisi ayrışırsa menüde görünüp açılmayan bir
 * satır doğar. İkisi de müşteri hesabında YOK (dört ekran kilidi).
 */
export const BASE_SATIRLARI_YENI: NavEntry[] = [
  {
    href: PANEL_YOLLARI.markaMerkezi,
    label: 'Marka Merkezi',
    icon: 'brand',
    module: 1,
    ready: true,
    perm: MARKA_MERKEZI_IZNI,
  },
  {
    href: PANEL_YOLLARI.varliklar,
    label: 'Varlıklar',
    icon: 'assets',
    module: 1,
    ready: true,
    perm: VARLIKLAR_IZNI,
  },
];

/**
 * ESKİ AYARLAR — yedi sekme. Ajan 2 yeni sayfaları yazıp
 * `AYARLAR_SATIRLARI`nı çevirince bu sabit SİLİNİR.
 */
const AYARLAR_SATIRLARI_ESKI: NavEntry[] = [
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
        // Workspace ekip/kanal alt sayfaları Şirketler sekmesinin altında.
        ekYollar: ['/ayarlar/musteriler'],
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
        ustHesapUyeligi: true,
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
      {
        /*
         * OKUMA API — YALNIZCA PLATFORM SAHİBİ (kullanıcı isteği,
         * 2026-10-08: "sadece bu hesapla giriş yaptığımda ayarlarda API
         * kontrol paneli olsun"). Bir YETKİ ANAHTARI DEĞİL bayrak: Sahip
         * bir rol değil ve bütün izinleri taşıyan bir şirket admini bile bu
         * satırı görmemeli. Sayfa kapısı ve API aynı bayrağı ayrıca okuyor;
         * menüden gizlemek tek başına koruma değil.
         */
        href: '/ayarlar/okuma-api',
        label: 'Okuma API',
        icon: 'ai',
        module: 1,
        ready: true,
        platformSahibi: true,
      },
    ];

const SEKME_IKONU: Record<AyarlarSekmeKodu, NavEntry['icon']> = {
  sirketler: 'clients',
  baglantilar: 'plug',
  ekip: 'team',
  hesabim: 'settings',
};

/**
 * ═══ YENİ AYARLAR: DÖRT SEKME, SÖZLEŞMEDEN (`AYARLAR_SEKMELERI`) ═══
 *
 * Menü bölümüne YALNIZ yetkili üç sekme giriyor. HESABIM GİRMİYOR: izni
 * yok (herkesin kendi sayfası) ve süzme opt-in olduğu için müşteri hesabına
 * bütün "Ayarlar" bölümünü açardı — dört ekran kilidi düşerdi. Hesabım'ın
 * kapısı kenar çubuğundaki ad kartı; sekme çubuğuna `ayarSekmeleri` ekliyor.
 *
 * Üst Hesaplar, Senkronizasyon, E-posta ve Okuma API AYRI SATIR DEĞİL:
 * sırasıyla Şirketler'in, Marka Merkezi › Workspace bilgileri'nin ve
 * Hesabım'ın içinde.
 */
export const AYARLAR_SATIRLARI_YENI: NavEntry[] = AYARLAR_SEKMELERI.flatMap((s) =>
  s.izin === null
    ? []
    : [
        {
          href: s.yol,
          label: s.ad,
          icon: SEKME_IKONU[s.kod],
          module: 1,
          ready: true,
          perm: s.izin,
        },
      ],
);

/** Hesabım sekmesi — herkese açık, menü bölümünün DIŞINDA (yukarıya bkz.). */
export const HESABIM_SATIRI: NavEntry = {
  href: ayarlarYolu('hesabim'),
  label: 'Hesabım',
  icon: SEKME_IKONU.hesabim,
  module: 1,
  ready: true,
};

/*
 * ═══ GEÇİŞ ANAHTARLARI — HER AJAN YALNIZ KENDİ SATIRINI ÇEVİRİR ═══
 *
 * Yeni sayfalar yazılmadan yeni satırı menüye koymak, menüde 404 veren bir
 * satır demekti (`nav-sections.spec.ts` sayfanın varlığını ve başlığını
 * tarıyor ve kırmızı olurdu). Ajan 2 Ayarlar sayfalarını, Ajan 3 Marka
 * Merkezi + Varlıklar'ı bitirince KENDİ satırını `_YENI`ye çevirir ve
 * `_ESKI` sabitini siler. Ajan 4'ün kapısı: ikisi de çevrilmiş, `_ESKI`
 * yok (`nav-hedef.spec.ts`).
 */
const BASE_SATIRLARI: NavEntry[] = BASE_SATIRLARI_YENI; // Ajan 3 çevirdi (2026-10-13)
const AYARLAR_SATIRLARI: NavEntry[] = AYARLAR_SATIRLARI_ESKI; // Ajan 2 → AYARLAR_SATIRLARI_YENI

/** Bugün kullanılan menü (geçiş anahtarlarına göre). */
export const SECTIONS: Array<{ title?: string; items: NavEntry[] }> = bolumleriKur(BASE_SATIRLARI, AYARLAR_SATIRLARI);

/**
 * HEDEF MENÜ — iki geçiş de yapılmış hâli. Testler yeni yapının kararlarını
 * (dört ekran kilidi, Base'in iki satırı, sekme izinleri) sayfalar
 * yazılmadan ÖNCE bunun üzerinde kilitliyor.
 */
export const SECTIONS_HEDEF: Array<{ title?: string; items: NavEntry[] }> = bolumleriKur(
  BASE_SATIRLARI_YENI,
  AYARLAR_SATIRLARI_YENI,
);

/** Geçiş yapıldı mı — testler ve `ayarSekmeleri` okuyor. */
export const GECIS = {
  ayarlar: (AYARLAR_SATIRLARI as NavEntry[]) === AYARLAR_SATIRLARI_YENI,
  base: (BASE_SATIRLARI as NavEntry[]) === BASE_SATIRLARI_YENI,
} as const;

/** Ayarlar sekmelerinin kısa adı — geçişle birlikte kendiliğinden değişir. */
export const AYAR_KISA_AD: Record<string, string> = GECIS.ayarlar ? AYAR_KISA_AD_YENI : AYAR_KISA_AD_ESKI;

/**
 * Ayarlar sekme çubuğunun listesi: menüyle AYNI süzülmüş satırlar + (yeni
 * yapıda) Hesabım. `ayarlar/layout.tsx` bunu okuyor; ayrı bir liste yazmak,
 * bir ekranın menüde görünüp sekmede görünmemesi demekti.
 */
export function ayarSekmeleri(
  ayarlar: NavEntry[],
): Array<{ href: string; ekYollar: readonly string[]; ad: string }> {
  const satirlar = GECIS.ayarlar ? [...ayarlar, HESABIM_SATIRI] : ayarlar;
  return satirlar.map((a) => ({
    href: a.href,
    ekYollar: a.ekYollar ?? [],
    ad: AYAR_KISA_AD[a.href] ?? a.label,
  }));
}

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
  /*
   * ZORUNLU PARAMETRE, VARSAYILANSIZ. Varsayılanı `false` olsaydı onu
   * geçirmeyi unutan bir çağıran ajans yöneticisinden "Üst Hesaplar"ı
   * sessizce gizlerdi; `true` olsaydı müşteri adminine geri getirirdi.
   * İkisi de derlemede görünmezdi.
   */
  baglam: { ustHesapGorunur: boolean; platformSahibi: boolean },
): Array<{ title?: string; items: NavEntry[] }> {
  return bolumleriSuz(SECTIONS, permissions, baglam);
}

/** Hedef menünün görünürlüğü — yalnız testler (`nav-hedef.spec.ts`). */
export function hedefGorunurBolumler(
  permissions: readonly Permission[],
  baglam: { ustHesapGorunur: boolean; platformSahibi: boolean },
): Array<{ title?: string; items: NavEntry[] }> {
  return bolumleriSuz(SECTIONS_HEDEF, permissions, baglam);
}

function bolumleriSuz(
  bolumler: Array<{ title?: string; items: NavEntry[] }>,
  permissions: readonly Permission[],
  baglam: { ustHesapGorunur: boolean; platformSahibi: boolean },
): Array<{ title?: string; items: NavEntry[] }> {
  const izinli = new Set(permissions);
  const gorunur = (i: NavEntry): boolean =>
    (!i.perm || izinli.has(i.perm)) &&
    (!i.ustHesapUyeligi || baglam.ustHesapGorunur) &&
    (!i.platformSahibi || baglam.platformSahibi);
  return bolumler.map((s) => ({
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

/**
 * Kenar çubuğunun çizeceği hâl: Ayarlar bölümü AYRI dönüyor, kenar çubuğu
 * onu en altta tek satır olarak gösteriyor. Görünür ayar sayfası yoksa
 * (müşteri hesabı) satır hiç çizilmiyor: tıklayınca 403 veren bir kapı
 * göstermek, rol matrisinin önlemek istediği şeyin ta kendisi.
 */
export function kenarBolumleri(bolumler: Array<{ title?: string; items: NavEntry[] }>): {
  bolumler: Array<{ title?: string; items: NavEntry[] }>;
  ayarlar: NavEntry[];
} {
  return {
    bolumler: bolumler.filter((b) => b.title !== AYARLAR_BOLUMU),
    ayarlar: bolumler.find((b) => b.title === AYARLAR_BOLUMU)?.items ?? [],
  };
}
