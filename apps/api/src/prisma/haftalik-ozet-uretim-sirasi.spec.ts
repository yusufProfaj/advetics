import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { BILDIRIM_OLAYLARI, RAPOR_PLANI_TURLERI } from '@advetics/shared';
import { sonrakiTablolar, tablolarsizRls } from '../../test/sonraki-tablolar';

/**
 * ═══ HAFTALIK ÖZET MIGRATION'I ÜRETİM SIRASINDA (Ajan 4 · kapı, Paket B) ═══
 *
 * `20261014500000_haftalik_ozet` VAR OLAN iki tabloya dokunuyor:
 *  - `report_schedules`e `tur` (DEFAULT 'rapor') + CHECK + kısmi tekil indeks;
 *  - `bildirim_gonderimleri.olay` VARCHAR(10) → (20) ve iki CHECK'in
 *    düşürülüp genişletilerek yeniden kurulması.
 *
 * `pglite-harness` bunu sınayamaz: migration koşarken tablolar BOŞ ve
 * kısıtlar/RLS henüz yok. Üretimde ise rapor planları ve Paket A'nın
 * gönderim satırları DOLU, `01_constraints` ve `02_rls` bir önceki
 * deploy'dan beri duruyor (CLAUDE.md "pglite-harness VAR OLAN BİR KISITLA
 * ÇAKIŞAN MIGRATION'I YAKALAYAMAZ"). Sıra elle kuruluyor:
 *
 *   önceki migration'lar → `prisma/sql/*` (önceki deploy, özeti bilmiyor)
 *   → ESKİ VERİ (aynı workspace'te İKİ rapor planı, üç olay türünden
 *     gönderim, eski olay listeli kanal) → bu migration → `prisma/sql/*`
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU = '20261014500000_haftalik_ozet';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const WS2 = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER = '10000000-0000-0000-0000-000000000001';
const KANAL = '20000000-0000-0000-0000-000000000001';

let pg: PGlite;
const q = async <T>(sql: string) => (await pg.query<T>(sql)).rows;

function oncekiRls(): string {
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  const sonraki = sonrakiTablolar(MIGRATIONS, tum.filter((d) => d >= BU));
  expect(sonraki, 'özet tablosu sonraki tablolarda bulunamadı').toContain('haftalik_ozetler');
  const temiz = tablolarsizRls(readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8'), sonraki);
  expect(temiz.bulunamayan, 'sonraki tablolar RLS dizisinde bulunamadı').toEqual([]);
  expect(temiz.sql).not.toMatch(/ON haftalik_ozetler\b|'haftalik_ozetler'/);
  return temiz.sql;
}

async function sqlDosyalari(onceki = false): Promise<void> {
  const dosyalar = readdirSync(SQL_DIR).filter((f) => f.endsWith('.sql')).sort();
  expect(dosyalar).toContain('02_rls.sql');
  for (const f of dosyalar) {
    await pg.exec(onceki && f === '02_rls.sql' ? oncekiRls() : readFileSync(join(SQL_DIR, f), 'utf8'));
  }
}

const plan = (id: string, ws: string, siklik: 'weekly' | 'monthly') => `
  INSERT INTO report_schedules (id, org_id, client_id, created_by_user_id, frequency, day_of_week, day_of_month,
      hour, range_key, to_emails, next_run_at)
  VALUES ('${id}', '${ORG}', '${ws}', '${USER}', '${siklik}', ${siklik === 'weekly' ? 1 : 'NULL'},
      ${siklik === 'monthly' ? 1 : 'NULL'}, 9, 'son_7_gun', '{}', now())`;

const gonderim = (olay: string, anahtar: string) => `
  INSERT INTO bildirim_gonderimleri (org_id, client_id, kanal_id, olay, anahtar, ozet, govde)
  VALUES ('${ORG}', '${WS}', '${KANAL}', '${olay}', '${anahtar}', 'o', '{}')`;

beforeAll(async () => {
  pg = new PGlite();
  const tum = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  expect(tum, 'sınanan migration bulunamadı').toContain(BU);
  const oncekiler = tum.filter((d) => d < BU);
  const sonrakiler = tum.filter((d) => d > BU);
  expect(oncekiler.length).toBeGreaterThan(50);
  expect(oncekiler).toContain('20261013100000_sinyal');

  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari(true);

  // ESKİ VERİ. Aynı workspace'te İKİ rapor planı: kısmi tekil indeks
  // yüklemi yanlış yazılsaydı (`WHERE` olmadan) indeks kurulurken düşerdi.
  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'Ajans', 'ajans', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS2}', '${ORG}', 'WS2', 'ws2', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
      VALUES ('${USER}', '${ORG}', 'a@x.com', 'x', 'A', now());
    INSERT INTO bildirim_kanallari (id, org_id, client_id, tur, ad, hedef_enc, hedef_ipucu, olaylar)
      VALUES ('${KANAL}', '${ORG}', '${WS}', 'slack', 'Kanal', '\\x00', 'hooks…', ARRAY['sinyal','kural']);
  `);
  await pg.exec(plan('a0000000-0000-0000-0000-000000000001', WS, 'weekly'));
  await pg.exec(plan('a0000000-0000-0000-0000-000000000002', WS, 'monthly'));
  await pg.exec(plan('a0000000-0000-0000-0000-000000000003', WS2, 'weekly'));
  await pg.exec(gonderim('sinyal', 's1'));
  await pg.exec(gonderim('kural', 'k1'));
  await pg.exec(gonderim('deneme', 'd1'));

  await pg.exec(readFileSync(join(MIGRATIONS, BU, 'migration.sql'), 'utf8'));
  for (const d of sonrakiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await sqlDosyalari();
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe('haftalık özet migration\'ı üretim sırasında', () => {
  it('KRİTİK: var olan rapor planlarının HEPSİ tur=rapor, hiçbiri kaybolmadı; aynı workspace\'in iki rapor planı indeksle çakışmadı', async () => {
    expect(await q<{ tur: string; n: number }>(`SELECT tur, count(*)::int AS n FROM report_schedules GROUP BY tur`)).toEqual([
      { tur: 'rapor', n: 3 },
    ]);
  });

  it('KRİTİK: workspace başına TEK özet planı; ikinci reddediliyor, başka workspace etkilenmiyor, rapor planı eklenebiliyor', async () => {
    const ozet = (id: string, ws: string) => `
      INSERT INTO report_schedules (id, org_id, client_id, created_by_user_id, tur, frequency, day_of_week, hour, range_key, to_emails, next_run_at)
      VALUES ('${id}', '${ORG}', '${ws}', '${USER}', 'haftalik_ozet', 'weekly', 1, 9, 'onceki_iso_hafta', '{}', now())`;
    await pg.exec(ozet('b0000000-0000-0000-0000-000000000001', WS));
    await expect(pg.exec(ozet('b0000000-0000-0000-0000-000000000002', WS))).rejects.toThrow(/report_schedules_ozet_client_key/);
    await pg.exec(ozet('b0000000-0000-0000-0000-000000000003', WS2));
    await pg.exec(plan('a0000000-0000-0000-0000-000000000004', WS, 'weekly'));
  });

  it('KRİTİK: tur CHECK\'i shared listesinin aynısı; uydurma tür reddediliyor', async () => {
    const [r] = await q<{ d: string }>(
      `SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'report_schedules_tur_chk'`,
    );
    for (const t of RAPOR_PLANI_TURLERI) expect(r!.d).toContain(`'${t}'`);
    await expect(
      pg.exec(`UPDATE report_schedules SET tur = 'uydurma' WHERE id = 'a0000000-0000-0000-0000-000000000001'`),
    ).rejects.toThrow(/report_schedules_tur_chk/);
  });

  it('KRİTİK: eski gönderim satırları yerinde, olay kolonu 20 karakter; haftalik_ozet kabul, uydurma ret', async () => {
    expect(await q<{ olay: string }>(`SELECT olay FROM bildirim_gonderimleri ORDER BY olay`)).toEqual([
      { olay: 'deneme' },
      { olay: 'kural' },
      { olay: 'sinyal' },
    ]);
    const [kolon] = await q<{ n: number }>(
      `SELECT character_maximum_length::int AS n FROM information_schema.columns WHERE table_name = 'bildirim_gonderimleri' AND column_name = 'olay'`,
    );
    expect(kolon!.n).toBe(20);
    for (const olay of BILDIRIM_OLAYLARI) await pg.exec(gonderim(olay, `yeni:${olay}`));
    await pg.exec(gonderim('haftalik_ozet', 'haftalik:2026-W41'));
    await expect(pg.exec(gonderim('uydurma', 'u1'))).rejects.toThrow(/bildirim_gonderimleri_olay_chk/);
  });

  it('KRİTİK: eski olaylı kanal yerinde ve haftalik_ozet olayını seçebiliyor; kısıtlar TEK tanım', async () => {
    await pg.exec(`UPDATE bildirim_kanallari SET olaylar = ARRAY['sinyal','haftalik_ozet'] WHERE id = '${KANAL}'`);
    await expect(
      pg.exec(`UPDATE bildirim_kanallari SET olaylar = ARRAY['uydurma'] WHERE id = '${KANAL}'`),
    ).rejects.toThrow(/bildirim_kanallari_olaylar_chk/);
    expect(
      await q<{ conname: string; n: number }>(`
        SELECT conname, count(*)::int AS n FROM pg_constraint
         WHERE conname IN ('bildirim_gonderimleri_olay_chk', 'bildirim_kanallari_olaylar_chk', 'report_schedules_tur_chk')
         GROUP BY conname ORDER BY conname`),
    ).toEqual([
      { conname: 'bildirim_gonderimleri_olay_chk', n: 1 },
      { conname: 'bildirim_kanallari_olaylar_chk', n: 1 },
      { conname: 'report_schedules_tur_chk', n: 1 },
    ]);
  });

  it('bu deploy\'un db:rls\'i özet tablosuna iki politika (SELECT + INSERT) kurdu, report_schedules politikaları duruyor', async () => {
    expect(
      await q<{ cmd: string }>(`SELECT cmd FROM pg_policies WHERE tablename = 'haftalik_ozetler' ORDER BY cmd`),
    ).toEqual([{ cmd: 'INSERT' }, { cmd: 'SELECT' }]);
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'report_schedules'`)).toEqual([
      { n: 4 },
    ]);
  });
});
