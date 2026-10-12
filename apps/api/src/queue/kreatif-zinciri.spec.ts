import { describe, expect, it, vi } from 'vitest';
import { QuotaThrottleError, SyncProcessorService } from './sync-processor.service';
import type { SyncJobPayload } from './queues';

/**
 * ═══ KREATİF ETİKETLEME ZİNCİRİ VE İŞ SONUCU (Paket D, MIMARI § 4) ═══
 *
 * DAVRANIŞ sınanıyor (çağrıyı silmek bu testi düşürür), kaynak taraması
 * değil: (1) günlük metrik BAŞARIYLA bitince `creative_tags` kuyruğa
 * giriyor, düşerse girmiyor; (2) iş hesap işinin kota kapısından geçmiyor;
 * (3) "hepsi geçici hatayla düştü" sessiz başarı değil, GECİKMELİ tekrar.
 */

function kur(o: { metrik?: () => Promise<{ rows: number; apiCalls: number }>; etiket?: () => Promise<unknown> } = {}) {
  const kuyruk: Array<Record<string, unknown>> = [];
  const guncellemeler: Array<Record<string, unknown>> = [];
  const proc = Object.create(SyncProcessorService.prototype) as Record<string, unknown> & {
    process: (p: SyncJobPayload) => Promise<unknown>;
  };
  proc.db = {
    syncJob: {
      update: vi.fn(async (a: { data: Record<string, unknown> }) => {
        guncellemeler.push(a.data);
        return {};
      }),
      findUnique: vi.fn(async () => null),
    },
  };
  proc.quota = { acquire: vi.fn(async () => ({ allowed: true })) };
  proc.insights = { syncAccount: vi.fn(o.metrik ?? (async () => ({ rows: 10, apiCalls: 1 }))) };
  proc.queue = {
    enqueue: vi.fn(async (p: Record<string, unknown>) => {
      kuyruk.push(p);
      return { enqueued: true };
    }),
  };
  proc.sinyalHesap = { calistir: vi.fn(async () => ({ rows: 0, note: 'x' })) };
  proc.kreatifEtiket = { calistir: vi.fn(o.etiket ?? (async () => ({ sonuc: 'basarili', satir: 3, not: 'seçilen 3: 3 etiketlendi' }))) };
  proc.logger = { log: () => undefined, error: () => undefined, warn: () => undefined };
  return { proc, kuyruk, guncellemeler };
}

const IS = (jobType: SyncJobPayload['jobType'], platform: SyncJobPayload['platform'] = 'meta'): SyncJobPayload => ({
  syncJobId: '1',
  clientId: 'c',
  platform,
  jobType,
  adAccountId: 'a',
  dateFrom: '2026-10-11',
  dateTo: '2026-10-11',
});

describe('kreatif etiketleme zinciri', () => {
  it('KRİTİK: başarılı günlük metrik işi creative_tags kuyruğa alıyor (tarihsiz, hesap başına)', async () => {
    const { proc, kuyruk } = kur();
    await proc.process(IS('insights_daily'));
    expect(kuyruk.filter((k) => k.jobType === 'creative_tags')).toEqual([{ clientId: 'c', platform: 'meta', jobType: 'creative_tags', adAccountId: 'a' }]);
  });

  it('KRİTİK: metrik işi DÜŞERSE etiketleme açılmıyor; gün içi ve LinkedIn zincir kurmuyor', async () => {
    const d = kur({
      metrik: async () => {
        throw new Error('platform düştü');
      },
    });
    await expect(d.proc.process(IS('insights_daily'))).rejects.toThrow('platform düştü');
    expect(d.kuyruk).toEqual([]);
    const g = kur();
    await g.proc.process(IS('insights_realtime'));
    expect(g.kuyruk).toEqual([]);
    const l = kur();
    await l.proc.process(IS('insights_daily', 'linkedin'));
    expect(l.kuyruk.filter((k) => k.jobType === 'creative_tags')).toEqual([]);
  });
});

describe('creative_tags işi', () => {
  it('KRİTİK: hesap işinin kota kapısından geçmiyor; sonuç ve NOT iş kaydına', async () => {
    const { proc, guncellemeler } = kur();
    const r = await proc.process({ ...IS('creative_tags'), dateFrom: undefined, dateTo: undefined });
    expect(r).toEqual({ rows: 3, note: 'seçilen 3: 3 etiketlendi' });
    expect((proc.quota as { acquire: ReturnType<typeof vi.fn> }).acquire).not.toHaveBeenCalled();
    expect(guncellemeler.at(-1)).toMatchObject({ status: 'succeeded', rowsUpserted: 3, note: 'seçilen 3: 3 etiketlendi' });
  });

  it('KRİTİK: tekrar_dene sessiz başarı DEĞİL: throttled + not, gecikmeli tekrar (deneme sayılmayan yol)', async () => {
    const { proc, guncellemeler } = kur({ etiket: async () => ({ sonuc: 'tekrar_dene', not: 'seçilen 2: 2 geçici hatayla ertelendi' }) });
    const hata = await proc.process(IS('creative_tags')).catch((e: unknown) => e);
    expect(hata).toBeInstanceOf(QuotaThrottleError);
    expect((hata as QuotaThrottleError).retryAfterMs).toBeGreaterThanOrEqual(60 * 60 * 1000);
    expect(guncellemeler.at(-1)).toMatchObject({ status: 'throttled', note: 'seçilen 2: 2 geçici hatayla ertelendi' });
  });
});
