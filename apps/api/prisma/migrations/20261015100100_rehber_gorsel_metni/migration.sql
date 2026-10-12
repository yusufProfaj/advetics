-- GÖRSELE ÖZEL METİN ÖNBELLEĞİ (AdvCampaign Dalga 2, 2026-10-12).
--
-- Görsel bırakıldığı an yapay zekâ o görsele metin yazıyor. Aynı görsel
-- (aynı İÇERİK, assets.content_hash) aynı amaçla yeniden bırakılınca
-- Gemini'ye tekrar gidilmez: görsel başına tek çağrı. Anahtar varlık
-- kimliği DEĞİL içerik özeti: aynı dosya iki kez yüklenince de tutuyor ve
-- varlık silinip yeniden yüklenince önbellek boşa gitmiyor.
--
-- Satır workspace'e ait (client_id); "Yeniden yaz" aynı satırı günceller,
-- yani yalnız SON sonuç saklanır (bir sonraki "yeniden yaz" onu tekrar
-- etmemesi için modele verilir).
CREATE TABLE "rehber_gorsel_metni" (
  "org_id"       UUID           NOT NULL,
  "client_id"    UUID           NOT NULL,
  "icerik_ozeti" CHAR(64)       NOT NULL,
  "amac"         VARCHAR(20)    NOT NULL,
  -- Yalnız metinOnerisiTemizle'den geçmiş öneri; ham model çıktısı buraya girmez.
  "sonuc"        JSONB          NOT NULL,
  "model"        VARCHAR(60)    NOT NULL,
  "girdi_token"  INTEGER        NOT NULL DEFAULT 0,
  "cikti_token"  INTEGER        NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "rehber_gorsel_metni_pkey" PRIMARY KEY ("client_id", "icerik_ozeti", "amac"),
  CONSTRAINT "rehber_gorsel_metni_ozet_chk" CHECK ("icerik_ozeti" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "rehber_gorsel_metni_nesne_chk" CHECK (jsonb_typeof("sonuc") = 'object')
);
CREATE INDEX "rehber_gorsel_metni_org_id_idx" ON "rehber_gorsel_metni" ("org_id");
ALTER TABLE "rehber_gorsel_metni" ADD CONSTRAINT "rehber_gorsel_metni_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
