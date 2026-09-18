-- ═══ HARCANMIŞ TOHUM DAMGALARI GERİ ALINIYOR ═══
--
-- `seed_at` bir önceki sürümde KOŞULSUZ basılıyordu: deploy'dan sonraki ilk
-- süpürme, gönderileri henüz çekilmemiş bir sayfada koştuğunda sıfır kart
-- üretiyor ve damgayı yine de basıyordu. Tek seferlik fırsat harcanmış
-- oluyor; gönderiler ertesi saat geliyor ama ön ayar artık "tohumlandı"
-- sayıldığı için son 10 gönderi BİR DAHA HİÇ çekilmiyor.
--
-- Belirti kullanıcının cümlesiyle: "neden son 10 gönderiyi çekmedin bütün
-- hesaplarda".
--
-- SÜZGEÇ "HİÇ KARTI OLMAYAN MÜŞTERİ". Damgayı koşulsuz sıfırlamak, kartları
-- zaten gelmiş bir workspace'te eski gönderileri ikinci kez kuyruğa doldurmak
-- olurdu — kullanıcının elemesi gereken bir liste. Kartı olmayan bir
-- workspace'te ise kaybedilecek bir şey yok: tohumlama hiç çalışmamış demek.
--
-- KOD TARAFINDAKİ ASIL DÜZELTME AYRI: damga artık yalnızca sayfanın gerçekten
-- gönderisi varsa basılıyor. Bu dosya yalnızca ÜRETİMDE zaten harcanmış
-- damgaları geri alıyor; olmasaydı düzeltme yeni workspace'leri kurtarır,
-- bugün bozuk olanları bırakırdı.
UPDATE "auto_boost_presets" p
SET "seed_at" = NULL
WHERE p."seed_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "auto_boost_queue_items" q WHERE q."client_id" = p."client_id"
  );
