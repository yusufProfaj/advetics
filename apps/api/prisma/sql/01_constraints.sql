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

-- =============================================================================
-- MODÜL 7 — Auto-Boost
-- =============================================================================

-- -----------------------------------------------------------------------------
-- boosts: durum bilinen bir değer olmalı.
-- -----------------------------------------------------------------------------
ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_status_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_status_chk
  -- 'completed' = süresi dolmuş boost. Bu değer olmadan bir gönderi bir kez
  -- boostlandıktan sonra ÖMÜR BOYU kilitli kalıyordu: `boosts_active_post_uniq`
  -- 'active' durumunu kapsıyor ve hiçbir kod yolu o durumdan çıkmıyordu.
  CHECK (status IN ('candidate', 'approved', 'rejected', 'creating', 'active', 'completed', 'failed'));

-- -----------------------------------------------------------------------------
-- boosts: BAŞARISIZ kayıtta sebep zorunlu.
-- -----------------------------------------------------------------------------
ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_error_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_error_chk
  CHECK (status <> 'failed' OR error IS NOT NULL);

-- -----------------------------------------------------------------------------
-- boosts: AKTİF bir boost'un platform kimlikleri OLMALI.
--
-- Bunlar olmadan boost'u sonradan bulmak, durdurmak ya da metriklerini
-- eşleştirmek imkânsız. "Aktif" işaretlenip kimliği olmayan bir kayıt,
-- panelde çalışıyor görünen ama takip edilemeyen bir harcama demek.
-- -----------------------------------------------------------------------------
ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_active_ids_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_active_ids_chk
  CHECK (
    status <> 'active'
    OR (external_campaign_id IS NOT NULL AND external_ad_set_id IS NOT NULL
        AND external_ad_id IS NOT NULL)
  );

-- -----------------------------------------------------------------------------
-- boosts: onaylanmış kayıtta onay ZAMANI zorunlu.
--
-- ONAYLAYAN KİŞİ ZORUNLU DEĞİL ve bu bilinçli: `approved_by IS NULL`,
-- "kural otomatik onayladı" demek. Kuralın kimliğini oraya yazmak, insan
-- onayı ile makine onayını denetim kaydında ayırt edilemez kılardı — oysa
-- para taahhüdünde bu ayrım tam olarak sorulacak soru.
--
-- İlk yazımda kısıt `approved_by IS NOT NULL` istiyordu ve otomatik onaylı
-- kuralın ürettiği her aday veritabanı tarafından reddediliyordu: kural
-- sessizce hiçbir boost açamıyordu. Test yakaladı.
-- -----------------------------------------------------------------------------
-- boosts: kayıtlı kitle ile elle hedefleme BİRLİKTE OLMAZ (K16).
--
-- Kayıtlı kitle Meta'da kendi lokasyonunu, yaşını ve cinsiyetini taşıyor.
-- İkisini birden saklamak, yayın anında hangisinin kazanacağını kodun sırasına
-- bırakmak demek — ve yanlış olan taraf sessizce yanlış kitleye harcar.
ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_targeting_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_targeting_chk
  CHECK (saved_audience_id IS NULL OR targeting IS NULL);

ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_approval_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_approval_chk
  CHECK (status NOT IN ('approved', 'creating', 'active') OR approved_at IS NOT NULL);

-- -----------------------------------------------------------------------------
-- boosts ve boost_rules: bütçe pozitif, süre makul.
--
-- Sıfır bütçeli boost Meta tarafından reddedilir; 365 günlük bir boost ise
-- "boost" değil kalıcı kampanya ve bu araç onun için değil.
-- -----------------------------------------------------------------------------
--
-- BÜTÇE KİPE GÖRE: kural yolunda günlük, elle boost'ta toplam (K18). Kolonlar
-- ayrı ve TAM BİRİ dolu olmak zorunda. İkisi birden dolu olsaydı hangisinin
-- Meta'ya gideceği kodun sırasına kalırdı; ikisi de boş olsaydı bütçesiz bir
-- boost kaydı oluşurdu ve hata ancak yayın anında çıkardı.
ALTER TABLE boosts DROP CONSTRAINT IF EXISTS boosts_budget_chk;
ALTER TABLE boosts ADD CONSTRAINT boosts_budget_chk
  CHECK (
    duration_days BETWEEN 1 AND 30
    AND CASE budget_mode
      WHEN 'daily' THEN daily_budget_micros > 0 AND total_budget_micros IS NULL
      WHEN 'lifetime' THEN total_budget_micros > 0 AND daily_budget_micros IS NULL
      -- TANINMAYAN KİP REDDEDİLİYOR. `ELSE true` yazmak, yazım hatası taşıyan
      -- bir kipin bütün bütçe kontrolünü sessizce atlaması demek olurdu.
      ELSE false
    END
  );

