import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
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
    // Kolon tipi yeniden kurulurken kısıt DÜŞÜRÜLÜP GERİ KURULUYOR; bu test
    // "geri kuruldu" demenin kanıtı. Kısıt düşerse `client_viewer` NULL
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

/**
 * ═══ ÜRETİM SIRASI: KISIT ÖNCE, MIGRATION SONRA ═══
 *
 * ┌─ BU PAKET BİR ÜRETİM ARIZASINDAN DOĞDU ────────────────────────────────┐
 * │ İlk sürüm `memberships_org_scope_role_chk`i düşürmeden tipi takas      │
 * │ ediyordu ve deploy şununla düştü:                                       │
 * │   ERROR: operator does not exist: "Role" <> "Role_eski"  (42883)        │
 * │ Kısıtın yüklemindeki `'client_viewer'` literali, kısıt KURULDUĞU ANDAKİ│
 * │ tipe çivili; kolon yeni tipe geçince karşılaştırma iki farklı enum      │
 * │ arasında kalıyor.                                                       │
 * │                                                                         │
 * │ YUKARIDAKİ PAKET BUNU GÖREMEZ VE SEBEBİ YAPISAL: `pglite-harness`      │
 * │ şemayı önce BÜTÜN migration'lardan kuruyor, `01_constraints.sql`i EN    │
 * │ SON uyguluyor — migration koşarken kısıt henüz YOK. Üretimde sıra tam   │
 * │ tersi. Yani harness'ı kullanan HİÇBİR test, var olan bir kısıtla        │
 * │ çakışan bir migration'ı yakalayamaz.                                    │
 * │                                                                         │
 * │ Burası harness'ı KULLANMIYOR: üretim durumunu elle kuruyor — önceki     │
 * │ migration'lar, sonra kısıtlar, sonra ESKİ ROLLÜ SATIRLAR, en sonunda    │
 * │ sınanan migration.                                                      │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
describe('migration üretim sırasında koşuyor', () => {
  const MIGRATIONS = join(__dirname, '../../prisma/migrations');
  const SQL_DIR = join(__dirname, '../../prisma/sql');
  const BU_MIGRATION = '20260914120000_roller_uce_indi';

  let pg: PGlite;

  beforeAll(async () => {
    pg = new PGlite();

    // 1) BU migration'dan ÖNCEKİ şema — yani üretimin deploy anındaki hâli.
    const oncekiler = readdirSync(MIGRATIONS)
      .filter((d) => /^\d/.test(d))
      .sort()
      .filter((d) => d < BU_MIGRATION);
    expect(oncekiler.length, 'migration listesi boş — tarama boşa düştü').toBeGreaterThan(50);
    for (const d of oncekiler) {
      await pg.exec(readFileSync(join(MIGRATIONS, d, 'migration.sql'), 'utf8'));
    }

    // 2) KISITLAR — üretimde bir önceki deploy'un `db:rls` adımından beri
    //    duruyorlar. Arızanın kaynağı tam olarak bu adımın var olması.
    await pg.exec(readFileSync(join(SQL_DIR, '01_constraints.sql'), 'utf8'));

    // 3) ESKİ ROLLÜ SATIRLAR — taşınacak veri. Boş bir veritabanında
    //    migration "başarılı" görünür ve hiçbir şey taşımaz.
    await pg.exec(`
      INSERT INTO manager_accounts (id, name, slug, status, created_at, updated_at)
        VALUES ('a0000000-0000-0000-0000-00000000000a', 'Danışmanlık', 'dan', 'active', now(), now());
      INSERT INTO organizations (id, name, slug, plan, status, manager_account_id, created_at, updated_at)
        VALUES ('${ORG}', 'Advetics', 'advetics', 'starter', 'active', 'a0000000-0000-0000-0000-00000000000a', now(), now());
      INSERT INTO clients (id, org_id, name, slug, timezone, reporting_currency, status, contact_emails, created_at, updated_at)
        VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '${ORG}', 'WS', 'ws', 'Europe/Istanbul', 'TRY', 'active', '{}', now(), now());
      INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at) VALUES
        ('10000000-0000-0000-0000-000000000001', '${ORG}', 'o@x.com',  'Owner',   'h', 'tr', 'active', now(), now()),
        ('10000000-0000-0000-0000-000000000002', '${ORG}', 'm@x.com',  'Manager', 'h', 'tr', 'active', now(), now()),
        ('10000000-0000-0000-0000-000000000003', '${ORG}', 'a@x.com',  'Analyst', 'h', 'tr', 'active', now(), now()),
        ('10000000-0000-0000-0000-000000000004', '${ORG}', 'cs@x.com', 'CS',      'h', 'tr', 'active', now(), now()),
        ('10000000-0000-0000-0000-000000000005', '${ORG}', 'cv@x.com', 'Viewer',  'h', 'tr', 'active', now(), now());
      INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at) VALUES
        (gen_random_uuid(), '10000000-0000-0000-0000-000000000001', '${ORG}', NULL, 'owner', now(), now()),
        (gen_random_uuid(), '10000000-0000-0000-0000-000000000002', '${ORG}', NULL, 'manager', now(), now()),
        (gen_random_uuid(), '10000000-0000-0000-0000-000000000003', '${ORG}', NULL, 'analyst', now(), now()),
        (gen_random_uuid(), '10000000-0000-0000-0000-000000000004', '${ORG}', NULL, 'customer_service', now(), now()),
        (gen_random_uuid(), '10000000-0000-0000-0000-000000000005', '${ORG}', 'cccccccc-cccc-cccc-cccc-cccccccccccc', 'client_viewer', now(), now());
      INSERT INTO manager_memberships (id, manager_account_id, user_id, role, created_at, updated_at) VALUES
        (gen_random_uuid(), 'a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001', 'owner', now(), now()),
        (gen_random_uuid(), 'a0000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000002', 'analyst', now(), now());
    `);

    // 4) SINANAN MIGRATION. Düşerse `beforeAll` patlıyor ve bütün paket
    //    kırmızı — üretimdeki deploy'un yaptığının aynısı.
    await pg.exec(readFileSync(join(MIGRATIONS, BU_MIGRATION, 'migration.sql'), 'utf8'));
  }, 180_000);

  afterAll(async () => {
    await pg?.close();
  });

  async function q<T>(sql: string): Promise<T[]> {
    return (await pg.query<T>(sql)).rows;
  }

  it('KRİTİK: eski satırlar TAŞINDI — hiçbiri silinmedi', async () => {
    const satirlar = await q<{ email: string; role: string }>(
      `SELECT u.email, m.role FROM memberships m JOIN users u ON u.id = m.user_id ORDER BY u.email`,
    );
    expect(satirlar).toEqual([
      { email: 'a@x.com', role: 'ad_manager' }, // analyst
      { email: 'cs@x.com', role: 'ad_manager' }, // customer_service
      { email: 'cv@x.com', role: 'client_viewer' }, // değişmedi
      { email: 'm@x.com', role: 'ad_manager' }, // manager
      { email: 'o@x.com', role: 'admin' }, // owner
    ]);
  });

  it('KRİTİK: üst hesap üyelikleri de taşındı — ikinci tablo unutulmadı', async () => {
    /*
     * SIRA E-POSTAYA ÇAPALI, `ORDER BY role`A DEĞİL: enum kolonu TANIM
     * sırasına göre sıralanıyor (alfabetik değil), yani beklenen dizi
     * enum'un iç sırasına bağlı kalırdı. İlk yazdığımda tam bu yüzden
     * kırmızı verdi ve hata migration'da değil testte oldu.
     */
    const satirlar = await q<{ email: string; role: string }>(
      `SELECT u.email, mm.role FROM manager_memberships mm
         JOIN users u ON u.id = mm.user_id ORDER BY u.email`,
    );
    expect(satirlar).toEqual([
      { email: 'm@x.com', role: 'ad_manager' }, // analyst
      { email: 'o@x.com', role: 'admin' }, // owner
    ]);
  });

  it('KRİTİK: kısıt GERİ KURULDU ve hâlâ zorluyor', async () => {
    const [kisit] = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_constraint WHERE conname = 'memberships_org_scope_role_chk'`,
    );
    expect(kisit?.n).toBe('1');

    await expect(
      q(`INSERT INTO memberships (id, user_id, org_id, client_id, role, created_at, updated_at)
         VALUES (gen_random_uuid(), '10000000-0000-0000-0000-000000000005', '${ORG}', NULL, 'client_viewer', now(), now())`),
    ).rejects.toThrow(/memberships_org_scope_role_chk/);
  });

  it('geçici tip temizlendi — "Role_eski" ortada kalmadı', async () => {
    const [t] = await q<{ n: string }>(
      `SELECT count(*)::text AS n FROM pg_type WHERE typname = 'Role_eski'`,
    );
    expect(t?.n).toBe('0');
  });

  it('BOŞA DÜŞME BEKÇİSİ: 02/03 numaralı SQL adımları Role tipine dokunmuyor', () => {
    /*
     * Bu paket yalnızca `01_constraints.sql`i uyguluyor ve bu bir SEÇİM:
     * ölçüldü, `Role` tipine bağlı tek nesne oradaki CHECK kısıtı. Biri
     * politikalara ya da partition'lara rol karşılaştırması eklerse bu
     * varsayım çürür ve aynı sınıf hata SESSİZCE geri gelir — o yüzden
     * varsayımın kendisi taranıyor.
     */
    for (const dosya of ['02_rls.sql', '03_partitions.sql']) {
      const kaynak = readFileSync(join(SQL_DIR, dosya), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*--.*$/gm, '');
      for (const rol of [...ROLES, 'owner', 'manager', 'analyst', 'customer_service']) {
        expect(kaynak, `${dosya} artık '${rol}' karşılaştırıyor — bu paket genişletilmeli`).not.toContain(
          `'${rol}'`,
        );
      }
    }
  });

  it('kaç satır taşındığı NOTICE ile yazılıyor — deploy logunda görünüyor', () => {
    // NOTICE'ler PGlite'ta okunmuyor; kaynakta durduklarını doğruluyoruz.
    // Sessiz bir veri taşıması, kimin rolünün değiştiğini kimseye söylemez.
    const sql = readFileSync(join(MIGRATIONS, BU_MIGRATION, 'migration.sql'), 'utf8').replace(
      /^\s*--.*$/gm,
      '',
    );
    expect(sql.match(/RAISE NOTICE/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });
});
