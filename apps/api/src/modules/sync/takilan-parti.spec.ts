import { beforeEach, describe, expect, it } from 'vitest';
import type { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import type { AuditService } from '../audit/audit.service';
import { SyncController } from './sync.controller';

/**
 * ═══ %99'DA DURAN ÇUBUK ═══
 *
 * Canlıda bildirilen hâl: "1259 / 1266 iş · tahmini bir dakikadan az" ve
 * saatlerce hiç değişmedi. Ekran "İşleniyor" yazmaya devam ediyordu.
 *
 * Sebebi tek bir cümlede: `sync_jobs` satırı bir NİYET kaydı, kuyruk ise
 * gerçek. Satır `queued` yazıyorken BullMQ işi Redis'te olmayabiliyor
 * (worker deploy sırasında öldürüldü, iş takılmış sayılıp atıldı, Redis
 * temizlendi) ve o satırı hiçbir worker almıyor. Tabloya bakan hiçbir
 * kontrol ikisini ayırt edemiyor.
 *
 * Buradaki iddialar üç şeyi kilitliyor: durum TANINIYOR, tanı BEDAVA
 * DEĞİLKEN koşmuyor, ve takılan iş GERİ KONABİLİYOR.
 */
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PARTI = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [CLIENT],
  activeClientId: null,
  isOrgAdmin: true,
} as TenantContext;

const REQ = { ip: '1.2.3.4', get: () => 'test', requestId: 'r1' } as never;

/** Bir `sync_jobs` satırının testte kullanılan alanları. */
interface Satir {
  id: bigint;
  clientId: string;
  adAccountId: string | null;
  jobType: string;
  entityLevel: string | null;
  dateFrom: Date | null;
  dateTo: Date | null;
  priority: number;
  queueJobId: string | null;
  nextRetryAt: Date | null;
  status: string;
  createdAt: Date;
}

const ACIK = ['queued', 'running', 'throttled'];

let satirlar: Satir[];
let sonHareket: Date | null;
let toplamIs: number;
/** Kuyrukta GERÇEKTEN duran iş kimlikleri. */
let kuyruktakiler: Set<string>;
let kuyrugaSorulan: string[];
let kuyrugaEklenen: Array<{ jobId: string; syncJobId: string; priority: number }>;
let yeniIsler: unknown[];
let guncellemeler: Array<{ id: bigint; data: Record<string, unknown> }>;
/** Yazma sırası — satır mı önce, kuyruk mu önce. */
let sira: string[];
let ctrl: SyncController;

