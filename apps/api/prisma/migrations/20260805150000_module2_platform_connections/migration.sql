-- CreateEnum
CREATE TYPE "ConnectionStatus" AS ENUM ('active', 'needs_reauth', 'revoked', 'error');

-- CreateEnum
CREATE TYPE "AdAccountStatus" AS ENUM ('active', 'paused', 'disabled', 'closed', 'unknown');

-- CreateEnum
CREATE TYPE "SocialProfileType" AS ENUM ('facebook_page', 'instagram_business');

-- CreateTable
CREATE TABLE "platform_connections" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_user_id" VARCHAR(128) NOT NULL,
    "account_label" VARCHAR(200) NOT NULL,
    "access_token_enc" BYTEA NOT NULL,
    "refresh_token_enc" BYTEA,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "token_expires_at" TIMESTAMPTZ(6),
    "granted_scopes" TEXT[],
    "status" "ConnectionStatus" NOT NULL DEFAULT 'active',
    "last_error_code" VARCHAR(80),
    "last_error_at" TIMESTAMPTZ(6),
    "last_verified_at" TIMESTAMPTZ(6),
    "failure_count" INTEGER NOT NULL DEFAULT 0,
    "connected_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),

    CONSTRAINT "platform_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_accounts" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "status" "AdAccountStatus" NOT NULL DEFAULT 'unknown',
    "manager_external_id" VARCHAR(128),
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_structure_sync_at" TIMESTAMPTZ(6),
    "last_insights_sync_at" TIMESTAMPTZ(6),
    "rate_limit_state" JSONB,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "social_profiles" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "profile_type" "SocialProfileType" NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "username" VARCHAR(200),
    "name" VARCHAR(200) NOT NULL,
    "picture_url" VARCHAR(1024),
    "linked_ad_account_id" UUID,
    "page_access_token_enc" BYTEA,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "sync_enabled" BOOLEAN NOT NULL DEFAULT false,
    "last_sync_at" TIMESTAMPTZ(6),
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_states" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "redirect_to" VARCHAR(512),
    "requested_scopes" TEXT[],
    "created_by_user_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "ip" INET,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_states_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "platform_connections_client_id_status_idx" ON "platform_connections"("client_id", "status");

-- CreateIndex
CREATE INDEX "platform_connections_status_token_expires_at_idx" ON "platform_connections"("status", "token_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_connections_client_id_platform_external_user_id_key" ON "platform_connections"("client_id", "platform", "external_user_id");

-- CreateIndex
CREATE INDEX "ad_accounts_client_id_sync_enabled_idx" ON "ad_accounts"("client_id", "sync_enabled");

-- CreateIndex
CREATE INDEX "ad_accounts_connection_id_idx" ON "ad_accounts"("connection_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_accounts_platform_external_id_client_id_key" ON "ad_accounts"("platform", "external_id", "client_id");

-- CreateIndex
CREATE INDEX "social_profiles_client_id_sync_enabled_idx" ON "social_profiles"("client_id", "sync_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "social_profiles_connection_id_external_id_key" ON "social_profiles"("connection_id", "external_id");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_states_token_hash_key" ON "oauth_states"("token_hash");

-- CreateIndex
CREATE INDEX "oauth_states_expires_at_idx" ON "oauth_states"("expires_at");

-- CreateIndex
CREATE INDEX "oauth_states_client_id_idx" ON "oauth_states"("client_id");

-- AddForeignKey
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_connected_by_user_id_fkey" FOREIGN KEY ("connected_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "platform_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "platform_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_linked_ad_account_id_fkey" FOREIGN KEY ("linked_ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

