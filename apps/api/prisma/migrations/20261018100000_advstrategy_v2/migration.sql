-- ADVSTRATEGY v2 — STRATEJİ KALEMLERİ, YORUMLAR, GİRİŞSİZ ONAY BAĞLANTISI
-- (docs/advstrategy/YENIDEN-TASARIM.md § 6.1, § 9.3)
--
-- VAR OLAN VE ÜRETİMDE DOLU OLABİLEN strateji_planlari DEĞİŞİYOR. Her yeni
-- kolon ya NULL'a izin veriyor ya da sabit varsayılanı var: eski (v1) satırlar
-- migration sırasında geçerli kalıyor ve hepsi bicim = 1 oluyor. Üretim
-- sırasıyla sınanıyor: advstrategy-v2-uretim-sirasi.spec.ts (önceki
-- migration'lar → 01_constraints.sql → v1 verisi → bu dosya).
--
-- KISIT DEĞİŞİKLİKLERİ "DÜŞÜR, SONRA KUR". Postgres'te CHECK'i yerinde
-- değiştirmenin yolu yok; düşürüp kurmak AYNI transaction'da (Prisma her
-- migration'ı tek transaction'da koşuyor), yani arada kısıtsız an yok.
-- Kısıtlar bir TİPE değil düz metne baktığı için tip takası dersindeki
-- (42883) tuzak burada yok.

-- ── Plan: v2 kolonları ─────────────────────────────────────────────────
ALTER TABLE "strateji_planlari"
  -- 1 = eski aylık medya planı (salt okunur), 2 = strateji. Eski satırlar 1.
  ADD COLUMN "bicim"            SMALLINT     NOT NULL DEFAULT 1,
  ADD COLUMN "baslangic"        DATE,
  ADD COLUMN "bitis"            DATE,
  -- Belge metinleri: { kod: { metin, kaynak, kim, zaman } }.
  ADD COLUMN "bolumler"         JSONB        NOT NULL DEFAULT '{}',
  -- Son "Strateji öner" girdisinin özeti: aynı girdiyle yapay zekâ ikinci
  -- kez çağrılmaz (öneri son_oneri kolonunda, v1'in kolonu).
  ADD COLUMN "oneri_imzasi"     CHAR(64),
  -- Son revizyon isteğinin metni; tam geçmiş strateji_yorumlari'nda.
  ADD COLUMN "revizyon_notu"    VARCHAR(2000),
  -- Risklerin KAYIT ANINDAKİ hâli (kalem kaydı ve onaya gönderim yazar).
  -- Müşteri onayladığı belgenin risklerini görmeli; her okumada canlı
  -- hesaplamak, onaydan sonra ölçüm değişince onaylanan belgeyi sessizce
  -- değiştirirdi (ve her okumayı platform okumasına bağlardı).
  ADD COLUMN "riskler"          JSONB        NOT NULL DEFAULT '[]',
  -- Ölçüm satırlarının aynı andaki hâli (belgenin "Ölçüm" bölümü), aynı gerekçe.
  ADD COLUMN "olcum_ozeti"      JSONB        NOT NULL DEFAULT '[]',
  -- Girişsiz onay bağlantısıyla karar verenin BEYANI (doğrulanmış kimlik
  -- değil). Panel içi onayda boş: ad users tablosundan okunuyor.
  ADD COLUMN "onaylayan_ad"     VARCHAR(120),
  ADD COLUMN "onaylayan_eposta" VARCHAR(254);

ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_bicim_chk" CHECK ("bicim" IN (1, 2));
-- v2 planın dönemi DOLU ve en çok üç ay (92 gün: üç ayın en uzunu).
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_v2_donem_chk" CHECK (
  "bicim" = 1
  OR ("baslangic" IS NOT NULL AND "bitis" IS NOT NULL AND "bitis" >= "baslangic" AND "bitis" - "baslangic" <= 92)
);

-- onay_rolu: 'baglanti' 8 karakter, kolon 7 idi. Önce kısıt düşüyor, sonra
-- tip genişliyor (genişletme veriyi yeniden yazmıyor), sonra kısıt geri.
ALTER TABLE "strateji_planlari" DROP CONSTRAINT "strateji_planlari_onay_rolu_chk";
ALTER TABLE "strateji_planlari" ALTER COLUMN "onay_rolu" TYPE VARCHAR(8);
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_onay_rolu_chk"
  CHECK ("onay_rolu" IS NULL OR "onay_rolu" IN ('musteri', 'ajans', 'baglanti'));
