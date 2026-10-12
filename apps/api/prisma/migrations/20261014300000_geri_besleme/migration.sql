-- LEAD KALİTESİNİ META'YA GERİ BESLEME (Paket E, docs/geri-besleme/MIMARI.md § 2)
--
-- Üç tablo. Durum kolonları VARCHAR + CHECK, enum DEĞİL: listeler
-- `packages/shared/src/geri-besleme/` içinde kapalı ve CHECK listeleri onlarla
-- AYNI olmak zorunda (geri-besleme-kayit.spec.ts iki yönlü karşılaştırıyor;
-- ayrışırsa INSERT üretimde patlar, fatura-zip.spec.ts deseni).
--
-- Enum `SyncJobType` değeri AYRI migration'da (20261014300100): aynı
-- transaction'da eklenen enum değeri kullanılamıyor.
--
-- Üçü de `(client_id, org_id)` kompozit anahtarıyla `ON UPDATE CASCADE`:
-- workspace şirket değiştirince Postgres kendisi taşıyor
-- (`workspace-tasima.ts#CASCADE_ILE_TASINANLAR`).

-- ─── lead_durum_gecmisi ─────────────────────────────────────────────────────
--
-- Lead'in durum hattındaki her değişim. Kalite işareti YENİ bir kolon değil,
-- var olan durum (MIMARI Ç-1); eksik olan DEĞİŞİM ANIYDI ve Meta'ya giden
-- aşamanın zamanı tam o an. Ayar kapalıyken de yazılır: gönderim açılınca son
-- 7 günün işaretleri buradan kuyruğa giriyor (Ç-13).
CREATE TABLE "lead_durum_gecmisi" (
  "id"                 UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"             UUID           NOT NULL,
  "client_id"          UUID           NOT NULL,
  "lead_id"            UUID           NOT NULL,
  -- NULL = kayıt doğdu (webhook ya da tarama).
  "onceki_durum"       VARCHAR(16),
  "yeni_durum"         VARCHAR(16)    NOT NULL,
  -- users'a LEFT JOIN ile okunur: RLS'li tabloya INNER JOIN satırı süzer.
  "degistiren_user_id" UUID,
  "kaynak"             VARCHAR(8)     NOT NULL,
  "created_at"         TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "lead_durum_gecmisi_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "lead_durum_gecmisi_yeni_chk" CHECK ("yeni_durum" IN ('new', 'contacted', 'qualified', 'won', 'lost')),
  CONSTRAINT "lead_durum_gecmisi_onceki_chk" CHECK ("onceki_durum" IS NULL OR "onceki_durum" IN ('new', 'contacted', 'qualified', 'won', 'lost')),
  CONSTRAINT "lead_durum_gecmisi_kaynak_chk" CHECK ("kaynak" IN ('panel', 'sistem')),
  -- AYNI DURUMA "DEĞİŞİM" YOK: not güncellemesi geçmiş üretmemeli; üretseydi
  -- açılıştaki geri doldurma aynı aşamanın zamanını yanlış (sonraki) ana
  -- çekerdi.
  CONSTRAINT "lead_durum_gecmisi_degisim_chk" CHECK ("onceki_durum" IS DISTINCT FROM "yeni_durum")
);
CREATE INDEX "lead_durum_gecmisi_lead_idx" ON "lead_durum_gecmisi" ("lead_id", "created_at");
CREATE INDEX "lead_durum_gecmisi_client_idx" ON "lead_durum_gecmisi" ("client_id", "created_at");
CREATE INDEX "lead_durum_gecmisi_org_id_idx" ON "lead_durum_gecmisi" ("org_id");
ALTER TABLE "lead_durum_gecmisi" ADD CONSTRAINT "lead_durum_gecmisi_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
-- KVKK: lead silinince geçmişi de gider; ayrı saklama süresi yok (Ç-8).
ALTER TABLE "lead_durum_gecmisi" ADD CONSTRAINT "lead_durum_gecmisi_lead_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lead_durum_gecmisi" ADD CONSTRAINT "lead_durum_gecmisi_user_fkey"
  FOREIGN KEY ("degistiren_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── geri_besleme_ayarlari ──────────────────────────────────────────────────
--
-- Workspace başına, platform başına tek satır. DURUM SAKLANMAZ, türetilir
-- (`geriBeslemeAyarDurumu`): saklanan bir durum, bağlantı koptuğunda ya da
-- hata temizlendiğinde güncellenmeyi unutur.
CREATE TABLE "geri_besleme_ayarlari" (
  "client_id"              UUID           NOT NULL,
  "platform"               VARCHAR(10)    NOT NULL,
  "org_id"                 UUID           NOT NULL,
  "etkin"                  BOOLEAN        NOT NULL DEFAULT false,
  "dataset_id"             VARCHAR(20),
  "dataset_adi"            VARCHAR(200),
  -- Gönderimde kullanılan token'ın bağlantısı. Bağlantı silinirse NULL ve
  -- ayar "kurulum eksik"e düşer (gönderim tahminle başka token'a geçmez).
  "baglanti_id"            UUID,
  -- Meta `is_crm`. NULL = okunamadı ya da hiç sorulmadı; tahmin yok.
  "dataset_crm"            BOOLEAN,
  "son_kontrol"            TIMESTAMPTZ(6),
  "aydinlatma_onaylayan"   UUID,
  "aydinlatma_zamani"      TIMESTAMPTZ(6),
  "etkinlestiren"          UUID,
  "etkinlestirme_zamani"   TIMESTAMPTZ(6),
  -- Platformun cümlesi AYNEN. Başarılı bir gönderim temizler.
  "son_ayar_hatasi"        TEXT,
  "son_ayar_hatasi_zamani" TIMESTAMPTZ(6),
  "son_basarili_gonderim"  TIMESTAMPTZ(6),
  -- SİSTEMATİK RET (Ajan 4 Ö-3/Ö-4): Meta bütün olayları aynı hatayla
  -- reddetti. Kendiliğinden düzelmez; süpürme bu workspace'i ayar yeniden
  -- kaydedilene kadar almaz (her 5 dakikada aynı istekler harcanmasın).
  "gonderim_durduruldu"    BOOLEAN        NOT NULL DEFAULT false,
  "created_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"             TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "geri_besleme_ayarlari_pkey" PRIMARY KEY ("client_id", "platform"),
  CONSTRAINT "geri_besleme_ayarlari_platform_chk" CHECK ("platform" IN ('meta')),
  -- Dataset kimliği yalnız rakam: istek yoluna giriyor (/{dataset}/events),
  -- yol enjeksiyonu veritabanında da kapalı (MIMARI § 7).
  CONSTRAINT "geri_besleme_ayarlari_dataset_chk" CHECK ("dataset_id" IS NULL OR "dataset_id" ~ '^[0-9]{5,20}$'),
  -- AÇIK AYAR VERİ KÜMESİZ ve AYDINLATMA ONAYSIZ OLAMAZ. Şema doğrulaması
  -- girişte aynı şeyi söylüyor; bu kısıt, onu atlayan ikinci bir yazma
  -- yolunun Meta'ya onaysız veri göndermesini veritabanında kapatıyor.
  CONSTRAINT "geri_besleme_ayarlari_etkin_chk" CHECK (
    NOT "etkin" OR ("dataset_id" IS NOT NULL AND "aydinlatma_zamani" IS NOT NULL)
  )
);
CREATE INDEX "geri_besleme_ayarlari_org_id_idx" ON "geri_besleme_ayarlari" ("org_id");
ALTER TABLE "geri_besleme_ayarlari" ADD CONSTRAINT "geri_besleme_ayarlari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geri_besleme_ayarlari" ADD CONSTRAINT "geri_besleme_ayarlari_baglanti_fkey"
  FOREIGN KEY ("baglanti_id") REFERENCES "platform_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "geri_besleme_ayarlari" ADD CONSTRAINT "geri_besleme_ayarlari_aydinlatma_fkey"
  FOREIGN KEY ("aydinlatma_onaylayan") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "geri_besleme_ayarlari" ADD CONSTRAINT "geri_besleme_ayarlari_etkinlestiren_fkey"
  FOREIGN KEY ("etkinlestiren") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── geri_besleme_olaylari ──────────────────────────────────────────────────
--
-- GÖNDERİM KUYRUĞU = NİYET KAYDI. Gerçek, platformun cevabı (`platform_yaniti`).
-- Kişisel veri YOK: Meta'ya giden tek kimlik `leads.external_lead_id` ve o
-- burada bile saklanmıyor, gönderim anında lead'den okunuyor (Ç-8).
CREATE TABLE "geri_besleme_olaylari" (
  "id"               UUID           NOT NULL DEFAULT gen_random_uuid(),
  "org_id"           UUID           NOT NULL,
  "client_id"        UUID           NOT NULL,
  "lead_id"          UUID           NOT NULL,
  "platform"         VARCHAR(10)    NOT NULL,
  "asama"            VARCHAR(16)    NOT NULL,
  -- Meta `event_id`. Deterministik (`geriBeslemeOlayKimligi`): zaman aşımından
  -- sonraki yeniden deneme platformda YENİ bir olay olmasın.
  "olay_kimligi"     VARCHAR(64)    NOT NULL,
  "olay_zamani"      TIMESTAMPTZ(6) NOT NULL,
  "durum"            VARCHAR(16)    NOT NULL DEFAULT 'bekliyor',
  "deneme"           SMALLINT       NOT NULL DEFAULT 0,
  -- Ham lead: now(). Kullanıcı işareti: now() + 15 dk (geri alma penceresi).
  "sonraki_deneme"   TIMESTAMPTZ(6),
  -- Gönderim işinin satırı sahiplendiği an (durum = 'gonderiliyor'). Yaşlanan
  -- sahiplenme "sonucu bilinmiyor" diye işaretlenir, yeniden gönderilmez.
  "sahiplenme_zamani" TIMESTAMPTZ(6),
  -- Platform isteğinin başladığı an (Ajan 4 N-6). Boş + yaşlı sahiplenme =
  -- istek hiç gitmedi, güvenle geri bırakılır; dolu = sonucu bilinmiyor.
  "gonderim_basladi"  TIMESTAMPTZ(6),
  -- Gönderildiği andaki dataset: ayar sonradan değişebilir ve "bu olay hangi
  -- modeli eğitti" sorusunun cevabı ayarın BUGÜNKÜ değeri değil.
  "gonderilen_hedef" VARCHAR(20),
  "gonderildi"       TIMESTAMPTZ(6),
  "http_durum"       INTEGER,
  "hata_kodu"        VARCHAR(40),
  -- Platformun cümlesi AYNEN (Türkçeye çevrilmiş özet değil).
  "hata"             TEXT,
  -- events_received, fbtrace_id. Kişisel veri YOK.
  "platform_yaniti"  JSONB,
  "created_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "geri_besleme_olaylari_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "geri_besleme_olaylari_platform_chk" CHECK ("platform" IN ('meta')),
  CONSTRAINT "geri_besleme_olaylari_asama_chk" CHECK ("asama" IN ('ham_lead', 'ulasildi', 'nitelikli', 'satisa_dondu', 'uygun_degil')),
  CONSTRAINT "geri_besleme_olaylari_durum_chk" CHECK ("durum" IN (
    'bekliyor', 'basarisiz', 'gonderiliyor', 'iletildi', 'eslesmedi', 'reddedildi', 'vazgecildi', 'suresi_doldu', 'iptal'
  )),
  -- SAHİPLENİLMİŞ SATIRIN SAHİPLENME ANI VAR, DİĞERLERİNİN YOK: zamansız bir
  -- 'gonderiliyor' süpürmenin "yaşlı sahiplenme" süzgecine hiç düşmez ve
  -- sonsuza kadar "gönderiliyor" görünürdü.
  CONSTRAINT "geri_besleme_olaylari_sahiplenme_chk" CHECK (
    ("durum" = 'gonderiliyor') = ("sahiplenme_zamani" IS NOT NULL)
  ),
  CONSTRAINT "geri_besleme_olaylari_gonderim_basladi_chk" CHECK (
    "durum" = 'gonderiliyor' OR "gonderim_basladi" IS NULL
  ),
  CONSTRAINT "geri_besleme_olaylari_deneme_chk" CHECK ("deneme" >= 0),
  -- GÖNDERİLEBİLİR SATIRIN ZAMANI OLMAK ZORUNDA: zamansız bir `bekliyor`
  -- satırı süpürmenin `sonraki_deneme <= now()` süzgecine hiç düşmez ve
  -- sonsuza kadar bekler (kısmi indeks dersi).
  CONSTRAINT "geri_besleme_olaylari_zaman_chk" CHECK (
    "durum" NOT IN ('bekliyor', 'basarisiz') OR "sonraki_deneme" IS NOT NULL
  ),
  -- PLATFORMA ULAŞAN = GÖNDERİM ZAMANI DOLU. Ekran "iletildi" ile "gönderildi"
  -- zamanını aynı satırdan okuyor; biri yazılıp diğeri unutulursa rozet
  -- yalan söylerdi.
  CONSTRAINT "geri_besleme_olaylari_gonderildi_chk" CHECK (
    ("durum" IN ('iletildi', 'eslesmedi')) = ("gonderildi" IS NOT NULL)
  )
);
-- İDEMPOTENSİN ASIL DAYANAĞI: bir lead'in bir aşaması bir platforma BİR kez.
-- Durum ileri geri oynasa da ikinci satır açılmaz; iptal edilen satır
-- yeniden açılır (`asamaPlani().yenidenAc`).
CREATE UNIQUE INDEX "geri_besleme_olaylari_lead_asama_key" ON "geri_besleme_olaylari" ("lead_id", "platform", "asama");
-- Süpürme: vadesi gelmiş gönderilebilir satırlar. Kısmi indeksin yüklemindeki
-- iki durumdan ÇIKIŞI iki yol yazıyor: gönderim işi (iletildi, eşleşmedi,
-- reddedildi, vazgeçildi, süresi doldu) ve lead güncellemesi (iptal). Kalıcı
-- kilit yok (CLAUDE.md "kısmi tekil indeks" dersi; bu indeks tekil de değil).
CREATE INDEX "geri_besleme_olaylari_bekleyen_idx" ON "geri_besleme_olaylari" ("sonraki_deneme") WHERE "durum" IN ('bekliyor', 'basarisiz');
-- Yaşlı sahiplenme süpürmesi (sonucu bilinmeyen gönderimler).
CREATE INDEX "geri_besleme_olaylari_sahiplenme_idx" ON "geri_besleme_olaylari" ("sahiplenme_zamani") WHERE "durum" = 'gonderiliyor';
CREATE INDEX "geri_besleme_olaylari_client_idx" ON "geri_besleme_olaylari" ("client_id", "durum", "updated_at" DESC);
CREATE INDEX "geri_besleme_olaylari_org_id_idx" ON "geri_besleme_olaylari" ("org_id");
ALTER TABLE "geri_besleme_olaylari" ADD CONSTRAINT "geri_besleme_olaylari_client_org_fkey"
  FOREIGN KEY ("client_id", "org_id") REFERENCES "clients"("id", "org_id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geri_besleme_olaylari" ADD CONSTRAINT "geri_besleme_olaylari_lead_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
