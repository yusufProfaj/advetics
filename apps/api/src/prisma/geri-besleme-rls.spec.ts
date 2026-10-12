import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHarness, type Harness } from '../../test/pglite-harness';
import { durumDegisti } from '../modules/geri-besleme/lead-asama';

/**
 * GERİ BESLEME TABLOLARININ RLS POLİTİKALARI — `SET ROLE` + `RETURNING`.
 *
 * Koşum ortamı RLS'i kapatıyor (worker BYPASSRLS taklidi); burada sahibi
 * olmayan bir role geçilip politikanın KENDİSİ sınanıyor. "Patlamadı" kanıt
 * değil: politikası olmayan UPDATE sessizce SIFIR satır etkiliyor; etkilenen
 * satır `RETURNING` ile SAYILIYOR (`hesap-tasima-rls.spec.ts`).
 *
 * Son blok `PUT /leads/:id`in yolunu (`durumDegisti`) kullanıcı rolüyle
 * koşturuyor: geçmiş ve olay satırları politikadan GERÇEKTEN geçiyor mu.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const LEAD_A = 'aaaaaaaa-0000-4000-8000-00000000000a';
const LEAD_B = 'bbbbbbbb-0000-4000-8000-00000000000b';
const ROL = 'advetics_geri_besleme_test';
const TABLOLAR = ['lead_durum_gecmisi', 'geri_besleme_ayarlari', 'geri_besleme_olaylari'] as const;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${ROL} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  for (const t of [...TABLOLAR, 'clients', 'leads']) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`, [ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`, [A, B, ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'a@advetics.com', 'A', now())`, [USER, ORG]);
  for (const [l, c, ext] of [
    [LEAD_A, A, '123456789012345'],
    [LEAD_B, B, '223456789012345'],
  ] as const) {
    await h.q(
      `INSERT INTO leads (id, org_id, client_id, external_lead_id, full_name, source, submitted_at, updated_at)
       VALUES ($1, $2, $3, $4, 'Kişi', 'webhook', now() - interval '1 hour', now())`,
      [l, ORG, c, ext],
    );
    await h.q(
      `INSERT INTO lead_durum_gecmisi (org_id, client_id, lead_id, onceki_durum, yeni_durum, kaynak) VALUES ($1, $2, $3, NULL, 'new', 'sistem')`,
      [ORG, c, l],
    );
    await h.q(
      `INSERT INTO geri_besleme_ayarlari (client_id, platform, org_id, etkin, dataset_id, aydinlatma_zamani, updated_at)
       VALUES ($1, 'meta', $2, true, '1234567890', now(), now())`,
      [c, ORG],
    );
    await h.q(
      `INSERT INTO geri_besleme_olaylari (org_id, client_id, lead_id, platform, asama, olay_kimligi, olay_zamani, sonraki_deneme)
       VALUES ($1, $2, $3, 'meta', 'ham_lead', $4, now(), now())`,
      [ORG, c, l, `adv-${l}-ham_lead`],
    );
  }
});

async function baglam(clientIds: string[]): Promise<void> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${ORG}', false),
           set_config('app.current_user_id', '${USER}', false),
           set_config('app.current_client_ids', '${clientIds.join(',')}', false),
           set_config('app.is_org_admin', 'off', false),
           set_config('app.current_active_client_id', '', false)
  `);
}

async function kullaniciOlarak<T = Record<string, unknown>>(sql: string, clientIds: string[]): Promise<T[]> {
  await baglam(clientIds);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

describe('geri besleme tabloları — RLS', () => {
  it('KRİTİK: A’ya erişen kullanıcı üç tabloda da YALNIZ A’nın satırını görüyor', async () => {
    for (const t of TABLOLAR) {
      const r = await kullaniciOlarak<{ c: string }>(`SELECT client_id::text AS c FROM ${t}`, [A]);
      expect(r, t).toEqual([{ c: A }]);
    }
  });

  it('KRİTİK: B’nin olayı ve ayarı GÜNCELLENEMİYOR (sıfır satır, RETURNING ile); A’nınki güncelleniyor', async () => {
    expect(await kullaniciOlarak(`UPDATE geri_besleme_olaylari SET durum = 'iptal', sonraki_deneme = NULL WHERE client_id = '${B}' RETURNING id`, [A])).toHaveLength(0);
    expect(await kullaniciOlarak(`UPDATE geri_besleme_ayarlari SET etkin = false WHERE client_id = '${B}' RETURNING client_id`, [A])).toHaveLength(0);
    expect(await kullaniciOlarak(`UPDATE geri_besleme_olaylari SET durum = 'iptal', sonraki_deneme = NULL WHERE client_id = '${A}' RETURNING id`, [A])).toHaveLength(1);
    expect(await kullaniciOlarak(`UPDATE geri_besleme_ayarlari SET etkin = false WHERE client_id = '${A}' RETURNING client_id`, [A])).toHaveLength(1);
  });

  it('KRİTİK: erişilemeyen workspace’e geçmiş, ayar ya da olay YAZILAMIYOR', async () => {
    await expect(
      kullaniciOlarak(
        `INSERT INTO lead_durum_gecmisi (org_id, client_id, lead_id, onceki_durum, yeni_durum, kaynak)
         VALUES ('${ORG}', '${B}', '${LEAD_B}', 'new', 'won', 'panel')`,
        [A],
      ),
    ).rejects.toThrow(/row-level security/i);
    await expect(
      kullaniciOlarak(
        `INSERT INTO geri_besleme_olaylari (org_id, client_id, lead_id, platform, asama, olay_kimligi, olay_zamani, sonraki_deneme)
         VALUES ('${ORG}', '${B}', '${LEAD_B}', 'meta', 'satisa_dondu', 'x', now(), now())`,
        [A],
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('DELETE politikası yok: geçmiş ve gönderim kaydı tek başına silinemiyor', async () => {
    for (const t of TABLOLAR) {
      expect(await kullaniciOlarak(`DELETE FROM ${t} WHERE client_id = '${A}' RETURNING client_id`, [A]), t).toHaveLength(0);
    }
  });

  it('KRİTİK: lead silinince (KVKK) geçmiş ve olaylar CASCADE ile gidiyor', async () => {
    expect(await kullaniciOlarak(`DELETE FROM leads WHERE id = '${LEAD_A}' RETURNING id`, [A])).toHaveLength(1);
    const kalan = await h.q<{ n: number }>(
      `SELECT (SELECT count(*) FROM lead_durum_gecmisi WHERE lead_id = $1) + (SELECT count(*) FROM geri_besleme_olaylari WHERE lead_id = $1) AS n`,
      [LEAD_A],
    );
    expect(Number(kalan[0]!.n)).toBe(0);
  });

  it('KRİTİK: durum değişimi (PUT /leads/:id yolu) kullanıcı rolüyle geçmiş + olay satırlarını YAZABİLİYOR (sayıldı)', async () => {
    await baglam([A]);
    await h.q(`SET ROLE ${ROL}`);
    let sonuc;
    try {
      const db = {
        $queryRaw: <T>(s: Prisma.Sql) => h.pg.query(s.text, s.values as unknown[]).then((r) => r.rows as T),
        $executeRaw: (s: Prisma.Sql) => h.pg.query(s.text, s.values as unknown[]).then((r) => r.affectedRows ?? 0),
      };
      sonuc = await durumDegisti(db, {
        leadId: LEAD_A,
        clientId: A,
        orgId: ORG,
        onceki: 'new',
        yeni: 'qualified',
        submittedAt: new Date(Date.now() - 3_600_000),
        userId: USER,
        kaynak: 'panel',
        simdi: new Date(),
      });
    } finally {
      await h.q('RESET ROLE');
    }
    // Ham lead zaten vardı; ulaşıldı + ilgili AÇILDI ve politika onları geçirdi.
    expect(sonuc).toMatchObject({ ayarEtkin: true, olusturulan: 2 });
    const g = await h.q(`SELECT 1 FROM lead_durum_gecmisi WHERE lead_id = $1 AND yeni_durum = 'qualified'`, [LEAD_A]);
    expect(g).toHaveLength(1);
  });
});
