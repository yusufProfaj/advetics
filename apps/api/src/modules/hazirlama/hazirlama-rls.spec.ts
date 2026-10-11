import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ workspace_hazirlama RLS — SET ROLE + RETURNING ═══
 *
 * "Patlamadı" yetmez: politikası izin vermeyen UPDATE SIFIR satır etkiler ve
 * başarılı döner. Etkilenen satır RETURNING ile sayılıyor
 * (`hesap-tasima-rls.spec.ts` deseni).
 */
let h: Harness;
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ROL = 'advetics_hazirlama_rls_test';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`ALTER TABLE workspace_hazirlama ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`, [ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'u@advetics.com', 'U', now())`, [USER, ORG]);
  await h.q(`INSERT INTO workspace_hazirlama (client_id, org_id, durum) VALUES ($1, $2, 'hazir')`, [B, ORG]);
});

async function asUser<T = Record<string, unknown>>(sql: string, clientIds: string[]): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ORG}', false),
           set_config('app.current_user_id', '${USER}', false),
           set_config('app.current_client_ids', '${clientIds.join(',')}', false),
           set_config('app.is_org_admin', 'off', false),
           set_config('app.can_manage_pool', 'off', false),
           set_config('app.current_active_client_id', '', false),
           set_config('app.current_manager_account_id', '', false),
           set_config('app.tum_sirketler', 'off', false)`);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('workspace_hazirlama RLS', () => {
  it('KRİTİK: kendi workspace\'ine yazar ve okur (etkilenen satır sayılıyor)', async () => {
    const yaz = await asUser(`INSERT INTO workspace_hazirlama (client_id, org_id, durum) VALUES ('${A}', '${ORG}', 'soru') RETURNING client_id`, [A]);
    expect(yaz).toHaveLength(1);
    const guncelle = await asUser(`UPDATE workspace_hazirlama SET durum = 'hazir' WHERE client_id = '${A}' RETURNING client_id`, [A]);
    expect(guncelle).toHaveLength(1);
    expect(await asUser(`SELECT client_id FROM workspace_hazirlama`, [A])).toEqual([{ client_id: A }]);
  });

  it('KRİTİK: başka workspace\'in satırını göremez, güncelleyemez (sıfır satır), ekleyemez', async () => {
    expect(await asUser(`SELECT client_id FROM workspace_hazirlama WHERE client_id = '${B}'`, [A])).toEqual([]);
    expect(await asUser(`UPDATE workspace_hazirlama SET durum = 'eksik' WHERE client_id = '${B}' RETURNING client_id`, [A])).toEqual([]);
    await h.q(`DELETE FROM workspace_hazirlama`);
    await expect(asUser(`INSERT INTO workspace_hazirlama (client_id, org_id) VALUES ('${B}', '${ORG}') RETURNING client_id`, [A])).rejects.toThrow(/row-level security/);
  });
});
