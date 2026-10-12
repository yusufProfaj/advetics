import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';
import { workspaceTasi } from '../modules/manager-account/workspace-tasima';

/**
 * DEĞİŞİKLİK ETKİSİ TABLOSUNUN RLS POLİTİKASI — `SET ROLE` + `RETURNING`.
 *
 * Politika YALNIZ SELECT: satırı yazan tek yol worker (BYPASSRLS). Burada
 * sahibi olmayan bir role geçilip (1) başka workspace'in satırının
 * görünmediği, (2) kullanıcının INSERT'inin REDDEDİLDİĞİ, (3) UPDATE ve
 * DELETE'in sıfır satır etkilediği sayılıyor. "Patlamadı" kanıt değil:
 * politikası olmayan UPDATE sessizce SIFIR satır etkiler, bu yüzden
 * `RETURNING` ile sayılıyor (CLAUDE.md).
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_B = '11111111-1111-1111-1111-11111111111b';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC_A = '44444444-4444-4444-4444-44444444444a';
const ACC_B = '44444444-4444-4444-4444-44444444444b';
const ROL = 'advetics_etki_test';

const satir = (c: string, acc: string, kaynakId: string) =>
  `INSERT INTO degisiklik_etkileri (org_id, client_id, ad_account_id, platform, kaynak, kaynak_id, yol, tur, seviye,
     varlik_id, varlik_adi, kapsam_seviye, kapsam_id, kapsam_adi, degisiklik_zamani, degisiklik_gunu, sonraki_olcum)
   VALUES ('${ORG}', '${c}', '${acc}', 'meta', 'kampanya_eylemi', '${kaynakId}', 'iyilestir', 'durdur', 'ad',
     '${acc}', 'Reklam', 'ad_group', '${acc}', 'Set', now(), '2026-10-01', '2026-10-12')`;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`ALTER TABLE degisiklik_etkileri ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Kardeş', 'kardes', now())`, [ORG, ORG_B]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'a@advetics.com', 'A', now())`, [USER, ORG]);
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label,
       access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'u1', 'BM', '\\x00', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
  for (const [acc, c, ext] of [
    [ACC_A, A, 'act_a'],
    [ACC_B, B, 'act_b'],
  ] as const) {
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', $5, 'Hesap', 'TRY', 'Europe/Istanbul', now())`,
      [acc, ORG, c, CONN, ext],
    );
    await h.q(satir(c, acc, `k-${c.slice(0, 1)}`));
  }
});

async function kullaniciOlarak<T = Record<string, unknown>>(sql: string, clientIds: string[], isOrgAdmin = false): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ORG}', false),
           set_config('app.current_user_id', '${USER}', false),
           set_config('app.current_client_ids', '${clientIds.join(',')}', false),
           set_config('app.is_org_admin', '${isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '', false)
  `);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('degisiklik_etkileri — RLS', () => {
  it('KRİTİK: A’ya erişen kullanıcı YALNIZ A’nın satırını görüyor', async () => {
    expect(await kullaniciOlarak<{ c: string }>(`SELECT client_id::text AS c FROM degisiklik_etkileri`, [A])).toEqual([{ c: A }]);
  });

  it('KRİTİK: kullanıcı satır YAZAMIYOR — kendi workspace’ine bile (sonucu yalnız iş yazar)', async () => {
    await expect(kullaniciOlarak(satir(A, ACC_A, 'elle'), [A], true)).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: UPDATE ve DELETE sıfır satır (RETURNING ile sayıldı), org yöneticisi için de', async () => {
    expect(
      await kullaniciOlarak(`UPDATE degisiklik_etkileri SET durum = 'sonuclandi', sonuc = 'iyilesti', sonraki_olcum = NULL RETURNING id`, [A, B], true),
    ).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM degisiklik_etkileri RETURNING id`, [A, B], true)).toHaveLength(0);
    // Mutasyon bekçisi: satırlar gerçekten var ve RLS olmadan güncellenebiliyor.
    expect(await h.q(`UPDATE degisiklik_etkileri SET updated_at = now() RETURNING id`)).toHaveLength(2);
  });

  it('KRİTİK: workspace başka şirkete geçince org_id kompozit anahtarla TAŞINIYOR (CASCADE listesi)', async () => {
    await workspaceTasi(h.db as never, A, ORG, ORG_B);
    expect(await h.q<{ o: string }>(`SELECT org_id::text AS o FROM degisiklik_etkileri WHERE client_id = $1`, [A])).toEqual([{ o: ORG_B }]);
  });
  /*
   * AJAN 4 · KAPI (2026-10-12). Ç-C8: müşteri hesabı (org yöneticisi
   * DEĞİL, yalnız kendi workspace'i) etkileri RLS seviyesinde GÖRÜYOR
   * (Paket B özeti onu bu politikayla okuyacak); ekran kapısı `rule.read`.
   * Aşağıdakiler politikanın iki katmanını ayrı ayrı sınıyor.
   */
  it('KRİTİK (Ç-C8): seçili workspace daraltıyor — A ve B’ye erişen kullanıcı A seçiliyken B’yi görmüyor', async () => {
    await h.q(`
      SELECT set_config('app.current_org_id', '${ORG}', false),
             set_config('app.current_user_id', '${USER}', false),
             set_config('app.current_client_ids', '${A},${B}', false),
             set_config('app.is_org_admin', 'off', false),
             set_config('app.current_active_client_id', '${A}', false)`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      expect(await h.q<{ c: string }>(`SELECT client_id::text AS c FROM degisiklik_etkileri`)).toEqual([{ c: A }]);
    } finally {
      await h.q('RESET ROLE');
    }
  });

  it('KRİTİK: başka ŞİRKETİN satırı, workspace kimliği bağlamda olsa bile görünmüyor (org_kapsaminda)', async () => {
    const C = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const ACC_C = '44444444-4444-4444-4444-44444444444c';
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'C', 'c', now())`, [C, ORG_B]);
    const CONN_C = '33333333-3333-3333-3333-33333333333c';
    await h.q(
      `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label,
         access_token_enc, granted_scopes, connected_by_user_id, updated_at)
       VALUES ($1, $2, NULL, 'meta', 'active', 'u2', 'BM2', '\\x00', '{}', $3, now())`,
      [CONN_C, ORG_B, USER],
    );
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_c', 'Hesap', 'TRY', 'Europe/Istanbul', now())`,
      [ACC_C, ORG_B, C, CONN_C],
    );
    await h.q(satir(C, ACC_C, 'k-c').replace(`'${ORG}'`, `'${ORG_B}'`));
    const r = await kullaniciOlarak<{ c: string }>(`SELECT client_id::text AS c FROM degisiklik_etkileri ORDER BY 1`, [A, B, C], true);
    expect(r.map((x) => x.c)).toEqual([A, B].sort());
    // Mutasyon bekçisi: satır gerçekten var.
    expect(await h.q(`SELECT 1 FROM degisiklik_etkileri WHERE client_id = $1`, [C])).toHaveLength(1);
  });
});
