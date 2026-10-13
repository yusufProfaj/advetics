-- KURULUM BEYANLARI (docs/kurulum-sihirbazi/MIMARI.md § 5, 2026-10-13).
--
-- Birleşik kurulum sihirbazının sözü "hiç eksik kalmasın". Bazı öğeler ise
-- bazı işletmelerde gerçekten YOK (fiziksel adres, web sitesi, bildirim
-- kanalı). Beyan olmasaydı bu workspace'ler sonsuza kadar "eksik" derdi; beyan
-- kapsamı daraltmanın AÇIK ve İZLİ yolu: kim, ne zaman, hangi gerekçeyle.
-- Geri almak satırı siler; iz denetim kaydında (audit_logs) kalır.
--
-- TEK TABLO, İKİ DÜZEY. client_id NULL = ŞİRKET düzeyi (bugün yalnız iki
-- adımlı doğrulama kararı), dolu = workspace düzeyi. İkisini ayrı tutmak iki
-- tablo, iki RLS bloğu, iki taşıma kararı demekti; düzeyi oge belirliyor ve
-- CHECK bunu dayatıyor.
--
-- EKLEMELİ: yalnız yeni tablo. Var olan hiçbir kısıta, tipe ya da satıra
-- dokunmuyor.
--
-- KISITLAR BURADA, 01_constraints.sql'de DEĞİL (MIMARI § 9'dan sapma, Ajan 2):
-- üretim sırası testleri ÖNCEKİ migration'ların üstüne BUGÜNKÜ prisma/sql
-- dosyalarını koşuyor. Bu tabloyu adıyla anan bir 01_constraints satırı o
-- testlerde "relation does not exist" ile düşerdi — sınadıkları şeyle hiçbir
-- ilgisi olmadan. Tablo yeni olduğu için kısıtı tabloyla aynı yerde kurmak
-- çakışma riski taşımıyor (workspace_kurulum ve sinyaller de böyle).

CREATE TABLE "kurulum_beyanlari" (
  "id"          UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"      UUID           NOT NULL,
  -- NULL = şirket düzeyi beyan.
  "client_id"   UUID,
  "oge"         VARCHAR(20)    NOT NULL,
  "gerekce"     VARCHAR(300),
  -- Kullanıcı silinince beyan KALIR (karar verilmişti); adı "bilinmiyor" olur.
  "beyan_eden"  UUID,
  "created_at"  TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "kurulum_beyanlari_pkey" PRIMARY KEY ("id"),
  -- Liste shared KURULUM_BEYAN_OGELERI'nin AYNISI; kurulum-beyan.spec.ts iki
  -- listeyi karşılaştırıyor (ayrışırlarsa INSERT üretimde patlar).
  CONSTRAINT "kurulum_beyanlari_oge_chk"
    CHECK ("oge" IN ('site_yok', 'adres', 'bildirim', 'erisim', 'iki_adim')),
  -- Düzey öğeden geliyor: iki adımlı doğrulama ŞİRKETİN kararı, diğerleri
  -- workspace'in. Workspace'e "iki_adim" yazmak, hiçbir ekranın okumadığı bir
  -- karar üretirdi.
  CONSTRAINT "kurulum_beyanlari_duzey_chk"
    CHECK (("oge" = 'iki_adim') = ("client_id" IS NULL))
);

-- İKİ KISMİ TEKİL İNDEKS, TEK (org_id, client_id, oge) DEĞİL: Postgres tekil
-- indekste NULL'ları birbirinden FARKLI sayıyor, yani tek indeks şirket
-- düzeyi beyanı sessizce ÇOĞALTIRDI (aynı karar iki satır, geri al biri
-- silerdi, öteki "kapsam dışı" demeye devam ederdi). Sunucunun Postgres
-- sürümü ölçülmediği için NULLS NOT DISTINCT kullanılmadı (≥15 ister).
CREATE UNIQUE INDEX "kurulum_beyanlari_sirket_uniq"
  ON "kurulum_beyanlari" ("org_id", "oge") WHERE "client_id" IS NULL;
CREATE UNIQUE INDEX "kurulum_beyanlari_workspace_uniq"
  ON "kurulum_beyanlari" ("client_id", "oge") WHERE "client_id" IS NOT NULL;

CREATE INDEX "kurulum_beyanlari_org_id_idx" ON "kurulum_beyanlari" ("org_id");

-- KOMPOZİT ANAHTAR ON UPDATE CASCADE: workspace başka şirkete taşınınca
-- satırı Postgres taşıyor (workspace-tasima.ts CASCADE_ILE_TASINANLAR).
-- client_id NULL (şirket düzeyi) satırda MATCH SIMPLE anahtarı denetlemiyor:
-- şirket kararı workspace'le GİTMEZ, doğru olan da bu.
ALTER TABLE "kurulum_beyanlari" ADD CONSTRAINT "kurulum_beyanlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kurulum_beyanlari" ADD CONSTRAINT "kurulum_beyanlari_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "kurulum_beyanlari" ADD CONSTRAINT "kurulum_beyanlari_beyan_eden_fkey"
  FOREIGN KEY ("beyan_eden") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
