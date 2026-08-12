-- Lead iş türleri
--
-- AYRI MIGRATION — `keyword_insights` ve `rules_evaluate` ile aynı gerekçe:
-- `ALTER TYPE ... ADD VALUE` ile eklenen değer AYNI TRANSACTION içinde
-- kullanılamıyor ve Prisma her migration dosyasını tek transaction'da
-- çalıştırıyor.
--
-- `lead_fetch`: webhook'un bildirdiği tek bir kaydın alanlarını çeker.
-- `leads_reconcile`: bir formun kaçmış kayıtlarını tarar.
ALTER TYPE "SyncJobType" ADD VALUE 'lead_fetch';
ALTER TYPE "SyncJobType" ADD VALUE 'leads_reconcile';
