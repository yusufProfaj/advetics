import type { GoruBicimi } from '@advetics/shared';

/**
 * ═══ GÖRSELİN KENDİ BOYUTU — EN-BOY KESİN ALANININ KAYNAĞI ═══
 *
 * En-boy oranı modele SORULMUYOR (`KESIN_ALANLAR`): görselin başlığından
 * okunuyor. Yeni bir bağımlılık yok (sharp gibi ikili kütüphaneler
 * paylaşımlı VPS'te yeni bir sistem bağımlılığı demek); üç biçimin
 * başlığı birkaç bayt.
 *
 * Okunamazsa `null`: en-boy o kreatif için YAZILMIYOR ve en-boy
 * karşılaştırmasına girmiyor. "Kare" diye tahmin etmek, karşılaştırmayı
 * sessizce bir gruba yığardı.
 */
export function gorselBoyutu(b: Uint8Array, tur: GoruBicimi): { genislik: number; yukseklik: number } | null {
  if (tur === 'png') {
    // İmza (8) + IHDR uzunluk (4) + "IHDR" (4) + genişlik (4) + yükseklik (4).
    if (b.length < 24) return null;
    return { genislik: u32(b, 16), yukseklik: u32(b, 20) };
  }
  if (tur === 'webp') return webpBoyutu(b);
  return jpegBoyutu(b);
}

function u32(b: Uint8Array, i: number): number {
  return ((b[i]! << 24) >>> 0) + (b[i + 1]! << 16) + (b[i + 2]! << 8) + b[i + 3]!;
}

/**
 * JPEG: SOF işaretçisini arıyoruz (C0-CF, C4/C8/CC HARİÇ: onlar tablo ve
 * genişletme işaretçisi, boyut taşımıyor). Yükseklik genişlikten ÖNCE.
 */
function jpegBoyutu(b: Uint8Array): { genislik: number; yukseklik: number } | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const isaret = b[i + 1]!;
    if (isaret === 0xd8 || (isaret >= 0xd0 && isaret <= 0xd7) || isaret === 0x01) {
      i += 2;
      continue;
    }
    const uzunluk = (b[i + 2]! << 8) + b[i + 3]!;
    if (isaret >= 0xc0 && isaret <= 0xcf && isaret !== 0xc4 && isaret !== 0xc8 && isaret !== 0xcc) {
      return { yukseklik: (b[i + 5]! << 8) + b[i + 6]!, genislik: (b[i + 7]! << 8) + b[i + 8]! };
    }
    if (uzunluk < 2) return null;
    i += 2 + uzunluk;
  }
  return null;
}

/** WebP: VP8 (kayıplı), VP8L (kayıpsız), VP8X (genişletilmiş) üç ayrı başlık. */
function webpBoyutu(b: Uint8Array): { genislik: number; yukseklik: number } | null {
  if (b.length < 30) return null;
  const parca = String.fromCharCode(b[12]!, b[13]!, b[14]!, b[15]!);
  if (parca === 'VP8 ') {
    return { genislik: ((b[27]! << 8) | b[26]!) & 0x3fff, yukseklik: ((b[29]! << 8) | b[28]!) & 0x3fff };
  }
  if (parca === 'VP8L') {
    const v = b[21]! | (b[22]! << 8) | (b[23]! << 16) | (b[24]! << 24);
    return { genislik: (v & 0x3fff) + 1, yukseklik: ((v >>> 14) & 0x3fff) + 1 };
  }
  if (parca === 'VP8X') {
    return {
      genislik: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)),
      yukseklik: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)),
    };
  }
  return null;
}
