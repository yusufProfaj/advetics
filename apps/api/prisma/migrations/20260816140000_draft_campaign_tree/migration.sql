-- Kampanya taslağı ağacı
--
-- ADLANDIRMA SENKRONİZE OKUMA TARAFINI AYNALIYOR:
--   campaigns       → ad_groups       → ads          (platformdan okunan)
--   draft_campaigns → draft_ad_groups → draft_ads    (bizim kurduğumuz)
--
-- Ayna kasıtlı: taslak yayınlandığında bu ağaç senkronize satırlara bağlanıyor
-- ve "yayınladığım şey şu anda ne durumda" sorusu tek eşlemeyle cevaplanıyor.
-- Bugün `ad_drafts.external_campaign_id` ile `campaigns.external_id` arasında
-- panelde hiçbir bağ yok.
--
-- BU MIGRATION DA HİÇBİR MEVCUT TABLOYU DEĞİŞTİRMİYOR. `ad_drafts` ve
-- `ad_draft_assets` yerinde duruyor ve çalışmaya devam ediyor; ağaç onların
-- yerini alacak ama göç ayrı bir iş (tasarım belgesi K11) ve üretimdeki taslak
-- sayısı öğrenilmeden yapılmayacak.

-- -----------------------------------------------------------------------------
-- draft_campaigns — BİR TASLAK = BİR PLATFORM
--
-- Aynı niyetin iki platformdaki karşılığı `group_id` ile bağlanıyor, tek satırda
-- birleştirilmiyor. Sebebi kısmi başarı: Meta çıkar, Google düşer ve bu istisna
-- değil normal sonuçtur. Tek `status` alanı iki gerçeği taşıyamıyor —
-- "başarısız" demek yayındaki Meta reklamını gizler, "yayında" demek hiç
-- oluşmamış Google kampanyasını var gösterir.
-- -----------------------------------------------------------------------------
CREATE TABLE "draft_campaigns" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    -- Aynı niyetin diğer platformdaki eşi. NULL = tek platformluk taslak.
    -- Kendi tablosu YOK: grubun kampanya adından başka özniteliği olmayacak.
    "group_id" UUID,

    "platform" "Platform" NOT NULL,
    "ad_account_id" UUID NOT NULL,

    "name" VARCHAR(200) NOT NULL,

    -- simple | expert — hangi YÜZEYDEN kuruldu.
    --
    -- `ad_drafts.mode` (simple/advanced) bir anahtardı: aynı taslağın üzerinde
    -- iki görünüm. Burada iki AYRI yüzey var ve kolonun işi "bu taslağı hangi
    -- ekran açsın" sorusunu cevaplamak.
    "surface" VARCHAR(10) NOT NULL DEFAULT 'simple',

    -- form | whatsapp | website. UZMAN YÜZEYİNDE NULL: uzman hedefi değil,
    -- doğrudan platformun amacını seçiyor.
    "goal" VARCHAR(16),

    "settings" JSONB,

    -- daily | lifetime | none. Bütçe iki seviyede olabilir (Meta CBO/ABO);
    -- Google'da her zaman kampanya seviyesinde.
    "budget_mode" VARCHAR(10) NOT NULL DEFAULT 'none',
    "budget_amount_micros" BIGINT,

    "start_at" TIMESTAMPTZ(6),
    "end_at" TIMESTAMPTZ(6),

    -- draft | publishing | published | failed — PLATFORM BAŞINA.
    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',

    "external_campaign_id" VARCHAR(128),
    "error" VARCHAR(2000),
    "published_at" TIMESTAMPTZ(6),

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by" UUID,

    CONSTRAINT "draft_campaigns_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- draft_ad_groups — Meta'da ad set, Google'da ad group
