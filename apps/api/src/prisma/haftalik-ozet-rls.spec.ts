import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';
import { workspaceTasi } from '../modules/manager-account/workspace-tasima';

/**
 * HAFTALIK ÖZET TABLOSUNUN RLS POLİTİKASI — `SET ROLE` + `RETURNING`.
 *
 * SELECT + INSERT workspace kapsamı; UPDATE ve DELETE YOK (satır değişmez,
 * MIMARI Ç-B11). "Patlamadı" kanıt değil: politikası olmayan UPDATE
 * sessizce SIFIR satır etkiler, bu yüzden `RETURNING` ile sayılıyor ve
 * aynı UPDATE'in RLS olmadan satır etkilediği bekçiyle gösteriliyor.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const ORG_B = '11111111-1111-1111-1111-11111111111b';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ROL = 'advetics_ozet_test';

const satir = (c: string, hafta = '2026-W41') =>
  `INSERT INTO haftalik_ozetler (org_id, client_id, hafta, veri, yorum_durumu)
   VALUES ('${ORG}', '${c}', '${hafta}', '{"gizli":"ajans"}', 'atlandi') RETURNING id`;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`ALTER TABLE haftalik_ozetler ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => h.close());

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now()), ($2, 'Kardeş', 'kardes', now())`, [ORG, ORG_B]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'a@advetics.com', 'A', now())`, [USER, ORG]);
  await h.q(satir(A));
  await h.q(satir(B));
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

describe('haftalik_ozetler — RLS', () => {
  it('KRİTİK: A’ya erişen kullanıcı YALNIZ A’nın özetini görüyor', async () => {
    expect(await kullaniciOlarak<{ c: string }>(`SELECT client_id::text AS c FROM haftalik_ozetler`, [A])).toEqual([{ c: A }]);
  });

  it('KRİTİK: kendi workspace’ine INSERT geçiyor (önizleme üretimi), başkasınınkine REDDEDİLİYOR', async () => {
    expect(await kullaniciOlarak(satir(A, '2026-W40'), [A])).toHaveLength(1);
    await expect(kullaniciOlarak(satir(B, '2026-W40'), [A])).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: UPDATE ve DELETE SIFIR satır (RETURNING ile sayıldı), org yöneticisi için de — özet değişmez', async () => {
    expect(await kullaniciOlarak(`UPDATE haftalik_ozetler SET yorum_durumu = 'yazildi' RETURNING id`, [A, B], true)).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM haftalik_ozetler RETURNING id`, [A, B], true)).toHaveLength(0);
    // Mutasyon bekçisi: satırlar var ve RLS olmadan güncellenebiliyor.
    expect(await h.q(`UPDATE haftalik_ozetler SET yorum_durumu = 'atlandi' RETURNING id`)).toHaveLength(2);
  });

  it('KRİTİK: workspace başka şirkete geçince org_id kompozit anahtarla TAŞINIYOR (CASCADE listesi)', async () => {
    await workspaceTasi(h.db as never, A, ORG, ORG_B);
    expect(await h.q<{ o: string }>(`SELECT org_id::text AS o FROM haftalik_ozetler WHERE client_id = $1`, [A])).toEqual([{ o: ORG_B }]);
  });

  it('aynı workspace × hafta İKİNCİ satır açmıyor (eşzamanlı üretici korkusu)', async () => {
    await expect(h.q(satir(A))).rejects.toThrow(/duplicate key|unique/i);
  });
});

describe('report_schedules — workspace başına TEK özet planı', () => {
  it('KRİTİK: ikinci haftalik_ozet planı reddediliyor; rapor planları etkilenmiyor', async () => {
    const ekle = (tur: string) =>
      h.q(
        `INSERT INTO report_schedules (id, org_id, client_id, created_by_user_id, tur, frequency, day_of_week, hour, range_key,
           to_emails, attach_pdf, enabled, next_run_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'weekly', 1, 9, 'x', '{}', false, true, now(), now())`,
        [ORG, A, USER, tur],
      );
    await ekle('rapor');
    await ekle('rapor');
    await ekle('haftalik_ozet');
    await expect(ekle('haftalik_ozet')).rejects.toThrow(/duplicate key|unique/i);
    await expect(ekle('baska')).rejects.toThrow(/report_schedules_tur_chk/);
  });
});
