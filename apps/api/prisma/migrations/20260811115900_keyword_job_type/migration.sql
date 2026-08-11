-- Anahtar kelime iş türü
--
-- AYRI MIGRATION ve bu bilinçli. `ALTER TYPE ... ADD VALUE` ile eklenen değer
-- AYNI TRANSACTION içinde kullanılamıyor ve Prisma her migration dosyasını tek
-- transaction'da çalıştırıyor. Tabloyla aynı dosyaya koymak bugün çalışsa bile
-- kırılgan bir varsayıma yaslanmak olurdu — `rules_evaluate` için de aynı
-- ayrım yapıldı.
ALTER TYPE "SyncJobType" ADD VALUE 'keyword_insights';
