import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { sonrakiTablolar, tablolarsizRls } from '../../test/sonraki-tablolar';

/**
 * ═══ ETKİ MIGRATION'LARI ÜRETİM SIRASINDA (Ajan 4 · kapı, Paket C) ═══
 *
 * `pglite-harness` önce bütün migration'ları sonra `prisma/sql/*`ı
 * uyguluyor; üretimde kısıtlar ve RLS bir önceki deploy'dan beri DURUYOR
 * (CLAUDE.md). Sıra elle kuruluyor:
 *
 *   önceki migration'lar → `prisma/sql/*` (önceki deploy, etkiyi bilmiyor)
 *   → ESKİ VERİ → 20261014100000_etki → 20261014100100_etki_is_turleri
 *   → sonrakiler → `prisma/sql/*` (bu deploy'un db:rls'i, ikinci koşu)
 *
 * İki migration AYRI: enum değeri tabloyla aynı dosyada olsaydı aynı
 * transaction'da kullanılamazdı. Burada değerin migration'dan SONRA
 * gerçekten kullanılabildiği bir INSERT ile sınanıyor.
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const TABLO = '20261014100000_etki';
const ENUM = '20261014100100_etki_is_turleri';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER = '10000000-0000-0000-0000-000000000001';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC = '44444444-4444-4444-4444-444444444444';

let pg: PGlite;

function oncekiRls(): string {
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  const sonraki = sonrakiTablolar(MIGRATIONS, tum.filter((d) => d >= TABLO));
  expect(sonraki, 'etki tablosu sonraki tablolarda bulunamadı').toContain('degisiklik_etkileri');
  const temiz = tablolarsizRls(readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8'), sonraki);
  expect(temiz.bulunamayan, 'sonraki tablolar RLS dizisinde bulunamadı').toEqual([]);
  expect(temiz.sql).not.toMatch(/ON degisiklik_etkileri\b|'degisiklik_etkileri'/);
  return temiz.sql;
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
  expect(tum, 'sınanan migration bulunamadı').toEqual(expect.arrayContaining([TABLO, ENUM]));
  const oncekiler = tum.filter((d) => d < TABLO);
  const sonrakiler = tum.filter((d) => d > ENUM);
  expect(oncekiler.length).toBeGreaterThan(50);

  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(true);

  // ESKİ VERİ: etki satırının bağlandığı workspace ve reklam hesabı.
  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
      VALUES ('${USER}', '${ORG}', 'a@x.com', 'x', 'A', now());
    INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
      VALUES ('${CONN}', '${ORG}', NULL, 'meta', 'active', 'u1', 'BM', '\\x00', '{}', '${USER}', now());
    INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
      VALUES ('${ACC}', '${ORG}', '${WS}', '${CONN}', 'meta', 'act_1', 'Hesap', 'TRY', 'Europe/Istanbul', now());
  `);

  // Prisma her migration'ı AYRI uyguluyor; aynı exec'te birleştirmek enum
  // kuralını sınamazdı.
  await pg.exec(readFileSync(join(MIGRATIONS, TABLO, 'migration.sql'), 'utf8'));
  await pg.exec(readFileSync(join(MIGRATIONS, ENUM, 'migration.sql'), 'utf8'));
  for (const d of sonrakiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari();
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

async function q<T>(sql: string): Promise<T[]> {
  return (await pg.query<T>(sql)).rows;
}

describe('etki migration’ları üretim sırasında', () => {
  it('KRİTİK: tablo kuruldu, RLS AÇIK ve ZORLANIYOR, yalnız bir SELECT politikası (ikinci db:rls koşusundan sonra da)', async () => {
    const [t] = await q<{ r: boolean; f: boolean }>(
      `SELECT relrowsecurity AS r, relforcerowsecurity AS f FROM pg_class WHERE relname = 'degisiklik_etkileri'`,
    );
    expect(t).toEqual({ r: true, f: true });
    const p = await q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'degisiklik_etkileri'`);
    expect(p).toEqual([{ cmd: 'SELECT' }]);
  });

  it('KRİTİK: enum değeri migration’dan sonra kullanılabiliyor (sync_jobs satırı)', async () => {
    const r = await q<{ id: string }>(`
      INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status)
      VALUES ('${WS}', '${ACC}', 'impact_evaluate', 'queued') RETURNING id::text`);
    expect(r).toHaveLength(1);
  });

  it('KRİTİK: eski veriye bağlı yazım çalışıyor; kompozit FK ve "açık satırın sonraki ölçümü" kısıtı zorluyor', async () => {
    const satir = (org: string, kaynakId: string, durum: string, sonraki: string) => `
      INSERT INTO degisiklik_etkileri (org_id, client_id, ad_account_id, platform, kaynak, kaynak_id, yol, tur, seviye,
        varlik_id, varlik_adi, kapsam_seviye, kapsam_id, kapsam_adi, degisiklik_zamani, degisiklik_gunu, durum, sonraki_olcum)
      VALUES ('${org}', '${WS}', '${ACC}', 'meta', 'kural', '${kaynakId}', 'kural', 'durdur', 'ad',
        '${ACC}', 'R', 'ad_group', '${ACC}', 'S', now(), '2026-10-01', '${durum}', ${sonraki})`;
    await q(satir(ORG, 'k1', 'bekliyor', `'2026-10-12'`));
    await expect(q(satir('99999999-9999-4999-8999-999999999999', 'k2', 'bekliyor', `'2026-10-12'`))).rejects.toThrow(/foreign key/);
    await expect(q(satir(ORG, 'k3', 'bekliyor', 'NULL'))).rejects.toThrow(/degisiklik_etkileri_sonraki_chk/);
    await expect(q(satir(ORG, 'k1', 'bekliyor', `'2026-10-12'`))).rejects.toThrow(/degisiklik_etkileri_kaynak_key/);
  });
});
