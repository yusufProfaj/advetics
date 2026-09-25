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
 * BAĞLANTISI yeni workspace’i gösteriyor, ATAMASI hâlâ boş. `ilkVeriCekimi`
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
  upsertler: Array<{ update: Record<string, unknown> }>;
  /** Ödeme tetiğine verilen hesap kimlikleri — çağrı başına bir liste. */
  tetik: string[][];
}

/** `findMany`in döndürdüğü, keşiften ÖNCE var olan satır. */
interface MevcutSatir {
  externalId: string;
  clientId: string | null;
  connectionId: string;
  connection: { status: 'active' | 'needs_reauth' | 'revoked' | 'error' };
}

function servis(
  connClientId: string | null,
  cakisanSayisi = 0,
  mevcutHesaplar: MevcutSatir[] = [],
  tetikPatlar = false,
): {
  svc: ConnectionsService;
  c: Cagrilar;
} {
  const c: Cagrilar = {
    hesapSahiplen: [],
    profilSahiplen: [],
    sayim: [],
    upsertler: [],
    tetik: [],
  };
  const tetikKaydedici = {
    degerlendir: (idler: string[]) => {
      c.tetik.push([...idler]);
      if (tetikPatlar) return Promise.reject(new Error('SMTP kapalı'));
      return Promise.resolve({ yeni: 0, cozulen: 0, not: '' });
    },
  };

  const admin = {
    platformConnection: {
      findUniqueOrThrow: () => Promise.resolve({ orgId: ORG, clientId: connClientId }),
    },
    adAccount: {
      // Keşif var olan satırları TEK sorguda okuyor (K3,
      // `hesap-sahipligi.ts`). Bu senaryoda önceden atanmış satır yok; boş
      // liste "korunacak bağlantı yok" demek ve sahiplenme dalını sınıyor.
      findMany: () => Promise.resolve(mevcutHesaplar),
      upsert: (a: { update: Record<string, unknown> }) => {
        c.upsertler.push(a);
        // Keşif yazdığı satırın KİMLİĞİNİ ödeme tetiğine veriyor; boş
        // nesne dönmek o zinciri hiç sınamamak olurdu.
        return Promise.resolve({ id: `hesap-${c.upsertler.length}` });
      },
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
      findMany: () => Promise.resolve([]),
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
    // ŞİFRE ÇÖZÜCÜ — yalnızca `pageWhatsapp` kullanıyor; bu testlerde o
    // yol koşmuyor.
    {} as never,
    // ÖDEME TETİĞİ — keşif her turda yazdığı hesapları veriyor; kayıtçı
    // hangi kimliklerle çağrıldığını tutuyor.
    tetikKaydedici as never,
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

  it('KRİTİK: BAŞKA workspace’e atanmış hesap TAŞINMIYOR', async () => {
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

describe('K3 — keşif ATANMIŞ hesabın bağlantısını ele geçirmiyor', () => {
  /*
   * Sıra üretimdeki kurulumun kendisi: Profaj `act_1`'i şirkete atadı,
   * şirket sonra kendi Meta'sını bağladı ve aynı hesap bu bağlantıyla
   * yeniden keşfediliyor. Upsert `connectionId` yazsaydı şirket
   * bağlantısını kaldırınca AJANSIN atadığı hesabın verisi dururdu.
   */
  const PROFAJ_CONN = '44444444-4444-4444-4444-444444444444';

  it('KRİTİK: canlı ajans bağlantısına atanmış satırda connectionId YAZILMIYOR', async () => {
    const { svc, c } = servis(null, 0, [
      { externalId: 'act_1', clientId: MIA, connectionId: PROFAJ_CONN, connection: { status: 'active' } },
    ]);
    await kesfet(svc);
    expect(c.upsertler).toHaveLength(1);
    expect(c.upsertler[0]!.update).not.toHaveProperty('connectionId');
    // Platformdan okunan gerçek yine güncelleniyor — korunan yalnızca sahiplik.
    expect(c.upsertler[0]!.update).toMatchObject({ name: 'Mia' });
  });

  it('eski bağlantı KALDIRILMIŞSA yeni bağlantı devralıyor', async () => {
    const { svc, c } = servis(null, 0, [
      { externalId: 'act_1', clientId: MIA, connectionId: PROFAJ_CONN, connection: { status: 'revoked' } },
    ]);
    await kesfet(svc);
    expect(c.upsertler[0]!.update).toMatchObject({ connectionId: CONN });
  });

  it('havuzdaki (atanmamış) satırda bağlantı her zamanki gibi güncelleniyor', async () => {
    const { svc, c } = servis(null, 0, [
      { externalId: 'act_1', clientId: null, connectionId: PROFAJ_CONN, connection: { status: 'active' } },
    ]);
    await kesfet(svc);
    expect(c.upsertler[0]!.update).toMatchObject({ connectionId: CONN });
  });
});

describe('ÖDEME TETİĞİ — hesap durumu yazıldığı AN', () => {
  /*
   * Hesabın platformdaki durumu keşifte yazılıyor (bağlantı dönüşü,
   * "Hesapları yenile", günde iki kez tam tazeleme). Tetik bu yolda
   * çekilmezse ödeme sorunu yalnızca 15 dakikalık nabızda görülür ve
   * kullanıcının "yenile"ye bastığı an bile mail gitmez.
   */
  it('KRİTİK: keşif yazdığı hesapların kimliğiyle tetiği çekiyor', async () => {
    const { svc, c } = servis(null);
    await kesfet(svc);
    expect(c.tetik).toEqual([['hesap-1']]);
  });

  it('KRİTİK: tetik düşerse keşif DÜŞMÜYOR — hesaplar zaten yazıldı', async () => {
    const { svc, c } = servis(null, 0, [], true);
    await expect(kesfet(svc)).resolves.toBeUndefined();
    expect(c.upsertler).toHaveLength(1);
    expect(c.tetik).toHaveLength(1);
  });
});
