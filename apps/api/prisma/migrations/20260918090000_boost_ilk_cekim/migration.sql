-- ═══ AKILLI BOOST İLK ÇEKİMİ ═══
--
-- Kuyruk besleme kuralı bugüne kadar şuydu: yalnızca ÖN AYARDAN SONRA
-- yayınlanan gönderiler karta dönüşüyor (`published_at > preset.created_at`).
-- Gerekçesi doğruydu — ön ayar açıldığında son doksan günün gönderileri
-- kuyruğa dolmasın — ama bedeli ölçülmedi: yeni kurulan bir workspace'te
-- HİÇBİR KART GÖRÜNMÜYOR ve kullanıcı bunu "Akıllı Boost çalışmıyor" diye
-- okuyor. Kullanıcının kendi cümlesi: "bazı şirketlerin workspace'lerinde
-- autoboost gelmiyor".
--
-- ÇÖZÜM TEK SEFERLİK BİR TOHUM: ön ayar ilk kez süpürüldüğünde son N gönderi
-- kurala BAKILMADAN kuyruğa alınıyor ve bu kolon damgalanıyor. NULL = henüz
-- tohumlanmadı, yani var olan bütün ön ayarlar bir sonraki süpürmede
-- kendiliğinden düzeliyor; ayrı bir script gerekmiyor.
--
-- DAMGA ÖN AYARDA, PROFİLDE DEĞİL: kural ön ayara ait (kart ancak ön ayar
-- varken üretiliyor) ve ön ayar silinip yeniden kurulduğunda kullanıcı
-- gerçekten yeni bir başlangıç istiyor demektir.
ALTER TABLE "auto_boost_presets"
  ADD COLUMN "seed_at" TIMESTAMPTZ(6);
