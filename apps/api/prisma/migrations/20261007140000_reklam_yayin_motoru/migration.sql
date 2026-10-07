-- YENİ REKLAM MODÜLÜ — YAYIN MOTORU TABLOLARI
--
-- docs/meta-reklam-brief/tasarim/TASARIM.md § 11, § 16.2.4.
-- Durum listeleri packages/shared/src/reklam/yayin.ts sabitlerinden;
-- reklam-yayin.spec.ts ikisini karşılaştırıyor.

CREATE TABLE "yayin" (
  "id"                  UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"              UUID           NOT NULL,
  "client_id"           UUID           NOT NULL,
  "taslak_id"           UUID           NOT NULL,
  "taslak_surum_no"     INTEGER        NOT NULL,
  "icerik_ozeti"        CHAR(64)       NOT NULL,
  "ad_account_id"       UUID,
  "durum"               VARCHAR(20)    NOT NULL DEFAULT 'on_kontrol',
  "onceki_durum"        VARCHAR(20),
  "durum_at"            TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  -- Son geçişin insan okuyacağı sebebi (Meta'nın mesajı dahil).
  "sebep"               VARCHAR(2000),
  "derlenmis_govde"     JSONB          NOT NULL,
  "beklenen_yanki"      JSONB          NOT NULL,
  "api_surumu"          VARCHAR(8)     NOT NULL,
  "derleyici_surumu"    VARCHAR(16)    NOT NULL,
  "atif_standardi"      VARCHAR(16)    NOT NULL,
  "kaynak"              VARCHAR(12)    NOT NULL,
  -- Canlı tur: tekillik kapısından sonra açma yerine arşiv.
  "test_kipi"           BOOLEAN        NOT NULL DEFAULT false,
  "baslatan_id"         UUID           NOT NULL,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  -- TEK YAZAN: yayiniSonlandir(). Kısmi tekil indeksin yüklemi bu kolona
  -- bağlı, bir durum listesine DEĞİL: listeye bağlı bir yüklem, o durumdan
  -- çıkışı kimse yazmazsa taslağı kalıcı kilitler (boost_active_post_uniq).
  "sonlandi_at"         TIMESTAMPTZ(6),
  "sonlanma_sebebi"     VARCHAR(24),

  CONSTRAINT "yayin_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "yayin_durum_chk" CHECK ("durum" IN (
    'on_kontrol', 'medya', 'kuruluyor', 'uzlastirma', 'sonuc_belirsiz', 'kayit_belirsiz',
    'kurulamadi', 'geri_okuma', 'fark_var', 'dogrulanamadi', 'tekillik_kapisi', 'aciliyor',
    'kismen_acik', 'iletildi', 'incelemede', 'ogreniyor', 'yayinda', 'sorunlu', 'bekletildi',
    'durduruldu', 'arsivlendi', 'kapali_kuruldu')),
  CONSTRAINT "yayin_kaynak_chk" CHECK ("kaynak" IN ('panel', 'ai_kart', 'kopya', 'toplu')),
  CONSTRAINT "yayin_sonlanma_chk" CHECK (
    ("sonlandi_at" IS NULL) = ("sonlanma_sebebi" IS NULL)
    AND ("sonlanma_sebebi" IS NULL OR "sonlanma_sebebi" IN
      ('on_kontrol_reddi', 'geri_alindi', 'yeniden_kurulacak', 'kapali_kuruldu'))
  ),
  CONSTRAINT "yayin_ozet_chk" CHECK ("icerik_ozeti" ~ '^[0-9a-f]{64}$')
);

-- TASLAK BAŞINA TEK AKTİF YAYIN — çift tıklamanın ASIL koruması.
CREATE UNIQUE INDEX "yayin_taslak_aktif_key" ON "yayin" ("taslak_id") WHERE "sonlandi_at" IS NULL;
CREATE INDEX "yayin_client_durum_idx" ON "yayin" ("client_id", "durum");
CREATE INDEX "yayin_org_id_idx" ON "yayin" ("org_id");

