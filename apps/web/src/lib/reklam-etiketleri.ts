import { CTA_LABELS, type CallToAction } from '@advetics/shared';

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
const KREATIF_TURU: Record<string, string> = {
  IMAGE: 'Görsel',
  VIDEO: 'Video',
  CAROUSEL: 'Karusel',
  SLIDESHOW: 'Slayt',
  COLLECTION: 'Koleksiyon',
  TEXT: 'Metin',
  RESPONSIVE_SEARCH_AD: 'Arama reklamı',
  EXPANDED_TEXT_AD: 'Arama reklamı',
  SEARCH_STANDARD: 'Arama reklamı',
  RESPONSIVE_DISPLAY_AD: 'Görsel reklam',
  DISCOVERY_CAROUSEL_AD: 'Karusel',
};

export function kreatifTuruEtiketi(ham: string): string {
  return KREATIF_TURU[ham.toUpperCase()] ?? okunabilir(ham);
}

/**
 * Platform inceleme sonucu.
 *
 * `WITH_ISSUES` özellikle önemli ve çevirisi düz değil: reklam YAYINDA ama bir
 * uyarı taşıyor (bkz. `review-issues.ts`). "Sorunlu" demek yayından kalktığı
 * izlenimi verirdi.
 */
const INCELEME: Record<string, string> = {
  APPROVED: 'Onaylandı',
  DISAPPROVED: 'Reddedildi',
  WITH_ISSUES: 'Yayında, uyarı var',
  PENDING_REVIEW: 'İncelemede',
  PREAPPROVED: 'Ön onay',
  ELIGIBLE: 'Yayında',
  ELIGIBLE_LIMITED: 'Yayında, sınırlı',
  UNDER_REVIEW: 'İncelemede',
};

export function incelemeEtiketi(ham: string): string {
  return INCELEME[ham.toUpperCase()] ?? okunabilir(ham);
}
