-- BAĞLANTI MODELİ MÜŞTERİDEN AJANSA TAŞINIYOR
--
-- ÖNCESİ: `platform_connections` ve `ad_accounts` yalnızca `client_id`
-- taşıyordu. Ajansın TEK Meta kimliği 157, TEK Google girişi 127 reklam
-- hesabına erişiyor; 12 müşteri için aynı kimliği 12 kez yetkilendirmek
-- gerekiyordu ve iki şey birden bozuluyordu:
--
--   1. Her müşteri kendi kopyasında yine 157 hesabı görüyordu → 12 × 157 satır.
--      Üretimde 1.134 mükerrer reklam hesabı birikti ve bir müşterinin hesabı
--      başka müşterinin altında listeleniyordu.
--   2. Aynı kimlik tekrar tekrar yetkilendirildiği için platform önceki token'ı
--      geçersiz kılıyordu: BİR MÜŞTERİYE HESAP BAĞLAYINCA DİĞERİNİN BAĞLANTISI
--      KOPUYORDU. Canlıda gözlendi.
--
-- SONRASI: sahiplik `org_id`'de. Meta bir kez bağlanır, hesaplar organizasyon
-- havuzuna düşer, hangi hesabın hangi müşteriye ait olduğu panelden seçilir.
-- `client_id` artık ATAMA alanı: NULL => havuzda, atanmamış.
--
-- Bu dosya planın 1–4. adımlarının TAMAMINI içeriyor. Bölünemez: yarım
-- uygulanmış şema (org_id var ama tekillik hâlâ client_id'de) keşif kodunu
-- mükerrer satır üretir hâlde bırakır.
--
-- VERİ RİSKİ YOK: 2026-08-15'te `db:reset-clients` çalıştırıldı, iki tablo da
-- boş. Aşağıdaki geri doldurma adımları yine de yazıldı — geliştirici
-- makinelerinde veri olabilir ve boş tabloda maliyetleri sıfır.

-- -----------------------------------------------------------------------------
-- 1. ADIM — org_id
--
-- Önce NULLABLE ekleniyor, dolduruluyor, sonra NOT NULL yapılıyor. Doğrudan
-- NOT NULL eklemek, tabloda tek satır varsa migration'ı düşürürdü.
-- -----------------------------------------------------------------------------
ALTER TABLE "platform_connections" ADD COLUMN "org_id" UUID;
ALTER TABLE "ad_accounts" ADD COLUMN "org_id" UUID;

-- Geri doldurma: sahiplik müşterinin organizasyonundan geliyor. Bağlantı ve
-- hesap zaten bir müşteriye aitti, o müşteri de bir organizasyona.
UPDATE "platform_connections" pc
   SET "org_id" = c."org_id"
  FROM "clients" c
 WHERE c."id" = pc."client_id" AND pc."org_id" IS NULL;

UPDATE "ad_accounts" aa
   SET "org_id" = c."org_id"
  FROM "clients" c
 WHERE c."id" = aa."client_id" AND aa."org_id" IS NULL;

ALTER TABLE "platform_connections" ALTER COLUMN "org_id" SET NOT NULL;
ALTER TABLE "ad_accounts" ALTER COLUMN "org_id" SET NOT NULL;

ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 2. ADIM — client_id nullable
--
-- NULL'ın anlamı iki tabloda farklı:
--   · ad_accounts.client_id IS NULL     => havuzda, henüz atanmamış hesap.
--   · platform_connections.client_id IS NULL => ajans geneli bağlantı.
--
-- FK davranışı da değişiyor: CASCADE → SET NULL. Müşteri silmek ajansın
-- bağlantısını ya da reklam hesabı kaydını YOK ETMEMELİ; hesap havuza geri
-- dönmeli. Cascade bıraksaydık bir müşteriyi silmek, o hesabın diğer
-- müşterilere atanma ihtimalini de silerdi.
-- -----------------------------------------------------------------------------
ALTER TABLE "platform_connections" ALTER COLUMN "client_id" DROP NOT NULL;
ALTER TABLE "ad_accounts" ALTER COLUMN "client_id" DROP NOT NULL;

ALTER TABLE "platform_connections" DROP CONSTRAINT "platform_connections_client_id_fkey";
ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ad_accounts" DROP CONSTRAINT "ad_accounts_client_id_fkey";
ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ATANMIŞ HESABIN MÜŞTERİSİ KENDİ ORGANİZASYONUNDAN OLMALI.
--
-- Bu kısıt olmadan bir hesap A organizasyonuna, müşterisi B organizasyonuna ait
-- olabilirdi. RLS politikası iki koşulu birden arıyor
-- (org_id = current_org AND can_access_client(client_id)) ve bu kısıt olmadan
-- iki koşul BİRBİRİNİ DOĞRULAMAZ, ayrı ayrı eşleşir — atama uç noktasındaki
-- tek bir hata satırı iki organizasyona birden yarı görünür yapardı.
--
-- Kompozit yabancı anahtar bunu veritabanı seviyesinde imkânsız kılıyor:
-- MATCH SIMPLE gereği client_id NULL iken kısıt hiç denetlenmiyor (havuz
-- serbest), dolu olduğunda ise org_id ile BİRLİKTE doğrulanıyor.
--
-- `SET NULL ("client_id")` — KOLON LİSTESİ ŞART. Listesiz yazım kompozit
-- anahtarın TÜM kolonlarını NULL'a çeker, yani org_id'yi de; o kolon NOT NULL
-- olduğu için müşteri silme "null value in column org_id" ile düşerdi.
-- Postgres 15+ gerektiriyor; üretim ve testler 16 (bkz. docker-compose.yml,
-- DEPLOYMENT.md).
ALTER TABLE "clients" ADD CONSTRAINT "clients_id_org_id_key" UNIQUE ("id", "org_id");

ALTER TABLE "ad_accounts" ADD CONSTRAINT "ad_accounts_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE SET NULL ("client_id") ON UPDATE CASCADE;

ALTER TABLE "platform_connections" ADD CONSTRAINT "platform_connections_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE SET NULL ("client_id") ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- 4. ADIM — tekillik client_id'den org_id'ye
--
-- Modelin asıl düzeltmesi burada. Eski tekillik "aynı hesap her müşteride bir
-- kez"di; yenisi "aynı hesap organizasyonda bir kez".
--
-- org_id NOT NULL olduğu için tekillik gerçekten zorlanıyor. client_id ile
-- olsaydı, NULL'lar birbirine eşit sayılmadığından havuzdaki aynı hesap
-- defalarca eklenebilirdi — kısıt sessizce hiçbir şey yapmazdı.
-- -----------------------------------------------------------------------------
DROP INDEX "platform_connections_client_id_platform_external_user_id_key";
CREATE UNIQUE INDEX "platform_connections_org_id_platform_external_user_id_key"
  ON "platform_connections"("org_id", "platform", "external_user_id");

DROP INDEX "ad_accounts_platform_external_id_client_id_key";
CREATE UNIQUE INDEX "ad_accounts_platform_external_id_org_id_key"
  ON "ad_accounts"("platform", "external_id", "org_id");

-- Yeni erişim desenlerinin indeksleri. Havuz sorgusu ("bu organizasyonda
-- atanmamış hesaplar") client_id IS NULL ile geliyor; org_id tek başına
-- yeterli değil.
CREATE INDEX "platform_connections_org_id_status_idx" ON "platform_connections"("org_id", "status");
CREATE INDEX "ad_accounts_org_id_client_id_idx" ON "ad_accounts"("org_id", "client_id");
