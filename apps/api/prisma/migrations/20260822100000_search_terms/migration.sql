-- ARAMA TERİMLERİ — kullanıcının gerçekten YAZDIĞI sorgular.
--
-- Anahtar kelime (`keyword_insights`) bizim hedeflediğimiz şey; arama terimi
-- kullanıcının yazdığı şey. İkisi AYNI DEĞİL ve fark tam olarak paranın
-- nereye gittiğini gösteriyor: geniş eşlemeli bir kelime, hiç istemediğimiz
-- sorgulara da gösterim alabiliyor.
--
-- TEKİLLİK METNİN HASH'İ ÜZERİNDEN. Arama teriminin sabit bir kimliği YOK
-- (anahtar kelimenin `criterion_id`si var, terimin yok) ve metnin kendisini
-- birincil anahtara koymak riskli: btree anahtar sınırı ~2704 bayt ve uzun
-- bir sorgu UTF-8'de o sınıra yaklaşabiliyor. Yazma anında alınacak bir
-- indeks hatası, gece koşan bir işin sessizce düşmesi demek olurdu.
CREATE TABLE "search_term_insights" (
  "client_id"      UUID NOT NULL REFERENCES "clients"("id") ON DELETE CASCADE,
  "ad_account_id"  UUID NOT NULL REFERENCES "ad_accounts"("id") ON DELETE CASCADE,
  -- Reklam grubu eşleşmezse NULL: terimi atmak yerine bağlamsız saklamak
  -- daha iyi (`keyword_insights` ile aynı karar).
  "ad_group_id"    UUID REFERENCES "ad_groups"("id") ON DELETE SET NULL,

  "term_hash"      CHAR(64) NOT NULL,
  "search_term"    VARCHAR(500) NOT NULL,
  -- Terimi getiren anahtar kelime — "hangi kelime bu sorguyu çekti".
  "keyword_text"   VARCHAR(500),
  "match_type"     VARCHAR(20),

  -- ADDED | EXCLUDED | ADDED_EXCLUDED | NONE
  --
  -- ÜRÜN AÇISINDAN EN DEĞERLİ ALAN: "NONE" olan bir terim para harcıyor ama
  -- ne anahtar kelime ne de negatif olarak tanımlı. Yapılacak iş tam da o
  -- listede.
  "status"         VARCHAR(20) NOT NULL DEFAULT 'NONE',

  "date" DATE NOT NULL,

  "impressions"             INTEGER NOT NULL DEFAULT 0,
  "clicks"                  INTEGER NOT NULL DEFAULT 0,
  "spend_micros"            BIGINT NOT NULL DEFAULT 0,
  "conversions"             DECIMAL(14,4) NOT NULL DEFAULT 0,
  "conversion_value_micros" BIGINT NOT NULL DEFAULT 0,

  "currency"   CHAR(3) NOT NULL,
  "fetched_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY ("date", "ad_account_id", "term_hash")
);

CREATE INDEX "search_term_insights_client_date_idx"
  ON "search_term_insights"("client_id", "date" DESC);
CREATE INDEX "search_term_insights_account_date_idx"
  ON "search_term_insights"("ad_account_id", "date" DESC);
