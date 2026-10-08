-- OKUMA API ANAHTARLARI — platform sahibinin yapay zekâ (MCP) kapısı.
-- Sözleşme packages/shared/src/okuma-api. Yeni tablo; var olan hiçbir
-- nesneye dokunmuyor, yani üretim sırasında (kısıtlar önceden duruyor)
-- çakışacak bir şey yok. Politikalar 02_rls.sql içinde (db:rls).
--
-- Düz anahtar SAKLANMIYOR: anahtar_ozeti SHA-256 hex, tekil. Doğrulama
-- bu indeksle tek satır arıyor.
CREATE TABLE "okuma_api_anahtarlari" (
    "id"              UUID         NOT NULL,
    "user_id"         UUID         NOT NULL,
    "ad"              VARCHAR(80)  NOT NULL,
    "gorunen_onek"    VARCHAR(20)  NOT NULL,
    "anahtar_ozeti"   CHAR(64)     NOT NULL,
    "bitis"           TIMESTAMPTZ(6),
    "son_kullanim"    TIMESTAMPTZ(6),
    "son_kullanim_ip" VARCHAR(64),
    "iptal"           TIMESTAMPTZ(6),
    "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "okuma_api_anahtarlari_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "okuma_api_anahtarlari_anahtar_ozeti_key" ON "okuma_api_anahtarlari"("anahtar_ozeti");
CREATE INDEX "okuma_api_anahtarlari_user_id_idx" ON "okuma_api_anahtarlari"("user_id");

ALTER TABLE "okuma_api_anahtarlari" ADD CONSTRAINT "okuma_api_anahtarlari_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