-- Bağlantıyla onayda ad + e-posta ZORUNLU; diğer rollerde ikisi de boş (ad
-- users tablosundan geliyor, ikinci kopya ayrışırdı).
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_beyan_chk" CHECK (
  ("onay_rolu" IS NOT DISTINCT FROM 'baglanti' AND "onaylayan_ad" IS NOT NULL AND "onaylayan_eposta" IS NOT NULL)
  OR ("onay_rolu" IS DISTINCT FROM 'baglanti' AND "onaylayan_ad" IS NULL AND "onaylayan_eposta" IS NULL)
);

-- DURUM: v1 ∪ v2. 'aktarildi' yalnız v1 (v2'de aktarım KALEM düzeyinde);
-- 'revizyon' ve 'kapandi' yalnız v2 (v1 ekranının Record tabloları onları
-- tanımıyor ve v1 satırı o durumlara hiç geçmemeli).
ALTER TABLE "strateji_planlari" DROP CONSTRAINT "strateji_planlari_durum_chk";
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_durum_chk" CHECK (
  "durum" IN ('taslak', 'onayda', 'revizyon', 'onaylandi', 'aktarildi', 'kapandi', 'iptal')
  AND ("bicim" = 1 OR "durum" <> 'aktarildi')
  AND ("bicim" = 2 OR "durum" NOT IN ('revizyon', 'kapandi'))
);
-- Onay izi kapanmış planda da durmalı: kapandi = onaylanmış ve dönemi bitmiş.
ALTER TABLE "strateji_planlari" DROP CONSTRAINT "strateji_planlari_onay_izi_chk";
ALTER TABLE "strateji_planlari" ADD CONSTRAINT "strateji_planlari_onay_izi_chk" CHECK (
  "durum" NOT IN ('onaylandi', 'aktarildi', 'kapandi')
  OR ("onay_rolu" IS NOT NULL AND "onay_zamani" IS NOT NULL AND "onaylanan_surum" IS NOT NULL)
);

-- AÇIK PLAN TEKİL İNDEKSLERİ. v1'inki (client_id, donem) yalnız v1'i
-- kapsıyor: v2 planın donem kolonu başlangıç ayı ve v1'in "onaylandi"
-- dahil kapsaması, onaylı bir v2 stratejisinin sonraki dönem planını
-- kilitlerdi. v2: workspace başına TEK AÇIK strateji; son durumlar
-- (kapandi, iptal) ve onaylandi kapsam dışı — her durumdan çıkış var.
DROP INDEX "strateji_planlari_acik_donem_key";
CREATE UNIQUE INDEX "strateji_planlari_acik_donem_key" ON "strateji_planlari" ("client_id", "donem")
  WHERE "bicim" = 1 AND "durum" IN ('taslak', 'onayda', 'onaylandi');
CREATE UNIQUE INDEX "strateji_planlari_acik_v2_key" ON "strateji_planlari" ("client_id")
  WHERE "bicim" = 2 AND "durum" IN ('taslak', 'onayda', 'revizyon');

