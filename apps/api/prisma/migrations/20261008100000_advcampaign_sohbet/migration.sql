-- ADVCAMPAIGN SOHBETİ (docs/advcampaign/TASARIM-PLAN.md § 4.2, İP-10)
--
-- Eski ai_conversations / ai_messages KULLANILMIYOR: platform kolonu
-- varsayılanla meta ve "iki ayrı asistan" modelini taşıyor; yeni sohbet
-- platformdan bağımsız ve eski tabloya yazmak her oturumu sessizce
-- "Meta sohbeti" yapardı. Eski tablolar yazmaya kapalı kalıyor; silinmeleri
-- ayrı bir veri kararı.

-- Oturum: bir kullanıcının bir workspace'teki sohbeti. Taslağa bağlanır;
-- taslak silinirse oturum okunur kalır (SET NULL), kimin neyi neden
-- istediğinin izi kaybolmasın.
CREATE TABLE "adv_oturum" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"      UUID           NOT NULL,
  "client_id"   UUID           NOT NULL,
  "user_id"     UUID           NOT NULL,
  "baslik"      VARCHAR(120)   NOT NULL,
  "taslak_id"   UUID,
  "durum"       VARCHAR(8)     NOT NULL DEFAULT 'acik',
  "model"       VARCHAR(40)    NOT NULL,
  -- Sorulmuş alanlar SIRAYLA (siradakiSoru'nun "en çok beş" sayacı).
  -- Satırda tutuluyor: mesajlardan türetmek, cevaplanmamış soruyu
  -- kaçırırdı ve model aynı soruyu tekrar tekrar sorabilirdi.
  "sorulanlar"  JSONB          NOT NULL DEFAULT '[]',
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "adv_oturum_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "adv_oturum_durum_chk" CHECK ("durum" IN ('acik', 'kapali'))
);
CREATE INDEX "adv_oturum_client_idx" ON "adv_oturum" ("client_id", "updated_at" DESC);
CREATE INDEX "adv_oturum_org_id_idx" ON "adv_oturum" ("org_id");
CREATE INDEX "adv_oturum_user_idx" ON "adv_oturum" ("user_id");
ALTER TABLE "adv_oturum" ADD CONSTRAINT "adv_oturum_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adv_oturum" ADD CONSTRAINT "adv_oturum_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adv_oturum" ADD CONSTRAINT "adv_oturum_taslak_fkey"
  FOREIGN KEY ("taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mesaj: Anthropic biçiminde BİR mesaj (kullanıcı, asistan ya da araç
-- sonucu). Asistan satırı ekrandaki olayları da taşıyor (araç izi, soru,
-- kart): akış koptuğunda istemci aynı ekranı bunlardan yeniden kuruyor.
CREATE TABLE "adv_mesaj" (
  "id"             UUID           NOT NULL DEFAULT gen_random_uuid(),
  "oturum_id"      UUID           NOT NULL,
  "org_id"         UUID           NOT NULL,
  "client_id"      UUID           NOT NULL,
  "user_id"        UUID           NOT NULL,
  "sira"           INTEGER        NOT NULL,
  "rol"            VARCHAR(12)    NOT NULL,
  "icerik"         JSONB          NOT NULL,
  "olaylar"        JSONB          NOT NULL DEFAULT '[]',
  "durum"          VARCHAR(8)     NOT NULL DEFAULT 'tamam',
  "hata_metni"     VARCHAR(2000),
  "girdi_token"    INTEGER        NOT NULL DEFAULT 0,
  "cikti_token"    INTEGER        NOT NULL DEFAULT 0,
  "onbellek_token" INTEGER        NOT NULL DEFAULT 0,
  "created_at"     TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "adv_mesaj_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "adv_mesaj_rol_chk" CHECK ("rol" IN ('kullanici', 'asistan', 'arac_sonucu')),
  CONSTRAINT "adv_mesaj_durum_chk" CHECK ("durum" IN ('akista', 'tamam', 'kesildi', 'ret', 'hata'))
);
CREATE UNIQUE INDEX "adv_mesaj_sira_key" ON "adv_mesaj" ("oturum_id", "sira");
-- Saatlik kota kullanıcı başına sayılıyor.
CREATE INDEX "adv_mesaj_kullanici_idx" ON "adv_mesaj" ("user_id", "created_at" DESC) WHERE "rol" = 'kullanici';
-- Günlük token workspace başına toplanıyor.
CREATE INDEX "adv_mesaj_client_idx" ON "adv_mesaj" ("client_id", "created_at" DESC);
CREATE INDEX "adv_mesaj_org_id_idx" ON "adv_mesaj" ("org_id");
ALTER TABLE "adv_mesaj" ADD CONSTRAINT "adv_mesaj_oturum_fkey"
  FOREIGN KEY ("oturum_id") REFERENCES "adv_oturum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adv_mesaj" ADD CONSTRAINT "adv_mesaj_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Kapanmış mesaj DEĞİŞMEZ: modelin ne dediği ve aracın ne döndürdüğü
