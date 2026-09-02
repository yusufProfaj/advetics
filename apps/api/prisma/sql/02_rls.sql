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

/*
 * HAVUZ SATIRLARINI (client_id IS NULL) KİM GÖREBİLİR/YAZABİLİR.
 *
 * Havuz erişimi uzun süre `app.is_org_admin()` demekti ve o bayrak
 * `ORG_SCOPED_ROLES`ten (owner/admin) türüyor. Reklam yöneticisi rolü
 * eklendiğinde ortaya şu çıktı: rolün atama yetkisi olabiliyor ama havuz
 * satırlarını RLS HİÇ göstermiyor — panelde atanabilecek hesap listesi BOŞ
 * geliyor ve sebebi hiçbir ekranda yazmıyor. Yetkiyi verip veriyi
 * göstermemek, bu projede en pahalı hata türü olan sessiz yanlışın ta
 * kendisi.
 *
 * Bayrağı `isOrgAdmin`e eklemek çözüm DEĞİLDİ: o bayrak kullanıcı
 * oluşturmayı, üyelik vermeyi ve müşteri silmeyi de açıyor.
 *
 * `app.can_manage_pool` ayrı bir oturum değişkeni ve `connection.manage`
 * yetkisinden besleniyor (`prisma.service.ts`). Org yöneticisi HER ZAMAN
 * geçiyor: değişkeni hiç yazmayan bir çağrı (eski testler, worker) eskisi
 * gibi davranıyor — varsayılan kapalı, güvenli taraf.
 */
CREATE OR REPLACE FUNCTION app.can_manage_pool() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_org_admin()
      OR COALESCE(NULLIF(current_setting('app.can_manage_pool', true), '')::boolean, false);
$$;

/*
 * YENİ MÜŞTERİ AÇABİLİR Mİ.
 *
 * Havuzdan AYRI bir değişken: bir rol reklam hesabı atayabilip müşteri
 * açamayabilir ve tersi. Bugün ikisini de aynı roller taşıyor ama tek
 * değişkene bağlamak, o gün geldiğinde politikayı yeniden çözmek demekti.
 * `client.write` yetkisinden besleniyor.
 */
CREATE OR REPLACE FUNCTION app.can_create_clients() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.is_org_admin()
      OR COALESCE(NULLIF(current_setting('app.can_create_clients', true), '')::boolean, false);
$$;

/* Bağlamın gerçekten kurulduğunu doğrular. Politikalarda ilk koşul olarak kullanılır. */
CREATE OR REPLACE FUNCTION app.has_context() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.current_org_id() IS NOT NULL AND app.current_user_id() IS NOT NULL;
$$;

/*
 * Panelde SEÇİLİ olan müşteri. Boş string = seçim yok (org geneli görünüm).
 *
 * current_client_ids() ile karıştırılmamalı: o ERİŞEBİLECEĞİ müşterilerin
 * listesi, bu ise ŞU AN BAKTIĞI müşteri. İkisi ayrı sorulara cevap veriyor
 * ve tek bir değişkende birleştirilemezler — erişim listesini seçime
 * daraltmak, müşteri seçicisinin kendi listesini de daraltıp kullanıcıyı
 * seçtiği müşteriye kilitlerdi.
 */
CREATE OR REPLACE FUNCTION app.current_active_client_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_active_client_id', true), '')::uuid;
$$;

/*
 * Verilen client'a erişim var mı?
 *
 * İKİ KATMAN:
 *
 *   1. YETKİ    — org yöneticisi her müşteriyi görebilir, diğerleri yalnızca
 *                 kendi portföyünü.
 *   2. SEÇİM    — panelde bir müşteri seçiliyse, veri O müşteriyle sınırlanır.
 *
 * İkinci katman sonradan eklendi ve sebebi somut: org yöneticisi Çiftçi Grup'u
 * seçmesine rağmen panelde Mirnas'ın kampanyalarını görüyordu. Seçim
 * hesaplanıyor ve oturum bağlamında duruyordu ama HİÇBİR YERDE
 * KULLANILMIYORDU; metrik sorgusunda da client süzgeci yoktu, ayrım tamamen
 * bu fonksiyona bırakılmıştı ve bu fonksiyon yöneticiye "hepsini görebilir"
 * diyordu. Sonuç: müşteri seçicisi görsel olarak değişiyor, sorgu değişmiyor.
 *
 * Düzeltme neden BURADA: aynı boşluk Ads Explorer, bütçe, kurallar, raporlar
 * ve leadlerde de vardı — hepsi müşteri ayrımını bu fonksiyona güveniyor.
 * Her sorguya tek tek client süzgeci eklemek, bir tanesini unutmanın sessizce
 * yanlış sayı göstermesi demekti.
 *
 * Yetki katmanı OLDUĞU GİBİ duruyor. Seçim yalnızca DARALTIYOR, hiçbir zaman
 * genişletmiyor: erişemediğin bir müşteriyi seçmek sana o müşteriyi açmıyor.
 * Seçim doğrulaması ayrıca uygulama tarafında da yapılıyor (bkz.
 * tenant-context.service.ts — istenen değer erişim listesine karşı sınanıyor).
 *
 * `clients` tablosunun kendi politikası bu fonksiyonu KULLANMIYOR, kuralını
 * inline yazıyor. Bu şart: müşteri listesi daralsaydı, bir müşteri seçen
 * kullanıcı başka bir müşteriye geçemezdi.
 */
