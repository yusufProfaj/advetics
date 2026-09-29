import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { cekilmisGunler, gunlukAnahtar } from './gunluk-tekrar';

/**
 * ═══ "DÜN" BİR KEZ ÇEKİLİR ═══
 *
 * Saatlik `sweep:daily` aynı günü her saat yeniden çekiyordu: üretimde hesap
 * başına günde ~11 kez ve Google günlük kotasının üçte biri
 * (gunluk-tekrar.ts).
 */
const yorumsuz = readFileSync(resolve(__dirname, 'sync-processor.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function fanOutGovdesi(): string {
  const bas = yorumsuz.indexOf('private async fanOut(');
  const son = yorumsuz.indexOf('private datesForJob(', bas);
  if (bas < 0 || son < 0) throw new Error('fanOut gövdesi bulunamadı — tarama boşa düştü.');
  return yorumsuz.slice(bas, son);
}

describe('cekilmisGunler', () => {
  it('DATE kolonunun UTC gece yarısı değerinden doğru günü okuyor', () => {
    const k = cekilmisGunler([
      { adAccountId: 'a', dateFrom: new Date('2026-09-28T00:00:00Z') },
      { adAccountId: null, dateFrom: new Date('2026-09-28T00:00:00Z') },
      { adAccountId: 'b', dateFrom: null },
    ]);
    expect([...k]).toEqual([gunlukAnahtar('a', '2026-09-28')]);
  });
});

describe('süpürme', () => {
  it('yalnızca BAŞARILI günlük işleri sayıyor — düşen iş bir sonraki saatte tekrar açılmalı', () => {
    const g = fanOutGovdesi();
    const i = g.indexOf('cekilmisGunler(');
    if (i < 0) throw new Error('cekilmisGunler çağrısı bulunamadı.');
    const sorgu = g.slice(i, g.indexOf('})', g.indexOf('select:', i)));
    expect(sorgu).toContain("jobType: 'insights_daily'");
    expect(sorgu).toContain("status: 'succeeded'");
  });

  it('hesabın dünü çekilmişse iş kuyruğa GİRMİYOR ve sayısı nota yazılıyor', () => {
    const g = fanOutGovdesi();
    const kontrol = g.indexOf('cekilmis.has(gunlukAnahtar(acct.id, dates.from))');
    const kuyruk = g.indexOf('this.queue.enqueue(', kontrol);
    expect(kontrol).toBeGreaterThan(0);
    expect(kuyruk).toBeGreaterThan(kontrol);
    expect(g.slice(kontrol, kuyruk)).toContain('continue;');
    expect(g).toContain('hesabın dünü zaten çekilmiş');
  });
});

describe('süpürme — ÇALIŞTIRILARAK', () => {
  it('dünü çekilmiş hesap atlanıyor, çekilmemiş ve düşmüş olan kuyruğa giriyor', async () => {
    const { SyncProcessorService } = await import('./sync-processor.service');
    const dun = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const hesap = (id: string) => ({
      id,
      name: id,
      clientId: 'c',
      platform: 'google',
      timezone: 'UTC',
      lastInsightsSyncAt: null,
      lastStructureSyncAt: new Date(),
    });
    let sorguKosulu: Record<string, unknown> | undefined;
    const kuyruga: string[] = [];

    const svc = Object.create(SyncProcessorService.prototype) as Record<string, unknown>;
    svc.logger = { log: () => undefined, warn: () => undefined };
    svc.db = {
      adAccount: { findMany: async () => [hesap('cekilmis'), hesap('yeni'), hesap('dusmus')] },
      syncJob: {
        findMany: async (a: { where: Record<string, unknown> }) => {
          sorguKosulu = a.where;
          // Sorgu yalnızca başarılıları istiyor; "dusmus" burada YOK.
          return [{ adAccountId: 'cekilmis', dateFrom: new Date(`${dun}T00:00:00Z`) }];
        },
      },
    };
    svc.queue = {
      enqueue: async (p: { adAccountId: string }) => {
        kuyruga.push(p.adAccountId);
        return { enqueued: true };
      },
    };

    const r = await (svc as unknown as {
      fanOut(p: unknown): Promise<{ note: string }>;
    }).fanOut({ syncJobId: '', clientId: '', platform: 'meta', jobType: 'insights_daily' });

    expect(kuyruga).toEqual(['yeni', 'dusmus']);
    expect(sorguKosulu).toMatchObject({ jobType: 'insights_daily', status: 'succeeded' });
    expect(r.note).toContain('1 hesabın dünü zaten çekilmiş');
  });

  it('başka iş türlerinde süzgeç devrede DEĞİL (gün içi metrik her turda çekilir)', async () => {
    const { SyncProcessorService } = await import('./sync-processor.service');
    const kuyruga: string[] = [];
    let sorgulandi = false;
    const svc = Object.create(SyncProcessorService.prototype) as Record<string, unknown>;
    svc.logger = { log: () => undefined, warn: () => undefined };
    svc.db = {
      adAccount: {
        findMany: async () => [
          { id: 'a', name: 'a', clientId: 'c', platform: 'google', timezone: 'UTC' },
        ],
      },
      syncJob: { findMany: async () => ((sorgulandi = true), []) },
    };
    svc.queue = {
      enqueue: async (p: { adAccountId: string }) => (kuyruga.push(p.adAccountId), { enqueued: true }),
    };
    await (svc as unknown as { fanOut(p: unknown): Promise<unknown> }).fanOut({
      syncJobId: '',
      clientId: '',
      platform: 'meta',
      jobType: 'insights_realtime',
    });
    expect(kuyruga).toEqual(['a']);
    expect(sorgulandi).toBe(false);
  });
});
