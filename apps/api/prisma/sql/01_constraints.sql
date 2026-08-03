-- =============================================================================
-- Prisma ile ifade edilemeyen kısıtlar
-- Çalıştırma: pnpm db:rls  (migration'dan SONRA)
-- Tümü idempotenttir; tekrar tekrar çalıştırılabilir.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- memberships: org geneli erişimin tekilliği
--
-- Postgres'te UNIQUE(user_id, client_id) NULL'ları BİRBİRİNDEN FARKLI sayar.
-- Yani bir kullanıcıya iki kez org geneli membership verilebilirdi.
-- Partial unique index bunu engeller.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS memberships_user_org_scope_uniq
  ON memberships (user_id)
  WHERE client_id IS NULL;

-- -----------------------------------------------------------------------------
-- memberships: org geneli erişim yalnızca owner/admin rollerine verilebilir.
-- Bir "analyst"a client_id=NULL vermek, ona tüm müşterileri açardı.
-- -----------------------------------------------------------------------------
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_org_scope_role_chk;
ALTER TABLE memberships ADD CONSTRAINT memberships_org_scope_role_chk
  CHECK (client_id IS NOT NULL OR role IN ('owner', 'admin'));

-- -----------------------------------------------------------------------------
-- clients: ISO 4217 para birimi formatı
-- -----------------------------------------------------------------------------
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_reporting_currency_chk;
ALTER TABLE clients ADD CONSTRAINT clients_reporting_currency_chk
  CHECK (reporting_currency ~ '^[A-Z]{3}$');

-- -----------------------------------------------------------------------------
-- users: e-posta daima küçük harf saklanır (uygulama katmanı Zod ile normalize
-- eder; bu constraint o katman atlanırsa devreye girer).
-- -----------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_lowercase_chk;
ALTER TABLE users ADD CONSTRAINT users_email_lowercase_chk
  CHECK (email = lower(email));

-- -----------------------------------------------------------------------------
-- branding_profiles: org varsayılanı (client_id IS NULL) org başına tek olmalı.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS branding_profiles_org_default_uniq
  ON branding_profiles (org_id)
  WHERE client_id IS NULL;

-- -----------------------------------------------------------------------------
-- invitations: aynı e-posta + aynı kapsam için birden fazla BEKLEYEN davet olmasın.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS invitations_pending_uniq
  ON invitations (org_id, email, COALESCE(client_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE status = 'pending';

-- -----------------------------------------------------------------------------
-- refresh_tokens: süresi geçmiş kayıtların temizliği için kısmi index
-- (Modül 1.5'te bir cron job bunu kullanacak.)
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS refresh_tokens_active_idx
  ON refresh_tokens (user_id, expires_at)
  WHERE revoked_at IS NULL;
