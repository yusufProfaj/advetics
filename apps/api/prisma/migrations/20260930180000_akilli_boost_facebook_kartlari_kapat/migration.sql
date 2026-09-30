-- AKILLI BOOST: ONAY BEKLEYEN FACEBOOK SAYFASI KARTLARI KAPATILIYOR.
--
-- Facebook sayfası artık kart üretmiyor (autoboost-queue.service.ts,
-- AKILLI_BOOST_META_PROFILLERI). Kural değişmeden önce üretilmiş kartlar
-- Instagram gönderilerinin crosspost ikizleri ve onaylanırlarsa aynı içerik
-- için ikinci bir kampanya açılır.
--
-- SİLİNMİYOR, KAPATILIYOR (kullanıcı kararı): durum 'rejected' ve sebebi
-- kartta yazıyor; panelde "Tekrar boostla" ile yeniden açılabilir.
-- YALNIZCA 'pending': yayında, yayınlanıyor ya da zaten kapanmış kartlara
-- dokunulmuyor (onlar birinin kararı ya da canlı bir kampanya).
UPDATE auto_boost_queue_items q
   SET status     = 'rejected',
       error      = 'Facebook sayfası gönderisi: Akıllı Boost yalnızca Instagram gönderilerini öne çıkarıyor (aynı paylaşımın Instagram kartı ayrıca duruyor).',
       updated_at = now()
  FROM social_profiles sp
 WHERE sp.id = q.social_profile_id
   AND sp.profile_type = 'facebook_page'
   AND q.status = 'pending';
