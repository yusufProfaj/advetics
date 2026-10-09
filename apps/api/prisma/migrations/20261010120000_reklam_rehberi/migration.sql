-- ADVCAMPAIGN REHBERİ — iki platformun ORTAK girdisi
--
-- docs/advcampaign/MIMARI-REHBER.md § 2. Rehber kullanıcının yarım işini
-- saklıyor; Meta ve Google taslakları (reklam_taslagi, platform = meta |
-- google) prova ve yayın anında BURADAN türetiliyor. Yazılmış ve testli Meta
-- zinciri (değişmez sürüm, prova, yayın makinesi) değişmeden kalıyor.
--
-- CHECK listesi packages/shared/src/reklam/rehber/api.ts#REHBER_DURUMLARI
-- sabitinden; rehber-tablolari.spec.ts ikisini karşılaştırıyor.

CREATE TABLE "reklam_rehberi" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "durum"            VARCHAR(12)    NOT NULL DEFAULT 'taslak',
  -- İyimser kilit: her PUT "WHERE surum = beklenen" ile yazar ve bir artırır.
  -- İki sekme aynı rehberi yazarsa ikincisi 409 alır; sessizce ezilmez.
  "surum"            INTEGER        NOT NULL DEFAULT 0,
  -- RehberAlanlari (rehberAlanlariSchema, strict). Her yaprak
  -- {deger, kaynak, kim, zaman}; para micros DİZGE.
  "alanlar"          JSONB          NOT NULL DEFAULT '{}',
  -- Türetilmiş platform taslakları; prova anında oluşur.
  "meta_taslak_id"   UUID,
  "google_taslak_id" UUID,
  -- Son provanın hangi İÇERİĞE yapıldığı. Yayın kapısı bunu güncel özetle
  -- karşılaştırıyor: prova geçtikten sonra bir alan değiştiyse prova o
  -- hâlin kanıtı değil.
  "prova_ozeti"      CHAR(64),
  "prova_at"         TIMESTAMPTZ(6),
  "olusturan_id"     UUID           NOT NULL,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "arsivlendi_at"    TIMESTAMPTZ(6),

  CONSTRAINT "reklam_rehberi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reklam_rehberi_durum_chk" CHECK ("durum" IN ('taslak', 'yayinda', 'arsivlendi')),
  CONSTRAINT "reklam_rehberi_arsiv_chk"
    CHECK (("durum" = 'arsivlendi') = ("arsivlendi_at" IS NOT NULL)),
  CONSTRAINT "reklam_rehberi_surum_chk" CHECK ("surum" >= 0),
  CONSTRAINT "reklam_rehberi_prova_chk"
    CHECK (("prova_ozeti" IS NULL) = ("prova_at" IS NULL)
           AND ("prova_ozeti" IS NULL OR "prova_ozeti" ~ '^[0-9a-f]{64}$'))
);

CREATE INDEX "reklam_rehberi_client_durum_idx" ON "reklam_rehberi" ("client_id", "durum", "updated_at" DESC);
CREATE INDEX "reklam_rehberi_org_id_idx" ON "reklam_rehberi" ("org_id");
CREATE INDEX "reklam_rehberi_meta_taslak_idx" ON "reklam_rehberi" ("meta_taslak_id");
CREATE INDEX "reklam_rehberi_google_taslak_idx" ON "reklam_rehberi" ("google_taslak_id");

-- KOMPOZİT ANAHTAR: org_id HEDEF MÜŞTERİDEN. "Tüm şirketler" modunda
-- ctx.orgId ev şirketi kalıyor ve ondan yazmak bu anahtarı deler; panelde
-- tek cümle kalır: "İlişkili kayıt geçersiz".
ALTER TABLE "reklam_rehberi" ADD CONSTRAINT "reklam_rehberi_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reklam_rehberi" ADD CONSTRAINT "reklam_rehberi_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Türetilmiş taslak silinmiyor (arşivleniyor); yine de silinirse rehber
-- ÖLMEZ, bir sonraki prova yenisini açar.
ALTER TABLE "reklam_rehberi" ADD CONSTRAINT "reklam_rehberi_meta_taslak_fkey"
  FOREIGN KEY ("meta_taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reklam_rehberi" ADD CONSTRAINT "reklam_rehberi_google_taslak_fkey"
  FOREIGN KEY ("google_taslak_id") REFERENCES "reklam_taslagi"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "reklam_rehberi" ADD CONSTRAINT "reklam_rehberi_olusturan_fkey"
  FOREIGN KEY ("olusturan_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- -----------------------------------------------------------------------------
-- yayin: rehberden gelen yayının iki ek kaydı.
--
-- `kapali_kalacak`: amaç × platform açılışı `deneme` iken kurulum geri
-- okunur ve AÇILMAZ (kapali_kuruldu). Test kipinden FARKLI: test kipi
-- arşivliyor, bu duraklatılmış bırakıyor ki kullanıcı Reklam Yöneticisi'nden
-- Başlat ile açsın.
--
-- `uyum_surumu` + `uyum_sonucu`: uyum denetçisinin bu yayına verdiği karar.
-- Meta motorunun UYUM reti yalnız bu kayıt `gecti` ise kalkıyor; raporu
-- olmayan gerçek yayın kanıtsız ama kurulmuş bir reklam bırakırdı.
-- -----------------------------------------------------------------------------
ALTER TABLE "yayin" ADD COLUMN "kapali_kalacak" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "yayin" ADD COLUMN "uyum_surumu" VARCHAR(16);
ALTER TABLE "yayin" ADD COLUMN "uyum_sonucu" JSONB;
ALTER TABLE "yayin" ADD CONSTRAINT "yayin_uyum_chk"
  CHECK (("uyum_surumu" IS NULL) = ("uyum_sonucu" IS NULL));

-- Uyum kararı ve açılış kipi de DEĞİŞMEZ: sonradan "geçti"ye çevrilebilen
-- bir uyum kaydı, kanıt değil.
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
     OR NEW."atif_standardi" IS DISTINCT FROM OLD."atif_standardi"
     OR NEW."kapali_kalacak" IS DISTINCT FROM OLD."kapali_kalacak"
     OR NEW."uyum_surumu" IS DISTINCT FROM OLD."uyum_surumu"
     OR NEW."uyum_sonucu" IS DISTINCT FROM OLD."uyum_sonucu" THEN
    RAISE EXCEPTION 'yayin govdesi degismez';
  END IF;
  RETURN NEW;
END
$$;
