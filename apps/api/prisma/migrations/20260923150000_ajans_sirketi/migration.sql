-- =============================================================================
-- AJANS ŞİRKETİ — üst hesabı yöneten tarafın KENDİ şirketi, AÇIKÇA.
--
-- Havuzun iki türü oluyor: AJANS havuzu (bağlantısı bu şirkette kurulmuş
-- hesaplar, üst hesabın bütün şirketlerine açık) ve ŞİRKET havuzu (müşterinin
-- kendi bağladığı hesaplar, yalnızca kendi şirketinde). Ayrım RLS'in sınırı
-- olacağı için bir tahmine bırakılamaz; kod bugüne kadar ajansı "üst hesabın
-- en eski şirketi" sayıyordu.
-- =============================================================================

ALTER TABLE "manager_accounts" ADD COLUMN "ajans_org_id" UUID;

CREATE UNIQUE INDEX "manager_accounts_ajans_org_id_key" ON "manager_accounts"("ajans_org_id");

ALTER TABLE "manager_accounts" ADD CONSTRAINT "manager_accounts_ajans_org_id_fkey"
  FOREIGN KEY ("ajans_org_id") REFERENCES "organizations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- ŞİRKET BU ÜST HESABIN ALTINDA OLMAK ZORUNDA — veritabanı dayatıyor.
--
-- Basit yabancı anahtar yalnızca şirketin VAR olduğunu söylüyor. Başka bir üst
-- hesabın şirketini buraya yazmak, o şirketin havuzunu bu hesabın bütün
-- şirketlerine açmak demek ve hiçbir kod yolu bunu fark etmezdi. Kompozit
-- anahtar ikisini birlikte istiyor.
--
-- ON UPDATE NO ACTION BİLİNÇLİ: ajans şirketi başka bir üst hesaba
-- taşınmaya kalkılırsa deyim REDDEDİLİYOR. CASCADE olsaydı
-- `manager_accounts.id` değişirdi; SET NULL olsaydı havuz sessizce kapanırdı.
-- NO ACTION (RESTRICT değil) çünkü üst hesap silinirken şirketlerin
-- `manager_account_id`si aynı deyimde NULL'a çekiliyor ve denetim deyimin
-- SONUNDA yapılıyor — o anda başvuran satır zaten silinmiş oluyor.
--
-- `SET NULL ("ajans_org_id")` KOLON LİSTESİ ŞART: listesiz yazım kompozit
-- anahtarın TÜM kolonlarını NULL'a çekerdi, yani `id`yi de.
-- -----------------------------------------------------------------------------
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_id_manager_account_id_key"
  UNIQUE ("id", "manager_account_id");

ALTER TABLE "manager_accounts" ADD CONSTRAINT "manager_accounts_ajans_org_ayni_hesap_fkey"
  FOREIGN KEY ("ajans_org_id", "id") REFERENCES "organizations"("id", "manager_account_id")
  ON DELETE SET NULL ("ajans_org_id") ON UPDATE NO ACTION;

-- -----------------------------------------------------------------------------
-- DOLDURMA — "en eski şirket" DEĞİL, AJANS BAĞLANTISININ DURDUĞU ŞİRKET.
--
-- Ajans havuzu tanımı gereği ajansın bağlantılarının kurulduğu yer: üretimde
-- Profaj'ın Meta ve Google yetkilendirmeleri (client_id NULL) tek bir şirkette
-- duruyor ve havuzun 481 hesabı oradan geliyor. En eski şirketi seçmek, o
-- şirket başka biri çıkarsa (platform sahibinin ev şirketi gibi) ajans
-- havuzunu kırk yedi şirketin atama ekranından BİRDEN kaldırırdı.
--
-- Havuz bağlantısı olmayan hesapta en eski aktif şirkete düşülüyor — o
-- durumda bugünkü kodun seçimiyle aynı ve kapatılacak bir havuz yok.
-- Eşitlik kimliğe göre kırılıyor: sırasız bir LIMIT 1 veritabanının keyfine
-- kalır.
-- -----------------------------------------------------------------------------
UPDATE "manager_accounts" m
   SET "ajans_org_id" = (
     SELECT o.id
       FROM "organizations" o
       LEFT JOIN "platform_connections" c
              ON c.org_id = o.id
             AND c.client_id IS NULL
             AND c.status <> 'revoked'
      WHERE o.manager_account_id = m.id
        AND o.status = 'active'
      GROUP BY o.id, o.created_at
      ORDER BY count(c.id) DESC, o.created_at ASC, o.id ASC
      LIMIT 1
   );
