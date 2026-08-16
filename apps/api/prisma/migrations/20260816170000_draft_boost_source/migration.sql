-- Ağaç: gönderi boost'u ve kampanyanın kökeni
--
-- İKİ ŞEY EKLENİYOR ve ikisi de aynı işin parçası: Auto-Boost ile toplu
-- oluşturmayı ağaca bağlamak.
--
-- 1. BOOST'UN KREATİFİ YOK. Bir boost, MEVCUT bir organik gönderiyi öne
--    çıkarıyor; metni ve görseli zaten Meta'da duruyor ve bizim kreatif
--    kütüphanemizde karşılığı yok. `creative_id` NOT NULL olduğu sürece boost
--    ağaca giremiyordu.
--
--    Kolonu nullable yapıp yanına `organic_post_id` koyuyoruz ve İKİSİNDEN
--    TAM BİRİ dolu olmak zorunda. "İkisi de boş" görselsiz metinsiz bir
--    reklam demek; "ikisi de dolu" hangisinin yayınlanacağı belirsiz demek ve
--    Meta o belirsizliği kendi kararıyla çözerdi — sessizce.
--
-- 2. KAMPANYA NEREDEN GELDİ. Elle mi kuruldu, bir boost kuralı mı üretti,
--    yoksa başka bir kampanyanın kopyası mı? Listede aynı görünen üç satırın
--    hangisinin otomatik açıldığını bilmeden, beklenmedik bir harcamanın
--    kaynağı bulunamıyor.

ALTER TABLE "draft_ads" ALTER COLUMN "creative_id" DROP NOT NULL;

ALTER TABLE "draft_ads" ADD COLUMN "organic_post_id" UUID;

ALTER TABLE "draft_ads"
    ADD CONSTRAINT "draft_ads_organic_post_id_fkey"
    FOREIGN KEY ("organic_post_id") REFERENCES "organic_posts"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "draft_ads_organic_post_id_idx" ON "draft_ads"("organic_post_id");

-- manual | boost_rule | duplicate
ALTER TABLE "draft_campaigns" ADD COLUMN "source" VARCHAR(16) NOT NULL DEFAULT 'manual';

-- Kopyanın kaynağı — "bu kampanya neyin kopyası" sorusunun cevabı.
--
-- ON DELETE SET NULL: kaynak silinince kopya ölmüyor. Kopya kendi başına bir
-- kampanya ve kaynağının kaderine bağlamak, bir taslağı silmenin yayındaki
-- beş kampanyayı düşürmesi demek olurdu.
ALTER TABLE "draft_campaigns" ADD COLUMN "source_campaign_id" UUID;

ALTER TABLE "draft_campaigns"
    ADD CONSTRAINT "draft_campaigns_source_campaign_id_fkey"
    FOREIGN KEY ("source_campaign_id") REFERENCES "draft_campaigns"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "draft_campaigns_source_campaign_id_idx"
    ON "draft_campaigns"("source_campaign_id");

-- Boost kuralının ürettiği kampanya, hangi kuraldan doğdu.
ALTER TABLE "draft_campaigns" ADD COLUMN "boost_rule_id" UUID;

ALTER TABLE "draft_campaigns"
    ADD CONSTRAINT "draft_campaigns_boost_rule_id_fkey"
    FOREIGN KEY ("boost_rule_id") REFERENCES "boost_rules"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