-- ── Kalemler ────────────────────────────────────────────────────────────
-- 1 KALEM = 1 ADVCAMPAIGN REHBERİ. Amaç listesi REHBER_AMAC_KODLARI ile aynı
-- (strateji-v2-kayit.spec.ts karşılaştırıyor). Kalem kimliği kayıtta
-- KORUNUYOR (upsert): aktarılmış kalemin rehber bağı kimliğe bağlı.
-- rehber_id TEKİL: bir rehber iki kaleme bağlanamaz; aktarımın "WHERE
-- rehber_id IS NULL ... RETURNING" kapısı yarışta ikinci rehberi açtırmaz.
CREATE TABLE "strateji_kalemleri" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"            UUID           NOT NULL,
  "org_id"             UUID           NOT NULL,
  "client_id"          UUID           NOT NULL,
  "sira"               SMALLINT       NOT NULL,
  "amac"               VARCHAR(12)    NOT NULL,
  "meta_acik"          BOOLEAN        NOT NULL,
  "google_acik"        BOOLEAN        NOT NULL,
  "meta_payi"          SMALLINT,
  "butce_micros"       BIGINT         NOT NULL,
  "baslangic"          DATE           NOT NULL,
  "bitis"              DATE           NOT NULL,
  "konumlar"           JSONB          NOT NULL DEFAULT '[]',
  "yas_min"            SMALLINT,
  "yas_max"            SMALLINT,
  "metin"              JSONB,
  "kreatif_yonergesi"  JSONB,
  "kitle_tarifi"       JSONB,
  "kelime_grubu"       VARCHAR(80),
  "varlik_idleri"      UUID[]         NOT NULL DEFAULT '{}',
  -- Motorun yazdığı tahmin (platform başına); istemci yazamaz.
  "tahmin"             JSONB          NOT NULL DEFAULT '{}',
  -- Alan → kaynak (veri, marka, kural, ai, ajans); sunucunun beyanı.
  "kaynaklar"          JSONB          NOT NULL DEFAULT '{}',
  "rehber_id"          UUID,
  "aktaran_id"         UUID,
  "aktarim_zamani"     TIMESTAMPTZ(6),
  "notu"               VARCHAR(500),
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "strateji_kalemleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strateji_kalemleri_amac_chk" CHECK ("amac" IN ('SITE', 'FORM', 'WHATSAPP', 'TELEFON', 'VIDEO', 'ERISIM', 'SATIS')),
  CONSTRAINT "strateji_kalemleri_platform_chk" CHECK ("meta_acik" OR "google_acik"),
  -- `IS NOT NULL` AÇIKÇA: NULL BETWEEN … NULL döner ve CHECK NULL'ı GEÇER
  -- sayar; iki platform açık ama paysız kalem sessizce kabul ediliyordu
  -- (üretim sırası testinde yakalandı).
  CONSTRAINT "strateji_kalemleri_pay_chk" CHECK (
    ("meta_acik" AND "google_acik" AND "meta_payi" IS NOT NULL AND "meta_payi" BETWEEN 10 AND 90)
    OR (NOT ("meta_acik" AND "google_acik") AND "meta_payi" IS NULL)
  ),
  CONSTRAINT "strateji_kalemleri_butce_chk" CHECK ("butce_micros" > 0),
  CONSTRAINT "strateji_kalemleri_tarih_chk" CHECK ("bitis" >= "baslangic"),
  CONSTRAINT "strateji_kalemleri_yas_chk" CHECK (
    ("yas_min" IS NULL AND "yas_max" IS NULL)
    OR ("yas_min" IS NOT NULL AND "yas_max" IS NOT NULL
        AND "yas_min" BETWEEN 18 AND 65 AND "yas_max" BETWEEN 18 AND 65 AND "yas_min" <= "yas_max")
  ),
  CONSTRAINT "strateji_kalemleri_varlik_chk" CHECK (cardinality("varlik_idleri") <= 10),
  CONSTRAINT "strateji_kalemleri_konum_chk" CHECK (jsonb_typeof("konumlar") = 'array'),
  CONSTRAINT "strateji_kalemleri_aktarim_chk" CHECK ("rehber_id" IS NULL OR "aktarim_zamani" IS NOT NULL),
  -- Sıra kayıtta yeniden yazılıyor (sürükle-bırak); satır satır UPDATE ara
  -- durumda çakışırdı. Kısıt transaction sonunda denetleniyor.
  CONSTRAINT "strateji_kalemleri_sira_key" UNIQUE ("plan_id", "sira") DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT "strateji_kalemleri_rehber_key" UNIQUE ("rehber_id")
);
CREATE INDEX "strateji_kalemleri_client_idx" ON "strateji_kalemleri" ("client_id");
CREATE INDEX "strateji_kalemleri_org_id_idx" ON "strateji_kalemleri" ("org_id");
ALTER TABLE "strateji_kalemleri" ADD CONSTRAINT "strateji_kalemleri_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "strateji_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_kalemleri" ADD CONSTRAINT "strateji_kalemleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Rehber silinirse (yok; arşivleniyor) kalem KALIR, bağ düşer.
ALTER TABLE "strateji_kalemleri" ADD CONSTRAINT "strateji_kalemleri_rehber_fkey"
  FOREIGN KEY ("rehber_id") REFERENCES "reklam_rehberi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strateji_kalemleri" ADD CONSTRAINT "strateji_kalemleri_aktaran_fkey"
  FOREIGN KEY ("aktaran_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Yorumlar (KAYIT: değiştirilmez, silinmez) ──────────────────────────
-- Yalnız INSERT + SELECT politikası (02_rls.sql). Revizyonun NEDENİ ve
-- onayın izi burada; değiştirilebilir bir yorum, "müşteri neye itiraz
-- etti" sorusunun cevabını sonradan değiştirmek olurdu.
CREATE TABLE "strateji_yorumlari" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"     UUID           NOT NULL,
  "org_id"      UUID           NOT NULL,
  "client_id"   UUID           NOT NULL,
  "kalem_id"    UUID,
  "surum"       INTEGER        NOT NULL,
  "user_id"     UUID,
  "rol"         VARCHAR(8)     NOT NULL,
  "tur"         VARCHAR(8)     NOT NULL,
  "metin"       VARCHAR(2000)  NOT NULL,
  -- Bağlantıyla yazanın beyanı (adı); panel kullanıcısında boş.
  "yazan_ad"    VARCHAR(120),
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "strateji_yorumlari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strateji_yorumlari_rol_chk" CHECK ("rol" IN ('musteri', 'ajans', 'baglanti')),
  CONSTRAINT "strateji_yorumlari_tur_chk" CHECK ("tur" IN ('yorum', 'revizyon', 'onay')),
  CONSTRAINT "strateji_yorumlari_metin_chk" CHECK (length(trim("metin")) > 0),
  CONSTRAINT "strateji_yorumlari_beyan_chk" CHECK ("rol" <> 'baglanti' OR "yazan_ad" IS NOT NULL)
);
CREATE INDEX "strateji_yorumlari_plan_idx" ON "strateji_yorumlari" ("plan_id", "created_at");
CREATE INDEX "strateji_yorumlari_client_idx" ON "strateji_yorumlari" ("client_id");
CREATE INDEX "strateji_yorumlari_org_id_idx" ON "strateji_yorumlari" ("org_id");
ALTER TABLE "strateji_yorumlari" ADD CONSTRAINT "strateji_yorumlari_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "strateji_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_yorumlari" ADD CONSTRAINT "strateji_yorumlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_yorumlari" ADD CONSTRAINT "strateji_yorumlari_kalem_fkey"
  FOREIGN KEY ("kalem_id") REFERENCES "strateji_kalemleri"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "strateji_yorumlari" ADD CONSTRAINT "strateji_yorumlari_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Girişsiz onay bağlantıları (§ 9.3) ─────────────────────────────────
