-- ═══ SOHBETİN PLATFORMU SATIRA YAZILIYOR ═══
--
-- Meta ve Google için AYRI asistanlar var: hedef sözlüğü, bütçe modeli ve
-- yazma kısıtları farklı. Platform istekte taşınıp satırda saklanmazsa,
-- sayfası yenilenen bir sohbet hangi asistanla başladığını unutur ve sistem
-- promptu sessizce diğer platformunkine döner.
--
-- VARSAYILAN 'meta' ve bu geçmiş için DOĞRU: bu kolon eklenene kadar açılmış
-- bütün sohbetler tek asistanla yapıldı ve o asistan pratikte Meta'yı
-- konuşuyordu (Google yazma yolu hiç yazılmadı).
ALTER TABLE "ai_conversations"
  ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'meta';
