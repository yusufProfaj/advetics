-- WEBSUB ABONELİK YENİLEME İŞ TİPİ (Advetics 1.0)
--
-- YouTube bildirim aboneliğinin kiralaması ~10 günde doluyor ve hub HABER
-- VERMİYOR. Yenilenmezse bildirim sessizce duruyor: panelde "hiç video
-- gelmiyor" görünüyor ve sebebi YouTube'da, kanalda, izinlerde aranıyor.
--
-- BU MIGRATION TEK BAŞINA VE İÇİNDE BAŞKA HİÇBİR ŞEY YOK.
-- `ALTER TYPE ... ADD VALUE` ile eklenen bir enum değeri AYNI TRANSACTION
-- İÇİNDE KULLANILAMIYOR (CLAUDE.md §3).
ALTER TYPE "SyncJobType" ADD VALUE IF NOT EXISTS 'websub_renew';
