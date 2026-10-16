-- Base > Kitleler: kitle şablonunun Google karşılığı (2026-10-16).
-- ilgiler = Google'ın ilgi (affinity) ve satın alma niyeti (in-market)
-- kategorileri, user_interest kimliğiyle; kelimeler = özel segmentin arama
-- terimleri. Var olan satırlar BOŞ karşılıkla doğuyor: şablonun Meta tarafı
-- değişmiyor ve eski istemciler alanı hiç göndermese de satır geçerli.
ALTER TABLE "audience_templates"
  ADD COLUMN "google_hedefleri" JSONB NOT NULL DEFAULT '{"ilgiler":[],"kelimeler":[]}'::jsonb;