ALTER TABLE boost_rules DROP CONSTRAINT IF EXISTS boost_rules_budget_chk;
ALTER TABLE boost_rules ADD CONSTRAINT boost_rules_budget_chk
  CHECK (
    daily_budget_micros > 0
    AND duration_days BETWEEN 1 AND 30
    AND monthly_cap_micros > 0
    AND max_boosts_per_run BETWEEN 1 AND 50
  );

-- -----------------------------------------------------------------------------
-- boost_rules: AYLIK TAVAN tek bir boost'un maliyetini karşılamalı.
--
-- `daily_budget × duration` tavanı aşıyorsa kural HİÇBİR ZAMAN boost
-- oluşturamaz — sessizce çalışmayan bir otomasyon. Kayıt anında reddetmek,
-- ayda bir "neden hiç boost açılmadı" sorusunu sordurmaktan iyi.
-- -----------------------------------------------------------------------------
ALTER TABLE boost_rules DROP CONSTRAINT IF EXISTS boost_rules_cap_chk;
ALTER TABLE boost_rules ADD CONSTRAINT boost_rules_cap_chk
  CHECK (monthly_cap_micros >= daily_budget_micros * duration_days);

-- -----------------------------------------------------------------------------
-- boost_rules: gönderi yaş penceresi tutarlı olmalı.
--
-- `min > max` olan bir kural hiçbir gönderiyi eşleştirmez ve yine sessizce
-- çalışmaz.
-- -----------------------------------------------------------------------------
ALTER TABLE boost_rules DROP CONSTRAINT IF EXISTS boost_rules_age_chk;
ALTER TABLE boost_rules ADD CONSTRAINT boost_rules_age_chk
  CHECK (min_post_age_hours < max_post_age_hours AND min_post_age_hours >= 0);

ALTER TABLE boost_rules DROP CONSTRAINT IF EXISTS boost_rules_conditions_chk;
ALTER TABLE boost_rules ADD CONSTRAINT boost_rules_conditions_chk
  CHECK (jsonb_typeof(conditions) = 'array' AND jsonb_array_length(conditions) BETWEEN 1 AND 5);

CREATE UNIQUE INDEX IF NOT EXISTS boost_rules_client_name_uniq
  ON boost_rules (client_id, lower(name));

-- -----------------------------------------------------------------------------
-- organic_posts: etkileşim bileşenlerinden türetiliyor, negatif olamaz.
-- -----------------------------------------------------------------------------
ALTER TABLE organic_posts DROP CONSTRAINT IF EXISTS organic_posts_counts_chk;
ALTER TABLE organic_posts ADD CONSTRAINT organic_posts_counts_chk
  CHECK (
    impressions >= 0 AND reach >= 0 AND likes >= 0 AND comments >= 0
    AND shares >= 0 AND saves >= 0 AND video_views >= 0 AND engagements >= 0
  );

-- =============================================================================
-- MODÜL 8 — Toplu Oluşturucu
-- =============================================================================

ALTER TABLE bulk_batches DROP CONSTRAINT IF EXISTS bulk_batches_status_chk;
ALTER TABLE bulk_batches ADD CONSTRAINT bulk_batches_status_chk
  CHECK (status IN ('draft', 'validated', 'publishing', 'published', 'failed'));

ALTER TABLE bulk_items DROP CONSTRAINT IF EXISTS bulk_items_status_chk;
ALTER TABLE bulk_items ADD CONSTRAINT bulk_items_status_chk
  CHECK (status IN ('pending', 'invalid', 'publishing', 'published', 'failed'));

