-- BAŞARILI AMA BOŞ İŞİN NEDENİ HİÇBİR YERDE KALMIYORDU.
--
-- `insights-sync.service.ts` "12/12 kampanya metriği eşlenemedi (varlık
-- veritabanında yok)" uyarısını ÜRETİYOR ve bir de özet not hazırlıyor
-- ("2026-07-01..2026-07-31 · campaign · 0 satır · 12 atlandı"). İkisi de
-- yalnızca worker log'una yazılıyordu: `markSucceeded` `note` parametresi bile
-- almıyordu. Log rotasyonuyla kaybolan bu iki satır, "atadım ama veri
-- gelmiyor" teşhisinin TEK kanıtıydı.
--
-- İki kolon, çünkü ikisi farklı soruya cevap veriyor:
--   · rows_skipped — KAÇ satır atıldı (sayı, sorgulanabilir)
--   · note         — hangi aralık, hangi seviye, ne oldu (insan okur)
--
-- Kolonlar NULLABLE ve varsayılanlı: geçmiş satırlarda bu bilgi yok ve
-- "0 atlandı" yazmak yalan olurdu — bilinmiyor ile sıfır aynı şey değil.
ALTER TABLE "sync_jobs" ADD COLUMN "rows_skipped" INTEGER;
ALTER TABLE "sync_jobs" ADD COLUMN "note" VARCHAR(500);
