-- ELLE BOOST — üçüncü üretici
--
-- Bugüne kadar `boosts` tablosunun tek üreticisi kural motoruydu ve o yüzden
-- iki varsayım kolona gömülüydü: bütçe HER ZAMAN günlük, hedefleme HER ZAMAN
-- sağlayıcının sabiti. Elle boost ikisini de kırıyor (K16, K18).
--
-- BÜTÇE İKİ KİPLİ. Kural günlük düşünüyor — süresiz çalışıyor ve aylık tavanı
-- günlük bütçe × süre üzerinden hesaplanıyor. Elle boost toplam düşünüyor:
-- kullanıcı "300 TL, 5 gün" diyor ve merak ettiği şey toplam. Günlük bütçe
-- Meta'da sert tavan değil; ekranda 300 TL yazarken altından 5 × 60 TL
-- göndermek, panelde yazan sayı ile hesaptan çıkan sayının ayrışması demek.
--
-- İKİ AYRI KOLON, TEK KOLONA İKİ ANLAM DEĞİL. `daily_budget_micros`'a duruma
-- göre bazen günlük bazen toplam yazmak, kolonu okuyan her sorgunun kipi de
-- okumasını gerektirirdi — ve bir gün biri okumayı unuturdu. Unutulduğunda
-- ortaya çıkan şey beş kat harcama.
ALTER TABLE "boosts" ADD COLUMN "budget_mode" VARCHAR(10) NOT NULL DEFAULT 'daily';
ALTER TABLE "boosts" ADD COLUMN "total_budget_micros" BIGINT;

-- GÜNLÜK BÜTÇE ARTIK ZORUNLU DEĞİL.
--
-- Toplam bütçeli bir boost'ta günlük bütçe diye bir sayı YOK — türetilmiş bir
-- değer yazmak (toplam ÷ gün) uydurma bir kesinlik olurdu: Meta parayı eşit
-- bölmüyor ve o sayı hiçbir yerde gerçekleşmiyor. Hangi kolonun dolu olacağını
-- `boosts_budget_chk` (01_constraints.sql) kipe göre zorunlu kılıyor.
ALTER TABLE "boosts" ALTER COLUMN "daily_budget_micros" DROP NOT NULL;

-- HEDEFLEME KAYDEDİLİYOR — yalnızca Meta'ya gönderilip unutulmuyor.
--
-- "Bu boost kime gösterildi" sorusunun cevabı aksi hâlde yalnızca Ads
-- Manager'da olurdu. Beklenmedik bir sonucun sebebini ararken ilk bakılacak
-- yer bu kolon; boost bittikten sonra bile duruyor.
--
-- NULL = sağlayıcının varsayılanı (ülke geneli), yani kural yolunun bugünkü
-- davranışı. Kural satırlarında NULL kalıyor ve bu bilinçli: kural ekranında
-- hedefleme sorulmuyor.
ALTER TABLE "boosts" ADD COLUMN "targeting" JSONB;

-- KAYITLI KİTLE AYRI KOLONDA, hedefleme nesnesinin İÇİNDE DEĞİL (K16).
--
-- Kitleyi `targeting` JSON'una gömmek cazip ama tehlikeli: o nesne olduğu gibi
-- Meta'ya gidiyor ve bizim uydurduğumuz bir anahtar oraya sızarsa Meta onu
-- SESSİZCE YOK SAYAR — reklam yayınlanır, kitle uygulanmaz, kullanıcı seçtiği
-- kitleye reklam verdiğini sanır. Ayrı kolonda böyle bir sızma imkânsız.
--
-- KİTLE SEÇİLİRSE DİĞER HEDEFLEME ALANLARI YOK: kayıtlı kitle Meta'da kendi
-- lokasyonunu, yaşını ve cinsiyetini taşıyor ve ikisini birleştirmek "kesişim
-- mi birleşim mi" sorusunu bizim cevaplamamız demek. `boosts_targeting_chk`
-- (01_constraints.sql) ikisinin birden dolu olmasını reddediyor.
ALTER TABLE "boosts" ADD COLUMN "saved_audience_id" VARCHAR(64);