CREATE OR REPLACE FUNCTION app.can_access_client(target uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT app.has_context()
     AND (app.is_org_admin() OR target = ANY (app.current_client_ids()))
     AND (
       app.current_active_client_id() IS NULL
       OR target = app.current_active_client_id()
     );
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
    'refresh_tokens', 'password_reset_tokens', 'audit_logs',
    -- Modül 2
    'platform_connections', 'ad_accounts', 'social_profiles', 'oauth_states',
    -- Politikası KASITLI olarak yok — aşağıdaki nota bak.
    'data_deletion_requests',
    -- Modül 3
    'campaigns', 'ad_groups', 'ads', 'creatives', 'insights_daily',
    'fx_rates', 'sync_jobs', 'api_usage_log',
    -- Modül 6
    'report_templates', 'report_shares',
    -- Danışman başına e-posta kimliği. Politikası DİĞERLERİNDEN FARKLI:
    -- satır yalnızca SAHİBİNE görünüyor, org yöneticisine bile değil.
    'user_email_accounts',
    -- Modül 5
    'monthly_budgets', 'rules', 'rule_runs', 'rule_action_logs',
    -- Modül 7
    'organic_posts', 'boost_rules', 'boosts',
    -- Advetics 1.0 — otomatik boost ön ayarları ve onay kuyruğu
    'auto_boost_presets', 'auto_boost_queue_items',
    'auto_boost_subscriptions',
    -- Modül 4 — reklam oluşturucu
    'ad_drafts', 'ad_draft_assets',
    -- Anahtar kelime performansı
    'keyword_insights', 'search_term_insights', 'insight_breakdowns',
    'sync_batches', 'report_schedules',
    -- Modül 8
    'bulk_batches', 'bulk_items',
    -- Formlar kütüphanesi
    'lead_forms',
    -- Potansiyel müşteriler
    'leads', 'lead_sync_cursors',
    -- Varlık arşivi
    'assets', 'asset_platform_refs',
    -- Kreatif (metin havuzu + görsel havuzu)
    'ad_creatives', 'ad_creative_assets',
    -- Kampanya taslağı ağacı
    'draft_campaigns', 'draft_ad_groups', 'draft_ads'
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
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_create_clients());

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

/*
 * MÜŞTERİ AÇAN, O MÜŞTERİNİN MARKA PROFİLİNİ DE YAZABİLMEK ZORUNDA.
 *
 * `ClientsService.create` müşteriyle birlikte marka profilini de aynı
 * transaction'da oluşturuyor. Politika yalnızca `is_org_admin()` derken,
 * reklam yöneticisinin açtığı her müşteri ikinci adımda düşüyordu ve hata
 * mesajı marka profilini işaret ettiği için sebep müşteri açma akışında
 * aranmıyordu.
 *
 * ORGANİZASYON VARSAYILANI (client_id IS NULL) HÂLÂ SADECE ORG YÖNETİCİSİNDE:
 * o profil ajansın beyaz etiket kimliği ve bütün müşterilerin raporunda
 * görünüyor. Müşteriye ÖZEL profil, müşteriyi açanın işi.
 */
