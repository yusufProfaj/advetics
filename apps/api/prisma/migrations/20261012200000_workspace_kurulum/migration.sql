-- WORKSPACE KURULUM REHBERİ (docs/kurulum/MIMARI.md)
--
-- Rehberin platformlarda açtığı ya da seçtiği varlıkların kimlikleri. Durum
-- burada SAKLANMIYOR, her okumada bu kimliklerden ve hesap satırlarından
-- türetiliyor: saklanan durum, platformda biri elle değiştirdiğinde yalan
-- söylerdi. Workspace başına TEK satır.

CREATE TABLE "workspace_kurulum" (
  "client_id"               UUID           NOT NULL,
  "org_id"                  UUID           NOT NULL,
  -- Hesaplar kimin adına açılıyor: ajansın BM/MCC'si mi, şirketin kendisi mi.
  "hesap_sahibi"            VARCHAR(8),
  "meta_business_id"        VARCHAR(30),
  "google_mcc_id"           VARCHAR(10),
  -- AÇILAN HESAP, ATANMADAN ÖNCE. Hesap açıldıktan sonra keşif ya da atama
  -- düşerse bir sonraki tıklama İKİNCİ hesabı açardı (Meta hesabı silinemez,
  -- yalnız kapatılır). Yeniden denemede yalnız "bul ve ata" yapılır.
  "meta_acilan_hesap"       VARCHAR(30),
  "google_acilan_hesap"     VARCHAR(12),
  "gtm_hesap_id"            VARCHAR(20),
  -- accounts/{a}/containers/{c}
  "gtm_konteyner_yolu"      VARCHAR(80),
  -- GTM-XXXX: sitede aranan kimlik.
  "gtm_kimligi"             VARCHAR(20),
  -- Bizim değişikliklerimizin yapıldığı çalışma alanı (başkasının taslağına dokunmamak için ayrı).
  "gtm_calisma_alani_yolu"  VARCHAR(120),
  -- Son yayın: sürüm yolu, zaman, yazılan etiketler, atlanan parçalar.
  "gtm_yayin"               JSONB,
  "ga4_hesap_id"            VARCHAR(20),
  "ga4_mulk_id"             VARCHAR(20),
  "ga4_akis_yolu"           VARCHAR(80),
  -- G-XXXX
  "ga4_olcum_kimligi"       VARCHAR(20),
  "ga4_ads_bagli"           BOOLEAN        NOT NULL DEFAULT false,
  -- { form: {kaynak, gonderAdi}, telefon: …, whatsapp: … } — Google Ads dönüşüm işlemleri.
  "ads_donusumleri"         JSONB          NOT NULL DEFAULT '{}',
  -- { formYolu, telefon, whatsapp } — kullanıcının seçtiği tetikler.
  "donusum_tetigi"          JSONB,
  -- Adım başına son hata ya da atlanan parça (kod → {durum, mesaj, zaman}).
  "adim_notlari"            JSONB          NOT NULL DEFAULT '{}',
  -- Son canlı doğrulama sonucu (GA4 anlık, Meta piksel).
  "son_dogrulama"           JSONB,
  -- Son site taraması: kod görüldü mü, ne zaman.
  "site_kodu"               JSONB,
  "created_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "workspace_kurulum_pkey" PRIMARY KEY ("client_id"),
  CONSTRAINT "workspace_kurulum_sahip_chk" CHECK ("hesap_sahibi" IS NULL OR "hesap_sahibi" IN ('ajans', 'sirket')),
  CONSTRAINT "workspace_kurulum_gtm_chk" CHECK ("gtm_kimligi" IS NULL OR "gtm_kimligi" ~ '^GTM-[A-Z0-9]{4,12}$'),
  CONSTRAINT "workspace_kurulum_ga4_chk" CHECK ("ga4_olcum_kimligi" IS NULL OR "ga4_olcum_kimligi" ~ '^G-[A-Z0-9]{4,14}$')
);

CREATE INDEX "workspace_kurulum_org_id_idx" ON "workspace_kurulum" ("org_id");

-- BİR KONTEYNER TEK WORKSPACE'E: etiket adları sabit ("Advetics · …"); iki
-- workspace aynı konteyneri kullansa ikincinin yayını birincinin etiketlerini
-- kendi pikseliyle ezer ve planında olmayanları siler. İndeks RLS'e tabi
-- değil, yani başka şirketin workspace'i de çakışma olarak yakalanır.
CREATE UNIQUE INDEX "workspace_kurulum_gtm_konteyner_uniq" ON "workspace_kurulum" ("gtm_konteyner_yolu");

ALTER TABLE "workspace_kurulum" ADD CONSTRAINT "workspace_kurulum_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "workspace_kurulum" ADD CONSTRAINT "workspace_kurulum_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
