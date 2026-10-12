import { describe, expect, it, vi } from 'vitest';
import { buildJobId, layerForJob, type SyncJobPayload } from './queues';
import { SyncProcessorService } from './sync-processor.service';

/**
 * ═══ GERİ BESLEME İŞİNİN KUYRUK YOLU (Paket E, MIMARI § 5.3) ═══
 *
 * DAVRANIŞ sınanıyor (çağrıyı silmek testi düşürür), kaynak taraması değil:
 *   · iş kimliği WORKSPACE BAŞINA: kimlik 'na'ya düşseydi BullMQ'nun mükerrer
 *     engeli ilk workspace'ten sonrakileri sessizce atardı,
 *   · süpürme her bekleyen workspace için iş açıyor ve sayıyı notta söylüyor,
 *   · iş hesap işinin kota kapısından geçmiyor (kota istek başına, işin içinde),
 *     sonucu ve notu iş kaydına yazıyor; düşerse kayıt da düşüyor.
 */
function kur(calistir: () => Promise<{ rows: number; apiCalls: number; note: string }>, bekleyen: string[] = []) {
  const kuyruk: Array<Record<string, unknown>> = [];
  const proc = Object.create(SyncProcessorService.prototype) as Record<string, unknown> & {
    process: (p: SyncJobPayload) => Promise<{ rows: number; note?: string }>;
  };
  const update = vi.fn(async () => ({}));
  proc.db = { syncJob: { update, findUnique: vi.fn(async () => null) } };
  proc.quota = { acquire: vi.fn(async () => ({ allowed: true })) };
  proc.queue = {
    enqueue: vi.fn(async (p: Record<string, unknown>) => {
      kuyruk.push(p);
      return { enqueued: true };
    }),
  };
  proc.geriBesleme = { calistir: vi.fn(calistir), bekleyenWorkspaceler: vi.fn(async () => bekleyen) };
  proc.logger = { log: () => undefined, error: () => undefined, warn: () => undefined };
  return { proc, kuyruk, update };
}

const IS = (clientId: string): SyncJobPayload => ({ syncJobId: '7', clientId, platform: 'meta', jobType: 'lead_feedback_send' });

describe('iş kimliği', () => {
  it('KRİTİK: lead_feedback_send kimliği workspace’e bağlı (iki workspace iki kimlik)', () => {
    const a = buildJobId({ jobType: 'lead_feedback_send', clientId: 'a' });
    const b = buildJobId({ jobType: 'lead_feedback_send', clientId: 'b' });
    expect(a).toBe('lead_feedback_send__a__all');
    expect(a).not.toBe(b);
  });

  it('başka türlerin kimliği DEĞİŞMEDİ (kuyruktaki işlerin mükerrer engeli deploy’da bozulmasın)', () => {
    expect(buildJobId({ jobType: 'leads_reconcile', clientId: 'a' })).toBe('leads_reconcile__na__all');
  });

  it('katman: çekirdek metriklerin arkasında', () => {
    expect(layerForJob({ jobType: 'lead_feedback_send' } as SyncJobPayload)).toBe('insights_backfill');
  });
});

describe('süpürme ve işleyici', () => {
  it('KRİTİK: süpürme bekleyen her workspace için iş açıyor; not sayıyı söylüyor', async () => {
    const { proc, kuyruk } = kur(async () => ({ rows: 0, apiCalls: 0, note: '' }), ['c1', 'c2']);
    const r = await proc.process(IS(''));
    expect(kuyruk).toEqual([
      { clientId: 'c1', platform: 'meta', jobType: 'lead_feedback_send' },
      { clientId: 'c2', platform: 'meta', jobType: 'lead_feedback_send' },
    ]);
    expect(r.note).toContain('2 workspace');
  });

  it('KRİTİK: iş gönderim servisini çağırıyor, kota kapısından geçmiyor, notu iş kaydına yazıyor', async () => {
    const { proc, update } = kur(async () => ({ rows: 3, apiCalls: 1, note: 'İletildi: 3 · 1 istek' }));
    const r = await proc.process(IS('c1'));
    expect(r).toEqual({ rows: 3, note: 'İletildi: 3 · 1 istek' });
    expect((proc.geriBesleme as { calistir: ReturnType<typeof vi.fn> }).calistir).toHaveBeenCalledWith('c1');
    expect((proc.quota as { acquire: ReturnType<typeof vi.fn> }).acquire).not.toHaveBeenCalled();
    expect(update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'succeeded', rowsUpserted: 3, note: 'İletildi: 3 · 1 istek' }) }),
    );
  });

  it('servis düşerse iş kaydı başarısız ve hata yukarı çıkıyor', async () => {
    const { proc, update } = kur(async () => {
      throw new Error('veritabanı düştü');
    });
    await expect(proc.process(IS('c1'))).rejects.toThrow('veritabanı düştü');
    expect(update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }));
  });
});
