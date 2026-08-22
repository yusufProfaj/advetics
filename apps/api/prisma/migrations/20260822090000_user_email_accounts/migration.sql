-- DANIŞMAN BAŞINA E-POSTA KİMLİĞİ.
--
-- Rapor müşteriye danışmanın KENDİ adresinden gidiyor: müşteri "yanıtla"
-- dediğinde ona ulaşmalı ve mail onun imzasını taşımalı. Org seviyesinde tek
-- bir ayar olsaydı bu bir .env değişkeni olurdu; danışman başına olunca
-- veritabanına ve şifreli saklamaya taşınıyor.
--
-- PAROLA ŞİFRELİ (AES-256-GCM, anahtar sürümlü) ve HİÇBİR OKUMA YOLUNDAN
-- GERİ DÖNMÜYOR. Bir kullanıcının uygulama parolasını saklamak, o hesabın
-- adına mail gönderebilmek demek — bu bir güven sınırı ve satır yalnızca
-- SAHİBİNE görünüyor. Org yöneticisi bile parolayı okuyamıyor; yalnızca
-- "kurulu mu / son hata ne" bilgisini görebiliyor.
CREATE TABLE "user_email_accounts" (
  "id"          UUID PRIMARY KEY,
  "org_id"      UUID NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  -- TEKİL: bir kullanıcının tek e-posta kimliği var.
  "user_id"     UUID NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,

  "from_name"   VARCHAR(160) NOT NULL,
  "from_email"  VARCHAR(255) NOT NULL,

  "smtp_host"   VARCHAR(255) NOT NULL,
  "smtp_port"   INTEGER NOT NULL,
  "smtp_secure" BOOLEAN NOT NULL DEFAULT TRUE,
  "smtp_user"   VARCHAR(255) NOT NULL,
  "smtp_pass_enc" BYTEA NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,

  -- İMZA HTML'İ. Gmail'in imzası SMTP ile gönderilen maile OTOMATİK
  -- EKLENMİYOR; onu Gmail'in arayüzü ekliyor. Bu yüzden burada saklanıyor.
  -- Girişte temizleniyor (script/style/olay öznitelikleri) ve TEMİZLENMİŞ
  -- hâli yazılıyor: kullanıcı ne gönderileceğini görsün.
  "signature_html" TEXT,

  -- "KAYDEDİLDİ" DOĞRULAMA DEĞİL. SMTP kimliği yanlışsa hata ancak ilk
  -- gerçek gönderimde çıkar ve o gönderim müşteriye gidecek olandır.
  -- Kendine test maili gönderilmeden bu alan NULL kalıyor ve o hesapla
  -- rapor gönderilemiyor.
  "verified_at"     TIMESTAMPTZ,
  "last_error"      VARCHAR(500),
  "last_error_at"   TIMESTAMPTZ,

  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX "user_email_accounts_org_id_idx" ON "user_email_accounts"("org_id");
