-- Toplu oluşturucuda arşiv görseli
--
-- İKİ KOLON, biri kullanıcının yazdığı AD, diğeri çözümlenmiş VARLIK.
--
-- Yalnızca `asset_id` tutmak yetmezdi: ad eşleşmediğinde kullanıcının ne
-- yazdığını göstermek gerekiyor ("'yaz-1' adında görsel yok"). Yalnızca adı
-- tutmak da yetmezdi: varlık sonradan yeniden adlandırılırsa yayın anında
-- eşleşme kaybolurdu.
--
-- Çözümleme DOĞRULAMA anında yapılıyor; `asset_id` o anda sabitleniyor ve
-- sonraki bir yeniden adlandırma partiyi bozmuyor.
ALTER TABLE "bulk_items"
  ADD COLUMN "asset_name" VARCHAR(200),
  ADD COLUMN "asset_id" UUID;

-- ON DELETE SET NULL: arşivden silinen bir varlık partiyi düşürmemeli.
-- Satır doğrulaması bir sonraki turda "görsel yok" diyecek ve kullanıcı
-- anlaşılır bir hata görecek — yabancı anahtar hatası yerine.
ALTER TABLE "bulk_items" ADD CONSTRAINT "bulk_items_asset_id_fkey"
  FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "bulk_items_asset_id_idx" ON "bulk_items"("asset_id");

-- HAM REFERANS İLE ARŞİV ADI BİRLİKTE OLAMAZ — AMA YALNIZCA YAYINLANABİLİR
-- SATIRLARDA.
--
-- Kısıt son savunma hattı: hangi görselin kullanılacağı belirsiz bir satır
-- platforma gitmemeli.
--
-- KOŞUL NEDEN `status`'e BAĞLI: doğrulayıcı ikisini birden yazan satırı
-- `invalid` işaretleyip SEBEBİNİ satırın yanına yazıyor. Kısıt bu satırın
-- KAYDEDİLMESİNİ de engellese, 60 satırlık bir partide tek hatalı satır
-- yüzünden partinin tamamı ham bir veritabanı hatasıyla düşerdi — kullanıcı
-- hangi satırın sorunlu olduğunu hiç öğrenemezdi.
--
-- Geçersiz satırlar zaten yayınlanmıyor: `publish` yalnızca `pending`
-- durumundakileri alıyor.
ALTER TABLE "bulk_items" DROP CONSTRAINT IF EXISTS "bulk_items_media_source_chk";
ALTER TABLE "bulk_items" ADD CONSTRAINT "bulk_items_media_source_chk"
  CHECK (
    "status" <> 'pending'
    OR NOT ("media_ref" IS NOT NULL AND "asset_name" IS NOT NULL)
  );
