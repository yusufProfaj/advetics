-- Boost adayı ↔ kampanya taslağı bağı
--
-- ADAY ARTIK AĞAÇTA DOĞUYOR. Bugüne kadar bir boost adayı yalnızca `boosts`
-- tablosunda vardı ve kampanya listesinde hiç görünmüyordu; onay ekranı da
-- "ne yayınlanacak" sorusuna yalnızca bir özet cümleyle cevap veriyordu.
--
-- Aday oluşurken bir kampanya taslağı da yazılıyor (`status = 'draft'`) ve bu
-- kolon ikisini bağlıyor. Onaylanan boost platformda oluşunca AYNI satır
-- `published` oluyor — ikinci bir kampanya doğmuyor.
--
-- ON DELETE SET NULL: taslak silinirse boost kaydı ölmüyor. `boosts` onay ve
-- tavan muhasebesinin defteri; bir taslağı silmek o defteri bozmamalı.
ALTER TABLE "boosts" ADD COLUMN "draft_campaign_id" UUID;

ALTER TABLE "boosts"
    ADD CONSTRAINT "boosts_draft_campaign_id_fkey"
    FOREIGN KEY ("draft_campaign_id") REFERENCES "draft_campaigns"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "boosts_draft_campaign_id_idx" ON "boosts"("draft_campaign_id");
