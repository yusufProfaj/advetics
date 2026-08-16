-- Kreatif — metin havuzu + görsel havuzu
--
-- META İLE GOOGLE'IN BİRLEŞTİĞİ YER. Kampanya, ad set ve yayın çağrısı
-- platforma özgü kalıyor ve kalmalı; birleşen tek şey kreatif.
--
-- Sebebi iki platformun metin isteğinin aynı şey olmaması:
--   Meta        1 birincil metin + 1 başlık + 1 açıklama
--   Google RSA  15'e kadar başlık (30 karakter) + 4'e kadar açıklama (90)
--
-- Bugünkü model bunu taşıyamıyor: metinler `ad_drafts` tablosunun üç sütununda
-- ve on beş başlık üç sütuna sığmıyor.
--
-- BU MIGRATION HİÇBİR MEVCUT TABLOYU DEĞİŞTİRMİYOR — yalnızca ekliyor.
-- Bilinçli: yeniden tasarımın ilk adımı bu ve fikir değişirse atılacak şey
-- göç etmiş veri değil, yeni bir tablo olsun istiyoruz. `ad_drafts` ve
-- `ad_draft_assets` yerinde duruyor ve çalışmaya devam ediyor.

CREATE TABLE "ad_creatives" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    "name" VARCHAR(200) NOT NULL,

    -- Metin havuzu — packages/shared `creativeTextsSchema`.
    --
    -- JSONB ÇÜNKÜ SAYILAR PLATFORMUN. Google RSA bugün 15 başlık istiyor,
    -- yarın 12 isteyebilir. Her parçaya sütun açmak, platformun her
    -- kararında migration demek olurdu.
    "texts" JSONB NOT NULL DEFAULT '{"headlines":[],"longHeadlines":[],"descriptions":[]}'::jsonb,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "created_by" UUID,

    CONSTRAINT "ad_creatives_pkey" PRIMARY KEY ("id")
);

-- Kreatif ↔ arşiv görseli.
--
-- ORAN TUTULMUYOR ve bu bilinçli. `ad_draft_assets` her satırda bir `ratio`
-- taşıyordu çünkü o kovalar Meta'nın kovalarıydı (square/vertical/horizontal).
-- Google başka oranlar istiyor (1.91:1, 4:5) ve aynı görsel iki platformda
-- iki farklı yuvaya düşebiliyor — oranı satıra yazmak, kreatifi bir platforma
-- bağlamak olurdu. Yerleşim eşlemesini `coverageFor` ölçülen boyutlardan
-- hesaplıyor ve iki platformu da biliyor.
CREATE TABLE "ad_creative_assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "creative_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,

    -- Sıra kullanıcının kararı, veritabanı sırası rastgele.
    "position" INTEGER NOT NULL DEFAULT 0,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "ad_creative_assets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ad_creatives_client_id_created_at_idx"
    ON "ad_creatives"("client_id", "created_at" DESC);

-- AYNI GÖRSEL BİR KREATİFE İKİ KEZ EKLENEMEZ. Meta böyle bir kreatifi kabul
-- ediyor ve ikinci kopyayı sessizce yok sayıyor; kullanıcı ise iki farklı
-- görsel yüklediğini sanıyor.
CREATE UNIQUE INDEX "ad_creative_assets_uniq"
    ON "ad_creative_assets"("creative_id", "asset_id");

CREATE INDEX "ad_creative_assets_asset_id_idx" ON "ad_creative_assets"("asset_id");

ALTER TABLE "ad_creatives"
    ADD CONSTRAINT "ad_creatives_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ad_creatives"
    ADD CONSTRAINT "ad_creatives_client_id_fkey"
    FOREIGN KEY ("client_id") REFERENCES "clients"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ad_creative_assets"
    ADD CONSTRAINT "ad_creative_assets_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ad_creative_assets"
    ADD CONSTRAINT "ad_creative_assets_creative_id_fkey"
    FOREIGN KEY ("creative_id") REFERENCES "ad_creatives"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- ARŞİVDEN SİLİNEN GÖRSEL KREATİFTEN DE DÜŞÜYOR (CASCADE).
--
-- Alternatif SET NULL olurdu ama `asset_id` zorunlu: görselsiz bir bağlantı
-- satırı hiçbir şey ifade etmiyor. Kreatifin kendisi ayakta kalıyor ve
-- kapsama raporu eksik yuvayı zaten söylüyor — sessizce görselsiz yayına
-- çıkan bir reklam olmuyor.
ALTER TABLE "ad_creative_assets"
    ADD CONSTRAINT "ad_creative_assets_asset_id_fkey"
    FOREIGN KEY ("asset_id") REFERENCES "assets"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
