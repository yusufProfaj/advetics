import type { HazirlamaAdimKodu, HazirlamaYaniti } from '../hazirlama';
import type { KurulumAdimKodu, KurulumPlatformu, KurulumYaniti } from '../kurulum';
import type { HazirlikKodu, WorkspaceHazirlik } from '../schemas/hazirlik.schema';
import type { MARKA_MERKEZI_CAPALARI } from './adresler';

/**
 * ═══ KURULUM — TEK SIRALI LİSTE, TEK SAYAÇ ═══
 *
 * Bugün bir workspace'in "hazır mı" sorusunu ÜÇ ayrı liste cevaplıyor ve
 * üçü de Marka Merkezi'nde aynı anda görünüyor:
 *
 *   · Hazırlık şeridi (`/clients/:id/hazirlik`, 7 madde) — her bölümün üstünde,
 *   · Kurulum bölümü (`/clients/:id/kurulum`, 15 adım, kendi sayacı),
 *   · Hazır workspace kartı (`/clients/:id/hazirlama`, 7 adım + sorular).
 *
 * "Logo" hazırlık şeridinde, "marka" kurulumda, "kategori" hazırlama
 * kartında ve Workspace ayarlarında; kullanıcı üç sayaç görüyor ve
 * hangisinin "bitti" dediğine inanacağını bilmiyor. Kural 3 (kullanıcının
 * onayı): kurulum TEK liste, TEK sayaç, "Eksikleri tamamla" TEK düğme.
 *
 * ÜÇ UÇ DURUYOR, DEĞİŞMİYOR. Liste onların yanıtlarını BİRLEŞTİRİYOR; her
 * adımın altında hangi parçadan oluştuğu ve her parçanın kendi `neden`i
 * görünür. Yeni bir uç yazmak, üç kaynağın dördüncü bir kopyasını yazmak
 * olurdu.
 *
 * BU DOSYA SAF: girdi üç yanıt + kullanılmayan platformlar, çıktı yedi adım.
 * Panelde bileşen render eden test altyapısı yok; karar burada sınanıyor.
 */

/*
 * Kullanıcının "bu platformu bu workspace'te kullanmıyorum" beyanı:
 * `KURULUM_PLATFORMLARI` / `KurulumPlatformu` kurulum sözleşmesinde
 * (`../kurulum`), çünkü kurulum ucunun yanıtı onu taşıyor.
 */

/**
 * Bir adımı oluşturan parça. `kaynak` hangi uçtan okunacağını, `platform`
 * dolu ise o platform kullanılmıyorsa parçanın DÜŞTÜĞÜNÜ söylüyor.
 */
type Parca =
  | { kaynak: 'kurulum'; kod: KurulumAdimKodu; platform?: KurulumPlatformu }
  | { kaynak: 'hazirlama'; kod: HazirlamaAdimKodu; platform?: KurulumPlatformu }
  | { kaynak: 'hazirlik'; kod: HazirlikKodu; platform?: KurulumPlatformu };

/**
 * ═══ YEDİ ADIM, SIRAYLA (kullanıcının onayladığı sıra) ═══
 *
 * Sıra İŞİN sırası: hesap olmadan piksel, piksel olmadan ölçüm, marka
 * olmadan varsayılan yok. Adım `platform` taşıyorsa ve o platform
 * kullanılmıyorsa adım BÜTÜNÜYLE sayaçtan düşer ("Kullanılmıyor").
 *
 * BİLEREK DIŞARIDA KALANLAR (sayaca girmiyor):
 *   · `aylik_butce` (hazırlık) — her ay yenilenen bir PLAN kararı, kurulum
 *     değil; sayaca girseydi her ayın 1'inde bütün workspace'ler "eksik"
 *     derdi. Evi Planla › Aylık Bütçe.
 *   · `veri_akisi` (hazırlık) — bir DURUM, yapılacak iş değil; evi
 *     Workspace bilgileri › Veri durumu.
 *   · `reklam_hesabi`, `reklam_hazirligi` (hazırlık), `marka` (kurulum) —
 *     başka parçaların TOPLAMI; listeye koymak aynı eksiği iki kez saymak.
 *   · `sosyal_kanal` (hazırlık) — YouTube'u da sayıyor; "Facebook sayfası ve
 *     Instagram" adımının ölçüsü kurulumun `sayfa` adımı.
 *   · Diğer veri kaynakları (Search Console, e-ticaret) — isteğe bağlı,
 *     listenin altında ayrı blok.
 */
