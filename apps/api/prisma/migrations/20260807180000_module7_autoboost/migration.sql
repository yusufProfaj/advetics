-- Modül 7 — Auto-Boost
--
-- Kural motorundan (Modül 5) TERS asimetri: orada aksiyon harcamayı
-- DURDURUYOR, burada BAŞLATIYOR. Yanlış duraklatılan kampanya yeniden açılır;
-- harcanan para geri gelmez. Bu yüzden prova modu yetmiyor, ONAY AKIŞI var.

-- CreateTable
CREATE TABLE "organic_posts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "social_profile_id" UUID NOT NULL,
    "external_id" VARCHAR(128) NOT NULL,
    "media_type" VARCHAR(20) NOT NULL,
    "message" VARCHAR(3000),
    "permalink" VARCHAR(1024),
    "thumbnail_url" VARCHAR(1024),
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "video_views" INTEGER NOT NULL DEFAULT 0,
    "engagements" INTEGER NOT NULL DEFAULT 0,
    "boosted_at" TIMESTAMPTZ(6),
    "raw" JSONB,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "organic_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boost_rules" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "social_profile_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "conditions" JSONB NOT NULL,
    "combinator" VARCHAR(3) NOT NULL DEFAULT 'and',
    "max_post_age_hours" INTEGER NOT NULL DEFAULT 72,
    "min_post_age_hours" INTEGER NOT NULL DEFAULT 6,
    "daily_budget_micros" BIGINT NOT NULL,
    "duration_days" INTEGER NOT NULL DEFAULT 3,
    "objective" VARCHAR(60) NOT NULL DEFAULT 'OUTCOME_ENGAGEMENT',
    "monthly_cap_micros" BIGINT NOT NULL,
    "max_boosts_per_run" INTEGER NOT NULL DEFAULT 3,
    "auto_approve" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "boost_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boosts" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "boost_rule_id" UUID,
    "organic_post_id" UUID NOT NULL,
    "ad_account_id" UUID NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'candidate',
    "daily_budget_micros" BIGINT NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "objective" VARCHAR(60) NOT NULL,
    "reason" VARCHAR(500) NOT NULL,
    "external_campaign_id" VARCHAR(128),
    "external_ad_set_id" VARCHAR(128),
    "external_ad_id" VARCHAR(128),
    "error" VARCHAR(1000),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "created_on_platform_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "boosts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "organic_posts_client_id_published_at_idx" ON "organic_posts"("client_id", "published_at" DESC);

-- CreateIndex
CREATE INDEX "organic_posts_social_profile_id_boosted_at_idx" ON "organic_posts"("social_profile_id", "boosted_at");

-- CreateIndex
CREATE UNIQUE INDEX "organic_posts_social_profile_id_external_id_key" ON "organic_posts"("social_profile_id", "external_id");

-- CreateIndex
CREATE INDEX "boost_rules_client_id_enabled_idx" ON "boost_rules"("client_id", "enabled");

-- CreateIndex
CREATE INDEX "boosts_client_id_status_created_at_idx" ON "boosts"("client_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "boosts_boost_rule_id_created_at_idx" ON "boosts"("boost_rule_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "organic_posts" ADD CONSTRAINT "organic_posts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organic_posts" ADD CONSTRAINT "organic_posts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organic_posts" ADD CONSTRAINT "organic_posts_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boost_rules" ADD CONSTRAINT "boost_rules_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boost_rules" ADD CONSTRAINT "boost_rules_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boost_rules" ADD CONSTRAINT "boost_rules_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_boost_rule_id_fkey" FOREIGN KEY ("boost_rule_id") REFERENCES "boost_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_organic_post_id_fkey" FOREIGN KEY ("organic_post_id") REFERENCES "organic_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_ad_account_id_fkey" FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- -----------------------------------------------------------------------------
-- AYNI GÖNDERİ İKİ KEZ BOOST EDİLMESİN
--
-- Kısmi tekil indeks: yalnızca "canlı" sayılan durumlar çakışıyor. Reddedilmiş
-- ya da başarısız bir boost yeniden denenebilmeli — aksi hâlde bir kez
-- reddedilen gönderi sonsuza kadar kilitli kalırdı.
--
-- Bu kısıt olmadan kuralın iki kez çalışması (gecikme, yeniden deneme, iki
-- worker) aynı gönderi için iki kampanya açardı ve bütçe iki katına çıkardı.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX "boosts_active_post_uniq"
  ON "boosts" ("organic_post_id")
  WHERE "status" IN ('candidate', 'approved', 'creating', 'active');
