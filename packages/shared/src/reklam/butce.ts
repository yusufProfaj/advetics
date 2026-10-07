/**
 * Bütçe hesapları (TASARIM.md § 7.6.2-7.6.7). Hepsi saf; Gözden geçir Blok F,
 * AI yayın kartı ve taahhüt muhasebesi AYNI fonksiyonu okuyor. İkinci bir
 * "en çok harcama" hesabı yazılırsa ekran ile bekçi ayrışır.
 *
 * Tarihler `YYYY-MM-DD` ve hesabın saat diliminde; Date nesnesine çevrilmiyor
 * (saat dilimi kayması). Gün aritmetiği UTC öğlesi üzerinden yapılıyor: yaz
 * saati geçişi olan bir günde 24 saat eklemek tarihi kaydırmasın.
 */

export type ButceTipi = 'gunluk' | 'toplam';
export type ButceSeviyesi = 'kampanya' | 'ad_set';

export interface Butce {
  tip: ButceTipi;
  micros: bigint;
  seviye: ButceSeviyesi;
}

export interface Takvim {
  baslangic: string;
  /** `null` = "Ben durdurana kadar"; toplam bütçede yasak. */
  bitis: string | null;
}

/**
 * Meta günlük bütçenin %75'ine kadar fazlasını harcayabiliyor (v24 değişiklik
 * günlüğü). CBO'daki yüzde canlıda ölçülene kadar da EN KÖTÜ durum çarpanı
 * olarak kullanılıyor: üst sınır güvenli yönde kalsın.
 */
export const GUNLUK_ESNEKLIK_CARPANI_YUZ = 175n;
/** Aylık ortalama gün; "ayda yaklaşık" satırı için (en çok değil). */
export const AY_ORTALAMA_GUN_ON = 304n;

const GUN_MS = 86_400_000;

function gunNo(t: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) throw new Error(`Tarih YYYY-MM-DD değil: "${t}"`);
  const [y, a, g] = t.split('-').map(Number) as [number, number, number];
  return Math.floor(Date.UTC(y, a - 1, g, 12) / GUN_MS);
}

/** Pazar = 0. Meta'nın haftalık tavanı Pazar-Cumartesi takvim haftasında. */
function haftaGunu(no: number): number {
  // 1970-01-01 Perşembe (4).
  return (((no + 4) % 7) + 7) % 7;
}

export function donemGunSayisi(t: Takvim): number | null {
  if (t.bitis === null) return null;
  const n = gunNo(t.bitis) - gunNo(t.baslangic) + 1;
  if (n < 1) throw new Error('Bitiş başlangıçtan önce');
  return n;
}

export interface HarcamaOzeti {
  /** Bitişli günlükte `gün × D`; toplamda T; bitişsizde null. */
  ortalama: bigint | null;
  /** Dönemin para koruyan üst sınırı; bitişsiz günlükte null (sınır yok). */
  enCok: bigint | null;
  /** Günlükte `7 × D`; toplamda null. */
  haftalikTavan: bigint | null;
  /** Bitişsiz günlükte `D × 30,4` — "yaklaşık", para korumada KULLANILMAZ. */
  ayYaklasik: bigint | null;
}

/**
 * "En çok ne harcanır" (BTC-05). Para koruyan hesaplar (aylık kalan uyarısı,
 * taahhüt) `ortalama`yı değil `enCok`u kullanır: yalnız ortalamayı yazmak
 * "en çok" sözünü yalana çevirirdi.
 */
export function enCokHarcama(b: Butce, t: Takvim): HarcamaOzeti {
  if (b.micros <= 0n) throw new Error('Bütçe sıfırdan büyük olmalı');
  if (b.tip === 'toplam') {
    if (t.bitis === null) throw new Error('Toplam bütçede bitiş tarihi zorunlu');
    donemGunSayisi(t);
    return { ortalama: b.micros, enCok: b.micros, haftalikTavan: null, ayYaklasik: null };
  }
  const D = b.micros;
  const haftalik = 7n * D;
  if (t.bitis === null) {
    return { ortalama: null, enCok: null, haftalikTavan: haftalik, ayYaklasik: (D * AY_ORTALAMA_GUN_ON) / 10n };
  }
  const bas = gunNo(t.baslangic);
  const son = gunNo(t.bitis);
  if (son < bas) throw new Error('Bitiş başlangıçtan önce');
  let enCok = 0n;
  let gun = bas;
  while (gun <= son) {
    // Bu takvim haftasının Cumartesi'si ile dönemin sonundan erken olanı.
    const haftaSonu = gun + (6 - haftaGunu(gun));
    const dilimSonu = Math.min(haftaSonu, son);
    const n = BigInt(dilimSonu - gun + 1);
    const esnek = (n * GUNLUK_ESNEKLIK_CARPANI_YUZ * D) / 100n;
    enCok += esnek < haftalik ? esnek : haftalik;
    gun = dilimSonu + 1;
  }
  return { ortalama: BigInt(son - bas + 1) * D, enCok, haftalikTavan: haftalik, ayYaklasik: null };
}

/**
 * "Ayda 20 bin" → iki HESAPLANMIŞ seçenek; kullanıcı seçer, tahmin yok.
 * Yuvarlama her zaman AŞAĞI ve tam birime: girilen sınırı aşan bir öneri
 * yapılmaz.
 */
export function aylikTutardanSecenekler(aylikMicros: bigint): { gunlukMicros: bigint; toplamMicros: bigint } {
  const gunluk = (aylikMicros * 10n) / AY_ORTALAMA_GUN_ON;
  return { gunlukMicros: gunluk - (gunluk % 1_000_000n), toplamMicros: aylikMicros };
}

/** BTC-07: harcamasız günler sayılmaz; 7 günden az geçmişte kontrol koşmaz. */
export function onKatKontrolu(
  gunlukEsdegerMicros: bigint,
  harcamaliGunler: bigint[],
): { tur: 'kosmadi' } | { tur: 'temiz' } | { tur: 'uyari'; ortalamaMicros: bigint; enCokMicros: bigint } {
  const gunler = harcamaliGunler.filter((h) => h > 0n);
  if (gunler.length < 7) return { tur: 'kosmadi' };
  const toplam = gunler.reduce((a, b) => a + b, 0n);
  const ortalama = toplam / BigInt(gunler.length);
  if (gunlukEsdegerMicros <= 10n * ortalama) return { tur: 'temiz' };
  return { tur: 'uyari', ortalamaMicros: ortalama, enCokMicros: gunler.reduce((a, b) => (b > a ? b : a), 0n) };
}
