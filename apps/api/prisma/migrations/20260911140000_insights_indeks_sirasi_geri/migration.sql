-- =============================================================================
-- insights_daily — SÜTUN SIRASI GERİ ALINIYOR (yanlış teşhis)
-- =============================================================================
--
-- `20260911100000_insights_indeks_sirasi` indeksi
-- `(client_id, date DESC, entity_level)` yerine
-- `(client_id, entity_level, date DESC)` yaptı. Gerekçe "eşitlik sütunu
-- aralık sütununun arkasında kalmış" idi ve o kural DOĞRU — ama BURADAKİ
-- arızanın sebebi değildi.
--
-- ÜRETİMDE ÖLÇÜLDÜ: yeni indeksle plan BİREBİR AYNI kaldı.
--
--   Bitmap Index Scan on ..._client_id_entity_level_date_idx
--     Index Cond: client_id = ANY (...) AND date >= ... AND date <= ...
--   Bitmap Heap Scan
--     Filter: ... AND (entity_level = 'campaign'::"EntityLevel")
--     Rows Removed by Filter: 24.364   ← değişmedi
--     Heap Blocks: exact=5.357          ← değişmedi
--
-- `entity_level` indeksin İKİNCİ sütunu olmasına rağmen `Index Cond`a
-- girmedi; `date` ise ÜÇÜNCÜ sütun olmasına rağmen girdi. Sıra teorisi
-- bunu açıklayamaz.
--
-- GERÇEK SEBEP RLS + LEAKPROOF SIRASI. Tablo satır seviyesi güvenlik
-- taşıyor; Postgres güvenlik yüklemlerinden önce yalnızca LEAKPROOF
-- operatörleri çalıştırıyor. `date_ge`/`date_le` leakproof, `enum_eq`
-- değil. Yani `entity_level` hiçbir sütun sırasında indekse giremiyor.
--
-- Çözüm `01_constraints.sql` içindeki KISMİ İNDEKSLER: onların yüklemi
-- çalışma anında değerlendirilmiyor, plan anında kanıtlanıyor.
--
-- SIRA NEDEN GERİ ALINIYOR: kısmi indeksler `campaign` ve `account`
-- seviyelerini üstlendikten sonra bu genel indeks, seviyesi PARAMETREDEN
-- gelen sorgulara (kırılım ekranı) kalıyor. Onlarda `entity_level` zaten
-- indekse giremiyor, `date` ise girebiliyor — yani `date`in İKİNCİ sütun
-- olması (tarama sınırı) daha iyi. Yanlış bir gerekçeyle konmuş bir sıranın
-- yerinde kalması, bir sonraki okuyanı aynı yanlış çıkarıma götürürdü.
-- =============================================================================

CREATE INDEX "insights_daily_client_id_date_entity_level_idx"
  ON "insights_daily" ("client_id", "date" DESC, "entity_level");

DROP INDEX IF EXISTS "insights_daily_client_id_entity_level_date_idx";
