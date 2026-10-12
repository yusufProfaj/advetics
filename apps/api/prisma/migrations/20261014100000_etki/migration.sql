-- DEĞİŞİKLİK ETKİSİ (Paket C, docs/etki/MIMARI.md § 2)
--
-- Tek tablo. Advetics'ten yapılan her durdurma ve bütçe değişikliği için
-- "işe yaradı mı" ölçümü. Satırları YALNIZ worker yazıyor (impact_evaluate,
-- BYPASSRLS); panel okuyor. Bu yüzden RLS'te INSERT/UPDATE politikası YOK.
--
-- Durum kolonları VARCHAR + CHECK, enum DEĞİL: listeler
-- `packages/shared/src/etki/` içinde kapalı. CHECK listeleri shared
-- listeleriyle AYNI olmak zorunda; ayrışırlarsa INSERT üretimde patlar
-- (etki-kayit.spec.ts iki yönlü karşılaştırıyor, fatura-zip.spec.ts deseni).
--
-- Enum `SyncJobType` değeri AYRI migration'da (20261014100100): aynı
-- transaction'da eklenen enum değeri kullanılamıyor.

CREATE TABLE "degisiklik_etkileri" (
  "id"                UUID           NOT NULL DEFAULT gen_random_uuid(),
  -- org_id HEDEF MÜŞTERİDEN (clients.org_id), istek bağlamından değil:
  -- "tüm şirketler" modunda ctx.orgId ev şirketi kalıyor (CLAUDE.md).
  "org_id"            UUID           NOT NULL,
  "client_id"         UUID           NOT NULL,
  "ad_account_id"     UUID           NOT NULL,
  "platform"          "Platform"     NOT NULL,
  "kaynak"            VARCHAR(20)    NOT NULL,
  -- audit_logs.id (bigint, metin olarak) ya da rule_action_logs.id (uuid).
  -- (kaynak, kaynak_id) TEKİL: keşif her gün aynı pencereye bakabiliyor ve
  -- ikinci bakış ikinci bir satır açmamalı.
  "kaynak_id"         VARCHAR(64)    NOT NULL,
  "yol"               VARCHAR(20)    NOT NULL,
  "yol_ref"           VARCHAR(200),
  -- KOPYA: kural adı ya da uygulayan kişinin adı. Panel users tablosuna
  -- INNER JOIN yapmasın diye (RLS'li tabloya iç birleştirme satırı süzer).
  "kim"               VARCHAR(255),
  "tur"               VARCHAR(16)    NOT NULL,
  "seviye"            "EntityLevel"  NOT NULL,
  "varlik_id"         UUID           NOT NULL,
  -- KOPYA: varlık sonradan silinse de satır okunabilsin (rule_action_logs deseni).
  "varlik_adi"        VARCHAR(300)   NOT NULL,
  "ust_adi"           VARCHAR(300),
  -- ÖLÇÜLEN KAPSAM (olcumKapsami): bütçede varlığın kendisi, durdurmada üstü.
  -- Kampanya durdurmada kapsam hesap, kapsam_id reklam hesabının id'si.
  "kapsam_seviye"     "EntityLevel"  NOT NULL,
  "kapsam_id"         UUID           NOT NULL,
  "kapsam_adi"        VARCHAR(300)   NOT NULL,
  -- Bütçe micros STRING (BigInt JSON'a girmiyor), mod, durum, para birimi.
  "once_deger"        JSONB          NOT NULL DEFAULT '{}',
  "sonra_deger"       JSONB          NOT NULL DEFAULT '{}',
  "degisiklik_zamani" TIMESTAMPTZ(6) NOT NULL,
  -- HESABIN saat diliminde gün (insights_daily.date ile aynı). UTC günü
  -- kullanmak gece yapılan değişikliği bir önceki güne yazardı.
  "degisiklik_gunu"   DATE           NOT NULL,
  "birlikte_olculen"  SMALLINT       NOT NULL DEFAULT 0,
  "durum"             VARCHAR(12)    NOT NULL DEFAULT 'bekliyor',
  "sonuc"             VARCHAR(20),
  "neden"             VARCHAR(20),
  "metrik"            VARCHAR(30),
  "etki_orani"        NUMERIC,
  "nokta_gun"         SMALLINT,
  "sonraki_olcum"     DATE,
  -- KANIT: pencere toplamları, kontrol varlıkları, eşik, plasebo.
  "olcum"             JSONB,
  -- Kontrol grubu kurulamayan durdurmanın GÖZLEMİ (hüküm değil, olgu).
  "gozlem"            JSONB,
  "created_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "degisiklik_etkileri_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "degisiklik_etkileri_kaynak_chk" CHECK ("kaynak" IN ('kampanya_eylemi', 'kural')),
  CONSTRAINT "degisiklik_etkileri_yol_chk" CHECK ("yol" IN ('iyilestir', 'sinyal', 'reklam_yoneticisi', 'asistan', 'kural', 'bilinmiyor')),
  CONSTRAINT "degisiklik_etkileri_tur_chk" CHECK ("tur" IN ('durdur', 'butce_artir', 'butce_azalt')),
  CONSTRAINT "degisiklik_etkileri_durum_chk" CHECK ("durum" IN ('bekliyor', 'olcumde', 'sonuclandi', 'olculemedi')),
  CONSTRAINT "degisiklik_etkileri_sonuc_chk" CHECK ("sonuc" IS NULL OR "sonuc" IN ('iyilesti', 'kotulesti', 'fark_yok', 'henuz_belli_degil', 'belirsiz')),
  CONSTRAINT "degisiklik_etkileri_neden_chk" CHECK ("neden" IS NULL OR "neden" IN ('hacim_yetersiz', 'gurultulu', 'kontrol_grubu_yok', 'karisik', 'dogrulanmadi', 'hesap_tasindi', 'veri_yok')),
  CONSTRAINT "degisiklik_etkileri_metrik_chk" CHECK ("metrik" IS NULL OR "metrik" IN ('donusum_basi_maliyet', 'tiklama_basi_maliyet', 'gunluk_harcama', 'gunluk_donusum')),
  -- Değiştirilen varlık hesap olamaz (hesap seviyesinde yazma yolu yok).
  CONSTRAINT "degisiklik_etkileri_seviye_chk" CHECK ("seviye" <> 'account'),
  CONSTRAINT "degisiklik_etkileri_kapsam_chk" CHECK ("kapsam_seviye" <> 'ad'),
  -- AÇIK SATIRIN SONRAKİ ÖLÇÜMÜ OLMAK ZORUNDA. Olmasaydı iş onu hiç
  -- taramaz ve ekranda sonsuza kadar "ölçülüyor" yazardı (kısmi indeks +
  -- son durum dersi). Kapalı satırın sonraki ölçümü yok.
  CONSTRAINT "degisiklik_etkileri_sonraki_chk" CHECK (("durum" IN ('bekliyor', 'olcumde')) = ("sonraki_olcum" IS NOT NULL)),
  -- ÖLÇÜLEMEYENİN NEDENİ ZORUNLU: nedeni boş bir "ölçülemedi" kullanıcıyı
  -- ne yapacağını bilmeden bırakır.
  CONSTRAINT "degisiklik_etkileri_olculemedi_chk" CHECK ("durum" <> 'olculemedi' OR "neden" IS NOT NULL),
  CONSTRAINT "degisiklik_etkileri_sonuclandi_chk" CHECK ("durum" <> 'sonuclandi' OR "sonuc" IS NOT NULL)
);
CREATE UNIQUE INDEX "degisiklik_etkileri_kaynak_key" ON "degisiklik_etkileri" ("kaynak", "kaynak_id");
CREATE INDEX "degisiklik_etkileri_client_zaman_idx" ON "degisiklik_etkileri" ("client_id", "degisiklik_zamani" DESC);
CREATE INDEX "degisiklik_etkileri_org_id_idx" ON "degisiklik_etkileri" ("org_id");
-- Değerlendirme taraması: açık satırlar, zamanı gelenler. Kısmi indeksin
-- yüklemindeki durumdan ÇIKIŞI iş yazıyor ve ölçüm noktaları SONLU
-- (etkiGecisi son noktada kapatıyor); kalıcı açık satır yok.
CREATE INDEX "degisiklik_etkileri_acik_idx" ON "degisiklik_etkileri" ("ad_account_id", "sonraki_olcum") WHERE "durum" IN ('bekliyor', 'olcumde');
-- Karışıklık ve kontrol grubu sorgusu: aynı hesapta, pencere içindeki değişiklikler.
CREATE INDEX "degisiklik_etkileri_kapsam_idx" ON "degisiklik_etkileri" ("ad_account_id", "kapsam_id", "degisiklik_gunu");
CREATE INDEX "degisiklik_etkileri_varlik_idx" ON "degisiklik_etkileri" ("client_id", "varlik_id");
-- Kompozit anahtar ON UPDATE CASCADE: workspace başka şirkete taşınınca
-- org_id'yi Postgres taşıyor (workspace-tasima.ts CASCADE_ILE_TASINANLAR).
ALTER TABLE "degisiklik_etkileri" ADD CONSTRAINT "degisiklik_etkileri_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "degisiklik_etkileri" ADD CONSTRAINT "degisiklik_etkileri_ad_account_fkey"
  FOREIGN KEY ("ad_account_id") REFERENCES "ad_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
