-- İYİLEŞTİR v1 + AI ASİSTAN v1 (docs/iyilestir/MIMARI.md § 4)
--
-- ÖNERİ SAKLANMIYOR, yalnız KARAR saklanıyor. Öneri her istekte yeniden
-- hesaplanıyor: saklanan öneri bayatlar (bütçeyi başkası değiştirir) ve
-- eski değerle uygulanırdı. Karar satırı, aynı haftanın aynı önerisine
-- (kararlı anahtar tur:seviye:varlık:ISO-hafta) bir kez verilen cevap.

CREATE TABLE "iyilestir_oneri_karar" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"     UUID           NOT NULL,
  "client_id"  UUID           NOT NULL,
  "anahtar"    VARCHAR(200)   NOT NULL,
  "tur"        VARCHAR(40)    NOT NULL,
  "platform"   "Platform"     NOT NULL,
  "durum"      VARCHAR(12)    NOT NULL,
  -- Kararın verildiği andaki öneri (kanıtlarıyla) ve eylem. Öneri bir
  -- sonraki istekte artık üretilmeyebilir (reklam durdu); "Uygulandı"
  -- kartı bu kopyadan kuruluyor.
  "eylem"      JSONB          NOT NULL,
  -- Uygulandıysa platformdan GERİ OKUNAN değer; yok sayıldıysa NULL.
  "sonuc"      JSONB,
  "user_id"    UUID           NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "iyilestir_oneri_karar_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "iyilestir_oneri_karar_durum_chk" CHECK ("durum" IN ('uygulandi', 'yoksayildi')),
  -- Uygulanan kararın sonucu ZORUNLU: sonucu olmayan "uygulandı" ekranda
  -- doğrulanmış gibi okunurdu.
  CONSTRAINT "iyilestir_oneri_karar_sonuc_chk" CHECK (("durum" = 'uygulandi') = ("sonuc" IS NOT NULL))
);
-- Bir öneriye bir karar. İkinci "Uygula" tıklaması ikinci bir kayıt
-- açmıyor; servis çakışmayı görüp var olanı döndürüyor.
CREATE UNIQUE INDEX "iyilestir_oneri_karar_anahtar_key" ON "iyilestir_oneri_karar" ("client_id", "anahtar");
CREATE INDEX "iyilestir_oneri_karar_ay_idx" ON "iyilestir_oneri_karar" ("client_id", "created_at" DESC);
CREATE INDEX "iyilestir_oneri_karar_org_id_idx" ON "iyilestir_oneri_karar" ("org_id");
ALTER TABLE "iyilestir_oneri_karar" ADD CONSTRAINT "iyilestir_oneri_karar_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iyilestir_oneri_karar" ADD CONSTRAINT "iyilestir_oneri_karar_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Karar DEĞİŞMEZ: kimin neyi ne zaman uyguladığının kanıtı. Yalnız
-- sahiplik kolonları (workspace taşıması) değişebilir.
CREATE OR REPLACE FUNCTION iyilestir_karar_degismez() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."anahtar" IS DISTINCT FROM OLD."anahtar" OR NEW."durum" IS DISTINCT FROM OLD."durum"
     OR NEW."eylem" IS DISTINCT FROM OLD."eylem" OR NEW."sonuc" IS DISTINCT FROM OLD."sonuc"
     OR NEW."user_id" IS DISTINCT FROM OLD."user_id" THEN
    RAISE EXCEPTION 'oneri karari degismez';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER "iyilestir_karar_degismez" BEFORE UPDATE ON "iyilestir_oneri_karar"
  FOR EACH ROW EXECUTE FUNCTION iyilestir_karar_degismez();

-- AI ASİSTAN. Eski ai_conversations KULLANILMIYOR (platform kolonu
-- varsayılanla meta; AdvCampaign'in gerekçesiyle aynı).
CREATE TABLE "iyilestir_asistan_oturum" (
  "id"         UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"     UUID           NOT NULL,
  "client_id"  UUID           NOT NULL,
  "user_id"    UUID           NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "iyilestir_asistan_oturum_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "iyilestir_asistan_oturum_client_idx" ON "iyilestir_asistan_oturum" ("client_id", "created_at" DESC);
CREATE INDEX "iyilestir_asistan_oturum_org_id_idx" ON "iyilestir_asistan_oturum" ("org_id");
CREATE INDEX "iyilestir_asistan_oturum_user_idx" ON "iyilestir_asistan_oturum" ("user_id");
ALTER TABLE "iyilestir_asistan_oturum" ADD CONSTRAINT "iyilestir_asistan_oturum_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iyilestir_asistan_oturum" ADD CONSTRAINT "iyilestir_asistan_oturum_user_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mesaj: ekranın parçaları (AsistanParcasi[]) VE modelin kendi içeriği
-- (Gemini biçimi, düşünce imzalarıyla) AYRI kolonlarda. Ekran parçasından
-- model geçmişi kurmak imzayı düşürür ve araç döngüsü ikinci turda bozulur
-- (gemini.ts başlığı).
--
-- Asistan satırı tur BİTİNCE tek seferde yazılıyor; "yazılıyor" durumu
-- yok, yani yarıda kalıp sonsuza kadar açık görünen bir satır da yok.
CREATE TABLE "iyilestir_asistan_mesaj" (
  "id"           UUID           NOT NULL DEFAULT gen_random_uuid(),
  "oturum_id"    UUID           NOT NULL,
  "org_id"       UUID           NOT NULL,
  "client_id"    UUID           NOT NULL,
  "user_id"      UUID           NOT NULL,
  "rol"          VARCHAR(10)    NOT NULL,
  "parcalar"     JSONB          NOT NULL,
  "model_icerik" JSONB          NOT NULL DEFAULT '[]',
  "giris_token"  INTEGER        NOT NULL DEFAULT 0,
  "cikis_token"  INTEGER        NOT NULL DEFAULT 0,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "iyilestir_asistan_mesaj_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "iyilestir_asistan_mesaj_rol_chk" CHECK ("rol" IN ('kullanici', 'asistan'))
);
CREATE INDEX "iyilestir_asistan_mesaj_oturum_idx" ON "iyilestir_asistan_mesaj" ("oturum_id", "created_at");
-- Saatlik kota kullanıcı başına sayılıyor.
CREATE INDEX "iyilestir_asistan_mesaj_kullanici_idx" ON "iyilestir_asistan_mesaj" ("user_id", "created_at" DESC) WHERE "rol" = 'kullanici';
CREATE INDEX "iyilestir_asistan_mesaj_client_idx" ON "iyilestir_asistan_mesaj" ("client_id", "created_at" DESC);
CREATE INDEX "iyilestir_asistan_mesaj_org_id_idx" ON "iyilestir_asistan_mesaj" ("org_id");
ALTER TABLE "iyilestir_asistan_mesaj" ADD CONSTRAINT "iyilestir_asistan_mesaj_oturum_fkey"
  FOREIGN KEY ("oturum_id") REFERENCES "iyilestir_asistan_oturum"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "iyilestir_asistan_mesaj" ADD CONSTRAINT "iyilestir_asistan_mesaj_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
