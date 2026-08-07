-- Modül 7 — boost değerlendirme iş türü
--
-- ALTER TYPE ... ADD VALUE aynı transaction içinde kullanılamıyor; Prisma her
-- migration dosyasını tek transaction'da çalıştırdığı için komut tek başına.
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'boosts_evaluate';
