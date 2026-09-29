-- MARKA MERKEZİ BÖLÜM 3b — METİN ŞABLONLARI VE ZORUNLU YASAL UYARI
--
-- Metin şablonları: sık kullanılan cümleler (CTA, kampanya kalıbı). Reklam
-- Oluştur onları tek tıkla metne ekliyor.
--
-- Yasal uyarı: bazı sektörlerde (sağlık, finans, konut) reklam metninde
-- bulunması ZORUNLU olan cümle. Tanımlıysa Hızlı Reklam onu ana metnin
-- sonuna ekliyor ve yayın öncesi kontrol eksikse yayını durduruyor —
-- platformun reddinden, ya da daha kötüsü denetimden SONRA değil.

ALTER TABLE "client_profiles"
  ADD COLUMN "metin_sablonlari" TEXT[]       NOT NULL DEFAULT '{}',
  ADD COLUMN "yasal_uyari"      VARCHAR(300);
