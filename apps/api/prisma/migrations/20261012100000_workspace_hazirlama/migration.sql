-- HAZIR WORKSPACE (docs/advcampaign/HAZIR-WORKSPACE-PLANI.md § Dalga 3)
--
-- Reklam hesabı atanınca workspace'i reklama hazırlayan işin SONUCU:
-- adımların durumu (her biri nedeniyle), kullanıcıya sorulacak tek tük
-- sorular ve rehberin ön doldurmasında kullanılan varsayılanlar. Workspace
-- başına TEK satır (client_id anahtar). Adım listesinin şekli
-- packages/shared/src/hazirlama sözleşmesinden; CHECK listesi durum sabitiyle
-- aynı (hazirlama.spec.ts karşılaştırıyor).

CREATE TABLE "workspace_hazirlama" (
  "client_id"            UUID           NOT NULL,
  "org_id"               UUID           NOT NULL,
  "durum"                VARCHAR(12)    NOT NULL DEFAULT 'bekliyor',
  -- [{kod, durum, baslik, neden}] — HazirlamaAdimi.
  "adimlar"              JSONB          NOT NULL DEFAULT '[]',
  -- [{kod, soru, secenekler}] — kullanıcıya bir kez sorulan belirsizlikler.
  "sorular"              JSONB          NOT NULL DEFAULT '[]',
  -- Meta piksel kimliği (sayısal dizge): sitede görülenle hesabınki eşleşti.
  "piksel_id"            VARCHAR(30),
  -- micros; rehberin bütçe önerisi.
  "gunluk_butce_micros"  BIGINT,
  -- Bütçenin PARA BİRİMİ. Birimsiz saklanan tutar, hesap TRY'den USD'ye
  -- değişince "500 ₺" önerisini "500 USD" yapıyordu (Ajan 4, Ö3).
  "gunluk_butce_para_birimi" CHAR(3),
  -- Özel reklam kategorisi sorusu cevaplandı mı: boş kategori listesi
  -- "hiçbiri" mi yoksa "sorulmadı" mı ayırt edilemiyordu.
  "kategori_cevaplandi"  BOOLEAN        NOT NULL DEFAULT false,
  "son_calisma"          TIMESTAMPTZ(6),
  -- Hazırlığın HANGİ hesap/sayfa setiyle koştuğu (sha256). Okunduğunda set
  -- değişmişse hazırlık kendiliğinden yeniden koşar: hesap atamasına
  -- bağlanmak modüller arası döngü kurardı, imza bunu gereksiz kılıyor.
  "girdi_imzasi"         CHAR(64),
  "created_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"           TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "workspace_hazirlama_pkey" PRIMARY KEY ("client_id"),
  CONSTRAINT "workspace_hazirlama_durum_chk" CHECK ("durum" IN ('bekliyor', 'calisiyor', 'hazir', 'soru', 'eksik')),
  CONSTRAINT "workspace_hazirlama_piksel_chk" CHECK ("piksel_id" IS NULL OR "piksel_id" ~ '^[0-9]{1,30}$'),
  CONSTRAINT "workspace_hazirlama_butce_chk" CHECK ("gunluk_butce_micros" IS NULL OR "gunluk_butce_micros" > 0)
);

CREATE INDEX "workspace_hazirlama_org_id_idx" ON "workspace_hazirlama" ("org_id");

-- KOMPOZİT ANAHTAR: org_id HEDEF WORKSPACE'TEN (reklam_rehberi ile aynı gerekçe).
ALTER TABLE "workspace_hazirlama" ADD CONSTRAINT "workspace_hazirlama_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_hazirlama" ADD CONSTRAINT "workspace_hazirlama_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
