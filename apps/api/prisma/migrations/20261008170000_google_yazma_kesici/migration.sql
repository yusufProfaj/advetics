-- "GOOGLE'A YAZMAYI DURDUR" ANAHTARI — Meta anahtarının (20261007160000)
-- karşılığı. YouTube Akıllı Boost ilk kez canlıya çıkarken eklendi
-- (docs/akilli-boost/YOUTUBE-CANLI-PLAN.md Aşama 0): Google yazma yolu
-- canlıda hiç denenmedi ve beklenmedik bir arızada bütün Google yazmalarını
-- tek noktadan durdurmak, her kartı tek tek kapatmaktan hızlı.
--
-- AYRI KOLONLAR, Meta'nınkiler paylaşılmıyor: iki platformun anahtarı
-- birbirinden bağımsız açılıp kapanıyor ve tek bir "durduran / sebep"
-- alanı, birini kapatanın diğerinin sebebini silmesi demekti.
--
-- Yalnızca kolon ekliyor (sabit varsayılan, tablo yeniden yazılmıyor);
-- var olan kısıt ve politikalara dokunmuyor.

ALTER TABLE "ajans_ayari"
  ADD COLUMN "google_yazma_durduruldu"  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "google_durduran_id"       UUID,
  ADD COLUMN "google_durdurma_at"       TIMESTAMPTZ(6),
  ADD COLUMN "google_durdurma_sebebi"   VARCHAR(500);

ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_google_durdurma_chk" CHECK (
  NOT "google_yazma_durduruldu"
  OR ("google_durdurma_at" IS NOT NULL AND "google_durdurma_sebebi" IS NOT NULL
      AND length(trim("google_durdurma_sebebi")) > 0)
);

ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_google_durduran_fkey"
  FOREIGN KEY ("google_durduran_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- KUYRUK KARTINDA GOOGLE KİMLİKLERİ YALIN SAYI. Yayın yolu Google'ın
-- kaynak adını ("customers/1/campaigns/2") yazıyordu, yapı taraması ise
-- yalın sayıyı ("2"); kartın kampanya eşleşmesi hiç tutmuyor ve kart
-- harcamayı sonsuza dek göstermiyordu. Reklam kaynağının son parçası
-- "grup~reklam"; reklam kimliği dalganın sağı. Meta satırları "customers/"
-- ile başlamıyor, etkilenmiyor.
UPDATE "auto_boost_queue_items"
   SET "external_campaign_id" = regexp_replace("external_campaign_id", '^.*/', '')
 WHERE "platform" = 'google' AND "external_campaign_id" LIKE 'customers/%';
UPDATE "auto_boost_queue_items"
   SET "external_ad_group_id" = regexp_replace("external_ad_group_id", '^.*/', '')
 WHERE "platform" = 'google' AND "external_ad_group_id" LIKE 'customers/%';
UPDATE "auto_boost_queue_items"
   SET "external_ad_id" = regexp_replace("external_ad_id", '^.*[/~]', '')
 WHERE "platform" = 'google' AND "external_ad_id" LIKE 'customers/%';
