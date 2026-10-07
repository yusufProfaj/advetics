-- PİLOT GERÇEK YAYIN ANAHTARI (kullanıcı kararı 2026-10-07)
--
-- Yeni kurulum motoru Meta'da hiç denenmedi; ilk canlı tur TEST KİPİNDE.
-- Anahtar kapalıyken uyum geçse bile onaylanan plan `yayin_kipi = test`
-- alır: kurar, geri okur, açmadan arşivler. Varsayılan KAPALI: anahtar
-- bir kişinin açık kararıyla açılır, kim/ne zaman/neden anahtarla BİRLİKTE
-- yazılır (yazma kesici deseni, 20261007160000).
--
-- Ajans şirketinin satırı belirleyicidir ve müşteri şirketlerini de bağlar;
-- müşteri şirketinin kendi satırı gerçeği AÇAMAZ (pilot/gercek-yayin.ts).
-- Yalnız var olan tabloya BOŞ/false kolon ekliyor; üretim verisine ve
-- kısıtlarına dokunmuyor.

ALTER TABLE "ajans_ayari"
  ADD COLUMN "pilot_gercek_yayin"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "pilot_gercek_yayin_degistiren" UUID,
  ADD COLUMN "pilot_gercek_yayin_at"         TIMESTAMPTZ(6),
  ADD COLUMN "pilot_gercek_yayin_sebebi"     VARCHAR(500);

-- Açıksa kim/ne zaman/neden ZORUNLU: izsiz açılmış bir gerçek yayın,
-- müşteri hesabında para harcayan kampanyanın kimin kararı olduğunu kaybeder.
ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_pilot_gercek_chk" CHECK (
  NOT "pilot_gercek_yayin"
  OR ("pilot_gercek_yayin_at" IS NOT NULL AND "pilot_gercek_yayin_sebebi" IS NOT NULL AND length(trim("pilot_gercek_yayin_sebebi")) > 0)
);

ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_pilot_gercek_degistiren_fkey"
  FOREIGN KEY ("pilot_gercek_yayin_degistiren") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
