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
    'platform_connections', 'ad_accounts', 'social_profiles', 'oauth_states',
    -- Politikası KASITLI olarak yok — aşağıdaki nota bak.
    'data_deletion_requests',
    -- Modül 3
    'campaigns', 'ad_groups', 'ads', 'creatives', 'insights_daily',
    'fx_rates', 'sync_jobs', 'api_usage_log',
    -- Modül 6
    'report_templates', 'report_shares',
    -- Modül 5
    'monthly_budgets', 'rules', 'rule_runs', 'rule_action_logs',
    -- Modül 7
    'organic_posts', 'boost_rules', 'boosts',
    -- Modül 4 — reklam oluşturucu
    'ad_drafts', 'ad_draft_assets',
    -- Anahtar kelime performansı
    'keyword_insights',
    -- Modül 8
    'bulk_batches', 'bulk_items'
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

-- =============================================================================
-- MODÜL 3 — Reklam hiyerarşisi ve metrikler
-- =============================================================================
--
-- Hepsi müşteri düzeyi veri. `client_id` bilerek DENORMALİZE edildi: politikayı
-- join'siz yazmak, her satır için üst tabloya gitmek zorunda kalmamak demek.
-- 47 milyon satırlı bir tabloda politika içindeki bir join, sorgu planını
-- mahveder.

CREATE POLICY adv_campaigns_select ON campaigns
  FOR SELECT USING (app.can_access_client(client_id));
CREATE POLICY adv_campaigns_write ON campaigns
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

CREATE POLICY adv_ad_groups_select ON ad_groups
  FOR SELECT USING (app.can_access_client(client_id));
CREATE POLICY adv_ad_groups_write ON ad_groups
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

CREATE POLICY adv_ads_select ON ads
  FOR SELECT USING (app.can_access_client(client_id));
CREATE POLICY adv_ads_write ON ads
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

CREATE POLICY adv_creatives_select ON creatives
  FOR SELECT USING (app.can_access_client(client_id));
CREATE POLICY adv_creatives_write ON creatives
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- insights_daily — partitioned tablo
--
-- Politika ANA tabloda tanımlı. Postgres'te ana tablo üzerinden yapılan
-- sorgularda bu politikalar partition'lara da uygulanır. Bir partition'a
-- DOĞRUDAN erişim ana tablonun politikalarını atladığı için 03_partitions.sql
-- her partition'a ayrıca politika ekliyor — ileride biri optimizasyon adına
-- doğrudan partition sorgusu yazarsa izolasyon sessizce kaybolmasın.
--
-- Yazma yalnızca worker'ın işi ve o BYPASSRLS rolüyle bağlanıyor; yine de
-- politika yazıyoruz ki uygulama rolü kazara yazmaya çalışırsa engellensin.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_insights_select ON insights_daily
  FOR SELECT USING (app.can_access_client(client_id));
CREATE POLICY adv_insights_write ON insights_daily
  FOR ALL USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- fx_rates — müşteriye bağlı DEĞİL, tüm organizasyonlar için ortak referans veri.
-- Okuma serbest, yazma yalnızca worker'ın (BYPASSRLS) işi.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_fx_rates_select ON fx_rates
  FOR SELECT USING (app.has_context());

CREATE POLICY adv_sync_jobs_select ON sync_jobs
  FOR SELECT USING (app.can_access_client(client_id));
