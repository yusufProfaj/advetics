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

-- =============================================================================
-- MODÜL 5 — Aylık bütçe
-- =============================================================================

-- -----------------------------------------------------------------------------
-- monthly_budgets: `month` daima AYIN İLK GÜNÜ olmalı.
--
-- Ay bir nokta olarak saklanıyor. "2026-08-15" yazan bir satır sessizce
-- eşleşmez: pacing sorgusu ayın ilk gününü arıyor, bulamıyor ve bütçe YOK gibi
-- davranıyor. Uyarı üretilmez, pacing çubuğu görünmez, kimse fark etmez.
-- -----------------------------------------------------------------------------
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_month_first_day_chk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_month_first_day_chk
  CHECK (EXTRACT(DAY FROM month) = 1);

-- -----------------------------------------------------------------------------
-- monthly_budgets: bütçe pozitif olmalı.
--
-- Sıfır bütçe "bütçe yok" ile aynı anlama gelmiyor ama pacing'de sıfıra bölme
-- üretiyor. Bütçe tanımlamamak isteyen satırı SİLER.
-- -----------------------------------------------------------------------------
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_amount_chk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_amount_chk
  CHECK (amount_micros > 0);

ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_daily_cap_chk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_daily_cap_chk
  CHECK (daily_cap_micros IS NULL OR daily_cap_micros > 0);

-- -----------------------------------------------------------------------------
-- monthly_budgets: eşik yüzdeleri makul aralıkta.
--
-- Üst sınır 100 DEĞİL: bütçenin %120'sinde durdurmak geçerli bir strateji
-- (ay sonunda tolerans tanımak). %500 ise yazım hatası.
-- -----------------------------------------------------------------------------
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_alert_pct_chk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_alert_pct_chk
  CHECK (alert_threshold_pct BETWEEN 1 AND 200);

ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_pause_pct_chk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_pause_pct_chk
  CHECK (auto_pause_at_pct IS NULL OR auto_pause_at_pct BETWEEN 1 AND 200);

-- -----------------------------------------------------------------------------
-- monthly_budgets: ISO 4217.
-- -----------------------------------------------------------------------------
ALTER TABLE monthly_budgets DROP CONSTRAINT IF EXISTS monthly_budgets_currency_chk;
ALTER TABLE monthly_budgets ADD CONSTRAINT monthly_budgets_currency_chk
  CHECK (currency ~ '^[A-Z]{3}$');

-- =============================================================================
-- MODÜL 5 — Kural motoru
-- =============================================================================

-- -----------------------------------------------------------------------------
-- rules: hesap seviyesinde kural OLMAZ.
--
-- Bir hesabı duraklatmak diye bir şey yok. Şema `EntityLevel` enum'unu
-- paylaşıyor ve o enum `account` da içeriyor; kısıt olmadan geçerli görünen
-- ama hiçbir varlık bulamayan bir kural yazılabilirdi — sessizce hiç
-- çalışmayan bir kural, hata veren bir kuraldan kötü.
-- -----------------------------------------------------------------------------
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_level_chk;
ALTER TABLE rules ADD CONSTRAINT rules_level_chk
  CHECK (level IN ('campaign', 'ad_group', 'ad'));

ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_combinator_chk;
ALTER TABLE rules ADD CONSTRAINT rules_combinator_chk
  CHECK (combinator IN ('and', 'or'));

-- -----------------------------------------------------------------------------
-- rules: koşul dizisi BOŞ olamaz.
--
-- Koşulsuz bir kural TÜM varlıkları eşleştirir. Prova modunda fark edilir ama
-- canlıda tek turda hesabın tamamını duraklatır. `maxActionsPerRun` bunu 20'de
-- keser — yani felaket değil ama yine de 20 kampanya.
-- -----------------------------------------------------------------------------
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_conditions_chk;
ALTER TABLE rules ADD CONSTRAINT rules_conditions_chk
  CHECK (jsonb_typeof(conditions) = 'array' AND jsonb_array_length(conditions) BETWEEN 1 AND 5);

ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_action_chk;
ALTER TABLE rules ADD CONSTRAINT rules_action_chk
  CHECK (jsonb_typeof(action) = 'object' AND action ? 'type');

-- -----------------------------------------------------------------------------
-- rules: emniyet sınırları sıfırlanamaz.
--
-- `max_actions_per_run = 0` kuralı işlevsiz kılar (sessiz), çok büyük bir
-- değer ise emniyeti kaldırır. `max_data_age_hours` sıfır olursa hiçbir veri
-- yeterince taze sayılmaz ve kural yine sessizce hiç çalışmaz.
-- -----------------------------------------------------------------------------
ALTER TABLE rules DROP CONSTRAINT IF EXISTS rules_limits_chk;
ALTER TABLE rules ADD CONSTRAINT rules_limits_chk
  CHECK (
    max_actions_per_run BETWEEN 1 AND 200
    AND max_data_age_hours BETWEEN 1 AND 168
    AND cooldown_minutes BETWEEN 0 AND 20160
  );

-- -----------------------------------------------------------------------------
-- rules: aynı müşteride aynı isimde iki kural olmasın.
--
-- Kural adı denetim kaydında ve uyarı e-postasında görünüyor; iki "EBM
-- koruması" arasında hangisinin tetiklendiğini ayırt etmek imkânsız olurdu.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS rules_client_name_uniq
  ON rules (client_id, lower(name));

-- -----------------------------------------------------------------------------
-- rule_action_logs: outcome bilinen bir değer olmalı.
--
-- Enum DEĞİL, CHECK: yeni bir atlama sebebi eklemek enum migration'ı yerine
-- tek satırlık bir kısıt güncellemesi olsun. Sebep listesinin büyümesi
-- bekleniyor — her yeni koruma yeni bir sebep demek.
-- -----------------------------------------------------------------------------
ALTER TABLE rule_action_logs DROP CONSTRAINT IF EXISTS rule_action_logs_outcome_chk;
ALTER TABLE rule_action_logs ADD CONSTRAINT rule_action_logs_outcome_chk
  CHECK (outcome IN (
    'simulated', 'applied', 'failed',
    'skipped_cooldown', 'skipped_guard', 'skipped_stale_data',
    'skipped_no_budget', 'skipped_capped', 'skipped_noop'
  ));

ALTER TABLE rule_action_logs DROP CONSTRAINT IF EXISTS rule_action_logs_type_chk;
ALTER TABLE rule_action_logs ADD CONSTRAINT rule_action_logs_type_chk
  CHECK (action_type IN ('pause', 'resume', 'adjust_budget', 'notify'));

-- -----------------------------------------------------------------------------
-- rule_action_logs: BAŞARISIZ kayıtta hata mesajı ZORUNLU.
--
-- Sebebi yazılmamış bir başarısızlık, ajansa "kural çalışmadı" demekten başka
-- bir şey söylemiyor. Bu projede sessiz hataların maliyeti zaten görüldü.
-- -----------------------------------------------------------------------------
ALTER TABLE rule_action_logs DROP CONSTRAINT IF EXISTS rule_action_logs_error_chk;
ALTER TABLE rule_action_logs ADD CONSTRAINT rule_action_logs_error_chk
  CHECK (outcome <> 'failed' OR error IS NOT NULL);
