-- MCP İLE YAZMA (docs/okuma-api/MCP-YAZMA-MIMARI.md). Sözleşme
-- packages/shared/src/okuma-api.
--
-- 1) Anahtarın yetkisi. Varsayılan 'okuma': var olan bütün anahtarlar
--    okuma anahtarı olarak kalıyor, hiçbiri kendiliğinden yazma kazanmıyor.
--    Kısıt bu migration'da (01_constraints.sql'de değil): kolonla birlikte
--    doğuyor, üretim sırasında önceden duran bir kısıtla çakışacak şey yok.
ALTER TABLE "okuma_api_anahtarlari" ADD COLUMN "yetki" VARCHAR(10) NOT NULL DEFAULT 'okuma';
ALTER TABLE "okuma_api_anahtarlari" ADD CONSTRAINT "okuma_api_anahtarlari_yetki_chk"
  CHECK ("yetki" IN ('okuma', 'yazma'));

-- 2) Onay satırları: platforma dokunan her MCP işlemi önce burada
--    'bekliyor' olarak açılır, ancak onayla ile uygulanır. Argümanlar
--    (hedef) sunucuda saklı; model onaydan sonra değiştiremez.
--    client_id YOK: hedef workspace hedef içinde. 15 dakikalık bir satır için
--    workspace taşıma kararı (WORKSPACE_TABLOLARI) gerekmiyor.
CREATE TABLE "mcp_onaylari" (
    "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
    "anahtar_id" UUID           NOT NULL,
    "user_id"    UUID           NOT NULL,
    "islem"      VARCHAR(30)    NOT NULL,
    "hedef"      JSONB          NOT NULL,
    "ozet"       JSONB          NOT NULL,
    "durum"      VARCHAR(15)    NOT NULL DEFAULT 'bekliyor',
    "sonuc"      JSONB,
    "hata"       TEXT,
    "bitis"      TIMESTAMPTZ(6) NOT NULL,
    "karar_at"   TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_onaylari_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "mcp_onaylari_islem_chk"
      CHECK ("islem" IN ('rehber_yayinla', 'varlik_durdur', 'varlik_etkinlestir', 'butce_degistir')),
    CONSTRAINT "mcp_onaylari_durum_chk"
      CHECK ("durum" IN ('bekliyor', 'uygulaniyor', 'uygulandi', 'basarisiz', 'vazgecildi'))
);

CREATE INDEX "mcp_onaylari_user_created_idx" ON "mcp_onaylari"("user_id", "created_at" DESC);
CREATE INDEX "mcp_onaylari_anahtar_idx" ON "mcp_onaylari"("anahtar_id");

ALTER TABLE "mcp_onaylari" ADD CONSTRAINT "mcp_onaylari_anahtar_id_fkey"
  FOREIGN KEY ("anahtar_id") REFERENCES "okuma_api_anahtarlari"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "mcp_onaylari" ADD CONSTRAINT "mcp_onaylari_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) Etki kaydının yolu: MCP'den yapılan değişiklik etki ekranında kendi
--    adıyla görünsün (shared DEGISIKLIK_YOLLARI). Kısıt düşürülüp aynı adla,
--    bir değer fazlasıyla yeniden kuruluyor; var olan satırların hepsi eski
--    listedeki değerleri taşıyor, yeniden doğrulama düşmez.
ALTER TABLE "degisiklik_etkileri" DROP CONSTRAINT "degisiklik_etkileri_yol_chk";
ALTER TABLE "degisiklik_etkileri" ADD CONSTRAINT "degisiklik_etkileri_yol_chk" CHECK ("yol" IN ('iyilestir', 'sinyal', 'reklam_yoneticisi', 'asistan', 'mcp', 'kural', 'bilinmiyor'));
