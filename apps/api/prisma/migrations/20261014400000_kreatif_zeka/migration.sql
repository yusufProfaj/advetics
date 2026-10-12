-- KREATİF ZEKÂSI (Paket D, docs/kreatif-zeka/MIMARI.md § 2)
--
-- Dört tablo. Hepsi client_id + org_id taşıyor; (client_id, org_id)
-- kompozit yabancı anahtarı clients'a ON UPDATE CASCADE: workspace başka
-- şirkete taşınınca satırları Postgres kendisi taşıyor
-- (workspace-tasima.ts CASCADE_ILE_TASINANLAR).
--
-- Durum ve neden kolonları VARCHAR + CHECK, enum DEĞİL: listeler
-- packages/shared/src/kreatif-zeka/durum.ts içinde kapalı. CHECK listeleri
-- shared listeleriyle AYNI olmak zorunda; ayrışırlarsa INSERT üretimde
-- patlar (kreatif-zeka-kayit.spec.ts iki yönlü karşılaştırıyor).
--
-- Enum SyncJobType değeri AYRI migration'da (20261014400100): aynı
-- transaction'da eklenen enum değeri kullanılamıyor.
--
-- creatives TABLOSUNA KOLON EKLENMİYOR: o tablo platform aynası ve yedi
-- upsert onu yazıyor; etiket ona bağlansaydı her yapı taraması onu
-- ezebilirdi ve Meta aynı içerikli kreatifi yeniden kullandığı için (N-12)
-- aynı görsel onlarca satırda ayrı ayrı etiketlenirdi.

-- ─── kreatif_icerikleri ─────────────────────────────────────────────────────
--
-- Kreatif başına BİZİM kaydımız: hangi içeriğe (SHA-256) bağlandı, neden
-- etiketlenemedi, kaç kez denendi. Kreatif silinince gider (CASCADE).
CREATE TABLE "kreatif_icerikleri" (
  "creative_id"     UUID           NOT NULL,
  "org_id"          UUID           NOT NULL,
  "client_id"       UUID           NOT NULL,
  "ad_account_id"   UUID           NOT NULL,
  "platform"        "Platform"     NOT NULL,
  -- İndirmeden tanıma (Meta image_hash + hesap, video kimliği, Google
  -- varlık kimliği). Aynı anahtarlı ikinci kreatif ne indirilir ne
  -- etiketlenir.
  "kaynak_anahtari" VARCHAR(120),
  -- İndirilen baytların SHA-256'sı, küçük harf hex. İndirilince dolar.
  "icerik_ozeti"    CHAR(64),
  -- Video ve karuselde yalnız kapak ya da ilk kart etiketlendi; ekranda söylenir.
  "kismi"           VARCHAR(16),
  -- Platform verisinden KESİN okunan iki alan; modele gitmez.
  "bicim"           VARCHAR(10)    NOT NULL,
  "en_boy"          VARCHAR(8),
  "durum"           VARCHAR(16)    NOT NULL DEFAULT 'bekliyor',
  "neden"           VARCHAR(24),
  "deneme"          SMALLINT       NOT NULL DEFAULT 0,
  -- Platformun ya da Gemini'nin cümlesi, olduğu gibi.
  "son_hata"        TEXT,
  "sema_surumu"     SMALLINT       NOT NULL,
  "son_deneme"      TIMESTAMPTZ(6),
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "kreatif_icerikleri_pkey" PRIMARY KEY ("creative_id"),
  CONSTRAINT "kreatif_icerikleri_durum_chk" CHECK ("durum" IN ('bekliyor', 'etiketlendi', 'etiketlenemez')),
  CONSTRAINT "kreatif_icerikleri_neden_chk" CHECK ("neden" IS NULL OR "neden" IN (
    'metin_reklami', 'gorsel_yok', 'platform_disi', 'bicim', 'boyut', 'gemini_ret', 'sema_disi', 'deneme_tukendi',
    'gemini_kota', 'gemini_ulasilamadi', 'adres_alinamadi', 'indirme_dustu', 'platform_kotasi'
  )),
  CONSTRAINT "kreatif_icerikleri_kismi_chk" CHECK ("kismi" IS NULL OR "kismi" IN ('video_kapagi', 'ilk_kart')),
  CONSTRAINT "kreatif_icerikleri_bicim_chk" CHECK ("bicim" IN ('gorsel', 'video', 'karusel')),
  CONSTRAINT "kreatif_icerikleri_en_boy_chk" CHECK ("en_boy" IS NULL OR "en_boy" IN ('kare', 'dikey', 'yatay')),
  CONSTRAINT "kreatif_icerikleri_ozet_chk" CHECK ("icerik_ozeti" IS NULL OR "icerik_ozeti" ~ '^[0-9a-f]{64}$'),
  -- ETİKETLENMİŞ SATIRIN ÖZETİ VAR, ETİKETLENEMEZİN NEDENİ VAR. Biri eksik
  -- yazılırsa ekran "etiketli ama etiketi yok" ya da "incelenemiyor ama
  -- nedeni yok" gösterirdi.
  CONSTRAINT "kreatif_icerikleri_etiketli_chk" CHECK (("durum" = 'etiketlendi') <= ("icerik_ozeti" IS NOT NULL)),
  CONSTRAINT "kreatif_icerikleri_kalici_chk" CHECK (("durum" = 'etiketlenemez') <= ("neden" IS NOT NULL)),
  CONSTRAINT "kreatif_icerikleri_deneme_chk" CHECK ("deneme" >= 0)
);
CREATE INDEX "kreatif_icerikleri_client_durum_idx" ON "kreatif_icerikleri" ("client_id", "durum");
CREATE INDEX "kreatif_icerikleri_client_kaynak_idx" ON "kreatif_icerikleri" ("client_id", "kaynak_anahtari");
CREATE INDEX "kreatif_icerikleri_client_ozet_idx" ON "kreatif_icerikleri" ("client_id", "icerik_ozeti");
CREATE INDEX "kreatif_icerikleri_ad_account_idx" ON "kreatif_icerikleri" ("ad_account_id");
CREATE INDEX "kreatif_icerikleri_org_id_idx" ON "kreatif_icerikleri" ("org_id");
ALTER TABLE "kreatif_icerikleri" ADD CONSTRAINT "kreatif_icerikleri_creative_fkey"
  FOREIGN KEY ("creative_id") REFERENCES "creatives"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kreatif_icerikleri" ADD CONSTRAINT "kreatif_icerikleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kreatif_icerikleri" ADD CONSTRAINT "kreatif_icerikleri_ad_account_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── kreatif_etiketleri ─────────────────────────────────────────────────────