beforeEach(() => {
  sonHareket = new Date(Date.now() - 3 * 60 * 60_000);
  toplamIs = 10;
  kuyruktakiler = new Set();
  kuyrugaSorulan = [];
  kuyrugaEklenen = [];
  yeniIsler = [];
  guncellemeler = [];
  sira = [];
  satirlar = [
    {
      id: 1n,
      clientId: CLIENT,
      adAccountId: 'acc-1',
      jobType: 'insights_backfill',
      entityLevel: null,
      dateFrom: new Date('2026-01-01T00:00:00Z'),
      dateTo: new Date('2026-01-15T00:00:00Z'),
      priority: 7,
      queueJobId: 'insights_backfill__acc-1__all__2026-01-01__2026-01-15',
      nextRetryAt: null,
      status: 'queued',
      createdAt: new Date(Date.now() - 4 * 60 * 60_000),
    },
  ];

  const tx = {
    syncBatch: {
      findUnique: async () => ({
        id: PARTI,
        dateFrom: new Date('2025-09-04T00:00:00Z'),
        dateTo: new Date('2026-09-03T00:00:00Z'),
        clientIds: [CLIENT],
        totalJobs: toplamIs,
        skippedJobs: 0,
        createdAt: new Date(Date.now() - 5 * 60 * 60_000),
      }),
    },
    syncJob: {
      groupBy: async () => {
        const acik = satirlar.filter((s) => ACIK.includes(s.status)).length;
        const kapali = satirlar.filter((s) => !ACIK.includes(s.status));
        return [
          { status: 'succeeded', _count: { _all: toplamIs - acik - kapali.length } },
          ...kapali.map((s) => ({ status: s.status, _count: { _all: 1 } })),
          { status: 'queued', _count: { _all: acik } },
        ];
      },
      findFirst: async () => ({ jobType: 'insights_backfill' }),
      count: async () => satirlar.filter((s) => ACIK.includes(s.status)).length,
      findMany: async () => satirlar.filter((s) => ACIK.includes(s.status)),
      update: async ({ where, data }: { where: { id: bigint }; data: Record<string, unknown> }) => {
        sira.push(`satır:${where.id}`);
        guncellemeler.push({ id: where.id, data });
        const s = satirlar.find((x) => x.id === where.id);
        if (s && typeof data.status === 'string') s.status = data.status;
        return {};
      },
    },
    adAccount: {
      findMany: async () => [
        {
          id: 'acc-1',
          clientId: CLIENT,
          platform: 'meta',
          name: 'A Meta',
          lastInsightsSyncAt: null,
          lastStructureSyncAt: new Date(),
        },
      ],
    },
    $queryRaw: async (q: Prisma.Sql) => {
      const metin = q.strings.join(' ');
      if (metin.includes('MAX(GREATEST')) return [{ son: sonHareket }];
      return [{ ort: 12, n: 40 }];
    },
  };

  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (t: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;

  const queue = {
    kuyruktaMi: async (idler: string[]) => {
      kuyrugaSorulan.push(...idler);
      return new Map(idler.map((i) => [i, kuyruktakiler.has(i)]));
    },
    yenidenKuyrukla: async (
      payload: { syncJobId: string },
      jobId: string,
      priority: number,
    ) => {
      sira.push(`kuyruk:${jobId}`);
      kuyrugaEklenen.push({ jobId, syncJobId: payload.syncJobId, priority });
    },
    enqueue: async (p: unknown) => {
      yeniIsler.push(p);
      return { enqueued: true };
    },
  } as unknown as SyncQueueService;

  const audit = { record: async () => undefined } as unknown as AuditService;
  ctrl = new SyncController(prisma, queue, audit);
});

describe('tanı', () => {
  it('KRİTİK: kuyrukta olmayan iş KAYIP sayılıyor', async () => {
    // Tablo `queued` diyor, kuyrukta karşılığı yok: bu satırı hiçbir worker
    // almayacak ve çubuk sonsuza kadar eksik kalacak.
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.tani).not.toBeNull();
    expect(r.tani!.kayip).toBe(1);
    expect(r.tani!.kuyrukta).toBe(0);
  });

  it('KRİTİK: kuyrukta duran iş KAYIP DEĞİL', async () => {
    // Ters yön: her açık işi "kayıp" diyen bir kısayol da yukarıdaki testi
    // geçerdi. Kota gecikmesindeki iş normal işleyişin parçası.
    kuyruktakiler.add(satirlar[0]!.queueJobId!);
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.tani!.kayip).toBe(0);
    expect(r.tani!.kuyrukta).toBe(1);
  });

  it('KRİTİK: kayıp iş varken aşama "İşleniyor" DEMİYOR', async () => {
    /*
     * Kullanıcının gördüğü ekranda saatlerce "İşleniyor" yazıyordu ve
     * hiçbir iş işlenmiyordu. Yüzde durduğunda metin de durumu söylemeli.
     */
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.asama).toBe('Takıldı');
  });

  it('KRİTİK: parti İLERLİYORKEN kuyruğa HİÇ sorulmuyor', async () => {
    /*
     * Tanı, açık iş başına bir Redis sorgusu ve çubuk beş saniyede bir
     * yoklanıyor: 1.200 işlik bir partide her yoklamada yüzlerce sorgu
     * demek. Soru ancak parti DURDUĞUNDA anlamlı.
     */
    sonHareket = new Date(Date.now() - 30_000);
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.tani).toBeNull();
    expect(kuyrugaSorulan).toHaveLength(0);
  });

  it('kuyruk kimliği olmayan satır KAYIP', async () => {
    // Kimlik `enqueue` sırasında yazılıyor; yoksa satır kuyruğa hiç ulaşmamış.
    satirlar[0]!.queueJobId = null;
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.tani!.kayip).toBe(1);
  });

  it('kaç açık işe bakıldığı yazılı', async () => {
    // Sessiz kesme yok: tanı sınırı var ve sınıra takıldığı görünmeli.
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.tani!.bakilan).toBe(1);
    expect(r.tani!.acikToplam).toBe(1);
  });
});

