-- Google Ads hesabının ödeme okuması (2026-10-19): billing_setup ve
-- account_budget özeti (`GoogleOdemeOkumasi`, shared/odeme-durumu.ts).
-- NEDEN raw İÇİNDE DEĞİL: hesap keşfi (günde iki kez) raw'ı platformun
-- yanıtıyla BAŞTAN YAZIYOR; ödeme okuması oraya konsaydı her tazelemede
-- silinir ve bir sonraki nabza kadar karar "bilinmiyor"a düşerdi.
-- NULL = okuma hiç yapılmadı (Meta ve LinkedIn satırları hep NULL).
ALTER TABLE "ad_accounts" ADD COLUMN "odeme_durumu" JSONB;
