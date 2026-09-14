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
-- kuruluyor ve iki kolon yeni tipe çevriliyor.
--
-- ┌─ KISIT ÖNCE DÜŞÜYOR — ÜRETİMDE BİR DEPLOY BUNA TAKILDI ────────────────┐
-- │ `memberships_org_scope_role_chk` yüklemi `role <> 'client_viewer'` ve  │
-- │ o literal, kısıt KURULDUĞU ANDAKİ tipe çivili. Kolonu yeni tipe        │
-- │ çevirince Postgres kısıtı yeniden doğruluyor ve karşılaştırma          │
-- │ `"Role" <> "Role_eski"` oluyor:                                         │
-- │   ERROR: operator does not exist: "Role" <> "Role_eski"  (42883)        │
-- │                                                                         │
-- │ Testte GÖRÜNMEDİ ve sebebi yapısal: `pglite-harness` şemayı önce        │
-- │ BÜTÜN migration'lardan kuruyor, `01_constraints.sql`i EN SON           │
-- │ uyguluyor — yani migration koşarken kısıt henüz yok. Üretimde sıra     │
-- │ tam tersi: kısıt bir önceki deploy'dan beri duruyor. `roller-uce-indi. │
-- │ spec.ts` artık ÜRETİM SIRASINI kuruyor (kısıt önce, migration sonra).  │
-- │                                                                         │
-- │ Kısıt burada geri de kuruluyor. `db:rls` (01_constraints.sql) zaten    │
-- │ DROP/ADD yapıyor ama o ADIM MIGRATE'TEN SONRA koşuyor; kurmadan        │
-- │ bırakmak, veritabanını iki adım arasında kısıtsız bırakırdı.           │
-- └─────────────────────────────────────────────────────────────────────────┘

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

ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_org_scope_role_chk;

ALTER TYPE "Role" RENAME TO "Role_eski";
CREATE TYPE "Role" AS ENUM ('admin', 'ad_manager', 'client_viewer');

ALTER TABLE memberships
  ALTER COLUMN role TYPE "Role" USING role::text::"Role";
ALTER TABLE manager_memberships
  ALTER COLUMN role TYPE "Role" USING role::text::"Role";

DROP TYPE "Role_eski";

-- Yüklem 01_constraints.sql'deki ile BİREBİR — ayrışırlarsa `db:rls` adımı
-- kısıtı sessizce başka bir tanımla değiştirir.
ALTER TABLE memberships ADD CONSTRAINT memberships_org_scope_role_chk
  CHECK (client_id IS NOT NULL OR role <> 'client_viewer');
