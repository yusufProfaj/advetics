-- PİLOT — YAPAY ZEKÂ İLE HESAP YÖNETİMİ (docs/advcampaign/MIMARI.md § 2)
--
-- Sekiz yeni tablo + clients tablosuna iki BOŞ kolon. Var olan hiçbir
-- kısıta, tipe ya da veriye dokunmuyor; üretim sırasıyla (önceki
-- migration'lar → 01_constraints.sql → eski veri → bu dosya) çakışacak bir
-- nesne yok (pilot-sema.spec.ts bu sırayı elle kurup sınıyor).
--
-- ENUM YOK, CHECK VAR. Durum listeleri shared sabitleriyle AYNI olmak
-- zorunda (PILOT_PLAN_DURUMLARI, KURULUM_SATIR_DURUMLARI, NESNE_DURUMLARI,
-- ONERI_DURUMLARI, ONERI_TURLERI); pilot-sema.spec.ts ikisini
-- karşılaştırıyor. Yeni durum = CHECK'i değiştiren tek ALTER; enum'a değer
-- eklemek ayrı migration, çıkarmak tip takası isterdi (CLAUDE.md).
--
-- Her tablo org_id + client_id taşıyor (RLS join'siz) ve kompozit FK
-- (client_id, org_id) → clients(id, org_id). org_id HEDEF MÜŞTERİDEN
-- yazılıyor; "tüm şirketler" modunda ctx.orgId ev şirketi kalıyor.

-- ── Özel kategori beyanı (Ç-2: workspace başına BİR KEZ) ─────────────────
-- special_ad_categories boş dizi iki şey demek olabiliyordu: "Hayır,
-- hiçbiri" ve "hiç sorulmadı". İkisini aynı boş diziye çevirmek beyansız
-- konut reklamı üretir (kabul listesi B-13). Beyan zamanı NULL = sorulmadı;
-- dolu = kategoriler (boş dahil) bir kişinin cevabı.
ALTER TABLE "clients" ADD COLUMN "ozel_kategori_beyan_zamani" TIMESTAMPTZ(6);
ALTER TABLE "clients" ADD COLUMN "ozel_kategori_beyan_eden" UUID;
ALTER TABLE "clients" ADD CONSTRAINT "clients_ozel_kategori_beyan_eden_fkey"
  FOREIGN KEY ("ozel_kategori_beyan_eden") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Plan ────────────────────────────────────────────────────────────────
CREATE TABLE "pilot_planlari" (
  "id"                     UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"                 UUID           NOT NULL,
  "client_id"              UUID           NOT NULL,
  "donem"                  CHAR(7)        NOT NULL,
  "durum"                  VARCHAR(16)    NOT NULL DEFAULT 'taslak',
  "surum"                  INTEGER        NOT NULL DEFAULT 1,
  -- Güncel sürümün içerik özeti (SHA-256): onay isteği bununla karşılaştırılır.
  "icerik_ozeti"           CHAR(64)       NOT NULL,
  -- Plan üretilemediyse (bütçe yok) para birimi ve toplam boş olabilir;
  -- boş plan da bir kayıt: ekran "neden boş" der.
  "para_birimi"            CHAR(3),
  "toplam_micros"          BIGINT,
  "aylik_butce_id"         UUID,
  -- Onay izi. Onaylanan şey sürümün ÖZETİ; onaydan sonra değişmez (trigger).
  "onaylanan_surum"        INTEGER,
  "onaylanan_ozet"         CHAR(64),
  "onay_rolu"              VARCHAR(7),
  "onaylayan_user_id"      UUID,
  "onay_zamani"            TIMESTAMPTZ(6),
  "musteri_adina_gerekce"  VARCHAR(1000),
  "onay_denetim_id"        UUID,
  -- Onayda yazılır; sonra YALNIZ test/kapali → gercek yönünde değişebilir
  -- (S-6: uyum sonradan bağlanınca "Şimdi kur"). Trigger dayatıyor.
  "yayin_kipi"             VARCHAR(6),
  "musteri_notu"           VARCHAR(1000),
  -- Elle ya da "değiştir" cümlesiyle değişti mi: "yeniden hazırla" bunları
  -- SESSİZCE ezmesin, önce sorsun (kabul listesi I-05).
  "elle_degisti"           BOOLEAN        NOT NULL DEFAULT false,
  "created_by"             UUID,
  "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_planlari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_planlari_id_client_key" UNIQUE ("id", "client_id"),
  CONSTRAINT "pilot_planlari_donem_chk" CHECK ("donem" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  CONSTRAINT "pilot_planlari_durum_chk" CHECK ("durum" IN (
    'taslak', 'musteride', 'onaylandi', 'kuruluyor', 'kismen_kuruldu', 'kuruldu', 'kapatildi', 'iptal'
  )),
  CONSTRAINT "pilot_planlari_surum_chk" CHECK ("surum" >= 1),
  CONSTRAINT "pilot_planlari_ozet_chk" CHECK ("icerik_ozeti" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "pilot_planlari_birim_chk" CHECK ("para_birimi" IS NULL OR "para_birimi" ~ '^[A-Z]{3}$'),
  CONSTRAINT "pilot_planlari_toplam_chk" CHECK ("toplam_micros" IS NULL OR "toplam_micros" >= 0),
  CONSTRAINT "pilot_planlari_onay_rolu_chk" CHECK ("onay_rolu" IS NULL OR "onay_rolu" IN ('musteri', 'ajans')),
  CONSTRAINT "pilot_planlari_kip_chk" CHECK ("yayin_kipi" IS NULL OR "yayin_kipi" IN ('gercek', 'test', 'kapali')),
  -- Onaydan sonraki her durum onayın izini TAŞIR: izsiz bir "kuruldu" kimin
  -- neye evet dediğini kaybeder ve para harcayan bir olayın sahibi kalmaz.
  -- Onaylayan kullanıcı silinebilir (SET NULL), o yüzden kimlik değil rol +
  -- zaman + sürüm + özet + kip zorunlu.
  CONSTRAINT "pilot_planlari_onay_izi_chk" CHECK (
    "durum" NOT IN ('onaylandi', 'kuruluyor', 'kismen_kuruldu', 'kuruldu', 'kapatildi')
    OR ("onay_rolu" IS NOT NULL AND "onay_zamani" IS NOT NULL AND "onaylanan_surum" IS NOT NULL
        AND "onaylanan_ozet" IS NOT NULL AND "yayin_kipi" IS NOT NULL)
  ),
  -- Ajans müşteri adına onayladıysa gerekçe zorunlu (S-1; MUSTERI_ADINA_GEREKCE_EN_AZ).
  CONSTRAINT "pilot_planlari_gerekce_chk" CHECK (
    "onay_rolu" IS DISTINCT FROM 'ajans' OR char_length(btrim("musteri_adina_gerekce")) >= 20
  )
);
-- AÇIK PLAN TEKİL: son olmayan her durum kapsamda ve her birinin çıkışı var
-- (kismen_kuruldu → kapat dahil, sozlesme.spec.ts). Çıkışsız bir ara durum
-- o ay için kalıcı kilit olurdu (boost "active" dersi).
CREATE UNIQUE INDEX "pilot_planlari_acik_donem_key" ON "pilot_planlari" ("client_id", "donem")
  WHERE "durum" NOT IN ('kuruldu', 'kapatildi', 'iptal');
CREATE INDEX "pilot_planlari_client_idx" ON "pilot_planlari" ("client_id", "donem" DESC);
CREATE INDEX "pilot_planlari_org_id_idx" ON "pilot_planlari" ("org_id");
ALTER TABLE "pilot_planlari" ADD CONSTRAINT "pilot_planlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_planlari" ADD CONSTRAINT "pilot_planlari_butce_fkey"
  FOREIGN KEY ("aylik_butce_id") REFERENCES "monthly_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pilot_planlari" ADD CONSTRAINT "pilot_planlari_onaylayan_fkey"
  FOREIGN KEY ("onaylayan_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pilot_planlari" ADD CONSTRAINT "pilot_planlari_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ONAY DEĞİŞMEZ. Onaylanan sürüm/özet/rol/zaman bir kez yazılır; yayın kipi
-- yalnız gerçeğe doğru güncellenebilir (S-6). RLS yetmiyor: worker
-- BYPASSRLS ile koşuyor.
CREATE OR REPLACE FUNCTION pilot_planlari_onay_kilidi() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."onaylanan_ozet" IS NOT NULL AND (
       NEW."onaylanan_ozet" IS DISTINCT FROM OLD."onaylanan_ozet"
    OR NEW."onaylanan_surum" IS DISTINCT FROM OLD."onaylanan_surum"
    OR NEW."onay_rolu" IS DISTINCT FROM OLD."onay_rolu"
    OR NEW."onay_zamani" IS DISTINCT FROM OLD."onay_zamani"
    OR NEW."musteri_adina_gerekce" IS DISTINCT FROM OLD."musteri_adina_gerekce") THEN
    RAISE EXCEPTION 'pilot_planlari onay izi degismez';
  END IF;
  IF OLD."yayin_kipi" IS NOT NULL AND NEW."yayin_kipi" IS DISTINCT FROM OLD."yayin_kipi"
     AND NOT (OLD."yayin_kipi" IN ('test', 'kapali') AND NEW."yayin_kipi" = 'gercek') THEN
    RAISE EXCEPTION 'pilot_planlari yayin_kipi yalniz gercege dogru degisir';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "pilot_planlari_onay_kilidi_trg"
  BEFORE UPDATE ON "pilot_planlari"
  FOR EACH ROW EXECUTE FUNCTION pilot_planlari_onay_kilidi();

-- ── Plan sürümleri (DEĞİŞMEZ) ───────────────────────────────────────────
CREATE TABLE "pilot_plan_surumleri" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"       UUID           NOT NULL,
  "org_id"        UUID           NOT NULL,
  "client_id"     UUID           NOT NULL,
  "surum"         INTEGER        NOT NULL,
  -- PlanOnerisi; planOnerisiSchema ile YAZILIR ve OKUNUR (kaynaksız hücre geçmez).
  "icerik"        JSONB          NOT NULL,
  "icerik_ozeti"  CHAR(64)       NOT NULL,
  "kaynak"        VARCHAR(16)    NOT NULL,
  -- "Değiştir" kutusuna yazılan cümle: sayının kullanıcının cümlesinde
  -- geçtiğinin kanıtı (yapay zekâ çevirisi bu cümleyle doğrulandı).
  "cumle"         VARCHAR(500),
  "yazan"         UUID,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_plan_surumleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_plan_surumleri_kaynak_chk" CHECK ("kaynak" IN ('uretici', 'degisiklik', 'yeniden_hazirla')),
  CONSTRAINT "pilot_plan_surumleri_ozet_chk" CHECK ("icerik_ozeti" ~ '^[0-9a-f]{64}$')
);
CREATE UNIQUE INDEX "pilot_plan_surumleri_surum_key" ON "pilot_plan_surumleri" ("plan_id", "surum");
CREATE INDEX "pilot_plan_surumleri_client_idx" ON "pilot_plan_surumleri" ("client_id");
CREATE INDEX "pilot_plan_surumleri_org_id_idx" ON "pilot_plan_surumleri" ("org_id");
ALTER TABLE "pilot_plan_surumleri" ADD CONSTRAINT "pilot_plan_surumleri_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "pilot_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_plan_surumleri" ADD CONSTRAINT "pilot_plan_surumleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_plan_surumleri" ADD CONSTRAINT "pilot_plan_surumleri_yazan_fkey"
  FOREIGN KEY ("yazan") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- İçerik kolonları kilitli; client_id/org_id HARİÇ (workspace taşıması).
-- yazan HARİÇ: kullanıcı silinince SET NULL bu trigger'dan geçmek zorunda.
CREATE OR REPLACE FUNCTION pilot_plan_surumleri_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."plan_id" IS DISTINCT FROM OLD."plan_id"
     OR NEW."surum" IS DISTINCT FROM OLD."surum"
     OR NEW."icerik" IS DISTINCT FROM OLD."icerik"
     OR NEW."icerik_ozeti" IS DISTINCT FROM OLD."icerik_ozeti"
     OR NEW."kaynak" IS DISTINCT FROM OLD."kaynak"
     OR NEW."cumle" IS DISTINCT FROM OLD."cumle"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'pilot_plan_surumleri degismez: yeni surum yazilmali';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "pilot_plan_surumleri_degismez_trg"
  BEFORE UPDATE ON "pilot_plan_surumleri"
  FOR EACH ROW EXECUTE FUNCTION pilot_plan_surumleri_degismez();

-- ── Uyum denetimleri (DEĞİŞMEZ uyum raporu, TASARIM § 10.9) ─────────────
CREATE TABLE "pilot_uyum_denetimleri" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"         UUID           NOT NULL,
  "org_id"          UUID           NOT NULL,
  "client_id"       UUID           NOT NULL,
  "surum"           INTEGER        NOT NULL,
  "icerik_ozeti"    CHAR(64)       NOT NULL,
  "katalog_surumu"  VARCHAR(16)    NOT NULL,
  -- 'plan' = onay öncesi; 'taslak' = kurulum satırının prova öncesi kapısı.
  "an"              VARCHAR(8)     NOT NULL,
  "satir_anahtari"  VARCHAR(200),
  "bulgular"        JSONB          NOT NULL,
  -- Denetimin baktığı profil (o anki değer, bağlantı değil: § 10.1.1).
  "profil"          JSONB          NOT NULL,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_uyum_denetimleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_uyum_denetimleri_an_chk" CHECK ("an" IN ('plan', 'taslak')),
  CONSTRAINT "pilot_uyum_denetimleri_satir_chk" CHECK (("an" = 'plan') = ("satir_anahtari" IS NULL))
);
CREATE INDEX "pilot_uyum_denetimleri_plan_idx" ON "pilot_uyum_denetimleri" ("plan_id", "surum", "created_at" DESC);
CREATE INDEX "pilot_uyum_denetimleri_client_idx" ON "pilot_uyum_denetimleri" ("client_id");
CREATE INDEX "pilot_uyum_denetimleri_org_id_idx" ON "pilot_uyum_denetimleri" ("org_id");
ALTER TABLE "pilot_uyum_denetimleri" ADD CONSTRAINT "pilot_uyum_denetimleri_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "pilot_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_uyum_denetimleri" ADD CONSTRAINT "pilot_uyum_denetimleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_planlari" ADD CONSTRAINT "pilot_planlari_onay_denetim_fkey"
  FOREIGN KEY ("onay_denetim_id") REFERENCES "pilot_uyum_denetimleri"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION pilot_uyum_denetimleri_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."plan_id" IS DISTINCT FROM OLD."plan_id"
     OR NEW."surum" IS DISTINCT FROM OLD."surum"
     OR NEW."icerik_ozeti" IS DISTINCT FROM OLD."icerik_ozeti"
     OR NEW."katalog_surumu" IS DISTINCT FROM OLD."katalog_surumu"
     OR NEW."an" IS DISTINCT FROM OLD."an"
     OR NEW."satir_anahtari" IS DISTINCT FROM OLD."satir_anahtari"
     OR NEW."bulgular" IS DISTINCT FROM OLD."bulgular"
     OR NEW."profil" IS DISTINCT FROM OLD."profil"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'pilot_uyum_denetimleri degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "pilot_uyum_denetimleri_degismez_trg"
  BEFORE UPDATE ON "pilot_uyum_denetimleri"
  FOR EACH ROW EXECUTE FUNCTION pilot_uyum_denetimleri_degismez();

-- ── Uyum işaretleri ("Okudum, sorumluluk bende") ────────────────────────
-- İşaret MESAJLA birlikte saklanır: metin değişirse işaret düşer (uyumDurumu
-- mesaja bakıyor). Yalnız ajans rolü yazar (servis kapısı).
CREATE TABLE "pilot_uyum_isaretleri" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"        UUID           NOT NULL,
  "org_id"         UUID           NOT NULL,
  "client_id"      UUID           NOT NULL,
  "surum"          INTEGER        NOT NULL,
  "kural_kimligi"  VARCHAR(16)    NOT NULL,
  "mesaj"          VARCHAR(600)   NOT NULL,
  "user_id"        UUID,
  "zaman"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_uyum_isaretleri_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "pilot_uyum_isaretleri_kural_key" ON "pilot_uyum_isaretleri" ("plan_id", "surum", "kural_kimligi");
CREATE INDEX "pilot_uyum_isaretleri_client_idx" ON "pilot_uyum_isaretleri" ("client_id");
CREATE INDEX "pilot_uyum_isaretleri_org_id_idx" ON "pilot_uyum_isaretleri" ("org_id");
ALTER TABLE "pilot_uyum_isaretleri" ADD CONSTRAINT "pilot_uyum_isaretleri_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "pilot_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_uyum_isaretleri" ADD CONSTRAINT "pilot_uyum_isaretleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_uyum_isaretleri" ADD CONSTRAINT "pilot_uyum_isaretleri_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Kurulum satırları ───────────────────────────────────────────────────
-- TEKİL (plan, onaylanan sürüm, satır anahtarı): yarıda düşen kurulum
-- tekrar denendiğinde açılmış satır İKİNCİ KEZ açılmaz (mükerrer kampanya =
-- para). kurulum_kimligi derleyicinin adv-yayin etiketine giriyor; uzlaştırma
-- ve tekillik kapısı Meta'da bu etiketle arıyor.
CREATE TABLE "pilot_kurulum_satirlari" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "plan_id"          UUID           NOT NULL,
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "onaylanan_surum"  INTEGER        NOT NULL,
  "satir_anahtari"   VARCHAR(200)   NOT NULL,
  "platform"         VARCHAR(6)     NOT NULL,
  "ad"               VARCHAR(200)   NOT NULL,
  "durum"            VARCHAR(24)    NOT NULL DEFAULT 'taslak',
  "kurulum_kimligi"  UUID           NOT NULL DEFAULT gen_random_uuid(),
  "taslak"           JSONB,
  "taslak_ozeti"     CHAR(64),
  "eksikler"         JSONB          NOT NULL DEFAULT '[]',
  "prova"            JSONB,
  "prova_zamani"     TIMESTAMPTZ(6),
  -- Düşen/farklı satırda PLATFORMUN KENDİ mesajı ("beklenmeyen hata" değil).
  "platform_mesaji"  VARCHAR(2000),
  "farklar"          JSONB          NOT NULL DEFAULT '[]',
  "deneme"           INTEGER        NOT NULL DEFAULT 0,
  "ad_account_id"    UUID,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_kurulum_satirlari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_kurulum_satirlari_id_client_key" UNIQUE ("id", "client_id"),
  CONSTRAINT "pilot_kurulum_satirlari_platform_chk" CHECK ("platform" IN ('meta', 'google')),
  CONSTRAINT "pilot_kurulum_satirlari_durum_chk" CHECK ("durum" IN (
    'taslak', 'prova', 'prova_dustu', 'kuruluyor', 'kayit_belirsiz', 'geri_okundu_ayni', 'fark_var',
    'aciliyor', 'acildi', 'duraklatilmis_kuruldu', 'test_kipinde_kuruldu', 'kurulmadi_kapali', 'dustu'
  )),
  CONSTRAINT "pilot_kurulum_satirlari_deneme_chk" CHECK ("deneme" >= 0)
);
CREATE UNIQUE INDEX "pilot_kurulum_satirlari_satir_key" ON "pilot_kurulum_satirlari" ("plan_id", "onaylanan_surum", "satir_anahtari");
CREATE INDEX "pilot_kurulum_satirlari_hesap_idx" ON "pilot_kurulum_satirlari" ("ad_account_id");
CREATE INDEX "pilot_kurulum_satirlari_client_idx" ON "pilot_kurulum_satirlari" ("client_id");
CREATE INDEX "pilot_kurulum_satirlari_org_id_idx" ON "pilot_kurulum_satirlari" ("org_id");
ALTER TABLE "pilot_kurulum_satirlari" ADD CONSTRAINT "pilot_kurulum_satirlari_plan_fkey"
  FOREIGN KEY ("plan_id", "client_id") REFERENCES "pilot_planlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_kurulum_satirlari" ADD CONSTRAINT "pilot_kurulum_satirlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_kurulum_satirlari" ADD CONSTRAINT "pilot_kurulum_satirlari_hesap_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Platform nesneleri (yayin_nesnesi deseni) ───────────────────────────
-- derlenmis_govde DEĞİŞMEZ: Meta'ya ne gönderildiğinin tek kanıtı. Medya
-- satırında gövde yok (NULL).
CREATE TABLE "pilot_nesneleri" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  "kurulum_satir_id"  UUID           NOT NULL,
  "org_id"            UUID           NOT NULL,
  "client_id"         UUID           NOT NULL,
  "tur"               VARCHAR(12)    NOT NULL,
  "ad"                VARCHAR(64)    NOT NULL,
  "sira"              INTEGER        NOT NULL,
  "platform_kimligi"  VARCHAR(64),
  "durum"             VARCHAR(14)    NOT NULL DEFAULT 'bekliyor',
  "derlenmis_govde"   JSONB,
  "beklenen_yanki"    JSONB          NOT NULL DEFAULT '[]',
  "son_hata"          JSONB,
  "deneme"            INTEGER        NOT NULL DEFAULT 0,
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_nesneleri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_nesneleri_tur_chk" CHECK ("tur" IN ('medya', 'form', 'kampanya', 'reklam_seti', 'kreatif', 'reklam')),
  CONSTRAINT "pilot_nesneleri_durum_chk" CHECK ("durum" IN ('bekliyor', 'gonderiliyor', 'kuruldu', 'reddedildi', 'belirsiz', 'acildi', 'arsivlendi'))
);
CREATE UNIQUE INDEX "pilot_nesneleri_ad_key" ON "pilot_nesneleri" ("kurulum_satir_id", "ad");
CREATE INDEX "pilot_nesneleri_client_idx" ON "pilot_nesneleri" ("client_id");
CREATE INDEX "pilot_nesneleri_org_id_idx" ON "pilot_nesneleri" ("org_id");
ALTER TABLE "pilot_nesneleri" ADD CONSTRAINT "pilot_nesneleri_satir_fkey"
  FOREIGN KEY ("kurulum_satir_id", "client_id") REFERENCES "pilot_kurulum_satirlari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_nesneleri" ADD CONSTRAINT "pilot_nesneleri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION pilot_nesneleri_govde_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."derlenmis_govde" IS DISTINCT FROM OLD."derlenmis_govde"
     OR NEW."beklenen_yanki" IS DISTINCT FROM OLD."beklenen_yanki"
     OR NEW."tur" IS DISTINCT FROM OLD."tur"
     OR NEW."ad" IS DISTINCT FROM OLD."ad"
     OR NEW."kurulum_satir_id" IS DISTINCT FROM OLD."kurulum_satir_id" THEN
    RAISE EXCEPTION 'pilot_nesneleri govdesi degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "pilot_nesneleri_govde_degismez_trg"
  BEFORE UPDATE ON "pilot_nesneleri"
  FOR EACH ROW EXECUTE FUNCTION pilot_nesneleri_govde_degismez();

-- ── Taramalar (Tur 2'nin işi; tablo şimdi, boş) ─────────────────────────
-- durum + kart_sayisi AYRI: "hiç taranmadı", "taradı, öneri yok" ve
-- "tarama düştü" üç farklı iş (succeeded + 0 satır bu projede bir hata türü).
CREATE TABLE "pilot_taramalari" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"         UUID           NOT NULL,
  "client_id"      UUID           NOT NULL,
  "ad_account_id"  UUID,
  "durum"          VARCHAR(10)    NOT NULL DEFAULT 'calisiyor',
  "baslangic"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "bitis"          TIMESTAMPTZ(6),
  "taranan"        JSONB          NOT NULL DEFAULT '{}',
  "kart_sayisi"    INTEGER        NOT NULL DEFAULT 0,
  "notu"           VARCHAR(1000),

  CONSTRAINT "pilot_taramalari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_taramalari_id_client_key" UNIQUE ("id", "client_id"),
  CONSTRAINT "pilot_taramalari_durum_chk" CHECK ("durum" IN ('calisiyor', 'bitti', 'dustu')),
  CONSTRAINT "pilot_taramalari_kart_chk" CHECK ("kart_sayisi" >= 0)
);
CREATE INDEX "pilot_taramalari_client_idx" ON "pilot_taramalari" ("client_id", "baslangic" DESC);
CREATE INDEX "pilot_taramalari_org_id_idx" ON "pilot_taramalari" ("org_id");
CREATE INDEX "pilot_taramalari_hesap_idx" ON "pilot_taramalari" ("ad_account_id");
ALTER TABLE "pilot_taramalari" ADD CONSTRAINT "pilot_taramalari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_taramalari" ADD CONSTRAINT "pilot_taramalari_hesap_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Öneriler ────────────────────────────────────────────────────────────
CREATE TABLE "pilot_onerileri" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  "tarama_id"         UUID           NOT NULL,
  "org_id"            UUID           NOT NULL,
  "client_id"         UUID           NOT NULL,
  "ad_account_id"     UUID,
  "tur"               VARCHAR(24)    NOT NULL,
  "hedef_seviye"      VARCHAR(14)    NOT NULL,
  "hedef_nesne_id"    UUID           NOT NULL,
  "hedef"             JSONB          NOT NULL,
  "neden"             VARCHAR(600)   NOT NULL,
  "olculer"           JSONB          NOT NULL,
  "beklenen_etki"     JSONB          NOT NULL,
  "eylem"             JSONB          NOT NULL,
  "geri_alma"         JSONB          NOT NULL,
  "durum"             VARCHAR(16)    NOT NULL DEFAULT 'yeni',
  "gecerlilik_sonu"   TIMESTAMPTZ(6) NOT NULL,
  "platform_mesaji"   VARCHAR(2000),
  "uygulayan"         UUID,
  "uygulama_zamani"   TIMESTAMPTZ(6),
  "geri_alan"         UUID,
  "geri_alma_zamani"  TIMESTAMPTZ(6),
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "pilot_onerileri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pilot_onerileri_tur_chk" CHECK ("tur" IN ('harcayip_donusmeyen', 'yorulan_kreatif', 'negatif_aday_terim', 'butce_hizi_sapmasi')),
  CONSTRAINT "pilot_onerileri_seviye_chk" CHECK ("hedef_seviye" IN ('kampanya', 'reklam_seti', 'reklam', 'arama_terimi')),
  CONSTRAINT "pilot_onerileri_durum_chk" CHECK ("durum" IN (
    'yeni', 'uygulaniyor', 'sonuc_belirsiz', 'uygulandi', 'geri_aliniyor', 'gecildi', 'bayat', 'geri_alindi'
  ))
);
-- Hedef + tür başına TEK AÇIK kart (ONERI_ACIK_DURUMLARI). Her açık durumun
-- çıkışını worker ya da kişi yazıyor; çıkışsız durum kalıcı kilit olurdu.
CREATE UNIQUE INDEX "pilot_onerileri_acik_key" ON "pilot_onerileri" ("hedef_nesne_id", "tur")
  WHERE "durum" IN ('yeni', 'uygulaniyor', 'sonuc_belirsiz', 'geri_aliniyor');
CREATE INDEX "pilot_onerileri_client_idx" ON "pilot_onerileri" ("client_id", "durum", "created_at" DESC);
CREATE INDEX "pilot_onerileri_org_id_idx" ON "pilot_onerileri" ("org_id");
CREATE INDEX "pilot_onerileri_hesap_idx" ON "pilot_onerileri" ("ad_account_id");
ALTER TABLE "pilot_onerileri" ADD CONSTRAINT "pilot_onerileri_tarama_fkey"
  FOREIGN KEY ("tarama_id", "client_id") REFERENCES "pilot_taramalari"("id", "client_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_onerileri" ADD CONSTRAINT "pilot_onerileri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pilot_onerileri" ADD CONSTRAINT "pilot_onerileri_hesap_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pilot_onerileri" ADD CONSTRAINT "pilot_onerileri_uygulayan_fkey"
  FOREIGN KEY ("uygulayan") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pilot_onerileri" ADD CONSTRAINT "pilot_onerileri_geri_alan_fkey"
  FOREIGN KEY ("geri_alan") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