ALTER TABLE "yayin" ADD CONSTRAINT "yayin_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Taslak silinmiyor (arşivleniyor); RESTRICT, yayın kaydının ebeveynsiz
-- kalmasını engelliyor.
ALTER TABLE "yayin" ADD CONSTRAINT "yayin_taslak_fkey"
  FOREIGN KEY ("taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "yayin" ADD CONSTRAINT "yayin_ad_account_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "yayin" ADD CONSTRAINT "yayin_baslatan_fkey"
  FOREIGN KEY ("baslatan_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Derlenmiş gövde ve beklenen yankı DEĞİŞMEZ: geri okuma, kurulumu yapan
-- derleyicinin çıktısıyla karşılaştırılıyor; sonradan değişebilseydi fark
-- ekranı yalan söylerdi. Durum ve sonlanma kolonları serbest.
CREATE OR REPLACE FUNCTION yayin_govde_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."derlenmis_govde" IS DISTINCT FROM OLD."derlenmis_govde"
     OR NEW."beklenen_yanki" IS DISTINCT FROM OLD."beklenen_yanki"
     OR NEW."taslak_id" IS DISTINCT FROM OLD."taslak_id"
     OR NEW."taslak_surum_no" IS DISTINCT FROM OLD."taslak_surum_no"
     OR NEW."icerik_ozeti" IS DISTINCT FROM OLD."icerik_ozeti"
     OR NEW."api_surumu" IS DISTINCT FROM OLD."api_surumu"
     OR NEW."derleyici_surumu" IS DISTINCT FROM OLD."derleyici_surumu"
     OR NEW."atif_standardi" IS DISTINCT FROM OLD."atif_standardi" THEN
    RAISE EXCEPTION 'yayin govdesi degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "yayin_govde_degismez_trg" BEFORE UPDATE ON "yayin"
  FOR EACH ROW EXECUTE FUNCTION yayin_govde_degismez();

-- -----------------------------------------------------------------------------
-- yayin_nesnesi — her Meta nesnesi için NİYET KAYDI. Durum POST'tan ÖNCE
-- 'gonderiliyor' yazılır; kayıt düşerse nesne 'belirsiz' kalır, 'reddedildi'
-- DEĞİL: reddedildi yazmak halkayı yeniden denenebilir yapar ve Meta'da
-- İKİNCİ kampanya açar.
-- -----------------------------------------------------------------------------
CREATE TABLE "yayin_nesnesi" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "yayin_id"       UUID           NOT NULL,
  "org_id"         UUID           NOT NULL,
  "client_id"      UUID           NOT NULL,
  "tur"            VARCHAR(12)    NOT NULL,
  -- Derleyicideki gövde adı (`kreatif:2`); yer tutucular buna bakar.
  "ad"             VARCHAR(64)    NOT NULL,
  "sira"           INTEGER        NOT NULL,
  "istek_ozeti"    CHAR(64),
  "meta_id"        VARCHAR(64),
  "durum"          VARCHAR(14)    NOT NULL DEFAULT 'bekliyor',
  "son_hata"       JSONB,
  "deneme_sayisi"  INTEGER        NOT NULL DEFAULT 0,
  "updated_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "yayin_nesnesi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "yayin_nesnesi_tur_chk" CHECK ("tur" IN ('medya', 'form', 'kampanya', 'reklam_seti', 'kreatif', 'reklam')),
  CONSTRAINT "yayin_nesnesi_durum_chk" CHECK ("durum" IN (
    'bekliyor', 'gonderiliyor', 'kuruldu', 'reddedildi', 'belirsiz', 'acildi', 'arsivlendi')),
  -- Kurulmuş ya da açılmış nesnenin Meta kimliği OLMAK ZORUNDA.
  CONSTRAINT "yayin_nesnesi_kimlik_chk" CHECK ("durum" NOT IN ('kuruldu', 'acildi') OR "meta_id" IS NOT NULL)
);
CREATE UNIQUE INDEX "yayin_nesnesi_ad_key" ON "yayin_nesnesi" ("yayin_id", "ad");
CREATE INDEX "yayin_nesnesi_client_idx" ON "yayin_nesnesi" ("client_id");
CREATE INDEX "yayin_nesnesi_org_id_idx" ON "yayin_nesnesi" ("org_id");
ALTER TABLE "yayin_nesnesi" ADD CONSTRAINT "yayin_nesnesi_yayin_fkey"
  FOREIGN KEY ("yayin_id") REFERENCES "yayin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "yayin_nesnesi" ADD CONSTRAINT "yayin_nesnesi_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- geri_okuma — DEĞİŞMEZ; her okuma yeni satır. "Meta'da ne duruyordu"
-- sorusunun kanıtı. Ham yanıt token'SIZ saklanır.
-- -----------------------------------------------------------------------------
CREATE TABLE "geri_okuma" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "yayin_id"    UUID           NOT NULL,
  "org_id"      UUID           NOT NULL,
  "client_id"   UUID           NOT NULL,
  "sonuc"       VARCHAR(16)    NOT NULL,
  "satirlar"    JSONB          NOT NULL,
  "bilgiler"    JSONB          NOT NULL,
  "ham"         JSONB          NOT NULL,
  "api_surumu"  VARCHAR(8)     NOT NULL,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "geri_okuma_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "geri_okuma_sonuc_chk" CHECK ("sonuc" IN ('temiz', 'fark', 'dogrulanamadi'))
);
CREATE INDEX "geri_okuma_yayin_idx" ON "geri_okuma" ("yayin_id", "created_at");
CREATE INDEX "geri_okuma_client_idx" ON "geri_okuma" ("client_id");
CREATE INDEX "geri_okuma_org_id_idx" ON "geri_okuma" ("org_id");
ALTER TABLE "geri_okuma" ADD CONSTRAINT "geri_okuma_yayin_fkey"
  FOREIGN KEY ("yayin_id") REFERENCES "yayin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geri_okuma" ADD CONSTRAINT "geri_okuma_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
