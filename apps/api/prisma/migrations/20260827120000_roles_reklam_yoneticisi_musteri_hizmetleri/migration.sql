-- İKİ YENİ ROL: reklam yöneticisi ve müşteri hizmetleri (Advetics 1.0)
--
-- BU MIGRATION TEK BAŞINA VE İÇİNDE BAŞKA HİÇBİR ŞEY YOK.
-- `ALTER TYPE ... ADD VALUE` ile eklenen bir enum değeri AYNI TRANSACTION
-- İÇİNDE KULLANILAMIYOR (CLAUDE.md §3). Aynı dosyada bir tablo ya da politika
-- değişikliği olsaydı ve o değişiklik yeni değeri kullansaydı, migration
-- üretimde düşerdi.
--
-- SIRALAMA AFTER İLE VERİLİYOR. Postgres enum'unun sırası ile
-- `packages/shared/src/auth/roles.ts` içindeki ROLES dizisinin sırası
-- ayrışmasın diye: ikisi aynı listeyi anlatıyor ve farklı sıralarda durmaları
-- bir sonraki bakımda "hangisi doğru" sorusunu ürettirirdi.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'ad_manager' AFTER 'admin';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'customer_service' AFTER 'analyst';
