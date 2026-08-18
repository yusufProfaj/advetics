-- ADVETICS 1.0 — OTOMATİK BOOST: ÖN AYARLAR VE ONAY KUYRUĞU
--
-- Akış: yeni gönderi/video gelir -> onay kuyruğuna kart düşer -> kullanıcı
-- tek tıkla onaylar -> reklam kayıtlı ön ayarla yayına girer. Form yok.
--
-- ═══ SADECE İKİ TABLO EKLENİYOR, HİÇBİR ŞEY DÜŞÜRÜLMÜYOR ═══
--
-- Spec beş model istiyordu; üçünün karşılığı zaten var ve ikinci bir kopya
-- açmak onları anında ayrıştırırdı:
--
--   Workspace         -> mevcut `clients` (RLS'li kiracı varlığı)
--   ReportingMetric   -> mevcut `insights_daily` (normalize metrik + döviz)
--   PlatformConnection-> mevcut `platform_connections`
--   90 günlük ingest  -> mevcut `sync_jobs` + `initial_backfill` iş tipi
--
-- 2.0'ın tabloları YERİNDE KALIYOR. Silme, geri dönüşü dump'a bağlar;
-- kullanılmayan tablo ise hiçbir maliyet üretmiyor.

-- ---------------------------------------------------------------------------
-- ÖN AYARLAR
-- ---------------------------------------------------------------------------
--
-- `boost_rules` ile KARIŞTIRILMAMALI ve o tablo değiştirilmedi. Aradaki fark
-- kavramsal: `boost_rules` bir KURAL MOTORU (koşullar, eşikler, aylık tavan,
-- tur başına aday sayısı) ve gönderileri kendisi SEÇİYOR. Buradaki ön ayar
-- hiçbir şey seçmiyor -- seçimi kullanıcı yapıyor, bu tablo yalnızca
-- "onaylanınca hangi ayarlarla yayınlanacağı" sorusunu cevaplıyor.
--
-- 1.0'ın sadeliği tam olarak burada: koşul yok, eşik yok, tavan yok.
CREATE TABLE "auto_boost_presets" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,

    -- NULL = müşterinin o platformdaki BÜTÜN profilleri. Tek bir kanala özel
    -- ön ayar isteniyorsa doldurulur.
    "social_profile_id" UUID,

    "enabled" BOOLEAN NOT NULL DEFAULT true,

    -- BÜTÇE KİPE GÖRE AYRI KOLONDA -- tek kolona iki anlam yüklenmiyor.
    -- Aynı gerekçe `boosts` tablosunda da uygulandı (K18): bir kolona duruma
    -- göre günlük ya da toplam yazmak, kolonu okuyan her sorgunun kipi de
    -- okumasını gerektirir ve unutulduğu gün ortaya çıkan şey kat kat harcama.
    "budget_mode" VARCHAR(10) NOT NULL DEFAULT 'daily',
    "daily_budget_micros" BIGINT,
    "total_budget_micros" BIGINT,
    "duration_days" INTEGER NOT NULL DEFAULT 3,

    -- PLATFORMA ÖZGÜ AYARLAR.
    --
    -- JSONB ve bu bilinçli: iki platformun alanları ortak değil ve hepsini
    -- kolona açmak, yarısı her zaman NULL olan bir tablo demekti. Meta
    -- tarafında kitle/lokasyon/yaş, Google tarafında teklif stratejisi,
    -- hedef URL, başlıklar.
    --
    -- GÜVENLİ OLMASININ SEBEBİ: bu JSON platforma OLDUĞU GİBİ GİTMİYOR.
    -- Okunurken Zod ayrık birleşimiyle doğrulanıp alan alan eşleniyor.
    -- (Ham JSON'u platforma geçirmek, uydurulmuş bir anahtarın SESSİZCE yok
    -- sayılması demek olurdu -- `boosts.targeting` için de aynı kural.)
    "settings" JSONB NOT NULL,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "created_by" UUID,

    CONSTRAINT "auto_boost_presets_pkey" PRIMARY KEY ("id")
);

