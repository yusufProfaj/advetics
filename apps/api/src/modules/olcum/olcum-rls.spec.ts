import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ ÖLÇÜM — HESAP VE TOKEN SORGULARI RLS ALTINDA (Ajan 4, 2026-10-11) ═══
 *
 * `OlcumService.hesaplar` ve `metaTokeni` `withTenant` içinde koşuyor; bu
 * paket servisin GERÇEK sorgularını KAYNAKTAN çıkarıp politika uygulanan bir
 * rolle (`SET ROLE`) çalıştırıyor. Kopyalanmış bir sorgu, servis eski kalsa
 * bile düzeltilmiş hâli taşırdı (`rapor-listeleri-rls.spec.ts` dersi).
 *
 * Desen `ad-account-pool-rls.spec.ts`ten: koşum ortamı RLS'i kapatıyor, burada
 * iki tabloda geri açılıyor.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC_POOL = '44444444-4444-4444-4444-444444444444';
const ACC_A_GOOGLE = '55555555-5555-5555-5555-555555555555';
const ACC_A_META = '56565656-5656-5656-5656-565656565656';
const ACC_B_GOOGLE = '57575757-5757-5757-5757-575757575757';
const APP_ROLE = 'advetics_olcum_rls_test';

/** Servisin `Prisma.sql` şablonları, yorumsuz kaynaktan, sırasıyla. */
const KAYNAK = readFileSync(join(__dirname, 'olcum.service.ts'), 'utf8');
function sablon(icerir: string): string {
  const parcalar = KAYNAK.split('Prisma.sql`').slice(1).map((p) => p.slice(0, p.indexOf('`')));
  const s = parcalar.find((p) => p.includes(icerir));
  if (!s) throw new Error(`Servis sorgusu bulunamadı: ${icerir}`);
  return s;
}
const HESAP_SQL = (clientId: string) => sablon('FROM ad_accounts\n').replace('${clientId}', `'${clientId}'`);
const TOKEN_SQL = (adAccountId: string) => sablon('platform_connections').replace('${adAccountId}', `'${adAccountId}'`);

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  for (const t of ['ad_accounts', 'platform_connections', 'clients']) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`, [ORG]);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, website, updated_at)
     VALUES ($1, $3, 'A', 'a', 'a.com', now()), ($2, $3, 'B', 'b', 'b.com', now())`,
    [CLIENT_A, CLIENT_B, ORG],
  );
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'u@advetics.com', 'U', now())`, [USER, ORG]);
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'u1', 'Ajans BM', '\\x0102', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $5, NULL, $6, 'google', '111', 'Havuz Google', 'TRY', 'Europe/Istanbul', now()),
            ($2, $5, $7,   $6, 'google', '222', 'A Google',     'TRY', 'Europe/Istanbul', now()),
            ($3, $5, $7,   $6, 'meta',   'act_333', 'A Meta',   'TRY', 'Europe/Istanbul', now()),
            ($4, $5, $8,   $6, 'google', '444', 'B Google',     'TRY', 'Europe/Istanbul', now())`,
    [ACC_POOL, ACC_A_GOOGLE, ACC_A_META, ACC_B_GOOGLE, ORG, CONN, CLIENT_A, CLIENT_B],
  );
});

interface Ctx {
  clientIds: string[];
  isOrgAdmin?: boolean;
  activeClientId?: string | null;
  havuz?: boolean;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',           '${ORG}', false),
           set_config('app.current_user_id',          '${USER}', false),
           set_config('app.current_client_ids',       '${ctx.clientIds.join(',')}', false),
           set_config('app.is_org_admin',             '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.can_manage_pool',          '${ctx.havuz ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '${ctx.activeClientId ?? ''}', false),
           set_config('app.current_manager_account_id', '', false),
           set_config('app.tum_sirketler', 'off', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('Ölçüm hesap sorgusu (servisin gerçek SQL\'i)', () => {
  it('dilim gerçekten yakalandı (tarama boşa düşmüyor)', () => {
    expect(HESAP_SQL(CLIENT_A)).toContain(`client_id = '${CLIENT_A}'::uuid`);
    expect(TOKEN_SQL(ACC_A_META)).toContain(`a.id = '${ACC_A_META}'::uuid`);
  });

  it('KRİTİK: yalnız bu workspace\'e ATANMIŞ hesaplar; havuz hesabı, havuz yetkili org yöneticisinde bile gelmiyor', async () => {
    const satir = await asUser<{ ad: string }>(HESAP_SQL(CLIENT_A), { clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true, havuz: true });
    expect(satir.map((r) => r.ad).sort()).toEqual(['A Google', 'A Meta']);
  });

  it('KRİTİK: erişim listesinde olmayan workspace sorulursa RLS sıfır satır veriyor (servis kontrolüne ek ikinci hat)', async () => {
    expect(await asUser(HESAP_SQL(CLIENT_B), { clientIds: [CLIENT_A], activeClientId: CLIENT_A })).toEqual([]);
  });

  /*
   * BULGU (önemli) — GÖRÜNMEYEN SATIRI "YOK" SAYMAK: aktif workspace A iken
   * panel `?musteri=B` ile B'nin Ölçüm bölümünü açtığında (her ikisine de
   * erişim var) `can_access_client` B'yi gizliyor ve servis 0 satırı
   * "Bu workspace'e reklam hesabı atanmamış" (HESAP_ATA) diye yazıyor. Hesap
   * ATANMIŞ; kullanıcı onu Bağlantılar'da yeniden atamaya gönderiliyor.
   * Aynı RLS kuralı yazma ucunu da koruyor: aktif A iken B'ye yazma
   * "atanmamış" ile reddediliyor (aktif seçim YOKKEN koruma yok, bkz.
   * olcum-denetim.spec.ts).
   */
  it('KANIT: erişimi olduğu ama aktif olmayan workspace\'in ATANMIŞ hesabı RLS altında görünmüyor', async () => {
    const aktifA = await asUser(HESAP_SQL(CLIENT_B), { clientIds: [CLIENT_A, CLIENT_B], activeClientId: CLIENT_A });
    expect(aktifA).toEqual([]);
    const secimsiz = await asUser<{ ad: string }>(HESAP_SQL(CLIENT_B), { clientIds: [CLIENT_A, CLIENT_B], activeClientId: null });
    expect(secimsiz.map((r) => r.ad)).toEqual(['B Google']);
  });
});

describe('Meta token sorgusu (servisin gerçek SQL\'i)', () => {
  it('KRİTİK: org yöneticisi olmayan workspace kullanıcısı kendi atanmış hesabının bağlantı satırını okuyabiliyor (Meta hücresi "bağlantı bulunamadı" demiyor)', async () => {
    const r = await asUser<{ durum: string }>(TOKEN_SQL(ACC_A_META), { clientIds: [CLIENT_A], activeClientId: CLIENT_A });
    expect(r).toHaveLength(1);
    expect(r[0]!.durum).toBe('active');
  });

  it('KRİTİK: başka workspace\'in hesap kimliğiyle token okunamıyor (hesap satırı RLS\'te gizli)', async () => {
    expect(await asUser(TOKEN_SQL(ACC_B_GOOGLE), { clientIds: [CLIENT_A], activeClientId: CLIENT_A })).toEqual([]);
  });
});
