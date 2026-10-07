-- YENİ REKLAM MODÜLÜ — TASLAK ÇEKİRDEĞİ VE AJANS AYARI
--
-- docs/meta-reklam-brief/tasarim/TASARIM.md § 16.2.1, 16.2.3.
--
-- Eski taslak tablolarından (ad_drafts, draft_campaigns ...) AYRI: yeni modül
-- eskiye bağlanmıyor ve eskiler Aşama 7'de kalkacak.
--
-- CHECK listeleri packages/shared/src/reklam/taslak.ts sabitlerinden;
-- reklam-taslak-tablolari.spec.ts ikisini karşılaştırıyor.

CREATE TABLE "reklam_taslagi" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "platform"         "Platform"     NOT NULL,
  -- NULL olabilir: hesap henüz seçilmedi ya da atama kalktı. Atama kalkınca
  -- taslak ÖLMEZ, eksik listesi "hesap artık bu workspace'te değil" der.
  "ad_account_id"    UUID,
  "niyet_kodu"       VARCHAR(32),
  "butce_seviyesi"   VARCHAR(12)    NOT NULL DEFAULT 'kampanya',
  "durum"            VARCHAR(16)    NOT NULL DEFAULT 'taslak',
  "onay_turu"        VARCHAR(20),
  "aktif_surum_no"   INTEGER        NOT NULL DEFAULT 0,
  "olusturan_yuz"    VARCHAR(12)    NOT NULL,
  "kaynak_taslak_id" UUID,
  -- İsteğin kaydı, reklamın içeriği DEĞİL: içerik özetine girmez.
  "asil_cumle"       VARCHAR(2000),
  "olusturan_id"     UUID           NOT NULL,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "arsivlendi_at"    TIMESTAMPTZ(6),

  CONSTRAINT "reklam_taslagi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reklam_taslagi_durum_chk"
    CHECK ("durum" IN ('taslak', 'hazir', 'onayda', 'yayinda', 'arsivlendi')),
  -- Onay türü YALNIZ onaydayken dolu; ikisi ayrışırsa masa "onay bekliyor"
  -- satırını bulamaz ya da yanlış kişiye gösterir.
  CONSTRAINT "reklam_taslagi_onay_chk" CHECK (
    ("durum" = 'onayda' AND "onay_turu" IN ('ajans', 'musteri', 'ajans_ikinci_goz'))
    OR ("durum" <> 'onayda' AND "onay_turu" IS NULL)
  ),
  CONSTRAINT "reklam_taslagi_yuz_chk"
    CHECK ("olusturan_yuz" IN ('acemi', 'gelismis', 'ai', 'recete', 'kopya', 'toplu')),
  CONSTRAINT "reklam_taslagi_seviye_chk" CHECK ("butce_seviyesi" IN ('kampanya', 'ad_set')),
  CONSTRAINT "reklam_taslagi_arsiv_chk"
    CHECK (("durum" = 'arsivlendi') = ("arsivlendi_at" IS NOT NULL))
);

CREATE INDEX "reklam_taslagi_client_durum_idx" ON "reklam_taslagi" ("client_id", "durum", "updated_at" DESC);
CREATE INDEX "reklam_taslagi_org_id_idx" ON "reklam_taslagi" ("org_id");
CREATE INDEX "reklam_taslagi_hesap_idx" ON "reklam_taslagi" ("ad_account_id");

