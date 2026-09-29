-- MARKA MERKEZİ BÖLÜM 2 — YAPILANDIRILMIŞ MARKA ALANLARI
--
-- Profilde üç serbest metin alanı vardı (bilgi_bankasi, hedef_kitle,
-- marka_bilgileri). Ekranda dolu görünüyorlardı ama makine onları
-- KULLANAMIYORDU: Reklam Oluştur hedef adresi ve kampanya amacını her
-- seferinde yeniden soruyordu, çünkü "sitemiz x.com, en çok form
-- topluyoruz" cümlesi bir alana bağlanamıyor.
--
-- ESKİ ÜÇ KOLON KALIYOR. İçlerindeki metni yeni alanlara otomatik
-- ayrıştırmak bir tahmin olurdu; veri korunuyor ve panelde "Ek notlar"
-- olarak görünmeye devam ediyor.
--
-- WEB SİTESİ BURADA YOK: clients.website zaten var ve AI doldurma onu
-- okuyor. İkinci bir kopya iki ayrı adres demek.
--
-- DİZİLER NOT NULL DEFAULT boş: "hiç girilmedi" ile "boş liste" arasında
-- tutulacak bir fark yok ve NULL her okuyana ayrı bir dal yazdırırdı.

ALTER TABLE "client_profiles"
  ADD COLUMN "marka_adi"         VARCHAR(120),
  ADD COLUMN "sektor"            VARCHAR(120),
  ADD COLUMN "urun_kategorileri" TEXT[]      NOT NULL DEFAULT '{}',
  ADD COLUMN "sik_sayfalar"      JSONB       NOT NULL DEFAULT '[]',
  ADD COLUMN "ana_amac"          VARCHAR(20),
  ADD COLUMN "uslup"             VARCHAR(500),
  ADD COLUMN "vaatler"           TEXT[]      NOT NULL DEFAULT '{}';

-- ANA AMAÇ YALNIZCA SİSTEMİN KURABİLDİĞİ HEDEFLER. Liste
-- CAMPAIGN_GOALS (packages/shared) ile aynı; marka-alanlari.spec.ts ikisini
-- karşılaştırıyor. Kurulamayan bir amacı seçtirmek, çalışmayan bir
-- seçeneği arayüzde göstermek olurdu.
ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_ana_amac_check"
  CHECK ("ana_amac" IN ('form', 'whatsapp', 'website'));

-- sik_sayfalar bir DİZİ olmak zorunda; nesne ya da skaler yazan bir hata
-- okuma tarafında sessizce "sayfa yok"a dönerdi.
ALTER TABLE "client_profiles"
  ADD CONSTRAINT "client_profiles_sik_sayfalar_dizi"
  CHECK (jsonb_typeof("sik_sayfalar") = 'array');
