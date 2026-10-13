import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ kurulum_beyanlari RLS — SET ROLE + RETURNING (docs/kurulum-sihirbazi/MIMARI.md § 5) ═══
 *
 * "Patlamadı" yetmez: politikası izin vermeyen UPDATE/DELETE SIFIR satır
 * etkiler ve başarılı döner (CLAUDE.md). Her yazma RETURNING ile sayılıyor,
 * reddedilen her yazmanın ardından satırın YERİNDE durduğu ayrıca okunuyor.
 *
 * İki düzey, iki kural:
 *   · workspace satırı — workspace kapsamlı (başkasınınkini göremez, yazamaz);
 *   · şirket satırı — şirketteki herkes okur, yalnız O şirketin yöneticisi
 *     yazar ve siler.
 */
let h: Harness;
const ORG = '11111111-1111-1111-1111-111111111111';
const ORG2 = '12121212-1212-1212-1212-121212121212';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ROL = 'advetics_kurulum_beyan_rls_test';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  // Koşum ortamı RLS'i kapatıyor (worker = BYPASSRLS); yalnız bu tabloda aç.
  await h.q(`ALTER TABLE kurulum_beyanlari ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Diğer', 'diger', now())`, [ORG, ORG2]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'u@advetics.com', 'U', now())`, [USER, ORG]);
  // B'nin beyanı ve şirket beyanı önceden duruyor.
  await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'adres'), ($1, NULL, 'iki_adim')`, [ORG, B]);
});

interface Kim {
  clientIds: string[];
  aktif?: string;
  yonetici?: boolean;
  org?: string;
}

async function olarak<T = Record<string, unknown>>(sql: string, k: Kim): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${k.org ?? ORG}', false),
           set_config('app.current_user_id', '${USER}', false),
           set_config('app.current_client_ids', '${k.clientIds.join(',')}', false),
           set_config('app.is_org_admin', '${k.yonetici ? 'on' : 'off'}', false),
           set_config('app.can_manage_pool', 'off', false),
           set_config('app.current_active_client_id', '${k.aktif ?? ''}', false),
           set_config('app.current_manager_account_id', '', false),
           set_config('app.tum_sirketler', 'off', false)`);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const sayi = async (where: string) => (await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM kurulum_beyanlari WHERE ${where}`))[0]!.n;

describe('workspace satırı', () => {
  it('KRİTİK: kendi workspace\'ine yazar, yeniden beyan eder (UPDATE yolu), okur, siler — her biri bir satır', async () => {
    const k = { clientIds: [A], aktif: A };
    expect(await olarak(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', '${A}', 'site_yok') RETURNING id`, k)).toHaveLength(1);
    expect(
      await olarak(
        `INSERT INTO kurulum_beyanlari (org_id, client_id, oge, gerekce) VALUES ('${ORG}', '${A}', 'site_yok', 'yeni')
         ON CONFLICT (client_id, oge) WHERE client_id IS NOT NULL DO UPDATE SET gerekce = EXCLUDED.gerekce RETURNING id`,
        k,
      ),
    ).toHaveLength(1);
    expect(await olarak(`SELECT oge, gerekce FROM kurulum_beyanlari WHERE client_id IS NOT NULL`, k)).toEqual([{ oge: 'site_yok', gerekce: 'yeni' }]);
    expect(await olarak(`DELETE FROM kurulum_beyanlari WHERE client_id = '${A}' RETURNING id`, k)).toHaveLength(1);
  });

  it('KRİTİK: başka workspace\'in beyanını GÖREMEZ, siler/günceller SIFIR satır, satır yerinde kalır, yazamaz', async () => {
    const k = { clientIds: [A], aktif: A };
    expect(await olarak(`SELECT id FROM kurulum_beyanlari WHERE client_id = '${B}'`, k)).toEqual([]);
    expect(await olarak(`DELETE FROM kurulum_beyanlari WHERE client_id = '${B}' RETURNING id`, k)).toEqual([]);
    expect(await olarak(`UPDATE kurulum_beyanlari SET gerekce = 'x' WHERE client_id = '${B}' RETURNING id`, k)).toEqual([]);
    expect(await sayi(`client_id = '${B}' AND gerekce IS NULL`)).toBe(1);
    await expect(olarak(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', '${B}', 'bildirim') RETURNING id`, k)).rejects.toThrow(/row-level security/);
  });

  it('KRİTİK: seçili workspace A iken B\'ye yetkisi olsa da B\'nin satırı görünmüyor ve silinmiyor (seçim katmanı)', async () => {
    const k = { clientIds: [A, B], aktif: A };
    expect(await olarak(`SELECT id FROM kurulum_beyanlari WHERE client_id = '${B}'`, k)).toEqual([]);
    expect(await olarak(`DELETE FROM kurulum_beyanlari WHERE client_id = '${B}' RETURNING id`, k)).toEqual([]);
    expect(await sayi(`client_id = '${B}'`)).toBe(1);
  });
});

describe('şirket satırı', () => {
  it('KRİTİK: şirketteki yönetici olmayan kişi OKUR ama yazamaz/silemez (satır yerinde)', async () => {
    const k = { clientIds: [A], aktif: A };
    expect(await olarak(`SELECT oge FROM kurulum_beyanlari WHERE client_id IS NULL`, k)).toEqual([{ oge: 'iki_adim' }]);
    expect(await olarak(`DELETE FROM kurulum_beyanlari WHERE client_id IS NULL RETURNING id`, k)).toEqual([]);
    expect(await olarak(`UPDATE kurulum_beyanlari SET gerekce = 'x' WHERE client_id IS NULL RETURNING id`, k)).toEqual([]);
    expect(await sayi(`client_id IS NULL AND gerekce IS NULL`)).toBe(1);
    await h.q(`DELETE FROM kurulum_beyanlari WHERE client_id IS NULL`);
    await expect(olarak(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', NULL, 'iki_adim') RETURNING id`, k)).rejects.toThrow(/row-level security/);
  });

  it('KRİTİK: şirket yöneticisi kendi şirketinde siler ve yazar — her biri bir satır', async () => {
    const k = { clientIds: [A, B], yonetici: true };
    expect(await olarak(`DELETE FROM kurulum_beyanlari WHERE client_id IS NULL RETURNING id`, k)).toHaveLength(1);
    expect(await olarak(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', NULL, 'iki_adim') RETURNING id`, k)).toHaveLength(1);
  });

  it('KRİTİK: yönetici BAŞKA şirketin kararını yazamaz ve göremez', async () => {
    const k = { clientIds: [A, B], yonetici: true };
    await expect(olarak(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG2}', NULL, 'iki_adim') RETURNING id`, k)).rejects.toThrow(/row-level security/);
    // Başka şirketin yöneticisi bu şirketin satırını görmez, silemez.
    const diger = { clientIds: [], yonetici: true, org: ORG2 };
    expect(await olarak(`SELECT id FROM kurulum_beyanlari`, diger)).toEqual([]);
    expect(await olarak(`DELETE FROM kurulum_beyanlari RETURNING id`, diger)).toEqual([]);
    expect(await sayi('true')).toBe(2);
  });
});
