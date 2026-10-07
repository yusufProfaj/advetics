import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ AJAN 4 — ÇOCUK TABLOLARIN RLS'İ, İŞLEM İŞLEM ═══
 *
 * `strateji-rls.spec.ts` matris ve kelimeler için yalnız `pg_policies`
 * listesine bakıyordu: politikanın VAR olması, DOĞRU yüklemi taşıdığını
 * göstermez (ör. `USING (true)` da listede görünür). Burada her işlem
 * gerçek politikayla, sahibi olmayan rolle (`SET ROLE`) koşuyor ve her
 * yazma `RETURNING` ile ETKİLENEN SATIRI sayıyor.
 */
const ROL = 'adv_strateji_ek_test';
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
      `INSERT INTO strateji_matrisi (plan_id, org_id, client_id, sira, platform, katman, niyet, tutar_micros)
       VALUES ($1, $2, $3, 1, 'google', 'soguk', 'SITE', 1)`,
      [p, IDS.org, c],
    );
    await h.q(
      `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, cekim_zamani, kaynak_istek)
       VALUES ($1, $2, $3, 'kahve', now(), '{}')`,
      [p, IDS.org, c],
    );
  }
  await h.q(`INSERT INTO ozel_gunler (sektor, ad, baslangic, bitis, kaynak) VALUES ('*', 'Yılbaşı', '2026-12-31', '2026-12-31', 'test')`);
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

for (const tablo of ['strateji_matrisi', 'strateji_kelimeleri'] as const) {
  describe(`${tablo} RLS`, () => {
    it('KRİTİK: SELECT yalnız erişilen workspace', async () => {
      const r = await kullaniciOlarak<{ plan_id: string }>(`SELECT plan_id::text FROM ${tablo}`);
      expect(r.map((x) => x.plan_id)).toEqual([benim]);
    });

    it('KRİTİK: UPDATE kendi satırında 1, başkasınınkinde 0 satır', async () => {
      const a = await kullaniciOlarak(`UPDATE ${tablo} SET created_at = now() WHERE plan_id = $1 RETURNING id`, [benim]);
      expect(a).toHaveLength(1);
      const b = await kullaniciOlarak(`UPDATE ${tablo} SET created_at = now() WHERE plan_id = $1 RETURNING id`, [otekinin]);
      expect(b).toHaveLength(0);
    });

    it('KRİTİK: DELETE kendi satırında 1, başkasınınkinde 0 satır (öteki satır duruyor)', async () => {
      const b = await kullaniciOlarak(`DELETE FROM ${tablo} WHERE plan_id = $1 RETURNING id`, [otekinin]);
      expect(b).toHaveLength(0);
      const a = await kullaniciOlarak(`DELETE FROM ${tablo} WHERE plan_id = $1 RETURNING id`, [benim]);
      expect(a).toHaveLength(1);
      const [n] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo} WHERE plan_id = $1`, [otekinin]);
      expect(n!.n).toBe(1);
    });

    it('KRİTİK: KOLON OKUMAYAN DELETE/UPDATE da yalnız kendi satırını etkiler (yalnız DELETE/UPDATE politikası sınanır)', async () => {
      /*
       * WHERE ve RETURNING olan bir DELETE satırı SELECT politikasından da
       * geçiriyor: DELETE politikası `USING (true)` olsa bile öteki satır
       * görünmediği için silinmiyor ve yukarıdaki test yeşil kalıyordu
       * (mutasyonla görüldü). Kolon okumayan deyimde tek kapı kendi
       * politikası; sonuç sahibi olarak sayılıyor.
       */
      await kullaniciOlarak(`UPDATE ${tablo} SET created_at = '2000-01-01'`);
      await kullaniciOlarak(`DELETE FROM ${tablo}`);
      const r = await h.q<{ plan_id: string; created_at: Date }>(`SELECT plan_id::text, created_at FROM ${tablo}`);
      expect(r).toHaveLength(1);
      expect(r[0]!.plan_id).toBe(otekinin);
      expect(new Date(r[0]!.created_at).getUTCFullYear()).toBeGreaterThan(2000);
    });

    it('KRİTİK: erişilmeyen workspace’e INSERT reddedilir', async () => {
      const deger =
        tablo === 'strateji_matrisi'
          ? `INSERT INTO strateji_matrisi (plan_id, org_id, client_id, sira, platform, katman, niyet, tutar_micros)
             VALUES ($1, $2, $3, 2, 'google', 'soguk', 'SITE', 1) RETURNING id`
          : `INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, cekim_zamani, kaynak_istek)
             VALUES ($1, $2, $3, 'çay', now(), '{}') RETURNING id`;
      await expect(kullaniciOlarak(deger, [otekinin, IDS.org, OTEKI])).rejects.toThrow(/row-level security/);
      const r = await kullaniciOlarak(deger, [benim, IDS.org, IDS.client]);
      expect(r).toHaveLength(1);
    });

    it('KRİTİK: satır başka workspace’e TAŞINAMAZ (WITH CHECK)', async () => {
      // WHERE/RETURNING yok: kolon okuyan UPDATE SELECT politikasından da
      // geçer ve WITH CHECK silinse bile reddederdi (strateji-rls.spec notu).
      await expect(kullaniciOlarak(`UPDATE ${tablo} SET client_id = '${OTEKI}'`)).rejects.toThrow(/row-level security/);
    });
  });
}

describe('strateji_planlari / dağılım — eksik kalan işlemler', () => {
  it('KRİTİK: dağılımda erişilmeyen workspace’e INSERT reddedilir', async () => {
    await expect(
      kullaniciOlarak(
        `INSERT INTO strateji_dagilimlari (plan_id, org_id, client_id, platform, katman, tutar_micros, kaynak)
         VALUES ($1, $2, $3, 'google', 'sicak', 1, 'elle') RETURNING id`,
        [otekinin, IDS.org, OTEKI],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('KRİTİK: kolon okumayan UPDATE/DELETE planda ve dağılımda yalnız kendi satırını etkiler', async () => {
    // strateji-rls.spec.ts bu iki tabloyu WHERE + RETURNING ile sınıyor;
    // o biçimde SELECT politikası da devrede ve UPDATE/DELETE politikası
    // `USING (true)` olsa bile test yeşil kalırdı.
    for (const [p, c] of [[benim, IDS.client], [otekinin, OTEKI]] as const) {
      await h.q(
        `INSERT INTO strateji_dagilimlari (plan_id, org_id, client_id, platform, katman, tutar_micros, kaynak)
         VALUES ($1, $2, $3, 'meta', 'soguk', 1, 'elle')`,
        [p, IDS.org, c],
      );
    }
    // SET ifadesi de kolon OKUMAMALI (`surum = surum + 1` okuyor ve SELECT
    // politikasını devreye sokuyordu; mutasyonla görüldü).
    await kullaniciOlarak(`UPDATE strateji_planlari SET notu = 'x'`);
    await kullaniciOlarak(`UPDATE strateji_dagilimlari SET tutar_micros = 7`);
    await kullaniciOlarak(`DELETE FROM strateji_dagilimlari`);
    const planlar = await h.q<{ id: string }>(`SELECT id::text FROM strateji_planlari WHERE notu = 'x'`);
    expect(planlar).toEqual([{ id: benim }]);
    const d = await h.q<{ plan_id: string; tutar_micros: string }>(`SELECT plan_id::text, tutar_micros::text FROM strateji_dagilimlari`);
    expect(d).toEqual([{ plan_id: otekinin, tutar_micros: '1' }]);
  });

  it('başka org bağlamındaki kullanıcı aynı client kimliğini taşısa bile planı görmez', async () => {
    await h.q(`
      SELECT set_config('app.current_org_id', '99999999-9999-4999-8999-999999999999', false),
             set_config('app.current_user_id', '${IDS.user}', false),
             set_config('app.current_client_ids', '${IDS.client}', false),
             set_config('app.is_org_admin', 'off', false),
             set_config('app.current_active_client_id', '', false)`);
    for (const t of TABLOLAR) await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      const r = await h.q('SELECT id FROM strateji_planlari');
      expect(r).toHaveLength(0);
    } finally {
      await h.q('RESET ROLE');
      for (const t of TABLOLAR) await h.q(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`);
    }
  });
});

