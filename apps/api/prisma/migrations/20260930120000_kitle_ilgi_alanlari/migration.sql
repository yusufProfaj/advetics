-- MARKA MERKEZİ BÖLÜM 4c — KİTLE ŞABLONUNDA İLGİ ALANLARI
--
-- Meta ilgi alanları (`adinterest` kimlikleri). Yayında tek bir
-- `flexible_spec` grubunda "bunlardan biri" (birleşim) olarak gidiyor;
-- özel reklam kategorisinde hiç gönderilmiyor (restrictTargetingFor).
--
-- AYRI MIGRATION: 20260930090000 bir önceki deploy'la uygulanmış olabilir ve
-- uygulanmış bir dosyayı değiştirmek Prisma'nın checksum'ını bozar.

ALTER TABLE "audience_templates"
  ADD COLUMN "interests" JSONB NOT NULL DEFAULT '[]';

ALTER TABLE "audience_templates"
  ADD CONSTRAINT "audience_templates_interests_dizi" CHECK (jsonb_typeof("interests") = 'array');
