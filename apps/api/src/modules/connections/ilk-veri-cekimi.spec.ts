import { describe, expect, it } from 'vitest';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import { ConnectionsService } from './connections.service';

/**
 * BAĞLANTI KURULUR KURULMAZ GEÇMİŞ VERİ ÇEKİLİYOR.
 *
 * Havuz modelinde bu doğru olmazdı: bağlanan Meta kimliği onlarca müşterinin
 * hesabını görüyordu ve hepsini açmak istenmeyen hesapların kotasını
 * yakardı — keşif bu yüzden `syncEnabled: false` yazıyordu.
 *
 * Workspace modelinde bağlanan hesap MÜŞTERİNİN KENDİ hesabı: altından çıkan
 * her şey zaten o müşteriye ait. Kullanıcının bağlandıktan sonra ikinci bir
 * ekranda tek tek anahtar açması, "bağladım ama veri gelmiyor" hâlinin en sık
 * sebebiydi.
 */
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC1 = '44444444-4444-4444-4444-444444444444';
const ACC2 = '55555555-5555-5555-5555-555555555555';

interface Cagrilar {
  hesapGuncelle: Array<Record<string, unknown>>;
  profilGuncelle: Array<Record<string, unknown>>;
  isler: Array<Record<string, unknown>>;
}

function servis(hesaplar = [{ id: ACC1, name: 'A' }, { id: ACC2, name: 'B' }]): {
  svc: ConnectionsService;
  c: Cagrilar;
} {
  const c: Cagrilar = { hesapGuncelle: [], profilGuncelle: [], isler: [] };

  const admin = {
    adAccount: {
      updateMany: (a: Record<string, unknown>) => {
        c.hesapGuncelle.push(a);
        return Promise.resolve({ count: hesaplar.length });
      },
      findMany: () => Promise.resolve(hesaplar),
    },
    socialProfile: {
      updateMany: (a: Record<string, unknown>) => {
        c.profilGuncelle.push(a);
        return Promise.resolve({ count: 0 });
      },
    },
  } as unknown as PrismaAdminService;

  const queue = {
    enqueue: (p: Record<string, unknown>) => {
      c.isler.push(p);
      return Promise.resolve({ enqueued: true });
    },
  } as unknown as SyncQueueService;

  const svc = new ConnectionsService(
    {} as never,
    admin,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    queue,
  );
  return { svc, c };
}

/** Özel metot — kasıtlı: sınanan davranış bir yayın yolu değil, bir kurulum adımı. */
async function calistir(svc: ConnectionsService): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).ilkVeriCekimi(CONN, CLIENT, 'meta');
}

describe('bağlantıdan sonra ilk veri çekimi', () => {
  it('düzenek gerçekten çağrıları yakalıyor', async () => {
    const { svc, c } = servis();
    await calistir(svc);
    expect(c.hesapGuncelle.length + c.isler.length).toBeGreaterThan(0);
  });

  it('KRİTİK: izleme AÇILIYOR — kapalı hesap hiçbir taramaya girmiyor', async () => {
    const { svc, c } = servis();
    await calistir(svc);
    expect(c.hesapGuncelle[0]).toEqual({
      where: { connectionId: CONN, clientId: CLIENT },
      data: { syncEnabled: true },
    });
  });

  it('KRİTİK: kapsam BU bağlantı VE BU müşteri — başkasının hesabına dokunmuyor', async () => {
    // `clientId` düşerse aynı bağlantının başka müşterilere atanmış
    // hesapları da açılırdı; `connectionId` düşerse aynı müşterinin başka
    // bağlantısı açılırdı. İkisi de sessiz kota tüketimi.
    const { svc, c } = servis();
    await calistir(svc);
    const w = c.hesapGuncelle[0]!.where as Record<string, unknown>;
    expect(w.connectionId).toBe(CONN);
    expect(w.clientId).toBe(CLIENT);
  });

  it('sosyal profillerde de izleme açılıyor — organik gönderi süpürmesi buna bakıyor', async () => {
    const { svc, c } = servis();
    await calistir(svc);
    expect(c.profilGuncelle[0]).toEqual({
      where: { connectionId: CONN, clientId: CLIENT },
      data: { syncEnabled: true },
    });
  });

  it('KRİTİK: her hesap için ÖNCE structure, SONRA initial_backfill', async () => {
    /*
     * SIRA ÖNEMLİ: metrikler kampanya/reklam satırlarına bağlanıyor. Önce
     * metrik çekmek, bağlanacak satırı olmayan veri demek.
     */
    const { svc, c } = servis([{ id: ACC1, name: 'A' }]);
    await calistir(svc);
    expect(c.isler.map((i) => i.jobType)).toEqual(['structure', 'initial_backfill']);
  });

  it('KRİTİK: geçmiş 90 GÜN ve KAMPANYA seviyesinde', async () => {
    // Reklam seviyesinde 90 gün çekmek yeni bir hesabın kotasını saatlerce
    // bloklar — karar `insights-sync.service.ts` içinde yazılı.
    const { svc, c } = servis([{ id: ACC1, name: 'A' }]);
    await calistir(svc);
    const backfill = c.isler.find((i) => i.jobType === 'initial_backfill')!;
    expect(backfill.entityLevel).toBe('campaign');

    const bas = new Date(`${backfill.dateFrom as string}T00:00:00Z`).getTime();
    const bit = new Date(`${backfill.dateTo as string}T00:00:00Z`).getTime();
    expect(Math.round((bit - bas) / 86_400_000)).toBe(90);
  });

  it('tarihler YYYY-MM-DD dizgesi — Date nesnesi saat dilimi kaydırıyor', async () => {
    const { svc, c } = servis([{ id: ACC1, name: 'A' }]);
    await calistir(svc);
    const b = c.isler.find((i) => i.jobType === 'initial_backfill')!;
    expect(b.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(b.dateTo).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('her hesap için ayrı iş — iki hesap dört iş', async () => {
    const { svc, c } = servis();
    await calistir(svc);
    expect(c.isler).toHaveLength(4);
    expect(new Set(c.isler.map((i) => i.adAccountId))).toEqual(new Set([ACC1, ACC2]));
  });

  it('kuyruk düşerse bağlantı geri ALINMIYOR — hata yutulmuyor ama fırlatılmıyor', async () => {
    /*
     * Bu noktada token kaydedildi ve kullanıcı bağlandı. Kuyruk erişilemezse
     * bağlantıyı geri almak, çalışan bir yetkilendirmeyi çöpe atmak olurdu.
     * Sessiz kalmak da olmaz — sebebi log'a yazılıyor.
     */
    const { svc } = servis();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (svc as any).queue = {
      enqueue: () => Promise.reject(new Error('redis yok')),
    };
    await expect(calistir(svc)).resolves.toBeUndefined();
  });
});
