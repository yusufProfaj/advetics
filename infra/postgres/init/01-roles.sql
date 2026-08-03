-- =============================================================================
-- Advetics — Veritabanı rolleri ve uzantıları
-- =============================================================================
-- Bu script SADECE docker volume ilk kez oluşturulurken çalışır.
-- Yeniden çalıştırmak için: pnpm infra:reset  (DİKKAT: tüm veriyi siler)
--
-- ÜÇ AYRI ROL — RLS'in çalışması bu ayrıma bağlıdır:
--
--   advetics_migrator : Tabloların SAHİBİ. Prisma migrate + seed bunu kullanır.
--                       BYPASSRLS var — şema yönetimi politikalara takılmamalı.
--
--   advetics_app      : API runtime rolü. Tablo sahibi DEĞİL, BYPASSRLS YOK.
--                       Her sorgusu RLS politikalarından geçer. Uygulama
--                       katmanında bir hata olsa bile başka tenant'ın verisi
--                       veritabanı seviyesinde görünmez.
--
--   advetics_worker   : Arka plan işleri (sync, kural motoru zamanlayıcısı).
--                       Doğası gereği tenant sınırını aşar → BYPASSRLS var.
--                       Bu rolü ASLA HTTP isteği işleyen kodda kullanma.
--
-- PRODÜKSİYONDA: aşağıdaki şifreleri secret manager'dan gelen değerlerle
-- değiştir. Bunlar yalnızca yerel geliştirme içindir.
-- =============================================================================

-- Uzantı KULLANMIYORUZ, bilerek:
--   · gen_random_uuid() Postgres 13'ten beri çekirdekte — pgcrypto'ya gerek yok.
--   · E-posta karşılaştırması için citext yerine küçük harfe normalize edilmiş
--     varchar + CHECK constraint kullanıyoruz (bkz. prisma/sql/01_constraints.sql).
-- Sonuç: şema her yönetilen Postgres sağlayıcısında (RDS, Neon, Supabase,
-- Cloud SQL) ek kurulum gerektirmeden çalışır.

-- -----------------------------------------------------------------------------
-- Roller
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'advetics_migrator') THEN
    CREATE ROLE advetics_migrator LOGIN PASSWORD 'dev_migrator_pw' BYPASSRLS CREATEDB;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'advetics_app') THEN
    CREATE ROLE advetics_app LOGIN PASSWORD 'dev_app_pw';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'advetics_worker') THEN
    CREATE ROLE advetics_worker LOGIN PASSWORD 'dev_worker_pw' BYPASSRLS;
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- Şema sahipliği
-- -----------------------------------------------------------------------------
ALTER DATABASE advetics OWNER TO advetics_migrator;
ALTER SCHEMA public OWNER TO advetics_migrator;

-- Helper fonksiyonların yaşadığı şema (RLS politikaları bunları çağırır)
CREATE SCHEMA IF NOT EXISTS app AUTHORIZATION advetics_migrator;

GRANT USAGE ON SCHEMA public, app TO advetics_app, advetics_worker;

-- -----------------------------------------------------------------------------
-- Mevcut nesneler için yetkiler
-- -----------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
  TO advetics_app, advetics_worker;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public
  TO advetics_app, advetics_worker;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app
  TO advetics_app, advetics_worker;

-- -----------------------------------------------------------------------------
-- Gelecekte migrator'ın oluşturacağı nesneler için varsayılan yetkiler
-- (Bu olmadan her migration sonrası elle GRANT vermek gerekirdi.)
-- -----------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE advetics_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO advetics_app, advetics_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE advetics_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO advetics_app, advetics_worker;

ALTER DEFAULT PRIVILEGES FOR ROLE advetics_migrator IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO advetics_app, advetics_worker;

-- advetics_app ASLA DDL çalıştıramaz.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM advetics_app, advetics_worker;