-- Kullanıcı elle senkronizasyon tetikleyebiliyor; kayıt oluşturmasına izin var.
CREATE POLICY adv_sync_jobs_insert ON sync_jobs
  FOR INSERT WITH CHECK (app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- api_usage_log — kota telemetrisi.
--
-- client_id NULL olabilir (henüz hesaba bağlanmamış çağrılar). Org yöneticisi
-- kendi organizasyonunun tüketimini görmeli; müşteri düzeyi kullanıcının
-- kota telemetrisine ihtiyacı yok.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_api_usage_select ON api_usage_log
  FOR SELECT USING (
    app.is_org_admin()
    AND client_id IS NOT NULL
    AND client_id = ANY (app.current_client_ids())
  );

-- -----------------------------------------------------------------------------
-- data_deletion_requests — POLİTİKA YOK, kasıtlı
--
-- RLS açık ama hiçbir politika tanımlı değil. Sonuç: `advetics_app` rolü bu
-- tabloda HİÇBİR satır göremez ve yazamaz. Doğru davranış bu:
--
--   · Kayıtları oluşturan Meta'nın imzalı webhook'u — kimlik doğrulaması yok,
--     yönetim bağlantısını kullanıyor.
--   · Durumu okuyan herkese açık sorgu sayfası — oturum yok, o da yönetim
--     bağlantısını kullanıyor.
--
-- Bir tenant'ın başka bir kullanıcının silme talebini görmesi için hiçbir sebep
-- yok. Politika yazmak yerine erişimi tamamen kapatmak, en küçük yetki
-- ilkesinin doğru uygulaması.
-- -----------------------------------------------------------------------------

-- =============================================================================
-- MODÜL 6 — White-label raporlama
-- =============================================================================

-- -----------------------------------------------------------------------------
-- report_templates
--
-- Şablon müşteri bazında ya da organizasyon geneli (client_id IS NULL) olabilir.
-- Organizasyon geneli şablonu HERKES OKUR (varsayılan olarak kullanılıyor) ama
-- yalnızca org yöneticisi DEĞİŞTİRİR: bir müşteri temsilcisinin varsayılan
-- şablonu bozması tüm müşterilerin raporunu etkilerdi.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_report_tpl_select ON report_templates
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND (
      app.is_org_admin()
      OR client_id IS NULL
      OR client_id = ANY (app.current_client_ids())
    )
  );

CREATE POLICY adv_report_tpl_insert ON report_templates
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR (client_id IS NOT NULL AND app.can_access_client(client_id)))
  );

CREATE POLICY adv_report_tpl_update ON report_templates
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR (client_id IS NOT NULL AND app.can_access_client(client_id)))
  );

CREATE POLICY adv_report_tpl_delete ON report_templates
  FOR DELETE USING (
    org_id = app.current_org_id()
    AND (app.is_org_admin() OR (client_id IS NOT NULL AND app.can_access_client(client_id)))
  );

-- -----------------------------------------------------------------------------
-- report_shares
--
-- Paylaşım linkleri müşteri bazında ve panelden yönetiliyor.
--
-- Linkin KENDİSİYLE yapılan anonim okuma bu politikalardan GEÇMİYOR: oturum
-- yok, dolayısıyla `app.current_org_id()` boş ve hiçbir satır görünmüyor. O yol
-- yönetim bağlantısını kullanıyor ve token hash'i ile TEK satır çekiyor —
-- `data_deletion_requests` ile aynı desen. Buradaki politikalar panelden
-- yapılan listeleme, oluşturma ve iptal için.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_report_share_select ON report_shares
  FOR SELECT USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_report_share_insert ON report_shares
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_report_share_update ON report_shares
  FOR UPDATE USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_report_share_delete ON report_shares
  FOR DELETE USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

-- =============================================================================
-- MODÜL 5 — Aylık bütçe
-- =============================================================================

-- -----------------------------------------------------------------------------
-- monthly_budgets
--
-- Bütçe müşteriye ait bir bilgi: müşteri temsilcisi kendi müşterisinin
-- bütçesini görmeli, başkasınınkini görmemeli. Standart kiracı deseni.
--
-- BURADA OLMAYAN ŞEY: `budget.write` ayrımı.
--
-- Analist bütçeyi GÖRÜR ama DEĞİŞTİREMEZ (roles.ts). Bu ayrım RLS'te
-- ZORLANMIYOR, guard katmanında zorlanıyor — çünkü RLS bağlamında yalnızca dört
-- GUC var (org, kullanıcı, client listesi, org admin mi) ve rol adı yok.
--
-- Bilinçli bir sınır: RLS bu projede KİRACI izolasyonunun son savunma hattı,
-- rol matrisinin ikinci kopyası değil. İzin listesini iki yerde tutmak ikisinin
-- zamanla ayrışması demek ve ayrışan kopya sessizce yanlış olan taraf olur.
-- Yanlış müşterinin bütçesini görmek veri sızıntısı; yetkisiz kullanıcının
-- kendi müşterisinin bütçesini değiştirmesi yetki hatası — ikincisi ciddi ama
-- kiracı sınırını delmiyor.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_monthly_budget_select ON monthly_budgets
  FOR SELECT USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_monthly_budget_insert ON monthly_budgets
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

