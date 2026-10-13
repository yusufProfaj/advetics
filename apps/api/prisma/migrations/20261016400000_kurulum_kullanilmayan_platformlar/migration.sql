-- KULLANILMAYAN PLATFORM BEYANI (docs/panel-sadelestirme/MIMARI.md Ç-6, 2026-10-13).
--
-- Kurulum tek sayaçla sayılınca Meta'yı ya da Google'ı hiç kullanmayan bir
-- workspace'in sayacı sonsuza kadar "eksik" derdi. Sistem bunu TAHMİN
-- ETMİYOR (atanmamış hesap "henüz atanmadı" da olabilir); kullanıcı Marka
-- Merkezi › Kurulum'da açıkça söylüyor ve beyan burada duruyor.
--
-- EKLEMELİ, VERİ SİLMİYOR: varsayılan boş dizi = beyan yok = bugünkü
-- davranış (iki platform da sayılıyor). Mevcut satırlar kendiliğinden boş.
--
-- İki kısıt şemanın son savunma hattı (biçimi shared şeması doğruluyor):
--   · değer kümesi yalnız meta/google: tanınmayan bir dize sayaçta hiçbir
--     adımı düşürmez ama ekranda "kullanılmıyor" diye bir şey yazdırabilirdi;
--   · en çok bir platform: ikisi birden kapalıysa workspace'in reklam
--     kuracağı platform kalmıyor (arşivlenmeli), sayaç "0 / 0" derdi.
ALTER TABLE "workspace_kurulum"
  ADD COLUMN "kullanilmayan_platformlar" TEXT[] NOT NULL DEFAULT '{}';

ALTER TABLE "workspace_kurulum"
  ADD CONSTRAINT "workspace_kurulum_kullanilmayan_kume"
  CHECK ("kullanilmayan_platformlar" <@ ARRAY['meta', 'google']::TEXT[]);

ALTER TABLE "workspace_kurulum"
  ADD CONSTRAINT "workspace_kurulum_kullanilmayan_en_cok_bir"
  CHECK (cardinality("kullanilmayan_platformlar") <= 1);
