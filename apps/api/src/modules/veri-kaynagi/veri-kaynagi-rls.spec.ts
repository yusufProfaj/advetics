import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ VERİ KAYNAKLARI RLS — SET ROLE + RETURNING (kurulum-rls deseni) ═══
 *
 * "Patlamadı" yetmez: politikası izin vermeyen UPDATE SIFIR satır etkiler ve
 * başarılı döner. Etkilenen satır RETURNING ile sayılıyor. Üç tablo da
 * workspace kapsamlı; DELETE politikası YOK (kaldırma bir durum).
 */
let h: Harness;
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const KA = 'a1a1a1a1-a1a1-41a1-81a1-a1a1a1a1a1a1';
const KB = 'b1b1b1b1-b1b1-41b1-81b1-b1b1b1b1b1b1';
const ROL = 'advetics_veri_kaynagi_rls_test';
const TABLOLAR = ['veri_kaynaklari', 'ga4_gunluk', 'ga4_anahtar_etkinlik_gunluk'] as const;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  for (const t of TABLOLAR) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`, [ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'u@advetics.com', 'U', now())`, [USER, ORG]);
  for (const [k, c, m] of [
    [KA, A, '111111111'],
    [KB, B, '222222222'],
  ] as const) {
    await h.q(`INSERT INTO veri_kaynaklari (id, org_id, client_id, tur, dis_kimlik, ad) VALUES ($1, $2, $3, 'ga4', $4, 'Site')`, [k, ORG, c, m]);
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, oturum) VALUES ('2026-10-12', $1, repeat('a', 64), $2, $3, 'a / b', 5)`,
      [k, c, ORG],
    );
    await h.q(
      `INSERT INTO ga4_anahtar_etkinlik_gunluk (gun, veri_kaynagi_id, satir_hash, etkinlik, client_id, org_id, kaynak_ortam, anahtar_etkinlik)
       VALUES ('2026-10-12', $1, repeat('a', 64), 'generate_lead', $2, $3, 'a / b', 2)`,
      [k, c, ORG],
    );
  }
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

describe('veri kaynağı RLS', () => {
  for (const t of TABLOLAR) {
    it(`KRİTİK: ${t} — kendi workspace satırını okur ve günceller, başkasınınkini GÖRMEZ ve GÜNCELLEYEMEZ (sayılarak)`, async () => {
      expect(await asUser(`SELECT client_id::text FROM ${t}`, [A])).toEqual([{ client_id: A }]);
      const kolon = t === 'veri_kaynaklari' ? `durum = 'hata'` : `client_id = client_id`;
      expect(await asUser(`UPDATE ${t} SET ${kolon} WHERE client_id = '${A}' RETURNING client_id`, [A])).toHaveLength(1);
      expect(await asUser(`UPDATE ${t} SET ${kolon} WHERE client_id = '${B}' RETURNING client_id`, [A])).toEqual([]);
    });

    it(`${t} — DELETE politikası yok: kendi satırı bile silinmez (sıfır satır)`, async () => {
      expect(await asUser(`DELETE FROM ${t} WHERE client_id = '${A}' RETURNING client_id`, [A])).toEqual([]);
    });
  }

  it('KRİTİK: başka workspace adına kaynak EKLENEMEZ', async () => {
    await expect(
      asUser(`INSERT INTO veri_kaynaklari (org_id, client_id, tur, dis_kimlik, ad) VALUES ('${ORG}', '${B}', 'ga4', '333333333', 'X') RETURNING id`, [A]),
    ).rejects.toThrow(/row-level security/);
  });

  it('KRİTİK: satırı başka workspace\'e taşıyan UPDATE reddedilir', async () => {
    await expect(asUser(`UPDATE veri_kaynaklari SET client_id = '${B}' WHERE id = '${KA}' RETURNING id`, [A])).rejects.toThrow(/row-level security/);
  });

  it('aynı mülk aynı şirkette ikinci kez bağlanamaz (tekil indeks RLS\'e tabi değil: servis 409 yazıyor)', async () => {
    await expect(h.q(`INSERT INTO veri_kaynaklari (org_id, client_id, tur, dis_kimlik, ad) VALUES ($1, $2, 'ga4', '222222222', 'X')`, [ORG, A])).rejects.toThrow(
      /veri_kaynaklari_dis_kimlik_key|duplicate/,
    );
  });

  it('şifreli kimlik yalnız mağaza türünde (CHECK)', async () => {
    await expect(h.q(`UPDATE veri_kaynaklari SET kimlik_enc = '\\x01' WHERE id = $1`, [KA])).rejects.toThrow(/veri_kaynaklari_kimlik_chk/);
  });
});