export const KURULUM_LISTESI = [
  {
    kod: 'meta',
    ad: 'Meta reklam hesabı ve ödeme',
    platform: 'meta',
    parcalar: [
      { kaynak: 'kurulum', kod: 'meta_hesap' },
      { kaynak: 'kurulum', kod: 'meta_odeme' },
    ],
  },
  {
    kod: 'sayfa',
    ad: 'Facebook sayfası ve Instagram',
    platform: 'meta',
    parcalar: [{ kaynak: 'kurulum', kod: 'sayfa' }],
  },
  {
    kod: 'piksel',
    ad: 'Meta pikseli',
    platform: 'meta',
    parcalar: [
      { kaynak: 'kurulum', kod: 'meta_piksel' },
      // İki aday piksel varsa soru burada; cevap kurulumun seçimini de besliyor.
      { kaynak: 'hazirlama', kod: 'piksel' },
    ],
  },
  {
    kod: 'google',
    ad: 'Google Ads hesabı ve ödeme',
    platform: 'google',
    parcalar: [
      { kaynak: 'kurulum', kod: 'google_hesap' },
      { kaynak: 'kurulum', kod: 'google_odeme' },
    ],
  },
  {
    /*
     * BUGÜNKÜ "ÖLÇÜM" BÖLÜMÜ BURAYA KATLANIYOR. Analytics (GA4) TEK KAYIT:
     * kurulumun `ga4_mulk`ü. Veri kaynaklarındaki GA4 bağlantısı ayrı bir
     * form olarak GÖSTERİLMEZ — kurulum mülkü seçince `kurulumdanBagla`
     * zaten bağlıyor; ikinci form aynı mülk için ikinci bir doğru üretirdi.
     *
     * Google'a özgü parçalar Google kullanılmıyorsa düşüyor; Tag Manager,
     * Analytics, etiketler, site kodu ve doğrulama Meta pikseli için de
     * gerekiyor ve kalıyor.
     */
    kod: 'olcum',
    ad: 'Dönüşüm ölçümü',
    platform: null,
    parcalar: [
      { kaynak: 'kurulum', kod: 'google_izin' },
      { kaynak: 'kurulum', kod: 'gtm_konteyner' },
      { kaynak: 'kurulum', kod: 'ga4_mulk' },
      { kaynak: 'kurulum', kod: 'ads_donusum', platform: 'google' },
      { kaynak: 'kurulum', kod: 'ga4_ads_bag', platform: 'google' },
      { kaynak: 'kurulum', kod: 'gtm_etiket' },
      { kaynak: 'kurulum', kod: 'site_kodu' },
      { kaynak: 'kurulum', kod: 'dogrulama' },
      { kaynak: 'hazirlama', kod: 'olcum' },
    ],
  },
  {
    /* Marka bölümüne GÖTÜRÜR; alanlar orada düzenlenir (evi Marka). */
    kod: 'marka',
    ad: 'Marka bilgileri ve logo',
    platform: null,
    parcalar: [
      { kaynak: 'hazirlama', kod: 'site' },
      { kaynak: 'hazirlama', kod: 'marka' },
      { kaynak: 'hazirlik', kod: 'marka_bilgisi' },
      { kaynak: 'hazirlik', kod: 'logo' },
    ],
  },
  {
    /*
     * BUGÜNKÜ HAZIR WORKSPACE KARTININ SORULARI + Workspace ayarlarındaki
     * özel kategori seçicisi. Üç alanın EVİ burası: özel reklam kategorisi,
     * varsayılan konum/kitle, varsayılan günlük bütçe.
     */
    kod: 'varsayilanlar',
    ad: 'Reklam varsayılanları',
    platform: null,
    parcalar: [
      { kaynak: 'hazirlama', kod: 'kategori' },
      { kaynak: 'hazirlama', kod: 'konum' },
      { kaynak: 'hazirlama', kod: 'butce' },
    ],
  },
] as const satisfies ReadonlyArray<{
  kod: (typeof MARKA_MERKEZI_CAPALARI)['kurulum'][number];
  ad: string;
  platform: KurulumPlatformu | null;
  parcalar: readonly Parca[];
}>;

export type KurulumListesiKodu = (typeof KURULUM_LISTESI)[number]['kod'];

