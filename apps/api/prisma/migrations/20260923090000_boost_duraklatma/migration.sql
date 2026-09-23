-- ═══ DURAKLATILMIŞ BOOST DA "CANLI" SAYILIYOR ═══
--
-- `boosts_active_post_uniq` kısmi tekil indeksi aynı gönderi için ikinci bir
-- canlı boost'u engelliyor ve yüklemi dört durumu kapsıyordu. Elle duraklatma
-- eklenince beşincisi gerekti: duraklatılmış bir kampanya varken ikinci bir
-- boost açılabilseydi, kullanıcı ilkini sürdürdüğü anda AYNI GÖNDERİYE İKİ
-- KAMPANYA birden harcamaya başlardı — ve hiçbir hata düşmezdi.
--
-- İNDEKS YENİDEN KURULUYOR: Postgres'te kısmi indeksin yüklemi
-- değiştirilemiyor.
DROP INDEX IF EXISTS "boosts_active_post_uniq";

CREATE UNIQUE INDEX "boosts_active_post_uniq"
  ON "boosts" ("organic_post_id")
  WHERE "status" IN ('candidate', 'approved', 'creating', 'active', 'paused');
