-- YOUTUBE BİLDİRİM ABONELİĞİ (WebSub) — Advetics 1.0
--
-- Bu tablo bir GÜVENLİK İNCELEMESİNİN ardından şekillendi. İlk tasarım üç
-- kritik noktadan düştü ve üçünün karşılığı burada:
--
--   1. İmza katmanı SALDIRGANIN İSTEĞİNE BAĞLIYDI. İmzasız istek kabul
--      edildiği için, imzayı atlatmanın yolu başlığı hiç göndermemekti.
--      Karşılığı: `signature_seen_at` (öğren-ve-kilitle).
--   2. Belirteç TEK savunmaydı ve kanal kimliği sır değil (feed adresinde
--      yazıyor). Karşılığı kodda: Atom gövdesi TETİKLEYİCİ, veri kaynağı
--      değil — video YouTube Data API'den doğrulanıyor.
--   3. Belirteç LOG'A SIZIYORDU. Karşılığı: `maskPath` + burada düz metin
--      YOK, yalnızca özet.

CREATE TABLE "auto_boost_subscriptions" (
    "id" UUID NOT NULL,
    "org_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,

    -- Bir kanal = bir abonelik. Tekillik aşağıda.
    "social_profile_id" UUID NOT NULL,

    -- hub.topic — kanalın Atom feed adresi. Doğrulama el sıkışmasında gelen
    -- konu bununla karşılaştırılıyor; eşleşmezse başkası bizim geri çağrı
    -- adresimizi kullanarak KENDİ kanalını abone ettirebilirdi.
    "topic_url" TEXT NOT NULL,

    -- ═══ BELİRTEÇ DÜZ METİN SAKLANMIYOR ═══
    --
    -- Geri çağrı adresi tahmin edilemez bir belirteç taşıyor ve o belirteç,
    -- isteği gönderebilmenin şartı — yani bir kimlik bilgisi. Düz metin
    -- saklansaydı her veritabanı dökümü canlı bir sır taşırdı.
    --
    -- Belirtecin KENDİSİ hiç saklanmıyor: ana anahtardan ve buradaki
    -- nonce'tan TÜRETİLİYOR. Burada yalnızca SHA-256 özeti var ve o da tek
    -- iş için: gelen istekteki belirteçten profili BULMAK.
    --
    -- NONCE DÖNDÜRÜLEBİLİR. Belirtecin sızdığından şüphelenildiğinde nonce
    -- yenileniyor, eski adres anında ölüyor ve yeni adresle yeniden abone
    -- olunuyor. İlk tasarımda iptal yolu HİÇ YOKTU.
    "token_nonce" VARCHAR(64) NOT NULL,
    "callback_token_hash" CHAR(64) NOT NULL,

    -- Kiralama durumu. `verified_at` NULL = abonelik hiç doğrulanmadı.
    "verified_at" TIMESTAMPTZ(6),
    "lease_seconds" INTEGER,
    "renew_at" TIMESTAMPTZ(6),

    -- ═══ ÖĞREN-VE-KİLİTLE ═══
    --
    -- Bu abonelikte İLK geçerli imza görüldüğü an dolduruluyor. Doluysa
    -- imzasız istek ARTIK REDDEDİLİYOR.
    --
    -- Neden baştan zorunlu değil: Google'ın hub'ının YouTube konularında
    -- `hub.secret`'ı dikkate alıp almadığı ÖLÇÜLMEDİ. Baştan zorunlu kılmak,
    -- imzalamıyorsa özelliğin hiç çalışmaması demekti. Bu alan ikisini de
    -- çözüyor: imzalamıyorsa kilit hiç kurulmuyor, imzalıyorsa kurulduğu
    -- saniyede downgrade kapanıyor.
    "signature_seen_at" TIMESTAMPTZ(6),

    -- ÖLÜ ADAM DÜĞMESİ İÇİN. Kiralama sessizce dolduğunda ya da hub kapandığında
    -- panelde uyarı çıkabilmesi buna bakıyor.
    "last_notification_at" TIMESTAMPTZ(6),

    -- hub.mode=denied geldiğinde sebebi. Doluysa abonelik ÖLÜ ve panel bunu
    -- göstermeli — reddedilme sessizce geçerse "hiç video gelmiyor" diye
    -- görünür ve sebebi YouTube'da aranır.
    "denied_reason" VARCHAR(500),

    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "auto_boost_subscriptions_pkey" PRIMARY KEY ("id")
);

-- BİR KANAL BİR ABONELİK. İkincisi, hangi belirtecin geçerli olduğunu
-- belirsiz bırakırdı.
CREATE UNIQUE INDEX "auto_boost_subscriptions_social_profile_id_key"
  ON "auto_boost_subscriptions"("social_profile_id");

-- GELEN İSTEKTEKİ BELİRTEÇTEN PROFİL BULUNUYOR. Tekil olması zorunlu:
-- iki abonelik aynı özeti taşısaydı istek yanlış müşteriye yazılabilirdi.
CREATE UNIQUE INDEX "auto_boost_subscriptions_callback_token_hash_key"
  ON "auto_boost_subscriptions"("callback_token_hash");

-- Yenileme taraması: süresi yaklaşanları bulmak için.
CREATE INDEX "auto_boost_subscriptions_renew_at_idx"
  ON "auto_boost_subscriptions"("renew_at")
  WHERE "renew_at" IS NOT NULL;

ALTER TABLE "auto_boost_subscriptions" ADD CONSTRAINT "auto_boost_subscriptions_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_boost_subscriptions" ADD CONSTRAINT "auto_boost_subscriptions_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_boost_subscriptions" ADD CONSTRAINT "auto_boost_subscriptions_social_profile_id_fkey"
  FOREIGN KEY ("social_profile_id") REFERENCES "social_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "auto_boost_subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "auto_boost_subscriptions" FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- KUYRUK KAYDINA BİLDİRİMİN KÖKENİ
-- ---------------------------------------------------------------------------
--
-- İnceleme bulgusu: sahte bildirimle gerçeğini AYIRT ETME yolu yoktu. Kart
-- oluştuktan sonra nereden geldiği geri izlenemiyordu, dolayısıyla sızan bir
-- belirtecin haftalarca fark edilmeden kullanılması mümkündü.
--
-- `imzasiz` gelen kart panelde İŞARETLİ görünecek: koruma o kart için yalnızca
-- adresin gizli kalmasına dayanıyor demektir ve kullanıcı bunu bilmeli.
ALTER TABLE "auto_boost_queue_items"
  ADD COLUMN "signature_state" VARCHAR(16);

-- Kaynak IP. Beyaz liste İÇİN DEĞİL — App Engine çıkış IP'leri bütün Google
-- Cloud kiracılarıyla ORTAK ve beyaz liste kimseyi dışarıda bırakmadan
-- savunma görüntüsü verirdi. Bu alan yalnızca olay sonrası inceleme için.
ALTER TABLE "auto_boost_queue_items"
  ADD COLUMN "source_ip" VARCHAR(64);
