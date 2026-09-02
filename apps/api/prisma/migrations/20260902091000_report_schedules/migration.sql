-- ZAMANLANMIŞ RAPOR GÖNDERİMİ (Advetics 1.0)
--
-- `ARCHITECTURE.md` bunu öngörmüştü, `docs/DURUM.md` §4'te "planlanan ama
-- yazılmayan" tabloda duruyordu.
--
-- EN BÜYÜK RİSK MÜKERRER GÖNDERİM: müşteriye aynı raporun iki kez gitmesi
-- geri alınamıyor. Tasarım "atlamayı tekrarlamaya tercih ediyor" —
-- `next_run_at` gönderimden ÖNCE ileri atılıyor ve başarısız gönderim
-- OTOMATİK TEKRAR DENENMİYOR.

CREATE TYPE "ReportScheduleFrequency" AS ENUM ('weekly', 'monthly');

CREATE TABLE "report_schedules" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "org_id"              UUID          NOT NULL,
  "client_id"           UUID          NOT NULL,
  -- Mail BU kullanıcının SMTP kimliğiyle gidiyor. Elle gönderimde rapor
  -- danışmanın kendi adresinden gidiyor ve bu bilinçli; zamanlanmış
  -- gönderimde oturum olmadığı için planı KURAN kişi saklanıyor.
  "created_by_user_id"  UUID          NOT NULL,
  "template_id"         UUID,

  "frequency"           "ReportScheduleFrequency" NOT NULL,
  -- weekly: 1 = Pazartesi … 7 = Pazar (ISO). monthly'de NULL.
  "day_of_week"         SMALLINT,
  -- monthly: 1–28. 29/30/31 her ayda yok; "ayın 31'i" seçen bir plan
  -- Şubat'ta SESSİZCE atlanırdı. Kısıt veritabanında da duruyor.
  "day_of_month"        SMALLINT,
  -- Europe/Istanbul saati. UTC DEĞİL: bu iş insanın okuduğu bir mail
  -- üretiyor ("sabah 9'da gönder" ajansın saati).
  "hour"                SMALLINT      NOT NULL,

  -- PENCERE DEĞİL ANAHTAR: tarihleri saklamak "her hafta son 7 gün"
  -- isteğini ilk haftanın tarihlerine dondururdu.
  "range_key"           VARCHAR(20)   NOT NULL,

  "to_email"            VARCHAR(255),
  "attach_pdf"          BOOLEAN       NOT NULL DEFAULT true,
  "enabled"             BOOLEAN       NOT NULL DEFAULT true,

  "next_run_at"         TIMESTAMPTZ(6) NOT NULL,
  "last_run_at"         TIMESTAMPTZ(6),
  "last_status"         VARCHAR(20),
  "last_error"          VARCHAR(500),
  "last_sent_to"        VARCHAR(255),

  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "report_schedules_pkey" PRIMARY KEY ("id"),

  -- SIKLIK İLE GÜN ALANI TUTARLI OLMAK ZORUNDA.
  --
  -- Haftalık bir planda `day_of_week` NULL kalırsa `siradakiCalisma`
  -- sessizce Pazartesi'ye düşerdi — kullanıcının seçmediği bir gün.
  -- Kısıt veritabanında: uygulamada unutulan bir dal buraya kadar gelmesin.
  CONSTRAINT "report_schedules_gun_tutarli" CHECK (
    ("frequency" = 'weekly'  AND "day_of_week" BETWEEN 1 AND 7 AND "day_of_month" IS NULL)
    OR
    ("frequency" = 'monthly' AND "day_of_month" BETWEEN 1 AND 28 AND "day_of_week" IS NULL)
  ),
  CONSTRAINT "report_schedules_saat" CHECK ("hour" BETWEEN 0 AND 23)
);

CREATE INDEX "report_schedules_enabled_next_run_at_idx"
  ON "report_schedules" ("enabled", "next_run_at");
CREATE INDEX "report_schedules_client_id_idx" ON "report_schedules" ("client_id");
CREATE INDEX "report_schedules_org_id_idx" ON "report_schedules" ("org_id");

ALTER TABLE "report_schedules"
  ADD CONSTRAINT "report_schedules_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_schedules"
  ADD CONSTRAINT "report_schedules_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CASCADE: planı kuran kullanıcı silinirse plan da gitmeli. `SET NULL`
-- olamaz çünkü gönderenin kimliği olmadan plan çalışamaz — kullanıcısı
-- silinmiş, sessizce hiç göndermeyen bir plan bırakmak bu projedeki
-- en pahalı hata türü.
ALTER TABLE "report_schedules"
  ADD CONSTRAINT "report_schedules_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- SET NULL: şablon silinirse plan çalışmaya DEVAM etsin, varsayılan
-- şablona düşerek. Planı da silmek, kullanıcının kurduğu zamanlamayı
-- ilgisiz bir işlemle yok etmek olurdu.
ALTER TABLE "report_schedules"
  ADD CONSTRAINT "report_schedules_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "report_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
