-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
-- Bu dosya sistemin son savunma hattıdır.
--
-- Uygulama katmanındaki her guard, her WHERE koşulu, her ORM filtresi hatalı
-- yazılmış olsa bile buradaki politikalar bir müşterinin başka bir müşterinin
-- verisini görmesini engeller. Ajans ürününde tek sızıntı işi bitirir —
-- bu yüzden izolasyon uygulama katmanına EMANET EDİLMEZ.
--
-- Bağlam, her istek için transaction başında `SET LOCAL` ile verilir:
--   SET LOCAL app.current_org_id    = '<uuid>';
--   SET LOCAL app.current_user_id   = '<uuid>';
--   SET LOCAL app.current_client_ids= '<uuid>,<uuid>,...';
--   SET LOCAL app.is_org_admin      = 'on' | 'off';
--
-- `SET LOCAL` transaction bitince otomatik sıfırlanır — connection pool'da
-- bir sonraki isteğe bağlam sızmaz. `SET` (LOCAL'sız) ASLA kullanılmamalıdır.
--
-- Bağlam hiç verilmezse tüm ayarlar NULL döner, karşılaştırmalar NULL üretir,
-- politikalar false'a düşer ve HİÇBİR SATIR görünmez. Güvenli varsayılan budur.
--
-- Çalıştırma: pnpm db:rls   (idempotent)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bağlam okuyucu yardımcı fonksiyonlar
-- -----------------------------------------------------------------------------

-- Şemayı burada da oluşturuyoruz.
--
-- `app` şeması normalde sunucu hazırlığında (infra/postgres/init/01-roles.sql)
-- açılır, ama o script belirli bir veritabanına uygulanır. Uygulama başka bir
-- veritabanına bağlanıyorsa şema orada bulunmaz ve bu dosya
-- "schema app does not exist" ile patlar. Bu dosyanın hangi veritabanına
-- uygulanırsa uygulansın kendi başına çalışması gerekir.
CREATE SCHEMA IF NOT EXISTS app;

CREATE OR REPLACE FUNCTION app.current_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_org_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION app.current_user_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::uuid;
$$;

/*
 * Kullanıcının erişebildiği client id listesi.
 * Org geneli yetkili roller için bu liste org'daki TÜM client'ları içerir —
 * "hepsi" anlamına gelen bir joker değer tanımlamıyoruz, çünkü joker değerler
 * politikalarda kolayca yanlış yerde eşleşir.
 */
CREATE OR REPLACE FUNCTION app.current_client_ids() RETURNS uuid[]
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    string_to_array(NULLIF(current_setting('app.current_client_ids', true), ''), ',')::uuid[],
    ARRAY[]::uuid[]
  );
$$;

CREATE OR REPLACE FUNCTION app.is_org_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.is_org_admin', true), '')::boolean, false);
$$;

/* Bağlamın gerçekten kurulduğunu doğrular. Politikalarda ilk koşul olarak kullanılır. */
CREATE OR REPLACE FUNCTION app.has_context() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_org_id() IS NOT NULL AND app.current_user_id() IS NOT NULL;
$$;

/* Verilen client'a erişim var mı? */
CREATE OR REPLACE FUNCTION app.can_access_client(target uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_context()
     AND (app.is_org_admin() OR target = ANY (app.current_client_ids()));
$$;

-- -----------------------------------------------------------------------------
-- RLS'i aç ve ZORLA
--
-- FORCE olmadan tablo sahibi politikaları atlar. Sahibimiz advetics_migrator
-- ve zaten BYPASSRLS'e sahip; FORCE burada ikinci bir emniyet kemeridir —
-- ileride sahiplik değişirse politikalar yine de geçerli kalır.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'organizations', 'users', 'clients', 'memberships', 'branding_profiles',
    'refresh_tokens', 'password_reset_tokens', 'invitations', 'audit_logs',
    -- Modül 2
    'platform_connections', 'ad_accounts', 'social_profiles', 'oauth_states'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
  END LOOP;
END
$$;

-- Politikaları yeniden tanımlamadan önce temizle (idempotent olsun diye)
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'adv_%'
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END
$$;

-- -----------------------------------------------------------------------------
-- organizations
-- Kullanıcı yalnızca kendi organizasyonunu görür.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_organizations_select ON organizations
  FOR SELECT USING (id = app.current_org_id());

CREATE POLICY adv_organizations_update ON organizations
  FOR UPDATE USING (id = app.current_org_id() AND app.is_org_admin())
             WITH CHECK (id = app.current_org_id());

-- INSERT/DELETE yok: organizasyon oluşturma ve silme yalnızca
-- BYPASSRLS'e sahip yönetim bağlantısı üzerinden yapılır.

-- -----------------------------------------------------------------------------
-- users
--
-- Kasıtlı olarak dar: org yöneticileri tüm kullanıcıları, diğer herkes yalnızca
-- kendisini görür. Bir client_viewer'ın ajans personelinin e-postalarını
-- listeleyebilmesi için hiçbir sebep yok.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_users_select ON users
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR id = app.current_user_id())
  );

