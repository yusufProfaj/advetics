import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { bolumdenOnce, PILOT_RLS_BASLIGI } from '../../test/rls-onceki';

/**
 * ═══ PİLOT MIGRATION'I ÜRETİM SIRASINDA ═══
 *
 * `advstrategy-uretim-sirasi.spec.ts` deseni. `pglite-harness` kısıtları
 * EN SON uyguluyor; üretimde kısıtlar, RLS ve partition'lar önceki
 * deploy'dan beri duruyor ve migration DOLU tablolara (clients) kolon
 * ekliyor. Üretim hâli elle:
 *
 *   önceki migration'lar → prisma/sql/* (Pilot bölümü OLMADAN)
 *   → ESKİ VERİ (özel kategorili ve kategorisiz workspace, aylık bütçe)
 *   → bu migration → prisma/sql/* (bugünkü, ikinci kez: idempotent mi)
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU_MIGRATION = '20261009100000_pilot';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const WS_KONUT = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const BUTCE = '20000000-0000-4000-8000-000000000001';
const OZET = 'a'.repeat(64);
const TABLOLAR = [
  'pilot_kurulum_satirlari',
  'pilot_nesneleri',
  'pilot_onerileri',
  'pilot_plan_surumleri',
  'pilot_planlari',
  'pilot_taramalari',
  'pilot_uyum_denetimleri',
  'pilot_uyum_isaretleri',
];

let pg: PGlite;

async function sqlDosyalari(onceki: boolean): Promise<void> {
  const dosyalar = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(dosyalar).toContain('02_rls.sql');
  for (const f of dosyalar) {
    const sql = readFileSync(join(SQL_DIR, f), 'utf8');
    await pg.exec(onceki && f === '02_rls.sql' ? bolumdenOnce(sql, PILOT_RLS_BASLIGI) : sql);
  }
}

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı — tarama boşa düştü').toContain(BU_MIGRATION);
  const oncekiler = tum.filter((d) => d < BU_MIGRATION);
  const sonrakiler = tum.filter((d) => d > BU_MIGRATION);
  expect(oncekiler).toContain('20261008140000_advstrategy_aktarim');
  // Gerçek yayın anahtarı migration'ı da bu dosyanın sonrakilerinde koşuyor.
  expect(sonrakiler).toContain('20261009110000_pilot_gercek_yayin');

  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(true);

  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO clients (id, org_id, name, slug, special_ad_categories, updated_at)
      VALUES ('${WS_KONUT}', '${ORG}', 'Konut', 'konut', ARRAY['HOUSING'], now());
    INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at)
      VALUES ('${BUTCE}', '${ORG}', '${WS}', '2026-11-01', 1000000, 'TRY', now());
    INSERT INTO ajans_ayari (org_id, atif_standardi, atif_secim_at) VALUES ('${ORG}', 'tik7', now());
  `);

  await pg.exec(readFileSync(join(MIGRATIONS, BU_MIGRATION, 'migration.sql'), 'utf8'));
  for (const d of sonrakiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(false);
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

async function q<T>(sql: string): Promise<T[]> {
  return (await pg.query<T>(sql)).rows;
}

describe('pilot migration üretim sırasında', () => {
  it('KRİTİK: sekiz tablo kuruldu, RLS AÇIK ve ZORLANIYOR', async () => {
    const r = await q<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname LIKE 'pilot\\_%' AND relkind = 'r' ORDER BY relname`);
    expect(r.map((x) => x.relname)).toEqual(TABLOLAR);
    for (const t of r) expect([t.relname, t.relrowsecurity, t.relforcerowsecurity]).toEqual([t.relname, true, true]);
  });

  it('KRİTİK: politikalar ikinci db:rls koşusundan sonra tam; hiçbirinde DELETE yok', async () => {
    const r = await q<{ tablename: string; komutlar: string }>(`
      SELECT tablename, string_agg(cmd, ',' ORDER BY cmd) AS komutlar FROM pg_policies
       WHERE tablename LIKE 'pilot\\_%' GROUP BY tablename ORDER BY tablename`);
    expect(r).toEqual([
      { tablename: 'pilot_kurulum_satirlari', komutlar: 'SELECT' },
      { tablename: 'pilot_nesneleri', komutlar: 'SELECT' },
      { tablename: 'pilot_onerileri', komutlar: 'SELECT,UPDATE' },
      { tablename: 'pilot_plan_surumleri', komutlar: 'INSERT,SELECT' },
      { tablename: 'pilot_planlari', komutlar: 'INSERT,SELECT,UPDATE' },
      { tablename: 'pilot_taramalari', komutlar: 'SELECT' },
      { tablename: 'pilot_uyum_denetimleri', komutlar: 'INSERT,SELECT' },
      { tablename: 'pilot_uyum_isaretleri', komutlar: 'INSERT,SELECT,UPDATE' },
    ]);
  });

  it('KRİTİK: eski workspace satırlarında beyan zamanı BOŞ, kategori verisine dokunulmadı', async () => {
    const r = await q<{ id: string; beyan: string | null; kat: string[] }>(`
      SELECT id::text, ozel_kategori_beyan_zamani AS beyan, special_ad_categories AS kat FROM clients ORDER BY id`);
    expect(r).toHaveLength(2);
    for (const c of r) expect(c.beyan).toBeNull();
    expect(r.find((c) => c.id === WS_KONUT)!.kat).toEqual(['HOUSING']);
  });

  it('KRİTİK: eski veriye bağlı yazım çalışıyor; kompozit FK, açık plan indeksi ve bütçe bağı zorluyor', async () => {
    const [p] = await q<{ id: string }>(`
      INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti, aylik_butce_id)
      VALUES ('${ORG}', '${WS}', '2026-11', '${OZET}', '${BUTCE}') RETURNING id::text`);
    await q(`
      INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak)
      VALUES ('${p!.id}', '${ORG}', '${WS}', 1, '{}', '${OZET}', 'uretici')`);
    await expect(
      q(`INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti)
         VALUES ('99999999-9999-4999-8999-999999999999', '${WS}', '2026-12', '${OZET}')`),
    ).rejects.toThrow(/foreign key/);
    await expect(
      q(`INSERT INTO pilot_planlari (org_id, client_id, donem, icerik_ozeti) VALUES ('${ORG}', '${WS}', '2026-11', '${OZET}')`),
    ).rejects.toThrow(/pilot_planlari_acik_donem_key/);
    // Çocuk satır plandan FARKLI workspace'le yazılamaz (kompozit plan anahtarı).
    await expect(
      q(`INSERT INTO pilot_plan_surumleri (plan_id, org_id, client_id, surum, icerik, icerik_ozeti, kaynak)
         VALUES ('${p!.id}', '${ORG}', '${WS_KONUT}', 2, '{}', '${OZET}', 'uretici')`),
    ).rejects.toThrow(/foreign key/);
    // Bütçe silinince plan DÜŞMEZ, bağ boşalır.
    await q(`DELETE FROM monthly_budgets WHERE id = '${BUTCE}'`);
    const [b] = await q<{ aylik_butce_id: string | null }>(`SELECT aylik_butce_id FROM pilot_planlari WHERE id = '${p!.id}'`);
    expect(b!.aylik_butce_id).toBeNull();
  });

  it('KRİTİK: var olan ajans ayarı satırında gerçek yayın anahtarı KAPALI doğar; izsiz açılamaz', async () => {
    const [a] = await q<{ acik: boolean; atif: string }>(`SELECT pilot_gercek_yayin AS acik, atif_standardi AS atif FROM ajans_ayari WHERE org_id = '${ORG}'`);
    expect(a).toEqual({ acik: false, atif: 'tik7' });
    await expect(q(`UPDATE ajans_ayari SET pilot_gercek_yayin = true WHERE org_id = '${ORG}'`)).rejects.toThrow(/ajans_ayari_pilot_gercek_chk/);
  });
});