-- UPDATE'te WITH CHECK de var: USING satırın ESKİ hâlini, WITH CHECK YENİ hâlini
-- denetler. Yalnızca USING olsaydı, erişilebilir bir bütçenin client_id'si
-- erişilemeyen bir müşteriye taşınabilirdi — satır kendi kiracısından çıkardı.
CREATE POLICY adv_monthly_budget_update ON monthly_budgets
  FOR UPDATE USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  ) WITH CHECK (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_monthly_budget_delete ON monthly_budgets
  FOR DELETE USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

-- =============================================================================
-- MODÜL 5 — Kural motoru
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rules
--
-- Standart kiracı deseni: kural müşteriye ait, müşteri temsilcisi kendi
-- müşterisinin kuralını görür ve yazar.
--
-- BURADA OLMAYAN ŞEY: prova/canlı ayrımı ve rule.activate yetkisi.
--
-- `monthly_budgets` ile aynı gerekçe: RLS bağlamında yalnızca dört GUC var
-- (org, kullanıcı, client listesi, org admin mi) ve rol adı yok. İzin listesini
-- iki yerde tutmak ikisinin zamanla ayrışması demek. RLS burada kiracı
-- sınırını koruyor; bir kuralı canlıya almanın yetkisi guard katmanında.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_rules_select ON rules
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_rules_insert ON rules
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- UPDATE'te WITH CHECK de var: USING satırın ESKİ, WITH CHECK YENİ hâlini
-- denetliyor. Yalnızca USING olsaydı bir kural erişilemeyen bir müşteriye
-- taşınabilirdi — o müşterinin hesabında çalışan, sahibinin göremediği bir
-- kural.
CREATE POLICY adv_rules_update ON rules
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_rules_delete ON rules
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- rule_runs ve rule_action_logs
--
-- Kiracı kontrolü KURAL ÜZERİNDEN yapılıyor: satırın kendi org_id'si var ama
-- tek başına yetmez — org içindeki başka bir müşterinin kuralının turları
-- görünürdü. `EXISTS` alt sorgusu kuralın client_id'sini denetliyor.
--
-- INSERT politikası worker için DEĞİL: worker BYPASSRLS ile bağlanıyor ve
-- politikalara hiç uğramıyor. Bu politikalar panelden yapılan manuel
-- çalıştırma içindir.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_rule_runs_select ON rule_runs
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM rules r
      WHERE r.id = rule_runs.rule_id AND app.can_access_client(r.client_id)
    )
  );

CREATE POLICY adv_rule_runs_insert ON rule_runs
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM rules r
      WHERE r.id = rule_runs.rule_id AND app.can_access_client(r.client_id)
    )
  );

CREATE POLICY adv_rule_runs_update ON rule_runs
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM rules r
      WHERE r.id = rule_runs.rule_id AND app.can_access_client(r.client_id)
    )
  );

-- DELETE politikası YOK: tur kaydı denetim izidir.
--
-- `audit_logs` ile aynı gerekçe. Kuralın ne zaman ne yaptığı, kuralı yazan
-- kişinin silebileceği bir bilgi olmamalı. Kural silinirse turlar CASCADE ile
-- gider; bu bilinçli — kuralın kendisi yoksa turlarının bağlamı da yok.

CREATE POLICY adv_rule_actions_select ON rule_action_logs
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM rules r
      WHERE r.id = rule_action_logs.rule_id AND app.can_access_client(r.client_id)
    )
  );

CREATE POLICY adv_rule_actions_insert ON rule_action_logs
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM rules r
      WHERE r.id = rule_action_logs.rule_id AND app.can_access_client(r.client_id)
    )
  );

-- =============================================================================
-- MODÜL 7 — Auto-Boost
-- =============================================================================

-- -----------------------------------------------------------------------------
-- organic_posts, boost_rules, boosts
--
-- Üçü de standart kiracı deseni: satır müşteriye ait, müşteri temsilcisi
-- kendi müşterisinin verisini görüyor.
--
-- BURADA OLMAYAN ŞEY: `boost.approve` ayrımı. `monthly_budgets` ve `rules` ile
-- aynı gerekçe — RLS bağlamında rol adı yok ve izin listesini iki yerde tutmak
-- ikisinin zamanla ayrışması demek. RLS kiracı sınırını koruyor; onay yetkisi
-- guard katmanında.
--
-- organic_posts'a DELETE politikası YOK: gönderiler senkronizasyondan geliyor
-- ve elle silinmeleri, boost geçmişinin dayandığı kaydı ortadan kaldırırdı.
-- Sosyal profil silinirse CASCADE ile gidiyorlar.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_organic_posts_select ON organic_posts
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_organic_posts_insert ON organic_posts
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_organic_posts_update ON organic_posts
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boost_rules_select ON boost_rules
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boost_rules_insert ON boost_rules
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boost_rules_update ON boost_rules
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boost_rules_delete ON boost_rules
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boosts_select ON boosts
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boosts_insert ON boosts
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_boosts_update ON boosts
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- boosts'a DELETE politikası YOK: bir boost para taahhüdü ve kaydı denetim
-- izidir. İptal etmek `status = 'rejected'` demek, satırı silmek değil.

