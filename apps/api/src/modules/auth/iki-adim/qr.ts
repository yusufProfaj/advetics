import qrcode from 'qrcode-generator';

/**
 * `otpauth://` adresini QR kodu olarak SVG'ye çevirir ve `data:` adresi döndürür.
 *
 * ═══ NEDEN BİR PAKET, NEDEN BU PAKET ═══
 *
 * TOTP'nin aksine QR kodlayıcı küçük bir iş değil: Reed-Solomon hata
 * düzeltmesi, sürüm seçimi, sekiz maske ve ceza puanlaması. Elle yazılmış
 * bir kodlayıcının hatası "telefon kodu okumuyor" olarak görünür ve bunu
 * sınamak için bir QR ÇÖZÜCÜ gerekirdi — o da ikinci bir paket.
 * `qrcode-generator` (Kazuhiko Arase, MIT) SIFIR bağımlılıklı, tek dosya ve
 * 2019'dan beri değişmeyen 1.4.4 sürümüne TAM sürümle sabitlendi.
 *
 * ═══ NEDEN SUNUCUDA ═══
 *
 * Panel bağımlılıksız kalıyor ve anahtarın QR'a dönüştüğü yer TEK: panel de
 * aynı anahtarı elle yazılacak biçimde zaten aldığı için sunucuda üretmek
 * yeni bir sızıntı yüzeyi açmıyor.
 *
 * ═══ NEDEN `data:` ADRESİ ═══
 *
 * Panel bunu `<img src>` ile gösteriyor: `<img>` içindeki SVG betik
 * çalıştıramıyor. SVG'yi HTML'e gömmek (`dangerouslySetInnerHTML`) aynı
 * işi bir XSS yüzeyiyle yapardı.
 *
 * Renkler kılavuzdan: siyah modül, beyaz zemin. QR okuyucular koyu-üstüne-
 * açığı bekliyor; karanlık temada da beyaz zemin KALIYOR (ters renkli QR'ı
 * birçok uygulama okumuyor).
 */
export function qrDataAdresi(metin: string): string {
  // 0 = sürümü içerik uzunluğuna göre otomatik seç; 'M' = %15 hata düzeltme
  // (ekrandan okumada yeterli, 'H' kodu gereksizce sıklaştırıyor).
  const qr = qrcode(0, 'M');
  qr.addData(metin, 'Byte');
  qr.make();

  const n = qr.getModuleCount();
  const kenar = 4; // QR standardının istediği sessiz bölge (4 modül)
  const boyut = n + kenar * 2;
  let yol = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) yol += `M${c + kenar} ${r + kenar}h1v1h-1z`;
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${boyut} ${boyut}" ` +
    `shape-rendering="crispEdges"><rect width="${boyut}" height="${boyut}" fill="#ffffff"/>` +
    `<path d="${yol}" fill="#000000"/></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