/**
 * Adımın birleşik durumu.
 *
 *   · `tamam`          — her parça tamam.
 *   · `hata`           — bir parça platformdan hata aldı (mesajı parçada).
 *   · `soru`           — panelde cevaplanacak bir soru var (piksel adayı, kategori…).
 *   · `eksik`          — sistem yapabilir: "Eksikleri tamamla" ya da tek tık.
 *   · `kullanicida`    — sistem YAPAMAZ: ödeme yöntemi, site kodu, platformda iş.
 *   · `bilinmiyor`     — bir kaynak okunamadı; "eksik" DEĞİL (CLAUDE.md:
 *                        görünmeyen satırı "yok" saymak yanlış alarm üretir).
 *   · `bekliyor`       — önceki adım bitmeden yapılamıyor (kurulumun `atlandi`).
 *   · `kullanilmiyor`  — kullanıcı bu platformu kullanmadığını söyledi; sayaca girmez.
 *
 * ÖNCELİK SIRASI (aynı adımda birden çok parça farklıysa): hata > soru >
 * eksik > kullanicida > bilinmiyor > bekliyor. Kesin bir eksik, okunamayan
 * bir parçadan daha bilgilendirici: biri eksikse adım zaten bitmemiş.
 */
export const KURULUM_LISTESI_DURUMLARI = [
  'tamam',
  'hata',
  'soru',
  'eksik',
  'kullanicida',
  'bilinmiyor',
  'bekliyor',
  'kullanilmiyor',
] as const;
export type KurulumListesiDurumu = (typeof KURULUM_LISTESI_DURUMLARI)[number];

/** Parçanın çözülmüş hâli — ekranda adımın altında satır satır. */
export interface KurulumListesiParcasi {
  kaynak: Parca['kaynak'];
  kod: string;
  /** Parçanın kendi durumu, birleşik sözlükte. */
  durum: Exclude<KurulumListesiDurumu, 'kullanilmiyor'>;
  /** Kaynağın kısa sonucu ("act_123 · Proje A"); okunamadıysa null. */
  baslik: string | null;
  /** NEDEN — her zaman dolu; kaynak okunamadıysa okunamadığı. */
  neden: string;
}

export interface KurulumListesiAdimi {
  kod: KurulumListesiKodu;
  ad: string;
  durum: KurulumListesiDurumu;
  /** `kullanilmiyor` adımda boş. */
  parcalar: KurulumListesiParcasi[];
}

export interface KurulumListesiGirdisi {
  /** `GET /clients/:id/kurulum`; `null` = okunamadı. */
  kurulum: KurulumYaniti | null;
  /** `GET /clients/:id/hazirlama`; `null` = okunamadı. */
  hazirlama: HazirlamaYaniti | null;
  /** `GET /clients/:id/hazirlik`; `null` = okunamadı. */
  hazirlik: WorkspaceHazirlik | null;
  /**
   * Kullanıcının kullanmadığını beyan ettiği platformlar — normalde
   * `kurulum.kullanilmayanPlatformlar`. AYRI alan, çünkü kurulum yanıtı
   * okunamadığında da beyan bilinebilir (ve bilinmiyorsa `[]`: beyan yok
   * = hepsi sayılır; sayaç zaten "okunamadı" diyecek).
   */
  kullanilmayanlar: readonly KurulumPlatformu[];
}

const OKUNAMADI = 'Bu bilgi okunamadı; sayfayı yenile ya da birazdan tekrar bak.';
const PARCA_YOK = 'Sunucu bu parçayı döndürmedi.';

function kurulumDurumu(d: string): KurulumListesiParcasi['durum'] {
  switch (d) {
    case 'tamam':
    case 'eksik':
    case 'kullanicida':
    case 'hata':
      return d;
    case 'atlandi':
      return 'bekliyor';
    default:
      return 'bilinmiyor';
  }
}

function hazirlamaDurumu(d: string): KurulumListesiParcasi['durum'] {
  switch (d) {
    case 'tamam':
    case 'soru':
    case 'eksik':
    case 'hata':
      return d;
    case 'atlandi':
      return 'bekliyor';
    default:
      return 'bilinmiyor';
  }
}

