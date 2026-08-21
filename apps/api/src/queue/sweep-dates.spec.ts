import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SyncProcessorService } from './sync-processor.service';

/**
 * ZAMANLANMIŞ İŞ TARİH ARALIĞI OLMADAN KUYRUĞA GİRMEMELİ.
 *
 * Canlıda şu oldu ve aylarca görünmedi: `sweep:keywords` her gece 04:47'de
 * `keyword_insights` işi kuyruğa atıyordu, ama `datesForJob` o tür için bir
 * dal taşımıyordu ve `undefined` dönüyordu. İş her seferinde
 *
 *     [missing_dates] keyword_insights tarih aralığı olmadan geldi
 *
 * ile düşüyordu. Sonuç: GOOGLE ANAHTAR KELİME VERİSİ HİÇ TOPLANMADI. Tek iz
 * `sync_jobs` tablosundaydı ve o tabloyu okuyan bir ekran da yoktu.
 *
 * Bu dosya iki şeyi birden tutuyor: türetilen aralıkların şekli, ve
 * ZAMANLAYICI İLE TÜRETİCİNİN AYNI LİSTEYİ TAŞIDIĞI. İkincisi olmadan yeni
 * bir zamanlanmış iş eklemek aynı sessiz hatayı tekrar üretir.
 */

/** Tarih aralığı ZORUNLU olan iş türleri — eksikse `missing_dates` ile düşer. */
const TARIH_ISTEYENLER = [
  'insights_realtime',
  'insights_daily',
  'insights_backfill',
  'keyword_insights',
] as const;

// Servis yalnızca saf yardımcısı için kuruluyor; hiçbir bağımlılığa
// dokunulmuyor. `datesForJob` private — `hesap-sahiplenme.spec.ts` ile aynı
// desen.
const N = null as never;
const proc = new SyncProcessorService(N, N, N, N, N, N, N, N, N, N, N, N, N) as unknown as {
  datesForJob: (t: string, tz: string) => { from: string; to: string } | undefined;
};

describe('süpürme tarih aralıkları', () => {
  for (const tur of TARIH_ISTEYENLER) {
    it(`${tur} için aralık TÜRETİLİYOR — yoksa iş missing_dates ile düşer`, () => {
      const r = proc.datesForJob(tur, 'Europe/Istanbul');
      expect(r, `${tur} için datesForJob dalı yok`).toBeDefined();
      expect(r!.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r!.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r!.from <= r!.to).toBe(true);
    });
  }

  it('anahtar kelimeler metrik geri düzeltmesiyle AYNI pencereyi kullanıyor', () => {
    // Aynı atıf gecikmesine tabiler; tek gün çekmek kapanmamış dönüşümleri
    // eksik gösterirdi.
    expect(proc.datesForJob('keyword_insights', 'Europe/Istanbul')).toEqual(
      proc.datesForJob('insights_backfill', 'Europe/Istanbul'),
    );
  });

  it('yapı taraması tarih İSTEMİYOR — aralık üretmek yanıltıcı olurdu', () => {
    expect(proc.datesForJob('structure', 'Europe/Istanbul')).toBeUndefined();
  });

  it('KAYNAK TARAMASI: zamanlanan her iş türünün karşılığı var', () => {
    const src = readFileSync(join(__dirname, 'sync-queue.service.ts'), 'utf8');
    const bas = src.indexOf('const schedules: Array<');
    if (bas === -1) {
      throw new Error('installSchedules listesi bulunamadı — tarama boşa düştü, testi güncelle.');
    }
    const dilim = src.slice(bas, src.indexOf('];', bas));
    const turler = [...dilim.matchAll(/jobType: '([a-z_]+)'/g)].map((m) => m[1]!);
    if (turler.length === 0) {
      throw new Error('zamanlayıcı listesinden iş türü çıkarılamadı — tarama boşa düştü.');
    }

    // Tarih isteyen bir tür zamanlanıyorsa `datesForJob` onu TANIMALI.
    for (const t of turler) {
      if ((TARIH_ISTEYENLER as readonly string[]).includes(t)) {
        expect(proc.datesForJob(t, 'Europe/Istanbul'), `${t} zamanlanıyor ama aralığı yok`).toBeDefined();
      }
    }
  });
});
