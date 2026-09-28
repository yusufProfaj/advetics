-- YETKİNİN GERÇEK BİTİŞİ — erişim token'ınınki değil.
--
-- token_expires_at ERİŞİM token'ının bitişi ve token kasası yenileme
-- zamanını ondan kuruyor. Uyarılar aynı alanı yetkinin ömrü sanıyordu:
-- Google Ads bağlantısı canlıda her saat "yetki 1 gün içinde doluyor"
-- diyordu (erişim token'ı saatlik, yenileme token'ının süresi yok).
-- Karar connections/yetki-bitisi.ts içinde.
ALTER TABLE "platform_connections" ADD COLUMN "authorization_expires_at" TIMESTAMPTZ(6);

-- MEVCUT SATIRLAR. Yenileme token'ı olmayan bağlantıda (Meta) yetki,
-- erişim token'ıyla birlikte ölüyor: değer aynen taşınıyor.
--
-- Yenileme token'ı olanlar NULL kalıyor. Google için bu doğru değer
-- (süresiz). LinkedIn için gerçek tarih bilinmiyor, çünkü yenileme
-- token'ının ömrü bugüne kadar hiç saklanmadı; TAHMİN YAZILMIYOR. İlk
-- yenilemede platformun kendi bildirdiği değer yazılacak.
UPDATE "platform_connections"
   SET "authorization_expires_at" = "token_expires_at"
 WHERE "refresh_token_enc" IS NULL;

-- LINKEDIN: NULL "süresiz" diye okunuyor ve panel onu "otomatik" yazıyor;
-- LinkedIn yetkisi ise ölçülmüş bir kurala göre İLK yetkilendirmeden 365
-- gün sonra kesin ölüyor ve yenilemede uzamıyor. Satırın kurulduğu an o
-- ilk yetkilendirme. Sonradan yeniden yetkilendirildiyse gerçek tarih
-- daha GEÇ olur, yani bu değer bir ALT SINIR: uyarı erken gelebilir, geç
-- gelemez. İlk token yenilemesi platformun bildirdiği kesin değeri
-- yazıyor.
UPDATE "platform_connections"
   SET "authorization_expires_at" = "created_at" + INTERVAL '365 days'
 WHERE "platform" = 'linkedin'
   AND "refresh_token_enc" IS NOT NULL
   AND "authorization_expires_at" IS NULL;
