import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { HazirlikService } from '../tenancy/hazirlik.service';
import { gorunenBaglantilar } from './gorunen-baglantilar';
import { BAGLANTI_GORUNMUYOR } from '../../queue/supurme-kapsami';

/**
 * ═══ "TÜM ŞİRKETLER" MODUNDA HESAP GÖRÜNÜR, BAĞLANTISI GÖRÜNMEZ ═══
 *
 * Canlıda (2026-09-28) `/alerts` ve `/sync/status` ajansın panelinin tamamında
 * 500 döndü. Sebep tek bir hesaptı: Biltaş kendi Google'ını bağlayıp hesabını
 * atamıştı. "Tüm şirketler" modunda ATANMIŞ hesap satırı kardeş şirketlere
 * açık (`org_kapsaminda`), ama HAVUZ bağlantısı yalnızca kendi şirketinde ve
 * ajansta görünüyor (`havuz_kapsaminda`). Zorunlu ilişkiyi çeken Prisma
 * sorgusu `null` bağlantıyla karşılaşıp bütün isteği düşürüyordu.
 *
 * Bu paket RLS'i GERÇEKTEN açıyor (`SET ROLE`, tablo sahibi olmayan rol):
 * varsayılan koşum ortamında RLS kapalı ve bu hata orada hiç görünmüyor.
 * Kurulum `musteri-sirketi-izolasyon.spec.ts`in küçültülmüş hâli.
 */
let h: Harness;

const UST = 'aaaa0000-0000-0000-0000-0000000000aa';
const ORG_AJANS = '11111111-1111-1111-1111-111111111111';
const ORG_3A = '22222222-2222-2222-2222-222222222222';
const WS_3A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const USER_AJANS = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const USER_3A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const CONN_AJANS = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
const CONN_3A = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const ACC_AJANSTAN = '01010101-0101-0101-0101-010101010101';
const ACC_3A_KENDI = '03030303-0303-0303-0303-030303030303';

const ROL = 'advetics_gorunen_baglanti_test';
const RLS = ['manager_accounts', 'organizations', 'clients', 'platform_connections', 'ad_accounts'];

/** Ajans yöneticisi, "Tüm şirketler" modunda — canlıdaki hâl. */
const AJANS_TUM: TenantContext = {
  orgId: ORG_AJANS,
  userId: USER_AJANS,
  clientIds: [WS_3A],
  activeClientId: null,
  isOrgAdmin: true,
  managerAccountId: UST,
  tumSirketler: true,
  permissions: ['client.read'],
} as unknown as TenantContext;

async function baglamiKur(ctx: TenantContext): Promise<void> {
  await h.q(`
    SELECT set_config('app.current_org_id',             '${ctx.orgId}', false),
           set_config('app.current_user_id',            '${ctx.userId}', false),
           set_config('app.current_client_ids',         '${ctx.clientIds.join(',')}', false),
           set_config('app.is_org_admin',               '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_manager_account_id', '${ctx.managerAccountId ?? ''}', false),
           set_config('app.current_active_client_id',   '${ctx.activeClientId ?? ''}', false),
           set_config('app.tum_sirketler',              '${ctx.tumSirketler ? 'on' : 'off'}', false)
  `);
  await h.q(`SET ROLE ${ROL}`);
}

