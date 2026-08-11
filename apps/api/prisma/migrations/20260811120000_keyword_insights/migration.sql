-- Anahtar kelime performansı — yalnızca Google
--
-- Rapor arayüzü bu bölümü başından beri içeriyordu ve `keywords: null`
-- gönderildiğinde "bu yetenek henüz yok" diye gösteriyordu. Google Basic
-- Access alındı, engel kalktı.
--
-- AYRI TABLO, insights_daily'de bir seviye DEĞİL: anahtar kelime reklam
-- hiyerarşisinin parçası değil, bir hedefleme kriteri; Meta'da karşılığı yok;
-- ve entity_level enum'una eklemek o enum üzerinde çalışan her sorguya çift
-- sayım riski taşırdı.

-- AlterEnum

-- CreateTable
CREATE TABLE "keyword_insights" (
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "ad_group_id" UUID,
    "external_criterion_id" VARCHAR(64) NOT NULL,
    "keyword" VARCHAR(500) NOT NULL,
    "match_type" VARCHAR(20) NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend_micros" BIGINT NOT NULL DEFAULT 0,
    "conversions" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "conversion_value_micros" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "keyword_insights_pkey" PRIMARY KEY ("date","ad_account_id","external_criterion_id")
);

-- CreateIndex
CREATE INDEX "keyword_insights_client_id_date_idx" ON "keyword_insights"("client_id", "date" DESC);

-- CreateIndex
CREATE INDEX "keyword_insights_ad_account_id_date_idx" ON "keyword_insights"("ad_account_id", "date" DESC);

-- AddForeignKey
ALTER TABLE "keyword_insights" ADD CONSTRAINT "keyword_insights_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "keyword_insights" ADD CONSTRAINT "keyword_insights_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