CREATE POLICY adv_branding_write ON branding_profiles
  FOR ALL USING (
    org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.is_org_admin()
        ELSE app.is_org_admin() OR app.can_create_clients()
      END
    )
  ) WITH CHECK (
    org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.is_org_admin()
        ELSE app.is_org_admin() OR app.can_create_clients()
      END
    )
  );

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
-- BAĞLANTI VE REKLAM HESABI AJANSA AİT (`org_id`), MÜŞTERİYE DEĞİL.
-- `client_id` artık SAHİPLİK değil ATAMA alanı ve NULL olabilir:
--
--   · platform_connections.client_id IS NULL => ajans geneli bağlantı.
--   · ad_accounts.client_id IS NULL          => havuzda, atanmamış hesap.
--
-- BURASI BU MİGRATION'IN EN KRİTİK YERİ. `client_id` nullable olduğu andan
-- itibaren, politikası yazılmamış her satır KİMSEYE AİT OLMAYAN bir satır ve
-- eski politika (`app.can_access_client(client_id)`) NULL girdiyle NULL
-- döndürüp satırı gizlerdi — atama ekranı hiçbir zaman hesap göremezdi.
-- Ters yönde ise yanlış yazılmış tek bir koşul, atanmamış 157 hesabı yanlış
-- kiracıya açar.
--
-- `sosyal profiller` HÂLÂ müşteri düzeyinde (client_id NOT NULL) — bkz.
-- aşağıdaki not.
--
-- Şifreli token kolonları (access_token_enc vb.) bu politikalarla korunur ama
-- ASIL koruma uygulama katmanındadır: bu kolonlar hiçbir API yanıtında
-- döndürülmez ve yalnızca CryptoService içinde çözülür.

-- -----------------------------------------------------------------------------
-- platform_connections
--
-- OKUMA org düzeyinde. Ajansın Meta/Google kimliği tek ve ortak: hangi
-- bağlantının hangi hesapları beslediğini yalnızca org yöneticisine göstermek,
-- manager ve analyst için Platform Bağlantıları ekranını BOŞ bırakırdı — ve
-- boş liste, yetki hatasından ayırt edilemeyen sessiz bir arıza olurdu.
--
-- Bilinçli olarak korunmayan: aynı organizasyondaki her oturum, ajansın
-- bağlantı ETİKETİNİ (accountLabel, platform, durum) okuyabilir. Token'lar
-- değil — onlar hiçbir yanıtta dönmüyor. `client_viewer` rolünde
-- `connection.read` yetkisi zaten yok, yani uç nokta guard seviyesinde kapalı;
-- buradaki politika ikinci savunma hattı olarak kiracı sınırını koruyor,
-- rol sınırını değil.
--
-- YAZMA dar: ajans geneli bir bağlantıyı KALDIRMAK bütün müşterilerin
-- senkronizasyonunu birden durdurur. Bu org yöneticisinin kararı olmalı.
-- Müşteriye özel bağlantı (müşteri kendi hesabını devretmişse) eski kuralla
-- devam ediyor.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_connections_select ON platform_connections
  FOR SELECT USING (
    app.has_context()
    AND org_id = app.current_org_id()
  );

CREATE POLICY adv_connections_write ON platform_connections
  FOR ALL USING (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  ) WITH CHECK (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  );

