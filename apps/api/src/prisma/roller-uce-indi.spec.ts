import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ROLES } from '@advetics/shared';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ ROLLER ÜÇE İNDİ — VERİTABANI DA ÖYLE DİYOR MU ═══
 *
 * `ROLES` sabiti üç değer taşıyor; Postgres enum'u yedi taşımaya devam etse
 * hiçbir şey patlamazdı — eski bir satır `role = 'analyst'` ile durur,
 * `ROLE_PERMISSIONS['analyst']` `undefined` olur ve `resolvePermissions`
 * BOŞ küme döner: kullanıcı giriş yapar, hiçbir şey göremez, hata yok.
 * Bu test şema ile kodun aynı üç değeri bildiğini gerçek veritabanında
 * kilitliyor. Şema üretim migration'larından kuruluyor (PGlite harness).
 */
let h: Harness;
const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '55555555-5555-5555-5555-555555555555';

beforeAll(async () => {
  h = await createHarness();
}, 180_000);
afterAll(() => h.close());

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1,'Advetics','advetics',now())`, [ORG]);
  await h.q(`INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at) VALUES ($1,$2,'a@b.c','x','A',now())`, [USER, ORG]);
});

describe('Role enum', () => {
  it('KRİTİK: enum değerleri TAM OLARAK ROLES ile aynı', async () => {
    const satirlar = await h.q<{ enumlabel: string }>(
      `SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'Role' ORDER BY e.enumsortorder`,
    );
    expect(satirlar.map((s) => s.enumlabel)).toEqual([...ROLES]);
  });

  it('KRİTİK: eski değer artık yazılamıyor', async () => {
    for (const eski of ['owner', 'manager', 'analyst', 'customer_service']) {
      await expect(
        h.q(
          `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, NULL, $3, now(), now())`,
          [USER, ORG, eski],
        ),
      ).rejects.toThrow(/invalid input value for enum/);
    }
  });

  it('yeni değerler yazılıyor — tarama boşa düşmüyor', async () => {
    await h.q(
      `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, NULL, 'admin', now(), now())`,
      [USER, ORG],
    );
    const [s] = await h.q<{ role: string }>('SELECT role FROM memberships WHERE user_id = $1', [USER]);
    expect(s?.role).toBe('admin');
  });

  it('KRİTİK: org-scope CHECK kısıtı tip değişiminden sağ çıktı — Müşteri hesabı şirket geneli olamıyor', async () => {
    // Kolon tipi yeniden kurulurken Postgres kısıtı yeniden çözüyor; bu
    // test "çözdü" demenin kanıtı. Kısıt düşerse `client_viewer` NULL
    // client_id ile yazılır ve müşteri hesabı bütün şirketi görür.
    await expect(
      h.q(
        `INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
         VALUES (gen_random_uuid(), $1, $2, NULL, 'client_viewer', now(), now())`,
        [USER, ORG],
      ),
    ).rejects.toThrow(/memberships_org_scope_role_chk/);
  });
});

describe('migration eski satırları TAŞIYOR, silmiyor', () => {
  const SQL = readFileSync(
    join(__dirname, '../../prisma/migrations/20260914120000_roller_uce_indi/migration.sql'),
    'utf8',
  ).replace(/^\s*--.*$/gm, '');

  it('owner → admin, diğer üçü → ad_manager; iki tabloda da', () => {
    expect(SQL).toMatch(/UPDATE memberships SET role = 'admin' WHERE role = 'owner'/);
    expect(SQL).toMatch(/UPDATE memberships SET role = 'ad_manager'\s+WHERE role IN \('manager', 'analyst', 'customer_service'\)/);
    expect(SQL).toMatch(/UPDATE manager_memberships SET role = 'admin' WHERE role = 'owner'/);
    expect(SQL).toMatch(/UPDATE manager_memberships SET role = 'ad_manager'\s+WHERE role IN \('manager', 'analyst', 'customer_service'\)/);
  });

  it('KRİTİK: UPDATE\'ler tip değişiminden ÖNCE — sonra olsaydı eski değer cast\'te patlardı', () => {
    const sonUpdate = SQL.lastIndexOf('UPDATE manager_memberships');
    const tipDegisimi = SQL.indexOf('ALTER TYPE "Role" RENAME TO');
    expect(sonUpdate).toBeGreaterThan(-1);
    expect(tipDegisimi).toBeGreaterThan(sonUpdate);
  });

  it('kaç satır taşındığı NOTICE ile yazılıyor — sessiz değil', () => {
    expect(SQL.match(/RAISE NOTICE/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
