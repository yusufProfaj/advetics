import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/configuration';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import { LINKEDIN_PIVOT } from '../modules/connections/providers/linkedin.provider';
import { planla } from '../modules/sync/toplu-tazeleme';
import { PLATFORM_METRIK_SEVIYELERI, isYapilabilir, platformSeviyeleri } from './platform-isleri';
import { SyncQueueService } from './sync-queue.service';

/**
 * ═══ LINKEDIN'E YAPILAMAYACAK İŞ GÖNDERİLMİYOR ═══
 *
 * Üretimde son 7 günde 865 işin 549'u düşmüştü ve büyük kısmı iki kesin
 * hataydı: LinkedIn kırılımı (yazılmadı) ve LinkedIn hesap seviyesi metriği
 * (karşılığı yok). İkincisi daha pahalıydı: `insights_daily` `account` ile
 * başlıyor, ilk seviye patlayınca kampanya/grup/reklam seviyeleri hiç
 * çekilmiyordu. Ayrıntı `platform-isleri.ts`.
 */

const yorumsuz = (dosya: string): string =>
  readFileSync(resolve(__dirname, dosya), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('platform kapsamı', () => {
  it('LinkedIn metrik seviyeleri sağlayıcının pivot eşlemesiyle AYNI', () => {
    // Eksik seviye sessizce hiç çekilmez, fazla seviye her seferinde düşer.
    expect([...PLATFORM_METRIK_SEVIYELERI.linkedin].sort()).toEqual(
      Object.keys(LINKEDIN_PIVOT).sort(),
    );
  });

  it('LinkedIn günlük işi hesap seviyesini ATLIYOR ama kalanları çekiyor', () => {
    expect(platformSeviyeleri('linkedin', ['account', 'campaign', 'ad_group', 'ad'])).toEqual({
      seviyeler: ['campaign', 'ad_group', 'ad'],
      atlanan: ['account'],
    });
  });

  it('Meta ve Google dört seviyeyi de koruyor', () => {
    for (const p of ['meta', 'google'] as const) {
      expect(platformSeviyeleri(p, ['account', 'campaign', 'ad_group', 'ad']).atlanan).toEqual([]);
    }
  });

  it('LinkedIn kırılımı yapılamaz; Meta ve Google yapabilir', () => {
    expect(isYapilabilir('linkedin', 'insights_breakdowns')).toBe(false);
    expect(isYapilabilir('meta', 'insights_breakdowns')).toBe(true);
    expect(isYapilabilir('google', 'insights_breakdowns')).toBe(true);
    // Süzgeç yalnızca kırılımı kapatıyor: LinkedIn'in çalışan işleri açık.
    for (const t of ['structure', 'insights_daily', 'insights_backfill', 'initial_backfill'] as const) {
      expect(isYapilabilir('linkedin', t), t).toBe(true);
    }
  });
});

describe('kuyruğa giriş yolları süzgeci kullanıyor', () => {
  it('toplu tazeleme LinkedIn için kırılım PLANLAMIYOR (paydaya girmesin)', () => {
    const plan = planla({
      hesaplar: [
        { id: 'l', clientId: 'c', platform: 'linkedin' },
        { id: 'm', clientId: 'c', platform: 'meta' },
      ],
      from: '2026-09-01',
      to: '2026-09-20',
      kirilimlar: true,
    });
    const kirilim = plan.filter((i) => i.jobType === 'insights_breakdowns').map((i) => i.adAccountId);
    expect(kirilim).toEqual(['m']);
    // LinkedIn hesabı plandan düşmüyor, yalnızca kırılımı.
    expect(plan.some((i) => i.adAccountId === 'l' && i.jobType === 'insights_backfill')).toBe(true);
  });

  it('kuyruk LinkedIn kırılımını reddediyor ve sync_jobs satırı YAZMIYOR', async () => {
    let yazildi = 0;
    let eklendi = 0;
    const svc = new SyncQueueService(
      { redis: { url: '', db: 3, keyPrefix: 'advetics' } } as AppConfig,
      {
        syncJob: {
          create: async () => {
            yazildi++;
            return { id: 1n, priority: 4 };
          },
          update: async () => undefined,
        },
      } as unknown as PrismaAdminService,
    );
    (svc as unknown as { queueOrNull: unknown }).queueOrNull = {
      getJob: async () => null,
      add: async () => {
        eklendi++;
        return { id: 'x' };
      },
    };

    const r = await svc.enqueue({
      clientId: 'c',
      platform: 'linkedin',
      jobType: 'insights_breakdowns',
      adAccountId: 'a',
      dateFrom: '2026-09-01',
      dateTo: '2026-09-07',
    });
    expect(r.enqueued).toBe(false);
    expect(r.reason).toContain('desteklemiyor');
    expect(yazildi).toBe(0);
    expect(eklendi).toBe(0);
  });

  it('gecelik süpürme hesap döngüsünde süzgeci çağırıyor', () => {
    const k = yorumsuz('./sync-processor.service.ts');
    const bas = k.indexOf('private async fanOut(');
    const son = k.indexOf('private datesForJob(', bas);
    if (bas < 0 || son < 0) throw new Error('fanOut gövdesi bulunamadı — tarama boşa düştü.');
    expect(k.slice(bas, son)).toMatch(/if \(!isYapilabilir\(acct\.platform as Platform, payload\.jobType\)\)/);
  });

  it('"Şimdi güncelle" kırılım işini süzgeçten geçirerek açıyor', () => {
    const k = yorumsuz('../modules/sync/sync.controller.ts');
    const satir = k.split('\n').find((s) => s.includes("isler.push({ jobType: 'insights_breakdowns'"));
    if (!satir) throw new Error('kırılım satırı bulunamadı — tarama boşa düştü.');
    const i = k.indexOf(satir);
    const kosul = k.slice(k.lastIndexOf('if (', i), i);
    expect(kosul).toContain("isYapilabilir(account.platform as Platform, 'insights_breakdowns')");
  });
});
