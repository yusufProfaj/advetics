-- ÜST HESAP (Google MCC karşılığı) — organizasyonun ÜSTÜNDE bir katman.
--
-- Hiyerarşi: Üst Hesap → Şirket (organizations) → Workspace (clients)
--            → Reklam Hesabı → Kampanya/Set/Reklam.
--
-- GERİYE DÖNÜK ETKİSİ YOK: `organizations.manager_account_id` NULLABLE ve
-- var olan tek satır NULL kalıyor. Bağımsız bir şirket geçerli bir hâl,
-- geçici bir durum değil — bu kolon hiçbir zaman NOT NULL olmayacak.

CREATE TYPE "ManagerAccountStatus" AS ENUM ('active', 'suspended');

CREATE TABLE "manager_accounts" (
  "id"         UUID PRIMARY KEY,
  "name"       VARCHAR(120) NOT NULL,
  "slug"       VARCHAR(60)  NOT NULL,
  "status"     "ManagerAccountStatus" NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL
);

CREATE UNIQUE INDEX "manager_accounts_slug_key" ON "manager_accounts"("slug");

-- Kullanıcının ÜST HESAP seviyesindeki yetkisi.
--
-- `memberships` tablosuna EKLENMEDİ: orada `org_id` NOT NULL ve on beş RLS
-- politikası o tabloyu okuyor. "Hiçbir org'a ait olmayan" bir üyelik satırı
-- eklemek, o satırın hangi politikada nasıl eşleşeceğini kestirilemez yapardı.
CREATE TABLE "manager_memberships" (
  "id"                 UUID PRIMARY KEY,
  "manager_account_id" UUID NOT NULL,
  "user_id"            UUID NOT NULL,
  "role"               "Role" NOT NULL,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "manager_memberships_manager_account_id_fkey"
    FOREIGN KEY ("manager_account_id") REFERENCES "manager_accounts"("id") ON DELETE CASCADE,
  CONSTRAINT "manager_memberships_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- BİR KULLANICININ TEK ÜST HESABI VAR. Çoklu üyelik, "hangi üst hesap
-- geçerli" sorusunu açık bırakır ve kod sessizce ilkini seçerdi.
CREATE UNIQUE INDEX "manager_memberships_user_id_key" ON "manager_memberships"("user_id");
CREATE INDEX "manager_memberships_manager_account_id_idx"
  ON "manager_memberships"("manager_account_id");

-- ÜST HESABIN SİLİNMESİ ŞİRKETLERİ SİLMEZ (SET NULL, cascade DEĞİL).
-- Cascade olsaydı bir danışmanlık kaydını silmek, o danışmanın bütün
-- müşterilerinin bütün verisini götürürdü.
ALTER TABLE "organizations" ADD COLUMN "manager_account_id" UUID;
ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_manager_account_id_fkey"
  FOREIGN KEY ("manager_account_id") REFERENCES "manager_accounts"("id") ON DELETE SET NULL;
CREATE INDEX "organizations_manager_account_id_idx" ON "organizations"("manager_account_id");
