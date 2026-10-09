import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * İYİLEŞTİR TABLOLARI — RLS POLİTİKALARI GERÇEKTEN SINANIYOR.
 *
 * Koşum ortamı RLS'i kapatıyor (worker'ın BYPASSRLS rolünü taklit ediyor);
 * burada `SET ROLE` ile sahibi olmayan bir role geçilip politikanın KENDİSİ
 * sınanıyor (`hesap-tasima-rls.spec.ts` deseni). Her yazma `RETURNING` ile
 * SAYILIYOR: politikasız bir UPDATE hata vermez, sıfır satır etkiler.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const BEN = '22222222-2222-2222-2222-222222222222';
const O = '33333333-3333-3333-3333-333333333333';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTURUM_BEN = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const OTURUM_O = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ROL = 'advetics_iyilestir_test';
const TABLOLAR = ['iyilestir_oneri_karar', 'iyilestir_asistan_oturum', 'iyilestir_asistan_mesaj'] as const;

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
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $3, 'ben@advetics.com', 'Ben', now()), ($2, $3, 'o@advetics.com', 'O', now())`,
    [BEN, O, ORG],
  );
  await h.q(
    `INSERT INTO iyilestir_asistan_oturum (id, org_id, client_id, user_id) VALUES ($1, $3, $4, $5), ($2, $3, $4, $6)`,
    [OTURUM_BEN, OTURUM_O, ORG, A, BEN, O],
  );
  await h.q(
    `INSERT INTO iyilestir_asistan_mesaj (oturum_id, org_id, client_id, user_id, rol, parcalar) VALUES ($1, $2, $3, $4, 'kullanici', '[]')`,
    [OTURUM_O, ORG, A, O],
  );
  await h.q(
    `INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, user_id)
     VALUES ($1, $2, 'k:ad:x:2026-W41', 'kreatif_yorgunlugu', 'meta', 'yoksayildi', '{}', $3)`,
    [ORG, B, O],
  );
});

/** Kullanıcı A workspace'ine erişiyor, B'ye ERİŞEMİYOR (org admin değil). */
async function benOlarak<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ORG}', false),
           set_config('app.current_user_id', '${BEN}', false),
           set_config('app.current_client_ids', '${A}', false),
           set_config('app.is_org_admin', 'off', false),
           set_config('app.current_active_client_id', '', false)`);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql, params);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('iyilestir_oneri_karar', () => {
  it('KRİTİK: kendi workspace\'ine karar YAZIYOR (RETURNING 1 satır)', async () => {
    const r = await benOlarak(
      `INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, sonuc, user_id)
       VALUES ($1, $2, 'k:ad:y:2026-W41', 'kreatif_yorgunlugu', 'meta', 'uygulandi', '{}', '{}', $3) RETURNING id`,
      [ORG, A, BEN],
    );
    expect(r).toHaveLength(1);
  });

  it('KRİTİK: erişemediği workspace\'e karar YAZAMIYOR', async () => {
    await expect(
      benOlarak(
        `INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, user_id)
         VALUES ($1, $2, 'k:ad:z:2026-W41', 'kreatif_yorgunlugu', 'meta', 'yoksayildi', '{}', $3) RETURNING id`,
        [ORG, B, BEN],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: BAŞKASI ADINA karar yazılamıyor (user_id kendisi olmalı)', async () => {
    await expect(
      benOlarak(
        `INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, user_id)
         VALUES ($1, $2, 'k:ad:w:2026-W41', 'kreatif_yorgunlugu', 'meta', 'yoksayildi', '{}', $3) RETURNING id`,
        [ORG, A, O],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: başka workspace\'in kararı GÖRÜNMÜYOR ve SİLİNEMİYOR', async () => {
    expect(await benOlarak(`SELECT id FROM iyilestir_oneri_karar`)).toHaveLength(0);
    // DELETE politikası yok: kendi satırı bile silinemiyor (sıfır satır).
    await benOlarak(
      `INSERT INTO iyilestir_oneri_karar (org_id, client_id, anahtar, tur, platform, durum, eylem, user_id)
       VALUES ($1, $2, 'k:ad:v:2026-W41', 'kreatif_yorgunlugu', 'meta', 'yoksayildi', '{}', $3) RETURNING id`,
      [ORG, A, BEN],
    );
    expect(await benOlarak(`DELETE FROM iyilestir_oneri_karar RETURNING id`)).toHaveLength(0);
  });
});

describe('iyilestir_asistan_oturum / mesaj', () => {
  it('KRİTİK: ekip arkadaşının oturumu ve mesajı OKUNUYOR', async () => {
    expect(await benOlarak(`SELECT id FROM iyilestir_asistan_oturum`)).toHaveLength(2);
    expect(await benOlarak(`SELECT id FROM iyilestir_asistan_mesaj`)).toHaveLength(1);
  });

  it('KRİTİK: başkasının oturumuna onun adına mesaj YAZILAMIYOR', async () => {
    await expect(
      benOlarak(
        `INSERT INTO iyilestir_asistan_mesaj (oturum_id, org_id, client_id, user_id, rol, parcalar)
         VALUES ($1, $2, $3, $4, 'kullanici', '[]') RETURNING id`,
        [OTURUM_O, ORG, A, O],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: kendi oturumuna mesaj yazıyor (RETURNING 1 satır)', async () => {
    const r = await benOlarak(
      `INSERT INTO iyilestir_asistan_mesaj (oturum_id, org_id, client_id, user_id, rol, parcalar)
       VALUES ($1, $2, $3, $4, 'kullanici', '[]') RETURNING id`,
      [OTURUM_BEN, ORG, A, BEN],
    );
    expect(r).toHaveLength(1);
  });

  it('başkasının oturumu güncellenemiyor (sıfır satır, RETURNING ile sayıldı)', async () => {
    expect(await benOlarak(`UPDATE iyilestir_asistan_oturum SET created_at = now() WHERE id = $1 RETURNING id`, [OTURUM_O])).toHaveLength(0);
    expect(await benOlarak(`UPDATE iyilestir_asistan_oturum SET created_at = now() WHERE id = $1 RETURNING id`, [OTURUM_BEN])).toHaveLength(1);
  });

  it('erişilemeyen workspace\'te oturum açılamıyor', async () => {
    await expect(
      benOlarak(`INSERT INTO iyilestir_asistan_oturum (org_id, client_id, user_id) VALUES ($1, $2, $3) RETURNING id`, [ORG, B, BEN]),
    ).rejects.toThrow(/row-level security/i);
  });
});
