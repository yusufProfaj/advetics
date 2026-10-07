-- ADVSTRATEGY — AYLIK MEDYA PLANI (docs/advstrategy/MIMARI.md § 1)
--
-- ENUM YOK, CHECK VAR. Plan durumu, platform, katman, kaynak ve niyet
-- değerleri CHECK ile dayatılıyor: Postgres enum'una değer eklemek AYRI bir
-- migration istiyor (aynı transaction'da kullanılamıyor) ve değer çıkarmak
-- tip takası (CLAUDE.md). CHECK'i değiştirmek tek bir ALTER.
--
-- Bu migration YALNIZ yeni tablo kuruyor; var olan hiçbir şema nesnesine
-- dokunmuyor. Üretim sırasıyla (önceki migration'lar, 01_constraints.sql,
-- eski veri, bu dosya) çakışacak bir kısıt yok: hiçbir eski tablonun
-- kısıtına ya da tipine bakmıyor.

-- ── Plan ────────────────────────────────────────────────────────────────
-- Kelime araması durumu PLAN SATIRINDA tutuluyor, sync_jobs'ta değil:
-- sync_jobs.job_type bir Postgres ENUM'u ve yeni değer ayrı migration +
-- reklam hesabına bağlı bir satır istiyor; kelime araması bir reklam
-- hesabının senkronu değil, planın bir adımı. Durum burada olunca panel
-- tek sorguyla "aranıyor / bitti / hata + Google'ın mesajı" diyebiliyor.
CREATE TABLE "strateji_planlari" (
  "id"                   UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"               UUID           NOT NULL,
  "client_id"            UUID           NOT NULL,
  "donem"                CHAR(7)        NOT NULL,
  "durum"                VARCHAR(10)    NOT NULL DEFAULT 'taslak',
  "surum"                INTEGER        NOT NULL DEFAULT 1,
  "toplam_butce_micros"  BIGINT         NOT NULL,
  "para_birimi"          CHAR(3)        NOT NULL,
  "onaylayan_user_id"    UUID,
  "onay_rolu"            VARCHAR(7),
  "onay_zamani"          TIMESTAMPTZ(6),
  "onaylanan_surum"      INTEGER,
  "aktarim"              JSONB,
  -- "not" Postgres'te ayrılmış kelime: her sorguda tırnaklamak gerekirdi ve
  -- unutulan tek tırnak sorguyu bozar. Ad bu yüzden "notu".
  "notu"                 VARCHAR(1000),
  -- Son dağılım önerisi (DagilimOnerisi). Kaydedilen satırın kaynağı
  -- (gecmis_veri / elle) buna bakılarak belirleniyor: sözleşmedeki kayıt
  -- girdisi kaynak taşımıyor ve panelin beyanına güvenmek, elle değiştirilmiş
  -- bir tutarı "geçmiş veriden" diye müşteriye göstermek olurdu.
  "son_oneri"            JSONB,
  -- NULL = bu planda hiç arama yapılmadı (ekran ölçülmüş genel durumu
  -- gösterir); 'yok' = Google bu planın aramasını yetki hatasıyla reddetti.
  "kelime_erisim"        VARCHAR(9),
  "kelime_arama"         VARCHAR(10)    NOT NULL DEFAULT 'bos',
  "kelime_arama_zamani"  TIMESTAMPTZ(6),
  "kelime_son_hata"      VARCHAR(2000),
  -- Google'ın döndürdüğü TEKİL fikir sayısı (kesmeden önce). Ekran
  -- "300 / 2.660" yazar; sessiz kesme yok.
  "kelime_toplam"        INTEGER,
  -- AKTİF ARAMANIN KİMLİĞİ. Her arama isteği yeni bir kimlik basar ve işçi
  -- yalnız KENDİ kimliği hâlâ buradaysa sonuç yazar. Yoksa 15 dakikadan uzun
  -- kuyrukta kalmış ESKİ bir iş, kullanıcının o arada başlattığı YENİ aramanın
  -- sonucunu ve durumunu sessizce ezerdi.
  "kelime_arama_id"      UUID,
  "created_by"           UUID,
  "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "strateji_planlari_pkey" PRIMARY KEY ("id"),
  -- Çocuk tabloların (plan_id, client_id) kompozit anahtarının hedefi.
  CONSTRAINT "strateji_planlari_id_client_key" UNIQUE ("id", "client_id"),
  CONSTRAINT "strateji_planlari_donem_chk" CHECK ("donem" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "strateji_planlari_durum_chk" CHECK ("durum" IN ('taslak', 'onayda', 'onaylandi', 'aktarildi', 'iptal')),
  CONSTRAINT "strateji_planlari_surum_chk" CHECK ("surum" >= 1),
  CONSTRAINT "strateji_planlari_butce_chk" CHECK ("toplam_butce_micros" > 0),
  CONSTRAINT "strateji_planlari_birim_chk" CHECK ("para_birimi" ~ '^[A-Z]{3}$'),
  CONSTRAINT "strateji_planlari_onay_rolu_chk" CHECK ("onay_rolu" IS NULL OR "onay_rolu" IN ('musteri', 'ajans')),
  -- Onaylanmış ya da aktarılmış plan onayın izini TAŞIMAK zorunda: aktarım
  -- onaylanan sürümü istiyor ve izsiz bir "onaylandi" kimin neye evet
  -- dediğini kaybeder. Onaylayan kullanıcı silinebilir (SET NULL), o yüzden
  -- kimlik değil rol + zaman + sürüm zorunlu.
  CONSTRAINT "strateji_planlari_onay_izi_chk" CHECK (
    "durum" NOT IN ('onaylandi', 'aktarildi')
    OR ("onay_rolu" IS NOT NULL AND "onay_zamani" IS NOT NULL AND "onaylanan_surum" IS NOT NULL)
  ),
  CONSTRAINT "strateji_planlari_erisim_chk" CHECK ("kelime_erisim" IS NULL OR "kelime_erisim" IN ('olculmedi', 'var', 'yok')),
  CONSTRAINT "strateji_planlari_arama_chk" CHECK ("kelime_arama" IN ('bos', 'kuyrukta', 'calisiyor', 'bitti', 'hata'))
);
-- AÇIK PLAN TEKİL: aynı ay için iki canlı plan = müşteriye hangisinin
-- gittiği belirsiz. Son durumlar (aktarildi, iptal) o ayı yeni plana açar;
-- çıkışı olmayan durum yok (sozlesme.spec.ts). Prisma kısmi indeksi
-- bildiremiyor; şemada yorum olarak duruyor.
CREATE UNIQUE INDEX "strateji_planlari_acik_donem_key" ON "strateji_planlari" ("client_id", "donem")
  WHERE "durum" IN ('taslak', 'onayda', 'onaylandi');
CREATE INDEX "strateji_planlari_client_idx" ON "strateji_planlari" ("client_id", "donem" DESC);
CREATE INDEX "strateji_planlari_org_id_idx" ON "strateji_planlari" ("org_id");
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_onaylayan_fkey"
  FOREIGN KEY ("onaylayan_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Dağılım ─────────────────────────────────────────────────────────────
-- PLAN ANAHTARI KOMPOZİT: (plan_id, client_id) → planın (id, client_id).
-- Denormalize client_id, satırın bağlı olduğu planın workspace'inden AYRI
-- olamaz; A'nın planına B'nin client_id'siyle yazılmış bir satır, RLS'te B'ye
-- görünür ve A'nın planında "olmayan" bir satır olurdu. Servis bunu zaten
-- plandan okuyor; kısıt savunma derinliği (matris ve kelimeler aynı).
-- client_id/org_id DENORMALİZE: RLS politikası join'siz yazılabilsin diye
-- (projenin genel deseni) ve workspace taşınınca satır planla birlikte
-- gidebilsin diye. Yazma tek seferde (DELETE + INSERT, aynı transaction).
CREATE TABLE "strateji_dagilimlari" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"       UUID           NOT NULL,
  "org_id"        UUID           NOT NULL,
  "client_id"     UUID           NOT NULL,
  "platform"      VARCHAR(6)     NOT NULL,
  "katman"        VARCHAR(18)    NOT NULL,
  "tutar_micros"  BIGINT         NOT NULL,
  "kaynak"        VARCHAR(11)    NOT NULL,
  "gerekce"       VARCHAR(500),
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "strateji_dagilimlari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strateji_dagilimlari_platform_chk" CHECK ("platform" IN ('meta', 'google')),
  CONSTRAINT "strateji_dagilimlari_katman_chk" CHECK ("katman" IN ('soguk', 'sicak', 'yeniden_pazarlama')),
  CONSTRAINT "strateji_dagilimlari_tutar_chk" CHECK ("tutar_micros" >= 0),
  CONSTRAINT "strateji_dagilimlari_kaynak_chk" CHECK ("kaynak" IN ('gecmis_veri', 'elle'))
);
CREATE UNIQUE INDEX "strateji_dagilimlari_hucre_key" ON "strateji_dagilimlari" ("plan_id", "platform", "katman");
CREATE INDEX "strateji_dagilimlari_client_idx" ON "strateji_dagilimlari" ("client_id");
CREATE INDEX "strateji_dagilimlari_org_id_idx" ON "strateji_dagilimlari" ("org_id");
ALTER TABLE "strateji_dagilimlari" ADD CONSTRAINT "strateji_dagilimlari_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "strateji_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_dagilimlari" ADD CONSTRAINT "strateji_dagilimlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Matris ──────────────────────────────────────────────────────────────
-- Kitle şablonu silinince satır KALIR (SET NULL): ekran "silinmiş kitle"
-- der, aktarım satırı kaynak_silinmis olarak sayar. Varlıklar dizi olarak
-- tutuluyor (FK yok) aynı sebeple: varlık silinince satır düşmemeli.
-- Niyet listesi NIYET_KODLARI ile aynı; liste değişirse bu CHECK de
-- değişmeli (strateji-kayit.spec.ts ikisini karşılaştırıyor).
CREATE TABLE "strateji_matrisi" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"           UUID           NOT NULL,
  "org_id"            UUID           NOT NULL,
  "client_id"         UUID           NOT NULL,
  "sira"              INTEGER        NOT NULL,
  "platform"          VARCHAR(6)     NOT NULL,
  "katman"            VARCHAR(18)    NOT NULL,
  "niyet"             VARCHAR(24)    NOT NULL,
  "kitle_sablonu_id"  UUID,
  "kelime_grubu"      VARCHAR(80),
  "varlik_idleri"     UUID[]         NOT NULL DEFAULT '{}',
  "tutar_micros"      BIGINT         NOT NULL,
  "notu"              VARCHAR(500),
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "strateji_matrisi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strateji_matrisi_platform_chk" CHECK ("platform" IN ('meta', 'google')),
  CONSTRAINT "strateji_matrisi_katman_chk" CHECK ("katman" IN ('soguk', 'sicak', 'yeniden_pazarlama')),
  CONSTRAINT "strateji_matrisi_niyet_chk" CHECK ("niyet" IN (
    'FORM', 'WHATSAPP', 'SITE', 'SATIS', 'ONE_CIKAR', 'IG_MESAJ', 'TELEFON',
    'ERISIM', 'MESSENGER', 'COK_KANAL_MESAJ', 'WHATSAPP_CAGRI', 'SITE_MESAJ', 'YEREL_YARICAP'
  )),
  CONSTRAINT "strateji_matrisi_tutar_chk" CHECK ("tutar_micros" >= 0),
  CONSTRAINT "strateji_matrisi_varlik_chk" CHECK (cardinality("varlik_idleri") <= 10)
);
CREATE UNIQUE INDEX "strateji_matrisi_sira_key" ON "strateji_matrisi" ("plan_id", "sira");
CREATE INDEX "strateji_matrisi_client_idx" ON "strateji_matrisi" ("client_id");
CREATE INDEX "strateji_matrisi_org_id_idx" ON "strateji_matrisi" ("org_id");
CREATE INDEX "strateji_matrisi_kitle_idx" ON "strateji_matrisi" ("kitle_sablonu_id");
ALTER TABLE "strateji_matrisi" ADD CONSTRAINT "strateji_matrisi_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "strateji_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_matrisi" ADD CONSTRAINT "strateji_matrisi_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_matrisi" ADD CONSTRAINT "strateji_matrisi_kitle_fkey"
  FOREIGN KEY ("kitle_sablonu_id") REFERENCES "audience_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Kelimeler ───────────────────────────────────────────────────────────
-- aylik_arama NULL = Google değer VERMEDİ; sıfır değil (sıfır göstermek
-- kelimeyi haksız yere eler). varyantlar: Google'ın aynı metrikle
-- döndürdüğü yazım varyantları; ayrı satır olsalardı hacim toplamı katlanırdı
-- (MIMARI § 4.1).
CREATE TABLE "strateji_kelimeleri" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"            UUID           NOT NULL,
  "org_id"             UUID           NOT NULL,
  "client_id"          UUID           NOT NULL,
  "kelime"             VARCHAR(80)    NOT NULL,
  "varyantlar"         TEXT[]         NOT NULL DEFAULT '{}',
  "aylik_arama"        BIGINT,
  "rekabet"            VARCHAR(8),
  "teklif_alt_micros"  BIGINT,
  "teklif_ust_micros"  BIGINT,
  "grup"               VARCHAR(80),
  "secili"             BOOLEAN        NOT NULL DEFAULT false,
  "cekim_zamani"       TIMESTAMPTZ(6) NOT NULL,
  "kaynak_istek"       JSONB          NOT NULL,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "strateji_kelimeleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strateji_kelimeleri_rekabet_chk" CHECK ("rekabet" IS NULL OR "rekabet" IN ('LOW', 'MEDIUM', 'HIGH')),
  CONSTRAINT "strateji_kelimeleri_hacim_chk" CHECK ("aylik_arama" IS NULL OR "aylik_arama" >= 0)
);
CREATE UNIQUE INDEX "strateji_kelimeleri_kelime_key" ON "strateji_kelimeleri" ("plan_id", lower("kelime"));
CREATE INDEX "strateji_kelimeleri_client_idx" ON "strateji_kelimeleri" ("client_id");
CREATE INDEX "strateji_kelimeleri_org_id_idx" ON "strateji_kelimeleri" ("org_id");
ALTER TABLE "strateji_kelimeleri" ADD CONSTRAINT "strateji_kelimeleri_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "strateji_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_kelimeleri" ADD CONSTRAINT "strateji_kelimeleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Özel günler (müşteriye bağlı DEĞİL) ─────────────────────────────────
-- SEED YOK: tablo boş kuruluyor. Kaynağı belli olmayan bir tarih listesi
-- uydurma bir uyarı üretir (Ç-4); satırlar kaynağıyla birlikte elle girilir.
CREATE TABLE "ozel_gunler" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "sektor"      VARCHAR(120)   NOT NULL,
  "ad"          VARCHAR(120)   NOT NULL,
  "baslangic"   DATE           NOT NULL,
  "bitis"       DATE           NOT NULL,
  "kaynak"      VARCHAR(200)   NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ozel_gunler_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ozel_gunler_aralik_chk" CHECK ("bitis" >= "baslangic"),
  CONSTRAINT "ozel_gunler_kaynak_chk" CHECK (length(trim("kaynak")) > 0)
);
CREATE INDEX "ozel_gunler_tarih_idx" ON "ozel_gunler" ("baslangic", "bitis");
