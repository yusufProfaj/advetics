import { describe, expect, it, vi } from 'vitest';
import { SyncProcessorService } from './sync-processor.service';
import type { SyncJobPayload } from './queues';

/**
 * ═══ SİNYAL ZİNCİRİ — METRİK İŞİNİN SONUNDA (MIMARI § 5.1) ═══
 *
 * Kuyruk önceliği BARİYER DEĞİL (CLAUDE.md): sinyal işi metrikle aynı anda
 * kuyruğa girseydi paralel bir slotta yarım günü değerlendirirdi. Zincir
 * metrik işinin BAŞARISINDAN SONRA kuruluyor; başarısız metrik işi sinyal
 * açmıyor. DAVRANIŞ sınanıyor (çağrıyı silmek bu testi düşürür), kaynak
 * taraması değil.
 */

function kur(metrik: () => Promise<{ rows: number; apiCalls: number; note?: string; skipped?: number }>) {
  const kuyruk: Array<Record<string, unknown>> = [];
  const proc = Object.create(SyncProcessorService.prototype) as Record<string, unknown> & {
    process: (p: SyncJobPayload) => Promise<unknown>;
  };
  proc.db = { syncJob: { update: vi.fn(async () => ({})), findUnique: vi.fn(async () => null) } };
  proc.quota = { acquire: vi.fn(async () => ({ allowed: true })) };
  proc.insights = { syncAccount: vi.fn(metrik) };
  proc.queue = {
    enqueue: vi.fn(async (p: Record<string, unknown>) => {
      kuyruk.push(p);
      return { enqueued: true };
    }),
  };
  proc.sinyalHesap = { calistir: vi.fn(async () => ({ rows: 2, note: '2 bulgu' })) };
  proc.logger = { log: () => undefined, error: () => undefined, warn: () => undefined };
  return { proc, kuyruk };
}

const IS = (jobType: SyncJobPayload['jobType'], dateFrom: string, dateTo: string): SyncJobPayload => ({
  syncJobId: '1',
  clientId: 'c',
  platform: 'meta',
  jobType,
  adAccountId: 'a',
  dateFrom,
  dateTo,
});

describe('sinyal zinciri', () => {
  it('KRİTİK: başarılı günlük metrik işi AYNI GÜN için signals_evaluate kuyruğa alıyor', async () => {
    const { proc, kuyruk } = kur(async () => ({ rows: 10, apiCalls: 1 }));
    await proc.process(IS('insights_daily', '2026-10-11', '2026-10-11'));
    expect(kuyruk).toEqual([
      expect.objectContaining({ jobType: 'signals_evaluate', adAccountId: 'a', dateFrom: '2026-10-11', dateTo: '2026-10-11' }),
    ]);
  });

  it('geri düzeltme işi aralığın SON günü için yeniden hesaplatıyor (dönüşümler o gün düzeliyor)', async () => {
    const { proc, kuyruk } = kur(async () => ({ rows: 10, apiCalls: 1 }));
    await proc.process(IS('insights_backfill', '2026-10-05', '2026-10-11'));
    expect(kuyruk[0]).toMatchObject({ jobType: 'signals_evaluate', dateFrom: '2026-10-11' });
  });

  it('KRİTİK: metrik işi DÜŞERSE sinyal işi açılmıyor', async () => {
    const { proc, kuyruk } = kur(async () => {
      throw new Error('platform düştü');
    });
    await expect(proc.process(IS('insights_daily', '2026-10-11', '2026-10-11'))).rejects.toThrow('platform düştü');
    expect(kuyruk).toEqual([]);
  });

  it('gün içi metrik işi zincir kurmuyor (gün kapanmadı)', async () => {
    const { proc, kuyruk } = kur(async () => ({ rows: 10, apiCalls: 1 }));
    await proc.process(IS('insights_realtime', '2026-10-12', '2026-10-12'));
    expect(kuyruk).toEqual([]);
  });

  it('sinyal işi KOTA KAPISINDAN geçmiyor (platform çağrısı yok) ve sonucu iş kaydına yazıyor', async () => {
    const { proc } = kur(async () => ({ rows: 0, apiCalls: 0 }));
    const r = await proc.process(IS('signals_evaluate', '2026-10-11', '2026-10-11'));
    expect(r).toEqual({ rows: 2, note: '2 bulgu' });
    expect((proc.quota as { acquire: ReturnType<typeof vi.fn> }).acquire).not.toHaveBeenCalled();
    expect((proc.sinyalHesap as { calistir: ReturnType<typeof vi.fn> }).calistir).toHaveBeenCalledWith('a', '2026-10-11');
  });
});