async function rlsIle<T>(ctx: TenantContext, fn: () => Promise<T>): Promise<T> {
  await baglamiKur(ctx);
  try {
    return await fn();
  } finally {
    await h.q('RESET ROLE');
  }
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${ROL}`);
  for (const t of RLS) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);

  await h.q(
    `INSERT INTO manager_accounts (id, name, slug, status, updated_at)
     VALUES ($1, 'Profaj', 'profaj', 'active', now())`,
    [UST],
  );
  await h.q(
    `INSERT INTO organizations (id, name, slug, status, manager_account_id, updated_at)
     VALUES ($1, 'Profaj', 'profaj-org', 'active', $3, now()),
            ($2, '3A Makina', '3a', 'active', $3, now())`,
    [ORG_AJANS, ORG_3A, UST],
  );
  await h.q(`UPDATE manager_accounts SET ajans_org_id = $1 WHERE id = $2`, [ORG_AJANS, UST]);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, '3A Makina', '3a-ws', now())`,
    [WS_3A, ORG_3A],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $3, 'y@profaj.com', 'Ajans', now()),
            ($2, $4, 'a@3a.com', '3A', now())`,
    [USER_AJANS, USER_3A, ORG_AJANS, ORG_3A],
  );
  /*
   * İKİ HAVUZ BAĞLANTISI: ajansınki ve 3A'nın KENDİ Google'ı. İkisinin de
   * `client_id`si NULL, yani ikisi de `havuz_kapsaminda` dalından geçiyor.
   */
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $3, NULL, 'meta',   'active', 'ajans-bm',  'Ajans BM',  '\\x00', '{}', $5, now()),
            ($2, $4, NULL, 'google', 'active', '3a-google', '3A Google', '\\x00', '{}', $6, now())`,
    [CONN_AJANS, CONN_3A, ORG_AJANS, ORG_3A, USER_AJANS, USER_3A],
  );
  /*
   * İKİ ATANMIŞ HESAP, İKİSİ DE 3A WORKSPACE'İNDE: biri ajansın
   * bağlantısından (ödünç), biri 3A'nın kendi bağlantısından.
   */
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, status, sync_enabled, last_structure_sync_at, last_insights_sync_at, updated_at)
     VALUES ($1, $3, $4, $5, 'meta',   'act_1', 'AJANSTAN GELEN', 'TRY', 'Europe/Istanbul',
             'active', true, now(), now(), now()),
            ($2, $3, $4, $6, 'google', 'g_3a',  '3A KENDİ HESABI', 'TRY', 'Europe/Istanbul',
             'active', true, now(), now(), now())`,
    [ACC_AJANSTAN, ACC_3A_KENDI, ORG_3A, WS_3A, CONN_AJANS, CONN_3A],
  );
});

afterAll(async () => {
  await h.close();
});

describe('kurulum gerçekten yazıldı', () => {
  it('RLS kapalıyken iki hesap ve iki bağlantı var', async () => {
    const [a] = await h.q<{ n: string }>('SELECT count(*) AS n FROM ad_accounts');
    const [c] = await h.q<{ n: string }>('SELECT count(*) AS n FROM platform_connections');
    expect(Number(a?.n)).toBe(2);
    expect(Number(c?.n)).toBe(2);
  });
});

describe('KÖK SEBEP — politikanın kendisi', () => {
  it('KRİTİK: hesabın ikisi de görünüyor, 3A\'nın bağlantısı görünmüyor', async () => {
    /*
     * Bu iddia politikayı DEĞİŞTİRMEK için değil, BELGELEMEK için. Müşterinin
     * kendi bağlantısının kardeş şirketlere açılmaması bilinçli (2026-09-23);
     * düzeltme okuyan tarafta. Bir gün politika değişip bağlantı görünür
     * olursa bu test düşer ve buradaki gerekçe yeniden okunur.
     */
    const { hesaplar, baglantilar } = await rlsIle(AJANS_TUM, async () => ({
      hesaplar: await h.q<{ name: string }>('SELECT name FROM ad_accounts ORDER BY name'),
      baglantilar: await h.q<{ id: string }>('SELECT id::text AS id FROM platform_connections'),
    }));
    expect(hesaplar.map((r) => r.name)).toEqual(['3A KENDİ HESABI', 'AJANSTAN GELEN']);
    expect(baglantilar.map((r) => r.id)).toContain(CONN_AJANS);
    expect(baglantilar.map((r) => r.id)).not.toContain(CONN_3A);
  });

  it('KRİTİK: INNER JOIN hesabı SESSİZCE eliyor, LEFT JOIN tutuyor', async () => {
    // Hazırlık listesinin ilk sürümü INNER JOIN kullanıyordu ve canlıda
    // Biltaş'ın atanmış hesabı için "hiç hesap atanmadı" diyordu.
    const { ic, dis } = await rlsIle(AJANS_TUM, async () => ({
      ic: await h.q<{ name: string }>(
        `SELECT a.name FROM ad_accounts a JOIN platform_connections c ON c.id = a.connection_id`,
      ),
      dis: await h.q<{ name: string; s: string | null }>(
        `SELECT a.name, c.status::text AS s FROM ad_accounts a
           LEFT JOIN platform_connections c ON c.id = a.connection_id ORDER BY a.name`,
      ),
    }));
    expect(ic.map((r) => r.name)).toEqual(['AJANSTAN GELEN']);
    expect(dis).toEqual([
      { name: '3A KENDİ HESABI', s: null },
      { name: 'AJANSTAN GELEN', s: 'active' },
    ]);
  });
});

describe('DÜZELTME — okuyan taraf', () => {
  it('gorunenBaglantilar görünmeyeni atlıyor, patlamıyor', async () => {
    const harita = await rlsIle(AJANS_TUM, () =>
      gorunenBaglantilar(h.db as never, [CONN_AJANS, CONN_3A, CONN_3A]),
    );
    expect([...harita.keys()]).toEqual([CONN_AJANS]);
  });

  it('KRİTİK: hazırlık listesi hesabı SAYIYOR ve veri akışını "bilinmiyor" diyor', async () => {
    const prisma = {
      withTenant: async <T>(c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
        rlsIle(c, () => fn(h.db)),
    } as unknown as PrismaService;
    const r = await new HazirlikService(prisma).get(AJANS_TUM, WS_3A);

    const hesap = r.maddeler.find((m) => m.kod === 'reklam_hesabi')!;
    expect(hesap.durum).toBe('tamam');
    expect(hesap.aciklama).toBe('2 reklam hesabı: 1 Meta Ads, 1 Google Ads.');

    const veri = r.maddeler.find((m) => m.kod === 'veri_akisi')!;
    expect(veri.durum).toBe('bilinmiyor');
    expect(veri.aciklama).toContain('3A KENDİ HESABI');
    expect(veri.aciklama).not.toContain('veri gelmiyor');
  });

  it('görünmeyen bağlantının cümlesi tek sabitten', () => {
    expect(BAGLANTI_GORUNMUYOR).toContain('başka bir şirketin kendi bağlantısı');
  });
});
