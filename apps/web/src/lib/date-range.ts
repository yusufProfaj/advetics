/**
 * Tarih aralığı çözümlemesi — URL'den okunur, sunucuda hesaplanır.
 *
 * Aralık URL parametresinde tutuluyor (`?aralik=30g`): panel paylaşılabilir,
 * yenilendiğinde seçim kaybolmuyor ve sunucu tarafında render edilebiliyor.
 * İstemci state'inde tutmak üçünü de kaybettirirdi.
 *
 * TARİHLER STRING ve UTC. Kullanıcının tarayıcı saat dilimine göre hesaplamak
 * cazip ama yanlış: "dün" reklam HESABININ zaman diliminde tanımlı ve metrikler
 * o dilime göre yazılıyor (bkz. insights_daily). İkisini karıştırmak panelde
 * bir günlük kayma üretir.
 *
 * ÖN AYAR ARTIK SABİT GÜN SAYISI DEĞİL. "Bu hafta" ve "Bu ay" değişken
 * uzunlukta (bugünün haftanın/ayın kaçıncı günü olduğuna bağlı) ve "Tüm
 * zamanlar" veriye bağlı. Bu yüzden her ön ayar kendi penceresini ÜRETİYOR;
 * eski `{ days, offset }` şeması bunları ifade edemiyordu.
 */

/*
 * GÜN ARİTMETİĞİ VE PENCERE ÜRETİCİLERİ ARTIK `@advetics/shared` İÇİNDE.
 *
 * Sebebi zamanlanmış rapor: planlanmış gönderim WORKER'da (apps/api) koşuyor
 * ve buradaki bir fonksiyona erişemiyor. Kalan tek seçenek pencere hesabını
 * orada ikinci kez yazmaktı — CLAUDE.md: "AYNI ŞEYİ ÜRETEN İKİNCİ FONKSİYON,
 * DOĞDUĞU ANDA AYRIŞIR." Ayrışmanın bedeli burada somut: panelde görülenden
 * farklı bir dönemi kapsayan bir belge MÜŞTERİYE giderdi.
 *
 * Bu dosya ön ayarların ETİKETLERİNİ ve URL çözümlemesini tutmaya devam
 * ediyor; pencerenin KENDİSİ tek yerden geliyor.
 */
export type { IsoDay } from '@advetics/shared';
export { gunEkle, gunSayisi } from '@advetics/shared';

import { PENCERE, ayBasi, bugunUtc, gunEkle, gunSayisi, type IsoDay } from '@advetics/shared';

/** Bugün, UTC. */
export function today(): IsoDay {
  return bugunUtc();
}

/**
 * ÖN AYARLAR — Google Ads'in listesiyle aynı sırada.
 *
 * `pencere` bir FONKSİYON, sabit sayı değil: "Bu ay"ın uzunluğu ayın kaçıncı
 * günü olduğuna, "Tüm zamanlar"ınki ise elimizdeki en eski güne bağlı.
 *
 * `bugunDahil` ayrı bir alan çünkü ekranda YAZILMASI gerekiyor: gün ortasında
 * görülen düşük harcama "kampanya durmuş" diye okunuyor, oysa gün bitmemiş.
 * Bu, hiçbir hata üretmeyen ama yanlış karar aldıran bir gösterim.
 */
export interface OnAyar {
  key: string;
  label: string;
  bugunDahil: boolean;
  /** `enEskiGun` yalnızca "Tüm zamanlar" için gerekli; yoksa bugüne düşüyor. */
  pencere: (bugun: IsoDay, enEskiGun: IsoDay | null) => { from: IsoDay; to: IsoDay };
}