describe('KRİTİK: iptal edilen iş BİTMİŞ sayılıyor', () => {
  it('kapatılan işle birlikte parti bitiyor', async () => {
    /*
     * `SyncJobStatus` altı değer taşıyor ama ilerleme yalnızca ikisini
     * sayıyordu. `cancelled` bir işin SON durumu; sayılmadığı için `bitti`
     * hiçbir zaman doğru olmuyordu.
     */
    toplamIs = 1;
    satirlar[0]!.status = 'cancelled';
    const r = await ctrl.bulkRefreshProgress(CTX, PARTI);
    expect(r.iptal).toBe(1);
    expect(r.yuzde).toBe(100);
    expect(r.bitti).toBe(true);
  });
});

describe('kurtarma', () => {
  it('KRİTİK: kayıp iş AYNI satırla geri konuyor, YENİ satır açılmıyor', async () => {
    /*
     * Payda partinin açılışında sabitlendi. Yeni satır açmak eski satırı
     * sonsuza kadar açık bırakır ve çubuk yine bitmezdi.
     */
    const r = await ctrl.bulkRefreshKurtar(CTX, PARTI, REQ);
    expect(r.yenidenKuyruklanan).toBe(1);
    expect(kuyrugaEklenen).toHaveLength(1);
    expect(kuyrugaEklenen[0]!.syncJobId).toBe('1');
    expect(yeniIsler).toHaveLength(0);
  });

  it('KRİTİK: kuyrukta duran işe DOKUNULMUYOR', async () => {
    /*
     * Koşan bir işi yeniden kuyruğa koymak aynı veriyi iki kez çekmek ve
     * kotayı boşa harcamak demek.
     */
    kuyruktakiler.add(satirlar[0]!.queueJobId!);
    const r = await ctrl.bulkRefreshKurtar(CTX, PARTI, REQ);
    expect(r.kuyrukta).toBe(1);
    expect(r.yenidenKuyruklanan).toBe(0);
    expect(kuyrugaEklenen).toHaveLength(0);
    expect(guncellemeler).toHaveLength(0);
  });

  it('KRİTİK: izlenmeyen hesabın işi KAPATILIYOR ve sebebi yazılıyor', async () => {
    /*
     * Hesap silinmiş ya da izlemeden çıkarılmışsa işi geri koymak anlamsız.
     * Ama satırı açık bırakmak da olmaz: çubuk yine bitmez ve kullanıcı aynı
     * düğmeye sonsuza kadar basar.
     */
    satirlar[0]!.adAccountId = 'silinmis-hesap';
    const r = await ctrl.bulkRefreshKurtar(CTX, PARTI, REQ);
    expect(r.vazgecilen).toBe(1);
    expect(guncellemeler[0]!.data.status).toBe('cancelled');
    expect(String(guncellemeler[0]!.data.errorMessage)).toContain('izlenmiyor');
  });

  it('KRİTİK: ÖNCE satır, SONRA kuyruk', async () => {
    /*
     * Ters sırada worker işi alıp `running` yazabiliyor ve bizim
     * güncellememiz onu `queued`a geri çekiyor: iş koşuyorken tabloda
     * kuyrukta görünüyor.
     */
    await ctrl.bulkRefreshKurtar(CTX, PARTI, REQ);
    expect(sira).toEqual(['satır:1', `kuyruk:${satirlar[0]!.queueJobId}`]);
  });

  it('geri konan satırın hata alanları TEMİZLENİYOR', async () => {
    // Eski hata mesajı kalırsa teşhis ekranı çözülmüş bir arızayı gösterir.
    await ctrl.bulkRefreshKurtar(CTX, PARTI, REQ);
    expect(guncellemeler[0]!.data).toMatchObject({
      status: 'queued',
      startedAt: null,
      finishedAt: null,
      errorCode: null,
    });
  });
});
