-- BİLGİ BANKASI — MÜŞTERİNİN GENEL PROFİLİ
--
-- `branding_profiles` İLE KARIŞTIRILMASIN: o ajansın beyaz etiket rapor
-- markalaşması. Bu tablo müşterinin KENDİ profili — hedef kitle, marka
-- bilgileri, kendi logosu. Bütçe hedefi burada TEKRARLANMIYOR, ayrı
-- `monthly_budgets` tablosunda duruyor.
--
-- clientId NULLABLE DEĞİL (branding_profiles'ın aksine) — bu model yalnızca
-- bir müşteriye ait olabilir, ajans geneli hâli yok.
--
-- `bilgi_bankasi` BU TABLOYA AYNI MIGRATION'DA GİRİYOR, ayrı bir dosyaya
-- değil: bu migration henüz hiçbir veritabanına uygulanmadı, dolayısıyla
-- ikinci bir ALTER TABLE adımı üretimde hiçbir şey kazandırmaz — yalnızca
-- kolonun sonradan eklendiği izlenimini bırakırdı. (Kolon ZATEN UYGULANMIŞ
-- bir migration'a eklenmek isteseydi kural tersine dönerdi: uygulanmış bir
-- dosyayı değiştirmek Prisma'nın checksum'ını bozar.)

CREATE TABLE "client_profiles" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "hedef_kitle"      VARCHAR(2000),
  "marka_bilgileri"  VARCHAR(2000),
  "bilgi_bankasi"    VARCHAR(2000),
  "logo_asset_id"    UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "client_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "client_profiles_client_id_key" ON "client_profiles" ("client_id");
CREATE INDEX "client_profiles_org_id_idx" ON "client_profiles" ("org_id");

ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_logo_asset_id_fkey"
  FOREIGN KEY ("logo_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
