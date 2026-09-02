import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import type { AuditService } from '../audit/audit.service';
import { SyncController } from './sync.controller';

/**
 * ═══ TOPLU TAZELEME UCU ═══
 *
 * Bu uç kotayı GERİ ALINAMAZ biçimde harcıyor: iki yıllık bir tazeleme
 * yüzlerce platform çağrısı demek. En kritik iddialar bu yüzden "yanlışlıkla
 * çalışmasın" etrafında.
 */
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const YABANCI = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [CLIENT_A, CLIENT_B],
  activeClientId: null,
  isOrgAdmin: true,
} as TenantContext;

let enqueued: Array<Record<string, unknown>>;
let partiler: Array<Record<string, unknown>>;
let ctrl: SyncController;

const REQ = { ip: '1.2.3.4', get: () => 'test', requestId: 'r1' } as never;

beforeEach(() => {
  enqueued = [];
  partiler = [];

  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
      fn({
        adAccount: {
          findMany: async () => [
            {
              id: 'acc-1',
              clientId: CLIENT_A,
              platform: 'meta',
              name: 'A Meta',
              lastInsightsSyncAt: null,
              lastStructureSyncAt: new Date('2026-08-01T00:00:00Z'),
            },
            {
              id: 'acc-2',
              clientId: CLIENT_B,
              platform: 'google',
              name: 'B Google',
              lastInsightsSyncAt: null,
              // Yapı taraması HİÇ koşmamış — sayılıyor ama atlanmıyor.
              lastStructureSyncAt: null,
            },
          ],
        },
        syncBatch: {
          create: async ({ data }: { data: Record<string, unknown> }) => {
            partiler.push(data);
            return { id: 'batch-1' };
          },
          update: async ({ data }: { data: Record<string, unknown> }) => {
            partiler.push({ guncelleme: data });
            return {};
          },
        },
      }),
  } as unknown as PrismaService;

  const queue = {
    enqueue: async (p: Record<string, unknown>) => {
      enqueued.push(p);
      return { enqueued: true };
    },
  } as unknown as SyncQueueService;

  const audit = { record: async () => undefined } as unknown as AuditService;

  ctrl = new SyncController(prisma, queue, audit);
});

const isler = (): string[] => enqueued.map((e) => String(e.jobType));

describe('tahmin (apply: false)', () => {
  it('KRİTİK: HİÇBİR İŞ AÇMIYOR', async () => {
    /*
     * Kota geri alınamaz biçimde harcanıyor. Tahmin adımının iş açması,
     * kullanıcının "ne kadar sürecek" diye sorup istemeden başlatması
     * demekti.
     */
    const r = await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A],
      years: 2,
      breakdowns: false,
      apply: false,
    }, REQ);
    expect(enqueued).toHaveLength(0);
    expect(partiler).toHaveLength(0);
    expect(r).toMatchObject({ applied: false });
  });

  it('kaç iş açılacağını SÖYLÜYOR', async () => {
    const r = (await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A, CLIENT_B],
      years: 2,
      breakdowns: false,
      apply: false,
    }, REQ)) as { jobCount: number; windowCount: number; accountCount: number };
    // Meta hesabı: 1 yapı + 9 metrik = 10.
    // Google hesabı: + 9 arama terimi + 9 anahtar kelime = 28.
    // (Arama terimi/anahtar kelime geçmişi eskiden HİÇ açılmıyordu; raporda
    //  "Geçen ay" seçilince tablo boş çıkıyordu.)
    expect(r.accountCount).toBe(2);
    expect(r.windowCount).toBe(9);
    expect(r.jobCount).toBe(38);
  });

  it('yapı taraması olmayan hesap SAYILIYOR ama atlanmıyor', async () => {
    /*
     * `backfill` ucunda atlanıyor çünkü orada yapı işi açılmıyor. Burada
     * açılıyor ve atlamak, yeni bağlanan bir hesabın geçmişinin hiç gelmemesi
     * demekti.
     */
    const r = (await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A, CLIENT_B],
      years: 1,
      breakdowns: false,
      apply: false,
    }, REQ)) as { noStructure: number; accountCount: number };
    expect(r.noStructure).toBe(1);
    expect(r.accountCount).toBe(2);
  });

  it('kırılım açıkken iş sayısı ARTIYOR', async () => {
    const kapali = (await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 2, breakdowns: false, apply: false,
    }, REQ)) as { jobCount: number };
    const acik = (await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 2, breakdowns: true, apply: false,
    }, REQ)) as { jobCount: number };
    expect(acik.jobCount).toBeGreaterThan(kapali.jobCount);
  });
});

