import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';
import { hesapVerisiniTasi } from '../modules/connections/hesap-verisi-tasima';
import { workspaceTasi } from '../modules/manager-account/workspace-tasima';
import { briefAyir } from '../modules/kreatif-zeka/sayac';

/**
 * ═══ KREATİF ZEKÂSI TABLOLARININ RLS'İ — `SET ROLE` + `RETURNING` ═══
 *
 * Sahibi olmayan bir role geçilip dört tablonun politikaları GERÇEKTEN
 * sınanıyor: (1) başka workspace'in satırı görünmüyor, (2) başka
 * workspace'e yazılamıyor, (3) hesap taşıma içerik satırını TAŞIYOR ve
 * etiketi hedefe KOPYALIYOR (kullanıcı bağlamında, satır sayılarak),
 * (4) brief ayırması kullanıcı bağlamında çalışıyor (sayaç UPDATE
 * politikası). "Patlamadı" kanıt değil: politikası olmayan UPDATE sessizce
 * SIFIR satır etkiler (CLAUDE.md).
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
const KR_A = '55555555-5555-5555-5555-55555555555a';
const KR_B = '55555555-5555-5555-5555-55555555555b';
const OZ_A = 'a'.repeat(64);
const OZ_B = 'b'.repeat(64);
const ROL = 'advetics_kreatif_test';
const TABLOLAR = ['kreatif_icerikleri', 'kreatif_etiketleri', 'kreatif_etiket_sayaci', 'kreatif_briefleri'];

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
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Kardeş', 'kardes', now())`, [ORG, ORG_B]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'a@advetics.com', 'A', now())`, [USER, ORG]);
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label,
       access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'u1', 'BM', '\\x00', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
  for (const [acc, c, kr, oz, ext] of [
    [ACC_A, A, KR_A, OZ_A, 'act_a'],
    [ACC_B, B, KR_B, OZ_B, 'act_b'],
  ] as const) {
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', $5, 'Hesap', 'TRY', 'Europe/Istanbul', now())`,
      [acc, ORG, c, CONN, ext],
    );
    await h.q(`INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, updated_at) VALUES ($1, $2, $3, 'meta', $4, now())`, [kr, acc, c, `k-${ext}`]);
    await h.q(
      `INSERT INTO kreatif_icerikleri (creative_id, org_id, client_id, ad_account_id, platform, icerik_ozeti, bicim, en_boy, durum, deneme, sema_surumu)
       VALUES ($1, $2, $3, $4, 'meta', $5, 'gorsel', 'kare', 'etiketlendi', 1, 1)`,
      [kr, ORG, c, acc, oz],
    );
    await h.q(`INSERT INTO kreatif_etiketleri (org_id, client_id, icerik_ozeti, sema_surumu, etiketler, model) VALUES ($1, $2, $3, 1, '{"insan":"var"}', 'm')`, [ORG, c, oz]);
    await h.q(`INSERT INTO kreatif_etiket_sayaci (org_id, client_id, gun, etiket_istek) VALUES ($1, $2, '2026-10-12', 3)`, [ORG, c]);
    await h.q(
      `INSERT INTO kreatif_briefleri (org_id, client_id, kume_anahtari, girdi_ozeti, bulgular, cevap, model)
       VALUES ($1, $2, 'meta:satis', $3, '[{"alan":"insan"}]', '{}', 'm')`,
      [ORG, c, oz],
    );
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

describe('kreatif zekâsı — RLS', () => {
  it('KRİTİK: A’ya erişen kullanıcı dört tabloda YALNIZ A’nın satırını görüyor', async () => {
    for (const t of TABLOLAR) {
      expect(await kullaniciOlarak<{ c: string }>(`SELECT client_id::text AS c FROM ${t}`, [A]), t).toEqual([{ c: A }]);
    }
  });

  it('KRİTİK: erişemediği workspace’e satır yazılamıyor (etiket kopyası ve brief dahil)', async () => {
    await expect(
      kullaniciOlarak(`INSERT INTO kreatif_etiketleri (org_id, client_id, icerik_ozeti, sema_surumu, etiketler, model) VALUES ('${ORG}', '${B}', '${'c'.repeat(64)}', 1, '{}', 'm')`, [A]),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      kullaniciOlarak(`INSERT INTO kreatif_briefleri (org_id, client_id, kume_anahtari, girdi_ozeti, bulgular, cevap, model) VALUES ('${ORG}', '${B}', 'meta:satis', '${'c'.repeat(64)}', '[1]', '{}', 'm')`, [A]),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: etiket ve brief GÜNCELLENEMİYOR / SİLİNEMİYOR (RETURNING ile sıfır), içerik ve sayaç güncellenebiliyor', async () => {
    expect(await kullaniciOlarak(`UPDATE kreatif_etiketleri SET model = 'x' RETURNING id`, [A, B], true)).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM kreatif_briefleri RETURNING id`, [A, B], true)).toHaveLength(0);
    expect(await kullaniciOlarak(`UPDATE kreatif_icerikleri SET updated_at = now() WHERE client_id = '${A}' RETURNING creative_id`, [A])).toHaveLength(1);
    expect(await kullaniciOlarak(`UPDATE kreatif_etiket_sayaci SET updated_at = now() WHERE client_id = '${A}' RETURNING gun`, [A])).toHaveLength(1);
    // Mutasyon bekçisi: satırlar gerçekten var ve RLS olmadan güncellenebiliyor.
    expect(await h.q(`UPDATE kreatif_etiketleri SET model = 'x' RETURNING id`)).toHaveLength(2);
  });

  it('KRİTİK: brief ayırması KULLANICI bağlamında çalışıyor (UPDATE politikası yoksa her brief "sınır doldu" derdi)', async () => {
    await h.q(`
      SELECT set_config('app.current_org_id', '${ORG}', false), set_config('app.current_user_id', '${USER}', false),
             set_config('app.current_client_ids', '${A}', false), set_config('app.is_org_admin', 'off', false),
             set_config('app.current_active_client_id', '', false)`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      expect(await briefAyir(h.db, { orgId: ORG, clientId: A, gun: '2026-10-12' })).toBe(true);
    } finally {
      await h.q('RESET ROLE');
    }
    expect(await h.q(`SELECT brief_istek FROM kreatif_etiket_sayaci WHERE client_id = $1`, [A])).toEqual([{ brief_istek: 1 }]);
  });

  it('KRİTİK: hesap A’dan B’ye: içerik satırı TAŞINIYOR, etiket B’ye KOPYALANIYOR ve A’da KALIYOR (kullanıcı bağlamında)', async () => {
    await h.q(`
      SELECT set_config('app.current_org_id', '${ORG}', false), set_config('app.current_user_id', '${USER}', false),
             set_config('app.current_client_ids', '${A},${B}', false), set_config('app.is_org_admin', 'on', false),
             set_config('app.current_active_client_id', '', false)`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      const r = await hesapVerisiniTasi(h.db, ACC_A, B);
      expect(r.tasinan.kreatif_icerikleri).toBe(1);
    } finally {
      await h.q('RESET ROLE');
    }
    expect(await h.q(`SELECT client_id::text AS c FROM kreatif_icerikleri WHERE creative_id = $1`, [KR_A])).toEqual([{ c: B }]);
    const etiketler = await h.q<{ c: string }>(`SELECT client_id::text AS c FROM kreatif_etiketleri WHERE icerik_ozeti = $1 ORDER BY c`, [OZ_A]);
    expect(etiketler.map((e) => e.c)).toEqual([A, B]);
  });

  it('KRİTİK: workspace başka şirkete geçince dört tablo kompozit anahtarla TAŞINIYOR', async () => {
    await workspaceTasi(h.db as never, A, ORG, ORG_B);
    for (const t of TABLOLAR) {
      expect(await h.q<{ o: string }>(`SELECT DISTINCT org_id::text AS o FROM ${t} WHERE client_id = $1`, [A]), t).toEqual([{ o: ORG_B }]);
    }
  });
});