-- -----------------------------------------------------------------------------
-- ad_accounts
--
-- İKİ HÂL, İKİ KURAL:
--
--   · ATANMIŞ hesap (client_id dolu) — eskisi gibi: müşterisine erişimi olan
--     görür. `sync_enabled` bayrağını değiştirmek kota tüketimini etkilediği
--     için yazma da aynı erişime bağlı. Hangi ROLÜN yapabileceğini
--     PermissionsGuard belirler.
--
--   · HAVUZDAKİ hesap (client_id NULL) — yalnızca org yöneticisi. Havuz,
--     ajansın hangi reklam hesaplarına erişebildiğinin tam listesi (Meta'da
--     157, Google'da 127) ve bunların çoğu BAŞKA müşterilere ait. Müşteri
--     düzeyindeki bir kullanıcıya göstermek, ajansın tüm müşteri portföyünü
--     tek ekranda sızdırmak olurdu.
--
-- `org_id` koşulu ayrıca yazılıyor, `can_access_client()`e güvenilmiyor: o
-- fonksiyon client listesine bakıyor ve hesabın org'unu hiç görmüyor. İkisinin
-- birbiriyle tutarlı olduğunu veritabanı seviyesinde
-- `ad_accounts_client_org_fkey` kompozit yabancı anahtarı garantiliyor.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_ad_accounts_select ON ad_accounts
  FOR SELECT USING (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  );

/*
 * ATAMA YAPAN UÇ NOKTA AKTİF MÜŞTERİ SEÇİMİNİ KAPATMAK ZORUNDA.
 *
 * Bu, POLİTİKAYLA ÇÖZÜLEMEYEN bir kısıt ve yazılırken deneyle bulundu.
 * Postgres'te bir UPDATE'ten sonra YENİ satır, tablonun SELECT politikasından
 * da geçmek zorunda. `can_access_client()` ise panelde seçili müşteriye
 * daraltıyor. Sonuç: org yöneticisi panelde A müşterisi seçiliyken havuzdaki
 * bir hesabı B'ye atamaya çalışırsa, yeni satır kendi görüş alanının dışına
 * çıktığı için Postgres UPDATE'i reddediyor:
 *
 *     new row violates row-level security policy for table "ad_accounts"
 *
 * WITH CHECK'i gevşetmek BU SORUNU ÇÖZMÜYOR — engel SELECT politikasında.
 * Denendi ve ölçüldü; `ad-account-pool-rls.spec.ts` davranışı kilitliyor.
 *
 * ÇÖZÜM POLİTİKADA DEĞİL, ÇAĞIRAN TARAFTA: atama uç noktası bağlamı
 * `activeClientId: null` ile kurmalı (`prisma.withTenant({ ...ctx,
 * activeClientId: null }, …)`). Seçim bir GÖRÜNÜM süzgeci; atama ise bir
 * YÖNETİM işlemi ve org yöneticisi zaten organizasyondaki tüm müşterilere
 * erişebiliyor. SEÇİMİ POLİTİKADAN KALDIRMAK YANLIŞ OLURDU: tam olarak o
 * daraltma, yöneticinin Çiftçi Grup seçiliyken Mirnas'ın verisini görmesi
 * hatasının düzeltmesiydi (bkz. `app.can_access_client` notu).
 *
 * Bu, planın 6. adımını (atama uç noktası + arayüz) yazacak olan için
 * bağlayıcı bir not.
 */
CREATE POLICY adv_ad_accounts_write ON ad_accounts
  FOR ALL USING (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  ) WITH CHECK (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  );

-- -----------------------------------------------------------------------------
-- social_profiles  (yalnızca Meta — Auto-Boost, lead formları, reklam yayını)
--
-- REKLAM HESAPLARIYLA AYNI HAVUZ MODELİ. Sahiplik `org_id`'de; `client_id`
-- NULL ise sayfa havuzda ve yalnızca org yöneticisine görünüyor.
--
-- Neden org yöneticisine: havuz, ajansın Meta kimliğinin eriştiği BÜTÜN
-- sayfaların listesi ve çoğu başka müşterilere ait. Müşteri düzeyindeki bir
-- kullanıcıya göstermek, ajansın portföyünü tek ekranda sızdırmak olurdu.
--
-- ATAMA UÇ NOKTASI DA `activeClientId: null` İLE ÇALIŞMAK ZORUNDA — sebebi
-- `ad_accounts` politikasının üstündeki notta.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_social_profiles_select ON social_profiles
  FOR SELECT USING (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  );

CREATE POLICY adv_social_profiles_write ON social_profiles
  FOR ALL USING (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  ) WITH CHECK (
    app.has_context()
    AND org_id = app.current_org_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
  );

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

-- `client_id` NULL olabilir: ajans geneli yetkilendirme. O hâlde erişim
-- kontrolü müşteriye değil ORG YÖNETİCİLİĞİNE bağlı — ajansın platform
-- kimliğini bağlamak bütün müşterileri etkileyen bir işlem.
-- `can_access_client(NULL)` NULL döner ve politika sessizce false'a düşerdi;
-- akış "geçersiz state" ile ölür, sebebi hiçbir yerde yazmazdı.
CREATE POLICY adv_oauth_states_insert ON oauth_states
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND created_by_user_id = app.current_user_id()
    AND (
      CASE WHEN client_id IS NULL
        THEN app.can_manage_pool()
        ELSE app.can_access_client(client_id)
      END
    )
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
-- UPDATE POLİTİKASI — reklam hesabı el değiştirince iş kayıtları da taşınıyor.
--
-- BU POLİTİKA OLMADAN TAŞIMA SESSİZCE SIFIR SATIR ETKİLİYORDU. Tabloda
-- yalnızca SELECT ve INSERT politikası vardı; Postgres politikası olmayan bir
-- UPDATE'te HATA VERMİYOR, satırı görmüyor. Yani `advetics_app` rolüyle koşan
-- atama, sekiz tablodan yedisini taşıyıp sekizincisini sessizce atlıyordu ve
-- belirtisi tanıdıktı: yeni müşterinin senkronizasyon ekranında
-- "Yapı: hiç · Metrik: hiç".
--
-- İlk RLS testi bunu göremedi çünkü sync_jobs tablosuna hiç satır yazmıyordu;
-- sıfır satırlık bir UPDATE politikadan bağımsız olarak başarılı dönüyor.
-- `hesap-tasima-rls.spec.ts` artık `RETURNING` ile ETKİLENEN SATIRI sayıyor.
--
-- Kapsam, okumanın kapsamıyla AYNI: kullanıcı zaten göreceği satırı
-- güncelleyebiliyor. Worker durum güncellemelerini BYPASSRLS ile yazmaya
-- devam ediyor; bu politika onun için değil.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_sync_jobs_update ON sync_jobs
  FOR UPDATE USING (app.can_access_client(client_id))
          WITH CHECK (app.can_access_client(client_id));

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

-- ---------------------------------------------------------------------------
-- auto_boost_presets, auto_boost_queue_items  (Advetics 1.0)
-- ---------------------------------------------------------------------------
--
-- Standart kiracı deseni. İkisi de müşteriye ait ve müşteri temsilcisi
-- yalnızca kendi müşterisinin kayıtlarını görüyor.
--
-- KUYRUK KAYITLARINI WEBHOOK YAZIYOR ve webhook'un oturumu YOK. Bu yüzden
-- yazma yolu `PrismaAdminService` (BYPASSRLS) üzerinden gidiyor — aynı şey
-- lead webhook'unda da geçerli. Buradaki politikalar PANELDEN gelen okuma ve
-- onaylama içindir; webhook'un bu politikalardan geçmesi beklenmiyor ve
-- beklenseydi kayıt sessizce kaybolurdu (`client_id` bağlamı yok).
CREATE POLICY adv_auto_boost_subscriptions_select ON auto_boost_subscriptions
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_subscriptions_insert ON auto_boost_subscriptions
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_subscriptions_update ON auto_boost_subscriptions
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_subscriptions_delete ON auto_boost_subscriptions
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_presets_select ON auto_boost_presets
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_presets_insert ON auto_boost_presets
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_presets_update ON auto_boost_presets
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_presets_delete ON auto_boost_presets
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_queue_items_select ON auto_boost_queue_items
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_queue_items_insert ON auto_boost_queue_items
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_queue_items_update ON auto_boost_queue_items
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_auto_boost_queue_items_delete ON auto_boost_queue_items
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

-- sync_batches — ORG KAPSAMLI, müşteri kapsamlı DEĞİL.
--
-- Parti birden çok workspace'i birden kapsıyor; `client_id` diye tek bir
-- kolonu yok ve olamaz. Erişim org düzeyinde: partiyi başlatan da, ilerlemeyi
-- izleyen de ajans personeli.
CREATE POLICY adv_sync_batches_select ON sync_batches
  FOR SELECT USING (app.has_context() AND org_id = app.current_org_id());

CREATE POLICY adv_sync_batches_insert ON sync_batches
  FOR INSERT WITH CHECK (app.has_context() AND org_id = app.current_org_id());

CREATE POLICY adv_sync_batches_update ON sync_batches
  FOR UPDATE USING (app.has_context() AND org_id = app.current_org_id())
             WITH CHECK (app.has_context() AND org_id = app.current_org_id());

-- -----------------------------------------------------------------------------
-- report_schedules — MÜŞTERİ KAPSAMLI.
--
-- Planlama bir workspace'e ait ve o workspace'e erişebilen herkes görebilmeli:
-- "müşteriye her Pazartesi rapor gidiyor mu" sorusu danışmanın günlük işi.
--
-- DÖRT POLİTİKA DA YAZILI ve bu bir titizlik değil bir DERS. `sync_jobs`ta
-- yalnızca SELECT ve INSERT vardı; UPDATE politikası olmayan tablo hata
-- vermiyor, SESSİZCE SIFIR SATIR etkiliyor (CLAUDE.md). Burada eksik bir
-- UPDATE politikası "planı kapattım ama kapanmıyor" demek olurdu.
--
-- DELETE de gerekli: kullanıcı kurduğu planlamayı kaldırabilmeli.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_report_sched_select ON report_schedules
  FOR SELECT USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_report_sched_insert ON report_schedules
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_report_sched_update ON report_schedules
  FOR UPDATE USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  ) WITH CHECK (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

CREATE POLICY adv_report_sched_delete ON report_schedules
  FOR DELETE USING (
    org_id = app.current_org_id() AND app.can_access_client(client_id)
  );

-- insight_breakdowns — anahtar kelimeyle AYNI kural.
--
-- Kırılım verisi de senkronizasyondan geliyor; DELETE politikası yok, hesap
-- silinirse CASCADE ile gidiyor.
--
-- `client_id` DENORMALİZE ve politikanın join'siz yazılabilmesinin sebebi bu.
-- Hesap el değiştirdiğinde bu kolonun taşınması `hesap-verisi-tasima.ts`nin
-- işi — taşınmazsa eski müşterinin raporunda artık ona ait olmayan kitle
-- kırılımı görünmeye devam eder.
CREATE POLICY adv_insight_breakdowns_select ON insight_breakdowns
  FOR SELECT USING (app.can_access_client(client_id));

CREATE POLICY adv_insight_breakdowns_insert ON insight_breakdowns
  FOR INSERT WITH CHECK (app.can_access_client(client_id));

CREATE POLICY adv_insight_breakdowns_update ON insight_breakdowns
  FOR UPDATE USING (app.can_access_client(client_id))
             WITH CHECK (app.can_access_client(client_id));

-- search_term_insights — anahtar kelimeyle AYNI kural.
--
-- Arama terimi de senkronizasyondan geliyor; DELETE politikası yok, hesap
-- silinirse CASCADE ile gidiyor.
CREATE POLICY adv_search_terms_select ON search_term_insights
  FOR SELECT USING (app.can_access_client(client_id));

CREATE POLICY adv_search_terms_insert ON search_term_insights
  FOR INSERT WITH CHECK (app.can_access_client(client_id));

CREATE POLICY adv_search_terms_update ON search_term_insights
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

-- =============================================================================
-- FORMLAR KÜTÜPHANESİ
-- =============================================================================

-- -----------------------------------------------------------------------------
-- lead_forms
--
-- Standart kiracı deseni.
--
-- DELETE POLİTİKASI VAR ama servis katmanı yalnızca TASLAK formları siliyor.
-- Yayınlanmış bir formu veritabanından silmek, Meta'da yaşamaya devam eden ve
-- hâlâ bilgi toplayan bir formu kayıtlarımızdan düşürmek olurdu — gelen
-- lead'lerin hangi forma ait olduğu bir daha bulunamazdı. Kuralı RLS'e değil
-- servise koyduk çünkü RLS'in "durum" bilgisiyle karar vermesi, iş kuralını
-- iki yere yaymak demek.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_lead_forms_select ON lead_forms
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_lead_forms_insert ON lead_forms
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_lead_forms_update ON lead_forms
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_lead_forms_delete ON lead_forms
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- =============================================================================
-- POTANSİYEL MÜŞTERİLER
-- =============================================================================

-- -----------------------------------------------------------------------------
-- leads
--
-- Standart kiracı deseni ama BURADAKİ VERİ KİŞİSEL VERİ. Bir müşterinin
-- kayıtlarının başka bir müşterinin temsilcisine görünmesi, sıradan bir
-- yetkilendirme hatası değil KVKK ihlali.
--
-- INSERT politikası VAR ama uygulama kayıtları worker rolüyle (BYPASSRLS)
-- yazıyor: webhook ve tarama bir kullanıcı oturumu olmadan çalışıyor ve
-- `app.current_org_id()` boş. Politika yine de tanımlı — ileride bir yol
-- kullanıcı bağlamında yazarsa sınır orada da geçerli olsun.
--
-- DELETE politikası VAR: KVKK silme talebi geldiğinde kayıt gerçekten
-- silinebilmeli.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_leads_select ON leads
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_leads_insert ON leads
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_leads_update ON leads
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_leads_delete ON leads
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- lead_sync_cursors
--
-- İmleçler yalnızca OKUNUYOR (panelde "webhook çalışıyor mu" göstergesi).
-- Yazma tamamen worker'ın işi; kullanıcının imleci elle değiştirmesi,
-- taramanın geçmişi atlaması ya da her turda baştan okuması demek olurdu.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_lead_sync_cursors_select ON lead_sync_cursors
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- =============================================================================
-- VARLIK ARŞİVİ
-- =============================================================================

-- -----------------------------------------------------------------------------
-- assets
--
-- Standart kiracı deseni. DELETE politikası var: kütüphane kullanıcının
-- yönettiği bir alan ve kullanılmayan bir görseli silebilmeli. Kullanımdaki
-- varlığın silinmesi SERVİS katmanında engelleniyor — RLS'in "bu varlık kaç
-- reklamda kullanılıyor" sorusunu sorması, iş kuralını iki yere yaymak olurdu.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_assets_select ON assets
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_assets_insert ON assets
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_assets_update ON assets
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_assets_delete ON assets
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- asset_platform_refs
--
-- MÜŞTERİ KİMLİĞİ KOLONU YOK: referans varlığa ait ve varlık müşteriye.
-- Erişim kontrolü bu yüzden varlık üzerinden kuruluyor; kolonu kopyalamak
-- iki kaynağın zamanla ayrışması riski demek olurdu.
--
-- Yazma yalnızca worker'ın işi (yayın anında hash önbelleğe alınıyor) ama
-- politika yine de tanımlı: ileride bir yol kullanıcı bağlamında yazarsa
-- sınır orada da geçerli olsun.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_asset_platform_refs_select ON asset_platform_refs
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM assets a
      WHERE a.id = asset_platform_refs.asset_id AND app.can_access_client(a.client_id)
    )
  );

