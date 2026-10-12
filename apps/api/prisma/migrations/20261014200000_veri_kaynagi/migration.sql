-- VERİ KAYNAKLARI — F1 GA4 OKUMA (Paket F, docs/veri-kaynagi/MIMARI.md § 2.2, § 3.1)
--
-- Üç tablo + sync_jobs.veri_kaynagi_id + sinyaller kod kısıtının genişlemesi.
-- Durum/tür kolonları VARCHAR + CHECK, enum DEĞİL: listeler
-- packages/shared/src/veri-kaynagi/ içinde kapalı ve bir değer eklemek ayrı
-- bir migration istemesin. CHECK listeleri shared listeleriyle AYNI olmak
-- zorunda; ayrışırlarsa INSERT üretimde patlar (veri-kaynagi-kayit.spec.ts
-- iki yönlü karşılaştırıyor).
--
-- Enum SyncJobType değerleri AYRI migration'da (20261014200100): aynı
-- transaction'da eklenen enum değeri kullanılamıyor.

-- ─── veri_kaynaklari ────────────────────────────────────────────────────────
--
-- Workspace ↔ dış kaynak bağı. HAVUZ YOK (MIMARI Ç-3): client_id NOT NULL.
-- Satır SİLİNMEZ; kaldırma durum değişikliği (kaldirildi) ve aynı mülk
-- yeniden bağlanınca aynı satır canlanır (ikinci satır = çift sayım).
CREATE TABLE "veri_kaynaklari" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"             UUID           NOT NULL,
  "client_id"          UUID           NOT NULL,
  "tur"                VARCHAR(30)    NOT NULL,
  "dis_kimlik"         VARCHAR(300)   NOT NULL,
  "ad"                 VARCHAR(200)   NOT NULL,
  -- Google/Meta kaynaklarında okumayı yapan bağlantı. Bağlantı silinirse
  -- kaynak durur ama veri kalır (ekranda izin_eksik/erisim_yok yazar).
  "connection_id"      UUID,
  -- YALNIZ MAĞAZA (F3): mağaza panelinde üretilen kimlik, CryptoService ile
  -- şifreli. Hiçbir liste sorgusu bu kolonu seçmiyor.
  "kimlik_enc"         BYTEA,
  "kimlik_ipucu"       VARCHAR(20),
  "saat_dilimi"        VARCHAR(64),
  "para_birimi"        CHAR(3),
  "durum"              VARCHAR(20)    NOT NULL DEFAULT 'etkin',
  -- Platformun cümlesi aynen (izin yok, mülk bulunamadı...).
  "son_hata"           TEXT,
  -- kaynak_yapi çıktısı (GA4: anahtar etkinlik listesi). yapi_zamani AYRI
  -- kolon: sağlık kontrolü "yapı son 36 saatte koştu mu" sorusunu jsonb
  -- açmadan sorabilsin.
  "yapi"               JSONB          NOT NULL DEFAULT '{}',
  "yapi_zamani"        TIMESTAMPTZ(6),
  "son_basarili_cekim" TIMESTAMPTZ(6),
  -- NULL = kurulum rehberi bağladı (MIMARI Ç-5, otomatik bağlama).
  "created_by"         UUID,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "veri_kaynaklari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "veri_kaynaklari_tur_chk" CHECK ("tur" IN (
    'ga4', 'search_console', 'merchant_center', 'meta_katalog', 'ikas', 'ticimax', 'shopify'
  )),
  CONSTRAINT "veri_kaynaklari_durum_chk" CHECK ("durum" IN (
    'etkin', 'izin_eksik', 'erisim_yok', 'hata', 'duraklatildi', 'kaldirildi'
  )),
  -- ŞİFRELİ KİMLİK YALNIZ MAĞAZADA. Google kaynağında dolu bir kimlik_enc,
  -- okuyan kodun hangi kimliği kullandığını belirsiz yapardı.
  CONSTRAINT "veri_kaynaklari_kimlik_chk" CHECK ("kimlik_enc" IS NULL OR "tur" IN ('ikas', 'ticimax', 'shopify'))
);
-- Ç-4: bir mülk bir şirkette tek workspace'e bağlı (ajans toplamında çift sayım).
CREATE UNIQUE INDEX "veri_kaynaklari_dis_kimlik_key" ON "veri_kaynaklari" ("org_id", "tur", "dis_kimlik");
CREATE INDEX "veri_kaynaklari_client_durum_idx" ON "veri_kaynaklari" ("client_id", "durum");
CREATE INDEX "veri_kaynaklari_org_id_idx" ON "veri_kaynaklari" ("org_id");
CREATE INDEX "veri_kaynaklari_connection_idx" ON "veri_kaynaklari" ("connection_id");
ALTER TABLE "veri_kaynaklari" ADD CONSTRAINT "veri_kaynaklari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "veri_kaynaklari" ADD CONSTRAINT "veri_kaynaklari_connection_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "platform_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "veri_kaynaklari" ADD CONSTRAINT "veri_kaynaklari_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── ga4_gunluk ─────────────────────────────────────────────────────────────
--
-- GA4 trafik raporu: gün × kaynak/ortam × kampanya. Anahtar etkinlik
-- kırılımıyla AYNI TABLODA DEĞİL: eventName boyutu satırı etkinlik başına
-- çoğaltıyor ve oturumu katlardı (shared ga4.ts başı).
-- satir_hash: SHA-256(kaynak/ortam, kampanya adı, kampanya kimliği, Ads
-- kampanya kimliği). PK'da metin yerine (btree satır sınırı).
CREATE TABLE "ga4_gunluk" (
  "gun"                   DATE           NOT NULL,
  "veri_kaynagi_id"       UUID           NOT NULL,
  "satir_hash"            CHAR(64)       NOT NULL,
  "client_id"             UUID           NOT NULL,
  "org_id"                UUID           NOT NULL,
  "kaynak_ortam"          VARCHAR(300)   NOT NULL,
  "kampanya_adi"          VARCHAR(300),
  "kampanya_kimligi"      VARCHAR(300),
  "ads_kampanya_kimligi"  VARCHAR(300),
  "oturum"                INTEGER        NOT NULL DEFAULT 0,
  "etkilesimli_oturum"    INTEGER        NOT NULL DEFAULT 0,
  -- TOPLANAMAZ (aynı kişi iki gün = iki satır). Panel gün toplamını
  -- "kullanıcı" diye YAZMAZ (GA4_METRIK_TANIMI).
  "kullanici"             INTEGER        NOT NULL DEFAULT 0,
  "anahtar_etkinlik"      NUMERIC        NOT NULL DEFAULT 0,
  "satin_alma"            NUMERIC        NOT NULL DEFAULT 0,
  "gelir_mikro"           BIGINT         NOT NULL DEFAULT 0,
  "para_birimi"           CHAR(3),
  "cekildi"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ga4_gunluk_pkey" PRIMARY KEY ("gun", "veri_kaynagi_id", "satir_hash")
);
CREATE INDEX "ga4_gunluk_client_gun_idx" ON "ga4_gunluk" ("client_id", "gun" DESC);
CREATE INDEX "ga4_gunluk_org_id_idx" ON "ga4_gunluk" ("org_id");
ALTER TABLE "ga4_gunluk" ADD CONSTRAINT "ga4_gunluk_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ga4_gunluk" ADD CONSTRAINT "ga4_gunluk_kaynak_fkey"
  FOREIGN KEY ("veri_kaynagi_id") REFERENCES "veri_kaynaklari"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── ga4_anahtar_etkinlik_gunluk ────────────────────────────────────────────
