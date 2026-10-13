-- insights_daily.reach artik BOS OLABILIYOR ve Google satirlarinin 0'lari
-- NULL'a cevriliyor (erisim olcumu duzeltmesi, 2026-10-13).
--
-- Google tekil erisim VERMIYOR; senkron yine de her satira 0 yaziyordu ve
-- raporun Google tablosu "Erisim 0" basiyordu: "kimseye ulasmadi" gibi
-- okunan uydurma bir sifir. NULL = platform vermiyor / olculmedi; 0 = okundu
-- ve sifir. Senkron artik NULL yaziyor; bu migration gecmisi duzeltiyor.
--
-- YALNIZ GOOGLE HESABININ SATIRLARI ve yalniz 0 olanlar: Google hicbir
-- zaman sifirdan farkli erisim yazmadi, ama bir gun yazilmis olsaydi o
-- deger bir olcum olurdu ve silinmemeliydi. Meta satirlarina DOKUNULMUYOR:
-- orada 0 okunmus bir deger olabilir. LinkedIn de 0 yaziyordu; senkron
-- artik NULL yaziyor ama gecmisi bu migration'in kapsami disinda (karar:
-- yalniz Google).
--
-- DEFAULT 0 KALIYOR (video_views ile ayni gerekce): kolonu acikca
-- yazmayan eski ekleme yollari (test tohumlari) eski davranisi surduruyor;
-- senkron her zaman acikca yaziyor. Bolumlenmis tabloda DROP NOT NULL
-- bolumlere de iniyor ve tabloyu yeniden yazmiyor. 01_constraints.sql'de
-- insights_daily.reach icin CHECK yok.
ALTER TABLE insights_daily ALTER COLUMN reach DROP NOT NULL;

UPDATE insights_daily i
   SET reach = NULL
  FROM ad_accounts a
 WHERE a.id = i.ad_account_id
   AND a.platform = 'google'::"Platform"
   AND i.reach = 0;
