-- SİNYALLER + BİLDİRİM KANALLARI (Paket A, docs/sinyal/MIMARI.md § 2)
--
-- Üç tablo. Durum kolonları VARCHAR + CHECK, enum DEĞİL: listeler
-- `packages/shared/src/sinyal/` içinde kapalı ve bir değer eklemek ayrı bir
-- migration istemesin. CHECK listeleri shared listeleriyle AYNI olmak
-- zorunda; ayrışırlarsa INSERT üretimde patlar (Ajan 4 testi iki yönlü
-- karşılaştırıyor, fatura-zip.spec.ts deseni).
--
-- Enum `SyncJobType` değerleri AYRI migration'da (20261013100100): aynı
-- transaction'da eklenen enum değeri kullanılamıyor.

-- ─── sinyaller ──────────────────────────────────────────────────────────────
--
-- SAKLANAN GÖZLEM. İyileştir önerisinden farkı: öneri her istekte yeniden
-- hesaplanıyor, sinyal ise kapatma, kendiliğinden kapanma, yeniden açılma
-- ve "kanala ne gitti" geçmişi istiyor (MIMARI Ç-4).
CREATE TABLE "sinyaller" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"         UUID           NOT NULL,
  "client_id"      UUID           NOT NULL,
  "ad_account_id"  UUID           NOT NULL,
  "platform"       "Platform"     NOT NULL,
  -- tur:kod:yon:seviye:varlik. Varlık kimliği bizim UUID'imiz, yani anahtar
  -- client_id İÇERMİYOR: hesap başka workspace'e taşınınca satır taşınır ve
  -- hedefte çakışma doğmaz.
  "anahtar"        VARCHAR(200)   NOT NULL,
  "tur"            VARCHAR(12)    NOT NULL,
  "kod"            VARCHAR(40)    NOT NULL,
  "yon"            VARCHAR(8),
  "seviye"         "EntityLevel"  NOT NULL,
  "varlik_id"      UUID           NOT NULL,
  -- GÖZLEM ANINDAKİ ad: varlık sonradan silinse de kart okunabilsin.
  "varlik_adi"     VARCHAR(512)   NOT NULL,
  "ust_adi"        VARCHAR(512),
  -- Gözlem günü (hesabın kendi gününde). Dönüşüm metriklerinde gecikme kadar geride.
  "gun"            DATE           NOT NULL,
  "gozlenen"       NUMERIC,
  "beklenen_alt"   NUMERIC,
  "beklenen_orta"  NUMERIC,
  "beklenen_ust"   NUMERIC,
  "nokta"          SMALLINT,
  -- İşaretli sapma. Kapatılmış sinyalin "kötüleşti mi" referansı kapatma_z.
  "z"              NUMERIC,
  "onem"           VARCHAR(8)     NOT NULL,
  "para_birimi"    CHAR(3)        NOT NULL,
  "kanit"          JSONB          NOT NULL DEFAULT '{}',
  "durum"          VARCHAR(24)    NOT NULL DEFAULT 'acik',
  "ilk_gorulme"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "son_gorulme"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  -- Son kez AÇIK duruma geçtiği an; sabah özeti bu kolona bakıyor.
  "son_acilma"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "acilma_sayisi"  INTEGER        NOT NULL DEFAULT 1,
  "kapatma_nedeni" VARCHAR(12),
  "kapatma_z"      NUMERIC,
  "kapatan_user_id" UUID,
  "kapatma_zamani" TIMESTAMPTZ(6),
  "kapatma_notu"   VARCHAR(300),
  -- Uygula sonucu (geri okuma: dogrulandi/uyusmadi, platform değeri, kim, ne zaman).
  "uygulama"       JSONB,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "sinyaller_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sinyaller_tur_chk" CHECK ("tur" IN ('anomali', 'saglik')),
  CONSTRAINT "sinyaller_kod_chk" CHECK ("kod" IN (
    'harcama', 'gosterim', 'tiklama_orani', 'tiklama_basi_maliyet', 'donusum', 'donusum_basi_maliyet',
    'sifir_gosterim', 'reklam_onaysiz', 'donusum_kesildi'
  )),
  -- Tür ile kod AYNI aileden: "anomali" türünde bir sağlık kodu, ekranda
  -- kaynağı olmayan bir sayı gösterirdi.
  CONSTRAINT "sinyaller_tur_kod_chk" CHECK (("tur" = 'anomali') = ("kod" IN (
    'harcama', 'gosterim', 'tiklama_orani', 'tiklama_basi_maliyet', 'donusum', 'donusum_basi_maliyet'
  ))),
  CONSTRAINT "sinyaller_yon_chk" CHECK ("yon" IS NULL OR "yon" IN ('artis', 'dusus')),
  CONSTRAINT "sinyaller_onem_chk" CHECK ("onem" IN ('yuksek', 'orta')),
  CONSTRAINT "sinyaller_durum_chk" CHECK ("durum" IN ('acik', 'kapatildi', 'kendiliginden_kapandi')),
  CONSTRAINT "sinyaller_kapatma_nedeni_chk" CHECK ("kapatma_nedeni" IS NULL OR "kapatma_nedeni" IN ('kullanici', 'uygulandi', 'sure_doldu')),
  -- AÇIK SİNYALİN KAPATMA NEDENİ OLMAZ, KAPALININ OLUR. Yeniden açılan satır
  -- kapatma alanlarını temizlemezse ekran "açık ama kapatıldı" gösterirdi.
  CONSTRAINT "sinyaller_kapatma_tutarli_chk" CHECK (("durum" = 'acik') = ("kapatma_nedeni" IS NULL)),
  CONSTRAINT "sinyaller_acilma_chk" CHECK ("acilma_sayisi" >= 1)
);
CREATE UNIQUE INDEX "sinyaller_anahtar_key" ON "sinyaller" ("anahtar");
CREATE INDEX "sinyaller_client_durum_idx" ON "sinyaller" ("client_id", "durum", "son_acilma" DESC);
CREATE INDEX "sinyaller_ad_account_idx" ON "sinyaller" ("ad_account_id");
CREATE INDEX "sinyaller_org_id_idx" ON "sinyaller" ("org_id");
-- Sabah özeti: açık sinyaller, son açılmaya göre. Kısmi indeksin yüklemindeki
-- durumdan ÇIKIŞI iki yol yazıyor: iş (sure_doldu) ve kullanıcı (kapat /
-- Uygula). Kalıcı kilit yok (CLAUDE.md "kısmi tekil indeks" dersi; bu indeks
-- tekil de değil).
CREATE INDEX "sinyaller_acik_ozet_idx" ON "sinyaller" ("client_id", "son_acilma") WHERE "durum" = 'acik';
ALTER TABLE "sinyaller" ADD CONSTRAINT "sinyaller_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sinyaller" ADD CONSTRAINT "sinyaller_ad_account_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sinyaller" ADD CONSTRAINT "sinyaller_kapatan_fkey"
  FOREIGN KEY ("kapatan_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── bildirim_kanallari ─────────────────────────────────────────────────────
--
-- Workspace başına kanal. Sinyal özeti ve kural motorunun `notify` eylemi
-- AYNI kanallara gidiyor; ikinci bir gönderim yolu doğduğu anda ayrışır.
CREATE TABLE "bildirim_kanallari" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "tur"              VARCHAR(10)    NOT NULL,
  "ad"               VARCHAR(80)    NOT NULL,
  -- WEBHOOK ADRESİ ŞİFRELİ (CryptoService, AES-256-GCM). Adres bir parola
  -- gibi: bilen herkes kanala mesaj atabilir. Hiçbir liste sorgusu bu
  -- kolonu seçmiyor; yanıtta tam adres YOK.
  "hedef_enc"        BYTEA,
  "hedef_ipucu"      VARCHAR(120)   NOT NULL,
  "alicilar"         TEXT[],
  "olaylar"          TEXT[]         NOT NULL,
  "etkin"            BOOLEAN        NOT NULL DEFAULT true,
  -- Kullanıcının "deneme mesajı geldi" cevabı. 200 döndü doğrulama değil.
  "dogrulandi"       TIMESTAMPTZ(6),
  -- Son sinyal özetine giren en yeni son_acilma. NULL = kanal açıldığından
  -- beri (created_at): yeni kanal geçmişteki bütün açık sinyalleri ilk
  -- sabah tek seferde boca etmesin.
  "son_ozet_kapsami" TIMESTAMPTZ(6),
  "created_by"       UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "bildirim_kanallari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bildirim_kanallari_tur_chk" CHECK ("tur" IN ('eposta', 'slack', 'teams')),
  CONSTRAINT "bildirim_kanallari_olaylar_chk" CHECK (
    cardinality("olaylar") >= 1 AND "olaylar" <@ ARRAY['sinyal', 'kural']::text[]
  ),
  -- E-POSTANIN ADRESİ YOK, WEBHOOK'UN ALICISI YOK. Biri eksik ya da fazla
  -- yazılırsa gönderici yanlış dala girer ve hata ilk sabah görünürdü.
  CONSTRAINT "bildirim_kanallari_hedef_chk" CHECK (("tur" = 'eposta') = ("hedef_enc" IS NULL)),
  CONSTRAINT "bildirim_kanallari_alici_chk" CHECK (
    ("tur" = 'eposta') = ("alicilar" IS NOT NULL) AND ("alicilar" IS NULL OR cardinality("alicilar") >= 1)
  )
);
CREATE INDEX "bildirim_kanallari_client_idx" ON "bildirim_kanallari" ("client_id", "created_at");
CREATE INDEX "bildirim_kanallari_org_id_idx" ON "bildirim_kanallari" ("org_id");
ALTER TABLE "bildirim_kanallari" ADD CONSTRAINT "bildirim_kanallari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bildirim_kanallari" ADD CONSTRAINT "bildirim_kanallari_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── bildirim_gonderimleri ──────────────────────────────────────────────────
--
-- TESLİM KAYDI bir NİYET kaydı; gerçek teslim platformun cevabı. Satır
-- `bekliyor`da sonsuza kadar kalamaz: her deneme yazılıyor, sınır dolunca
-- `vazgecildi` (CLAUDE.md "sync_jobs satırı niyet, kuyruk gerçek").
CREATE TABLE "bildirim_gonderimleri" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"         UUID           NOT NULL,
  "client_id"      UUID           NOT NULL,
  -- Kanal silinse de geçmiş kalır (SET NULL).
  "kanal_id"       UUID,
  "olay"           VARCHAR(10)    NOT NULL,
  -- ozet:<gün>, kural:<rule_run_id>, deneme:<uuid>. (kanal_id, anahtar)
  -- tekil = idempotent: iki süpürme aynı özeti iki kez gönderemez.
  "anahtar"        VARCHAR(160)   NOT NULL,
  "ozet"           VARCHAR(200)   NOT NULL,
  -- Gönderilecek içerik kanaldan BAĞIMSIZ saklanıyor ve yeniden denemede
  -- AYNISI gidiyor; biçim (Slack blokları, Teams kartı, HTML) gönderimde.
  "govde"          JSONB          NOT NULL,
  "kaynaklar"      JSONB          NOT NULL DEFAULT '[]',
  "durum"          VARCHAR(12)    NOT NULL DEFAULT 'bekliyor',
  "deneme"         SMALLINT       NOT NULL DEFAULT 0,
  "sonraki_deneme" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "http_durum"     INTEGER,
  -- Platformun ya da SMTP'nin cümlesi, olduğu gibi.
  "hata"           TEXT,
  -- E-postada sunucunun reddettiği alıcılar: kısmi ret SESSİZ başarı dönüyor
  -- (mail-gonderici.ts) ve burada görünmezse hiç görünmez.
  "reddedilen"     TEXT[],
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "gonderildi"     TIMESTAMPTZ(6),

  CONSTRAINT "bildirim_gonderimleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "bildirim_gonderimleri_olay_chk" CHECK ("olay" IN ('sinyal', 'kural', 'deneme')),
  CONSTRAINT "bildirim_gonderimleri_durum_chk" CHECK ("durum" IN ('bekliyor', 'gonderildi', 'basarisiz', 'vazgecildi')),
  CONSTRAINT "bildirim_gonderimleri_gonderildi_chk" CHECK (("durum" = 'gonderildi') = ("gonderildi" IS NOT NULL))
);
CREATE UNIQUE INDEX "bildirim_gonderimleri_kanal_anahtar_key" ON "bildirim_gonderimleri" ("kanal_id", "anahtar");
CREATE INDEX "bildirim_gonderimleri_bekleyen_idx" ON "bildirim_gonderimleri" ("sonraki_deneme") WHERE "durum" IN ('bekliyor', 'basarisiz');
CREATE INDEX "bildirim_gonderimleri_client_idx" ON "bildirim_gonderimleri" ("client_id", "created_at" DESC);
CREATE INDEX "bildirim_gonderimleri_org_id_idx" ON "bildirim_gonderimleri" ("org_id");
ALTER TABLE "bildirim_gonderimleri" ADD CONSTRAINT "bildirim_gonderimleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bildirim_gonderimleri" ADD CONSTRAINT "bildirim_gonderimleri_kanal_fkey"
  FOREIGN KEY ("kanal_id") REFERENCES "bildirim_kanallari"("id") ON DELETE SET NULL ON UPDATE CASCADE;