describe('uygulama (apply: true)', () => {
  it('parti açılıyor ve işler ona bağlanıyor', async () => {
    await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 1, breakdowns: false, apply: true,
    }, REQ);
    expect(enqueued.length).toBeGreaterThan(0);
    // HER İŞ PARTİYE BAĞLI: bağlanmayan iş ilerleme çubuğunun paydasına
    // girmez ve çubuk asla %100'e ulaşmaz.
    for (const e of enqueued) expect(e.batchId).toBe('batch-1');
  });

  it('KRİTİK: yapı işi her hesap için ÖNCE', async () => {
    await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 1, breakdowns: false, apply: true,
    }, REQ);
    expect(isler()[0]).toBe('structure');
  });

  it('KRİTİK: payda KUYRUĞA GİREN iş sayısı', async () => {
    /*
     * Mükerrer engeline takılan iş `sync_jobs` satırı yazmıyor; planı payda
     * yapmak yüzdeyi asla %100'e çıkarmazdı.
     */
    const guncelleme = partiler.find((p) => p.guncelleme) as
      | { guncelleme: { totalJobs: number } }
      | undefined;
    await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 1, breakdowns: false, apply: true,
    }, REQ);
    const son = partiler.filter((p) => p.guncelleme).pop() as
      | { guncelleme: { totalJobs: number } }
      | undefined;
    expect(guncelleme ?? son).toBeDefined();
    expect(son!.guncelleme.totalJobs).toBe(enqueued.length);
  });

  it('KRİTİK: `interactive` GÖNDERİLMİYOR', async () => {
    /*
     * Bayrak kuyruktaki takılmış iş tespitini agresifleştiriyor; yüzlerce
     * işlik bir partide meşru gecikmeleri "takılmış" sayıp kaldırırdı.
     */
    await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 1, breakdowns: false, apply: true,
    }, REQ);
    for (const e of enqueued) expect(e.interactive).toBeUndefined();
  });
});

describe('KRİTİK: kapsam', () => {
  it('erişilemeyen workspace REDDEDİLİYOR', async () => {
    // RLS zaten süzüyor ama fark söylenmezse "12 seçtim, 9 işlendi" hâli
    // sebepsiz kalır.
    await expect(
      ctrl.bulkRefresh(CTX, {
        clientIds: [YABANCI], years: 1, breakdowns: false, apply: false,
      }, REQ),
    ).rejects.toThrow(/erişiminiz yok/i);
  });

  it('seçilmeyen workspace’in hesabı İŞ AÇMIYOR', async () => {
    await ctrl.bulkRefresh(CTX, {
      clientIds: [CLIENT_A], years: 1, breakdowns: false, apply: true,
    }, REQ);
    // Yalnızca CLIENT_A'nın hesabı (acc-1).
    for (const e of enqueued) expect(e.adAccountId).toBe('acc-1');
  });

  it('aktif müşteri seçimi ARANMIYOR', async () => {
    /*
     * `backfill` istiyor ama bu uç kapsamı açıkça alıyor; aktif müşteri
     * istemek, düğmenin bulunduğu ekran ("Tüm müşteriler" görünümü) tam da o
     * hâldeyken çalışmaması demekti.
     */
    const r = await ctrl.bulkRefresh(
      { ...CTX, activeClientId: null } as TenantContext,
      { clientIds: [CLIENT_A], years: 1, breakdowns: false, apply: false },
      REQ,
    );
    expect(r).toMatchObject({ applied: false });
  });
});

/**
 * Kaynak taraması: uç org yöneticisine kapalı olmak zorunda.
 */
describe('yetki', () => {
  const KAYNAK = readFileSync(join(__dirname, 'sync.controller.ts'), 'utf8');

  it('KRİTİK: uç org yöneticisi istiyor', () => {
    /*
     * Yüzlerce çağrı ve saatler süren bir işlem; müşteri düzeyindeki bir
     * kullanıcıya açmak, tek tıkla ajansın bütün kotasını harcatmak olurdu.
     */
    const i = KAYNAK.indexOf("@Post('bulk-refresh')");
    expect(i, 'uç bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(KAYNAK.slice(i, i + 220)).toContain('@RequireOrgAdmin()');
  });
});
