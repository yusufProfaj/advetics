-- HEDEF KİTLELER: HER KİTLE TEK PLATFORM (kullanıcı kararı, 2026-10-20).
--
-- Öncesinde bir kitle hem Meta alanlarını (interests, ozel_kitleler) hem
-- Google karşılığını (google_hedefleri) taşıyordu; listede hangi kitlenin
-- hangi reklamda işe yarayacağı görünmüyordu ve reklam kurarken seçilen
-- kitlenin hangi parçasının nereye gideceği belirsizdi.
--
-- Bölme kuralı:
--   1. Meta alanı boş, Google alanı dolu  -> satır Google olur (kimlik aynı).
--   2. İkisi de dolu -> ESKİ satır Meta kalır ve Google alanı boşalır;
--      Google verisi YENİ bir satıra "<ad> · Google" adıyla taşınır. Eski
--      kimlik değişmediği için varsayılan kitle, Akıllı Boost ve AdvStrategy
--      bağları kırılmıyor; AdvStrategy'nin GOOGLE satırları yeni kopyaya
--      bağlanır (o satır kitlenin Google parçasını kastediyordu).
--   3. Geri kalan her şey (yalnız konum/yaş, ya da yalnız Meta) Meta kalır.
-- Ad çakışırsa (aynı workspace'te "<ad> · Google" zaten varsa) sona eski
-- kimliğin ilk sekiz hanesi eklenir; tekil indeks bozulmaz, veri kaybolmaz.

ALTER TABLE "audience_templates" ADD COLUMN "platform" VARCHAR(6) NOT NULL DEFAULT 'meta';
ALTER TABLE "audience_templates"
  ADD CONSTRAINT "audience_templates_platform_chk" CHECK ("platform" IN ('meta', 'google'));

-- AND kısa devre YAPMAZ: dizi olmayan değerde jsonb_array_length hata verir,
-- o yüzden uzunluk CASE içinde okunuyor.
-- ON COMMIT DROP DEĞİL: migrate betiği tek işlemde koşmayabilir ve her
-- deyim kendi işleminde kalırsa tablo ilk deyimden sonra düşerdi.
CREATE TEMP TABLE "kitle_bolme" AS
SELECT t."id" AS "eski_id",
       gen_random_uuid() AS "yeni_id",
       (CASE WHEN jsonb_typeof(t."interests") = 'array' THEN jsonb_array_length(t."interests") ELSE 0 END
        + CASE WHEN jsonb_typeof(t."ozel_kitleler") = 'array' THEN jsonb_array_length(t."ozel_kitleler") ELSE 0 END) > 0 AS "meta_dolu",
       (CASE WHEN jsonb_typeof(t."google_hedefleri"->'ilgiler') = 'array' THEN jsonb_array_length(t."google_hedefleri"->'ilgiler') ELSE 0 END
        + CASE WHEN jsonb_typeof(t."google_hedefleri"->'kelimeler') = 'array' THEN jsonb_array_length(t."google_hedefleri"->'kelimeler') ELSE 0 END) > 0 AS "google_dolu"
  FROM "audience_templates" t;

-- 1. Yalnız Google.
UPDATE "audience_templates" t SET "platform" = 'google'
  FROM "kitle_bolme" b
 WHERE b."eski_id" = t."id" AND b."google_dolu" AND NOT b."meta_dolu";

-- 2. İkisi de dolu: Google kopyası.
INSERT INTO "audience_templates"
  ("id", "org_id", "client_id", "name", "platform", "locations", "age_min", "age_max", "genders",
   "interests", "ozel_kitleler", "google_hedefleri", "created_by_user_id", "created_at", "updated_at")
SELECT b."yeni_id", t."org_id", t."client_id",
       CASE WHEN EXISTS (
              SELECT 1 FROM "audience_templates" x
               WHERE x."client_id" = t."client_id" AND x."name" = left(t."name", 71) || ' · Google')
            THEN left(t."name", 62) || ' · Google ' || left(t."id"::text, 8)
            ELSE left(t."name", 71) || ' · Google' END,
       'google', t."locations", t."age_min", t."age_max", t."genders",
       '[]'::jsonb, '[]'::jsonb, t."google_hedefleri", t."created_by_user_id", t."created_at", now()
  FROM "audience_templates" t
  JOIN "kitle_bolme" b ON b."eski_id" = t."id"
 WHERE b."google_dolu" AND b."meta_dolu";

UPDATE "strateji_matrisi" m SET "kitle_sablonu_id" = b."yeni_id"
  FROM "kitle_bolme" b
 WHERE m."kitle_sablonu_id" = b."eski_id" AND m."platform" = 'google' AND b."google_dolu" AND b."meta_dolu";

UPDATE "audience_templates" t
   SET "google_hedefleri" = '{"ilgiler":[],"kelimeler":[]}'::jsonb, "updated_at" = now()
  FROM "kitle_bolme" b
 WHERE b."eski_id" = t."id" AND b."google_dolu" AND b."meta_dolu";

DROP TABLE "kitle_bolme";

-- VARSAYILAN YOK: yeni satır platformunu açıkça söylemeli. Varsayılan
-- 'meta' kalsaydı platformu unutan bir yazma yolu Google kitlesini sessizce
-- Meta diye kaydederdi.
ALTER TABLE "audience_templates" ALTER COLUMN "platform" DROP DEFAULT;
CREATE INDEX "audience_templates_client_platform_idx" ON "audience_templates" ("client_id", "platform");
