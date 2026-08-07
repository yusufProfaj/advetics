-- Modül 8 — Toplu Oluşturucu
--
-- PARTİ VE SATIR AYRI TABLOLARDA. Tek bir JSONB dizisi olarak saklamak cazip
-- ama yanlış: 60 reklamlık bir partide 3'ü başarısız olduğunda hangilerinin
-- platformda oluştuğunu SATIR BAZINDA bilmek gerekiyor. Diziyi güncellemek,
-- kısmi başarıyı takip edilemez kılardı ve yeniden yayınlama, başarılı
-- olanları ikinci kez oluştururdu.

-- CreateTable
CREATE TABLE "bulk_batches" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "defaults" JSONB NOT NULL,
    "target_campaign_external_id" VARCHAR(128),
    "published_at" TIMESTAMPTZ(6),
    "published_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "bulk_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_items" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "primary_text" VARCHAR(8000),
    "headline" VARCHAR(2000),
    "description" VARCHAR(2000),
    "link_url" VARCHAR(2048),
    "call_to_action" VARCHAR(60),
    "media_ref" VARCHAR(1024),
    "overrides" JSONB,
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',
    "issues" JSONB,
    "external_ad_id" VARCHAR(128),
    "external_creative_id" VARCHAR(128),
    "external_ad_set_id" VARCHAR(128),
    "error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "bulk_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulk_batches_client_id_created_at_idx" ON "bulk_batches"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "bulk_items_batch_id_status_idx" ON "bulk_items"("batch_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_items_batch_id_row_number_key" ON "bulk_items"("batch_id", "row_number");

-- AddForeignKey
ALTER TABLE "bulk_batches" ADD CONSTRAINT "bulk_batches_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_batches" ADD CONSTRAINT "bulk_batches_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_batches" ADD CONSTRAINT "bulk_batches_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_items" ADD CONSTRAINT "bulk_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "bulk_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

