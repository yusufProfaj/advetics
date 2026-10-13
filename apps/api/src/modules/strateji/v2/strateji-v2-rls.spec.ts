import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';

/**
 * AdvStrategy v2 tabloları — RLS GERÇEK politikalarla (`SET ROLE`, sahibi
 * olmayan rol). Her yazma iddiası `RETURNING` ile ETKİLENEN SATIRI sayıyor:
 * politikası tutmayan UPDATE/DELETE hata vermez, sıfır satır etkiler.
 */
const ROL = 'adv_strateji_v2_test';
const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TABLOLAR = ['strateji_planlari', 'strateji_kalemleri', 'strateji_yorumlari', 'strateji_onay_baglantilari'];
let h: Harness;
const plan: Record<string, string> = {};
const kalemId: Record<string, string> = {};

beforeAll(async () => {
  h = await createHarness();
  await h.q(`DO $$ BEGIN CREATE ROLE ${ROL} NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${ROL}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${ROL}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${ROL}`);
}, 60_000);
afterAll(async () => h?.close());

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öteki', 'oteki', now())`, [OTEKI, IDS.org]);
  for (const c of [IDS.client, OTEKI]) {
    plan[c] = (await h.q<{ id: string }>(
      `INSERT INTO strateji_planlari (org_id, client_id, bicim, donem, baslangic, bitis, toplam_butce_micros, para_birimi)
       VALUES ($1, $2, 2, '2026-11', '2026-11-01', '2026-11-30', 1000000, 'TRY') RETURNING id::text`,
      [IDS.org, c],
    ))[0]!.id;
    kalemId[c] = (await h.q<{ id: string }>(
      `INSERT INTO strateji_kalemleri (plan_id, org_id, client_id, sira, amac, meta_acik, google_acik, butce_micros, baslangic, bitis)
       VALUES ($1, $2, $3, 1, 'SITE', true, false, 1, '2026-11-02', '2026-11-30') RETURNING id::text`,
      [plan[c], IDS.org, c],
    ))[0]!.id;
    await h.q(
      `INSERT INTO strateji_yorumlari (plan_id, org_id, client_id, surum, user_id, rol, tur, metin) VALUES ($1, $2, $3, 1, $4, 'ajans', 'yorum', 'not')`,
      [plan[c], IDS.org, c, IDS.user],
    );
    await h.q(
      `INSERT INTO strateji_onay_baglantilari (plan_id, org_id, client_id, surum, token_hash, son_gecerlilik)
       VALUES ($1, $2, $3, 1, $4, now() + interval '1 day')`,
      [plan[c], IDS.org, c, (c === IDS.client ? 'a' : 'b').repeat(64)],
    );
  }
});

