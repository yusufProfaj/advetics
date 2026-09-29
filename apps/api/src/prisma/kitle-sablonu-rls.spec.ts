import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ audience_templates — POLİTİKALAR GERÇEKTEN UYGULANIYOR ═══
 *
 * `client-profile-rls.spec.ts` deseni: `SET ROLE` ile tablonun sahibi
 * olmayan bir role geçiliyor. Farkı DELETE: şablon kullanıcı tarafından
 * siliniyor ve politikasız DELETE hata vermeden SIFIR satır etkilerdi —
 * iddia `RETURNING` ile etkilenen satırı sayıyor.
 */
let h: Harness;
const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_OTHER = '1e1e1e1e-1e1e-1e1e-1e1e-1e1e1e1e1e1e';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLIENT_OTHER_ORG = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const T_A = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const T_B = 'd3d3d3d3-d3d3-d3d3-d3d3-d3d3d3d3d3d3';
const T_OTHER = 'd2d2d2d2-d2d2-d2d2-d2d2-d2d2d2d2d2d2';
const APP_ROLE = 'advetics_rls_test';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`ALTER TABLE audience_templates ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => h.close());

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at)
     VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Başka Ajans', 'baska', now())`,
    [ORG, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now()), ($4, $5, 'Yabancı', 'yabanci', now())`,
    [CLIENT_A, CLIENT_B, ORG, CLIENT_OTHER_ORG, ORG_OTHER],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'a@advetics.com', 'A', now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO audience_templates (id, org_id, client_id, name, updated_at)
     VALUES ($1, $4, $5, 'A şablonu', now()), ($2, $4, $6, 'B şablonu', now()), ($3, $7, $8, 'Yabancı şablon', now())`,
    [T_A, T_B, T_OTHER, ORG, CLIENT_A, CLIENT_B, ORG_OTHER, CLIENT_OTHER_ORG],
  );
});

async function asUser<T = Record<string, unknown>>(sql: string, clientIds: string[], isOrgAdmin = false): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ORG}', false),
           set_config('app.current_user_id', '${USER}', false),
           set_config('app.current_client_ids', '${clientIds.join(',')}', false),
           set_config('app.is_org_admin', '${isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('audience_templates RLS', () => {
  it('yalnızca erişilen workspace’in şablonu görünüyor; başka org hiç', async () => {
    const r = await asUser<{ name: string }>('SELECT name FROM audience_templates ORDER BY name', [CLIENT_A]);
    expect(r.map((x) => x.name)).toEqual(['A şablonu']);
    const admin = await asUser<{ name: string }>('SELECT name FROM audience_templates ORDER BY name', [CLIENT_A, CLIENT_B], true);
    expect(admin.map((x) => x.name)).toEqual(['A şablonu', 'B şablonu']);
  });

  it('KRİTİK: DELETE politikası VAR — kendi şablonu SİLİNİYOR (etkilenen satır sayılıyor)', async () => {
    const r = await asUser(`DELETE FROM audience_templates WHERE id = '${T_A}' RETURNING id`, [CLIENT_A]);
    expect(r).toHaveLength(1);
  });

  it('KRİTİK: başka workspace’in şablonu silinemiyor ve güncellenemiyor', async () => {
    expect(await asUser(`DELETE FROM audience_templates WHERE id = '${T_B}' RETURNING id`, [CLIENT_A])).toHaveLength(0);
    expect(
      await asUser(`UPDATE audience_templates SET name = 'x' WHERE id = '${T_B}' RETURNING id`, [CLIENT_A]),
    ).toHaveLength(0);
    const [b] = await h.q<{ name: string }>('SELECT name FROM audience_templates WHERE id = $1', [T_B]);
    expect(b!.name).toBe('B şablonu');
  });

  it('KRİTİK: erişilmeyen workspace’e şablon YAZILAMIYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO audience_templates (org_id, client_id, name, updated_at) VALUES ('${ORG}', '${CLIENT_B}', 'sızma', now())`,
        [CLIENT_A],
      ),
    ).rejects.toThrow(/row-level security/);
  });
});
