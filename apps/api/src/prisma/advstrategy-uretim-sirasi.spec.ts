import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

/**
 * ═══ ADVSTRATEGY MIGRATION'I ÜRETİM SIRASINDA ═══
 *
 * `pglite-harness` önce BÜTÜN migration'ları, sonra `prisma/sql/*`ı
 * uyguluyor; üretimde sıra tersi: kısıtlar, RLS ve partition'lar bir önceki
 * deploy'dan beri DURUYOR (CLAUDE.md, `roller-uce-indi.spec.ts`). Burada
 * üretim hâli elle kuruluyor:
 *
 *   önceki migration'lar → `prisma/sql/*` (önceki deploy'un db:rls'i)
 *   → ESKİ VERİ → bu migration → `prisma/sql/*` (bu deploy'un db:rls'i)
 *
 * `apply-sql.ts` dizindeki BÜTÜN .sql dosyalarını sırayla koşuyor; ikinci
 * koşu aynı zamanda 02_rls.sql'in yeniden koşulabilir (idempotent) olduğunu
 * sınıyor — deploy her seferinde onu baştan uyguluyor.
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU_MIGRATION = '20261008120000_advstrategy';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const KITLE = '77777777-0000-4000-8000-000000000001';

let pg: PGlite;

/*
 * ÖNCEKİ DEPLOY'UN 02_rls.sql'i bu tabloları BİLMİYORDU. Bugünkü dosya
 * onları adıyla anıyor ve migration'dan önce koşulamaz; o yüzden önceki
 * hâl bugünkünden TÜRETİLİYOR: AdvStrategy tablo adları RLS dizisinden,
 * AdvStrategy politika bölümü dosyadan çıkarılıyor. İki işaret de
 * bulunamazsa test patlıyor (tarama boşa düşmesin).
 */
function oncekiRls(): string {
  const bugun = readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8');
  const dizi = /\n\s*-- AdvStrategy aylık medya planı[^\n]*\n\s*'strateji_planlari'[^\n]*\n\s*'ozel_gunler'\n/;
  expect(bugun, 'RLS dizisindeki AdvStrategy satırları bulunamadı').toMatch(dizi);
  let s = bugun.replace(dizi, '\n').replace(/'adv_onay',\s*\n/, "'adv_onay'\n");
  const bolum = s.indexOf('-- ADVSTRATEGY — strateji_planlari');
  expect(bolum, 'AdvStrategy politika bölümü bulunamadı').toBeGreaterThan(0);
  const bolumBasi = s.lastIndexOf('-- ====', bolum);
  s = s.slice(0, bolumBasi);
  expect(s).not.toMatch(/strateji_|ozel_gunler/);
  return s;
}

async function sqlDosyalari(onceki = false): Promise<void> {
  const dosyalar = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(dosyalar).toContain('02_rls.sql');
  for (const f of dosyalar) {
    await pg.exec(onceki && f === '02_rls.sql' ? oncekiRls() : readFileSync(join(SQL_DIR, f), 'utf8'));
  }
}

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı — tarama boşa düştü').toContain(BU_MIGRATION);
  // Bu migration'dan SONRA gelen bir migration varsa onu da üretim sırasıyla koş.
  const oncekiler = tum.filter((d) => d < BU_MIGRATION);
  const sonrakiler = tum.filter((d) => d > BU_MIGRATION);
  expect(oncekiler.length).toBeGreaterThan(50);

  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(true);

  // ESKİ VERİ: yeni tabloların bağlandığı satırlar (clients, users,
  // audience_templates). Boş bir veritabanında FK'ler hiçbir şeyi sınamaz.
  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
      VALUES ('10000000-0000-0000-0000-000000000001', '${ORG}', 'a@x.com', 'x', 'A', now());
    INSERT INTO audience_templates (id, org_id, client_id, name, updated_at)
      VALUES ('${KITLE}', '${ORG}', '${WS}', 'Kitle', now());
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

describe('advstrategy migration üretim sırasında', () => {
  it('KRİTİK: beş tablo kuruldu, RLS AÇIK ve ZORLANIYOR', async () => {
    const r = await q<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(`
      SELECT relname, relrowsecurity, relforcerowsecurity FROM pg_class
       WHERE relname IN ('strateji_planlari','strateji_dagilimlari','strateji_matrisi','strateji_kelimeleri','ozel_gunler')
       ORDER BY relname`);
    expect(r).toHaveLength(5);
    for (const t of r) expect([t.relname, t.relrowsecurity, t.relforcerowsecurity]).toEqual([t.relname, true, true]);
  });

  it('KRİTİK: politikalar ikinci db:rls koşusundan sonra da tam (idempotent)', async () => {
    const r = await q<{ tablename: string; n: number }>(`
      SELECT tablename, count(*)::int AS n FROM pg_policies
       WHERE tablename LIKE 'strateji_%' OR tablename = 'ozel_gunler'
       GROUP BY tablename ORDER BY tablename`);
    expect(r).toEqual([
      { tablename: 'ozel_gunler', n: 1 },
      { tablename: 'strateji_dagilimlari', n: 4 },
      { tablename: 'strateji_kelimeleri', n: 4 },
      { tablename: 'strateji_matrisi', n: 4 },
      { tablename: 'strateji_planlari', n: 3 },
    ]);
  });

  it('KRİTİK: eski veriye bağlı yazım çalışıyor; kompozit FK ve açık plan indeksi zorluyor', async () => {
    const [p] = await q<{ id: string }>(`
      INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi)
      VALUES ('${ORG}', '${WS}', '2026-11', 1000000, 'TRY') RETURNING id::text`);
    await q(`
      INSERT INTO strateji_matrisi (plan_id, org_id, client_id, sira, platform, katman, niyet, kitle_sablonu_id, tutar_micros)
      VALUES ('${p!.id}', '${ORG}', '${WS}', 1, 'meta', 'soguk', 'FORM', '${KITLE}', 1)`);
    // org_id hedef müşterinin değilse kompozit anahtar reddediyor.
    await expect(
      q(`INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi)
         VALUES ('99999999-9999-4999-8999-999999999999', '${WS}', '2026-12', 1, 'TRY')`),
    ).rejects.toThrow(/foreign key/);
    await expect(
      q(`INSERT INTO strateji_planlari (org_id, client_id, donem, toplam_butce_micros, para_birimi)
         VALUES ('${ORG}', '${WS}', '2026-11', 1, 'TRY')`),
    ).rejects.toThrow(/strateji_planlari_acik_donem_key/);
  });
});
