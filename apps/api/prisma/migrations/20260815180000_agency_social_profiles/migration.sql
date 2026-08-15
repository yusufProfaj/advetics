-- SOSYAL PROFİLLER DE HAVUZ MODELİNE GEÇİYOR
--
-- Bağlantılar ve reklam hesapları ajans seviyesine taşındığında bu tablo
-- kapsam dışı bırakılmıştı ve sonucu somut: ajans geneli bir bağlantıda
-- (client_id NULL) sayfa/Instagram keşfi HİÇ YAPILAMIYORDU, çünkü
-- `social_profiles.client_id` zorunluydu ve hangi müşteriye yazılacağı
-- bilinmiyordu. Keşif atlanıyor, atlandığı log'a yazılıyordu — sessiz değildi
-- ama Auto-Boost, lead formları ve reklam oluşturucu sayfa göremiyordu.
--
-- Artık reklam hesaplarıyla aynı model: sahiplik `org_id`'de, `client_id`
-- ATAMA alanı ve NULL olabiliyor (havuzda).

-- -----------------------------------------------------------------------------
-- org_id
--
-- Bu kolon aynı zamanda BİR YAMAYI KALDIRIYOR. `organic-sync.service.ts` ve
-- `lead-sync.service.ts`, org kimliğini müşteri üzerinden JOIN'leyerek
-- buluyordu; ikisinde de "social_profiles tablosunda org_id yok" diye not
-- düşülmüştü ve o yolda bir kez org_id kolonuna MÜŞTERİ kimliği yazılmıştı —
-- RLS hiçbir satırı eşleştirmemiş, gönderiler panelde hiç görünmemişti.
-- Kolon doğrudan burada olunca o dolambaç ortadan kalkıyor.
-- -----------------------------------------------------------------------------
ALTER TABLE "social_profiles" ADD COLUMN "org_id" UUID;

-- Geri doldurma: önce müşteriden, sonra bağlantıdan. İkinci adım, müşterisi
-- bir şekilde boşalmış satırların org'suz kalmamasını sağlıyor.
UPDATE "social_profiles" sp
   SET "org_id" = c."org_id"
  FROM "clients" c
 WHERE c."id" = sp."client_id" AND sp."org_id" IS NULL;

UPDATE "social_profiles" sp
   SET "org_id" = pc."org_id"
  FROM "platform_connections" pc
 WHERE pc."id" = sp."connection_id" AND sp."org_id" IS NULL;

ALTER TABLE "social_profiles" ALTER COLUMN "org_id" SET NOT NULL;

ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- client_id nullable + SET NULL
--
-- Müşteri silinince sayfa ÖLMEZ, havuza döner. Cascade bıraksaydık bir
-- müşteriyi silmek ajansın erişebildiği sayfanın kaydını da götürürdü.
--
-- Kompozit yabancı anahtar, atanan müşterinin sayfanın KENDİ
-- organizasyonundan olmasını garantiliyor; `SET NULL ("client_id")` kolon
-- listesi ŞART, listesiz yazım org_id'yi de NULL'a çeker ve NOT NULL kısıtına
-- takılır (Postgres 15+).
-- -----------------------------------------------------------------------------
ALTER TABLE "social_profiles" ALTER COLUMN "client_id" DROP NOT NULL;

ALTER TABLE "social_profiles" DROP CONSTRAINT "social_profiles_client_id_fkey";
ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "social_profiles" ADD CONSTRAINT "social_profiles_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE SET NULL ("client_id") ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- Tekillik: bağlantı bazından ORGANİZASYON bazına
--
-- Eski kısıt `(connection_id, external_id)` idi ve ajans TEK bağlantı
-- kurduğu sürece yeterliydi. Ama bir organizasyonda ikinci bir Meta kimliği
-- bağlanabiliyor (farklı `external_user_id`) ve aynı Facebook sayfası ikisinin
-- de altında görünüyor: eski kısıtla AYNI SAYFA İÇİN İKİ SATIR oluşurdu.
-- Reklam hesaplarında tam olarak bu, üretimde 1.134 mükerrer satır üretmişti.
--
-- `org_id` NOT NULL olduğu için kısıt gerçekten zorlanıyor; `client_id` ile
-- olsaydı NULL'lar birbirine eşit sayılmadığından havuzda aynı sayfa
-- defalarca birikirdi.
-- -----------------------------------------------------------------------------
DROP INDEX "social_profiles_connection_id_external_id_key";
CREATE UNIQUE INDEX "social_profiles_org_id_external_id_key"
  ON "social_profiles"("org_id", "external_id");

CREATE INDEX "social_profiles_org_id_client_id_idx" ON "social_profiles"("org_id", "client_id");
