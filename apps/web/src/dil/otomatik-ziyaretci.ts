/**
 * ═══ OTOMATİK ZİYARETÇİYE DİL SORUSU YOK ═══
 *
 * İlk ziyaret dil ekranı (`DilSecimEkrani`) sunucu HTML'inde yok ama
 * JavaScript çalıştıran her ziyaretçide montajdan sonra ekranı KAPLIYOR.
 * Googlebot, Google'ın doğrulama ve inceleme araçları (Lighthouse, başsız
 * Chrome) sayfayı çizip görüntüsünü alıyor: çizilen sayfanın tamamı
 * "Dilinizi seçin" olunca ana sayfa ve gizlilik politikası onlar için boş
 * sayfa. Google OAuth doğrulaması 2026-10-17'de iki adres için "yanıt
 * vermiyor" dedi (docs/google-dogrulama/BULGULAR.md).
 *
 * İçerik DEĞİŞMİYOR: bot da insanla aynı Türkçe sayfayı alıyor, yalnız
 * soru katmanı çizilmiyor. Liste dar tutuldu; burada olmayan bir araç en
 * kötü ihtimalle soruyu görür, bugünkü durum.
 */
const OTOMATIK = /bot\b|bot\/|crawler|spider|Google-Site-Verification|Google-InspectionTool|Google-Extended|APIs-Google|Mediapartners-Google|AdsBot|Lighthouse|HeadlessChrome|facebookexternalhit|Storebot/i;

export function otomatikZiyaretciMi(userAgent: string | null | undefined): boolean {
  return OTOMATIK.test(userAgent ?? '');
}
