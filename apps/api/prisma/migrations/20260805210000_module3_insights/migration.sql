-- =============================================================================
-- MODÜL 3 — Reklam hiyerarşisi ve metrikler
-- =============================================================================
--
-- ELLE DÜZENLENDİ: `insights_daily` tablosuna `PARTITION BY RANGE ("date")`
-- eklendi. Prisma declarative partitioning'i ifade edemiyor, bu yüzden
-- `migrate diff` çıktısı düz bir tablo üretiyordu.
--
-- Partition'ların kendisi prisma/sql/03_partitions.sql içinde oluşturuluyor —
-- orası idempotent ve her dağıtımda çalışıyor, böylece gelecek aylar önceden
-- açılıyor.
--
-- Bu migration'ı YENİDEN ÜRETİRSEN partition satırını tekrar eklemen gerekir.
-- =============================================================================

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('active', 'paused', 'deleted', 'pending_review', 'ended', 'unknown');

-- CreateEnum
CREATE TYPE "BudgetMode" AS ENUM ('daily', 'lifetime', 'none');

-- CreateEnum
CREATE TYPE "EntityLevel" AS ENUM ('account', 'campaign', 'ad_group', 'ad');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('structure', 'insights_realtime', 'insights_daily', 'insights_backfill', 'insights_breakdown', 'organic_posts', 'initial_backfill');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('queued', 'running', 'succeeded', 'throttled', 'failed', 'cancelled');

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "objective" VARCHAR(60),
    "status" "EntityStatus" NOT NULL DEFAULT 'unknown',
    "effective_status" VARCHAR(60),
    "budget_mode" "BudgetMode" NOT NULL DEFAULT 'none',
    "budget_amount_micros" BIGINT,
    "bid_strategy" VARCHAR(60),
    "start_time" TIMESTAMPTZ(6),
    "stop_time" TIMESTAMPTZ(6),
    "raw" JSONB,
    "platform_updated_at" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_groups" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'unknown',
    "effective_status" VARCHAR(60),
    "budget_mode" "BudgetMode" NOT NULL DEFAULT 'none',
    "budget_amount_micros" BIGINT,
    "bid_amount_micros" BIGINT,
    "optimization_goal" VARCHAR(60),
    "targeting" JSONB,
    "start_time" TIMESTAMPTZ(6),
    "stop_time" TIMESTAMPTZ(6),
    "raw" JSONB,
    "platform_updated_at" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ads" (
    "id" UUID NOT NULL,
    "ad_group_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(512) NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'unknown',
    "effective_status" VARCHAR(60),
    "creative_id" UUID,
    "preview_url" VARCHAR(1024),
    "review_status" VARCHAR(60),
    "disapproval_reasons" JSONB,
    "raw" JSONB,
    "platform_updated_at" TIMESTAMPTZ(6),
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "creatives" (
    "id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "creative_type" VARCHAR(40),
    "headline" VARCHAR(512),
    "primary_text" TEXT,
    "description" TEXT,
    "cta_type" VARCHAR(60),
    "destination_url" VARCHAR(2048),
    "display_url" VARCHAR(512),
    "asset_urls" JSONB,
    "raw" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "creatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights_daily" (
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "entity_level" "EntityLevel" NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_external_id" VARCHAR(128) NOT NULL,
    "date" DATE NOT NULL,
    "breakdown_key" VARCHAR(255) NOT NULL DEFAULT '',
    "breakdown" JSONB,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend_micros" BIGINT NOT NULL DEFAULT 0,
    "spend_micros_reporting" BIGINT,
    "conversions" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "conversion_value_micros" BIGINT NOT NULL DEFAULT 0,
    "video_views" INTEGER NOT NULL DEFAULT 0,
    "engagements" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "frequency" DECIMAL(10,4),
    "raw_metrics" JSONB,
    "currency" CHAR(3) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "insights_daily_pkey" PRIMARY KEY ("date","entity_level","entity_id","breakdown_key")
) PARTITION BY RANGE ("date");

-- CreateTable
CREATE TABLE "fx_rates" (
    "date" DATE NOT NULL,
    "base_currency" CHAR(3) NOT NULL,
    "quote_currency" CHAR(3) NOT NULL,
    "rate" DECIMAL(18,8) NOT NULL,
    "source" VARCHAR(40) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("date","base_currency","quote_currency")
);

-- CreateTable
CREATE TABLE "sync_jobs" (
    "id" BIGSERIAL NOT NULL,
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID,
    "social_profile_id" UUID,
    "job_type" "SyncJobType" NOT NULL,
    "entity_level" "EntityLevel",
    "date_from" DATE,
    "date_to" DATE,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'queued',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 5,
    "api_calls_used" INTEGER NOT NULL DEFAULT 0,
    "rows_upserted" INTEGER NOT NULL DEFAULT 0,
    "platform_job_id" VARCHAR(255),
    "queue_job_id" VARCHAR(255),
    "error_code" VARCHAR(80),
    "error_message" VARCHAR(1000),
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "next_retry_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_usage_log" (
    "id" BIGSERIAL NOT NULL,
    "platform" "Platform" NOT NULL,
    "client_id" UUID,
    "ad_account_id" UUID,
    "endpoint" VARCHAR(255) NOT NULL,
    "call_count_pct" INTEGER,
    "cpu_time_pct" INTEGER,
    "total_time_pct" INTEGER,
    "usage_percent" INTEGER,
    "operations_used" INTEGER,
    "http_status" INTEGER,
    "error_code" VARCHAR(80),
    "latency_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_usage_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "campaigns_client_id_status_idx" ON "campaigns"("client_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_ad_account_id_platform_updated_at_idx" ON "campaigns"("ad_account_id", "platform_updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "campaigns_platform_external_id_key" ON "campaigns"("platform", "external_id");

-- CreateIndex
CREATE INDEX "ad_groups_client_id_status_idx" ON "ad_groups"("client_id", "status");

-- CreateIndex
CREATE INDEX "ad_groups_campaign_id_idx" ON "ad_groups"("campaign_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_groups_platform_external_id_key" ON "ad_groups"("platform", "external_id");

-- CreateIndex
CREATE INDEX "ads_client_id_status_idx" ON "ads"("client_id", "status");

-- CreateIndex
CREATE INDEX "ads_ad_group_id_idx" ON "ads"("ad_group_id");

-- CreateIndex
CREATE UNIQUE INDEX "ads_platform_external_id_key" ON "ads"("platform", "external_id");

-- CreateIndex
CREATE INDEX "creatives_client_id_idx" ON "creatives"("client_id");

-- CreateIndex
CREATE UNIQUE INDEX "creatives_platform_external_id_key" ON "creatives"("platform", "external_id");

-- CreateIndex
CREATE INDEX "insights_daily_client_id_date_entity_level_idx" ON "insights_daily"("client_id", "date" DESC, "entity_level");

-- CreateIndex
CREATE INDEX "insights_daily_ad_account_id_date_idx" ON "insights_daily"("ad_account_id", "date" DESC);

-- CreateIndex
CREATE INDEX "sync_jobs_client_id_created_at_idx" ON "sync_jobs"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "sync_jobs_status_next_retry_at_idx" ON "sync_jobs"("status", "next_retry_at");

-- CreateIndex
CREATE INDEX "sync_jobs_ad_account_id_job_type_created_at_idx" ON "sync_jobs"("ad_account_id", "job_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "api_usage_log_ad_account_id_created_at_idx" ON "api_usage_log"("ad_account_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "api_usage_log_platform_created_at_idx" ON "api_usage_log"("platform", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_groups" ADD CONSTRAINT "ad_groups_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_groups" ADD CONSTRAINT "ad_groups_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_ad_group_id_fkey" FOREIGN KEY ("ad_group_id") REFERENCES "ad_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ads" ADD CONSTRAINT "ads_creative_id_fkey" FOREIGN KEY ("creative_id") REFERENCES "creatives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creatives" ADD CONSTRAINT "creatives_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

