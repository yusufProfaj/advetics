-- HESAP DURUMU KONTROL İŞİ (Advetics 1.0)
--
-- BU MIGRATION TEK BAŞINA VE İÇİNDE BAŞKA HİÇBİR ŞEY YOK.
-- `ALTER TYPE ... ADD VALUE` ile eklenen bir enum değeri AYNI TRANSACTION
-- İÇİNDE KULLANILAMIYOR (CLAUDE.md §3).
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'account_status';
