-- ADVSTRATEGY İKİNCİ TUR — AKTARIM VE KELİME GRUPLAMA (MIMARI § 6.1, § 6.2)
--
-- VAR OLAN TABLOLARA KOLON EKLENİYOR (adv_oturum, strateji_kelimeleri) ve
-- ikisi de üretimde dolu olabilir. Bu yüzden her yeni kolon ya NULL'a izin
-- veriyor ya da varsayılanı var: eski satırlar migration sırasında geçerli
-- kalıyor, ALTER tabloyu yeniden yazmıyor (sabit varsayılan, Postgres 11+).
-- Üretim sırasıyla sınanıyor: advstrategy-aktarim-uretim-sirasi.spec.ts.
-- İlk AdvStrategy migration'ı (20261008120000) üretimde; ona dokunulmuyor.

-- ── AdvCampaign oturumu: plandan hazır doldurulmuş açılış ─────────────
-- hazir_istem: giriş kutusuna konacak metin (aktarimIstemi). Mesaj olarak
-- YAZILMIYOR: sohbet döngüsü mesajları modelin biçiminde saklıyor ve
-- dışarıdan eklenen cevapsız bir kullanıcı turu döngünün varsayımını bozar.
-- hazir_medyalar: Base varlık kimlikleri (FK yok; varlık silinirse oturum
-- düşmemeli, mesaj ucu varlığı gönderim anında zaten doğruluyor).
ALTER TABLE "adv_oturum"
  ADD COLUMN "hazir_istem"        VARCHAR(4000),
  ADD COLUMN "hazir_medyalar"     UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN "strateji_matris_id" UUID;

-- BİR MATRİS SATIRI = EN ÇOK BİR OTURUM. Yarıda düşen aktarım yeniden
-- denenince açılmış oturum ikinci kez açılmamalı; servisin ön kontrolü
-- yarışta iki isteği birden geçirebilir, son kapı bu indeks.
CREATE UNIQUE INDEX "adv_oturum_strateji_matris_key" ON "adv_oturum" ("strateji_matris_id")
  WHERE "strateji_matris_id" IS NOT NULL;

-- Matris satırı silinirse (plan silinmez ama matris taslakta yeniden yazılır)
-- oturum KALIR: kullanıcının sohbeti onun işi, plandan bağımsız yaşar.
ALTER TABLE "adv_oturum" ADD CONSTRAINT "adv_oturum_strateji_matris_fkey"
  FOREIGN KEY ("strateji_matris_id") REFERENCES "strateji_matrisi"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Kelime grubu elle mi yazıldı ───────────────────────────────────────
-- Otomatik gruplama (tohuma göre) her aramada yeniden koşuyor; kullanıcının
-- elle verdiği grup adı onun kararı ve EZİLMEMELİ. Eski satırların hepsi
-- otomatik sayılıyor (false): ilk turda grup hiç üretilmiyordu, yani
-- dolu bir grup ancak elle yazılmış olabilir. O satırlar aşağıda işaretleniyor.
ALTER TABLE "strateji_kelimeleri" ADD COLUMN "grup_elle" BOOLEAN NOT NULL DEFAULT false;
UPDATE "strateji_kelimeleri" SET "grup_elle" = true WHERE "grup" IS NOT NULL;