CREATE POLICY adv_users_insert ON users
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.is_org_admin());

CREATE POLICY adv_users_update ON users
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR id = app.current_user_id())
  ) WITH CHECK (org_id = app.current_org_id());

CREATE POLICY adv_users_delete ON users
  FOR DELETE USING (org_id = app.current_org_id() AND app.is_org_admin());

-- -----------------------------------------------------------------------------
-- clients
-- -----------------------------------------------------------------------------
CREATE POLICY adv_clients_select ON clients
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR id = ANY (app.current_client_ids()))
  );

CREATE POLICY adv_clients_insert ON clients
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.is_org_admin());

CREATE POLICY adv_clients_update ON clients
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR id = ANY (app.current_client_ids()))
  ) WITH CHECK (org_id = app.current_org_id());

CREATE POLICY adv_clients_delete ON clients
  FOR DELETE USING (org_id = app.current_org_id() AND app.is_org_admin());

-- -----------------------------------------------------------------------------
-- memberships
--
-- Yetki değiştirmek yalnızca org yöneticilerinin işidir. Bir manager'ın kendi
-- membership satırını UPDATE edip role='owner' yazabilmesi, tüm RBAC'i anlamsız
-- kılardı — bu yüzden yazma yetkisi is_org_admin() ile kilitli.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_memberships_select ON memberships
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR user_id = app.current_user_id())
  );

CREATE POLICY adv_memberships_write ON memberships
  FOR ALL USING (org_id = app.current_org_id() AND app.is_org_admin())
          WITH CHECK (org_id = app.current_org_id() AND app.is_org_admin());

-- -----------------------------------------------------------------------------
-- branding_profiles
--
-- Okuma geniş (client kendi markasını görmeli), yazma dar.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_branding_select ON branding_profiles
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND (client_id IS NULL OR app.can_access_client(client_id))
  );

CREATE POLICY adv_branding_write ON branding_profiles
  FOR ALL USING (org_id = app.current_org_id() AND app.is_org_admin())
          WITH CHECK (org_id = app.current_org_id() AND app.is_org_admin());

-- -----------------------------------------------------------------------------
-- refresh_tokens / password_reset_tokens
--
-- Kullanıcı yalnızca kendi oturumlarını görür ve iptal edebilir.
-- Token OLUŞTURMA (login, reset) kimlik doğrulamadan ÖNCE gerçekleştiği için
-- bağlam yoktur; o akışlar yönetim bağlantısını kullanır. Bkz.
-- src/prisma/prisma-admin.service.ts
-- -----------------------------------------------------------------------------
CREATE POLICY adv_refresh_tokens_own ON refresh_tokens
  FOR ALL USING (user_id = app.current_user_id())
          WITH CHECK (user_id = app.current_user_id());

CREATE POLICY adv_password_resets_own ON password_reset_tokens
  FOR ALL USING (user_id = app.current_user_id())
          WITH CHECK (user_id = app.current_user_id());

-- -----------------------------------------------------------------------------
-- invitations
-- Davet yönetimi yalnızca org yöneticilerine aittir.
-- Daveti KABUL etme akışı kimlik doğrulamasızdır → yönetim bağlantısı kullanır.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_invitations_admin ON invitations
  FOR ALL USING (org_id = app.current_org_id() AND app.is_org_admin())
          WITH CHECK (org_id = app.current_org_id() AND app.is_org_admin());

-- -----------------------------------------------------------------------------
-- audit_logs
--
-- Salt okunur + append-only. UPDATE ve DELETE politikası KASITLI OLARAK YOK:
-- politika tanımlanmamış bir komut RLS altında daima reddedilir. Denetim kaydı
-- silinebiliyorsa denetim kaydı değildir.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_audit_select ON audit_logs
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR (client_id IS NOT NULL AND client_id = ANY (app.current_client_ids())))
  );

