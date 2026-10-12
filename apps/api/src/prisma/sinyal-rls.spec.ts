import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * SİNYAL TABLOLARININ RLS POLİTİKALARI — `SET ROLE` + `RETURNING`.
 *
 * Koşum ortamı RLS'i kapatıyor (worker BYPASSRLS taklidi); burada sahibi
 * olmayan bir role geçilip politikanın KENDİSİ sınanıyor. "Patlamadı"
 * kanıt değil: politikası olmayan UPDATE sessizce SIFIR satır etkiliyor,
 * etkilenen satır `RETURNING` ile SAYILIYOR (`hesap-tasima-rls.spec.ts`).
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC_A = '44444444-4444-4444-4444-44444444444a';
const ACC_B = '44444444-4444-4444-4444-44444444444b';
const ROL = 'advetics_sinyal_test';
const TABLOLAR = ['sinyaller', 'bildirim_kanallari', 'bildirim_gonderimleri'] as const;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  for (const t of [...TABLOLAR, 'clients']) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`, [ORG]);
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
    await h.q(
      `INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, seviye, varlik_id, varlik_adi, gun, onem, para_birimi)
       VALUES ($1, $2, $3, 'meta', $4, 'saglik', 'donusum_kesildi', 'account', $3, 'Hesap', '2026-10-11', 'yuksek', 'TRY')`,
      [ORG, c, acc, `saglik:donusum_kesildi:-:account:${acc}`],
    );
    const [k] = await h.q<{ id: string }>(
      `INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_ipucu, alicilar, olaylar)
       VALUES ($1, $2, 'eposta', 'E', '1 alıcı', ARRAY['x@y.com'], ARRAY['sinyal']) RETURNING id::text AS id`,
      [ORG, c],
    );
    await h.q(
      `INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde)
       VALUES ($1, $2, $3, 'sinyal', 'ozet:2026-10-12', '1 yeni sinyal', '{}'::jsonb)`,
      [ORG, c, k!.id],
    );
  }
});

async function kullaniciOlarak<T = Record<string, unknown>>(sql: string, clientIds: string[], isOrgAdmin = false, active: string | null = null): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ORG}', false),
           set_config('app.current_user_id', '${USER}', false),
           set_config('app.current_client_ids', '${clientIds.join(',')}', false),
           set_config('app.is_org_admin', '${isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '${active ?? ''}', false)
  `);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('sinyal tabloları — RLS', () => {
  it('KRİTİK: A’ya erişen kullanıcı üç tabloda da YALNIZ A’nın satırını görüyor', async () => {
    for (const t of TABLOLAR) {
      const r = await kullaniciOlarak<{ c: string }>(`SELECT client_id::text AS c FROM ${t}`, [A]);
      expect(r, t).toEqual([{ c: A }]);
    }
  });

  it('KRİTİK: B’nin satırı GÜNCELLENEMİYOR (sıfır satır, RETURNING ile sayıldı); A’nınki güncelleniyor', async () => {
    const b = await kullaniciOlarak(`UPDATE sinyaller SET durum = 'kapatildi', kapatma_nedeni = 'kullanici' WHERE client_id = '${B}' RETURNING id`, [A]);
    expect(b).toHaveLength(0);
    const a = await kullaniciOlarak(`UPDATE sinyaller SET durum = 'kapatildi', kapatma_nedeni = 'kullanici' WHERE client_id = '${A}' RETURNING id`, [A]);
    expect(a).toHaveLength(1);
    const g = await kullaniciOlarak(`UPDATE bildirim_gonderimleri SET durum = 'vazgecildi' WHERE client_id = '${B}' RETURNING id`, [A]);
    expect(g).toHaveLength(0);
  });

  it('kanal: başkasınınki silinemiyor, kendininki siliniyor', async () => {
    expect(await kullaniciOlarak(`DELETE FROM bildirim_kanallari WHERE client_id = '${B}' RETURNING id`, [A])).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM bildirim_kanallari WHERE client_id = '${A}' RETURNING id`, [A])).toHaveLength(1);
  });

  it('KRİTİK: erişilemeyen workspace’e kanal ya da gönderim YAZILAMIYOR', async () => {
    await expect(
      kullaniciOlarak(
        `INSERT INTO bildirim_kanallari (org_id, client_id, tur, ad, hedef_ipucu, alicilar, olaylar)
         VALUES ('${ORG}', '${B}', 'eposta', 'E', '1', ARRAY['x@y.com'], ARRAY['sinyal'])`,
        [A],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('sinyallerde DELETE politikası yok: kapatılan sinyalin geçmişi silinemiyor', async () => {
    expect(await kullaniciOlarak(`DELETE FROM sinyaller WHERE client_id = '${A}' RETURNING id`, [A], true)).toHaveLength(0);
  });

  it('KRİTİK: hesap taşıması (atama bağlamı) sinyali yeni workspace’e TAŞIYOR', async () => {
    const r = await kullaniciOlarak(
      `UPDATE sinyaller AS x SET client_id = c.id, org_id = c.org_id FROM clients c
        WHERE c.id = '${B}' AND x.ad_account_id = '${ACC_A}' AND x.client_id IS DISTINCT FROM '${B}' RETURNING x.id`,
      [A, B],
      true,
      null,
    );
    expect(r).toHaveLength(1);
  });
});
