-- Gelişmiş Kampanya Oluşturucu — "tek giriş, iki mod"
--
-- AYRI TABLO DEĞİL, AYNI TABLOYA İKİ KOLON.
--
-- İki mod da AYNI ŞEYİ üretiyor: bir Meta kampanyası. Ayrı tablo olsaydı
-- doğrulama, görsel yükleme, yayın yolu ve geri alma mantığı ikiye
-- katlanırdı — ve ikisi zamanla ayrışırdı. Daha kötüsü: hızlı modda başlayan
-- bir taslak gelişmiş moda geçemez, kullanıcı her şeyi baştan yazardı.
--
-- `advanced` JSONB çünkü içindeki alanlar Meta'nın alanları ve Meta bunları
-- sürümden sürüme değiştiriyor. Otuz kolon açmak, her Meta değişikliğinde
-- migration yazmak demek olurdu. Uygulama tarafında Zod, veritabanı tarafında
-- CHECK kısıtları doğruluyor.

ALTER TABLE "ad_drafts"
  ADD COLUMN "mode" VARCHAR(10) NOT NULL DEFAULT 'simple',
  ADD COLUMN "advanced" JSONB;

-- MEVCUT TASLAKLAR 'simple' KALIYOR.
--
-- DEFAULT bunu zaten yapıyor ama açıkça yazmak önemli: geriye dönük veri
-- gelişmiş moda geçmemeli, çünkü `advanced` alanı boş ve o modda boş ayar
-- yayın anında patlardı.

-- Mod ile ayarların BİRLİKTE anlamı var.
--
-- 'advanced' modda `advanced` NULL olamaz: modu gelişmiş görünüp ayarı
-- olmayan bir taslak, yayın anında "hangi hedefi kullanayım" sorusunu
-- cevapsız bırakır. Tersi de geçerli değil ama zararsız — hızlı moda dönen
-- kullanıcının ayarları saklı kalıyor ve geri dönerse kaybolmuyor.
ALTER TABLE "ad_drafts" DROP CONSTRAINT IF EXISTS "ad_drafts_mode_chk";
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_mode_chk"
  CHECK ("mode" IN ('simple', 'advanced'));

ALTER TABLE "ad_drafts" DROP CONSTRAINT IF EXISTS "ad_drafts_advanced_chk";
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_advanced_chk"
  CHECK ("mode" <> 'advanced' OR "advanced" IS NOT NULL);

-- Taslağa bağlanan anlık form.
--
-- Hızlı modda form taslakla birlikte oluşturuluyor ve ömrü ona bağlı
-- (`external_lead_form_id`). Gelişmiş modda kütüphaneden SEÇİLİYOR: aynı form
-- birden çok reklamda kullanılabiliyor ve kütüphanedeki sürüm zinciriyle
-- yönetiliyor.
--
-- ON DELETE RESTRICT DEĞİL, SET NULL: form kaydı silinirse (yalnızca taslak
-- formlar silinebiliyor) taslak ayakta kalmalı ve doğrulama "form seç"
-- diyerek kullanıcıyı uyarmalı. RESTRICT olsaydı taslak formu silmek,
-- anlaşılmaz bir yabancı anahtar hatası verirdi.
ALTER TABLE "ad_drafts" ADD COLUMN "lead_form_id" UUID;

ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_lead_form_id_fkey"
  FOREIGN KEY ("lead_form_id") REFERENCES "lead_forms"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
