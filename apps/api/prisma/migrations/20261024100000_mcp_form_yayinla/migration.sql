-- MCP onayına `form_yayinla` (2026-10-20).
--
-- Meta'da anlık form açmak MCP'den de mümkün oldu ve reklam yayını gibi iki
-- adımlı: önce onay satırı, sonra `onayla`. Kısıt genişlemezse onay satırı
-- INSERT'te düşer ve araç "onay açılamadı" yerine ham bir kısıt hatası verir.
ALTER TABLE "mcp_onaylari" DROP CONSTRAINT "mcp_onaylari_islem_chk";
ALTER TABLE "mcp_onaylari" ADD CONSTRAINT "mcp_onaylari_islem_chk"
  CHECK ("islem" IN ('rehber_yayinla', 'varlik_durdur', 'varlik_etkinlestir', 'butce_degistir', 'form_yayinla'));
