-- METRİK SATIRLARINDA BOŞ PARA BİRİMİ: HESABIN BİRİMİ YAZILIYOR.
--
-- LinkedIn sağlayıcısı metrik satırına para birimi yazmıyordu (yanıt satır
-- başına birim taşımıyor). Sütun CHAR(3) olduğu için değer üç boşluk olarak
-- duruyor: Genel Bakış "Birden fazla para birimi var (TRY, )" diyor ve
-- LinkedIn tutarı sembolsüz görünüyor (canlı tur, 2026-10-05). Yeni satırlar
-- için yazma noktası düzeltildi (insights-sync.service.ts, paraBirimi); bu
-- adım GEÇMİŞİ düzeltiyor.
--
-- Tutar hesabın kendi biriminde geliyor (LinkedIn costInLocalCurrency), yani
-- hesabın birimi doğru değer. YALNIZCA boş olanlar: dolu bir birimin üzerine
-- yazılmıyor. Satır sayısı küçük (yalnızca LinkedIn hesapları).
UPDATE insights_daily i
   SET currency = a.currency
  FROM ad_accounts a
 WHERE a.id = i.ad_account_id
   AND btrim(i.currency) = '';