CREATE POLICY adv_audit_insert ON audit_logs
  FOR INSERT WITH CHECK (org_id = app.current_org_id());

-- =============================================================================
-- MODÜL 2 — Platform Bağlantıları
-- =============================================================================
--
-- Üçü de müşteri düzeyinde veri: bir müşterinin Meta/Google bağlantısı, reklam
-- hesapları ve sosyal profilleri. Erişim `app.can_access_client()` ile
-- belirlenir — org yöneticisi hepsini, müşteri düzeyi kullanıcı yalnızca
-- yetkili olduklarını görür.
--
-- Şifreli token kolonları (access_token_enc vb.) bu politikalarla korunur ama
-- ASIL koruma uygulama katmanındadır: bu kolonlar hiçbir API yanıtında
-- döndürülmez ve yalnızca CryptoService içinde çözülür.

-- -----------------------------------------------------------------------------
-- platform_connections
-- -----------------------------------------------------------------------------
CREATE POLICY adv_connections_select ON platform_connections
  FOR SELECT USING (app.can_access_client(client_id));

CREATE POLICY adv_connections_write ON platform_connections
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- ad_accounts
--
-- Yazma yetkisi de müşteri erişimine bağlı: `sync_enabled` bayrağını
-- değiştirmek kota tüketimini etkiler, o yüzden müşterisine erişimi olan
-- kullanıcı bunu yapabilir. Hangi ROLÜN yapabileceğini PermissionsGuard belirler.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_ad_accounts_select ON ad_accounts
  FOR SELECT USING (app.can_access_client(client_id));

CREATE POLICY adv_ad_accounts_write ON ad_accounts
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- social_profiles  (yalnızca Meta — Auto-Boost, Modül 7)
-- -----------------------------------------------------------------------------
CREATE POLICY adv_social_profiles_select ON social_profiles
  FOR SELECT USING (app.can_access_client(client_id));

CREATE POLICY adv_social_profiles_write ON social_profiles
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- oauth_states
--
-- Kısa ömürlü CSRF kayıtları. Kullanıcı yalnızca KENDİ başlattığı akışı
-- görebilir — başkasının state satırını okumak, onun adına bağlantı kurma
-- denemesine kapı açardı.
--
-- UPDATE/DELETE politikası KASITLI olarak yok: state'i tüketmek (consumed_at)
-- ve süresi geçmişleri temizlemek yönetim bağlantısının işi. Callback zaten
-- kimlik doğrulamasız çalışır (kullanıcı platformdan geri döner) ve
-- PrismaAdminService kullanır.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_oauth_states_select ON oauth_states
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND created_by_user_id = app.current_user_id()
  );

CREATE POLICY adv_oauth_states_insert ON oauth_states
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND created_by_user_id = app.current_user_id()
    AND app.can_access_client(client_id)
  );

-- -----------------------------------------------------------------------------
-- Yetkiler (yeni tablolar için ALTER DEFAULT PRIVILEGES zaten çalışıyor;
-- bu satırlar mevcut tabloları da kapsar)
-- -----------------------------------------------------------------------------
-- Roller yoksa GRANT'ler hata verir ve bu dosya tek bir sorgu olarak
-- çalıştırıldığı için TÜM politikalar geri alınır — yani sessizce korumasız
-- bir veritabanı kalırdı. Rol varlığını kontrol edip koşullu uyguluyoruz.
DO $$
DECLARE
  r text;
  roles text[] := ARRAY['advetics_app', 'advetics_worker'];
BEGIN
  FOREACH r IN ARRAY roles LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', r);
      EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', r);
      EXECUTE format('GRANT USAGE ON SCHEMA app TO %I', r);
      EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO %I', r);
    ELSE
      RAISE WARNING 'Rol % bulunamadı — yetkiler atlandı. Uygulama bu rolle bağlanacaksa scripts/vps-setup.sh çalıştırılmalı.', r;
    END IF;
  END LOOP;

  -- audit_logs append-only: uygulama rolüne UPDATE/DELETE yetkisi hiç verilmez.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'advetics_app') THEN
    EXECUTE 'REVOKE UPDATE, DELETE ON audit_logs FROM advetics_app';
  END IF;
END
$$;