-- KİPE GÖRE TAM BİR BÜTÇE KOLONU DOLU OLMALI.
-- İkisi de doluysa hangisinin geçerli olduğu belirsiz; ikisi de boşsa reklam
-- bütçesiz kurulur ve Meta/Google bunu ya reddeder ya da hesabın varsayılanına
-- düşer.
ALTER TABLE "auto_boost_presets" ADD CONSTRAINT "auto_boost_presets_budget_chk"
  CHECK (
    (budget_mode = 'daily'    AND daily_budget_micros IS NOT NULL AND total_budget_micros IS NULL)
    OR
    (budget_mode = 'lifetime' AND total_budget_micros IS NOT NULL AND daily_budget_micros IS NULL)
  );

-- GOOGLE'DA TOPLAM BÜTÇE YOK.
-- Google'da bütçe ayrı bir kaynak (`CampaignBudget`) ve GÜNLÜK. Toplam
-- seçilirse günlüğe bölmek gerekir ve o zaman panelde yazan tutar ile
-- hesaptan çıkan tutar ayrışır. Kısıt burada çünkü uygulama katmanında
-- unutulabilir.
ALTER TABLE "auto_boost_presets" ADD CONSTRAINT "auto_boost_presets_google_daily_chk"
  CHECK (platform <> 'google' OR budget_mode = 'daily');

-- MÜŞTERİ + PLATFORM + PROFİL BAŞINA TEK ÖN AYAR.
--
-- İki ön ayar olsaydı "onaylanınca hangisi uygulanacak" sorusunun cevabı
-- olmazdı ve seçim sessizce satır sırasına kalırdı.
--
-- İKİ AYRI KISMİ İNDEKS gerekiyor: NULL'lar tekil indekste birbirine eşit
-- sayılmıyor, yani tek indeks "bütün profiller için" satırının iki kez
-- yazılmasını engellemezdi.
CREATE UNIQUE INDEX "auto_boost_presets_client_platform_profile_key"
  ON "auto_boost_presets"("client_id", "platform", "social_profile_id")
  WHERE "social_profile_id" IS NOT NULL;

CREATE UNIQUE INDEX "auto_boost_presets_client_platform_default_key"
  ON "auto_boost_presets"("client_id", "platform")
  WHERE "social_profile_id" IS NULL;

CREATE INDEX "auto_boost_presets_client_id_platform_idx"
  ON "auto_boost_presets"("client_id", "platform");

-- ---------------------------------------------------------------------------
-- ONAY KUYRUĞU
-- ---------------------------------------------------------------------------
--
-- Instagram gönderisi ve YouTube videosu AYNI tabloda. Ayırmak, panelde tek
-- bir "Bildirim Havuzu" gösterip altında iki ayrı sorgu birleştirmek demekti
-- ve sıralama/sayfalama iki kaynaktan doğru kurulamazdı.
CREATE TABLE "auto_boost_queue_items" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "platform" "Platform" NOT NULL,

    -- Hangi hesaptan geldi. NULL OLAMAZ: reklam bir sayfa/kanal adına
    -- yayınlanıyor ve hangisi olduğu bilinmeden yayın kurulamaz.
    "social_profile_id" UUID NOT NULL,

    -- ═══ İDEMPOTENCY ANAHTARI -- BU TABLONUN EN KRİTİK ALANI ═══
    --
    -- Instagram medya kimliği ya da YouTube video kimliği.
    --
    -- Webhook teslimi GARANTİ DEĞİL ve MÜKERRER olabiliyor: Meta başarısız
    -- saydığı bildirimi tekrar gönderiyor, YouTube WebSub aynı videoyu
    -- güncelleme olduğunda yeniden bildiriyor. Tekillik kısıtı olmasaydı aynı
    -- gönderi için İKİ KART düşerdi ve ikisi de onaylanırsa AYNI İÇERİK İÇİN
    -- İKİ REKLAM açılır -- iki kat para.
    --
    -- Kısıt veritabanında, uygulama katmanında değil: iki webhook aynı anda
    -- gelebiliyor ve "önce bak sonra yaz" yarışı kaybediyor.
    "external_id" VARCHAR(128) NOT NULL,

    "title" VARCHAR(2000),
    "thumbnail_url" TEXT,
    "permalink" TEXT,
    "media_type" VARCHAR(32),
    "published_at" TIMESTAMPTZ(6),

    -- pending | approved | rejected | launching | launched | failed
    --
    -- `launching` AYRI BİR DURUM. Onay ile platformda oluşma arasında
    -- saniyeler var; süreç orada düşerse kayıt `pending` kalmamalı, yoksa
    -- ikinci kez onaylanır ve İKİNCİ reklam açılır. `boosts.status` içindeki
    -- `creating` ile birebir aynı gerekçe.
    "status" VARCHAR(16) NOT NULL DEFAULT 'pending',

    -- Onaylandığı anda uygulanan ön ayar. Ön ayar SONRADAN değişse bile bu
    -- kaydın hangi ayarlarla yayınlandığı okunabilmeli.
    "applied_preset_id" UUID,
    "applied_settings" JSONB,

    -- Yayın sonucu. Meta yolunda `boosts` satırı da yazılıyor (harcama
    -- muhasebesi ve ağaç oradan işliyor) ve kimliği aşağıda tutuluyor;
    -- Google yolunda `boosts` karşılığı yok, kimlikler doğrudan burada.
    "boost_id" UUID,
    "external_campaign_id" VARCHAR(128),
    "external_ad_group_id" VARCHAR(128),
    "external_ad_id" VARCHAR(128),

    "error" VARCHAR(1000),

    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "launched_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auto_boost_queue_items_pkey" PRIMARY KEY ("id")
);