/** Yalnız IDS.client'a erişimi olan, org yöneticisi OLMAYAN kullanıcı olarak. */
async function kullaniciOlarak<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id', '${IDS.org}', false),
           set_config('app.current_user_id', '${IDS.user}', false),
           set_config('app.current_client_ids', '${IDS.client}', false),
           set_config('app.is_org_admin', 'off', false),
           set_config('app.current_active_client_id', '', false)`);
  for (const t of TABLOLAR) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  await h.q(`SET ROLE ${ROL}`);
  try {
    return await h.q<T>(sql, params);
  } finally {
    await h.q('RESET ROLE');
    for (const t of TABLOLAR) await h.q(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
  }
}

describe('strateji_kalemleri RLS', () => {
  it('KRİTİK: yalnız erişilen workspace’in kalemi görünür; başkasınınki UPDATE/DELETE SIFIR satır', async () => {
    expect((await kullaniciOlarak<{ id: string }>('SELECT id::text FROM strateji_kalemleri')).map((x) => x.id)).toEqual([kalemId[IDS.client]]);
    expect(await kullaniciOlarak(`UPDATE strateji_kalemleri SET notu = 'x' WHERE id = $1 RETURNING id`, [kalemId[IDS.client]])).toHaveLength(1);
    expect(await kullaniciOlarak(`UPDATE strateji_kalemleri SET notu = 'x' WHERE id = $1 RETURNING id`, [kalemId[OTEKI]])).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM strateji_kalemleri WHERE id = $1 RETURNING id`, [kalemId[OTEKI]])).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM strateji_kalemleri WHERE id = $1 RETURNING id`, [kalemId[IDS.client]])).toHaveLength(1);
  });

  it('KRİTİK: erişilmeyen workspace’e kalem YAZILAMAZ; kalem başka workspace’e taşınamaz', async () => {
    await expect(
      kullaniciOlarak(
        `INSERT INTO strateji_kalemleri (plan_id, org_id, client_id, sira, amac, meta_acik, google_acik, butce_micros, baslangic, bitis)
         VALUES ($1, $2, $3, 2, 'SITE', true, false, 1, '2026-11-02', '2026-11-30') RETURNING id`,
        [plan[OTEKI], IDS.org, OTEKI],
      ),
    ).rejects.toThrow(/row-level security/);
    // WHERE/RETURNING YOK: kolon okuyan UPDATE yeni satırı SELECT politikasından
    // da geçirir ve WITH CHECK silinse bile reddederdi (strateji-rls.spec.ts dersi).
    await expect(kullaniciOlarak(`UPDATE strateji_kalemleri SET client_id = '${OTEKI}'`)).rejects.toThrow(/row-level security|violates foreign key/);
  });
});

describe('strateji_yorumlari RLS — kayıt değiştirilemez', () => {
  it('KRİTİK: kendi yorumu bile UPDATE/DELETE SIFIR satır; INSERT yalnız erişilen workspace’e', async () => {
    expect(await kullaniciOlarak(`UPDATE strateji_yorumlari SET metin = 'değişti' RETURNING id`)).toHaveLength(0);
    expect(await kullaniciOlarak(`DELETE FROM strateji_yorumlari RETURNING id`)).toHaveLength(0);
    const r = await kullaniciOlarak(
      `INSERT INTO strateji_yorumlari (plan_id, org_id, client_id, surum, user_id, rol, tur, metin) VALUES ($1, $2, $3, 1, $4, 'musteri', 'yorum', 'ok') RETURNING id`,
      [plan[IDS.client], IDS.org, IDS.client, IDS.user],
    );
    expect(r).toHaveLength(1);
    await expect(
      kullaniciOlarak(
        `INSERT INTO strateji_yorumlari (plan_id, org_id, client_id, surum, user_id, rol, tur, metin) VALUES ($1, $2, $3, 1, $4, 'musteri', 'yorum', 'x') RETURNING id`,
        [plan[OTEKI], IDS.org, OTEKI, IDS.user],
      ),
    ).rejects.toThrow(/row-level security/);
    const [n] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM strateji_yorumlari WHERE metin = 'değişti'`);
    expect(n!.n).toBe(0);
  });
});

describe('strateji_onay_baglantilari RLS', () => {
  it('KRİTİK: başka workspace’in bağlantısı GÖRÜNMEZ ve iptal edilemez (0 satır); silinemez', async () => {
    expect((await kullaniciOlarak<{ client_id: string }>('SELECT client_id::text FROM strateji_onay_baglantilari')).map((x) => x.client_id)).toEqual([IDS.client]);
    expect(await kullaniciOlarak(`UPDATE strateji_onay_baglantilari SET iptal_at = now() WHERE client_id = $1 RETURNING id`, [OTEKI])).toHaveLength(0);
    expect(await kullaniciOlarak(`UPDATE strateji_onay_baglantilari SET iptal_at = now() WHERE client_id = $1 RETURNING id`, [IDS.client])).toHaveLength(1);
    expect(await kullaniciOlarak(`DELETE FROM strateji_onay_baglantilari RETURNING id`)).toHaveLength(0);
  });
});
