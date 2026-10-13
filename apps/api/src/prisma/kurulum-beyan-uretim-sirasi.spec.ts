import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { KURULUM_BEYAN_OGELERI } from '@advetics/shared';
import { sonrakiTablolar, tablolarsizRls } from '../../test/sonraki-tablolar';

/**
 * ═══ KURULUM BEYANLARI MIGRATION'I ÜRETİM SIRASINDA (roller-uce-indi deseni) ═══
 *
 * `20261017200000_kurulum_beyanlari` yalnız yeni bir tablo açıyor; ama
 * kısıtlarını ve indekslerini 01_constraints.sql'de DEĞİL migration'da
 * kuruyor (MIMARI § 9'dan sapma) ve RLS'i 02_rls.sql'de. `pglite-harness`
 * bunu sınayamaz: şemayı bütün migration'lardan kurup prisma/sql'i EN SON
 * uyguluyor. Üretimde sıra:
 *
 *   önceki migration'lar → prisma/sql (önceki deploy, tabloyu bilmiyor)
 *   → ESKİ VERİ (şirket, iki workspace, kullanıcı, kurulum satırı)
 *   → bu migration → prisma/sql (bu deploy'un db:rls'i)
 *
 * Bugünkü 01_constraints.sql'in önceki şemada HATASIZ koştuğu da burada
 * görülüyor: dosya bu tabloyu adıyla ansaydı ilk sqlDosyalari düşerdi.
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU = '20261017200000_kurulum_beyanlari';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const WS2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER = '10000000-0000-0000-0000-000000000001';

let pg: PGlite;
const q = async <T>(sql: string) => (await pg.query<T>(sql)).rows;

function oncekiRls(): string {
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  const sonraki = sonrakiTablolar(MIGRATIONS, tum.filter((d) => d >= BU));
  expect(sonraki, 'beyan tablosu sonraki tablolarda bulunamadı').toContain('kurulum_beyanlari');
  const temiz = tablolarsizRls(readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8'), sonraki);
  expect(temiz.bulunamayan, 'sonraki tablolar RLS dizisinde bulunamadı').toEqual([]);
  expect(temiz.sql).not.toMatch(/ON kurulum_beyanlari\b|'kurulum_beyanlari'/);
  return temiz.sql;
}

async function sqlDosyalari(onceki = false): Promise<void> {
  const dosyalar = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(dosyalar).toContain('01_constraints.sql');
  expect(dosyalar).toContain('02_rls.sql');
  for (const f of dosyalar) {
    await pg.exec(onceki && f === '02_rls.sql' ? oncekiRls() : readFileSync(join(SQL_DIR, f), 'utf8'));
  }
}

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı').toContain(BU);
  const oncekiler = tum.filter((d) => d < BU);
  const sonrakiler = tum.filter((d) => d > BU);
  expect(oncekiler).toContain('20261016400000_kurulum_kullanilmayan_platformlar');

  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(true);

  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS2}', '${ORG}', 'WS2', 'ws2', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
      VALUES ('${USER}', '${ORG}', 'a@x.com', 'x', 'A', now());
    INSERT INTO workspace_kurulum (client_id, org_id, kullanilmayan_platformlar) VALUES ('${WS}', '${ORG}', ARRAY['google']);
  `);

  await pg.exec(readFileSync(join(MIGRATIONS, BU, 'migration.sql'), 'utf8'));
  for (const d of sonrakiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari();
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe('kurulum beyanları migration\'ı üretim sırasında', () => {
  it('KRİTİK: tablo boş açıldı, eski kurulum satırı yerinde (eklemeli migration)', async () => {
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM kurulum_beyanlari`)).toEqual([{ n: 0 }]);
    expect(await q<{ k: string[] }>(`SELECT kullanilmayan_platformlar AS k FROM workspace_kurulum`)).toEqual([{ k: ['google'] }]);
  });

  it('KRİTİK: CHECK listesi shared listesiyle aynı ve TEK tanım; kısmi tekil indeksler çalışıyor', async () => {
    const [r] = await q<{ d: string }>(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'kurulum_beyanlari_oge_chk'`);
    expect([...r!.d.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort()).toEqual([...KURULUM_BEYAN_OGELERI].sort());
    expect(
      await q<{ conname: string; n: number }>(`
        SELECT conname, count(*)::int AS n FROM pg_constraint
         WHERE conrelid = 'kurulum_beyanlari'::regclass AND contype IN ('c', 'f', 'p', 'u')
         GROUP BY conname ORDER BY conname`),
    ).toEqual([
      { conname: 'kurulum_beyanlari_beyan_eden_fkey', n: 1 },
      { conname: 'kurulum_beyanlari_client_org_fkey', n: 1 },
      { conname: 'kurulum_beyanlari_duzey_chk', n: 1 },
      { conname: 'kurulum_beyanlari_oge_chk', n: 1 },
      { conname: 'kurulum_beyanlari_org_id_fkey', n: 1 },
      { conname: 'kurulum_beyanlari_pkey', n: 1 },
    ]);
    await pg.exec(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge, beyan_eden) VALUES ('${ORG}', '${WS}', 'site_yok', '${USER}'), ('${ORG}', NULL, 'iki_adim', '${USER}')`);
    await expect(pg.exec(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', NULL, 'iki_adim')`)).rejects.toThrow(/kurulum_beyanlari_sirket_uniq/);
    await expect(pg.exec(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', '${WS}', 'site_yok')`)).rejects.toThrow(/kurulum_beyanlari_workspace_uniq/);
    await pg.exec(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ('${ORG}', '${WS2}', 'site_yok')`);
  });

  it('KRİTİK: bu deploy\'un db:rls\'i dört politika kurdu ve RLS ZORLANIYOR', async () => {
    expect(await q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'kurulum_beyanlari' ORDER BY cmd`)).toEqual([
      { cmd: 'DELETE' },
      { cmd: 'INSERT' },
      { cmd: 'SELECT' },
      { cmd: 'UPDATE' },
    ]);
    expect(await q<{ r: boolean; f: boolean }>(`SELECT relrowsecurity AS r, relforcerowsecurity AS f FROM pg_class WHERE relname = 'kurulum_beyanlari'`)).toEqual([
      { r: true, f: true },
    ]);
  });

  it('prisma/sql ikinci kez koşunca da temiz (deploy\'un db:rls\'i her seferinde koşuyor)', async () => {
    await sqlDosyalari();
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'kurulum_beyanlari'`)).toEqual([{ n: 4 }]);
  });
});
