-- MCP ile gönderi boost'u ve tek işlem üst sınırı (2026-10-21,
-- docs/okuma-api/MCP-BOOST-MIMARI.md § 3).
--
-- Bütün kolonlar varsayılanlı ya da NULL: panelin elle boost'u ve kural
-- yolu hiçbir şey yazmadan bugünkü davranışını sürdürüyor (hedef
-- 'etkilesim', hemen yayında).

ALTER TABLE "boosts"
  ADD COLUMN "hedef" VARCHAR(20) NOT NULL DEFAULT 'etkilesim',
  ADD COLUMN "hedef_adres" VARCHAR(2000),
  ADD COLUMN "duraklatilmis_kur" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "yayin_baslangici" TIMESTAMPTZ(6);

ALTER TABLE "boosts" ADD CONSTRAINT "boosts_hedef_chk"
  CHECK ("hedef" IN ('etkilesim', 'erisim', 'profil_ziyareti', 'mesaj', 'trafik'));

-- Trafik hedefi adressiz kurulamaz; adres yalnız trafikte anlamlı. Kısıt
-- veritabanında: düğmesi boş bir trafik reklamı Meta'da reddedilir ama
-- reddedilmeden önce kampanyası açılmış olurdu.
ALTER TABLE "boosts" ADD CONSTRAINT "boosts_hedef_adres_chk"
  CHECK (("hedef" = 'trafik') = ("hedef_adres" IS NOT NULL));

ALTER TABLE "okuma_api_anahtarlari"
  ADD COLUMN "tek_islem_ust_siniri_micros" BIGINT;

ALTER TABLE "okuma_api_anahtarlari" ADD CONSTRAINT "okuma_api_anahtarlari_ust_sinir_chk"
  CHECK ("tek_islem_ust_siniri_micros" IS NULL OR "tek_islem_ust_siniri_micros" > 0);

ALTER TABLE "mcp_onaylari" DROP CONSTRAINT "mcp_onaylari_islem_chk";
ALTER TABLE "mcp_onaylari" ADD CONSTRAINT "mcp_onaylari_islem_chk"
  CHECK ("islem" IN (
    'rehber_yayinla', 'varlik_durdur', 'varlik_etkinlestir', 'butce_degistir', 'form_yayinla',
    'boost_olustur', 'boost_baslat', 'boost_duraklat', 'boost_butce'
  ));