-- Ham token YOK: yalnız SHA-256 özeti. Bağlantı (plan, sürüm)a bağlı; karar
-- tek kullanımlık ve koşullu UPDATE ile tüketiliyor. Plan başına TEK AÇIK
-- bağlantı: yenisi açılırken eskiler aynı transaction'da iptal ediliyor,
-- indeks yarışta ikinci açık bağlantıyı reddediyor.
CREATE TABLE "strateji_onay_baglantilari" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"         UUID           NOT NULL,
  "org_id"          UUID           NOT NULL,
  "client_id"       UUID           NOT NULL,
  "surum"           INTEGER        NOT NULL,
  "token_hash"      CHAR(64)       NOT NULL,
  "olusturan_id"    UUID,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "son_gecerlilik"  TIMESTAMPTZ(6) NOT NULL,
  "iptal_at"        TIMESTAMPTZ(6),
  "kullanildi_at"   TIMESTAMPTZ(6),
  "karar"           VARCHAR(16),
  "karar_ad"        VARCHAR(120),
  "karar_eposta"    VARCHAR(254),

  CONSTRAINT "strateji_onay_baglantilari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "strateji_onay_baglantilari_token_key" UNIQUE ("token_hash"),
  CONSTRAINT "strateji_onay_baglantilari_hash_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "strateji_onay_baglantilari_karar_chk" CHECK ("karar" IS NULL OR "karar" IN ('onayla', 'revizyon_iste')),
  -- Kullanılmış bağlantı kararın TAMAMINI taşır; yarım iz "kim neye evet
  -- dedi" sorusunu cevapsız bırakır.
  CONSTRAINT "strateji_onay_baglantilari_kullanim_chk" CHECK (
    ("kullanildi_at" IS NULL AND "karar" IS NULL AND "karar_ad" IS NULL AND "karar_eposta" IS NULL)
    OR ("kullanildi_at" IS NOT NULL AND "karar" IS NOT NULL AND "karar_ad" IS NOT NULL AND "karar_eposta" IS NOT NULL)
  ),
  -- Süresiz bağlantı YOK (rapor paylaşımından farkı); en çok 30 gün.
  CONSTRAINT "strateji_onay_baglantilari_sure_chk" CHECK (
    "son_gecerlilik" > "created_at" AND "son_gecerlilik" <= "created_at" + interval '30 days 1 minute'
  )
);
CREATE UNIQUE INDEX "strateji_onay_baglantilari_acik_key" ON "strateji_onay_baglantilari" ("plan_id")
  WHERE "iptal_at" IS NULL AND "kullanildi_at" IS NULL;
CREATE INDEX "strateji_onay_baglantilari_client_idx" ON "strateji_onay_baglantilari" ("client_id");
CREATE INDEX "strateji_onay_baglantilari_org_id_idx" ON "strateji_onay_baglantilari" ("org_id");
ALTER TABLE "strateji_onay_baglantilari" ADD CONSTRAINT "strateji_onay_baglantilari_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "strateji_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_onay_baglantilari" ADD CONSTRAINT "strateji_onay_baglantilari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "strateji_onay_baglantilari" ADD CONSTRAINT "strateji_onay_baglantilari_olusturan_fkey"
  FOREIGN KEY ("olusturan_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
