import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import { SyncController } from './sync.controller';

/**
 * GEÇMİŞ VERİ ÇEKME — panelden tetiklenen geriye dönük senkronizasyon.
 *
 * Veritabanına gitmiyoruz: sınanan şey KARARLAR — kimin için iş açılıyor,
 * hangi tarih aralığı, ve kuru çalışmada gerçekten hiçbir şey olmuyor mu.
 *
 * Üçü de sessiz hata üretebilecek yerler:
 *
 *   1. Kuru çalışma iş AÇMAMALI. Açsaydı "ne olacağını göster" düğmesi
 *      kotayı harcar ve kullanıcı bunu hiç öğrenmezdi.
 *   2. Yapı taraması olmayan hesap ATLANMALI ve sayısı DÖNMELİ. Metrik satırı
 *      kampanya satırı olmadan yazılamıyor; sessizce atlanırsa kullanıcı
 *      "90 gün çektim ama veri yok" der ve sebebi hiçbir ekranda yazmaz.
 *   3. Aralık DÜNDE bitmeli — bugünü "Şimdi güncelle" çekiyor.
 */
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [CLIENT],
  activeClientId: CLIENT,
  isOrgAdmin: true,
} as TenantContext;

interface Row {
  id: string;
  clientId: string | null;
  platform: string;
  name: string;
  lastInsightsSyncAt: Date | null;
  lastStructureSyncAt: Date | null;
}

let rows: Row[];
let enqueued: Array<Record<string, unknown>>;
let ctrl: SyncController;

function account(over: Partial<Row> = {}): Row {
  return {
    id: 'acc-1',
    clientId: CLIENT,
    platform: 'meta',
    name: 'Hesap',
    lastInsightsSyncAt: null,
    lastStructureSyncAt: new Date('2026-08-15T00:00:00Z'),
    ...over,
  };
}

beforeEach(() => {
  rows = [account()];
  enqueued = [];

  const prisma = {
    withTenant: async <T>(_ctx: TenantContext, fn: (tx: unknown) => Promise<T>) =>
      fn({ adAccount: { findMany: async () => rows } }),
  } as unknown as PrismaService;

  const queue = {
    enqueue: async (payload: Record<string, unknown>) => {
      enqueued.push(payload);
      return { enqueued: true };
    },
  } as unknown as SyncQueueService;

  ctrl = new SyncController(prisma, queue);
});

describe('backfill', () => {
  it('KRİTİK: kuru çalışma HİÇBİR iş açmıyor', async () => {
    const res = await ctrl.backfill(CTX, { days: 90, apply: false });

    expect(res.applied).toBe(false);
    expect(res.accountCount).toBe(1);
    expect(enqueued).toEqual([]);
  });

  it('uygulanınca hesap başına BİR iş açıyor', async () => {
    rows = [account({ id: 'a' }), account({ id: 'b' })];

    const res = await ctrl.backfill(CTX, { days: 90, apply: true });

    expect(res.applied).toBe(true);
    expect(res.queued).toBe(2);
    expect(enqueued).toHaveLength(2);
    expect(enqueued[0]).toMatchObject({ jobType: 'insights_backfill', clientId: CLIENT });
  });

  it('KRİTİK: yapı taraması olmayan hesap ATLANIYOR ve sayısı dönüyor', async () => {
    rows = [account({ id: 'a' }), account({ id: 'b', lastStructureSyncAt: null })];

    const res = await ctrl.backfill(CTX, { days: 30, apply: true });

    expect(res.accountCount).toBe(1);
    expect(res.noStructure).toBe(1);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0]).toMatchObject({ adAccountId: 'a' });
  });

  it('aralık DÜNDE bitiyor, bugünü kapsamıyor', async () => {
    // Bugünü de kapsasaydı "Şimdi güncelle" ile aynı günü iki kez çekerdik.
    // Kuyruk mükerrer işi eliyor ama tarih aralıkları farklı olduğu için
    // elemezdi — yani çift kota.
    const res = await ctrl.backfill(CTX, { days: 7, apply: false });

    const today = new Date().toISOString().slice(0, 10);
    expect(res.dateTo < today).toBe(true);
    expect(res.dateFrom < res.dateTo).toBe(true);

    // 7 gün istendi: aralık 7 günü kapsamalı (dünden 7 gün öncesine).
    const span =
      (Date.parse(`${res.dateTo}T00:00:00Z`) - Date.parse(`${res.dateFrom}T00:00:00Z`)) / 86_400_000;
    expect(span).toBe(6);
  });

  it('MÜŞTERİ SEÇİLMEDEN çalışmıyor', async () => {
    // Seçimsiz tetiklemek TÜM portföyün kotasını tek tıkla harcamak olurdu.
    await expect(
      ctrl.backfill({ ...CTX, activeClientId: null }, { days: 90, apply: true }),
    ).rejects.toThrow(/Önce bir müşteri seçin/);
    expect(enqueued).toEqual([]);
  });

  it('izlenen hesap yoksa SEBEBİ söyleniyor', async () => {
    rows = [];
    await expect(ctrl.backfill(CTX, { days: 90, apply: true })).rejects.toThrow(
      /izlemeye alınmış hesap yok/,
    );
  });
});
