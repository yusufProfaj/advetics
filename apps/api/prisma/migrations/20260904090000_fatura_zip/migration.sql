-- ═══ FATURA ARTIK ZIP DE OLABİLİYOR ═══
--
-- Platformlar dönem faturalarını çoğu zaman tek tek PDF yerine tek bir arşiv
-- olarak indirtiyor; ajans onu açıp tek tek yüklemek zorunda kalıyordu.
--
-- TÜR SAKLANMAK ZORUNDA, DOSYA ADINDAN TÜRETİLEMEZ. Üç yer türe bağlı:
-- diskteki uzantı, mail ekinin `contentType`ı ve panelden açarken gönderilen
-- `Content-Type` başlığı. Dosya adı KULLANICININ verdiği ad ve gövdeyle
-- uyuşmak zorunda değil — biçimi zaten sihirli baytlardan okuyoruz, okuduğumuz
-- şeyi de saklamalıyız.
ALTER TABLE "fatura_belgeleri"
  ADD COLUMN "mime_type" VARCHAR(100) NOT NULL DEFAULT 'application/pdf';

-- GERİ DOLDURMA GEREKMİYOR ve varsayılan GÜVENLİ: bu migration'dan önceki
-- her satır PDF, çünkü yükleme yolu `%PDF-` sihirli baytını kontrol edip
-- başka her şeyi reddediyordu. Varsayılan bir tahmin değil, kanıtlanmış bir
-- olgu.

-- KABUL EDİLEN BİÇİMLER VERİTABANINDA DA DAYATILIYOR. Uygulamada sihirli
-- baytlar kontrol ediliyor ama veritabanı son savunma hattı: başka bir kod
-- yolu (script, elle SQL) buraya "image/png" yazarsa müşteriye ek olarak bir
-- ekran görüntüsü gider ve bunu ilk gören müşteri olur.
ALTER TABLE "fatura_belgeleri" ADD CONSTRAINT "fatura_belgeleri_mime_chk"
  CHECK ("mime_type" IN ('application/pdf', 'application/zip'));
