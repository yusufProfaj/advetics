import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';

/**
 * AdvStrategy tabloları — RLS GERÇEK politikalarla (`SET ROLE`, sahibi
 * olmayan rol). Her yazma iddiası `RETURNING` ile ETKİLENEN SATIRI sayıyor:
 * politikası tutmayan UPDATE/DELETE hata vermez, sıfır satır etkiler ve
 * "patlamadı" yeşil görünür (CLAUDE.md, hesap-tasima-rls.spec.ts).
 */
const ROL = 'adv_strateji_test';
const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const TABLOLAR = ['strateji_planlari', 'strateji_dagilimlari', 'strateji_matrisi', 'strateji_kelimeleri', 'ozel_gunler'];
let h: Harness;
let benim: string;
let otekinin: string;

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
  const plan = async (c: string) =>
    (await h.q<{ id: string }>(
      `INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi)
       VALUES ($1, $2, '2026-11', 1000000, 'TRY') RETURNING id::text`,
      [IDS.org, c],
    ))[0]!.id;
  benim = await plan(IDS.client);
  otekinin = await plan(OTEKI);
  for (const [p, c] of [[benim, IDS.client], [otekinin, OTEKI]] as const) {
    await h.q(
      `INSERT INTO strateji_dagilimlari (plan_id, org_id, client_id, platform, katman, tutar_micros, kaynak)
       VALUES ($1, $2, $3, 'meta', 'soguk', 1, 'elle')`,
      [p, IDS.org, c],
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

describe('strateji_planlari RLS', () => {
  it('KRİTİK: yalnız erişilen workspace’in planı görünür', async () => {
    const r = await kullaniciOlarak<{ id: string }>('SELECT id::text FROM strateji_planlari');
    expect(r.map((x) => x.id)).toEqual([benim]);
  });

  it('KRİTİK: kendi planı güncellenir (1 satır), başkasınınki SIFIR satır', async () => {
    const a = await kullaniciOlarak(`UPDATE strateji_planlari SET surum = surum + 1 WHERE id = $1 RETURNING id`, [benim]);
    expect(a).toHaveLength(1);
    const b = await kullaniciOlarak(`UPDATE strateji_planlari SET surum = surum + 1 WHERE id = $1 RETURNING id`, [otekinin]);
    expect(b).toHaveLength(0);
    const [s] = await h.q<{ surum: number }>('SELECT surum FROM strateji_planlari WHERE id = $1', [otekinin]);
    expect(s!.surum).toBe(1);
  });

  it('KRİTİK: plan başka workspace’e TAŞINAMAZ (WITH CHECK)', async () => {
    /*
     * WHERE ve RETURNING YOK, bilerek: kolon OKUYAN bir UPDATE (WHERE id =
     * ya da RETURNING) yeni satırı SELECT politikasından da geçiriyor ve
     * WITH CHECK silinse bile o kapı reddi üretiyordu (mutasyonla görüldü:
     * test yeşil kaldı). Kolon okumayan UPDATE'te tek kapı WITH CHECK.
     * Kullanıcı yalnız kendi planını gördüğü için WHERE'siz UPDATE yalnız onu
     * hedefliyor.
     */
    await expect(kullaniciOlarak(`UPDATE strateji_planlari SET client_id = '${OTEKI}'`)).rejects.toThrow(
      /row-level security/,
    );
  });

  it('erişilmeyen workspace’e plan YAZILAMAZ', async () => {
    await expect(
      kullaniciOlarak(
        `INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi)
         VALUES ($1, $2, '2026-12', 1, 'TRY') RETURNING id`,
        [IDS.org, OTEKI],
      ),
    ).rejects.toThrow(/row-level security/);
    const r = await kullaniciOlarak(
      `INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi)
       VALUES ($1, $2, '2026-12', 1, 'TRY') RETURNING id`,
      [IDS.org, IDS.client],
    );
    expect(r).toHaveLength(1);
  });

  it('plan SİLİNEMEZ — DELETE politikası yok, iptal edilir (kendi planında bile 0 satır)', async () => {
    const r = await kullaniciOlarak(`DELETE FROM strateji_planlari WHERE id = $1 RETURNING id`, [benim]);
    expect(r).toHaveLength(0);
  });
});

describe('çocuk tablolar RLS', () => {
  it('KRİTİK: dağılım DELETE + INSERT kendi planında çalışır (DELETE politikası VAR), başkasında 0 satır', async () => {
    const a = await kullaniciOlarak(`DELETE FROM strateji_dagilimlari WHERE plan_id = $1 RETURNING id`, [benim]);
    expect(a).toHaveLength(1);
    const b = await kullaniciOlarak(`DELETE FROM strateji_dagilimlari WHERE plan_id = $1 RETURNING id`, [otekinin]);
    expect(b).toHaveLength(0);
  });

  it('matris ve kelimelerin de dört işlem politikası var', async () => {
    for (const t of ['strateji_dagilimlari', 'strateji_matrisi', 'strateji_kelimeleri']) {
      const r = await h.q<{ cmd: string }>(`SELECT DISTINCT cmd FROM pg_policies WHERE tablename = $1 ORDER BY 1`, [t]);
      expect(r.map((x) => x.cmd), t).toEqual(['DELETE', 'INSERT', 'SELECT', 'UPDATE']);
    }
    const p = await h.q<{ cmd: string }>(`SELECT DISTINCT cmd FROM pg_policies WHERE tablename = 'strateji_planlari' ORDER BY 1`);
    expect(p.map((x) => x.cmd)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });
});

describe('ozel_gunler RLS', () => {
  it('KRİTİK: oturumu olan herkes OKUR, panel rolü YAZAMAZ', async () => {
    await h.q(`INSERT INTO ozel_gunler (sektor, ad, baslangic, bitis, kaynak) VALUES ('*', 'Yılbaşı', '2026-12-31', '2026-12-31', 'test')`);
    const r = await kullaniciOlarak('SELECT ad FROM ozel_gunler');
    expect(r).toEqual([{ ad: 'Yılbaşı' }]);
    await expect(
      kullaniciOlarak(`INSERT INTO ozel_gunler (sektor, ad, baslangic, bitis, kaynak) VALUES ('*', 'x', '2026-01-01', '2026-01-01', 'y')`),
    ).rejects.toThrow(/row-level security/);
    const u = await kullaniciOlarak(`UPDATE ozel_gunler SET ad = 'z' RETURNING id`);
    expect(u).toHaveLength(0);
  });
});