-- -----------------------------------------------------------------------------
-- bulk_items: YAYINLANMIŞ satırın platform kimliği OLMALI.
--
-- Kimliksiz "yayınlandı" kaydı, yeniden yayınlamada o satırın atlanmasına yol
-- açar ama platformda karşılığı bulunamaz — reklam ya vardır ve
-- bulunamıyordur, ya da hiç oluşmamıştır. İkisi de sessiz.
-- -----------------------------------------------------------------------------
ALTER TABLE bulk_items DROP CONSTRAINT IF EXISTS bulk_items_published_chk;
ALTER TABLE bulk_items ADD CONSTRAINT bulk_items_published_chk
  CHECK (status <> 'published' OR external_ad_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- bulk_items: BAŞARISIZ satırda sebep zorunlu.
-- -----------------------------------------------------------------------------
ALTER TABLE bulk_items DROP CONSTRAINT IF EXISTS bulk_items_error_chk;
ALTER TABLE bulk_items ADD CONSTRAINT bulk_items_error_chk
  CHECK (status <> 'failed' OR error IS NOT NULL);

-- -----------------------------------------------------------------------------
-- bulk_items: GEÇERSİZ satırda sorun listesi zorunlu ve boş olamaz.
--
-- "Geçersiz" deyip nedenini söylememek, kullanıcıyı satırı tahminle
-- düzeltmeye zorlar.
-- -----------------------------------------------------------------------------
ALTER TABLE bulk_items DROP CONSTRAINT IF EXISTS bulk_items_issues_chk;
ALTER TABLE bulk_items ADD CONSTRAINT bulk_items_issues_chk
  CHECK (
    status <> 'invalid'
    OR (jsonb_typeof(issues) = 'array' AND jsonb_array_length(issues) > 0)
  );

ALTER TABLE bulk_items DROP CONSTRAINT IF EXISTS bulk_items_row_chk;
ALTER TABLE bulk_items ADD CONSTRAINT bulk_items_row_chk
  CHECK (row_number > 0);

-- -----------------------------------------------------------------------------
-- bulk_batches: YAYINLANMIŞ partide yayınlayan ve zaman zorunlu.
--
-- bulk.publish ayrı bir yetki; kimin yayınladığı kaydedilmezse o yetkinin
-- denetlenebilir bir karşılığı olmaz. Modül 7'deki onaydan farkı: burada
-- otomatik yayın YOK, her yayın bir insanın kararı.
-- -----------------------------------------------------------------------------
ALTER TABLE bulk_batches DROP CONSTRAINT IF EXISTS bulk_batches_published_chk;
ALTER TABLE bulk_batches ADD CONSTRAINT bulk_batches_published_chk
  CHECK (
    status NOT IN ('published', 'publishing')
    OR (published_by IS NOT NULL AND published_at IS NOT NULL)
  );

-- =============================================================================
-- Reklam Oluşturucu — Modül 4 (CREATE)
-- =============================================================================

ALTER TABLE ad_drafts DROP CONSTRAINT IF EXISTS ad_drafts_goal_chk;
ALTER TABLE ad_drafts ADD CONSTRAINT ad_drafts_goal_chk
  CHECK (goal IN ('form', 'whatsapp', 'website'));

ALTER TABLE ad_drafts DROP CONSTRAINT IF EXISTS ad_drafts_status_chk;
ALTER TABLE ad_drafts ADD CONSTRAINT ad_drafts_status_chk
  CHECK (status IN ('draft', 'publishing', 'published', 'failed'));

-- -----------------------------------------------------------------------------
-- ad_drafts: WEB SİTESİ tipinde adres ZORUNLU.
--
-- Adressiz bir web sitesi kampanyası Meta tarafından reddedilir, ama reddi
-- yayın anında görmek geç: kullanıcı taslağı tamamladığını sanıp bekliyor.
-- Kayıt anında engellemek, hatayı yazarken göstermek demek.
-- -----------------------------------------------------------------------------
ALTER TABLE ad_drafts DROP CONSTRAINT IF EXISTS ad_drafts_website_link_chk;
ALTER TABLE ad_drafts ADD CONSTRAINT ad_drafts_website_link_chk
  CHECK (goal <> 'website' OR (link_url IS NOT NULL AND link_url <> ''));

ALTER TABLE ad_drafts DROP CONSTRAINT IF EXISTS ad_drafts_budget_chk;
ALTER TABLE ad_drafts ADD CONSTRAINT ad_drafts_budget_chk
  CHECK (daily_budget_micros > 0 AND duration_days BETWEEN 0 AND 90);

-- -----------------------------------------------------------------------------
-- ad_drafts: BAŞARISIZ kayıtta sebep, YAYINDA kimlik zorunlu.
--
-- Sebepsiz başarısızlık "çalışmadı"dan fazlasını söylemiyor; kimliksiz bir
-- "yayında" kaydı ise panelde çalışıyor görünen ama bulunamayan bir harcama.
-- -----------------------------------------------------------------------------
ALTER TABLE ad_drafts DROP CONSTRAINT IF EXISTS ad_drafts_error_chk;
ALTER TABLE ad_drafts ADD CONSTRAINT ad_drafts_error_chk
  CHECK (status <> 'failed' OR error IS NOT NULL);

ALTER TABLE ad_drafts DROP CONSTRAINT IF EXISTS ad_drafts_published_chk;
ALTER TABLE ad_drafts ADD CONSTRAINT ad_drafts_published_chk
  CHECK (
    status <> 'published'
    OR (external_campaign_id IS NOT NULL AND external_ad_id IS NOT NULL
        AND published_at IS NOT NULL)
  );

-- -----------------------------------------------------------------------------
-- ad_draft_assets: oran bilinen bir değer, boyutlar makul.
--
-- Sıfır boyut, boyut okuyucusunun başarısız olduğu anlamına geliyor ve o
-- görsel oran doğrulamasından geçemez — kaydetmek, yayın anında patlamak
-- demek olurdu.
-- -----------------------------------------------------------------------------
ALTER TABLE ad_draft_assets DROP CONSTRAINT IF EXISTS ad_draft_assets_ratio_chk;
ALTER TABLE ad_draft_assets ADD CONSTRAINT ad_draft_assets_ratio_chk
  CHECK (ratio IN ('square', 'vertical', 'horizontal'));

ALTER TABLE ad_draft_assets DROP CONSTRAINT IF EXISTS ad_draft_assets_dims_chk;
ALTER TABLE ad_draft_assets ADD CONSTRAINT ad_draft_assets_dims_chk
  CHECK (width > 0 AND height > 0 AND byte_size > 0);

ALTER TABLE ad_draft_assets DROP CONSTRAINT IF EXISTS ad_draft_assets_mime_chk;
ALTER TABLE ad_draft_assets ADD CONSTRAINT ad_draft_assets_mime_chk
  CHECK (mime_type IN ('image/jpeg', 'image/png'));

-- =============================================================================
-- Anahtar kelime performansı (yalnızca Google)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- keyword_insights: sayaçlar negatif olamaz.
-- -----------------------------------------------------------------------------
ALTER TABLE keyword_insights DROP CONSTRAINT IF EXISTS keyword_insights_counts_chk;
ALTER TABLE keyword_insights ADD CONSTRAINT keyword_insights_counts_chk
  CHECK (impressions >= 0 AND clicks >= 0 AND spend_micros >= 0 AND conversions >= 0);

-- -----------------------------------------------------------------------------
-- keyword_insights: eşleme türü bilinen bir değer.
--
-- Google yalnızca üç tür veriyor. Bilinmeyen bir değer, sağlayıcı eşlemesinin
-- bozulduğunu gösterir ve raporda anlamsız bir etiket olarak görünürdü.
-- -----------------------------------------------------------------------------
ALTER TABLE keyword_insights DROP CONSTRAINT IF EXISTS keyword_insights_match_chk;
ALTER TABLE keyword_insights ADD CONSTRAINT keyword_insights_match_chk
  CHECK (match_type IN ('EXACT', 'PHRASE', 'BROAD', 'UNKNOWN'));

ALTER TABLE keyword_insights DROP CONSTRAINT IF EXISTS keyword_insights_currency_chk;
ALTER TABLE keyword_insights ADD CONSTRAINT keyword_insights_currency_chk
  CHECK (currency ~ '^[A-Z]{3}$');

-- =============================================================================
-- FORMLAR KÜTÜPHANESİ — lead_forms
-- =============================================================================

ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_type_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_type_chk
  CHECK (form_type IN ('more_volume', 'higher_intent', 'rich_form'));

ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_status_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_status_chk
  CHECK (status IN ('draft', 'published', 'superseded', 'failed'));

-- SORUSUZ FORM OLMAZ.
--
-- Meta soru içermeyen bir formu kabul etmiyor ama hata yayın anında geliyor —
-- kullanıcı her şeyi doldurmuş ve bekliyorken. Burada durduruyoruz.
ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_questions_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_questions_chk
  CHECK (jsonb_typeof(prefill_questions) = 'array'
         AND jsonb_array_length(prefill_questions) >= 1);

ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_custom_questions_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_custom_questions_chk
  CHECK (jsonb_typeof(custom_questions) = 'array'
         AND jsonb_array_length(custom_questions) <= 5);

ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_consent_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_consent_chk
  CHECK (jsonb_typeof(consent_boxes) = 'array'
         AND jsonb_array_length(consent_boxes) <= 4);

-- YAYINLANMIŞ FORMUN META KİMLİĞİ OLMAK ZORUNDA.
--
-- Kimliksiz "yayında" satırı, arayüzde yayında görünen ama hiçbir reklamda
-- kullanılamayan bir form demek: `leadgen_forms` çağrısı başarılı olmuş ama
-- yanıt kaydedilememiş. Sessiz ve bulunması zor bir durum.
ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_published_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_published_chk
  CHECK (status <> 'published' OR (external_form_id IS NOT NULL AND published_at IS NOT NULL));

-- ESKİ SÜRÜM YENİSİNİ İŞARET ETMEK ZORUNDA (ve tersi).
--
-- `superseded` durumu ile `superseded_by_id` birlikte anlam taşıyor. Biri
-- olmadan diğeri, arayüzün "bu formun yenisi var" uyarısını gösterip yeni
-- sürüme bağlantı verememesi demek.
ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_supersede_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_supersede_chk
  CHECK ((status = 'superseded') = (superseded_by_id IS NOT NULL));

-- Bir form kendi kendisini geçersiz kılamaz.
ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_self_supersede_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_self_supersede_chk
  CHECK (superseded_by_id IS NULL OR superseded_by_id <> id);

ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_version_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_version_chk
  CHECK (version >= 1);

-- İLK SÜRÜMÜN KÖKÜ KENDİSİ.
--
-- `root_id = id` kuralı olmadan sürüm 1 için kök NULL olurdu ve "bu formun tüm
-- sürümleri" sorgusu iki dala ayrılırdı (COALESCE(root_id, id)).
ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_root_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_root_chk
  CHECK (version > 1 OR root_id = id);

ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_error_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_error_chk
  CHECK (status <> 'failed' OR error IS NOT NULL);

-- =============================================================================
-- POTANSİYEL MÜŞTERİLER — leads
-- =============================================================================

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_status_chk;
ALTER TABLE leads ADD CONSTRAINT leads_status_chk
  CHECK (status IN ('new', 'contacted', 'qualified', 'won', 'lost'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_source_chk;
ALTER TABLE leads ADD CONSTRAINT leads_source_chk
  CHECK (source IN ('webhook', 'reconcile', 'manual'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_fields_chk;
ALTER TABLE leads ADD CONSTRAINT leads_fields_chk
  CHECK (jsonb_typeof(fields) = 'array');

-- EN AZ BİR İLETİŞİM BİLGİSİ.
--
-- Ad, e-posta ve telefonun üçü de boşsa elimizde ulaşılamayan bir kayıt var
-- demektir. Bu, çekme çağrısının başarısız olduğu ama hatanın yutulduğu
-- durumun imzası: kayıt oluşuyor, içi boş, kimse fark etmiyor. Kısıt bunu
-- yazma anında yakalıyor.
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_contact_chk;
ALTER TABLE leads ADD CONSTRAINT leads_contact_chk
  CHECK (full_name IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL);

-- =============================================================================
-- VARLIK ARŞİVİ — assets
-- =============================================================================

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_kind_chk;
ALTER TABLE assets ADD CONSTRAINT assets_kind_chk
  CHECK (kind IN ('image', 'logo'));

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_dimensions_chk;
ALTER TABLE assets ADD CONSTRAINT assets_dimensions_chk
  CHECK (width > 0 AND height > 0 AND byte_size > 0);

-- İÇERİK ÖZETİ BOŞ OLAMAZ.
--
-- Boş özet, mükerrer engelinin sessizce devre dışı kalması demek: her yükleme
-- benzersiz görünür ve aynı görsel arşivde onlarca kez birikir. Kısıt bunu
-- yazma anında yakalıyor.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_hash_chk;
ALTER TABLE assets ADD CONSTRAINT assets_hash_chk
  CHECK (length(content_hash) >= 16);

ALTER TABLE asset_platform_refs DROP CONSTRAINT IF EXISTS asset_platform_refs_ref_chk;
ALTER TABLE asset_platform_refs ADD CONSTRAINT asset_platform_refs_ref_chk
  CHECK (length(external_ref) > 0);

-- -----------------------------------------------------------------------------
-- Kampanya taslağı ağacı
--
-- `ad_drafts` kısıtlarının aynısı, ağaca uyarlanmış hâli. Aynı gerekçeler:
-- sebepsiz bir başarısızlık "çalışmadı"dan fazlasını söylemiyor, kimliksiz bir
-- "yayında" kaydı ise panelde çalışıyor görünen ama bulunamayan bir harcama.
-- -----------------------------------------------------------------------------
ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_status_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_status_chk
  CHECK (status IN ('draft', 'publishing', 'published', 'failed'));

ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_surface_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_surface_chk
  CHECK (surface IN ('simple', 'expert'));

-- HEDEF YALNIZCA BASİT YÜZEYDE. Uzman yüzeyi platformun amacını doğrudan
-- seçiyor; ona bir `goal` uydurmak, taslağın neye göre kurulduğu sorusuna
-- yanlış cevap vermek olurdu.
ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_goal_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_goal_chk
  CHECK (goal IS NULL OR goal IN ('form', 'whatsapp', 'website'));

-- BÜTÇE MODU İLE TUTAR BİRLİKTE GİDER.
--
-- Modu 'daily' olup tutarı NULL olan bir satır, yayın anında bütçesiz
-- kampanya demek — Meta bunu reddediyor ama hata mesajı hangi alanın eksik
-- olduğunu söylemiyor. Tersi de sessiz: modu 'none' iken duran bir tutar,
-- kullanıcının girdiği ama hiçbir yere gitmeyen bir sayı.
ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_budget_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_budget_chk
  CHECK (
    budget_mode IN ('none', 'daily', 'lifetime')
    AND (budget_mode = 'none') = (budget_amount_micros IS NULL)
    AND (budget_amount_micros IS NULL OR budget_amount_micros > 0)
  );

-- TOPLAM BÜTÇEDE BİTİŞ ZORUNLU. Meta bütçeyi süreye bölüyor; süre yoksa
-- bölecek bir şey de yok ve ad set hiç dağıtım yapmıyor.
ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_lifetime_end_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_lifetime_end_chk
  CHECK (budget_mode <> 'lifetime' OR end_at IS NOT NULL);

ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_error_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_error_chk
  CHECK (status <> 'failed' OR error IS NOT NULL);

ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_published_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_published_chk
  CHECK (
    status <> 'published'
    OR (external_campaign_id IS NOT NULL AND published_at IS NOT NULL)
  );

ALTER TABLE draft_ad_groups DROP CONSTRAINT IF EXISTS draft_ad_groups_budget_chk;
ALTER TABLE draft_ad_groups ADD CONSTRAINT draft_ad_groups_budget_chk
  CHECK (
    budget_mode IN ('none', 'daily', 'lifetime')
    AND (budget_mode = 'none') = (budget_amount_micros IS NULL)
    AND (budget_amount_micros IS NULL OR budget_amount_micros > 0)
  );

-- -----------------------------------------------------------------------------
-- draft_ads: REKLAM YA KREATİFTEN YA GÖNDERİDEN doğar — tam biri.
--
-- "İkisi de boş" görselsiz metinsiz bir reklam demek. "İkisi de dolu" ise
-- hangisinin yayınlanacağı belirsiz ve Meta o belirsizliği kendi kararıyla
-- çözerdi — sessizce, ve kullanıcı beklediğinden başka bir reklam görürdü.
-- -----------------------------------------------------------------------------
ALTER TABLE draft_ads DROP CONSTRAINT IF EXISTS draft_ads_source_chk;
ALTER TABLE draft_ads ADD CONSTRAINT draft_ads_source_chk
  CHECK ((creative_id IS NULL) <> (organic_post_id IS NULL));

-- 'manual_boost' AYRI BİR KÖKEN, 'manual' DEĞİL.
--
-- İkisi de kullanıcının kurduğu kampanya ama soruları farklı: "bu harcama
-- nereden çıktı" sorusunda elle boost, elle kurulmuş bir kampanyadan bambaşka
-- bir iş. Aynı değere sıkıştırmak, boost harcamasını kampanya harcamasından
-- ayırt etmeyi imkânsız kılardı.
ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_source_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_source_chk
  CHECK (source IN ('manual', 'manual_boost', 'boost_rule', 'duplicate'));

-- KURALDAN DOĞAN KAMPANYA KURALINI TAŞIMAK ZORUNDA.
--
-- Kuralsız bir 'boost_rule' satırı, otomatik açılmış ama hangi kuralın
-- açtığı bilinmeyen bir harcama demek — beklenmedik bir faturanın kaynağını
-- bulmanın tek yolu bu bağ.
ALTER TABLE draft_campaigns DROP CONSTRAINT IF EXISTS draft_campaigns_boost_rule_chk;
ALTER TABLE draft_campaigns ADD CONSTRAINT draft_campaigns_boost_rule_chk
  CHECK (source <> 'boost_rule' OR boost_rule_id IS NOT NULL);

-- -----------------------------------------------------------------------------
-- clients: özel reklam kategorileri TANINAN DEĞERLER olmalı.
--
-- Tanınmayan bir değer Meta tarafından reddediliyor ve hata mesajı
-- ("Invalid parameter") hangi alanın sorunlu olduğunu söylemiyor. Yazma
-- anında yakalamak, yayın anında anlaşılmaz bir hata almaktan iyi.
-- -----------------------------------------------------------------------------
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_special_categories_chk;
ALTER TABLE clients ADD CONSTRAINT clients_special_categories_chk
  CHECK (special_ad_categories <@ ARRAY[
    'HOUSING', 'EMPLOYMENT', 'CREDIT',
    'ISSUES_ELECTIONS_POLITICS', 'ONLINE_GAMBLING_AND_GAMING'
  ]::text[]);

-- -----------------------------------------------------------------------------
-- social_profiles: ana Facebook sayfası YALNIZCA Instagram satırlarında.
--
-- Kolonun tek anlamı "bu Instagram hesabı şu Facebook sayfasına ait" —
-- Instagram satırında `external_id` IG kullanıcı kimliği ve Meta'da her
-- reklam bir sayfaya bağlı olduğu için sayfanın kimliği ayrıca taşınıyor.
--
-- Facebook satırında dolu olması kolona İKİNCİ BİR ANLAM yüklemek olurdu ve
-- o anlamı okuyan kod yanlış sayfaya reklam yayınlardı. Kısıt veritabanında,
-- çünkü bu tür bir karışıklık kod incelemesinde gözden kaçıyor ve sonucu
-- ancak canlı bir yayın çağrısında görülüyor.
--
-- NULL HER İKİSİNDE DE GEÇERLİ: kolon mevcut satırlar keşfedildikten sonra
-- eklendi, yani üretimdeki Instagram satırlarında boş. "Hesapları yenile"
-- bir kez çalıştırılınca doluyor. Zorunlu yapmak migration'ı düşürürdü.
-- -----------------------------------------------------------------------------
ALTER TABLE social_profiles DROP CONSTRAINT IF EXISTS social_profiles_parent_page_chk;
ALTER TABLE social_profiles ADD CONSTRAINT social_profiles_parent_page_chk
  CHECK (profile_type = 'instagram_business' OR parent_page_external_id IS NULL);
