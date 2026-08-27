-- KIRILIM SENKRONİZASYON İŞİ (Advetics 1.0)
--
-- BU MIGRATION TEK BAŞINA. `ALTER TYPE ... ADD VALUE` ile eklenen bir enum
-- değeri AYNI TRANSACTION İÇİNDE KULLANILAMIYOR (CLAUDE.md §3).
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'insights_breakdowns';
