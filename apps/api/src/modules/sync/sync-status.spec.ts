import { beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { SyncController } from './sync.controller';

/**
 * "VERİ NEDEN YOK" TEŞHİS UCU.
 *
 * Bu paket veritabanına gitmiyor: sınanan şey KARARLAR — hangi hesap listeye
 * giriyor, engelin sebebi hangi cümleyle yazılıyor, sayaçlar neyi sayıyor.
 * Prisma'nın süzgeç semantiğini taklit etmek, taklidi test etmek olurdu.
 *
 * Korunan hata gerçek ve pahalı: bir workspace'te Meta verisi hiç gelmiyordu,
 * bağlantı doğruydu ve panelde bakılacak tek bir alan yoktu. Altı ayrı arıza
 * aynı boş grafiğe düşüyor, ayırt etmenin tek yolu sunucuya SSH ile girmekti.
 */
const CTX: TenantContext = {
  orgId: '11111111-1111-1111-1111-111111111111',
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: ['aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  activeClientId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  isOrgAdmin: true,
} as TenantContext;

interface HesapSatiri {
  id: string;
  name: string;
  platform: string;
  status: string;
  syncEnabled: boolean;
  lastStructureSyncAt: Date | null;
  lastInsightsSyncAt: Date | null;
  connection: { status: string };
  client: { status: string } | null;
}

interface IsSatiri {
  id: bigint;
  jobType: string;
  entityLevel: string | null;
  status: string;
  attempts: number;
  rowsUpserted: number;
  apiCallsUsed: number;
  errorCode: string | null;
  errorMessage: string | null;
  adAccountId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

const SAGLAM_HESAP: HesapSatiri = {
  id: 'acc-1',
  name: 'Mirnas — Meta',
  platform: 'meta',
  status: 'active',
  syncEnabled: true,
  lastStructureSyncAt: new Date('2026-08-20T06:00:00Z'),
  lastInsightsSyncAt: new Date('2026-08-21T06:00:00Z'),
  connection: { status: 'active' },
  client: { status: 'active' },
};

const IS: IsSatiri = {
  id: 4211n,
  jobType: 'insights_backfill',
  entityLevel: 'campaign',
  status: 'succeeded',
  attempts: 1,
  rowsUpserted: 0,
  apiCallsUsed: 12,
  errorCode: null,
  errorMessage: null,
  adAccountId: 'acc-1',
  createdAt: new Date('2026-08-21T05:00:00Z'),
  startedAt: new Date('2026-08-21T05:00:01Z'),
  finishedAt: new Date('2026-08-21T05:00:40Z'),
};

let hesapArgs: { where?: Record<string, unknown> } | null = null;
let isArgs: { take?: number } | null = null;

function kur(hesaplar: HesapSatiri[], isler: IsSatiri[] = [], isToplam = isler.length) {
  hesapArgs = null;
  isArgs = null;

  const tx = {
    adAccount: {
      findMany: async (args: { where?: Record<string, unknown> }) => {
        hesapArgs = args;
        return hesaplar;
      },
    },
    syncJob: {
      findMany: async (args: { take?: number }) => {
        isArgs = args;
        return isler;
      },
      count: async () => isToplam,
    },
  };

  const prisma = {
    withTenant: async <T>(_ctx: TenantContext, fn: (t: unknown) => Promise<T>) => fn(tx),
  } as unknown as PrismaService;

  return new SyncController(prisma, null as never);
}

describe('GET /sync/status — teşhis', () => {
  beforeEach(() => {
    hesapArgs = null;
    isArgs = null;
  });

  it('HAVUZ HESAPLARI listeye girmiyor — sorgu atanmamışları eliyor', async () => {
    // `ad_accounts` RLS politikasının NULL dalı org yöneticisine havuzun
    // tamamını açıyor, aktif müşteri seçiliyken bile. Süzgeç düşerse bu ekran
    // ajansın yüzlerce atanmamış hesabını bu müşterinin sorunuymuş gibi
    // listeler — Genel Bakış'taki `hiddenAccounts` hatasının aynısı.
    await kur([SAGLAM_HESAP]).status(CTX);
    expect(hesapArgs!.where).toEqual({ clientId: { not: null } });
  });

  it('sync_jobs.id JSON’a girebiliyor — BigInt string’e çevriliyor', async () => {
    const res = await kur([SAGLAM_HESAP], [IS]).status(CTX);
    expect(res.recentJobs[0].id).toBe('4211');
    // BigInt olduğu gibi dönseydi uç nokta burada 500 verirdi.
    expect(() => JSON.stringify(res)).not.toThrow();
  });

  it('başarılı ama SIFIR satır yazan iş listede görünüyor', async () => {
    // Bu, "atadım veri gelmiyor" hâlinin en sinsi biçimi: iş `succeeded`
    // bitiyor, `rowsUpserted` 0 ve bir daha denenmiyor.
    const res = await kur([SAGLAM_HESAP], [IS]).status(CTX);
    expect(res.recentJobs[0]).toMatchObject({ status: 'succeeded', rowsUpserted: 0 });
  });

  it('platformun hata mesajı yanıta GİRİYOR — panelde okunabilsin', async () => {
    const res = await kur(
      [SAGLAM_HESAP],
      [{ ...IS, status: 'failed', errorCode: 'permission', errorMessage: '(#200) …fbtrace_id: Ab1' }],
    ).status(CTX);
    expect(res.recentJobs[0].errorMessage).toContain('fbtrace_id');
  });

  it('kesme SESSİZ DEĞİL — toplam iş sayısı ayrıca dönüyor', async () => {
    const res = await kur([SAGLAM_HESAP], [IS], 340).status(CTX);
    expect(res.recentJobsTotal).toBe(340);
    expect(isArgs!.take).toBeGreaterThan(0);
  });

  it('sağlam hesapta engel YOK', async () => {
    const res = await kur([SAGLAM_HESAP]).status(CTX);
    expect(res.accounts[0].blockedReason).toBeNull();
    expect(res.accounts[0].inScheduledSweep).toBe(true);
  });

  it('yapı taraması hiç koşmadıysa engel BUNU söylüyor', async () => {
    const res = await kur([{ ...SAGLAM_HESAP, lastStructureSyncAt: null }]).status(CTX);
    expect(res.accounts[0].structureReady).toBe(false);
    expect(res.accounts[0].blockedReason).toContain('Yapı taraması');
  });

  it('yapı koştu ama metrik hiç gelmediyse AYRI bir cümle — ikisi farklı iş', async () => {
    const res = await kur([{ ...SAGLAM_HESAP, lastInsightsSyncAt: null }]).status(CTX);
    expect(res.accounts[0].blockedReason).toContain('metrik hiç çekilmedi');
    expect(res.accounts[0].blockedReason).not.toContain('Yapı taraması');
  });

  it('süpürme engeli yapı engelinin ÖNÜNDE — hesap hiç çekilmiyorsa yapı ikincil', async () => {
    const res = await kur([
      { ...SAGLAM_HESAP, syncEnabled: false, lastStructureSyncAt: null },
    ]).status(CTX);
    expect(res.accounts[0].blockedReason).toContain('İzleme kapalı');
  });

  it('elenen hesaplar sebep sebep sayılıyor ve BİR KEZ sayılıyor', async () => {
    const res = await kur([
      { ...SAGLAM_HESAP, id: 'a', syncEnabled: false },
      // Üç engeli birden olan hesap TEK kategoriye yazılmalı; iki kez
      // sayılırsa toplam hesap sayısını aşar ve sayaç güven kaybeder.
      {
        ...SAGLAM_HESAP,
        id: 'b',
        syncEnabled: false,
        status: 'disabled',
        connection: { status: 'needs_reauth' },
      },
      { ...SAGLAM_HESAP, id: 'c', status: 'unknown' },
      { ...SAGLAM_HESAP, id: 'd', connection: { status: 'needs_reauth' } },
      { ...SAGLAM_HESAP, id: 'e', client: { status: 'archived' } },
    ]).status(CTX);

    expect(res.excluded).toEqual({
      syncDisabled: 2,
      clientInactive: 1,
      connectionInactive: 1,
      accountStatus: 1,
    });
    const toplam = Object.values(res.excluded).reduce((a, b) => a + b, 0);
    expect(toplam).toBeLessThanOrEqual(res.accounts.length);
  });

  it('accountCount yalnızca İZLENEN hesapları sayıyor — eski sözleşme korunuyor', async () => {
    const res = await kur([
      SAGLAM_HESAP,
      { ...SAGLAM_HESAP, id: 'b', syncEnabled: false },
      { ...SAGLAM_HESAP, id: 'c', lastInsightsSyncAt: null },
    ]).status(CTX);
    expect(res.accountCount).toBe(2);
    expect(res.neverSyncedCount).toBe(1);
    expect(res.accounts).toHaveLength(3);
  });

  it('oldestSyncAt EN ESKİYİ veriyor — en yenisi bayat hesabı gizlerdi', async () => {
    const res = await kur([
      { ...SAGLAM_HESAP, id: 'a', lastInsightsSyncAt: new Date('2026-08-21T06:00:00Z') },
      { ...SAGLAM_HESAP, id: 'b', lastInsightsSyncAt: new Date('2026-08-14T06:00:00Z') },
    ]).status(CTX);
    expect(res.oldestSyncAt).toBe('2026-08-14T06:00:00.000Z');
  });

  it('işin hangi hesaba ait olduğu ADIYLA dönüyor — kimlikle teşhis edilemez', async () => {
    const res = await kur([SAGLAM_HESAP], [IS]).status(CTX);
    expect(res.recentJobs[0].adAccountName).toBe('Mirnas — Meta');
  });
});