export const RANGE_PRESETS: OnAyar[] = [
  { key: 'bugun', label: 'Bugün', bugunDahil: true, pencere: (b) => PENCERE.bugun(b) },
  { key: 'dun', label: 'Dün', bugunDahil: false, pencere: (b) => PENCERE.dun(b) },
  {
    key: 'bu_hafta',
    label: 'Bu hafta (Pzt–Bugün)',
    bugunDahil: true,
    pencere: (b) => PENCERE.bu_hafta(b),
  },
  { key: '7g', label: 'Son 7 gün', bugunDahil: false, pencere: (b) => PENCERE.sonGun(b, 7) },
  {
    key: 'gecen_hafta',
    label: 'Geçen hafta (Pzt–Paz)',
    bugunDahil: false,
    pencere: (b) => PENCERE.gecen_hafta(b),
  },
  { key: '14g', label: 'Son 14 gün', bugunDahil: false, pencere: (b) => PENCERE.sonGun(b, 14) },
  { key: 'bu_ay', label: 'Bu ay', bugunDahil: true, pencere: (b) => PENCERE.bu_ay(b) },
  { key: '30g', label: 'Son 30 gün', bugunDahil: false, pencere: (b) => PENCERE.sonGun(b, 30) },
  {
    key: 'gecen_ay',
    label: 'Geçen ay',
    bugunDahil: false,
    pencere: (b) => PENCERE.gecen_ay(b),
  },
  { key: '90g', label: 'Son 90 gün', bugunDahil: false, pencere: (b) => PENCERE.sonGun(b, 90) },
  {
    /*
     * TÜM ZAMANLAR ELİMİZDEKİ EN ESKİ GÜNDEN BAŞLIYOR — sabit bir yıldan
     * değil. Meta 37 aya kadar veri veriyor, Google daha fazlası; ama bizde
     * yalnızca ÇEKİLMİŞ günler var ve o da hesabın ne zaman bağlandığına
     * bağlı. Sabit bir alt sınır (örn. 2020) hem yüzlerce boş günü tarar hem
     * de 400 günlük sunucu sınırına takılıp hata sayfası üretir.
     *
     * `enEskiGun` bilinmiyorsa 90 güne düşüyor: uydurma bir başlangıç
     * göstermektense bilinen bir pencere vermek daha dürüst.
     */
    key: 'tum_zamanlar',
    label: 'Tüm zamanlar',
    bugunDahil: false,
    pencere: (b, enEski) => ({ from: enEski ?? gunEkle(b, -90), to: gunEkle(b, -1) }),
  },
];

export type RangeKey = string;
export const DEFAULT_RANGE = '30g';

/**
 * SUNUCUNUN KABUL ETTİĞİ EN UZUN ARALIK.
 *
 * `packages/shared/src/schemas/metrics.schema.ts` 400 günden uzun aralığı
 * REDDEDİYOR. Panelin bunu bilmesi şart: "Tüm zamanlar" naif hesaplanırsa
 * doğrudan doğrulamaya düşer ve kullanıcı boş bir hata sayfası görür.
 * Kırpma SESSİZ OLMUYOR — `kirpildi` alanı ekranda yazılıyor.
 */
export const MAX_GUN = 400;

export type KarsilastirmaKipi = 'yok' | 'onceki_donem' | 'onceki_yil';

export const KARSILASTIRMA_SECENEKLERI: Array<{ key: KarsilastirmaKipi; label: string }> = [
  { key: 'onceki_donem', label: 'Önceki dönem' },
  { key: 'onceki_yil', label: 'Önceki yıl' },
];

