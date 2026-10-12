-- ETKİ İŞ TÜRÜ (Paket C, docs/etki/MIMARI.md § 5)
--
-- BU MIGRATION TEK BAŞINA VE İÇİNDE BAŞKA HİÇBİR ŞEY YOK.
-- `ALTER TYPE ... ADD VALUE` ile eklenen bir enum değeri AYNI TRANSACTION
-- İÇİNDE KULLANILAMIYOR (CLAUDE.md §3). Tablo bir önceki migration'da; bu
-- değeri kullanan tek şey uygulama kodu (sync_jobs satırları).
--
-- impact_evaluate: hesap başına, günde bir keşif + değerlendirme. Platform
--   çağrısı YOK; girdisi audit_logs, rule_action_logs ve insights_daily.
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'impact_evaluate';
