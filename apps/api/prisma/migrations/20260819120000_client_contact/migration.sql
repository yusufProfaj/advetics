-- ═══ MÜŞTERİ İLETİŞİM VE FATURA BİLGİSİ ═══
--
-- `clients` tablosunda ad ve slug dışında hiçbir iletişim bilgisi yoktu.
-- Sonucu iki yerde görülüyor:
--
--   1. Rapor e-postası gönderilemiyor — kime gönderileceği hiçbir yerde
--      yazılı değil. "Bilgi Bankası'ndaki müşteri e-postasını oku" diye
--      tasarlanan akışın okuyacağı alan yok.
--   2. Ajans çalışanı müşteriye ulaşmak için paneli terk edip başka bir yere
--      bakmak zorunda.
--
-- ALANLAR MÜŞTERİDE, ÖN AYARDA DEĞİL. İletişim bilgisi boost ön ayarının
-- (`auto_boost_presets`) parçası değil: ön ayar platforma göre değişiyor ve
-- bir müşterinin iki ön ayarı olabiliyor — e-posta adresinin iki kopyası
-- olması, birinin güncellenmemesi demekti.
--
-- HEPSİ NULLABLE. Müşteri açmak için iletişim bilgisi ZORUNLU DEĞİL: kurulum
-- sihirbazının ilk amacı hesapları bağlamak ve zorunlu alan eklemek, elinde
-- fatura bilgisi olmayan birinin müşteriyi hiç açamaması demekti.
ALTER TABLE "clients"
  ADD COLUMN "contact_name"  VARCHAR(120),
  ADD COLUMN "contact_email" VARCHAR(255),
  ADD COLUMN "contact_phone" VARCHAR(40),
  ADD COLUMN "website"       VARCHAR(255),
  ADD COLUMN "address"       VARCHAR(500),
  ADD COLUMN "tax_office"    VARCHAR(120),
  ADD COLUMN "tax_number"    VARCHAR(40),
  ADD COLUMN "iban"          VARCHAR(34),
  ADD COLUMN "notes"         VARCHAR(2000);

-- E-POSTA BİÇİMİ VERİTABANINDA DA KONTROL EDİLİYOR.
--
-- Zod zaten doğruluyor ama rapor gönderimi bu kolonu OKUYUP e-posta
-- gönderecek: biçimi bozuk bir adres, gönderim anında sağlayıcıdan dönen ham
-- bir hataya dönüşür ve o hata kullanıcıya "rapor gönderilemedi" olarak
-- görünür — sebebi aylar önce girilmiş bir yazım hatasıyken.
--
-- Kasıtlı olarak GEVŞEK bir kontrol: tam RFC doğrulaması regex'le yapılamıyor
-- ve denemek geçerli adresleri reddetmekle sonuçlanıyor. Aranan tek şey
-- "@ var ve iki tarafı dolu, boşluk yok".
ALTER TABLE "clients" DROP CONSTRAINT IF EXISTS "clients_contact_email_chk";
ALTER TABLE "clients" ADD CONSTRAINT "clients_contact_email_chk"
  CHECK (contact_email IS NULL OR contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$');