export interface ResolvedRange {
  key: RangeKey;
  label: string;
  from: IsoDay;
  to: IsoDay;
  days: number;
  /**
   * Aralık BUGÜNÜ içeriyor mu — yani veri hâlâ değişecek mi.
   *
   * Arayüz bunu yazmak zorunda. Gün ortasında görülen düşük harcama "kampanya
   * durmuş" diye okunuyor; oysa gün bitmemiş.
   */
  incomplete: boolean;
  /** Aralık `MAX_GUN`e kırpıldıysa true — ekranda YAZILMALI. */
  kirpildi: boolean;
  /** Kullanıcının seçtiği özel aralık geçersizse sebebi. Sessiz düşme YOK. */
  hata: string | null;
  karsilastirma: KarsilastirmaKipi;
  /** `karsilastirma !== 'yok'` ise dolu. */
  compareFrom: IsoDay | null;
  compareTo: IsoDay | null;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Girilen dizge gerçek bir takvim günü mü? `2026-02-31` ISO'ya uyuyor ama yok. */
function gecerliGun(s: string | undefined): s is IsoDay {
  if (!s || !ISO.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export interface RangeParams {
  aralik?: string;
  baslangic?: string;
  bitis?: string;
  karsilastir?: string;
  /** `/metrics/coverage`ten gelen en eski gün. "Tüm zamanlar" buna dayanıyor. */
  enEskiGun?: IsoDay | null;
}

/**
 * URL parametrelerini aralığa çevirir.
 *
 * ÖZEL ARALIK SESSİZCE YUTULMUYOR. Eski sürüm bilinmeyen her değeri 30 güne
 * düşürüyordu; özel aralık eklenince bu bir sessiz hataya dönüşürdü —
 * kullanıcı `?aralik=ozel&baslangic=2026-13-01` yazıp 30 günlük veriye bakar
 * ve doğru aralığa baktığını sanardı. Geçersizlik artık `hata` alanında
 * dönüyor ve ekranda yazılıyor.
 */
export function resolveRange(params: RangeParams | string | undefined): ResolvedRange {
  // Eski çağrı biçimi (`resolveRange(params.aralik)`) korunuyor.
  const p: RangeParams = typeof params === 'string' || params === undefined ? { aralik: params } : params;
  const bugun = today();
  let hata: string | null = null;

  let key: string;
  let label: string;
  let from: IsoDay;
  let to: IsoDay;
  let bugunDahil: boolean;

  if (p.aralik === 'ozel') {
    if (!gecerliGun(p.baslangic) || !gecerliGun(p.bitis)) {
      hata = 'Özel aralıktaki tarih geçersiz — son 30 güne dönüldü.';
      const on = RANGE_PRESETS.find((x) => x.key === DEFAULT_RANGE)!;
      ({ from, to } = on.pencere(bugun, p.enEskiGun ?? null));
      key = DEFAULT_RANGE;
      label = on.label;
      bugunDahil = on.bugunDahil;
    } else if (p.baslangic > p.bitis) {
      hata = 'Başlangıç bitişten sonra — tarihler yer değiştirdi.';
      from = p.bitis;
      to = p.baslangic;
      key = 'ozel';
      label = 'Özel';
      bugunDahil = to >= bugun;
    } else {
      from = p.baslangic;
      to = p.bitis;
      key = 'ozel';
      label = 'Özel';
      bugunDahil = to >= bugun;
    }
  } else {
    const on =
      RANGE_PRESETS.find((x) => x.key === p.aralik) ??
      RANGE_PRESETS.find((x) => x.key === DEFAULT_RANGE)!;
    ({ from, to } = on.pencere(bugun, p.enEskiGun ?? null));
    key = on.key;
    label = on.label;
    bugunDahil = on.bugunDahil;
  }

  // KIRPMA — ve kırpıldığı SÖYLENİYOR.
  let kirpildi = false;
  if (gunSayisi(from, to) > MAX_GUN) {
    from = gunEkle(to, -(MAX_GUN - 1));
    kirpildi = true;
  }

  /*
   * VARSAYILAN AÇIK — VE BU BİR UYUM KARARI.
   *
   * Panel başından beri "önceki döneme göre %X" gösteriyordu; sunucu önceki
   * dönemi koşulsuz hesaplıyordu. Karşılaştırmayı varsayılan KAPALI yapmak,
   * bir gün panele bakan herkesin alıştığı yüzdelerin sebepsizce kaybolması
   * demek olurdu.
   *
   * Kapatmak AÇIK bir seçim: `?karsilastir=yok`. Bilinmeyen bir değer de
   * varsayılana düşüyor — URL elle düzenlenebiliyor.
   */
  const karsilastirma: KarsilastirmaKipi =
    p.karsilastir === 'yok'
      ? 'yok'
      : p.karsilastir === 'onceki_yil'
        ? 'onceki_yil'
        : 'onceki_donem';

  const kars = karsilastirmaPenceresi(from, to, karsilastirma);

  return {
    key,
    label,
    from,
    to,
    days: gunSayisi(from, to),
    incomplete: bugunDahil,
    kirpildi,
    hata,
    karsilastirma,
    compareFrom: kars?.from ?? null,
    compareTo: kars?.to ?? null,
  };
}

/**
 * Karşılaştırma penceresi — TEK TANIM.
 *
 * Panel ve sunucu aynı hesabı yapmak zorunda; iki ayrı yerde yazılırsa
 * "%12 arttı" diyen iki ekran farklı dönemleri karşılaştırır ve fark hiçbir
 * yerde görünmez.
 *
 * ÖNCEKİ DÖNEM = aynı uzunlukta, hemen öncesi. Takvimsel bir pencere değil:
 * 7 günlük bir bakışı 30 günlük bir dönemle karşılaştırmak yüzdeyi anlamsız
 * kılar.
 *
 * ÖNCEKİ YIL = aynı takvim aralığının 364 gün öncesi. 365 DEĞİL: 364 = 52 tam
 * hafta, yani haftanın günleri hizalanıyor. Perşembeyi Perşembeyle
 * karşılaştırmak, hafta sonu etkisi olan hesaplarda tek başına büyük fark
 * üretiyor.
 */
export function karsilastirmaPenceresi(
  from: IsoDay,
  to: IsoDay,
  kip: KarsilastirmaKipi,
): { from: IsoDay; to: IsoDay } | null {
  if (kip === 'yok') return null;
  if (kip === 'onceki_yil') {
    return { from: gunEkle(from, -364), to: gunEkle(to, -364) };
  }
  const gun = gunSayisi(from, to);
  const oncekiSon = gunEkle(from, -1);
  return { from: gunEkle(oncekiSon, -(gun - 1)), to: oncekiSon };
}

/** Aralığı URL parametrelerine çevirir — bağlantı üreten her yer bunu kullanıyor. */
export function rangeParams(r: ResolvedRange): Record<string, string | undefined> {
  return {
    aralik: r.key,
    baslangic: r.key === 'ozel' ? r.from : undefined,
    bitis: r.key === 'ozel' ? r.to : undefined,
    /*
     * "KAPALI" DA TAŞINIYOR. Varsayılan açık olduğu için `undefined`
     * bırakmak, kullanıcının kapattığı karşılaştırmanın bir sonraki
     * tıklamada geri gelmesi demek olurdu.
     */
    karsilastir: r.karsilastirma,
  };
}
