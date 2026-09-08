-- AI KAMPANYA ASİSTANI — KALICI SOHBET GEÇMİŞİ
--
-- Panel içi sohbetten "form kampanyası aç" gibi bir promptla taslak
-- oluşturulduğunda, bir yöneticinin "bu taslağı hangi promptla, hangi tool
-- sonucuyla oluşturdu" sorusuna cevap verebilmesi gerekiyor. `audit_logs`
-- YALNIZCA nihai değişikliği (before/after) tutuyor, konuşmanın kendisini
-- değil — bu iki tablo o boşluğu dolduruyor.

CREATE TYPE "AiMessageRole" AS ENUM ('user', 'assistant', 'tool');

CREATE TABLE "ai_conversations" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"     UUID           NOT NULL,
  -- KASITLI OLARAK client_id'ye FK YOK — audit_logs.client_id ile aynı
  -- gerekçe: bir ilişki ya CASCADE ile bu geçmişi müşteri silinince yok
  -- ederdi ya da RESTRICT ile reset-clients script'ini "riskli adım önce"
  -- tuzağına bir kez daha düşürürdü.
  "client_id"  UUID,
  -- user_id de düz kolon, users'a FK DEĞİL: kullanıcı silinse bile geçmiş kalmalı.
  "user_id"    UUID           NOT NULL,
  "title"      VARCHAR(200),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_conversations_org_client_updated_idx"
  ON "ai_conversations" ("org_id", "client_id", "updated_at" DESC);
CREATE INDEX "ai_conversations_user_updated_idx"
  ON "ai_conversations" ("user_id", "updated_at" DESC);

ALTER TABLE "ai_conversations"
  ADD CONSTRAINT "ai_conversations_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ai_messages" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "conversation_id" UUID           NOT NULL,
  "role"            "AiMessageRole" NOT NULL,
  -- Anthropic mesaj biçimiyle AYNI ŞEKİL, ayrıştırılmadan saklanıyor.
  "content"         JSONB          NOT NULL,
  -- role = 'tool' iken hangi tool çalıştı.
  "tool_name"       VARCHAR(80),
  -- Yazma tool'unun {status, reason?, detail?, targetId?} sonucu.
  -- target_id, audit_logs.target_id ile çapraz sorgulanabiliyor.
  "tool_result"     JSONB,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ai_messages_conversation_created_idx"
  ON "ai_messages" ("conversation_id", "created_at");

ALTER TABLE "ai_messages"
  ADD CONSTRAINT "ai_messages_conversation_id_fkey"
  FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
