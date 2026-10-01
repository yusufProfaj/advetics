import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GUN_ICI_ARALIK_DK,
  GUN_ICI_SUPURME_DK,
  gunIciAtlanir,
  sonGunIciIsler,
} from './gun-ici-aralik';

/**
 * ═══ GOOGLE GÜN İÇİ METRİĞİ SAATLİK ═══
 *
 * 30 dakikalık süpürme Google çağrılarının %84'üydü (gun-ici-aralik.ts).
 */
const dk = (n: number) => n * 60_000;
const simdi = new Date('2026-10-01T12:00:05Z');

describe('gunIciAtlanir', () => {
  it('Google: son iş 30 dk önceyse atlanıyor, 60 dk önceyse çekiliyor', () => {
    expect(gunIciAtlanir('google', new Date(simdi.getTime() - dk(30)), simdi)).toBe(true);
    expect(gunIciAtlanir('google', new Date(simdi.getTime() - dk(60)), simdi)).toBe(false);
  });

  it('kayıt gecikmesi hesabı İKİ SAATE itmiyor: 59 dk 50 sn önceki iş atlatmıyor', () => {
    const neredeyseSaat = new Date(simdi.getTime() - dk(60) + 10_000);
    expect(gunIciAtlanir('google', neredeyseSaat, simdi)).toBe(false);
  });

  it('hiç işi olmayan Google hesabı çekiliyor', () => {
    expect(gunIciAtlanir('google', undefined, simdi)).toBe(false);
  });

  it('Meta ve LinkedIn hiç atlanmıyor — az önce elle tazelenmiş olsa bile', () => {
    const azOnce = new Date(simdi.getTime() - dk(2));
    expect(gunIciAtlanir('meta', azOnce, simdi)).toBe(false);
    expect(gunIciAtlanir('linkedin', azOnce, simdi)).toBe(false);
  });
});

describe('sonGunIciIsler', () => {
  it('hesap başına EN SON işi tutuyor', () => {
    const h = sonGunIciIsler([
      { adAccountId: 'a', createdAt: new Date('2026-10-01T10:00:00Z') },
      { adAccountId: 'a', createdAt: new Date('2026-10-01T11:00:00Z') },
      { adAccountId: 'a', createdAt: new Date('2026-10-01T10:30:00Z') },
      { adAccountId: null, createdAt: new Date('2026-10-01T11:59:00Z') },
    ]);
    expect(h.get('a')?.toISOString()).toBe('2026-10-01T11:00:00.000Z');
    expect(h.size).toBe(1);
  });
});

describe('zamanlayıcı ile sabit ayrışmıyor', () => {
  it('sweep:realtime deseni GUN_ICI_SUPURME_DK ile aynı aralıkta', () => {
    const kaynak = readFileSync(resolve(__dirname, 'sync-queue.service.ts'), 'utf8');
    const satir = kaynak.split('\n').find((l) => l.includes("name: 'sweep:realtime'"));
    if (!satir) throw new Error('sweep:realtime satırı bulunamadı — tarama boşa düştü.');
    expect(satir).toContain(`pattern: '*/${GUN_ICI_SUPURME_DK} * * * *'`);
  });

  it('Google gerçekten seyreltiliyor (kullanıcı kararı: saatlik)', () => {
    expect(GUN_ICI_ARALIK_DK.google).toBe(60);
    expect(GUN_ICI_ARALIK_DK.meta).toBe(GUN_ICI_SUPURME_DK);
  });
});

describe('süpürme — ÇALIŞTIRILARAK', () => {
  async function kos(sonIsler: Array<{ adAccountId: string; createdAt: Date }>) {
    const { SyncProcessorService } = await import('./sync-processor.service');
    const hesap = (id: string, platform: string) => ({
      id,
      name: id,
      clientId: 'c',
      platform,
      timezone: 'UTC',
      lastInsightsSyncAt: null,
      lastStructureSyncAt: new Date(),
    });
    const kuyruga: string[] = [];
    let sorguKosulu: Record<string, unknown> | undefined;
    const svc = Object.create(SyncProcessorService.prototype) as Record<string, unknown>;
    svc.logger = { log: () => undefined, warn: () => undefined };
    svc.db = {
      adAccount: {
        findMany: async () => [
          hesap('g-yeni', 'google'),
          hesap('g-eski', 'google'),
          hesap('g-hic', 'google'),
          hesap('m-yeni', 'meta'),
        ],
      },
      syncJob: {
        findMany: async (a: { where: Record<string, unknown> }) => {
          sorguKosulu = a.where;
          return sonIsler;
        },
      },
    };
    svc.queue = {
      enqueue: async (p: { adAccountId: string }) => (kuyruga.push(p.adAccountId), { enqueued: true }),
    };
    const r = await (svc as unknown as { fanOut(p: unknown): Promise<{ note: string }> }).fanOut({
      syncJobId: '',
      clientId: '',
      platform: 'meta',
      jobType: 'insights_realtime',
    });
    return { kuyruga, sorguKosulu, note: r.note };
  }

  it('yarım saat önce çekilen Google hesabı atlanıyor, Meta her turda çekiliyor, sayı nota yazılıyor', async () => {
    const an = Date.now();
    const { kuyruga, sorguKosulu, note } = await kos([
      { adAccountId: 'g-yeni', createdAt: new Date(an - dk(30)) },
      { adAccountId: 'g-eski', createdAt: new Date(an - dk(61)) },
      // Meta hesabının yeni işi sorguya hiç girmemeli; girse bile atlanmamalı.
      { adAccountId: 'm-yeni', createdAt: new Date(an - dk(1)) },
    ]);
    expect(kuyruga).toEqual(['g-eski', 'g-hic', 'm-yeni']);
    expect(sorguKosulu).toMatchObject({
      jobType: 'insights_realtime',
      adAccountId: { in: ['g-yeni', 'g-eski', 'g-hic'] },
    });
    expect(note).toContain('1 hesap son bir saat içinde çekildi');
  });
});
