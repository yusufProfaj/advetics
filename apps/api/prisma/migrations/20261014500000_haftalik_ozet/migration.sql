-- HAFTALIK ÖZET (Paket B, docs/haftalik-ozet/MIMARI.md § 2)
--
-- Üç değişiklik, YENİ ENUM DEĞERİ YOK: özet ikinci bir zamanlayıcı ya da iş
-- türü açmıyor. Müşteri maili var olan `sweep:report-schedules`
-- (report_schedule işi) ile, ajans özeti Paket A'nın `sweep:notifications`
-- (notifications_send işi) ile gidiyor. Bu yüzden 20261014500100 iş türü
-- migration'ı GEREKMEDİ.
--
-- Durum/tür kolonları VARCHAR + CHECK, enum DEĞİL: listeler shared'da kapalı
-- (`YORUM_DURUMLARI`, `RAPOR_PLANI_TURLERI`, `BILDIRIM_OLAYLARI`) ve CHECK
-- listeleri onlarla AYNI olmak zorunda (haftalik-ozet-kayit.spec.ts iki
-- yönlü karşılaştırıyor; ayrışırsa INSERT üretimde patlar).

-- ─── haftalik_ozetler ───────────────────────────────────────────────────────
--
-- Workspace × ISO hafta başına TEK satır ve satır DEĞİŞMEZ (MIMARI Ç-B11):
-- müşteriye giden mail, ajans kanalına giden kısa sürüm ve panel önizlemesi
-- aynı satırı okuyor. Pazartesi gönderilen özetin Perşembe açılan önizlemesi
-- gece düzeltilen dönüşümlerle FARKLI sayı gösterseydi, "müşteriye ne gitti"
-- sorusunun cevabı kaybolurdu.
--
-- `veri` AJANS hâlini taşıyor (sinyaller, bekleyen işler, öneri dahil). RLS
-- satırı workspace'e açıyor; müşteri yolu ham `veri`yi hiçbir yanıtta
-- döndürmüyor, `ozetKitleyeGore`dan geçiriyor (servis, Ajan 4 taraması).
CREATE TABLE "haftalik_ozetler" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  -- org_id HEDEF MÜŞTERİDEN (clients.org_id), istek bağlamından değil:
  -- "tüm şirketler" modunda ctx.orgId ev şirketi kalıyor (CLAUDE.md).
  "org_id"       UUID           NOT NULL,
  "client_id"    UUID           NOT NULL,
  "hafta"        VARCHAR(8)     NOT NULL,
  "veri"         JSONB          NOT NULL,
  "yorum_durumu" VARCHAR(12)    NOT NULL,
  -- Yorumu yazan model (model-gecmisi deseni); yorum yoksa NULL.
  "model"        VARCHAR(80),
  "uretildi"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "haftalik_ozetler_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "haftalik_ozetler_hafta_chk" CHECK ("hafta" ~ '^[0-9]{4}-W(0[1-9]|[1-4][0-9]|5[0-3])$'),
  CONSTRAINT "haftalik_ozetler_yorum_durumu_chk" CHECK ("yorum_durumu" IN ('yazildi', 'reddedildi', 'hata', 'atlandi', 'kapali'))
);
-- EŞZAMANLI İKİ ÜRETİCİ (önizleme + süpürme) aynı haftayı yazmaya kalkarsa
-- ikincisi ON CONFLICT DO NOTHING ile düşüyor ve birinciyi okuyor: en kötü
-- ihtimalle bir yapay zekâ çağrısı boşa gider, iki farklı özet doğmaz.
CREATE UNIQUE INDEX "haftalik_ozetler_client_hafta_key" ON "haftalik_ozetler" ("client_id", "hafta");
CREATE INDEX "haftalik_ozetler_org_id_idx" ON "haftalik_ozetler" ("org_id");
-- Kompozit anahtar ON UPDATE CASCADE: workspace başka şirkete taşınınca
-- org_id'yi Postgres taşıyor (workspace-tasima.ts CASCADE_ILE_TASINANLAR).
ALTER TABLE "haftalik_ozetler" ADD CONSTRAINT "haftalik_ozetler_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── report_schedules.tur ───────────────────────────────────────────────────
--
-- Müşteri özeti AYNI tabloda, AYNI süpürmede (MIMARI Ç-B4). Var olan bütün
-- satırlar `rapor` olarak kalıyor (DEFAULT). Özet satırı `range_key`
-- olarak `onceki_iso_hafta` taşıyor ve `raporPenceresi()` onu TANIMIYOR:
-- rapor dalına yanlışlıkla düşen özet planı yanlış dönemli rapor değil,
-- görünür bir `skipped` üretir.
ALTER TABLE "report_schedules" ADD COLUMN "tur" VARCHAR(20) NOT NULL DEFAULT 'rapor';
ALTER TABLE "report_schedules" ADD CONSTRAINT "report_schedules_tur_chk" CHECK ("tur" IN ('rapor', 'haftalik_ozet'));
-- WORKSPACE BAŞINA TEK ÖZET PLANI: ikinci plan aynı müşteriye aynı pazartesi
-- iki mail demek. Kısmi indeks Prisma şemasında bildirilemiyor (yalnız burada).
CREATE UNIQUE INDEX "report_schedules_ozet_client_key" ON "report_schedules" ("client_id") WHERE "tur" = 'haftalik_ozet';

-- ─── bildirim olayı: haftalik_ozet ──────────────────────────────────────────
--
-- `olay` VARCHAR(10) idi; 'haftalik_ozet' 13 karakter ve INSERT "value too
-- long" ile düşerdi (sinyal özetinin satırı yazılır, haftalık özetinki
-- yazılmaz; hata yalnız worker log'unda). Uzunluk ARTIRILIYOR, yeniden
-- yazma yok.
ALTER TABLE "bildirim_gonderimleri" ALTER COLUMN "olay" TYPE VARCHAR(20);

-- CHECK'ler DÜŞÜRÜLÜP genişletilerek yeniden kuruluyor. Bu kısıtlar
-- 01_constraints.sql'de YOK (yalnız 20261013100000_sinyal'de), yani üretim
-- sırasında çakışan ikinci bir tanım yok.
ALTER TABLE "bildirim_gonderimleri" DROP CONSTRAINT "bildirim_gonderimleri_olay_chk";
ALTER TABLE "bildirim_gonderimleri" ADD CONSTRAINT "bildirim_gonderimleri_olay_chk" CHECK ("olay" IN ('sinyal', 'kural', 'haftalik_ozet', 'deneme'));

ALTER TABLE "bildirim_kanallari" DROP CONSTRAINT "bildirim_kanallari_olaylar_chk";
ALTER TABLE "bildirim_kanallari" ADD CONSTRAINT "bildirim_kanallari_olaylar_chk" CHECK (
  cardinality("olaylar") >= 1 AND "olaylar" <@ ARRAY['sinyal', 'kural', 'haftalik_ozet']::text[]
);
