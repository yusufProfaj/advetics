-- CreateEnum
CREATE TYPE "DataDeletionStatus" AS ENUM ('received', 'completed', 'failed');

-- AlterTable
ALTER TABLE "branding_profiles" ALTER COLUMN "primary_color" SET DEFAULT '#E11D2E',
ALTER COLUMN "accent_color" SET DEFAULT '#F97316';

-- CreateTable
CREATE TABLE "data_deletion_requests" (
    "id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_user_id" VARCHAR(128) NOT NULL,
    "confirmation_code" VARCHAR(64) NOT NULL,
    "status" "DataDeletionStatus" NOT NULL DEFAULT 'received',
    "deleted_connections" INTEGER NOT NULL DEFAULT 0,
    "affected_client_ids" JSONB,
    "error_message" VARCHAR(500),
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ(6),
    "ip" INET,

    CONSTRAINT "data_deletion_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_deletion_requests_confirmation_code_key" ON "data_deletion_requests"("confirmation_code");

-- CreateIndex
CREATE INDEX "data_deletion_requests_external_user_id_idx" ON "data_deletion_requests"("external_user_id");

-- CreateIndex
CREATE INDEX "data_deletion_requests_requested_at_idx" ON "data_deletion_requests"("requested_at");

