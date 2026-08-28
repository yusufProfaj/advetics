-- TOPLU VERİ TAZELEME PARTİSİ (Advetics 1.0)
--
-- "Tüm verileri güncelle" tek bir iş değil: seçilen her workspace'in her
-- hesabı için yapı taraması + pencerelere bölünmüş metrik işleri açılıyor.
-- İki yıl tek işte istenemiyor (`backfillSchema` üst sınırı 365 gün).
--
-- PARTİ KAYDI OLMADAN İLERLEME GÖSTERİLEMİYOR: `sync_jobs` satırlarını
-- zamana göre süzmek, aynı anda koşan gecelik süpürmeyi de sayardı ve
-- ilerleme çubuğu %140 gösterirdi.
CREATE TABLE "sync_batches" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "org_id"              UUID          NOT NULL,
  "created_by_user_id"  UUID          NOT NULL,
  "client_ids"          UUID[]        NOT NULL,
  "date_from"           DATE          NOT NULL,
  "date_to"             DATE          NOT NULL,
  "total_jobs"          INTEGER       NOT NULL DEFAULT 0,
  "skipped_jobs"        INTEGER       NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "sync_batches_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_batches_org_id_created_at_idx"
  ON "sync_batches" ("org_id", "created_at" DESC);

ALTER TABLE "sync_batches"
  ADD CONSTRAINT "sync_batches_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- `SET NULL`, CASCADE DEĞİL: parti silinse bile işlerin kaydı kalmalı.
-- `sync_jobs` bir teşhis kaydı ve "bu hesap ne zaman tarandı" sorusunun tek
-- cevabı; partiyle birlikte silmek o cevabı yok ederdi.
ALTER TABLE "sync_jobs" ADD COLUMN "batch_id" UUID;
ALTER TABLE "sync_jobs"
  ADD CONSTRAINT "sync_jobs_batch_id_fkey"
  FOREIGN KEY ("batch_id") REFERENCES "sync_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "sync_jobs_batch_id_idx" ON "sync_jobs" ("batch_id");
