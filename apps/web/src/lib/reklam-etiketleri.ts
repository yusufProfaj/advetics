import { CTA_LABELS, sec, type CallToAction, type Dil } from '@advetics/shared';
import { reklamYoneticisiSozlugu } from '@/dil/sozlukler/reklam-yoneticisi';

/**
 * ═══ PLATFORMDAN GELEN KODLARIN EKRANDAKİ KARŞILIĞI ═══
 *
 * Reklam kartı üç alanı ham hâliyle basıyordu: `SHOP_NOW`, `RESPONSIVE_SEARCH_AD`,
 * `DISAPPROVED`. Bunlar Meta ve Google'ın iç kodları; paneli kullanan kişi
 * reklamcı bile olmayabilir ve bu ürünün kurucu vaadi tam olarak o
 * ("reklam ile ilgili bilgisi olmayan birisi bile kullanabilsin").
 *
 * BİLİNMEYEN DEĞER UYDURULMUYOR. Platformlar bu listelere sürekli yeni değer
 * ekliyor; eşleşmeyen bir kod okunabilir hâle getiriliyor (alt çizgi boşluk
 * olur, ilk harf büyür) ama Türkçeye ÇEVRİLMİŞ gibi gösterilmiyor. Yanlış bir
 * çeviri, anlaşılmayan bir koddan daha kötü.
 */
function okunabilir(ham: string): string {
  const s = ham.replace(/_/g, ' ').toLocaleLowerCase('tr');
  return s.charAt(0).toLocaleUpperCase('tr') + s.slice(1);
}

/** Eylem çağrısı düğmesinin yazısı. Bilinenler `CTA_LABELS`ten. */
export function ctaEtiketi(ham: string): string {
  return CTA_LABELS[ham as CallToAction] ?? okunabilir(ham);
}

/**
 * Kreatif türü.
 *
 * Platformlar burada onlarca değer kullanıyor ve hepsini eşlemek mümkün
 * değil; yalnızca sık görülenler yazılı, kalanı okunabilir hâle geliyor.
 */
// "Video" iki dilde aynı: sözlük bekçisi aynı değeri "çevrilmemiş" sayar, kodda kalır.
const kreatifTuru = (dil: Dil): Record<string, string> => ({ ...sec(reklamYoneticisiSozlugu, dil).kart.kreatifTuru, VIDEO: 'Video' });

export function kreatifTuruEtiketi(ham: string, dil: Dil = 'tr'): string {
  return kreatifTuru(dil)[ham.toUpperCase()] ?? okunabilir(ham);
}

/**
 * Platform inceleme sonucu.
 *
 * `WITH_ISSUES` özellikle önemli ve çevirisi düz değil: reklam YAYINDA ama bir
 * uyarı taşıyor (bkz. `review-issues.ts`). "Sorunlu" demek yayından kalktığı
 * izlenimi verirdi.
 */

export function incelemeEtiketi(ham: string, dil: Dil = 'tr'): string {
  const tablo: Record<string, string> = sec(reklamYoneticisiSozlugu, dil).kart.inceleme;
  return tablo[ham.toUpperCase()] ?? okunabilir(ham);
}
