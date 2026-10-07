import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

/**
 * ═══ ADVSTRATEGY AKTARIM MIGRATION'I ÜRETİM SIRASINDA ═══
 *
 * `advstrategy-uretim-sirasi.spec.ts` deseni (Ajan 4), bu migration için.
 * Bu sefer VAR OLAN ve üretimde DOLU tablolara kolon ekleniyor (`adv_oturum`,
 * `strateji_kelimeleri`); `pglite-harness` boş şemaya her şeyi baştan kurduğu
 * için eski satırların yeni kolonlarla ne olduğunu GÖREMEZ. Üretim hâli elle:
 *
 *   önceki migration'lar → `prisma/sql/*` (önceki deploy'un db:rls'i)
 *   → ESKİ VERİ (oturum, plan, matris, grubu dolu ve boş kelimeler)
 *   → bu migration → `prisma/sql/*` (bu deploy'un db:rls'i)
 *
 * Önceki deploy'un 02_rls.sql'i bugünküyle aynı: bu migration RLS'e yeni
 * tablo eklemiyor (kolonlar mevcut politikaların altında).
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU_MIGRATION = '20261008140000_advstrategy_aktarim';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER = '10000000-0000-0000-0000-000000000001';
const PLAN = '20000000-0000-4000-8000-000000000001';
const MATRIS = '30000000-0000-4000-8000-000000000001';
const ESKI_OTURUM = '40000000-0000-4000-8000-000000000001';

let pg: PGlite;

async function sqlDosyalari(): Promise<void> {
  const dosyalar = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(dosyalar).toContain('02_rls.sql');
  for (const f of dosyalar) await pg.exec(readFileSync(join(SQL_DIR, f), 'utf8'));
}

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı — tarama boşa düştü').toContain(BU_MIGRATION);
  const oncekiler = tum.filter((d) => d < BU_MIGRATION);
  const sonrakiler = tum.filter((d) => d > BU_MIGRATION);
  expect(oncekiler).toContain('20261008120000_advstrategy');

  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari();

  // ESKİ VERİ — migration'dan önce üretimde duran satırlar.
  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
      VALUES ('${USER}', '${ORG}', 'a@x.com', 'x', 'A', now());
    INSERT INTO adv_oturum (id, org_id, client_id, user_id, baslik, model)
      VALUES ('${ESKI_OTURUM}', '${ORG}', '${WS}', '${USER}', 'Eski oturum', 'm');
    INSERT INTO strateji_planlari (id, org_id, client_id, donem, toplam_butce_micros, para_birimi)
      VALUES ('${PLAN}', '${ORG}', '${WS}', '2026-11', 1000000, 'TRY');
    INSERT INTO strateji_matrisi (id, plan_id, org_id, client_id, sira, platform, katman, niyet, tutar_micros)
      VALUES ('${MATRIS}', '${PLAN}', '${ORG}', '${WS}', 1, 'meta', 'soguk', 'FORM', 1);
    INSERT INTO strateji_kelimeleri (plan_id, org_id, client_id, kelime, grup, cekim_zamani, kaynak_istek)
      VALUES ('${PLAN}', '${ORG}', '${WS}', 'elle gruplu', 'Kahve', now(), '{}'),
             ('${PLAN}', '${ORG}', '${WS}', 'grupsuz', NULL, now(), '{}');
  `);

  await pg.exec(readFileSync(join(MIGRATIONS, BU_MIGRATION, 'migration.sql'), 'utf8'));
  for (const d of sonrakiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari();
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

async function q<T>(sql: string): Promise<T[]> {
  return (await pg.query<T>(sql)).rows;
}

describe('advstrategy aktarım migration’ı üretim sırasında', () => {
  it('KRİTİK: eski oturum geçerli kalır — hazır alanlar boş, matris bağı yok', async () => {
    const [o] = await q<{ hazir_istem: string | null; hazir_medyalar: string[]; strateji_matris_id: string | null }>(
      `SELECT hazir_istem, hazir_medyalar::text[] AS hazir_medyalar, strateji_matris_id FROM adv_oturum WHERE id = '${ESKI_OTURUM}'`,
    );
    expect(o).toEqual({ hazir_istem: null, hazir_medyalar: [], strateji_matris_id: null });
  });

  it('KRİTİK: ilk turda grubu DOLU olan kelime elle sayılır (o tur grup üretmiyordu); boş olan otomatik', async () => {
    const r = await q<{ kelime: string; grup_elle: boolean }>(`SELECT kelime, grup_elle FROM strateji_kelimeleri ORDER BY kelime`);
    expect(r).toEqual([
      { kelime: 'elle gruplu', grup_elle: true },
      { kelime: 'grupsuz', grup_elle: false },
    ]);
  });

  it('KRİTİK: bir matris satırına İKİNCİ oturum yazılamaz; bağsız oturumlar sınırsız', async () => {
    const ekle = (matris: string | null) =>
      q(`INSERT INTO adv_oturum (org_id, client_id, user_id, baslik, model, strateji_matris_id)
         VALUES ('${ORG}', '${WS}', '${USER}', 'x', 'm', ${matris ? `'${matris}'` : 'NULL'})`);
    await ekle(MATRIS);
    await expect(ekle(MATRIS)).rejects.toThrow(/adv_oturum_strateji_matris_key/);
    await ekle(null);
    await ekle(null);
  });

  it('KRİTİK: matris satırı silinince oturum KALIR, bağı düşer (SET NULL)', async () => {
    await q(`DELETE FROM strateji_matrisi WHERE id = '${MATRIS}'`);
    const r = await q<{ n: number }>(`SELECT count(*)::int AS n FROM adv_oturum WHERE baslik = 'x'`);
    expect(r[0]!.n).toBe(3);
    const b = await q<{ n: number }>(`SELECT count(*)::int AS n FROM adv_oturum WHERE strateji_matris_id IS NOT NULL`);
    expect(b[0]!.n).toBe(0);
  });

  it('KRİTİK: adv_oturum RLS’i ikinci db:rls koşusundan sonra da AÇIK ve politikaları tam', async () => {
    const [c] = await q<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'adv_oturum'`,
    );
    expect(c).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const p = await q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'adv_oturum' ORDER BY cmd`);
    expect(p.map((x) => x.cmd)).toEqual(['INSERT', 'SELECT', 'UPDATE']);
  });
});