--
-- ÇOKLU: şema baştan birden fazla grubu taşıyor ama arayüz ilk turda tek grup
-- gösteriyor. Şemayı sonradan çoğaltmak migration demek; arayüzü açmak bir
-- ekran işi.
-- -----------------------------------------------------------------------------
CREATE TABLE "draft_ad_groups" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,

    "name" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    -- Reklamın yayınlanacağı Facebook sayfası. Google'da NULL.
    "social_profile_id" UUID,
    "lead_form_id" UUID,

    "settings" JSONB,

    "budget_mode" VARCHAR(10) NOT NULL DEFAULT 'none',
    "budget_amount_micros" BIGINT,

    "external_ad_set_id" VARCHAR(128),
    "error" VARCHAR(2000),

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "draft_ad_groups_pkey" PRIMARY KEY ("id")
);

-- -----------------------------------------------------------------------------
-- draft_ads
--
-- BU TABLONUN VARLIK SEBEBİ A/B TESTİ. Bugün bir taslak tek bir reklam demek ve
-- aynı reklam grubuna ikinci bir metin/görsel denemesi eklemenin yolu yok.
-- Ajans pratiğinde reklam grubu başına 3-5 kreatif standart.
-- -----------------------------------------------------------------------------
CREATE TABLE "draft_ads" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "ad_group_id" UUID NOT NULL,
    "creative_id" UUID NOT NULL,

    "name" VARCHAR(200) NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    "external_ad_id" VARCHAR(128),
    "external_creative_id" VARCHAR(128),
    "error" VARCHAR(2000),

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "draft_ads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "draft_campaigns_client_id_created_at_idx"
    ON "draft_campaigns"("client_id", "created_at" DESC);
CREATE INDEX "draft_campaigns_group_id_idx" ON "draft_campaigns"("group_id");
CREATE INDEX "draft_ad_groups_campaign_id_position_idx"
    ON "draft_ad_groups"("campaign_id", "position");
CREATE INDEX "draft_ads_ad_group_id_position_idx" ON "draft_ads"("ad_group_id", "position");
CREATE INDEX "draft_ads_creative_id_idx" ON "draft_ads"("creative_id");

ALTER TABLE "draft_campaigns"
    ADD CONSTRAINT "draft_campaigns_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_campaigns"
    ADD CONSTRAINT "draft_campaigns_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_campaigns"
    ADD CONSTRAINT "draft_campaigns_ad_account_id_fkey"
    FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_ad_groups"
    ADD CONSTRAINT "draft_ad_groups_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_ad_groups"
    ADD CONSTRAINT "draft_ad_groups_campaign_id_fkey"
    FOREIGN KEY ("campaign_id") REFERENCES "draft_campaigns"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- SAYFA SİLİNİRSE GRUP KALIYOR (SET NULL). Taslağı yok etmek yerine eksik
-- bırakmak doğru: yayın kontrolü sayfanın eksik olduğunu zaten söylüyor ve
-- kullanıcı başka sayfa seçebiliyor.
ALTER TABLE "draft_ad_groups"
    ADD CONSTRAINT "draft_ad_groups_social_profile_id_fkey"
    FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "draft_ad_groups"
    ADD CONSTRAINT "draft_ad_groups_lead_form_id_fkey"
    FOREIGN KEY ("lead_form_id") REFERENCES "lead_forms"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "draft_ads"
    ADD CONSTRAINT "draft_ads_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "draft_ads"
    ADD CONSTRAINT "draft_ads_ad_group_id_fkey"
    FOREIGN KEY ("ad_group_id") REFERENCES "draft_ad_groups"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- KULLANIMDA OLAN KREATİF SİLİNEMİYOR (RESTRICT).
--
-- Cascade olsaydı kütüphaneden bir kreatifi silmek, ona bağlı taslak reklamları
-- sessizce yok ederdi — kullanıcı kütüphaneyi topluyor sanır, kampanyası
-- eksilir. Restrict, silmeyi reddedip sebebini söylüyor.
ALTER TABLE "draft_ads"
    ADD CONSTRAINT "draft_ads_creative_id_fkey"
    FOREIGN KEY ("creative_id") REFERENCES "ad_creatives"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
