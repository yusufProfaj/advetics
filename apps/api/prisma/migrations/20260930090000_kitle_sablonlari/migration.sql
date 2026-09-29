-- MARKA MERKEZİ BÖLÜM 4a — KİTLE ŞABLONLARI
--
-- Hedefleme bugüne kadar Akıllı Boost ön ayarının içindeydi (ön ayar başına
-- ayrı JSON) ve Hızlı Reklam hiç hedefleme sormuyordu ("Türkiye, 18+").
-- Şablon workspace'e ait, adı olan, yeniden kullanılan bir hedefleme:
-- konum, yaş, cinsiyet.
--
-- META ANAHTARLARI: konumlar Meta'nın coğrafi aramasından geliyor
-- (ülkede iki harf, il/şehirde sayısal dizge). Google'ın konum kimlikleri
-- ayrı bir uzay (geoTargetConstants/N); iki uzayı birbirine çevirmek bir
-- tahmin olurdu. Şablon bugün yalnızca Meta reklamında kullanılıyor ve
-- panel bunu söylüyor.
--
-- VARSAYILAN ŞABLON client_profiles'ta, burada bayrak olarak DEĞİL: bayrak
-- "müşteri başına en fazla bir" kuralı için kısmi tekil indeks isterdi ve
-- Prisma kısmi indeksi bildiremiyor (şema ile veritabanı ayrışıyor). Tek
-- bir yabancı anahtar kolonu kuralı yapısal olarak sağlıyor.

CREATE TABLE "audience_templates" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"             UUID           NOT NULL,
  "client_id"          UUID           NOT NULL,
  "name"               VARCHAR(80)    NOT NULL,
  "locations"          JSONB          NOT NULL DEFAULT '[]',
  "age_min"            SMALLINT       NOT NULL DEFAULT 18,
  "age_max"            SMALLINT       NOT NULL DEFAULT 65,
  "genders"            VARCHAR(6)     NOT NULL DEFAULT 'all',
  "created_by_user_id" UUID,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "audience_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "audience_templates_locations_dizi" CHECK (jsonb_typeof("locations") = 'array'),
  -- Meta reklamında alt yaş 18: daha genci reklam hedeflemesinde kabul edilmiyor.
  CONSTRAINT "audience_templates_yas" CHECK ("age_min" >= 18 AND "age_max" <= 65 AND "age_min" <= "age_max"),
  CONSTRAINT "audience_templates_cinsiyet" CHECK ("genders" IN ('all', 'male', 'female'))
);

-- Aynı adla iki şablon: seçicide iki aynı satır, hangisinin hangisi olduğu belirsiz.
CREATE UNIQUE INDEX "audience_templates_client_id_name_key" ON "audience_templates" ("client_id", "name");
CREATE INDEX "audience_templates_org_id_idx" ON "audience_templates" ("org_id");

ALTER TABLE "audience_templates"
  ADD CONSTRAINT "audience_templates_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audience_templates"
  ADD CONSTRAINT "audience_templates_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Varsayılan şablon silinirse varsayılan BOŞA düşüyor (Türkiye geneli, 18+),
-- silinmiş bir satırı göstermiyor.
ALTER TABLE "client_profiles" ADD COLUMN "varsayilan_kitle_id" UUID;
ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_varsayilan_kitle_id_fkey"
  FOREIGN KEY ("varsayilan_kitle_id") REFERENCES "audience_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
