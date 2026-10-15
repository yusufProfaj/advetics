-- "YouTube kanalımız yok" beyanı (kurulum sihirbazının YouTube adımı,
-- 2026-10-15). CHECK listesi shared KURULUM_BEYAN_OGELERI'nin AYNISI olmak
-- zorunda; kurulum-beyan.spec.ts iki listeyi karşılaştırıyor. Ayrışırlarsa
-- panelin gönderdiği beyan INSERT'te kısıt ihlaliyle düşerdi.
--
-- Kısıt düşürülüp aynı adla yeniden kuruluyor; tek transaction içinde ve
-- var olan satırların hepsi eski listede, yani yeni kısıt hepsini geçiriyor.
ALTER TABLE "kurulum_beyanlari" DROP CONSTRAINT "kurulum_beyanlari_oge_chk";
ALTER TABLE "kurulum_beyanlari" ADD CONSTRAINT "kurulum_beyanlari_oge_chk"
  CHECK ("oge" IN ('site_yok', 'adres', 'bildirim', 'erisim', 'youtube_yok', 'iki_adim'));
