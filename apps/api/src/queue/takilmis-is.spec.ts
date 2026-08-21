import { beforeEach, describe, expect, it } from 'vitest';
import type { AppConfig } from '../config/configuration';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import { SyncQueueService } from './sync-queue.service';

/**
 * MÜKERRER ENGELİ KALICI BİR KİLİDE DÖNÜŞÜYORDU.
 *
 * Tarih taşımayan işlerde (`structure`) kuyruk kimliği SABİT. Aynı kimlikle
 * kuyrukta bir iş varsa `enqueue` sessizce reddediyordu — ve bu, `sync_jobs`
 * satırı yazılmadan ÖNCE oluyordu. Yani engellenen çağrı HİÇBİR İZ
 * bırakmıyordu.
 *
 * Canlıda ürettiği tablo: bir Meta hesabında yapı taraması kotaya takılıp
 * `delayed`e düşüyor, orada bekliyor, ve o sırada kullanıcının bastığı her
 * "Şimdi güncelle" sessizce reddediliyor. Panelde "Yapı: hiç" yazıyor, iş
 * listesinde o hesaba ait tek bir yapı satırı bile yok ve durum
 * kendiliğinden hiç düzelmiyor.
 */
const OTUZ_DK = 30 * 60_000;

interface Eklenen {
  opts: { jobId?: string; delay?: number };
}

let eklenenler: Eklenen[];
let kaldirildi: boolean;

function kur(mevcut: { state: string; yasMs: number } | null) {
  eklenenler = [];
  kaldirildi = false;

  // Redis URL'siz kuruluyor: gerçek bağlantı açılmasın. Kuyruk nesnesi
  // aşağıda elle yerleştiriliyor.
  const config = { redis: { url: '', db: 3, keyPrefix: 'advetics' } } as AppConfig;
  const db = {
    syncJob: {
      create: async () => ({ id: 7n, priority: 4 }),
      update: async () => undefined,
    },
  } as unknown as PrismaAdminService;

  const svc = new SyncQueueService(config, db);

  const job =
    mevcut === null
      ? null
      : {
          getState: async () => mevcut.state,
          timestamp: Date.now() - mevcut.yasMs,
          processedOn: mevcut.state === 'active' ? Date.now() - mevcut.yasMs : undefined,
          remove: async () => {
            kaldirildi = true;
          },
        };

  (svc as unknown as { queueOrNull: unknown }).queueOrNull = {
    getJob: async () => job,
    add: async (_n: string, _p: unknown, opts: Eklenen['opts']) => {
      eklenenler.push({ opts });
    },
  };

  return svc;
}

const IS = {
  clientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  platform: 'meta' as const,
  jobType: 'structure' as const,
  adAccountId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
};

describe('kuyrukta takılmış iş', () => {
  beforeEach(() => {
    eklenenler = [];
    kaldirildi = false;
  });

  it('kuyrukta iş YOKSA normal şekilde ekleniyor', async () => {
    const res = await kur(null).enqueue(IS);
    expect(res.enqueued).toBe(true);
    expect(eklenenler).toHaveLength(1);
  });

  it('`waiting` işe DOKUNULMUYOR — sırasını bekliyor, yakında koşacak', async () => {
    const res = await kur({ state: 'waiting', yasMs: 5 * OTUZ_DK }).enqueue(IS);
    expect(res.enqueued).toBe(false);
    expect(kaldirildi).toBe(false);
  });

  it('KRİTİK: kullanıcı ekranda beklerken `delayed` iş KALDIRILIYOR', async () => {
    // Kilidin bizzat kendisi: kotaya takılıp geciktirilmiş bir yapı taraması,
    // kullanıcının bastığı her "Şimdi güncelle"yi sessizce yutuyordu.
    const res = await kur({ state: 'delayed', yasMs: 60_000 }).enqueue({
      ...IS,
      interactive: true,
    });
    expect(kaldirildi).toBe(true);
    expect(res.enqueued).toBe(true);
  });

  it('kullanıcı beklemiyorsa TAZE `delayed` işe dokunulmuyor — gecikme kasıtlı', async () => {
    const res = await kur({ state: 'delayed', yasMs: 60_000 }).enqueue(IS);
    expect(res.enqueued).toBe(false);
    expect(kaldirildi).toBe(false);
  });

  it('ESKİ `delayed` iş takılmış sayılıyor — kendiliğinden de kurtulmalı', async () => {
    const res = await kur({ state: 'delayed', yasMs: OTUZ_DK + 60_000 }).enqueue(IS);
    expect(kaldirildi).toBe(true);
    expect(res.enqueued).toBe(true);
  });

  it('TAZE `active` işe dokunulmuyor — worker gerçekten çalışıyor olabilir', async () => {
    const res = await kur({ state: 'active', yasMs: 60_000 }).enqueue(IS);
    expect(res.enqueued).toBe(false);
    expect(kaldirildi).toBe(false);
  });

  it('ESKİ `active` iş takılmış sayılıyor — worker ölmüşse iş sonsuza kadar active kalır', async () => {
    const res = await kur({ state: 'active', yasMs: OTUZ_DK + 60_000 }).enqueue(IS);
    expect(kaldirildi).toBe(true);
    expect(res.enqueued).toBe(true);
  });

  it('reddedilen çağrının SEBEBİ işin YAŞINI da söylüyor', async () => {
    // "zaten kuyrukta" tek başına yetmiyordu: 2 dakikalık bir iş ile 3
    // saattir asılı kalmış bir iş aynı cümleye düşüyordu.
    const res = await kur({ state: 'waiting', yasMs: 3 * 60 * 60_000 }).enqueue(IS);
    expect(res.reason).toContain('180 dk');
  });
});
