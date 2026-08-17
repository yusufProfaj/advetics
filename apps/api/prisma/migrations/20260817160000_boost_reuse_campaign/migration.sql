-- VAR OLAN KAMPANYANIN ALTINA GÖNDERİ EKLEME (K21)
--
-- Bugüne kadar her boost kendi kampanyasını açıyordu. İstenen kurgu şu: ilk
-- gönderi için kampanya oluşsun, sonraki gönderiler AYNI kampanyanın altına
-- kendi ad set'i ve reklamıyla eklenebilsin.
--
-- BU KOLON `external_campaign_id`'DEN AYRI VE BİRLEŞTİRİLEMEZ. İkisi farklı
-- soruların cevabı:
--
--   · `target_campaign_external_id` — NEREYE eklemek İSTİYORUZ (yayın öncesi,
--     kullanıcının seçimi)
--   · `external_campaign_id`        — Meta'da NE OLUŞTU (yayın sonrası, olgu)
--
-- İkincisine önceden yazmak cazip ama tehlikeli: o kolonun dolu olması bütün
-- kod tabanında "bu boost platformda var" demek. Önceden doldurulduğunda
-- oluşmamış bir boost oluşmuş görünür, geri alma onu var sayar ve `creating`
-- durumundaki satırların ayıklanması imkânsız hâle gelir. Aynı tuzağa
-- `daily_budget_micros` için düşülmemesi için iki kolon açılmıştı (K18);
-- gerekçe birebir aynı.
--
-- NULL = YENİ KAMPANYA. Varsayılan bilinçli olarak en korunaklı olan: alanı
-- doldurmayı unutan bir yol kendi kampanyasını açıyor. Fazladan kampanya
-- düzen sorunudur, geri dönülebilir. Tersi varsayılan (var olana ekle)
-- unutulduğunda PAYLAŞILAN bir nesneye dokunmak demekti.
ALTER TABLE "boosts" ADD COLUMN "target_campaign_external_id" VARCHAR(128);

-- SEÇİLEBİLİR KAMPANYALARI LİSTELEMEK İÇİN.
--
-- Ekranın ilk adımı "hangi kampanyanın altına?" sorusunu soruyor ve cevabı
-- müşterinin geçmiş boost'larından çıkıyor: `client_id` + dolu
-- `external_campaign_id`. İndeks olmadan bu sorgu müşterinin bütün boost
-- geçmişini tarıyor ve ekran her açılışta yavaşlıyor.
CREATE INDEX "boosts_client_id_external_campaign_id_idx"
  ON "boosts"("client_id", "external_campaign_id")
  WHERE "external_campaign_id" IS NOT NULL;
