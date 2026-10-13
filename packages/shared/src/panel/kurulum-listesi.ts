import type { HazirlamaAdimKodu, HazirlamaYaniti } from '../hazirlama';
import type { KurulumAdimKodu, KurulumPlatformu, KurulumYaniti } from '../kurulum';
import { KURULUM_BEYAN_OGESI_ADI, beyanVarMi, type KurulumBeyani, type WorkspaceBeyanOgesi } from '../kurulum/beyan';
import { SITE_YOK_KAPSAM_DISI_ADIMLAR, SITE_YOK_KAPSAM_DISI_PARCALAR, siteYokMu } from '../kurulum/site-yok';
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
 * BU DOSYA SAF: girdi üç yanıt + kullanılmayan platformlar + beyanlar, çıktı on
 * adım (2026-10-13'e kadar yedi; birleşik kurulum sihirbazı üç adım ekledi).
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
  /**
   * `beyan` doluysa parça o beyanla kapsam dışı bırakılabiliyor
   * (`WORKSPACE_BEYAN_OGELERI`). Beyan yalnız TAMAM OLMAYAN parçayı kapatır:
   * adres doluyken "adresimiz yok" beyanı adresi yok saymaz.
   */
  | { kaynak: 'hazirlik'; kod: HazirlikKodu; platform?: KurulumPlatformu; beyan?: WorkspaceBeyanOgesi };

/**
 * ═══ ON ADIM, SIRAYLA ═══
 *
 * 2026-10-13 (birleşik kurulum sihirbazı, docs/kurulum-sihirbazi/MIMARI.md):
 * yedi adıma üç adım eklendi — başa "Workspace bilgileri", sona
 * "Bildirimler ve erişim" ve "Veri akışı". Sihirbaz ve Marka Merkezi ›
 * Kurulum AYNI listeyi okur: sihirbazın ayrı bir tanımı olsaydı "7 / 7"
 * derken rapor alıcısı boş ve hiç veri gelmemiş bir workspace "bitti"
 * görünürdü — üç sayacın ayrışmasının dördüncü kopyası.
 *
 * "Workspace bilgileri" İLK: site adresi ölçümün (konteyner tespiti, site
 * taraması) ve hazırlamanın (AI marka) girdisi.
 *
 * ═══ ÖNCEKİ YEDİ ADIM (kullanıcının onayladığı sıra) ═══
 *
 * Sıra İŞİN sırası: hesap olmadan piksel, piksel olmadan ölçüm, marka
 * olmadan varsayılan yok. Adım `platform` taşıyorsa ve o platform
 * kullanılmıyorsa adım BÜTÜNÜYLE sayaçtan düşer ("Kullanılmıyor").
 *
 * BİLEREK DIŞARIDA KALANLAR (sayaca girmiyor):
 *   · `aylik_butce` (hazırlık) — her ay yenilenen bir PLAN kararı, kurulum
 *     değil; sayaca girseydi her ayın 1'inde bütün workspace'ler "eksik"
 *     derdi. Evi Planla › Aylık Bütçe.
 *   · (`veri_akisi` 2026-10-13'e kadar buradaydı; artık `veri` adımı.)
 *   · `reklam_hesabi`, `reklam_hazirligi` (hazırlık), `marka` (kurulum) —
 *     başka parçaların TOPLAMI; listeye koymak aynı eksiği iki kez saymak.
 *   · `sosyal_kanal` (hazırlık) — YouTube'u da sayıyor; "Facebook sayfası ve
 *     Instagram" adımının ölçüsü kurulumun `sayfa` adımı.
 *   · Diğer veri kaynakları (Search Console, e-ticaret) — isteğe bağlı,
 *     listenin altında ayrı blok.
 */
export const KURULUM_LISTESI = [
  {
    /*
     * Workspace bilgileri › firma'daki alanlar. Vergi, IBAN ve notlar
     * SAYILMAZ (fatura belgesinde gerekiyorsa orada sorulur).
     */
    kod: 'bilgiler',
    ad: 'Workspace bilgileri',
    platform: null,
    parcalar: [
      { kaynak: 'hazirlik', kod: 'site_adresi' },
      { kaynak: 'hazirlik', kod: 'iletisim' },
      { kaynak: 'hazirlik', kod: 'rapor_alicisi' },
      { kaynak: 'hazirlik', kod: 'adres', beyan: 'adres' },
    ],
  },
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
  {
    /*
     * Bildirim kanalı ve sorumlu kişi. İkisi de beyanla kapanabiliyor: bildirim
     * istemeyen ekip ve yalnız yöneticilerin yönettiği workspace meşru.
     * Müşteriye panel girişi SAYILMAZ (isteğe bağlı).
     */
    kod: 'bildirimler',
    ad: 'Bildirimler ve erişim',
    platform: null,
    parcalar: [
      { kaynak: 'hazirlik', kod: 'bildirim', beyan: 'bildirim' },
      { kaynak: 'hazirlik', kod: 'erisim', beyan: 'erisim' },
    ],
  },
  {
    /*
     * VERİ AKIŞI ARTIK SAYACA GİRİYOR (panel-sadeleştirme Ç-7'nin kısmi
     * tersi, kurulum-sihirbazi Ç-5). Ç-7'nin gerekçesi "bir durum, iş değil"
     * idi; ama atama izlemeyi kendiliğinden açıyor, yani hesap atanmışken
     * veri yoksa bu bir ARIZA — "atadım, veri gelmiyor" bu projenin en sık
     * sessiz hatası. İlk çekim sürerken `bekliyor` (eksik değil).
     * `aylik_butce` için Ç-7 AYNEN geçerli: sayaca girmez.
     */
    kod: 'veri',
    ad: 'Veri akışı',
    platform: null,
    parcalar: [{ kaynak: 'hazirlik', kod: 'veri_akisi' }],
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
 *   · `kapsam_disi`    — (YENİ) parça ya da adım bir BEYANLA kapandı ("adresimiz
 *                        yok", "web sitemiz yok"); sayaca girmez, son kontrolde
 *                        kimin ne zaman dediği yazılır. Birleşik durumda
 *                        kapsam dışı parça YOK SAYILIR; bütün parçalar kapsam
 *                        dışıysa adım `kapsam_disi`.
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
  'kapsam_disi',
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
  /** `kapsam_disi` parçayı kapatan beyan (kim, ne zaman, gerekçe). */
  beyan?: KurulumBeyani;
}

export interface KurulumListesiAdimi {
  kod: KurulumListesiKodu;
  ad: string;
  durum: KurulumListesiDurumu;
  /** `kullanilmiyor` ve adım düzeyinde `kapsam_disi` (site yok) adımda boş. */
  parcalar: KurulumListesiParcasi[];
  /** Adımı BÜTÜNÜYLE kapatan beyan (bugün yalnız `site_yok`). */
  beyan?: KurulumBeyani;
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
  /**
   * Kurulum beyanları (`GET /clients/:id/kurulum` yanıtındaki ya da ayrı
   * uçtaki liste — Ajan 2 seçer). ÜÇ HÂL:
   *   · dizi      — okundu,
   *   · `null`    — OKUNAMADI: beyanla kapanabilecek, tamam olmayan parça
   *                 `bilinmiyor` (yok saymak, verilmiş kararı "eksik" gösterir),
   *   · `undefined` — GEÇİŞ: çağıran beyanları henüz okumuyor; "beyan yok"
   *                 sayılır (bugünkü davranış). Ajan 3 bütün çağıranları
   *                 bağlayınca alan ZORUNLU olur (MIMARI § 6, geçici).
   */
  beyanlar?: readonly KurulumBeyani[] | null;
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
    durum: m.durum === 'tamam' ? 'tamam' : m.durum === 'eksik' ? 'eksik' : m.durum === 'bekliyor' ? 'bekliyor' : 'bilinmiyor',
    baslik: null,
    neden: m.aciklama,
  };
}

const BEYAN_OKUNAMADI = 'Kurulum beyanları okunamadı; bu parçanın kapsam dışı bırakılıp bırakılmadığı bilinmiyor.';

function beyanNedeni(b: KurulumBeyani): string {
  const kim = b.beyanEden ? `${b.beyanEden.ad}, ` : '';
  const neden = b.gerekce ? `: "${b.gerekce}"` : '';
  return `Kapsam dışı (${kim}${b.tarih.slice(0, 10)})${neden} · ${KURULUM_BEYAN_OGESI_ADI[b.oge]}.`;
}

/**
 * Beyanı parçaya uygular. TAMAM parçaya dokunmaz. Beyanlar okunamadıysa
 * tamam olmayan beyanlı parça `bilinmiyor`.
 */
function beyanUygula(p: Parca, c: KurulumListesiParcasi, g: KurulumListesiGirdisi): KurulumListesiParcasi {
  if (p.kaynak !== 'hazirlik' || !p.beyan || c.durum === 'tamam') return c;
  const beyanlar = g.beyanlar === undefined ? [] : g.beyanlar;
  const var_ = beyanVarMi(beyanlar, p.beyan);
  if (var_ === null) return { ...c, durum: 'bilinmiyor', neden: BEYAN_OKUNAMADI };
  if (!var_) return c;
  const b = beyanlar!.find((x) => x.oge === p.beyan)!;
  return { ...c, durum: 'kapsam_disi', neden: beyanNedeni(b), beyan: b };
}

/** "Site yok" beyanının bu girdideki hâli; geçişte (`undefined`) beyan yok. */
function siteYokDurumu(g: KurulumListesiGirdisi): boolean | null {
  return g.beyanlar === undefined ? false : siteYokMu(g.beyanlar);
}

const siteYokParcasiMi = (p: Parca): boolean =>
  SITE_YOK_KAPSAM_DISI_PARCALAR.some((x) => x.kaynak === p.kaynak && x.kod === p.kod);

const ONCELIK: ReadonlyArray<KurulumListesiParcasi['durum']> = ['hata', 'soru', 'eksik', 'kullanicida', 'bilinmiyor', 'bekliyor'];

/** Parçaların birleşik durumu — öncelik sırası yukarıda. */
export function birlesikDurum(parcalar: ReadonlyArray<Pick<KurulumListesiParcasi, 'durum'>>): Exclude<KurulumListesiDurumu, 'kullanilmiyor'> {
  /*
   * BOŞ PARÇA LİSTESİ "TAMAM" DEĞİL. Bütün parçaları kullanılmayan bir
   * platforma bağlı bir adım zaten `kullanilmiyor` olarak dönüyor; buraya
   * boş liste gelmesi listenin tanımında bir hata demek ve `every` boş
   * dizide `true` döndüğü için sessizce "tamam" sayılırdı.
   */
  if (parcalar.length === 0) return 'bilinmiyor';
  /*
   * KAPSAM DIŞI PARÇA YOK SAYILIR; hepsi kapsam dışıysa adım da öyle.
   * Ama tek başına "tamam" yaratmaz: bir tamam parça yoksa ve kalan
   * parçalar yalnız kapsam dışıysa adım `kapsam_disi`, `tamam` değil.
   */
  const sayilan = parcalar.filter((p) => p.durum !== 'kapsam_disi');
  if (sayilan.length === 0) return 'kapsam_disi';
  for (const d of ONCELIK) if (sayilan.some((p) => p.durum === d)) return d;
  return 'tamam';
}

/**
 * On adımı üç yanıt + beyanlardan kurar. Sıra `KURULUM_LISTESI` sırası.
 *
 * Öncelik: platform beyanı (`kullanilmiyor`) > "site yok" (adım
 * `kapsam_disi`) > parça beyanı (parça `kapsam_disi`).
 */
export function kurulumListesi(g: KurulumListesiGirdisi): KurulumListesiAdimi[] {
  const siteYok = siteYokDurumu(g);
  const siteBeyani = siteYok === true ? g.beyanlar?.find((b) => b.oge === 'site_yok') : undefined;
  return KURULUM_LISTESI.map((adim): KurulumListesiAdimi => {
    if (adim.platform && g.kullanilmayanlar.includes(adim.platform)) {
      return { kod: adim.kod, ad: adim.ad, durum: 'kullanilmiyor', parcalar: [] };
    }
    const siteAdimi = (SITE_YOK_KAPSAM_DISI_ADIMLAR as readonly string[]).includes(adim.kod);
    if (siteAdimi && siteBeyani) {
      return { kod: adim.kod, ad: adim.ad, durum: 'kapsam_disi', parcalar: [], beyan: siteBeyani };
    }
    const parcalar = (adim.parcalar as readonly Parca[])
      .filter((p) => !p.platform || !g.kullanilmayanlar.includes(p.platform))
      .map((p) => {
        const c = beyanUygula(p, parcaCoz(p, g), g);
        if (!siteAdimi && !siteYokParcasiMi(p)) return c;
        if (c.durum === 'tamam') return c;
        /*
         * SİTE BEYANI OKUNAMADI ve parça bitmemiş: kapsam dışı mı eksik mi
         * bilinmiyor. "Eksik" demek sitesi olmayan bir workspace'e Tag
         * Manager kurdurmaya çalışmak olurdu.
         */
        if (siteYok === null) return { ...c, durum: 'bilinmiyor' as const, neden: BEYAN_OKUNAMADI };
        if (siteYok === true && siteBeyani) return { ...c, durum: 'kapsam_disi' as const, neden: beyanNedeni(siteBeyani), beyan: siteBeyani };
        return c;
      });
    return { kod: adim.kod, ad: adim.ad, durum: birlesikDurum(parcalar), parcalar };
  });
}

/**
 * Sihirbazın açılış adımı: sırayla ilk BİTMEMİŞ adım. Tamam, kullanılmayan ve
 * kapsam dışı atlanır; `bilinmiyor` atlanMAZ (okunamayan adım bitmiş
 * sayılamaz). Hepsi bittiyse `null` → son kontrol ekranı.
 */
export function ilkEksikAdim(adimlar: readonly KurulumListesiAdimi[]): KurulumListesiKodu | null {
  return adimlar.find((a) => a.durum !== 'tamam' && a.durum !== 'kullanilmiyor' && a.durum !== 'kapsam_disi')?.kod ?? null;
}

/**
 * "Site yok" beyanında YAPILMAYACAK kurulum adımları — API'nin `tamamla`
 * ucu bunu `kullanilmayanAdimlar` gibi okur (Ajan 2). Listeden TÜRETİLİYOR:
 * elle ikinci liste yazmak, panel "kapsam dışı" derken sunucunun yine Tag
 * Manager konteyneri açması demekti.
 */
export function siteYokKurulumKodlari(): Set<KurulumAdimKodu> {
  const kodlar = new Set<KurulumAdimKodu>();
  for (const a of KURULUM_LISTESI) {
    if (!(SITE_YOK_KAPSAM_DISI_ADIMLAR as readonly string[]).includes(a.kod)) continue;
    for (const p of a.parcalar as readonly Parca[]) if (p.kaynak === 'kurulum') kodlar.add(p.kod);
  }
  return kodlar;
}

export interface KurulumSayaci {
  /** `tamam` adım sayısı. */
  tamam: number;
  /** Sayaca giren adım sayısı (`kullanilmiyor` ve `kapsam_disi` hariç). */
  toplam: number;
  /** Beyanla kapsam dışı kalan adım sayısı — "9 / 9 · 1 kapsam dışı". */
  kapsamDisi: number;
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
export function kurulumSayaci(adimlar: ReadonlyArray<Pick<KurulumListesiAdimi, 'durum'>>): KurulumSayaci {
  const sayilan = adimlar.filter((a) => a.durum !== 'kullanilmiyor' && a.durum !== 'kapsam_disi');
  const tamam = sayilan.filter((a) => a.durum === 'tamam').length;
  const bilinmiyor = sayilan.filter((a) => a.durum === 'bilinmiyor').length;
  const kapsamDisi = adimlar.filter((a) => a.durum === 'kapsam_disi').length;
  return { tamam, toplam: sayilan.length, kapsamDisi, bilinmiyor, bitti: sayilan.length > 0 && tamam === sayilan.length };
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

/**
 * `adim` verilirse kapsam O ADIMA daralır (sihirbazın adım başına "Otomatik
 * yap"ı). API'nin `tamamla` ucu bunun için `kodlar` süzgeci alacak (Ajan 2);
 * gelene kadar panel `kurulumAdimlari`nı `/kurulum/adim` ile tek tek yürütür.
 *
 * "SİTE YOK" beyanı varsa — ya da beyanlar OKUNAMADIYSA — site isteyen
 * kurulum adımları (konteyner, mülk, etiket…) kapsamda DEĞİL: belirsizde
 * sitesi olmayan bir workspace'e Tag Manager kurmak, belirsizde
 * beklemekten pahalı.
 */
/**
 * GERÇEK HESAP AÇABİLEN adımlar — düğme bunları sunucu `otomatik` dese bile
 * ALMAZ (⚠ para, MIMARI Ç-4). Tek kapı sunucunun bayrağı olsaydı, bir gün
 * yanlış işaretlenen tek satır "Eksikleri tamamla"ya gerçek reklam hesabı
 * açtırırdı; sihirbazda bu düğme her adımda var.
 */
export const HESAP_ACAN_KODLAR: readonly KurulumAdimKodu[] = ['meta_hesap', 'google_hesap'];

export function eksikleriTamamlaKapsami(g: KurulumListesiGirdisi, adim?: KurulumListesiKodu): EksikleriTamamlaKapsami {
  const adimlar = kurulumListesi(g);
  const kullanilan = (p: KurulumPlatformu | undefined) => !p || !g.kullanilmayanlar.includes(p);
  const siteYok = siteYokDurumu(g);
  const siteAdimi = (kod: string) => (SITE_YOK_KAPSAM_DISI_ADIMLAR as readonly string[]).includes(kod);
  const kapsamdakiKurulumKodlari = new Set<KurulumAdimKodu>();
  let hazirlamaParcasiVar = false;
  for (const a of KURULUM_LISTESI) {
    if (adim && a.kod !== adim) continue;
    if (a.platform && !kullanilan(a.platform)) continue;
    if (siteYok !== false && siteAdimi(a.kod)) continue;
    for (const p of a.parcalar as readonly Parca[]) {
      if (p.kaynak === 'kurulum' && kullanilan(p.platform)) kapsamdakiKurulumKodlari.add(p.kod);
      if (p.kaynak === 'hazirlama') hazirlamaParcasiVar = true;
    }
  }
  const kurulumAdimlari = (g.kurulum?.adimlar ?? [])
    .filter((a) => a.otomatik && kapsamdakiKurulumKodlari.has(a.kod) && !HESAP_ACAN_KODLAR.includes(a.kod))
    .map((a) => a.kod);
  const hazirlamaYeniden = hazirlamaParcasiVar && g.hazirlama !== null && g.hazirlama.durum === 'eksik';
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
    if (adim && a.kod !== adim) continue;
    if (a.durum === 'tamam' || a.durum === 'kullanilmiyor' || a.durum === 'kapsam_disi') continue;
    const kalan = a.parcalar.find(
      (p) => (p.durum === 'eksik' || p.durum === 'soru' || p.durum === 'kullanicida' || p.durum === 'hata') && !dugmeYapar(p),
    );
    if (kalan) kullaniciyaKalan.push({ adim: a.kod, neden: kalan.neden });
  }
  return { kurulumAdimlari, hazirlamaYeniden, kullaniciyaKalan, yapacakVar: kurulumAdimlari.length > 0 || hazirlamaYeniden };
}