function parcaCoz(p: Parca, g: KurulumListesiGirdisi): KurulumListesiParcasi {
  if (p.kaynak === 'kurulum') {
    if (!g.kurulum) return { kaynak: p.kaynak, kod: p.kod, durum: 'bilinmiyor', baslik: null, neden: OKUNAMADI };
    const a = g.kurulum.adimlar.find((x) => x.kod === p.kod);
    if (!a) return { kaynak: p.kaynak, kod: p.kod, durum: 'bilinmiyor', baslik: null, neden: PARCA_YOK };
    return { kaynak: p.kaynak, kod: p.kod, durum: kurulumDurumu(a.durum), baslik: a.baslik, neden: a.neden };
  }
  if (p.kaynak === 'hazirlama') {
    if (!g.hazirlama) return { kaynak: p.kaynak, kod: p.kod, durum: 'bilinmiyor', baslik: null, neden: OKUNAMADI };
    const a = g.hazirlama.adimlar.find((x) => x.kod === p.kod);
    /*
     * HAZIRLAMA HENÜZ KOŞMADIYSA adım satırı yok. Bu "bilinmiyor" DEĞİL:
     * hazırlık bekliyor ("bekliyor"), ilk okuma onu tetikliyor.
     */
    if (!a) return { kaynak: p.kaynak, kod: p.kod, durum: 'bekliyor', baslik: null, neden: 'Hazırlık henüz bu adıma gelmedi.' };
    return { kaynak: p.kaynak, kod: p.kod, durum: hazirlamaDurumu(a.durum), baslik: a.baslik, neden: a.neden };
  }
  if (!g.hazirlik) return { kaynak: p.kaynak, kod: p.kod, durum: 'bilinmiyor', baslik: null, neden: OKUNAMADI };
  const m = g.hazirlik.maddeler.find((x) => x.kod === p.kod);
  if (!m) return { kaynak: p.kaynak, kod: p.kod, durum: 'bilinmiyor', baslik: null, neden: PARCA_YOK };
  return {
    kaynak: p.kaynak,
    kod: p.kod,
    durum: m.durum === 'tamam' ? 'tamam' : m.durum === 'eksik' ? 'eksik' : 'bilinmiyor',
    baslik: null,
    neden: m.aciklama,
  };
}

const ONCELIK: ReadonlyArray<KurulumListesiParcasi['durum']> = ['hata', 'soru', 'eksik', 'kullanicida', 'bilinmiyor', 'bekliyor'];

/** Parçaların birleşik durumu — öncelik sırası yukarıda. */
export function birlesikDurum(parcalar: readonly KurulumListesiParcasi[]): Exclude<KurulumListesiDurumu, 'kullanilmiyor'> {
  /*
   * BOŞ PARÇA LİSTESİ "TAMAM" DEĞİL. Bütün parçaları kullanılmayan bir
   * platforma bağlı bir adım zaten `kullanilmiyor` olarak dönüyor; buraya
   * boş liste gelmesi listenin tanımında bir hata demek ve `every` boş
   * dizide `true` döndüğü için sessizce "tamam" sayılırdı.
   */
  if (parcalar.length === 0) return 'bilinmiyor';
  for (const d of ONCELIK) if (parcalar.some((p) => p.durum === d)) return d;
  return 'tamam';
}

/** Yedi adımı üç yanıttan kurar. Sıra `KURULUM_LISTESI` sırası. */
export function kurulumListesi(g: KurulumListesiGirdisi): KurulumListesiAdimi[] {
  return KURULUM_LISTESI.map((adim) => {
    if (adim.platform && g.kullanilmayanlar.includes(adim.platform)) {
      return { kod: adim.kod, ad: adim.ad, durum: 'kullanilmiyor' as const, parcalar: [] };
    }
    const parcalar = (adim.parcalar as readonly Parca[])
      .filter((p) => !p.platform || !g.kullanilmayanlar.includes(p.platform))
      .map((p) => parcaCoz(p, g));
    return { kod: adim.kod, ad: adim.ad, durum: birlesikDurum(parcalar), parcalar };
  });
}

export interface KurulumSayaci {
  /** `tamam` adım sayısı. */
  tamam: number;
  /** Sayaca giren adım sayısı (`kullanilmiyor` hariç). */
  toplam: number;
  /** Okunamayan adım sayısı — "5 / 7 · 1 okunamadı" diye AYRI yazılır. */
  bilinmiyor: number;
  /** Bütün sayılan adımlar tamam. Okunamayan adım varken ASLA true değil. */
  bitti: boolean;
}

/**
 * TEK SAYAÇ. Marka Merkezi iç menüsünün Kurulum rozeti, Kurulum başlığı
 * ve (ileride) Genel Bakış AYNI fonksiyonu okur; ikinci bir sayaç
 * yazılmaz — bugünkü üç sayacın ayrışması bu modülün sebebi.
 */
export function kurulumSayaci(adimlar: readonly KurulumListesiAdimi[]): KurulumSayaci {
  const sayilan = adimlar.filter((a) => a.durum !== 'kullanilmiyor');
  const tamam = sayilan.filter((a) => a.durum === 'tamam').length;
  const bilinmiyor = sayilan.filter((a) => a.durum === 'bilinmiyor').length;
  return { tamam, toplam: sayilan.length, bilinmiyor, bitti: sayilan.length > 0 && tamam === sayilan.length };
}

