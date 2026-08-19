-- ═══ BOOST'UN "BİTTİ" HÂLİ — GÖNDERİ ÖMÜR BOYU KİLİTLİ KALMASIN ═══
--
-- BULUNAN HATA: bir gönderi bir kez başarıyla boostlandıktan sonra BİR DAHA
-- ASLA boostlanamıyordu.
--
-- Sebep zinciri:
--   · `boosts_active_post_uniq` kısmi tekil indeksi 'active' durumunu da
--     kapsıyor ve aynı gönderi için ikinci satırı reddediyor.
--   · Hiçbir kod yolu bir boost'u 'active' durumundan ÇIKARMIYORDU. Durum
--     listesi (candidate, approved, rejected, creating, active, failed)
--     bitmiş bir boost için karşılık taşımıyordu; yürütücü yalnızca
--     'creating', 'active' ve 'failed' yazıyor.
--   · Dolayısıyla `has_live_boost` sonsuza kadar true kalıyor, gönderi
--     listesinde "zaten yayında bir boost var" engeli hiç kalkmıyordu.
--
-- Kampanya Meta'da GERÇEKTEN duruyor: ad set `end_time` ile oluşturuluyor
-- (`buildBoostAdSetParams`). Yani duran bir kampanyayı canlı saymak yalnızca
-- BİZİM kaydımızın eksikliğiydi ve bedeli, kullanıcının aynı gönderiyi
-- yeniden öne çıkaramamasıydı.
--
-- 'completed' indeks yükleminde YOK — eklenmesine gerek de yok: satır o
-- duruma geçtiği anda kısmi indeksin dışına çıkıyor ve gönderi serbest
-- kalıyor. Kayıt SİLİNMİYOR; harcama muhasebesi (K19) ve "bu gönderi daha
-- önce öne çıkarıldı" uyarısı (K20) bu satırlardan okunuyor.
ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_status_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_status_chk
  CHECK (status IN ('candidate', 'approved', 'rejected', 'creating', 'active', 'completed', 'failed'));
