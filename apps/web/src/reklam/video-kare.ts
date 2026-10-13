/**
 * VİDEODAN KARE — saf kararlar (DOM yok, test edilebilir). Tarayıcı işi
 * `medya.ts`te; panelde bileşen render eden test altyapısı yok, kararın
 * kendisi burada sınanıyor (CLAUDE.md "effect'in içindeki karar dışarı").
 *
 * Sunucuda video işleme programı YOK ve paylaşımlı sunucuya kurulmuyor;
 * kareler tarayıcıda `<video>` + `<canvas>` ile alınıyor.
 */

/**
 * KAPAK ADAYLARI (VIDEO denetimi B10): %10, %33 ve %60, en erken 1. saniye.
 * Tek kare (eski: ~1. saniye) çoğu videoda logo animasyonu ya da siyah
 * açılıştı ve kullanıcı kapağı değiştiremiyordu. 1 saniyeden kısa video
 * zaten reddediliyor (`medyaKontrol`); süre bilinmiyorsa tek aday (1. sn).
 * Aynı saniyeye düşen adaylar teke iner (çok kısa video).
 */
export function kapakAdayZamanlari(sure: number | null): number[] {
  if (!sure || !Number.isFinite(sure) || sure <= 0) return [1];
  const son = Math.max(0, sure - 0.1);
  const z = [0.1, 1 / 3, 0.6].map((o) => Math.min(son, Math.max(1, sure * o)));
  return [...new Set(z.map((x) => Math.round(x * 10) / 10))];
}

/**
 * METİN ÖNERİSİNİN KARELERİ (B11): başı, ortası, ~15. saniye. 15. saniye
 * ThruPlay'in sayıldığı an; videonun "izlenmiş sayıldığı" yerde ne
 * gösterdiği metnin vaadi için önemli. Kısa videoda 15. saniye yoksa sona
 * yakın kare; aynı saniyeye düşenler teke iner.
 */
export function oneriKareZamanlari(sure: number | null): number[] {
  if (!sure || !Number.isFinite(sure) || sure <= 0) return [0.5];
  const son = Math.max(0, sure - 0.1);
  const z = [Math.min(0.5, son), sure / 2, Math.min(15, son)];
  return [...new Set(z.map((x) => Math.round(x * 10) / 10))];
}

/**
 * SİYAH KARE EŞİĞİ: ortalama parlaklık (0-255, Rec. 601 ağırlıklı). 16
 * altı pratikte siyah (video siyahı 16'dır, "limited range"). Siyah kare
 * kapak olarak hem Meta'da hem panelde boş bir kutu gibi görünüyor; aday
 * listesinden OTOMATİK atılıyor. Bütün adaylar siyahsa hiçbiri atılmıyor:
 * kullanıcı boş bir seçiciyle kalmasın, en azından görsün.
 */
export const SIYAH_KARE_ESIGI = 16;

export function ortalamaParlaklik(rgba: ArrayLike<number>): number {
  let t = 0;
  let n = 0;
  // Her 4. piksel yeterli (16 baytta bir): tam tarama büyük karede yavaş.
  for (let i = 0; i + 2 < rgba.length; i += 16) {
    t += 0.299 * rgba[i]! + 0.587 * rgba[i + 1]! + 0.114 * rgba[i + 2]!;
    n++;
  }
  return n ? t / n : 0;
}

export function siyahMi(parlaklik: number): boolean {
  return parlaklik < SIYAH_KARE_ESIGI;
}

/** Siyah adayları at; hepsi siyahsa hiçbirini atma (yukarıdaki not). */
export function siyahlariAyikla<T extends { parlaklik: number }>(adaylar: readonly T[]): T[] {
  const kalan = adaylar.filter((a) => !siyahMi(a.parlaklik));
  return kalan.length ? kalan : [...adaylar];
}

/**
 * MODEL GİRDİSİNİN SINIRI (B11): öneri kareleri uzun kenarı en çok 640
 * piksele küçültülür. Yapay zekâ tam çözünürlüğe ihtiyaç duymuyor ve her
 * kare girdi token'ı; sunucu ayrıca bayt sınırı uyguluyor.
 */
export const ONERI_KARESI_UZUN_KENAR = 640;

export function kucukOlcu(en: number, boy: number, uzunKenar: number = ONERI_KARESI_UZUN_KENAR): { en: number; boy: number } {
  const k = Math.max(en, boy);
  if (k <= uzunKenar) return { en, boy };
  const o = uzunKenar / k;
  return { en: Math.max(1, Math.round(en * o)), boy: Math.max(1, Math.round(boy * o)) };
}
