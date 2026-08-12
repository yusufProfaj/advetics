-- Formlar kütüphanesi — Meta Anlık Form (Instant Form)
--
-- SÜRÜM ZİNCİRİ TASARIMIN MERKEZİ.
--
-- Meta'da yayınlanmış bir form değiştirilemiyor: kullanıcılar belirli bir
-- onay metnini kabul ederek veri verdi ve o metnin sonradan değişmesi onayı
-- geçersiz kılar. Bu yüzden "güncelleme" diye bir satır işlemi yok — yayınlanmış
-- bir formun düzenlenmesi YENİ BİR SATIR üretiyor.
--
-- `root_id` zincirin ilk halkasını gösteriyor ve İLK SÜRÜMDE KENDİ KİMLİĞİ
-- oluyor. Alternatif (ilk sürümde NULL) her sorguya bir COALESCE ekletirdi ve
-- "bu formun tüm sürümleri" sorgusu iki dala ayrılırdı.
--
-- `superseded_by_id` geriye değil İLERİYE bakıyor: eski satır yeni sürümü
-- işaret ediyor. Arayüzün sorduğu soru "bu formun daha yenisi var mı" ve bu
-- yönde cevap tek satır okumakla geliyor.

-- CreateTable
CREATE TABLE "lead_forms" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "social_profile_id" UUID NOT NULL,

    "name" VARCHAR(200) NOT NULL,
    "form_type" VARCHAR(16) NOT NULL DEFAULT 'more_volume',

    "headline" VARCHAR(60),
    "intro" VARCHAR(1000),

    -- Sorular JSONB: sayıları ve şekilleri değişken, ayrı tabloya bölmek
    -- her okumada JOIN demek olurdu ve tek başına anlamı olan veri değiller.
    "prefill_questions" JSONB NOT NULL,
    "custom_questions" JSONB NOT NULL DEFAULT '[]'::jsonb,

    "privacy_policy_url" VARCHAR(2048) NOT NULL,
    "privacy_policy_link_text" VARCHAR(80) NOT NULL DEFAULT 'Gizlilik Politikası',
    "consent_boxes" JSONB NOT NULL DEFAULT '[]'::jsonb,

    "thank_you_headline" VARCHAR(60) NOT NULL DEFAULT 'Teşekkürler!',
    "thank_you_body" VARCHAR(300) NOT NULL DEFAULT '',
    "thank_you_cta_text" VARCHAR(40) NOT NULL DEFAULT '',
    "thank_you_cta_url" VARCHAR(2048),

    "status" VARCHAR(16) NOT NULL DEFAULT 'draft',
    "external_form_id" VARCHAR(128),

    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID NOT NULL,
    "superseded_by_id" UUID,

    "error" VARCHAR(2000),
    "published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "lead_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lead_forms_client_id_created_at_idx" ON "lead_forms"("client_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "lead_forms_root_id_version_idx" ON "lead_forms"("root_id", "version");

-- Meta'daki form kimliği tekil.
--
-- İki satırın aynı `external_form_id`'yi göstermesi, sürüm zincirinin
-- bozulduğu anlamına gelir: yayın iki kez çalışmış ve biri kaydedilememiştir.
-- Kısmi indeks çünkü yayınlanmamış formlarda NULL ve NULL'lar çakışmaz.
CREATE UNIQUE INDEX "lead_forms_external_uniq"
  ON "lead_forms"("external_form_id")
  WHERE "external_form_id" IS NOT NULL;

-- AddForeignKey
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_social_profile_id_fkey" FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sürüm zinciri kendi kendine referans veriyor.
--
-- ON DELETE: root için CASCADE (kök giderse tüm sürümler gitmeli),
-- superseded_by için SET NULL (yeni sürüm silinirse eski sürüm kalmalı ve
-- "yenisi var" işaretini kaybetmeli — aksi hâlde var olmayan bir satırı
-- işaret eder).
ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_root_id_fkey" FOREIGN KEY ("root_id") REFERENCES "lead_forms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_forms" ADD CONSTRAINT "lead_forms_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "lead_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
