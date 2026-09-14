-- ============================================================================
-- YEDİ ROLDEN ÜÇE: owner/manager/analyst/customer_service KALKIYOR
-- ============================================================================
--
-- Kullanıcının tarifi "çok fazla yetki var, ne neye yarıyor". Yeni model üç
-- rol (admin = Yönetici, ad_manager = Reklam Yöneticisi, client_viewer =
-- Müşteri) ve bir bayrak (users.platform_admin = Sahip). Gerekçe
-- packages/shared/src/auth/roles.ts başlığında.
--
-- ESKİ SATIRLAR SİLİNMİYOR, TAŞINIYOR:
--   owner            -> admin       (aynı yetki kümesi; org.billing kimsece okunmuyordu)
--   manager          -> ad_manager  (ajans personeli; yeni modelde tek personel rolü bu)
--   analyst          -> ad_manager  (aynı gerekçe — reklam işi yapan ajans çalışanı)
--   customer_service -> ad_manager
--
-- analyst/customer_service -> ad_manager bir GENİŞLEME: eski roller okuma
-- ağırlıklıydı, ad_manager yayınlayabiliyor. Daraltma seçeneği client_viewer
-- olurdu ama o rol şirket seviyesinde (client_id IS NULL) OLAMIYOR
-- (memberships_org_scope_role_chk) ve ajans çalışanını müşteri hesabına
-- çevirmek yanlış tarafa daraltmak demek. Kaç satırın taşındığı NOTICE ile
-- yazılıyor; deploy çıktısında görünür.
--
-- ENUM DEĞERİ DÜŞÜRÜLEMİYOR (Postgres'te DROP VALUE yok): tip yeniden
-- kuruluyor ve iki kolon yeni tipe çevriliyor. Kısıt (memberships_org_scope_
-- role_chk) kolon tipi değişirken Postgres tarafından yeniden çözülüyor;
-- 01_constraints.sql deploy'da zaten DROP/ADD yapıyor.

DO $$
DECLARE
  uyelik integer;
  ust integer;
BEGIN
  UPDATE memberships SET role = 'admin' WHERE role = 'owner';
  GET DIAGNOSTICS uyelik = ROW_COUNT;
  RAISE NOTICE 'roller_uce_indi: memberships owner->admin: % satır', uyelik;

  UPDATE memberships SET role = 'ad_manager'
   WHERE role IN ('manager', 'analyst', 'customer_service');
  GET DIAGNOSTICS uyelik = ROW_COUNT;
  RAISE NOTICE 'roller_uce_indi: memberships manager/analyst/customer_service->ad_manager: % satır', uyelik;

  UPDATE manager_memberships SET role = 'admin' WHERE role = 'owner';
  GET DIAGNOSTICS ust = ROW_COUNT;
  RAISE NOTICE 'roller_uce_indi: manager_memberships owner->admin: % satır', ust;

  UPDATE manager_memberships SET role = 'ad_manager'
   WHERE role IN ('manager', 'analyst', 'customer_service');
  GET DIAGNOSTICS ust = ROW_COUNT;
  RAISE NOTICE 'roller_uce_indi: manager_memberships ->ad_manager: % satır', ust;
END $$;

ALTER TYPE "Role" RENAME TO "Role_eski";
CREATE TYPE "Role" AS ENUM ('admin', 'ad_manager', 'client_viewer');

ALTER TABLE memberships
  ALTER COLUMN role TYPE "Role" USING role::text::"Role";
ALTER TABLE manager_memberships
  ALTER COLUMN role TYPE "Role" USING role::text::"Role";

DROP TYPE "Role_eski";
