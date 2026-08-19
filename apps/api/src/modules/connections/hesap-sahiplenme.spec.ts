import { describe, expect, it } from 'vitest';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { ConnectionsService } from './connections.service';

/**
 * ═══ AYNI HESAP İKİ SATIR OLMUYOR — AMA SAHİPLİĞİ YARIM KALIYORDU ═══
 *
 * `ad_accounts` tekil anahtarı BAĞLANTIYA DEĞİL ORGANİZASYONA bağlı
 * (`platform + externalId + orgId`); `social_profiles` de öyle
 * (`orgId + externalId`). Yani havuz döneminde keşfedilmiş bir reklam hesabı,
 * müşterinin kendi Meta hesabıyla yeniden bağlanınca ikinci satır AÇMIYOR:
 * var olan satır güncelleniyor ve `connectionId` yeni bağlantıya geçiyor.
 *
 * Ama upsert `clientId`'yi bilerek güncellemiyor (havuz modelinde doğruydu:
 * "Hesapları yenile" atamaları sıfırlamamalı). Sonuç sessizdi: satırın
 * BAĞLANTISI yeni workspace'i gösteriyor, ATAMASI hâlâ boş. `ilkVeriCekimi`
 * hesapları `{ connectionId, clientId }` ile arıyor, eşleşme olmuyor, izleme
 * açılmıyor, geçmiş veri gelmiyor — ve ekran "bağlandı" diyor.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const MIA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONN = '33333333-3333-3333-3333-333333333333';

interface Cagrilar {
  hesapSahiplen: Array<Record<string, unknown>>;
  profilSahiplen: Array<Record<string, unknown>>;
  sayim: Array<Record<string, unknown>>;
}

function servis(connClientId: string | null, cakisanSayisi = 0): {
  svc: ConnectionsService;
  c: Cagrilar;
} {
  const c: Cagrilar = { hesapSahiplen: [], profilSahiplen: [], sayim: [] };

  const admin = {
    platformConnection: {
      findUniqueOrThrow: () => Promise.resolve({ orgId: ORG, clientId: connClientId }),
    },
    adAccount: {
      upsert: () => Promise.resolve({}),
      updateMany: (a: Record<string, unknown>) => {
        c.hesapSahiplen.push(a);
        return Promise.resolve({ count: 2 });
      },
      count: (a: Record<string, unknown>) => {
        c.sayim.push(a);
        return Promise.resolve(cakisanSayisi);
      },
    },
    socialProfile: {
      upsert: () => Promise.resolve({}),
      updateMany: (a: Record<string, unknown>) => {
        c.profilSahiplen.push(a);
        return Promise.resolve({ count: 1 });
      },
    },
  } as unknown as PrismaAdminService;

  const registry = {
    get: () => ({
      listAdAccounts: () =>
        Promise.resolve([
          {
            externalId: 'act_1',
            name: 'Mia',
            currency: 'TRY',
            timezone: 'Europe/Istanbul',
            status: 'active',
            raw: {},
          },
        ]),
      listSocialProfiles: () => Promise.resolve([]),
    }),
  } as never;

  const svc = new ConnectionsService(
    {} as never,
    admin,
    { encrypt: () => ({ data: Buffer.from(''), keyVersion: 1 }) } as never,
    {} as never,
    registry,
    {} as never,
    {} as never,
  );
  return { svc, c };
}

async function kesfet(svc: ConnectionsService): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (svc as any).discoverAndStore(CONN, 'meta', 'token');
}

describe('workspace bağlantısı — sahiplenme', () => {
  it('düzenek gerçekten çağrıları yakalıyor', async () => {
    const { svc, c } = servis(MIA);
    await kesfet(svc);
    expect(c.hesapSahiplen.length).toBeGreaterThan(0);
  });

  it('KRİTİK: SAHİPSİZ reklam hesapları bu workspace’e sahiplendiriliyor', async () => {
    const { svc, c } = servis(MIA);
    await kesfet(svc);
    expect(c.hesapSahiplen[0]).toEqual({
      where: { connectionId: CONN, clientId: null },
      data: { clientId: MIA },
    });
  });

  it('KRİTİK: BAŞKA müşteriye atanmış hesap TAŞINMIYOR', async () => {
    /*
     * `where` yalnızca `clientId: null` satırları kapsıyor. Kapsamasaydı,
     * Mia Yapı'nın Meta hesabından görünen ama Fenbay'a atanmış bir reklam
     * hesabı sessizce Mia'ya geçerdi — iki müşterinin aynı hesabı görmesi
     * gerçek bir belirsizlik ve insan kararı ister.
     */
    const { svc, c } = servis(MIA);
    await kesfet(svc);
    const w = c.hesapSahiplen[0]!.where as Record<string, unknown>;
    expect(w.clientId).toBeNull();
  });

  it('KRİTİK: çakışma SAYILIYOR ve log’a yazılıyor — sessiz atlama yok', async () => {
    const { svc, c } = servis(MIA, 3);
    await kesfet(svc);
    expect(c.sayim[0]).toEqual({
      where: { connectionId: CONN, clientId: { not: MIA } },
    });
  });

  it('sayfalar da sahiplendiriliyor — organik süpürme buna bakıyor', async () => {
    const { svc, c } = servis(MIA);
    await kesfet(svc);
    expect(c.profilSahiplen[0]).toEqual({
      where: { connectionId: CONN, clientId: null },
      data: { clientId: MIA },
    });
  });

  it('KRİTİK: HAVUZ bağlantısında sahiplenme HİÇ çalışmıyor', async () => {
    /*
     * Havuz bağlantısında `conn.clientId` NULL. Sahiplenme koşulsuz koşsaydı
     * `data: { clientId: null }` yazılır, yani hiçbir şey değişmezdi — ama
     * kapsam yanlış yazılsaydı bütün atamalar havuza dönerdi. Koşulun
     * varlığı test ediliyor.
     */
    const { svc, c } = servis(null);
    await kesfet(svc);
    expect(c.hesapSahiplen).toHaveLength(0);
    expect(c.profilSahiplen).toHaveLength(0);
    expect(c.sayim).toHaveLength(0);
  });
});