--
-- İÇERİK başına etiket. Tekillik WORKSPACE kapsamında, bilerek: ürün geneli
-- bir içerik tablosu iki müşterinin görselini aynı satırda buluştururdu
-- (RLS'siz paylaşılan veri). Bedeli, aynı görseli kullanan iki workspace'te
-- iki çağrı.
CREATE TABLE "kreatif_etiketleri" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"       UUID           NOT NULL,
  "client_id"    UUID           NOT NULL,
  "icerik_ozeti" CHAR(64)       NOT NULL,
  "sema_surumu"  SMALLINT       NOT NULL,
  -- Yalnız etiketCoz'dan geçmiş GoruEtiketleri; şema dışı cevap buraya girmez.
  "etiketler"    JSONB          NOT NULL,
  "model"        VARCHAR(60)    NOT NULL,
  "girdi_token"  INTEGER        NOT NULL DEFAULT 0,
  "cikti_token"  INTEGER        NOT NULL DEFAULT 0,
  "sure_ms"      INTEGER        NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "kreatif_etiketleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kreatif_etiketleri_ozet_chk" CHECK ("icerik_ozeti" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "kreatif_etiketleri_nesne_chk" CHECK (jsonb_typeof("etiketler") = 'object')
);
CREATE UNIQUE INDEX "kreatif_etiketleri_icerik_key" ON "kreatif_etiketleri" ("client_id", "icerik_ozeti", "sema_surumu");
CREATE INDEX "kreatif_etiketleri_org_id_idx" ON "kreatif_etiketleri" ("org_id");
ALTER TABLE "kreatif_etiketleri" ADD CONSTRAINT "kreatif_etiketleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── kreatif_etiket_sayaci (maliyet bekçisi) ────────────────────────────────
--
-- İstanbul günü başına workspace satırı. AYIRMA ÇAĞRIDAN ÖNCE ve TEK
-- DEYİMLE yapılıyor (INSERT ... ON CONFLICT DO UPDATE ... WHERE istek <
-- sınır RETURNING): worker dört işi paralel koşturuyor ve "oku, karşılaştır,
-- yaz" üç adımı iki işi aynı anda sınırın altında görüp birlikte aşırırdı.
CREATE TABLE "kreatif_etiket_sayaci" (
  "org_id"       UUID           NOT NULL,
  "client_id"    UUID           NOT NULL,
  "gun"          DATE           NOT NULL,
  "etiket_istek" INTEGER        NOT NULL DEFAULT 0,
  "brief_istek"  INTEGER        NOT NULL DEFAULT 0,
  "basarili"     INTEGER        NOT NULL DEFAULT 0,
  "hata"         INTEGER        NOT NULL DEFAULT 0,
  "girdi_token"  BIGINT         NOT NULL DEFAULT 0,
  "cikti_token"  BIGINT         NOT NULL DEFAULT 0,
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "kreatif_etiket_sayaci_pkey" PRIMARY KEY ("client_id", "gun"),
  CONSTRAINT "kreatif_etiket_sayaci_negatif_chk" CHECK (
    "etiket_istek" >= 0 AND "brief_istek" >= 0 AND "basarili" >= 0 AND "hata" >= 0
  )
);
CREATE INDEX "kreatif_etiket_sayaci_gun_idx" ON "kreatif_etiket_sayaci" ("gun");
CREATE INDEX "kreatif_etiket_sayaci_org_id_idx" ON "kreatif_etiket_sayaci" ("org_id");
ALTER TABLE "kreatif_etiket_sayaci" ADD CONSTRAINT "kreatif_etiket_sayaci_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── kreatif_briefleri ──────────────────────────────────────────────────────
--
-- (client_id, kume_anahtari, girdi_ozeti) tekil: aynı bulgu kümesi ikinci
-- kez Gemini'ye gitmez. Sayılar bulgular kolonunda (sorgudan); cevap
-- yalnız briefMetniDenetle'den geçmiş metin.
CREATE TABLE "kreatif_briefleri" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"            UUID           NOT NULL,
  "client_id"         UUID           NOT NULL,
  "kume_anahtari"     VARCHAR(40)    NOT NULL,
  "girdi_ozeti"       CHAR(64)       NOT NULL,
  "bulgular"          JSONB          NOT NULL,
  "cevap"             JSONB          NOT NULL,
  "model"             VARCHAR(60)    NOT NULL,
  "girdi_token"       INTEGER        NOT NULL DEFAULT 0,
  "cikti_token"       INTEGER        NOT NULL DEFAULT 0,
  -- Kullanıcı silinse de brief kalır (SET NULL); ad LEFT JOIN ile alınır
  -- (RLS'li tabloya INNER JOIN ana satırı sessizce süzüyor, CLAUDE.md).
  "olusturan_user_id" UUID,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "kreatif_briefleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "kreatif_briefleri_kume_chk" CHECK ("kume_anahtari" ~ '^(meta|google):[a-z_]+$'),
  CONSTRAINT "kreatif_briefleri_ozet_chk" CHECK ("girdi_ozeti" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "kreatif_briefleri_bulgu_chk" CHECK (jsonb_typeof("bulgular") = 'array' AND jsonb_array_length("bulgular") >= 1)
);
CREATE UNIQUE INDEX "kreatif_briefleri_girdi_key" ON "kreatif_briefleri" ("client_id", "kume_anahtari", "girdi_ozeti");
CREATE INDEX "kreatif_briefleri_kume_idx" ON "kreatif_briefleri" ("client_id", "kume_anahtari", "created_at" DESC);
CREATE INDEX "kreatif_briefleri_org_id_idx" ON "kreatif_briefleri" ("org_id");
ALTER TABLE "kreatif_briefleri" ADD CONSTRAINT "kreatif_briefleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kreatif_briefleri" ADD CONSTRAINT "kreatif_briefleri_user_fkey"
  FOREIGN KEY ("olusturan_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
