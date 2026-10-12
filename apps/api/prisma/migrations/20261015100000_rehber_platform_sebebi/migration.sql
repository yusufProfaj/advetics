-- REHBERDE BAŞLAMAYAN PLATFORMUN GERÇEK SEBEBİ (sessiz hata, 2026-10-12).
--
-- Yayınlama, başlamayan platformun sebebini ("Meta taslağı rehberden sonra
-- değişmiş", hesabın yazma kapısı, derleyici reddi) YALNIZ o yanıtta
-- döndürüyordu. Sayfa yenilenince ya da sonraki her okumada genel cümle
-- ("kurulum başlamadı") görünüyor ve gerçek sebep kayboluyordu; kullanıcı
-- neyi düzelteceğini bir daha göremiyordu.
--
-- Platform başına { sebep, zaman }. Başlayan platformun girdisi silinir:
-- eski bir sebebi yeni bir yayın kaydının yanında göstermek yanlış olurdu.
-- NOT NULL + boş nesne: "hiç denenmedi" ile "sebep yok" aynı şey.
ALTER TABLE "reklam_rehberi" ADD COLUMN "platform_sebepleri" JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE "reklam_rehberi" ADD CONSTRAINT "reklam_rehberi_platform_sebepleri_chk" CHECK (jsonb_typeof("platform_sebepleri") = 'object');
