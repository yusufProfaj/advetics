import {
  OZET,
  OZET_METRIKLERI,
  OZET_METRIK_TANIMI,
  formatMoney,
  kalemleriSec,
  metrikYonu,
  ozetHacmi,
  type GunAraligi,
  type HaftaToplami,
  type HaftalikOzet,
  type KampanyaHaftasi,
  type OzetMetrigi,
  type OzetMetrikSatiri,
  type Platform,
} from '@advetics/shared';

/**
 * ═══ HAFTALIK ÖZET — SAF HESAP (Paket B, MIMARI § 5) ═══
 *
 * Sorgu satırlarını özet bölümlerine çeviren her şey burada ve SAF: servis
 * yalnız okuyor ve bunu çağırıyor, test ÇALIŞTIRARAK sınıyor. Sayılar
 * yalnız buradan geliyor; yapay zekâ bu dosyanın ürettiği değerlerin
 * YER TUTUCULARINI görüyor, değerlerin kendisini değil.
 */

/** insights_daily'den kampanya × gün satırı (para RAPORLAMA biriminde, ana birim). */
export interface GunlukKampanyaSatiri {
  varlikId: string;
  ad: string;
  hesapAdi: string;
  platform: Platform;
  gun: string;
  harcama: number;
  gosterim: number;
  tiklama: number;
  donusum: number;
}

export interface OzetAraliklari {
  bu: GunAraligi;
  onceki: GunAraligi;
  /** Dönüşüm kıyasının olgun günleri (`donusumKiyasi`); `null` = hiç olgun gün yok. */
  donusum: { bu: GunAraligi; onceki: GunAraligi; tamHafta: boolean } | null;
}

const BOS = (): HaftaToplami => ({ harcama: 0, gosterim: 0, tiklama: 0, donusum: 0 });

function ekle(t: HaftaToplami, s: GunlukKampanyaSatiri): void {
  t.harcama += s.harcama;
  t.gosterim += s.gosterim;
  t.tiklama += s.tiklama;
  t.donusum += s.donusum;
}

const icinde = (gun: string, a: GunAraligi | undefined): boolean => !!a && gun >= a.bas && gun <= a.son;

/**
 * Kampanya başına iki hafta, iki kova. OLGUN kova yalnız dönüşüm kıyası
 * günlerini sayıyor: Pazartesi sabahı geçen haftanın Cuma-Pazar dönüşümleri
 * henüz oturmadı ve tam haftayı kıyaslamak HER PAZARTESİ "dönüşüm düştü"
 * yazardı (Ç-B3).
 */
export function kampanyaHaftalari(satirlar: readonly GunlukKampanyaSatiri[], a: OzetAraliklari): KampanyaHaftasi[] {
  const harita = new Map<string, KampanyaHaftasi>();
  for (const s of satirlar) {
    let k = harita.get(s.varlikId);
    if (!k) {
      k = {
        varlikId: s.varlikId,
        ad: s.ad,
        hesapAdi: s.hesapAdi,
        platform: s.platform,
        bu: { tam: BOS(), olgun: BOS() },
        onceki: { tam: BOS(), olgun: BOS() },
      };
      harita.set(s.varlikId, k);
    }
    if (icinde(s.gun, a.bu)) {
      ekle(k.bu.tam, s);
      if (icinde(s.gun, a.donusum?.bu)) ekle(k.bu.olgun, s);
    } else if (icinde(s.gun, a.onceki)) {
      ekle(k.onceki.tam, s);
      if (icinde(s.gun, a.donusum?.onceki)) ekle(k.onceki.olgun, s);
    }
  }
  return [...harita.values()];
}

export function workspaceToplami(k: readonly KampanyaHaftasi[], taraf: 'bu' | 'onceki', kova: 'tam' | 'olgun'): HaftaToplami {
  const t = BOS();
  for (const x of k) {
    const y = x[taraf][kova];
    t.harcama += y.harcama;
    t.gosterim += y.gosterim;
    t.tiklama += y.tiklama;
    t.donusum += y.donusum;
  }
  return t;
}

/** Para metni: büyük tutar kuruşsuz, küçük tutar (dönüşüm başı maliyet) kuruşlu. */
export function paraMetni(x: number, paraBirimi: string): string {
  const micros = BigInt(Math.round(x * 1_000_000));
  return formatMoney(micros.toString(), paraBirimi, { decimals: Math.abs(x) < 100 ? 2 : 0 });
}

