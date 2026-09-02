-- PLATFORM FATURASI — RAPORA EK RESMİ BELGE
--
-- Müşteri raporu alırken Meta/Google faturasını da aynı mailde görsün diye.
--
-- ELLE YÜKLENİYOR ve bu zorunluluk: Google'ın InvoiceService ucu yalnızca
-- aylık faturalama (kredi hattı) hesaplarında çalışıyor (kartla ödeyende
-- "Cannot request invoices for a billing setup that is not on monthly
-- invoicing"), Meta'da ise fatura PDF'i döndüren bir uç hiç yok.

CREATE TABLE "fatura_belgeleri" (
  "id"                    UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"                UUID           NOT NULL,
  "client_id"             UUID           NOT NULL,
  "platform"              "Platform"     NOT NULL,
  -- YYYY-MM. Tarih aralığı değil AY: fatura bir aya ait.
  "donem"                 VARCHAR(7)     NOT NULL,
  "file_name"             VARCHAR(255)   NOT NULL,
  -- Dosyanın kendisi diskte; PDF'i BYTEA tutmak yedekleri ağırlaştırırdı.
  "storage_key"           VARCHAR(512)   NOT NULL,
  "byte_size"             INTEGER        NOT NULL,
  -- `NOT` SQL'de ayrılmış kelime; kolon adı `aciklama`.
  "aciklama"              VARCHAR(200),
  "uploaded_by_user_id"   UUID           NOT NULL,
  "uploaded_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "fatura_belgeleri_pkey" PRIMARY KEY ("id"),

  -- DÖNEM BİÇİMİ VERİTABANINDA DA DAYATILIYOR. Uygulamada Zod kontrol
  -- ediyor ama bozuk bir dönem ("2026-13", "Ağustos") eşleştirmeyi sessizce
  -- boşa düşürürdü: rapor faturayı bulamaz, kimse sebebini anlamaz.
  CONSTRAINT "fatura_belgeleri_donem_chk"
    CHECK ("donem" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "fatura_belgeleri_boyut_chk" CHECK ("byte_size" > 0)
);

-- BİR DÖNEM + BİR PLATFORM = BİR FATURA. İkinci yükleme öncekini
-- değiştiriyor; iki fatura dursaydı maile hangisinin gireceği belirsizdi.
CREATE UNIQUE INDEX "fatura_belgeleri_client_platform_donem_key"
  ON "fatura_belgeleri" ("client_id", "platform", "donem");
CREATE INDEX "fatura_belgeleri_client_donem_idx"
  ON "fatura_belgeleri" ("client_id", "donem");
CREATE INDEX "fatura_belgeleri_org_id_idx" ON "fatura_belgeleri" ("org_id");

ALTER TABLE "fatura_belgeleri"
  ADD CONSTRAINT "fatura_belgeleri_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fatura_belgeleri"
  ADD CONSTRAINT "fatura_belgeleri_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "fatura_belgeleri"
  ADD CONSTRAINT "fatura_belgeleri_uploaded_by_user_id_fkey"
  FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
