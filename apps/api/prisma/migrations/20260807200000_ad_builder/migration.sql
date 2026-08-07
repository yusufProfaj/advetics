-- Reklam Oluşturucu — Modül 4 (CREATE)
--
-- Reklamcılık bilmeyen biri için tek reklam üreten adım adım akış. Toplu
-- oluşturucudan (bulk_batches) AYRI tablo: o deneyimli kullanıcı için,
-- elektronik tablo mantığında, kısmi başarı yönetimiyle; bu ise tek reklam ve
-- tek sonuç. Tek tabloda birleştirmek ikisinin de doğrulamasını bozardı.

-- CreateTable
CREATE TABLE "ad_drafts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "social_profile_id" UUID NOT NULL,
    "goal" VARCHAR(16) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "primary_text" VARCHAR(2000) NOT NULL,
    "headline" VARCHAR(255),
    "description" VARCHAR(255),
    "link_url" VARCHAR(2048),
    "whatsapp_number" VARCHAR(20),
    "daily_budget_micros" BIGINT NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 7,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "external_campaign_id" VARCHAR(128),
    "external_ad_set_id" VARCHAR(128),
    "external_creative_id" VARCHAR(128),
    "external_ad_id" VARCHAR(128),
    "external_lead_form_id" VARCHAR(128),
    "error" VARCHAR(2000),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "ad_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_draft_assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "draft_id" UUID NOT NULL,
    "ratio" VARCHAR(12) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(60) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "storage_key" VARCHAR(500) NOT NULL,
    "meta_image_hash" VARCHAR(128),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_draft_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_drafts_client_id_created_at_idx" ON "ad_drafts"("client_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ad_draft_assets_draft_id_ratio_key" ON "ad_draft_assets"("draft_id", "ratio");

-- AddForeignKey
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_drafts" ADD CONSTRAINT "ad_drafts_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_draft_assets" ADD CONSTRAINT "ad_draft_assets_draft_id_fkey" FOREIGN KEY ("draft_id") REFERENCES "ad_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

