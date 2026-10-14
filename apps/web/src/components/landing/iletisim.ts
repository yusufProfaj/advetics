/**
 * Tanıtım sitesinin bütün "bize yazın" bağlantıları buradan üretiliyor.
 *
 * ÜYE OLMA VE ÖDEME SİSTEMİ YOK (2026-10-14). "Demo Talep Et", "14 gün
 * ücretsiz dene" ve "Teklif al" üçü de e-posta açıyor; form yazmak sunucuya
 * yeni bir uç, kayıt akışı ve ödeme entegrasyonu demekti ve hiçbiri bugün
 * yok. Paketin adı KONU SATIRINDA: gelen kutusunda talebin hangi pakete ait
 * olduğu açmadan görünüyor ve ajans paketinde seçilen workspace sayısı gövdeye
 * yazılıyor, yani teklif için ilk soruyu sormaya gerek kalmıyor.
 *
 * Ayrı dosyada, çünkü hem `site-icerik.ts` hem `fiyat.ts` kullanıyor ve
 * ikisi birbirini içe aktarırsa döngü oluşuyordu.
 */
export const DEMO_EPOSTA = 'hello@profaj.com';

/** `mailto:` adresi. Konu ve gövde kodlanıyor: Türkçe harf ve satır sonu ham giderse istemci keser. */
export function talepAdresi(konu: string, govde: string): string {
  return `mailto:${DEMO_EPOSTA}?subject=${encodeURIComponent(konu)}&body=${encodeURIComponent(govde)}`;
}
