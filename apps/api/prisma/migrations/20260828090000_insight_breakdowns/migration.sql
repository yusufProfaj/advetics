-- KIRILIM METRİKLERİ: yaş, cinsiyet, yerleşim, saat, şehir (Advetics 1.0)
--
-- `insights_daily`YE YAZILMIYOR. O tablonun birincil anahtarı `breakdown_key`
-- taşıyor, yani kırılım satırları oraya teknik olarak sığıyor — ama mevcut
-- toplama sorgularının hiçbiri `breakdown_key`i süzmüyor. Kırılım satırları
-- oraya yazıldığı an her harcama rakamı kırılım sayısı kadar KATLANIR ve
-- hiçbir hata düşmez; panel yalnızca yanlış sayı gösterir.
--
-- PARTITION YOK — `keyword_insights` ile aynı gerekçe: hesap seviyesinde,
-- boyut başına onlarca satır. Hacim `insights_daily`den bir mertebe küçük.
CREATE TYPE "BreakdownDimension" AS ENUM ('age', 'gender', 'placement', 'hour', 'city');

CREATE TABLE "insight_breakdowns" (
  "client_id"               UUID          NOT NULL,
  "ad_account_id"           UUID          NOT NULL,
  "platform"                "Platform"    NOT NULL,
  "dimension"               "BreakdownDimension" NOT NULL,
  "value"                   VARCHAR(120)  NOT NULL,
  "date"                    DATE          NOT NULL,
  "impressions"             INTEGER       NOT NULL DEFAULT 0,
  "clicks"                  INTEGER       NOT NULL DEFAULT 0,
  "spend_micros"            BIGINT        NOT NULL DEFAULT 0,
  "conversions"             DECIMAL(14,4) NOT NULL DEFAULT 0,
  "conversion_value_micros" BIGINT        NOT NULL DEFAULT 0,
  "currency"                CHAR(3)       NOT NULL,
  "fetched_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "insight_breakdowns_pkey"
    PRIMARY KEY ("date", "ad_account_id", "dimension", "value")
);

CREATE INDEX "insight_breakdowns_client_id_date_idx"
  ON "insight_breakdowns" ("client_id", "date" DESC);
CREATE INDEX "insight_breakdowns_ad_account_id_dimension_date_idx"
  ON "insight_breakdowns" ("ad_account_id", "dimension", "date" DESC);

ALTER TABLE "insight_breakdowns"
  ADD CONSTRAINT "insight_breakdowns_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "insight_breakdowns"
  ADD CONSTRAINT "insight_breakdowns_ad_account_id_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
