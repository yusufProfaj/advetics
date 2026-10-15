import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from './connections.service';

/**
 * ═══ AJANSIN BAĞLANTISINA İZİN VERME KAPISI — GERÇEK RLS ALTINDA ═══
 *
 * "Ölçüm izinlerini ver" ajansın Google bağlantısının TOKEN'INI değiştiriyor
 * ve dönüş yönetim istemcisiyle (RLS'siz) yazıyor. Kapı başlatmada:
 * `reauthorize` satırı GÖREBİLMEYİ yeterli saymıyor, politikanın YAZMA
 * kuralına soruyor (no-op UPDATE ... RETURNING). Havuz okuma kapsamı
 * yazmadan geniş: havuzu yönetmeyen bir üye ajansın bağlantısını görüyor ama
 * değiştirememeli — değiştirebilseydi 55 atanmış hesabı besleyen token'ı
 * kendi Google hesabıyla takas edebilirdi.
 *
 * İddia ETKİLENEN SATIRA çapalı: kapı yalnız "görünüyor mu"ya baksaydı
 * ikinci test geçerdi (mutasyonla ölçüldü: yoklama SELECT'e çevrilince düşüyor).
 */
let h: Harness;
let gecen: { hedefBaglantiId?: string } | null = null;
let svc: ConnectionsService;

const ROL = 'advetics_olcum_izni_test';
const UST = 'aaaa0000-0000-0000-0000-0000000000ab';
const ORG_AJANS = '11111111-1111-1111-1111-111111111111';
const ORG_MUSTERI = '22222222-2222-2222-2222-222222222222';
const USER_AJANS = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const USER_MUSTERI = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const CONN_AJANS = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
const META = { ip: null, userAgent: null, requestId: 'test' };

const baglamKur = async (c: { orgId: string; userId: string; ust: string | null; yonetici: boolean }) => {
  await h.q(`
    SELECT set_config('app.current_org_id',             '${c.orgId}', false),
           set_config('app.current_user_id',            '${c.userId}', false),
           set_config('app.current_client_ids',         '', false),
           set_config('app.is_org_admin',               '${c.yonetici ? 'on' : 'off'}', false),
           set_config('app.can_manage_pool',            '${c.yonetici ? 'on' : 'off'}', false),
           set_config('app.current_manager_account_id', '${c.ust ?? ''}', false),
           set_config('app.current_active_client_id',   '', false),
           set_config('app.tum_sirketler',              'off', false)`);
};

/** Bağlam → servis bağlamı; politikayı kuran ayarlar `withTenant` taklidinde. */
const ctxler = new Map<string, { orgId: string; userId: string; ust: string | null; yonetici: boolean }>();
const ctx = (ad: string, c: { orgId: string; userId: string; ust: string | null; yonetici: boolean }): TenantContext => {
  ctxler.set(c.userId + c.yonetici, c);
  return { orgId: c.orgId, userId: c.userId, clientIds: [], activeClientId: null, isOrgAdmin: c.yonetici, managerAccountId: c.ust, tumSirketler: false, permissions: [], role: ad } as unknown as TenantContext;
};

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${ROL}`);
  for (const t of ['manager_accounts', 'organizations', 'platform_connections']) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);

  const prisma = {
    withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) => {
      await baglamKur(ctxler.get(c.userId + c.isOrgAdmin)!);
      await h.q(`SET ROLE ${ROL}`);
      try {
        // Servisin kullandığı iki çağrı, ikisi de GERÇEK SQL ve kısıtlı rolde.
        return await fn({
          platformConnection: {
            findFirst: async ({ where }: { where: { id: string } }) => {
              const [r] = await h.q<{ client_id: string | null; platform: string; org_id: string }>(
                `SELECT client_id::text, platform::text, org_id::text FROM platform_connections WHERE id = $1`,
                [where.id],
              );
              return r ? { clientId: r.client_id, platform: r.platform, orgId: r.org_id } : null;
            },
          },
          $queryRaw: h.db.$queryRaw,
        });
      } finally {
        await h.q('RESET ROLE');
      }
    },
  } as unknown as PrismaService;
  svc = new ConnectionsService(prisma, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, { izinleBaslat: async () => 0 } as never);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (svc as any).startOAuth = (_c: unknown, _p: unknown, opts: { hedefBaglantiId?: string }) => {
    gecen = opts;
    return Promise.resolve({ authorizeUrl: 'https://ornek' });
  };
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  gecen = null;
  await h.reset();
  await h.q(`INSERT INTO manager_accounts (id, name, slug, status, updated_at) VALUES ($1, 'Profaj', 'profaj-ust', 'active', now())`, [UST]);
  await h.q(
    `INSERT INTO organizations (id, name, slug, status, manager_account_id, updated_at)
     VALUES ($1, 'Advetics', 'advetics', 'active', $3, now()), ($2, 'Metropol', 'metropol', 'active', $3, now())`,
    [ORG_AJANS, ORG_MUSTERI, UST],
  );
  await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_AJANS, UST]);
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $3, 'y@profaj.com', 'Ajans', now()), ($2, $4, 'm@metropol.com', 'Metropol', now())`,
    [USER_AJANS, USER_MUSTERI, ORG_AJANS, ORG_MUSTERI],
  );
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'google', 'active', '9608136521', 'Google Ads', '\\x00', '{https://www.googleapis.com/auth/adwords}', $3, now())`,
    [CONN_AJANS, ORG_AJANS, USER_AJANS],
  );
});

describe('KRİTİK: ajansın Google bağlantısına ölçüm izni — kim başlatabilir', () => {
  it('ajans yöneticisi (üst hesap üyesi) başka şirketin içindeyken başlatabilir', async () => {
    const c = ctx('owner', { orgId: ORG_MUSTERI, userId: USER_AJANS, ust: UST, yonetici: true });
    await svc.reauthorize(c, CONN_AJANS, 'google', META, { kapsam: 'olcum' });
    expect(gecen?.hedefBaglantiId).toBe(CONN_AJANS);
  });

  it('KRİTİK: bağlantıyı GÖREN ama havuzu yönetmeyen üye reddedilir (okuma ≠ yazma)', async () => {
    const c = ctx('analyst', { orgId: ORG_MUSTERI, userId: USER_AJANS, ust: UST, yonetici: false });
    await expect(svc.reauthorize(c, CONN_AJANS, 'google', META, { kapsam: 'olcum' })).rejects.toThrow(/ajansın/);
    expect(gecen).toBeNull();
  });

  it('şirket yöneticisi (üst hesap üyeliği yok) ajansın bağlantısına dokunamaz', async () => {
    const c = ctx('owner', { orgId: ORG_MUSTERI, userId: USER_MUSTERI, ust: null, yonetici: true });
    await expect(svc.reauthorize(c, CONN_AJANS, 'google', META, { kapsam: 'olcum' })).rejects.toThrow();
    expect(gecen).toBeNull();
  });
});
