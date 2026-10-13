-- İŞLETME ADRESİNİN HARİTA KONUMU (ERİŞİM turu K4, 2026-10-13).
--
-- "Bölgemde çok kişi görsün" reklamının ilk seçeneği "işletme adresinin
-- çevresi X km". Meta custom_locations ve Google proximity ENLEM/BOYLAM
-- istiyor; adres metnini koordinata çeviren bir servis bu depoda yok ve
-- uydurulmuyor. Konum Marka Merkezi'ne elle giriliyor (Google Haritalar'dan
-- kopyalanan "enlem, boylam").
--
-- İKİSİ BİRLİKTE: yalnız enlemi dolu bir satır, okuma tarafında "konum var"
-- sanılıp boylamı 0 olan (Atlantik) bir nokta üretebilirdi. Aralık da
-- dayatılıyor: biçimi shared şeması doğruluyor, bu son savunma hattı.
ALTER TABLE "clients" ADD COLUMN "address_latitude" DOUBLE PRECISION;
ALTER TABLE "clients" ADD COLUMN "address_longitude" DOUBLE PRECISION;

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_adres_konumu_birlikte"
  CHECK (("address_latitude" IS NULL) = ("address_longitude" IS NULL));

ALTER TABLE "clients"
  ADD CONSTRAINT "clients_adres_konumu_aralik"
  CHECK (
    ("address_latitude" IS NULL OR "address_latitude" BETWEEN -90 AND 90)
    AND ("address_longitude" IS NULL OR "address_longitude" BETWEEN -180 AND 180)
  );