-- denetimin kanıtı. Yalnız "akista" satır kapanabilir; taşımada sahiplik
-- kolonları değişebilir.
CREATE OR REPLACE FUNCTION adv_mesaj_kapali_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."durum" <> 'akista' AND (NEW."icerik" IS DISTINCT FROM OLD."icerik"
     OR NEW."olaylar" IS DISTINCT FROM OLD."olaylar" OR NEW."durum" IS DISTINCT FROM OLD."durum"
     OR NEW."rol" IS DISTINCT FROM OLD."rol" OR NEW."sira" IS DISTINCT FROM OLD."sira") THEN
    RAISE EXCEPTION 'kapanmis mesaj degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "adv_mesaj_kapali_degismez" BEFORE UPDATE ON "adv_mesaj"
  FOR EACH ROW EXECUTE FUNCTION adv_mesaj_kapali_degismez();

-- Onay kartı ve onay. TEK KULLANIMLIK: taslak sürümüne ve kartın özetine
-- bağlı; aynı sürüm için yalnız bir "onaylandi" olabilir.
--
-- ÇIKIŞ YOLU (kısmi indeks + son durumu olmayan makine = kalıcı kilit,
-- CLAUDE.md): "gosterildi" → onay ucu "onaylandi" / taslak değişince
-- "bayat" / 24 saatten eskiyse okuma anında "suresi_doldu". "onaylandi"
-- bir SON durum; indeks yalnız aynı sürümün ikinci onayını engelliyor,
-- yeni sürüm yeni onay alabiliyor.
CREATE TABLE "adv_onay" (
  "id"              UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"          UUID           NOT NULL,
  "client_id"       UUID           NOT NULL,
  "oturum_id"       UUID,
  "taslak_id"       UUID           NOT NULL,
  "taslak_surum_no" INTEGER        NOT NULL,
  "kart"            JSONB          NOT NULL,
  "kart_ozeti"      CHAR(64)       NOT NULL,
  "durum"           VARCHAR(14)    NOT NULL DEFAULT 'gosterildi',
  "onaylayan_id"    UUID,
  "onay_at"         TIMESTAMPTZ(6),
  "yayin_id"        UUID,
  "created_at"      TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "adv_onay_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "adv_onay_durum_chk" CHECK ("durum" IN ('gosterildi', 'onaylandi', 'bayat', 'reddedildi', 'suresi_doldu')),
  CONSTRAINT "adv_onay_onaylayan_chk" CHECK (("durum" = 'onaylandi') = ("onaylayan_id" IS NOT NULL AND "onay_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "adv_onay_tek_onay_key" ON "adv_onay" ("taslak_id", "taslak_surum_no") WHERE "durum" = 'onaylandi';
CREATE INDEX "adv_onay_taslak_idx" ON "adv_onay" ("taslak_id", "created_at" DESC);
CREATE INDEX "adv_onay_client_idx" ON "adv_onay" ("client_id");
CREATE INDEX "adv_onay_org_id_idx" ON "adv_onay" ("org_id");
ALTER TABLE "adv_onay" ADD CONSTRAINT "adv_onay_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adv_onay" ADD CONSTRAINT "adv_onay_taslak_fkey"
  FOREIGN KEY ("taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "adv_onay" ADD CONSTRAINT "adv_onay_oturum_fkey"
  FOREIGN KEY ("oturum_id") REFERENCES "adv_oturum"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "adv_onay" ADD CONSTRAINT "adv_onay_yayin_fkey"
  FOREIGN KEY ("yayin_id") REFERENCES "yayin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Kart içeriği değişmez; "gosterildi" dışındaki durum değişmez (yalnız
-- onaylanmış karta yayın kimliği BİR KEZ bağlanır).
CREATE OR REPLACE FUNCTION adv_onay_kilit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."kart" IS DISTINCT FROM OLD."kart" OR NEW."kart_ozeti" IS DISTINCT FROM OLD."kart_ozeti"
     OR NEW."taslak_id" IS DISTINCT FROM OLD."taslak_id" OR NEW."taslak_surum_no" IS DISTINCT FROM OLD."taslak_surum_no" THEN
    RAISE EXCEPTION 'onay karti degismez';
  END IF;
  IF OLD."durum" <> 'gosterildi' AND NEW."durum" IS DISTINCT FROM OLD."durum" THEN
    RAISE EXCEPTION 'sonuclanmis onay degismez';
  END IF;
  IF OLD."yayin_id" IS NOT NULL AND NEW."yayin_id" IS DISTINCT FROM OLD."yayin_id" THEN
    RAISE EXCEPTION 'onayin yayini degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "adv_onay_kilit" BEFORE UPDATE ON "adv_onay"
  FOR EACH ROW EXECUTE FUNCTION adv_onay_kilit();