CREATE POLICY adv_asset_platform_refs_insert ON asset_platform_refs
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM assets a
      WHERE a.id = asset_platform_refs.asset_id AND app.can_access_client(a.client_id)
    )
  );

-- =============================================================================
-- Kreatif — metin havuzu + görsel havuzu
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ad_creatives
--
-- `ad_drafts` ile aynı desen: org + müşteri. Kreatif müşteriye ait ve org
-- içindeki başka bir müşterinin kreatifi görünmemeli.
--
-- BURADA SIZINTI DİĞERLERİNDEN FARKLI BİR ŞEY DEMEK: kreatif, müşterinin
-- HENÜZ YAYINLAMADIĞI reklam metinleri ve görselleri. Rakip iki markanın
-- aynı ajansta olması olağan; birinin diğerinin kampanya metnini görmesi
-- veri sızıntısından öte ticari bir sorun.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_ad_creatives_select ON ad_creatives
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_ad_creatives_insert ON ad_creatives
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_ad_creatives_update ON ad_creatives
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_ad_creatives_delete ON ad_creatives
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- ad_creative_assets
--
-- Kiracı kontrolü KREATİF ÜZERİNDEN — `ad_draft_assets` deseninin aynısı.
-- Satırın kendi `org_id`'si var ama tek başına yetmez: org içindeki başka bir
-- müşterinin kreatifine ait bağlantı görünürdü.
--
-- GÖRSELİN KENDİ MÜŞTERİSİ AYRICA KONTROL EDİLMİYOR ve bunun sebebi var:
-- RLS iki tabloyu birden zorlamıyor, `assets` satırı kendi politikasından
-- geçiyor. Ama "A müşterisinin görselini B'nin kreatifine bağlama" hatası
-- politikayla YAKALANMIYOR — iki satır da aynı org'da. O kontrol servis
-- katmanında, `attachFromLibrary`'deki gibi açık bir kontrol olmak zorunda.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_ad_creative_assets_select ON ad_creative_assets
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_creatives c
      WHERE c.id = ad_creative_assets.creative_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_ad_creative_assets_insert ON ad_creative_assets
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_creatives c
      WHERE c.id = ad_creative_assets.creative_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_ad_creative_assets_update ON ad_creative_assets
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_creatives c
      WHERE c.id = ad_creative_assets.creative_id AND app.can_access_client(c.client_id)
    )
  )
  WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_creatives c
      WHERE c.id = ad_creative_assets.creative_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_ad_creative_assets_delete ON ad_creative_assets
  FOR DELETE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM ad_creatives c
      WHERE c.id = ad_creative_assets.creative_id AND app.can_access_client(c.client_id)
    )
  );

