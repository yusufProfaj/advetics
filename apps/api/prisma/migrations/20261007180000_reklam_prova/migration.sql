-- META PROVASI (TASARIM.md § 11.10, § 04.3, § 16.2.3)
--
-- Sonuç taslak SÜRÜMÜNE, içerik özetine, API ve derleyici sürümüne bağlı:
-- dördünden biri değişince eski prova yayının gerekçesi sayılmaz.
-- Satır kuyruğa girerken 'bekliyor' açılır ve YALNIZ BİR KEZ sonuca geçer;
-- sonuçlanmış prova değişmez (trigger) — onaylanan kartın dayandığı kanıt.

CREATE TABLE "prova" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "taslak_id"        UUID           NOT NULL,
  "taslak_surum_no"  INTEGER        NOT NULL,
  "icerik_ozeti"     CHAR(64)       NOT NULL,
  "ad_account_id"    UUID           NOT NULL,
  "api_surumu"       VARCHAR(8)     NOT NULL,
  "derleyici_surumu" VARCHAR(16)    NOT NULL,
  "durum"            VARCHAR(16)    NOT NULL DEFAULT 'bekliyor',
  -- Gövde başına sonuç: {ad, sonuc, mesaj, kod, altKod}. Token yok.
  "sonuclar"         JSONB          NOT NULL DEFAULT '[]',
  "sebep"            VARCHAR(2000),
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "bitti_at"         TIMESTAMPTZ(6),

  CONSTRAINT "prova_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prova_durum_chk" CHECK ("durum" IN ('bekliyor', 'gecti', 'reddedildi', 'dogrulanamadi')),
  CONSTRAINT "prova_bitti_chk" CHECK (("durum" = 'bekliyor') = ("bitti_at" IS NULL))
);
CREATE INDEX "prova_taslak_idx" ON "prova" ("taslak_id", "created_at" DESC);
-- Hesap başına prova kotası (5 dk'da 2) bu indeksle sayılıyor.
CREATE INDEX "prova_hesap_idx" ON "prova" ("ad_account_id", "created_at" DESC);
CREATE INDEX "prova_client_idx" ON "prova" ("client_id");
CREATE INDEX "prova_org_id_idx" ON "prova" ("org_id");
-- Aynı sürüm için aynı anda TEK bekleyen prova: panelin kendiliğinden
-- tetiklemesi ile düğme üst üste binerse ikincisi açılmasın.
CREATE UNIQUE INDEX "prova_bekleyen_key" ON "prova" ("taslak_id", "icerik_ozeti") WHERE "durum" = 'bekliyor';

ALTER TABLE "prova" ADD CONSTRAINT "prova_taslak_fkey"
  FOREIGN KEY ("taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prova" ADD CONSTRAINT "prova_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "prova" ADD CONSTRAINT "prova_ad_account_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION prova_bir_kez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."durum" <> 'bekliyor' AND (NEW."durum" IS DISTINCT FROM OLD."durum"
     OR NEW."sonuclar" IS DISTINCT FROM OLD."sonuclar" OR NEW."sebep" IS DISTINCT FROM OLD."sebep") THEN
    RAISE EXCEPTION 'sonuclanmis prova degismez';
  END IF;
  IF NEW."icerik_ozeti" IS DISTINCT FROM OLD."icerik_ozeti"
     OR NEW."taslak_surum_no" IS DISTINCT FROM OLD."taslak_surum_no"
     OR NEW."api_surumu" IS DISTINCT FROM OLD."api_surumu"
     OR NEW."derleyici_surumu" IS DISTINCT FROM OLD."derleyici_surumu" THEN
    RAISE EXCEPTION 'prova baglami degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "prova_bir_kez_trg" BEFORE UPDATE ON "prova"
  FOR EACH ROW EXECUTE FUNCTION prova_bir_kez();
