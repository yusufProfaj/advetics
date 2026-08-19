import { describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from './connections.service';

/**
 * YENİDEN YETKİLENDİRME SAHİPLİĞİ KORUMAK ZORUNDA.
 *
 * NEDEN BU TEST VAR: uç nokta `startOAuth`'u `clientId` vermeden çağırıyordu,
 * yani state satırına `null` yazılıyordu. Geri dönüşte `persistConnection`
 * bunu "havuza bağlanıyor" diye okuyor ve sahiplik koruması REDDEDİYORDU.
 *
 * Sonuç bir ihtimal değil takvimli bir kesintiydi: bir workspace'e bağlanan
 * Meta hesabı, token'ının süresi dolup `needs_reauth` olduğu anda KALICI
 * OLARAK yenilenemez hâle geliyor ve kullanıcıya gösterilen tek yol
 * "bağlantıyı kaldır" oluyordu.
 *
 * Veritabanına gitmiyoruz: sınanan şey `startOAuth`'a HANGİ `clientId`'nin
 * geçtiği.
 */
const ORG = '11111111-1111-1111-1111-111111111111';
const EGE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONN = '33333333-3333-3333-3333-333333333333';

const CTX: TenantContext = {
  orgId: ORG,
  userId: '22222222-2222-2222-2222-222222222222',
  clientIds: [EGE],
  activeClientId: EGE,
  isOrgAdmin: true,
} as TenantContext;

const META = { ip: null, userAgent: null, requestId: 'test' };

/**
 * `startOAuth` yerine geçen casusla servis. Gerçek `startOAuth`'u koşturmak
 * sağlayıcı yapılandırması ve veritabanı isterdi; sınanan şey ona GEÇEN
 * DEĞER.
 */
function servis(kayit: { clientId: string | null; platform: string } | null): {
  svc: ConnectionsService;
  gecen: () => { clientId?: string } | null;
} {
  let gecen: { clientId?: string } | null = null;

  const prisma = {
    withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
      fn({ platformConnection: { findFirst: () => Promise.resolve(kayit) } }),
  } as unknown as PrismaService;

  const svc = new ConnectionsService(
    prisma,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
      // KUYRUK — yalnızca `ilkVeriCekimi` kullanıyor ve bu testlerde o yol
    // koşmuyor. Çağrılırsa SESSİZCE geçmesin diye fırlatan bir yerine koyma.
    { enqueue: () => { throw new Error('kuyruk bu testte beklenmiyor'); } } as never,
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).startOAuth = (_ctx: unknown, _p: unknown, opts: { clientId?: string }) => {
    gecen = opts;
    return Promise.resolve({ authorizeUrl: 'https://ornek' });
  };

  return { svc, gecen: () => gecen };
}

describe('yeniden yetkilendirme — sahiplik', () => {
  it('düzenek gerçekten çağrıyı yakalıyor', async () => {
    // Casus takılmazsa aşağıdaki iddialar null üzerinde koşar ve
    // "clientId doğru" her zaman yanlış/boş çıkardı.
    const { svc, gecen } = servis({ clientId: EGE, platform: 'meta' });
    await svc.reauthorize(CTX, CONN, 'meta', META);
    expect(gecen()).not.toBeNull();
  });

  it('KRİTİK: workspace bağlantısı KENDİ workspace’iyle yenileniyor', async () => {
    const { svc, gecen } = servis({ clientId: EGE, platform: 'meta' });
    await svc.reauthorize(CTX, CONN, 'meta', META);
    expect(gecen()?.clientId).toBe(EGE);
  });

  it('KRİTİK: havuz bağlantısı HAVUZ olarak yenileniyor', async () => {
    // Ters yön de gerçek: havuzdaki bağlantıyı bir workspace'e taşımak
    // sonraki bütün keşifleri oraya yazdırırdı.
    const { svc, gecen } = servis({ clientId: null, platform: 'meta' });
    await svc.reauthorize(CTX, CONN, 'meta', META);
    expect(gecen()?.clientId).toBeUndefined();
  });

  it('bağlantı yoksa hata', async () => {
    const { svc } = servis(null);
    await expect(svc.reauthorize(CTX, CONN, 'meta', META)).rejects.toThrow();
  });

  it('KRİTİK: adresteki platform kayıtla eşleşmezse reddediliyor', async () => {
    /*
     * `?platform=` adres çubuğundan geliyor. Kayıtla ayrışırsa Meta
     * bağlantısı için Google izin ekranına gidilir ve dönüşte BAŞKA bir
     * bağlantı tazelenirdi.
     */
    const { svc } = servis({ clientId: EGE, platform: 'meta' });
    await expect(svc.reauthorize(CTX, CONN, 'google', META)).rejects.toThrow();
  });
});
