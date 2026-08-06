-- =============================================================================
-- MODÜL 6 — White-label raporlama
-- =============================================================================
--
-- İki tablo:
--   report_templates → hangi bölümler, hangi sırada, hangi başlıklarla
--   report_shares    → müşteriye gönderilen, oturum GEREKTİRMEYEN link
--
-- `report_shares.token_hash` HASH'lenmiş saklanıyor (ham token yalnızca üretim
-- anında bir kez gösteriliyor): veritabanı sızarsa paylaşım linkleri geçersiz
-- kalır. Aynı yaklaşım refresh_tokens tablosunda da var.
--
-- RLS politikaları prisma/sql/02_rls.sql içinde. Bu tablolar için politika
-- eklemeyi atlamak, bir müşterinin başka müşterinin raporunu görmesi demek —
-- CI'daki RLS kapsama kontrolü bu yüzden var.
-- =============================================================================

CREATE TYPE "ReportStatus" AS ENUM ('draft', 'published', 'archived');

CREATE TABLE "report_templates" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "title" VARCHAR(200),
    "closing_text" TEXT,
    "sections" JSONB NOT NULL,
    "options" JSONB,
    "status" "ReportStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "report_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_shares" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "expires_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "last_view_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,

    CONSTRAINT "report_shares_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_templates_org_id_client_id_idx" ON "report_templates"("org_id", "client_id");
CREATE UNIQUE INDEX "report_shares_token_hash_key" ON "report_shares"("token_hash");
CREATE INDEX "report_shares_client_id_created_at_idx" ON "report_shares"("client_id", "created_at" DESC);

ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