describe('ozel_gunler — panel rolü hiçbir yazma yapamaz', () => {
  it('KRİTİK: DELETE ve UPDATE SIFIR satır, INSERT ret; satır duruyor', async () => {
    const d = await kullaniciOlarak(`DELETE FROM ozel_gunler RETURNING id`);
    expect(d).toHaveLength(0);
    const u = await kullaniciOlarak(`UPDATE ozel_gunler SET kaynak = 'uydurma' RETURNING id`);
    expect(u).toHaveLength(0);
    await expect(
      kullaniciOlarak(`INSERT INTO ozel_gunler (sektor, ad, baslangic, bitis, kaynak) VALUES ('*', 'x', '2026-01-01', '2026-01-01', 'y')`),
    ).rejects.toThrow(/row-level security/);
    const [s] = await h.q<{ kaynak: string; n: number }>(`SELECT min(kaynak) AS kaynak, count(*)::int AS n FROM ozel_gunler`);
    expect(s).toEqual({ kaynak: 'test', n: 1 });
  });

  it('bağlamı olmayan oturum ozel_gunler’i okuyamaz (has_context)', async () => {
    await h.q(`
      SELECT set_config('app.current_org_id', '', false),
             set_config('app.current_user_id', '', false),
             set_config('app.current_client_ids', '', false),
             set_config('app.is_org_admin', 'off', false)`);
    await h.q(`ALTER TABLE ozel_gunler ENABLE ROW LEVEL SECURITY`);
    await h.q(`SET ROLE ${ROL}`);
    try {
      expect(await h.q('SELECT id FROM ozel_gunler')).toHaveLength(0);
    } finally {
      await h.q('RESET ROLE');
      await h.q(`ALTER TABLE ozel_gunler DISABLE ROW LEVEL SECURITY`);
    }
  });
});