--
-- Aynı kırılım + etkinlik adı; YALNIZ anahtar etkinlik sayısı. ga4_gunluk ile
-- JOIN edilip TOPLANMAZ (satır çoğaltır).
CREATE TABLE "ga4_anahtar_etkinlik_gunluk" (
  "gun"                   DATE           NOT NULL,
  "veri_kaynagi_id"       UUID           NOT NULL,
  "satir_hash"            CHAR(64)       NOT NULL,
  "etkinlik"              VARCHAR(100)   NOT NULL,
  "client_id"             UUID           NOT NULL,
  "org_id"                UUID           NOT NULL,
  "kaynak_ortam"          VARCHAR(300)   NOT NULL,
  "kampanya_adi"          VARCHAR(300),
  "kampanya_kimligi"      VARCHAR(300),
  "ads_kampanya_kimligi"  VARCHAR(300),
  "anahtar_etkinlik"      NUMERIC        NOT NULL DEFAULT 0,
  "cekildi"               TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ga4_anahtar_etkinlik_gunluk_pkey" PRIMARY KEY ("gun", "veri_kaynagi_id", "satir_hash", "etkinlik")
);
CREATE INDEX "ga4_anahtar_etkinlik_gunluk_client_gun_idx" ON "ga4_anahtar_etkinlik_gunluk" ("client_id", "gun" DESC);
CREATE INDEX "ga4_anahtar_etkinlik_gunluk_org_id_idx" ON "ga4_anahtar_etkinlik_gunluk" ("org_id");
ALTER TABLE "ga4_anahtar_etkinlik_gunluk" ADD CONSTRAINT "ga4_anahtar_etkinlik_gunluk_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ga4_anahtar_etkinlik_gunluk" ADD CONSTRAINT "ga4_anahtar_etkinlik_gunluk_kaynak_fkey"
  FOREIGN KEY ("veri_kaynagi_id") REFERENCES "veri_kaynaklari"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── sync_jobs.veri_kaynagi_id ──────────────────────────────────────────────
