-- STRATEJİ MATRİSİ NİYET KISITI: VIDEO_IZLENME
--
-- AdvCampaign rehberi Meta kataloğuna VIDEO_IZLENME niyetini ekledi
-- (packages/shared/src/reklam/meta/niyetler.ts). Kısıt NIYET_KODLARI ile aynı
-- küme olmak zorunda (strateji-kayit.spec.ts); büyümezse AdvStrategy'nin video
-- satırı üretimde INSERT'te düşer. Kısıt bir tipe değil düz metne baktığı için
-- düşür-kur güvenli ve aynı transaction'da.
ALTER TABLE "strateji_matrisi" DROP CONSTRAINT "strateji_matrisi_niyet_chk";
ALTER TABLE "strateji_matrisi" ADD CONSTRAINT "strateji_matrisi_niyet_chk" CHECK ("niyet" IN (
    'FORM', 'WHATSAPP', 'SITE', 'SATIS', 'ONE_CIKAR', 'IG_MESAJ', 'TELEFON',
    'ERISIM', 'VIDEO_IZLENME', 'MESSENGER', 'COK_KANAL_MESAJ', 'WHATSAPP_CAGRI', 'SITE_MESAJ', 'YEREL_YARICAP'
  ));