/**
 * ═══ "EKSİKLERİ TAMAMLA" — TEK DÜĞME, KAPSAMI BURADA ═══
 *
 * Düğme iki uca gider, sırayla: önce `POST /clients/:id/kurulum/tamamla`
 * (kurulumun otomatik adımları, `OTOMATIK_SIRA`), sonra hazırlama `eksik`
 * ise `POST /clients/:id/hazirlama` (site/marka/ölçüm yeniden hazırlanır).
 * İki ayrı düğme bugün iki ayrı yerde; kullanıcı hangisinin ne yaptığını
 * bilemiyor.
 *
 * ASLA YAPMADIĞI (sistemin değil kullanıcının kararı ya da işi):
 *   · gerçek reklam hesabı AÇMAK (`meta_hesap`, `google_hesap` — seçim ister),
 *   · ödeme yöntemi, site kodu, doğrulama (kullanıcıda),
 *   · OAuth izni (`google_izin`),
 *   · soruları cevaplamak (piksel adayı, kategori, konum, bütçe).
 *
 * Kullanılmayan platformun parçaları da düğmenin kapsamında değil: Google'ı
 * kullanmayan bir workspace'te düğme Google Ads dönüşümü AÇMAMALI. Bu
 * süzgecin API tarafı Ajan 3'ün (tamamla ucu beyanı okuyacak).
 */
export interface EksikleriTamamlaKapsami {
  /** Kurulum ucunun bu durumda kendisi yapabileceği adımlar. */
  kurulumAdimlari: KurulumAdimKodu[];
  /** Hazırlama yeniden koşturulsun mu. */
  hazirlamaYeniden: boolean;
  /** Düğmenin yapamayacağı, kullanıcıya kalan iş — adım ve nedeniyle. */
  kullaniciyaKalan: Array<{ adim: KurulumListesiKodu; neden: string }>;
  /** Düğme açık mı (yapacak bir şey var mı). */
  yapacakVar: boolean;
}

export function eksikleriTamamlaKapsami(g: KurulumListesiGirdisi): EksikleriTamamlaKapsami {
  const adimlar = kurulumListesi(g);
  const kullanilan = (p: KurulumPlatformu | undefined) => !p || !g.kullanilmayanlar.includes(p);
  const kapsamdakiKurulumKodlari = new Set<KurulumAdimKodu>();
  for (const a of KURULUM_LISTESI) {
    if (a.platform && !kullanilan(a.platform)) continue;
    for (const p of a.parcalar as readonly Parca[]) {
      if (p.kaynak === 'kurulum' && kullanilan(p.platform)) kapsamdakiKurulumKodlari.add(p.kod);
    }
  }
  const kurulumAdimlari = (g.kurulum?.adimlar ?? [])
    .filter((a) => a.otomatik && kapsamdakiKurulumKodlari.has(a.kod))
    .map((a) => a.kod);
  const hazirlamaYeniden = g.hazirlama !== null && g.hazirlama.durum === 'eksik';
  /*
   * KULLANICIYA KALAN: bitmemiş bir parçayı düğme yapamıyorsa. "Eksik" bir
   * parça da buraya düşebilir — `meta_hesap` eksik ama otomatik değil
   * (gerçek hesap açar, seçim ister). Düğmeye bastıktan sonra "neden hâlâ
   * eksik" sorusunun cevabı bu liste; boş bırakmak, sebebi yazmayan bir
   * "tamamlanamadı" demekti.
   */
  const dugmeYapar = (p: KurulumListesiParcasi): boolean =>
    (p.kaynak === 'kurulum' && (kurulumAdimlari as string[]).includes(p.kod)) ||
    (p.kaynak === 'hazirlama' && hazirlamaYeniden && p.durum === 'eksik');
  const kullaniciyaKalan: EksikleriTamamlaKapsami['kullaniciyaKalan'] = [];
  for (const a of adimlar) {
    if (a.durum === 'tamam' || a.durum === 'kullanilmiyor') continue;
    const kalan = a.parcalar.find(
      (p) => (p.durum === 'eksik' || p.durum === 'soru' || p.durum === 'kullanicida' || p.durum === 'hata') && !dugmeYapar(p),
    );
    if (kalan) kullaniciyaKalan.push({ adim: a.kod, neden: kalan.neden });
  }
  return { kurulumAdimlari, hazirlamaYeniden, kullaniciyaKalan, yapacakVar: kurulumAdimlari.length > 0 || hazirlamaYeniden };
}
