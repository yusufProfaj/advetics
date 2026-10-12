-- İKİ ADIMLI DOĞRULAMA (docs/guvenlik/2FA.md)
--
-- YENİ TABLO YOK, kolonlar users ve organizations üzerinde. Gerekçe:
-- durumun tamamı kullanıcı başına TEK satır (anahtar, son kullanılan adım,
-- kurtarma kodu özetleri, deneme sayacı) ve ayrı bir tablo; RLS
-- politikası, TRUNCATE listesi ve iki tablo arasında tutarlılık borcu
-- getirirdi. users ve organizations zaten RLS altında; yeni kolonlar
-- satır politikalarını devralıyor. client_id taşımadığı için
-- WORKSPACE_TABLOLARI kararı gerekmiyor.
--
-- mfa_secret_enc ve mfa_enabled ilk migration'dan beri VAR ama hiçbir kod
-- okumuyordu; anlamları korunuyor: mfa_enabled=false iken dolu bir anahtar
-- "kurulum başlatıldı, onay bekliyor" demek.
--
-- ENUM YOK, yani ayrı migration gerekmiyor.

-- Son kabul edilen TOTP adımı (unix saniye / 30). Aynı kodun ikinci kez
-- kullanılmasını engelliyor: yalnızca BUNDAN BÜYÜK adım kabul edilir.
ALTER TABLE "users" ADD COLUMN "mfa_son_adim" BIGINT;

-- Kullanılmamış kurtarma kodlarının SHA-256 özetleri (hex). Kullanılan kod
-- diziden ÇIKARILIYOR (tek deyim, koşullu): iki eşzamanlı istek aynı kodu
-- harcayamaz.
ALTER TABLE "users" ADD COLUMN "mfa_kurtarma_kodlari" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Art arda hatalı deneme sayısı (başarıda sıfırlanır) ve kilidin bittiği an.
-- Sayaç kilitte SIFIRLANMIYOR: kilit süresi her beş hatada ikiye katlanıyor.
ALTER TABLE "users" ADD COLUMN "mfa_basarisiz_deneme" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "mfa_kilit_bitis" TIMESTAMPTZ(6);

-- 2FA'nın açıldığı an (Hesabım ekranı ve denetim).
ALTER TABLE "users" ADD COLUMN "mfa_acilis" TIMESTAMPTZ(6);

-- Şirket 2FA'yı zorunlu tutuyor mu. Varsayılan KAPALI: açık başlatmak,
-- deploy anında her kullanıcıyı telefonunda uygulama kurmaya zorlardı.
ALTER TABLE "organizations" ADD COLUMN "iki_adim_zorunlu" BOOLEAN NOT NULL DEFAULT false;
