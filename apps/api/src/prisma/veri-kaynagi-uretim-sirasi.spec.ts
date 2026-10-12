import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { SAGLIK_KONTROLLERI } from '@advetics/shared';

/**
 * ═══ F1 MIGRATION'I ÜRETİM SIRASINDA (sinyaller_kod_chk yeniden kuruluyor) ═══
 *
 * `20261014200000_veri_kaynagi` `sinyaller_kod_chk`i DÜŞÜRÜP genişletilmiş
 * listeyle geri kuruyor. `pglite-harness` bunu sınayamaz: şemayı bütün
 * migration'lardan kurup kısıtları en son uyguluyor, yani migration koşarken
 * tabloda hiç satır yok (CLAUDE.md "pglite-harness VAR OLAN BİR KISITLA
 * ÇAKIŞAN MIGRATION'I YAKALAYAMAZ"). Paket A ayrı bir deploy'la canlıya
 * çıkarsa F1 geldiğinde `sinyaller` DOLU olacak. Burada üretim durumu elle
 * kuruluyor: önceki migration'lar → 01_constraints → ESKİ KODLU SATIRLAR
 * (dokuz kodun hepsi) → F1 ve sonraki migration'lar → kısıtlar + RLS.
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU = '20261014200000_veri_kaynagi';
const ESKI_KODLAR = [
  'harcama', 'gosterim', 'tiklama_orani', 'tiklama_basi_maliyet', 'donusum', 'donusum_basi_maliyet',
  'sifir_gosterim', 'reklam_onaysiz', 'donusum_kesildi',
] as const;
const ANOMALI = new Set(ESKI_KODLAR.slice(0, 6));
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HESAP = '44444444-4444-4444-4444-444444444444';

let pg: PGlite;
const q = async <T>(sql: string) => (await pg.query<T>(sql)).rows;

beforeAll(async () => {
  pg = new PGlite();
  const hepsi = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  const oncekiler = hepsi.filter((d) => d < BU);
  expect(oncekiler.length, 'migration listesi boş — tarama boşa düştü').toBeGreaterThan(50);
  expect(oncekiler).toContain('20261013100000_sinyal');
  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await pg.exec(readFileSync(join(SQL_DIR, '01_constraints.sql'), 'utf8'));

  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'A', 'a', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ('55555555-5555-5555-5555-555555555555', '${ORG}', 'u@x.com', 'x', 'U', now());
    INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
      VALUES ('33333333-3333-3333-3333-333333333333', '${ORG}', '${WS}', 'meta', 'active', 'u1', 'T', '\\x00', '{}', '55555555-5555-5555-5555-555555555555', now());
    INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
      VALUES ('${HESAP}', '${ORG}', '${WS}', '33333333-3333-3333-3333-333333333333', 'meta', 'act_1', 'H', 'TRY', 'Europe/Istanbul', true, now());
  `);
  for (const kod of ESKI_KODLAR) {
    const tur = ANOMALI.has(kod) ? 'anomali' : 'saglik';
    await pg.exec(`
      INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, seviye, varlik_id, varlik_adi, gun, onem, para_birimi)
      VALUES ('${ORG}', '${WS}', '${HESAP}', 'meta', '${tur}:${kod}', '${tur}', '${kod}', 'account', '${HESAP}', 'H', '2026-10-10', 'orta', 'TRY')`);
  }
  // Kuyrukta bekleyen eski işler: yeni kolon NULL ile kalmalı.
  await pg.exec(`INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status) VALUES ('${WS}', '${HESAP}', 'structure', 'succeeded')`);

  for (const d of hepsi.filter((x) => x >= BU)) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await pg.exec(readFileSync(join(SQL_DIR, '01_constraints.sql'), 'utf8'));
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe('F1 migration üretim sırasında', () => {
  it('KRİTİK: dolu sinyaller tablosunda kısıt geri kuruldu, eski satırların hiçbiri kaybolmadı', async () => {
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM sinyaller`)).toEqual([{ n: ESKI_KODLAR.length }]);
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_constraint WHERE conname = 'sinyaller_kod_chk'`)).toEqual([{ n: 1 }]);
  });

  it('KRİTİK: yeni kısıt SAGLIK_KONTROLLERI\'nin hepsini kabul ediyor, uydurma kodu reddediyor', async () => {
    for (const kod of SAGLIK_KONTROLLERI) {
      await pg.exec(`
        INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, seviye, varlik_id, varlik_adi, gun, onem, para_birimi)
        VALUES ('${ORG}', '${WS}', '${HESAP}', 'meta', 'yeni:${kod}', 'saglik', '${kod}', 'account', '${HESAP}', 'H', '2026-10-11', 'orta', 'TRY')`);
    }
    await expect(
      pg.exec(`
        INSERT INTO sinyaller (org_id, client_id, ad_account_id, platform, anahtar, tur, kod, seviye, varlik_id, varlik_adi, gun, onem, para_birimi)
        VALUES ('${ORG}', '${WS}', '${HESAP}', 'meta', 'x', 'saglik', 'uydurma_kod', 'account', '${HESAP}', 'H', '2026-10-11', 'orta', 'TRY')`),
    ).rejects.toThrow(/sinyaller_kod_chk/);
  });

  it('eski sync_jobs satırı yeni kolonla NULL kaldı; RLS dosyası migration sonrası uygulanabiliyor', async () => {
    expect(await q<{ v: string | null }>(`SELECT veri_kaynagi_id::text AS v FROM sync_jobs`)).toEqual([{ v: null }]);
    await pg.exec(readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8'));
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM pg_policies WHERE tablename = 'veri_kaynaklari'`)).toEqual([{ n: 3 }]);
  });
});
