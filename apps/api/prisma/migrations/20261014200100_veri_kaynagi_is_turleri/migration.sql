-- VERİ KAYNAĞI İŞ TÜRLERİ (Paket F, docs/veri-kaynagi/MIMARI.md § 2.3)
--
-- BU MIGRATION TEK BAŞINA VE İÇİNDE BAŞKA HİÇBİR ŞEY YOK.
-- ALTER TYPE ... ADD VALUE ile eklenen bir enum değeri AYNI TRANSACTION
-- İÇİNDE KULLANILAMIYOR (CLAUDE.md §3). Tablolar bir önceki migration'da
-- (20261014200000); bu değerleri kullanan tek şey uygulama kodu.
--
-- kaynak_yapi: kaynağın kendisi (GA4 anahtar etkinlik listesi, mülk saat
--   dilimi ve para birimi). Günde bir.
-- kaynak_gunluk: günlük pencere. Yapı son 36 saatte başarıyla koşmadıysa
--   PLATFORMA GİTMEDEN biter (ön koşul önce, çağrı sonra).
-- kaynak_gecmis: ilk bağlantıda 90 gün, parça parça; yapı bitince zincirle.
-- urun_performansi: F3 (ürün bazında reklam verisi). Değer şimdi ekleniyor
--   çünkü sözleşme dört değeri birlikte tanımlıyor; F1'de işleyicisi ve
--   zamanlayıcısı YOK, kuyruğa giren bir iş not_implemented ile düşer.
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'kaynak_yapi';
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'kaynak_gunluk';
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'kaynak_gecmis';
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'urun_performansi';
