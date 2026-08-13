-- Varlık arşivi (BASE)
--
-- İKİ TABLO ve ayrımın sebebi Meta'nın çalışma biçimi.
--
-- `assets` bizim tarafımız: dosya bir kez yükleniyor, bir kez saklanıyor,
-- müşteriye ait.
--
-- `asset_platform_refs` platform tarafı: Meta'nın `image_hash` değeri REKLAM
-- HESABI BAŞINA üretiliyor. Aynı görsel iki hesapta kullanılıyorsa iki ayrı
-- hash var. Bunu `assets` içinde tek bir kolonda tutmak, A hesabına ait bir
-- hash'i B hesabında kullanmak demek — Meta bunu ya "Invalid parameter" ile
-- reddediyor ya da kreatifi görselsiz oluşturuyor ve reklam boş yayınlanıyor.
--
-- Mevcut `ad_draft_assets.meta_image_hash` kolonu YERİNDE KALIYOR: o bir
-- taslağa ait ve taslak tek bir reklam hesabına bağlı, yani orada tek kolon
-- doğru. Kütüphane varlığı ise hesaplar arası dolaşıyor.

CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    -- image | logo
    "kind" VARCHAR(12) NOT NULL DEFAULT 'image',

    "name" VARCHAR(200) NOT NULL,
    "file_name" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(60) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    "storage_key" VARCHAR(500) NOT NULL,

    -- İçerik özeti (SHA-256, ilk 32 karakter).
    --
    -- Aynı dosyanın ikinci kez yüklenmesini engelliyor. MÜŞTERİ BAZLI tekil:
    -- iki farklı müşterinin aynı stok fotoğrafı yüklemesi meşru ve zaten
    -- Meta'ya ayrı ayrı yüklenmeleri gerekiyor.
    "content_hash" VARCHAR(64) NOT NULL,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "assets_client_hash_uniq" ON "assets"("client_id", "content_hash");
CREATE INDEX "assets_client_kind_idx" ON "assets"("client_id", "kind", "created_at" DESC);

ALTER TABLE "assets" ADD CONSTRAINT "assets_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "assets" ADD CONSTRAINT "assets_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Platform karşılıkları.
CREATE TABLE "asset_platform_refs" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,
    "ad_account_id" UUID NOT NULL,
    -- Meta'da `image_hash`, Google'da varlık kaynak adı.
    "external_ref" VARCHAR(256) NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_platform_refs_pkey" PRIMARY KEY ("id")
);

-- VARLIK + HESAP TEKİL. Aynı görseli aynı hesaba iki kez yüklemek boşa kota;
-- kısıt bunu yarış durumunda bile engelliyor.
CREATE UNIQUE INDEX "asset_platform_refs_uniq"
  ON "asset_platform_refs"("asset_id", "ad_account_id");

ALTER TABLE "asset_platform_refs" ADD CONSTRAINT "asset_platform_refs_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "asset_platform_refs" ADD CONSTRAINT "asset_platform_refs_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hesap silinirse referans da gitsin: o hesapta artık geçerli olmayan bir
-- hash'i tutmak, ileride yeniden bağlanan bir hesapta yanlış hash kullanmak
-- demek olurdu.
ALTER TABLE "asset_platform_refs" ADD CONSTRAINT "asset_platform_refs_ad_account_id_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Taslak varlığını kütüphaneye bağlayan kolon.
--
-- NULL olabilir: kütüphane öncesi yüklenmiş taslak görselleri var ve onları
-- geriye dönük kütüphaneye taşımak, kullanıcının hiç görmediği kayıtları
-- arşivinde belirtmek olurdu.
ALTER TABLE "ad_draft_assets" ADD COLUMN "asset_id" UUID;

-- ON DELETE SET NULL: kütüphaneden bir varlık silinirse taslak ayakta
-- kalmalı. Taslağın kendi dosya kopyası var ve yayınlanmışsa reklam zaten
-- Meta'da çalışıyor.
ALTER TABLE "ad_draft_assets" ADD CONSTRAINT "ad_draft_assets_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ad_draft_assets_asset_id_idx" ON "ad_draft_assets"("asset_id");
