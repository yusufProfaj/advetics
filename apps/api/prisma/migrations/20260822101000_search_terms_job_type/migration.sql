-- AYRI MIGRATION DOSYASI ZORUNLU.
--
-- `ALTER TYPE ... ADD VALUE` ile eklenen bir enum değeri AYNI TRANSACTION
-- içinde kullanılamıyor. Aynı dosyada tabloyla birlikte eklenseydi, o
-- değeri kullanan ilk INSERT "unsafe use of new value" ile düşerdi.
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'search_terms';