export function sayiMetni(x: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: x < 100 && !Number.isInteger(x) ? 1 : 0 }).format(x);
}

/** "%8" — işaretsiz, yuvarlak. Yön metni ayrı ("arttı/düştü"). */
export function yuzdeMetni(oran: number): string {
  return `%${Math.round(Math.abs(oran) * 100)}`;
}

function oranDegisim(bu: number | null, onceki: number | null): number | null {
  if (bu === null || onceki === null || onceki === 0) return null;
  return (bu - onceki) / onceki;
}

function metrikDegeri(m: OzetMetrigi, t: HaftaToplami): number | null {
  switch (m) {
    case 'harcama':
      return t.harcama;
    case 'tiklama':
      return t.tiklama;
    case 'donusum':
      return t.donusum;
    case 'donusum_basi_maliyet':
      return t.donusum > 0 ? t.harcama / t.donusum : null;
  }
}

/**
 * Sonuç tablosu. Gösterilen değer haftanın TOPLAMI; dönüşüme bağlı
 * metriklerde DEĞİŞİM olgun günler üzerinden (toplamların oranı DEĞİL).
 * Olgun gün yoksa değişim `null` (kıyas yapılamıyor; "%0" yazmak yalan).
 */
export function metrikSatirlari(k: readonly KampanyaHaftasi[], a: OzetAraliklari, paraBirimi: string): OzetMetrikSatiri[] {
  const bu = workspaceToplami(k, 'bu', 'tam');
  const onceki = workspaceToplami(k, 'onceki', 'tam');
  const buOlgun = workspaceToplami(k, 'bu', 'olgun');
  const oncekiOlgun = workspaceToplami(k, 'onceki', 'olgun');
  return OZET_METRIKLERI.map((m) => {
    const tanim = OZET_METRIK_TANIMI[m];
    const para = m === 'harcama' || m === 'donusum_basi_maliyet';
    const deger = (x: number | null) => (x === null ? null : { sayi: x, metin: para ? paraMetni(x, paraBirimi) : sayiMetni(x) });
    const degisim = tanim.donusumeBagli
      ? a.donusum
        ? oranDegisim(metrikDegeri(m, buOlgun), metrikDegeri(m, oncekiOlgun))
        : null
      : oranDegisim(metrikDegeri(m, bu), metrikDegeri(m, onceki));
    return {
      metrik: m,
      bu: deger(metrikDegeri(m, bu)),
      onceki: deger(metrikDegeri(m, onceki)),
      degisim,
      yon: metrikYonu(m, degisim),
      kesinlesmedi: tanim.donusumeBagli && !(a.donusum?.tamHafta ?? false),
    };
  });
}

/**
 * Hacim + sonuç + en çok değişenler. Hacim `normal` değilse kalem
 * ÜRETİLMİYOR (gürültü) ama NEDENİ yazılıyor (`bosNedeni`).
 */
export function sayisalBolumler(
  satirlar: readonly GunlukKampanyaSatiri[],
  a: OzetAraliklari,
  paraBirimi: string,
): Pick<HaftalikOzet, 'hacim' | 'metrikler' | 'degisenler'> {
  const k = kampanyaHaftalari(satirlar, a);
  const hacim = ozetHacmi(workspaceToplami(k, 'bu', 'tam'), workspaceToplami(k, 'onceki', 'tam'));
  const metrikler = metrikSatirlari(k, a, paraBirimi);
  if (hacim !== 'normal') {
    return {
      hacim,
      metrikler,
      degisenler: {
        kalemler: [],
        elenen: { hacim_dusuk: 0, degisim_kucuk: 0, pay_kucuk: 0, deger_yok: 0 },
        bosNedeni: hacim === 'dusuk_hacim' ? 'dusuk_hacim' : null,
      },
    };
  }
  const { kalemler, elenen } = kalemleriSec(k);
  return {
    hacim,
    metrikler,
    degisenler: { kalemler, elenen, bosNedeni: kalemler.length === 0 ? 'belirgin_degisim_yok' : null },
  };
}

/** Listelerde en fazla `OZET.enCokSatir`; fazlası SAYILIYOR (sessiz kesme yok). */
export function kes<T>(liste: readonly T[]): { satirlar: T[]; toplam: number } {
  return { satirlar: liste.slice(0, OZET.enCokSatir), toplam: liste.length };
}
