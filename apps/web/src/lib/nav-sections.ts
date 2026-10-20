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
import { ayarSekmesiAdi, sec, type Dil } from '@advetics/shared';
import { menuSozlugu } from '@/dil/sozlukler/menu';

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
 * Ayarlar sekmelerindeki KISA ad — sözleşmeden (`AYARLAR_SEKMELERI.kisaAd`).
 * Menü etiketi sayfa başlığıyla aynı kalıyor (`nav-sections.spec.ts`);
 * sekme çubuğunda "Şirketler ve workspace’ler" gibi uzun adlar dar ekranda
 * sığmıyor.
 */
const AYAR_KISA_AD_YENI: Record<string, string> = Object.fromEntries(
  AYARLAR_SEKMELERI.map((s) => [s.yol, s.kisaAd]),
);

/**
 * ═══ YEDİ BÖLÜM, SIK KULLANILAN ÜSTTE (2026-10-20) ═══
 *
 * Genel Bakış · Yönet · Oluştur · Planla · İyileştir · Raporlar · Base
 * (+ en altta Ayarlar). 2026-10-09'da bölümler bir reklamın hayatını
 * sırayla izliyordu (Planla · Oluştur · Yönet …); 2026-10-20'de günlük
 * iş (Yönet, Oluştur) öne alındı. Plan: `docs/URUN-YAPISI-PLANI.md`. Adlar TÜRKÇE
 * (CLAUDE.md: "OPTIMISE gibi terimler panelde geçmiyor"); "Base" onaylanmış
 * istisna.
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
     * YÖNET — GENEL BAKIŞ'IN HEMEN ALTINDA (2026-10-20, Armağan'ın
     * görevi): panelin en sık açılan ekranı Reklam Yöneticisi ve
     * "hayat sırası"nın sonunda kalınca her girişte aşağı inmek gerekiyordu.
     * Yayındakini izleme ve gelen sonuçla çalışma. Reklam
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
    title: 'Oluştur',
    items: [
      /*
       * KAMPANYA OLUŞTUR — reklam kurmanın TEK yolu (kullanıcı kararı
       * 2026-10-07) ve 2026-10-20'den beri bölümün İLK satırı. Ekranın ürün
       * adı AdvCampaign; menüde ne yaptığını söyleyen ad duruyor (kullanıcı
       * kararı 2026-10-20), sayfa başlığı da menüden geldiği için aynı. `bulk.write`: sayfanın kendi kapısıyla aynı anahtar,
       * ayrışırsa menüde görünüp açılmayan bir satır olur.
       */
      {
        href: '/reklam',
        label: 'Kampanya Oluştur',
        icon: 'create',
        module: 4,
        ready: true,
        perm: 'bulk.write',
      },
      /*
       * BOOST KAMPANYASI (2026-10-20'ye kadar adı "Akıllı Boost" ve
       * bölümün ilk satırıydı). Kampanya Oluştur'un ALTINDA ama hâlâ
       * vurgulu: otomatik çalışan tek yol olduğunu "Otomatik" rozeti
       * söylüyor. `vurgu` yalnızca görünüş.
       */
      {
        href: '/auto-boost',
        label: 'Boost Kampanyası',
        icon: 'boost',
        module: 7,
        ready: true,
        perm: 'boost.read',
        vurgu: 'Otomatik',
      },
    ],
  },
  {
    /*
     * PLANLA — OLUŞTUR'DAN HEMEN SONRA (2026-10-20). 2026-10-09'dan beri
     * Oluştur'dan önceydi (plan önce, kurulum sonra); kullanıcı günlük işi
     * öne aldı: Yönet ve Oluştur üstte, Planla onların altında.
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
const AYARLAR_SATIRLARI: NavEntry[] = AYARLAR_SATIRLARI_YENI; // Ajan 2 çevirdi (2026-10-13)

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

/** Ayarlar sekmelerinin kısa adı (sekme çubuğu). */
export const AYAR_KISA_AD: Record<string, string> = AYAR_KISA_AD_YENI;

/**
 * Ayarlar sekme çubuğunun listesi: menüyle AYNI süzülmüş satırlar + (yeni
 * yapıda) Hesabım. `ayarlar/layout.tsx` bunu okuyor; ayrı bir liste yazmak,
 * bir ekranın menüde görünüp sekmede görünmemesi demekti.
 */
export function ayarSekmeleri(
  ayarlar: NavEntry[],
  dil: Dil = 'tr',
): Array<{ href: string; ekYollar: readonly string[]; ad: string }> {
  const satirlar = GECIS.ayarlar ? [...ayarlar, HESABIM_SATIRI] : ayarlar;
  return satirlar.map((a) => {
    const sekme = AYARLAR_SEKMELERI.find((s) => s.yol === a.href);
    return {
      href: a.href,
      ekYollar: a.ekYollar ?? [],
      ad: sekme ? ayarSekmesiAdi(sekme.kod, dil, true) : (AYAR_KISA_AD[a.href] ?? a.label),
    };
  });
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
/**
 * MENÜYÜ EKRANIN DİLİNE ÇEVİRİR (D2). Tanım Türkçe kalıyor; ekrana giden
 * her bölüm/satır buradan geçer. Sözlükte karşılığı olmayan Türkçe etiket
 * HATA VERİR: menüye yeni satır ekleyip sözlüğü unutmak İngilizce menüde
 * sessizce Türkçe satır demekti. Ürün adları (`AYNI_KALANLAR`) olduğu gibi.
 * Ayarlar satırları shared'daki sekme adından (`ayarSekmesiAdi`).
 */
const AYNI_KALANLAR = new Set(['AdvStrategy', 'Base']);

export function menuEtiketiCevir(
  tur: 'bolum' | 'satir' | 'vurgu',
  etiket: string,
  dil: Dil,
  href?: string,
): string {
  if (dil === 'tr' || AYNI_KALANLAR.has(etiket)) return etiket;
  const sekme = href ? AYARLAR_SEKMELERI.find((s) => s.yol === href) : undefined;
  if (tur === 'satir' && sekme) return ayarSekmesiAdi(sekme.kod, dil);
  const tablo = sec(menuSozlugu, dil)[tur] as Record<string, string>;
  const ceviri = tablo[etiket];
  if (ceviri === undefined) throw new Error(`menu sozlugunde yok: ${tur} "${etiket}"`);
  return ceviri;
}

/**
 * Menüdeki satırın ADI, adresinden bulunarak ve ekranın dilinde. Sayfa
 * kendi başlığını buradan alırsa ad iki dilde de menüyle aynı olur ve
 * sayfa dosyasında Türkçe bir anahtar dize durmaz. Menüde olmayan adres
 * PATLAR (sessizce boş başlık çizmek yerine).
 */
export function menuSatiriEtiketi(href: string, dil: Dil): string {
  const satir = [...SECTIONS_HEDEF.flatMap((b) => b.items), HESABIM_SATIRI].find((i) => i.href === href);
  if (!satir) throw new Error(`menude yok: ${href}`);
  return menuEtiketiCevir('satir', satir.label, dil, href);
}

/**
 * Menü satırının BÖLÜMÜNÜN adı (sayfa başlığının üstündeki "Yönet" gibi),
 * adresinden bulunarak ve ekranın dilinde. Sayfa bölüm adını elle yazınca
 * menüde satır başka bölüme taşındığında başlık eski bölümü söylemeye devam
 * ediyordu; ad buradan gelirse ikisi ayrışamaz. Menüde olmayan adres PATLAR.
 */
export function menuBolumuEtiketi(href: string, dil: Dil): string {
  const bolum = SECTIONS_HEDEF.find((b) => b.items.some((i) => i.href === href));
  if (!bolum?.title) throw new Error(`menude bolumu yok: ${href}`);
  return menuEtiketiCevir('bolum', bolum.title, dil);
}

export function menuyuCevir(
  bolumler: Array<{ title?: string; items: NavEntry[] }>,
  dil: Dil,
): Array<{ title?: string; items: NavEntry[] }> {
  if (dil === 'tr') return bolumler;
  const satir = (i: NavEntry): NavEntry => ({
    ...i,
    label: menuEtiketiCevir('satir', i.label, dil, i.href),
    ...(i.vurgu ? { vurgu: menuEtiketiCevir('vurgu', i.vurgu, dil) } : {}),
    ...(i.children ? { children: i.children.map(satir) } : {}),
  });
  return bolumler.map((b) => ({
    // Başlık AYARLAR_BOLUMU olarak kalmalı: `kenarBolumleri` Ayarlar'ı başlığından buluyor.
    title: b.title && b.title !== AYARLAR_BOLUMU ? menuEtiketiCevir('bolum', b.title, dil) : b.title,
    items: b.items.map(satir),
  }));
}

export function kenarBolumleri(bolumler: Array<{ title?: string; items: NavEntry[] }>): {
  bolumler: Array<{ title?: string; items: NavEntry[] }>;
  ayarlar: NavEntry[];
} {
  return {
    bolumler: bolumler.filter((b) => b.title !== AYARLAR_BOLUMU),
    ayarlar: bolumler.find((b) => b.title === AYARLAR_BOLUMU)?.items ?? [],
  };
}
