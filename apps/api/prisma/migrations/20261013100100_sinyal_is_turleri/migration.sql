-- SİNYAL İŞ TÜRLERİ (Paket A, docs/sinyal/MIMARI.md § 5)
--
-- BU MIGRATION TEK BAŞINA VE İÇİNDE BAŞKA HİÇBİR ŞEY YOK.
-- `ALTER TYPE ... ADD VALUE` ile eklenen bir enum değeri AYNI TRANSACTION
-- İÇİNDE KULLANILAMIYOR (CLAUDE.md §3). Tablolar bir önceki migration'da;
-- bu değerleri kullanan tek şey uygulama kodu (sync_jobs satırları).
--
-- signals_evaluate: hesap başına, gün başına sinyal hesaplaması. Platform
--   çağrısı YOK; insights_daily işinin SONUNA zincirli.
-- notifications_send: bekleyen bildirimleri kanallara gönderen küresel
--   süpürme (5 dakikada bir) + 09:00 İstanbul sinyal özeti.
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'signals_evaluate';
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'notifications_send';
