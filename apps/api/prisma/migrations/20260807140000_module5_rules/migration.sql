-- Modül 5 — Kural motoru
--
-- Bu modülün diğerlerinden farkı: buradaki bir hata veriyi yanlış GÖSTERMİYOR,
-- müşterinin kampanyasını YANLIŞ DURDURUYOR. Şemadaki her varsayılan bu
-- asimetriye göre seçildi — kurallar prova modunda doğuyor (dry_run = true),
-- bekleme süresi 24 saat, tek turda azami 20 varlık.

-- CreateTable
CREATE TABLE "rules" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "ad_account_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "level" "EntityLevel" NOT NULL,
    "conditions" JSONB NOT NULL,
    "combinator" VARCHAR(3) NOT NULL DEFAULT 'and',
    "action" JSONB NOT NULL,
    "guard" JSONB NOT NULL,
    "cooldown_minutes" INTEGER NOT NULL DEFAULT 1440,
    "max_actions_per_run" INTEGER NOT NULL DEFAULT 20,
    "max_data_age_hours" INTEGER NOT NULL DEFAULT 36,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "dry_run" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "last_triggered_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_runs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "dry_run" BOOLEAN NOT NULL,
    "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "evaluated_count" INTEGER NOT NULL DEFAULT 0,
    "matched_count" INTEGER NOT NULL DEFAULT 0,
    "action_count" INTEGER NOT NULL DEFAULT 0,
    "error" VARCHAR(2000),

    CONSTRAINT "rule_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rule_action_logs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "entity_level" "EntityLevel" NOT NULL,
    "entity_id" UUID NOT NULL,
    "entity_name" VARCHAR(300) NOT NULL,
    "entity_external_id" VARCHAR(128) NOT NULL,
    "action_type" VARCHAR(20) NOT NULL,
    "outcome" VARCHAR(24) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "before_state" JSONB,
    "after_state" JSONB,
    "error" VARCHAR(1000),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rule_action_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rules_client_id_enabled_idx" ON "rules"("client_id", "enabled");

-- CreateIndex
CREATE INDEX "rules_enabled_last_run_at_idx" ON "rules"("enabled", "last_run_at");

-- CreateIndex
CREATE INDEX "rule_runs_rule_id_started_at_idx" ON "rule_runs"("rule_id", "started_at" DESC);

-- CreateIndex
CREATE INDEX "rule_action_logs_rule_id_entity_id_created_at_idx" ON "rule_action_logs"("rule_id", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "rule_action_logs_run_id_idx" ON "rule_action_logs"("run_id");

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rules" ADD CONSTRAINT "rules_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_runs" ADD CONSTRAINT "rule_runs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_action_logs" ADD CONSTRAINT "rule_action_logs_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rule_action_logs" ADD CONSTRAINT "rule_action_logs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "rule_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- BEKLEME SÜRESİ SORGUSUNUN İNDEKSİ
--
-- "Bu kural bu varlığa en son ne zaman DOKUNDU" sorusu her değerlendirmede,
-- her varlık için soruluyor. Atlanan kayıtlar bekleme başlatmıyor, dolayısıyla
-- sorgu yalnızca uygulanan/prova edilen satırlara bakıyor — kısmi indeks tam da
-- o satırları kapsıyor ve atlananların çoğunlukta olduğu bir tabloda indeksi
-- küçük tutuyor.
-- -----------------------------------------------------------------------------
CREATE INDEX "rule_action_logs_cooldown_idx"
  ON "rule_action_logs" ("rule_id", "entity_id", "created_at" DESC)
  WHERE "outcome" IN ('applied', 'simulated');