-- =============================================================================
-- Kampanya taslağı ağacı
-- =============================================================================

-- -----------------------------------------------------------------------------
-- draft_campaigns
--
-- `ad_drafts` ile aynı desen: org + müşteri. Ağacın kökü bu, dolayısıyla
-- çocukların erişim kontrolü de buradan türüyor.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_draft_campaigns_select ON draft_campaigns
  FOR SELECT USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_draft_campaigns_insert ON draft_campaigns
  FOR INSERT WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_draft_campaigns_update ON draft_campaigns
  FOR UPDATE USING (org_id = app.current_org_id() AND app.can_access_client(client_id))
             WITH CHECK (org_id = app.current_org_id() AND app.can_access_client(client_id));

CREATE POLICY adv_draft_campaigns_delete ON draft_campaigns
  FOR DELETE USING (org_id = app.current_org_id() AND app.can_access_client(client_id));

-- -----------------------------------------------------------------------------
-- draft_ad_groups
--
-- Kiracı kontrolü KAMPANYA ÜZERİNDEN. Satırın kendi `org_id`'si var ama tek
-- başına yetmez: org içindeki başka bir müşterinin kampanyasına ait grup
-- görünürdü.
--
-- `client_id` KOLONU YOK ve bilerek: kopyalamak iki kaynağın zamanla ayrışması
-- demek olurdu. Bir grubun müşterisi, kampanyasının müşterisidir — başka türlü
-- olamaz ve olmamalı.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_draft_ad_groups_select ON draft_ad_groups
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_campaigns c
      WHERE c.id = draft_ad_groups.campaign_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_draft_ad_groups_insert ON draft_ad_groups
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_campaigns c
      WHERE c.id = draft_ad_groups.campaign_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_draft_ad_groups_update ON draft_ad_groups
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_campaigns c
      WHERE c.id = draft_ad_groups.campaign_id AND app.can_access_client(c.client_id)
    )
  )
  WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_campaigns c
      WHERE c.id = draft_ad_groups.campaign_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_draft_ad_groups_delete ON draft_ad_groups
  FOR DELETE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_campaigns c
      WHERE c.id = draft_ad_groups.campaign_id AND app.can_access_client(c.client_id)
    )
  );

