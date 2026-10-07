-- "META'YA YAZMAYI DURDUR" ANAHTARI (TASARIM.md § 11.10, T-56)
--
-- Beklenmedik bir canlı arızada (yanlış bir sürüm, Meta tarafında bir
-- değişiklik) bütün Meta yazmalarını tek noktadan durdurur. Okumalar
-- etkilenmez: durumu görmeye devam etmek olayı teşhis etmenin yolu.
-- Kim, ne zaman, neden: anahtarla BİRLİKTE yazılır.

ALTER TABLE "ajans_ayari"
  ADD COLUMN "meta_yazma_durduruldu" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "durduran_id"           UUID,
  ADD COLUMN "durdurma_at"           TIMESTAMPTZ(6),
  ADD COLUMN "durdurma_sebebi"       VARCHAR(500);

-- Durdurulmuşsa zaman ve sebep ZORUNLU: sebepsiz bir durdurma, sabah gelen
-- ekibe "neden hiçbir şey yayınlanmıyor" sorusunu cevapsız bırakır.
ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_durdurma_chk" CHECK (
  NOT "meta_yazma_durduruldu"
  OR ("durdurma_at" IS NOT NULL AND "durdurma_sebebi" IS NOT NULL AND length(trim("durdurma_sebebi")) > 0)
);

ALTER TABLE "ajans_ayari" ADD CONSTRAINT "ajans_ayari_durduran_fkey"
  FOREIGN KEY ("durduran_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