-- KOMPOZİT ANAHTAR: org_id HEDEF MÜŞTERİDEN gelmek zorunda. "Tüm şirketler"
-- modunda ctx.orgId ev şirketi kalıyor ve ondan yazmak bu anahtarı deler.
ALTER TABLE "reklam_taslagi" ADD CONSTRAINT "reklam_taslagi_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reklam_taslagi" ADD CONSTRAINT "reklam_taslagi_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Hesap silinirse taslak kalır, hesabı boşalır (eksik listesi söyler).
ALTER TABLE "reklam_taslagi" ADD CONSTRAINT "reklam_taslagi_ad_account_id_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reklam_taslagi" ADD CONSTRAINT "reklam_taslagi_kaynak_fkey"
  FOREIGN KEY ("kaynak_taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reklam_taslagi" ADD CONSTRAINT "reklam_taslagi_olusturan_fkey"
  FOREIGN KEY ("olusturan_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- taslak_surumu — DEĞİŞMEZ.
--
-- Prova, onay ve yayın bir SÜRÜME bağlanıyor; sürüm sonradan değişebilseydi
-- müşterinin onayladığı plan ile yayınlanan plan hiçbir iz bırakmadan
-- ayrışırdı. UPDATE politikası bilerek YOK (02_rls.sql) ve aşağıdaki trigger
-- BYPASSRLS rolünü de durduruyor.
-- -----------------------------------------------------------------------------
CREATE TABLE "taslak_surumu" (
  "id"            UUID           NOT NULL DEFAULT gen_random_uuid(),
  "taslak_id"     UUID           NOT NULL,
  "org_id"        UUID           NOT NULL,
  "client_id"     UUID           NOT NULL,
  "surum_no"      INTEGER        NOT NULL,
  -- Her yaprak {deger, kaynak, kim, zaman}. Para micros DİZGE (JSON sayısı
  -- 2^53'ü aşınca sessizce yuvarlanıyor), tarih YYYY-MM-DD.
  "alanlar"       JSONB          NOT NULL,
  -- Kanonik JSON'un SHA-256'sı; aynı özetle ikinci sürüm yazılmaz.
  "icerik_ozeti"  CHAR(64)       NOT NULL,
  "profil_surumu" INTEGER,
  "eksikler"      JSONB          NOT NULL DEFAULT '[]',
  "olusturan_id"  UUID           NOT NULL,
  "created_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "taslak_surumu_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "taslak_surumu_no_chk" CHECK ("surum_no" >= 1),
  CONSTRAINT "taslak_surumu_ozet_chk" CHECK ("icerik_ozeti" ~ '^[0-9a-f]{64}$')
);

-- Aynı numara iki kez yazılamaz: iki sekme aynı anda kaydederse biri
-- düşer ve yeniden dener, ikisi de "sürüm 5" olmaz.
CREATE UNIQUE INDEX "taslak_surumu_taslak_no_key" ON "taslak_surumu" ("taslak_id", "surum_no");
CREATE INDEX "taslak_surumu_client_idx" ON "taslak_surumu" ("client_id");
CREATE INDEX "taslak_surumu_org_id_idx" ON "taslak_surumu" ("org_id");

ALTER TABLE "taslak_surumu" ADD CONSTRAINT "taslak_surumu_taslak_fkey"
  FOREIGN KEY ("taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "taslak_surumu" ADD CONSTRAINT "taslak_surumu_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "taslak_surumu" ADD CONSTRAINT "taslak_surumu_olusturan_fkey"
  FOREIGN KEY ("olusturan_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DEĞİŞMEZLİK: RLS politikası olmaması yetmiyor, worker BYPASSRLS ile
-- koşuyor. İçerik kolonlarına UPDATE her rolde reddediliyor. client_id ve
-- org_id HARİÇ: workspace başka şirkete taşınınca o ikisi değişmek zorunda
-- (workspace-tasima.ts).
CREATE OR REPLACE FUNCTION taslak_surumu_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."taslak_id" IS DISTINCT FROM OLD."taslak_id"
     OR NEW."surum_no" IS DISTINCT FROM OLD."surum_no"
     OR NEW."alanlar" IS DISTINCT FROM OLD."alanlar"
     OR NEW."icerik_ozeti" IS DISTINCT FROM OLD."icerik_ozeti"
     OR NEW."profil_surumu" IS DISTINCT FROM OLD."profil_surumu"
     OR NEW."eksikler" IS DISTINCT FROM OLD."eksikler"
     OR NEW."olusturan_id" IS DISTINCT FROM OLD."olusturan_id"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'taslak_surumu degismez: yeni surum yazilmali';
  END IF;
  RETURN NEW;
END
$$;

CREATE TRIGGER "taslak_surumu_degismez_trg"
  BEFORE UPDATE ON "taslak_surumu"
  FOR EACH ROW EXECUTE FUNCTION taslak_surumu_degismez();

-- -----------------------------------------------------------------------------
-- ajans_ayari — AJANS GENELİ TEK SATIR.
--
-- atif_standardi NULL = seçilmedi = yeni modül yayın YAPMAZ (OK-16). Onaysız
-- uygulanan "önerilen" değer de bir karardır ve kararın sahibi ajans
-- yöneticisi; o yüzden varsayılan YOK.
-- -----------------------------------------------------------------------------
CREATE TABLE "ajans_ayari" (
  "org_id"          UUID           NOT NULL,
  "atif_standardi"  VARCHAR(16),
  "atif_secen_id"   UUID,
  "atif_secim_at"   TIMESTAMPTZ(6),
  "updated_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "ajans_ayari_pkey" PRIMARY KEY ("org_id"),
  CONSTRAINT "ajans_ayari_atif_chk"
    CHECK ("atif_standardi" IS NULL OR "atif_standardi" IN ('tik7_gor1', 'tik7')),
  -- Ne zaman seçildiği seçimle BİRLİKTE yazılır. Seçen kişi bu kısıtta
  -- YOK: kullanıcı silinince kolon NULL'a çekiliyor ve kısıt silmeyi
  -- engellerdi. Kim seçti sorusunun kalıcı cevabı audit_logs'ta.
  CONSTRAINT "ajans_ayari_atif_zaman_chk"
    CHECK (("atif_standardi" IS NULL) = ("atif_secim_at" IS NULL))
);

ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_secen_fkey"
  FOREIGN KEY ("atif_secen_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