-- -----------------------------------------------------------------------------
-- draft_ads
--
-- İKİ SEVİYE YUKARI JOIN ediliyor: reklam → grup → kampanya. Zincirin
-- kısaltılması (yalnızca `org_id`) org içindeki bütün taslak reklamları
-- birbirine açardı.
--
-- KREATİFİN MÜŞTERİSİ AYRICA KONTROL EDİLMİYOR — politikayla yakalanamıyor,
-- iki satır da aynı org'da. "A müşterisinin kreatifini B'nin reklamına bağlama"
-- kontrolü servis katmanında açık bir kontrol olmak zorunda.
-- -----------------------------------------------------------------------------
CREATE POLICY adv_draft_ads_select ON draft_ads
  FOR SELECT USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_ad_groups g
      JOIN draft_campaigns c ON c.id = g.campaign_id
      WHERE g.id = draft_ads.ad_group_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_draft_ads_insert ON draft_ads
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_ad_groups g
      JOIN draft_campaigns c ON c.id = g.campaign_id
      WHERE g.id = draft_ads.ad_group_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_draft_ads_update ON draft_ads
  FOR UPDATE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_ad_groups g
      JOIN draft_campaigns c ON c.id = g.campaign_id
      WHERE g.id = draft_ads.ad_group_id AND app.can_access_client(c.client_id)
    )
  )
  WITH CHECK (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_ad_groups g
      JOIN draft_campaigns c ON c.id = g.campaign_id
      WHERE g.id = draft_ads.ad_group_id AND app.can_access_client(c.client_id)
    )
  );

