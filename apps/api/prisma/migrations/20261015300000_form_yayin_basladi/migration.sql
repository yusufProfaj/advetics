-- FORM YAYINI: META İSTEĞİ BAŞLADI DAMGASI VE "BELİRSİZ" DURUMU (2026-10-12).
--
-- Yayın satırı önce koşullu UPDATE ile publishing durumuna sahipleniyor, sonra
-- Meta'da form açılıyor. Süreç arada ölürse (deploy, çökme) satır sonsuza
-- kadar publishing kalıyordu: yeniden yayın kapalı, panelde açan yol yok.
-- İki ölüm noktası FARKLI iş istiyor ve ayırt etmenin tek yolu bu damga:
--
--   * damga NULL  = Meta'ya hiçbir şey gitmedi; satır güvenle failed olur ve
--                   yeniden yayınlanabilir.
--   * damga dolu  = Meta'da form açılmış olabilir (Meta form silmeye izin
--                   vermiyor, yeniden yayın İKİNCİ form açar); satır
--                   uncertain olur ve yeniden yayın yalnız bilinçli onayla.
--
-- Damga Meta isteğinin HEMEN öncesinde, ayrı bir yazımla basılıyor
-- (form-publisher.service.ts).
ALTER TABLE "lead_forms" ADD COLUMN "meta_request_started_at" TIMESTAMPTZ(6);

-- DURUM LİSTESİNE uncertain. Kısıt 01_constraints.sql'de de güncel; burada da
-- yazılıyor çünkü üretimde o dosya migrate'ten SONRA koşuyor ve arada eski
-- kısıt yeni durumu reddederdi. Kolon eklemiyor, yalnız literal listesi:
-- üretim sırasını sınayan testlerde önceki şemaya uygulanması güvenli.
ALTER TABLE lead_forms DROP CONSTRAINT IF EXISTS lead_forms_status_chk;
ALTER TABLE lead_forms ADD CONSTRAINT lead_forms_status_chk
  CHECK (status IN ('draft', 'publishing', 'published', 'superseded', 'failed', 'uncertain'));
