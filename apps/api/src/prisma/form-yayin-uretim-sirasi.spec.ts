import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { LEAD_FORM_STATUSES } from '@advetics/shared';

/**
 * ═══ FORM YAYIN DAMGASI MIGRATION'I ÜRETİM SIRASINDA (Ajan 4 kapısı) ═══
 *
 * `20261015300000_form_yayin_basladi` `lead_forms_status_chk`i düşürüp
 * `uncertain` ile geri kuruyor. Koşum ortamı kısıtları EN SON uyguladığı için
 * bunu göremez (CLAUDE.md "pglite-harness VAR OLAN BİR KISITLA ÇAKIŞAN
 * MIGRATION'I YAKALAYAMAZ"). Üretim sırası elle: önceki migration'lar →
 * ESKİ 01_constraints (uncertain'sız) → her eski durumda satır → bu ve
 * sonraki migration'lar → YENİ 01_constraints → 02_rls.
 *
 * Ayrıca ARA DURUM: migrate bitti, 01_constraints henüz koşmadı. O arada
 * yeni kod `uncertain` yazabilmeli (deploy sırası tam olarak bu).
 */
const MIGRATIONS = join(__dirname, '../../prisma/migrations');
const SQL_DIR = join(__dirname, '../../prisma/sql');
const BU = '20261015300000_form_yayin_basladi';
const ORG = '11111111-1111-1111-1111-111111111111';
const WS = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PROFIL = '66666666-6666-6666-6666-666666666666';
const ESKI_DURUMLAR = ['draft', 'publishing', 'published', 'failed'] as const;

let pg: PGlite;
const q = async <T>(sql: string) => (await pg.query<T>(sql)).rows;
const YENI_KISITLAR = readFileSync(join(SQL_DIR, '01_constraints.sql'), 'utf8');
const ESKI_KISITLAR = YENI_KISITLAR.replace(`'failed', 'uncertain')`, `'failed')`);

function formEkle(id: string, durum: string, kimlik: string | null): string {
  return `
    INSERT INTO lead_forms (id, org_id, client_id, social_profile_id, name, form_type, prefill_questions, custom_questions,
                            consent_boxes, privacy_policy_url, privacy_policy_link_text, thank_you_headline, thank_you_body,
                            status, error, external_form_id, published_at, version, root_id, updated_at)
    VALUES ('${id}', '${ORG}', '${WS}', '${PROFIL}', 'F', 'higher_intent', '["FULL_NAME"]', '[]', '[]',
            'https://x.com/kvkk', 'KVKK', 'T', 'B', '${durum}', ${durum === 'failed' ? `'eski hata'` : 'NULL'}, ${kimlik ? `'${kimlik}'` : 'NULL'},
            ${kimlik ? 'now()' : 'NULL'}, 1, '${id}', now())`;
}

beforeAll(async () => {
  expect(ESKI_KISITLAR, 'eski kısıt üretilemedi — tarama boşa düştü').not.toBe(YENI_KISITLAR);
  pg = new PGlite();
  const hepsi = readdirSync(MIGRATIONS).filter((d) => /^\d/.test(d)).sort();
  const oncekiler = hepsi.filter((d) => d < BU);
  expect(hepsi).toContain(BU);
  expect(oncekiler.length).toBeGreaterThan(50);
  for (const d of oncekiler) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
  await pg.exec(ESKI_KISITLAR);

  await pg.exec(`
    INSERT INTO organizations (id, name, slug, updated_at) VALUES ('${ORG}', 'A', 'a', now());
    INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ('${WS}', '${ORG}', 'WS', 'ws', now());
    INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ('55555555-5555-5555-5555-555555555555', '${ORG}', 'u@x.com', 'x', 'U', now());
    INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
      VALUES ('33333333-3333-3333-3333-333333333333', '${ORG}', '${WS}', 'meta', 'active', 'u1', 'T', '\\x00', '{}', '55555555-5555-5555-5555-555555555555', now());
    INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
      VALUES ('${PROFIL}', '${ORG}', '${WS}', '33333333-3333-3333-3333-333333333333', 'facebook_page', 'p1', 'S', now());
  `);
  // Eski kısıt `uncertain`ı GERÇEKTEN reddediyor (test boşa düşmesin).
  await expect(pg.exec(formEkle('99999999-0000-4000-8000-000000000000', 'uncertain', null))).rejects.toThrow(/lead_forms_status_chk/);
  for (const [i, d] of ESKI_DURUMLAR.entries()) {
    await pg.exec(formEkle(`a${i}a${i}a${i}a${i}-0000-4000-8000-000000000000`, d, d === 'published' ? `ext-${i}` : null));
  }
  for (const d of hepsi.filter((x) => x >= BU)) await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
}, 240_000);

afterAll(async () => {
  await pg?.close();
});

describe('form yayın damgası migration’ı üretim sırasında', () => {
  it('KRİTİK: ARA DURUM (migrate bitti, 01_constraints koşmadı) yeni kod uncertain yazabiliyor', async () => {
    await pg.exec(`UPDATE lead_forms SET status = 'uncertain', meta_request_started_at = now() WHERE status = 'publishing'`);
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM lead_forms WHERE status = 'uncertain'`)).toEqual([{ n: 1 }]);
  });

  it('KRİTİK: yeni 01_constraints dolu tabloda (uncertain satırıyla) uygulanıyor, eski satırlar duruyor', async () => {
    await pg.exec(YENI_KISITLAR);
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM lead_forms`)).toEqual([{ n: ESKI_DURUMLAR.length }]);
    expect(await q<{ n: number }>(`SELECT count(*)::int AS n FROM lead_forms WHERE meta_request_started_at IS NULL`)).toEqual([{ n: ESKI_DURUMLAR.length - 1 }]);
    await pg.exec(readFileSync(join(SQL_DIR, '02_rls.sql'), 'utf8'));
  });

  it('KRİTİK: kısıt shared listesiyle AYNI (biri genişleyip öteki unutulursa INSERT üretimde patlar)', async () => {
    const [r] = await q<{ d: string }>(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'lead_forms_status_chk'`);
    const kisit = [...r!.d.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(kisit).toEqual([...LEAD_FORM_STATUSES].sort());
    await expect(pg.exec(`UPDATE lead_forms SET status = 'uydurma' WHERE status = 'draft'`)).rejects.toThrow(/lead_forms_status_chk/);
  });
});
