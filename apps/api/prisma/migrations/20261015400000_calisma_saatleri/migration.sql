-- ÇALIŞMA SAATLERİ (Marka Merkezi › Marka, 2026-10-12).
--
-- "Beni telefonla arasınlar" reklamında telefonun açık olduğu saatler.
-- Google arama öğesinin saat planı (adScheduleTargets) buradan kuruluyor;
-- boşken hiç gönderilmiyor ve öğe her saatte görünüyor (saat uydurulmuyor).
--
-- NULL = bilinmiyor. Boş dizi de servis tarafında NULL yazılıyor ki
-- "girilmedi" tek hâl olsun. Biçim (gün, açılış, kapanış) shared şemasında;
-- burada yalnız dizi olduğu dayatılıyor: nesne yazan bir hata okumada
-- sessizce "bilinmiyor"a dönerdi.
ALTER TABLE "client_profiles" ADD COLUMN "calisma_saatleri" JSONB;

ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_calisma_saatleri_dizi"
  CHECK ("calisma_saatleri" IS NULL OR jsonb_typeof("calisma_saatleri") = 'array');