CREATE POLICY adv_draft_ads_delete ON draft_ads
  FOR DELETE USING (
    org_id = app.current_org_id()
    AND EXISTS (
      SELECT 1 FROM draft_ad_groups g
      JOIN draft_campaigns c ON c.id = g.campaign_id
      WHERE g.id = draft_ads.ad_group_id AND app.can_access_client(c.client_id)
    )
  );

-- ============================================================================
-- user_email_accounts — DANIŞMANIN KENDİ E-POSTA KİMLİĞİ
-- ============================================================================
--
-- SATIR YALNIZCA SAHİBİNE GÖRÜNÜYOR. Org yöneticisi bile göremiyor ve bu
-- bilinçli: satır o kullanicinin uygulama parolasini (sifreli) tasiyor ve
-- onu okuyabilmek, o hesabin adina mail gonderebilmek demek. Yonetici
-- birinin e-posta kimligini kurmak zorunda degil; herkes kendi ayarini
-- kendisi giriyor.
--
-- Bu, depodaki diger tablolardan FARKLI bir kural: cogunda org yoneticisi
-- her seyi goruyor. Fark burada yaziyor ki bir gun "tutarlilik" adina
-- gevsetilmesin.
-- ENABLE/FORCE yukarıdaki tablo listesi döngüsünde yapılıyor.

CREATE POLICY adv_user_email_select ON user_email_accounts
  FOR SELECT USING (
    org_id = app.current_org_id() AND user_id = app.current_user_id()
  );

CREATE POLICY adv_user_email_insert ON user_email_accounts
  FOR INSERT WITH CHECK (
    org_id = app.current_org_id() AND user_id = app.current_user_id()
  );

CREATE POLICY adv_user_email_update ON user_email_accounts
  FOR UPDATE USING (
    org_id = app.current_org_id() AND user_id = app.current_user_id()
  ) WITH CHECK (
    org_id = app.current_org_id() AND user_id = app.current_user_id()
  );

CREATE POLICY adv_user_email_delete ON user_email_accounts
  FOR DELETE USING (
    org_id = app.current_org_id() AND user_id = app.current_user_id()
  );
