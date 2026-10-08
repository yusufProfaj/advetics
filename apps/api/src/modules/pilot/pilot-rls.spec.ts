import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';

/**
 * ═══ PİLOT TABLOLARI — RLS GERÇEK POLİTİKALARLA ═══
 *
 * `SET ROLE` ile sahibi olmayan role geçiliyor ve her yazma iddiası
 * `RETURNING` ile ETKİLENEN SATIRI sayıyor: politikası olmayan UPDATE hata
 * vermez, sıfır satır etkiler ve "patlamadı" yeşil görünür (CLAUDE.md,
 * hesap-tasima-rls.spec.ts). Kurulum/nesne/tarama tablolarında yazma
 * politikası BİLEREK yok: panelden bir kurulum satırını "açıldı" yapmak,
 * Meta'da açılmamış kampanyayı açılmış göstermek olurdu.
 */
const ROL = 'adv_pilot_test';
const OTEKI = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BASKA_KULLANICI = '66666666-6666-4666-8666-666666666666';
const TABLOLAR = [
  'pilot_planlari',
  'pilot_plan_surumleri',
  'pilot_uyum_denetimleri',
  'pilot_uyum_isaretleri',
  'pilot_kurulum_satirlari',
  'pilot_nesneleri',
  'pilot_taramalari',
  'pilot_onerileri',
];
const OZET = 'd'.repeat(64);
let h: Harness;
const id: Record<string, { plan: string; satir: string; oneri: string }> = {};

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
  await h.q(`INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ($1, $2, 'b@x.com', 'x', 'B', now())`, [BASKA_KULLANICI, IDS.org]);
  for (const c of [IDS.client, OTEKI]) {
    const [p] = await h.q<{ id: string }>(
      `INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti) VALUES ($1, $2, '2026-11', $3) RETURNING id::text`,
      [IDS.org, c, OZET],
    );
    const [s] = await h.q<{ id: string }>(
      `INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad)
       VALUES ($1, $2, $3, 1, 'meta:soguk:x', 'meta', 'A') RETURNING id::text`,
      [p!.id, IDS.org, c],
    );
    const [t] = await h.q<{ id: string }>(`INSERT INTO pilot_taramalari (org_id, client_id) VALUES ($1, $2) RETURNING id::text`, [IDS.org, c]);
    const [o] = await h.q<{ id: string }>(
      `INSERT INTO pilot_onerileri (tarama_id, org_id, client_id, tur, hedef_seviye, hedef_nesne_id, hedef, neden, olculer, beklenen_etki, eylem, geri_alma, gecerlilik_sonu)
       VALUES ($1, $2, $3, 'harcayip_donusmeyen', 'reklam', gen_random_uuid(), '{}', 'n', '[]', '{}', '{}', '{}', now() + interval '1 day') RETURNING id::text`,
      [t!.id, IDS.org, c],
    );
    id[c] = { plan: p!.id, satir: s!.id, oneri: o!.id };
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

describe('pilot_planlari RLS', () => {
  it('KRİTİK: yalnız erişilen workspace’in planı görünür ve güncellenir; başkasınınki SIFIR satır', async () => {
    const g = await kullaniciOlarak<{ id: string }>('SELECT id::text FROM pilot_planlari');
    expect(g.map((x) => x.id)).toEqual([id[IDS.client]!.plan]);
    expect(await kullaniciOlarak(`UPDATE pilot_planlari SET surum = surum + 1 WHERE id = $1 RETURNING id`, [id[IDS.client]!.plan])).toHaveLength(1);
    expect(await kullaniciOlarak(`UPDATE pilot_planlari SET surum = surum + 1 WHERE id = $1 RETURNING id`, [id[OTEKI]!.plan])).toHaveLength(0);
  });

  it('KRİTİK: plan başka workspace’e TAŞINAMAZ (WITH CHECK) ve başka workspace’e YAZILAMAZ', async () => {
    // WHERE/RETURNING yok: kolon okuyan UPDATE SELECT politikasından da geçer
    // ve WITH CHECK silinse bile reddederdi (strateji-rls dersi).
    await expect(kullaniciOlarak(`UPDATE pilot_planlari SET client_id = '${OTEKI}'`)).rejects.toThrow(/row-level security/);
    await expect(
      kullaniciOlarak(`INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti) VALUES ($1, $2, '2026-12', $3) RETURNING id`, [IDS.org, OTEKI, OZET]),
    ).rejects.toThrow(/row-level security/);
  });

  it('plan SİLİNEMEZ (kendi planında bile 0 satır)', async () => {
    expect(await kullaniciOlarak(`DELETE FROM pilot_planlari WHERE id = $1 RETURNING id`, [id[IDS.client]!.plan])).toHaveLength(0);
  });
});

describe('değişmez ve worker tabloları', () => {
  it('KRİTİK: sürüm eklenir ama GÜNCELLENEMEZ (UPDATE politikası yok: 0 satır)', async () => {
    const p = id[IDS.client]!.plan;
    expect(
      await kullaniciOlarak(
        `INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak) VALUES ($1, $2, $3, 1, '{}', $4, 'uretici') RETURNING id`,
        [p, IDS.org, IDS.client, OZET],
      ),
    ).toHaveLength(1);
    expect(await kullaniciOlarak(`UPDATE pilot_plan_surumleri SET org_id = org_id WHERE plan_id = $1 RETURNING id`, [p])).toHaveLength(0);
  });

  it('KRİTİK: kurulum satırı panelden OKUNUR ama YAZILAMAZ (insert reddi, update 0 satır)', async () => {
    const g = await kullaniciOlarak<{ id: string }>('SELECT id::text FROM pilot_kurulum_satirlari');
    expect(g.map((x) => x.id)).toEqual([id[IDS.client]!.satir]);
    // Tek UPDATE politikası "Kurulumu durdur"un (ara → dustu/prova_dustu,
    // 2026-10-08): panelden bir satırı BAŞARILI bir duruma çekmek RLS reddi.
    await expect(kullaniciOlarak(`UPDATE pilot_kurulum_satirlari SET durum = 'acildi' WHERE id = $1 RETURNING id`, [id[IDS.client]!.satir])).rejects.toThrow(/row-level security/);
    await expect(
      kullaniciOlarak(
        `INSERT INTO pilot_kurulum_satirlari (plan_id, org_id, client_id, onaylanan_surum, satir_anahtari, platform, ad) VALUES ($1, $2, $3, 1, 'meta:sicak:y', 'meta', 'B') RETURNING id`,
        [id[IDS.client]!.plan, IDS.org, IDS.client],
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('nesne ve tarama tablolarında yalnız SELECT', async () => {
    const t = await kullaniciOlarak<{ client_id: string }>('SELECT client_id::text FROM pilot_taramalari');
    expect(t.map((x) => x.client_id)).toEqual([IDS.client]);
    expect(await kullaniciOlarak(`UPDATE pilot_taramalari SET kart_sayisi = 9 RETURNING id`)).toHaveLength(0);
  });
});

describe('işaret ve öneri', () => {
  it('KRİTİK: UYARI işareti yalnız oturumdaki kullanıcı adına; aynı kurala yeniden işaret UPDATE ile (1 satır)', async () => {
    const p = id[IDS.client]!.plan;
    const ekle = (kullanici: string, mesaj: string) =>
      kullaniciOlarak(
        `INSERT INTO pilot_uyum_isaretleri (plan_id, org_id, client_id, surum, kural_kimligi, mesaj, user_id)
         VALUES ($1, $2, $3, 1, 'GNL-08', $4, $5)
         ON CONFLICT (plan_id, surum, kural_kimligi) DO UPDATE SET mesaj = EXCLUDED.mesaj, user_id = EXCLUDED.user_id, zaman = now()
         RETURNING id`,
        [p, IDS.org, IDS.client, mesaj, kullanici],
      );
    await expect(ekle(BASKA_KULLANICI, 'm1')).rejects.toThrow(/row-level security/);
    expect(await ekle(IDS.user, 'm1')).toHaveLength(1);
    expect(await ekle(IDS.user, 'm2')).toHaveLength(1);
    const [r] = await h.q<{ mesaj: string }>('SELECT mesaj FROM pilot_uyum_isaretleri WHERE plan_id = $1', [p]);
    expect(r!.mesaj).toBe('m2');
  });

  it('KRİTİK: öneri "geç" kendi workspace’inde 1 satır, başkasında 0', async () => {
    expect(await kullaniciOlarak(`UPDATE pilot_onerileri SET durum = 'gecildi' WHERE id = $1 RETURNING id`, [id[IDS.client]!.oneri])).toHaveLength(1);
    expect(await kullaniciOlarak(`UPDATE pilot_onerileri SET durum = 'gecildi' WHERE id = $1 RETURNING id`, [id[OTEKI]!.oneri])).toHaveLength(0);
  });
});
