-- Modül 5 — Aylık bütçe tablosu
--
-- Bütçe pacing, sert limit (hard cap), otomatik durdurma ve sağlık skorunun
-- dördü de bu tabloya bağlı. Şu ana kadar sistemde bütçe HEDEFİ yoktu:
-- yalnızca harcamanın kendisi vardı ve "hızlı mı gidiyoruz" sorusunun
-- karşılaştırılacak bir referansı yoktu.

CREATE TABLE "monthly_budgets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID,
    "month" DATE NOT NULL,
    "amount_micros" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "daily_cap_micros" BIGINT,
    "alert_threshold_pct" INTEGER NOT NULL DEFAULT 80,
    "auto_pause_at_pct" INTEGER,
    "note" VARCHAR(500),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "monthly_budgets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "monthly_budgets_client_id_month_idx" ON "monthly_budgets"("client_id", "month");
CREATE INDEX "monthly_budgets_ad_account_id_month_idx" ON "monthly_budgets"("ad_account_id", "month");

ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "monthly_budgets" ADD CONSTRAINT "monthly_budgets_ad_account_id_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- TEKİLLİK — İKİ KISMİ İNDEKS, tek bir UNIQUE değil
--
-- `UNIQUE (client_id, ad_account_id, month)` DOĞRU GÖRÜNÜR AMA ÇALIŞMAZ.
-- Postgres'te NULL hiçbir şeye eşit değil, NULL'a bile. Dolayısıyla
-- `ad_account_id IS NULL` olan iki satır tekillik açısından ÇAKIŞMIYOR ve aynı
-- müşteri + aynı ay için ikinci bir "müşteri geneli" bütçe girilebiliyor.
--
-- Sonucu sessiz olurdu: pacing sorgusu iki satır bulur, biri rastgele kazanır
-- (ya da toplanır) ve müşteriye yanlış bütçe tüketimi gösterilir. Hata mesajı
-- yok, uyarı yok — tam da bu projede tekrar eden desen.
--
-- Bu yüzden iki KISMİ tekil indeks: biri hesap bazlı satırlar, biri müşteri
-- geneli satırlar için.
--
-- (Alternatif `UNIQUE (client_id, COALESCE(ad_account_id, '00000000-...'), month)`
-- olurdu; ikisi de işe yarar ama kısmi indeksler niyeti açıkça okutuyor.)
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "monthly_budgets_account_uniq"
  ON "monthly_budgets" ("client_id", "ad_account_id", "month")
  WHERE "ad_account_id" IS NOT NULL;

CREATE UNIQUE INDEX "monthly_budgets_client_uniq"
  ON "monthly_budgets" ("client_id", "month")
  WHERE "ad_account_id" IS NULL;
