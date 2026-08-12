-- Potansiyel müşteriler (Lead CRM)
--
-- MÜKERRER KAYIT KAÇINILMAZ, TASARIMIN PARÇASI.
--
-- Aynı kayıt bize iki yoldan gelebiliyor: webhook (anlık) ve mutabakat
-- taraması (periyodik). Meta webhook'u başarısız sayarsa tekrar gönderiyor;
-- tarama da aynı kaydı görüyor. Üstelik bunu ENGELLEMEK İSTEMİYORUZ — iki
-- yolun örtüşmesi, birinin sessizce ölmesine karşı tek korumamız.
--
-- Çözüm tekil kısıt: hangi yol önce ulaşırsa kayıt onun, ikincisi sessizce
-- düşüyor (ON CONFLICT DO NOTHING).

CREATE TABLE "leads" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    -- Meta'daki kayıt kimliği. Mükerrer engelinin dayanağı.
    "external_lead_id" VARCHAR(64) NOT NULL,

    -- Form SİLİNMİŞ OLABİLİR ve kayıt yine de durmalı.
    --
    -- Kişi bilgisini bıraktı; formun kaydı bizde kalmadı diye o bilgiyi
    -- atmak, ajansın gerçek müşterisini kaybetmesi demek. Bu yüzden form adı
    -- da kopyalanıyor (aşağıda) — bağlantı koptuğunda bile "hangi formdan
    -- geldi" sorusu cevaplanabilsin.
    "lead_form_id" UUID,
    "social_profile_id" UUID,

    -- Reklam atıfı — Meta'nın verdiği kadarıyla.
    "external_ad_id" VARCHAR(64),
    -- Kampanya adı KOPYALANIYOR, join'le çözülmüyor: reklam sonradan
    -- silinirse atıf kaybolurdu ve geçmiş rapor değişirdi.
    "campaign_name" VARCHAR(300),
    "lead_form_name" VARCHAR(300),

    -- Aranabilir alanlar AYRI KOLONDA.
    --
    -- Hepsi `fields` içinde de duruyor. Kopyalamanın sebebi arama: JSONB
    -- içinde ada/telefona göre aramak indekslenemiyor ve 50 bin kayıtta
    -- her arama tam tarama olurdu.
    "full_name" VARCHAR(300),
    "email" VARCHAR(320),
    "phone" VARCHAR(40),
    -- Tüm cevaplar, özel sorular dahil.
    "fields" JSONB NOT NULL DEFAULT '[]'::jsonb,

    "status" VARCHAR(16) NOT NULL DEFAULT 'new',
    "note" VARCHAR(2000),
    -- webhook | reconcile | manual — TEŞHİS İÇİN.
    "source" VARCHAR(16) NOT NULL,

    -- Meta'da formun doldurulduğu an.
    "submitted_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- MÜKERRER ENGELİ. İki yolun örtüşmesi bu kısıtla zararsız hâle geliyor.
CREATE UNIQUE INDEX "leads_external_uniq" ON "leads"("external_lead_id");

CREATE INDEX "leads_client_submitted_idx" ON "leads"("client_id", "submitted_at" DESC);
CREATE INDEX "leads_client_status_idx" ON "leads"("client_id", "status");
CREATE INDEX "leads_form_idx" ON "leads"("lead_form_id");

ALTER TABLE "leads" ADD CONSTRAINT "leads_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ON DELETE SET NULL, CASCADE DEĞİL.
--
-- Form kaydının silinmesi, o formdan gelen kişilerin bilgilerinin silinmesi
-- ANLAMINA GELMEZ. CASCADE olsaydı bir taslak formu silmek gerçek müşteri
-- kayıtlarını da götürürdü — geri alınamaz ve fark edilmesi zor.
ALTER TABLE "leads" ADD CONSTRAINT "leads_lead_form_id_fkey"
  FOREIGN KEY ("lead_form_id") REFERENCES "lead_forms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "leads" ADD CONSTRAINT "leads_social_profile_id_fkey"
  FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Mutabakat imleci.
--
-- Her form için "Meta'dan en son hangi ana kadar okuduk" bilgisi. Bu olmadan
-- tarama her seferinde formun tüm geçmişini okurdu: kota israfı ve zamanla
-- imkânsız hâle gelen bir iş.
--
-- İMLEÇ FORMDA DEĞİL AYRI TABLODA çünkü `lead_forms` sürüm zinciriyle
-- yönetiliyor ve yeni sürüm yeni satır demek; imleç Meta'nın form kimliğine
-- bağlı, bizimkine değil.
CREATE TABLE "lead_sync_cursors" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "social_profile_id" UUID NOT NULL,
    -- Meta'daki form kimliği.
    "external_form_id" VARCHAR(64) NOT NULL,

    -- Bu ana kadar okundu. İlk taramada NULL — geriye dönük pencere
    -- uygulama tarafında sınırlanıyor.
    "synced_through" TIMESTAMPTZ(6),
    "last_run_at" TIMESTAMPTZ(6),
    "last_error" VARCHAR(1000),
    -- Son taramada kaç YENİ kayıt bulundu. Sürekli sıfırdan büyükse
    -- webhook çalışmıyor demektir.
    "last_new_count" INTEGER NOT NULL DEFAULT 0,

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "lead_sync_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lead_sync_cursors_form_uniq"
  ON "lead_sync_cursors"("external_form_id");

ALTER TABLE "lead_sync_cursors" ADD CONSTRAINT "lead_sync_cursors_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_sync_cursors" ADD CONSTRAINT "lead_sync_cursors_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_sync_cursors" ADD CONSTRAINT "lead_sync_cursors_social_profile_id_fkey"
  FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