--
-- sync_jobs YENİDEN KULLANILIYOR (takılan iş, kuyruk_vazgecti, teşhis):
-- kaynak işinde ad_account_id NULL, client_id DOLU, bu kolon dolu.
ALTER TABLE "sync_jobs" ADD COLUMN "veri_kaynagi_id" UUID;
ALTER TABLE "sync_jobs" ADD CONSTRAINT "sync_jobs_veri_kaynagi_fkey"
  FOREIGN KEY ("veri_kaynagi_id") REFERENCES "veri_kaynaklari"("id") ON DELETE SET NULL ON UPDATE CASCADE;
-- Ön koşul ("yapı son 36 saatte başarıyla koştu mu") ve teşhis bu indekse oturuyor.
CREATE INDEX "sync_jobs_veri_kaynagi_idx" ON "sync_jobs" ("veri_kaynagi_id", "job_type", "created_at" DESC);

-- ─── sinyaller: F1 sağlık kontrolleri ───────────────────────────────────────
--
-- Paket A'nın SAGLIK_DISARIDA listesindeki ga4_anahtar_etkinlik_yok artık
-- hesaplanıyor (veri ga4 tablolarında) ve üç yeni kontrol ekleniyor
-- (shared veri-kaynagi/saglik.ts). Kısıt tipe bağlı değil (VARCHAR), yani
-- düşürüp yeniden kurmak enum takası tuzağına düşmüyor.
ALTER TABLE "sinyaller" DROP CONSTRAINT "sinyaller_kod_chk";
ALTER TABLE "sinyaller" ADD CONSTRAINT "sinyaller_kod_chk" CHECK ("kod" IN (
  'harcama', 'gosterim', 'tiklama_orani', 'tiklama_basi_maliyet', 'donusum', 'donusum_basi_maliyet',
  'sifir_gosterim', 'reklam_onaysiz', 'donusum_kesildi', 'ga4_anahtar_etkinlik_yok', 'ga4_veri_gelmiyor', 'takip_acigi', 'utm_eksik'
));