-- MÜKERRER BİLDİRİM AYNI KARTA DÜŞER, İKİNCİ KART AÇMAZ.
-- Kapsam profil bazında: aynı kimlik iki farklı kanalda teorik olarak
-- çakışabilir ve müşteri bazında kısıtlamak meşru bir kaydı reddederdi.
CREATE UNIQUE INDEX "auto_boost_queue_items_profile_external_key"
  ON "auto_boost_queue_items"("social_profile_id", "external_id");

CREATE INDEX "auto_boost_queue_items_client_status_created_idx"
  ON "auto_boost_queue_items"("client_id", "status", "created_at" DESC);

-- ---------------------------------------------------------------------------
-- YABANCI ANAHTARLAR
-- ---------------------------------------------------------------------------
ALTER TABLE "auto_boost_presets" ADD CONSTRAINT "auto_boost_presets_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_boost_presets" ADD CONSTRAINT "auto_boost_presets_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_boost_presets" ADD CONSTRAINT "auto_boost_presets_social_profile_id_fkey"
  FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_boost_queue_items" ADD CONSTRAINT "auto_boost_queue_items_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_boost_queue_items" ADD CONSTRAINT "auto_boost_queue_items_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_boost_queue_items" ADD CONSTRAINT "auto_boost_queue_items_social_profile_id_fkey"
  FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ÖN AYAR SİLİNİRSE KUYRUK KAYDI YAŞAR.
-- Yayınlanmış bir kaydın geçmişi, ön ayarın silinmesiyle kaybolmamalı --
-- `applied_settings` zaten kopyayı taşıyor.
ALTER TABLE "auto_boost_queue_items" ADD CONSTRAINT "auto_boost_queue_items_applied_preset_id_fkey"
  FOREIGN KEY ("applied_preset_id") REFERENCES "auto_boost_presets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "auto_boost_queue_items" ADD CONSTRAINT "auto_boost_queue_items_boost_id_fkey"
  FOREIGN KEY ("boost_id") REFERENCES "boosts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Standart kiracı deseni: satır müşteriye ait, müşteri temsilcisi kendi
-- müşterisinin verisini görüyor. `02_rls.sql` içindeki tablo listesine de
-- eklendi -- `rls-coverage.spec.ts` eksik olanı yakalıyor.
ALTER TABLE "auto_boost_presets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auto_boost_presets" FORCE ROW LEVEL SECURITY;
ALTER TABLE "auto_boost_queue_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auto_boost_queue_items" FORCE ROW LEVEL SECURITY;