-- =============================================================================
-- MODÜL 8 — Toplu Oluşturucu
-- =============================================================================

-- -----------------------------------------------------------------------------
-- bulk_batches: standart kiracı deseni.
--
-- bulk_items'ın kendi client_id'si YOK ve olması da gerekmiyor: satır her
-- zaman bir partiye ait ve parti müşteriye. Kolonu tekrarlamak, iki kaynağın
-- ayrışması riski demek olurdu (satır bir partiye, client_id başka müşteriye
-- işaret edebilir). Kiracı kontrolü partinin üzerinden yapılıyor.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_bulk_batches_select ON bulk_batches
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_bulk_batches_insert ON bulk_batches
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_bulk_batches_update ON bulk_batches
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_bulk_batches_delete ON bulk_batches
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_bulk_items_select ON bulk_items
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM bulk_batches b
      WHERE b.id = bulk_items.batch_id AND app.can_access_client(b.client_id)
    )
  );

CREATE POLICY adv_bulk_items_insert ON bulk_items
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM bulk_batches b
      WHERE b.id = bulk_items.batch_id AND app.can_access_client(b.client_id)
    )
  );

CREATE POLICY adv_bulk_items_update ON bulk_items
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM bulk_batches b
      WHERE b.id = bulk_items.batch_id AND app.can_access_client(b.client_id)
    )
  );

CREATE POLICY adv_bulk_items_delete ON bulk_items
  FOR DELETE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM bulk_batches b
      WHERE b.id = bulk_items.batch_id AND app.can_access_client(b.client_id)
    )
  );

-- =============================================================================
-- Reklam Oluşturucu — Modül 4 (CREATE)
-- =============================================================================

CREATE POLICY adv_ad_drafts_select ON ad_drafts
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_ad_drafts_insert ON ad_drafts
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_ad_drafts_update ON ad_drafts
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_ad_drafts_delete ON ad_drafts
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- ad_draft_assets
--
-- Kiracı kontrolü TASLAK ÜZERİNDEN. Satırın kendi org_id'si var ama tek başına
-- yetmez: org içindeki başka bir müşterinin taslağına ait görsel görünürdü.
--
-- Bu tabloda sızıntı diğerlerinden farklı bir şey demek: görseller müşterinin
-- henüz yayınlamadığı kreatifleri ve rakip bir müşterinin bunları görmesi
-- ticari bir sorun.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_ad_draft_assets_select ON ad_draft_assets
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_drafts d
      WHERE d.id = ad_draft_assets.draft_id AND app.can_access_client(d.client_id)
    )
  );

CREATE POLICY adv_ad_draft_assets_insert ON ad_draft_assets
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_drafts d
      WHERE d.id = ad_draft_assets.draft_id AND app.can_access_client(d.client_id)
    )
  );

CREATE POLICY adv_ad_draft_assets_update ON ad_draft_assets
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_drafts d
      WHERE d.id = ad_draft_assets.draft_id AND app.can_access_client(d.client_id)
    )
  );

CREATE POLICY adv_ad_draft_assets_delete ON ad_draft_assets
  FOR DELETE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_drafts d
      WHERE d.id = ad_draft_assets.draft_id AND app.can_access_client(d.client_id)
    )
  );

-- =============================================================================
-- Anahtar kelime performansı
-- =============================================================================

-- DELETE politikası YOK: veriler senkronizasyondan geliyor ve elle silinmeleri
-- raporun dayandığı kaydı ortadan kaldırırdı. Hesap silinirse CASCADE ile
-- gidiyorlar.
CREATE POLICY adv_keyword_insights_select ON keyword_insights
  FOR SELECT USING (app.can_access_client(client_id));

CREATE POLICY adv_keyword_insights_insert ON keyword_insights
  FOR INSERT WITH CHECK (app.can_access_client(client_id));

CREATE POLICY adv_keyword_insights_update ON keyword_insights
  FOR UPDATE USING (app.can_access_client(client_id))
             WITH CHECK (app.can_access_client(client_id));

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
