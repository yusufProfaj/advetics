-- MARKA MERKEZİ BÖLÜM 4b — KİTLE ŞABLONUNDA META ÖZEL/BENZER KİTLELERİ
--
-- `[{ id, name, tip, mod: dahil|haric, hesapId, hesapAdi }]`. Kitle kimliği
-- REKLAM HESABINA bağlı; `hesapId` o yüzden her öğede ve yayın kontrolü
-- kampanyanın hesabıyla karşılaştırıyor. Özel reklam kategorisinde hiç
-- gönderilmiyor (restrictTargetingFor).

ALTER TABLE "audience_templates"
  ADD COLUMN "ozel_kitleler" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "audience_templates"
  ADD CONSTRAINT "audience_templates_ozel_kitleler_dizi" CHECK (jsonb_typeof("ozel_kitleler") = 'array');
