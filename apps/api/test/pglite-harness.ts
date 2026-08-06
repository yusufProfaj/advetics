import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { Prisma } from '@prisma/client';

/**
 * Gerçek Postgres motoruna karşı test koşum ortamı.
 *
 * NEDEN GEREKLİ: senkronizasyon katmanı ham SQL yazıyor (toplu
 * `INSERT … ON CONFLICT`). Kolon adı, enum cast'i, `ON CONFLICT` hedefi veya
 * eksik bir `NOT NULL` kolonu — bunların hiçbirini TypeScript görmüyor.
 * Yalnızca çalışma anında, üretimde patlıyorlar. Nitekim `updated_at` kolonunu
 * atlamış olduğumu bu koşum ortamı yakaladı: Prisma'nın `@updatedAt` alanı
 * uygulama seviyesinde çalışıyor, kolonun veritabanı DEFAULT'u yok.
 *
 * PGlite, Postgres 16'nın WASM derlemesi — Docker gerekmiyor. Kurulum dosya
 * başına bir kez yapılıyor, testler arası izolasyonu `reset()` sağlıyor.
 * Şema, üretimde koşan migration dosyalarından kuruluyor; el yazımı bir test
 * şeması üretimden sapabilirdi.
 */

/** Prisma istemcisinin bu testlerde kullanılan yüzeyi. */
export interface TestDb {
  $queryRaw(sql: Prisma.Sql): Promise<unknown[]>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
  [model: string]: unknown;
}

export interface Harness {
  pg: PGlite;
  db: TestDb;
  /** Ham sorgu — testlerin doğrulama yapabilmesi için. */
  q<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
  /**
   * Tüm veriyi siler, şemayı korur.
   *
   * Test başına yeni bir PGlite kurmak ~2 saniye sürüyor (migration'ların
   * tamamı yeniden koşuyor); TRUNCATE milisaniyeler. 18 testlik bir dosyada
   * fark 45 saniyeye karşı 3 saniye.
   */
  reset(): Promise<void>;
  close(): Promise<void>;
}

/** bigint parametreleri PGlite'a string olarak veriliyor. */
function normalize(v: unknown): unknown {
  return typeof v === 'bigint' ? v.toString() : v;
}

const MIGRATIONS_DIR = join(__dirname, '..', 'prisma', 'migrations');

export async function createHarness(): Promise<Harness> {
  const pg = new PGlite();

  // Şemayı üretim migration'larından kur — tek doğruluk kaynağı.
  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d/.test(d))
    .sort();
  for (const dir of dirs) {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'));
  }

  const q = async <T>(sql: string, params: unknown[] = []): Promise<T[]> => {
    const res = await pg.query<T>(sql, params.map(normalize));
    return res.rows;
  };

  const run = (sql: Prisma.Sql) => pg.query(sql.text, sql.values.map(normalize));

  /**
   * Prisma → PGlite köprüsü.
   *
   * Yalnızca senkronizasyon servislerinin GERÇEKTEN kullandığı metotlar var.
   * Tam bir Prisma taklidi yazmak, taklidin kendisini test etmek olurdu.
   */
  const db = {
    $queryRaw: async (sql: Prisma.Sql) => (await run(sql)).rows,
    $executeRaw: async (sql: Prisma.Sql) => (await run(sql)).affectedRows ?? 0,

    adAccount: {
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const rows = await q<Record<string, unknown>>(
          'SELECT * FROM ad_accounts WHERE id = $1',
          [where.id],
        );
        const a = rows[0];
        if (!a) throw new Error(`ad_account bulunamadı: ${where.id}`);
        return {
          id: a.id,
          clientId: a.client_id,
          connectionId: a.connection_id,
          platform: a.platform,
          externalId: a.external_id,
          managerExternalId: a.manager_external_id,
          lastStructureSyncAt: a.last_structure_sync_at,
        };
      },
      findUnique: async ({ where }: { where: { id: string } }) => {
        const rows = await q<{ connection_id: string }>(
          'SELECT connection_id FROM ad_accounts WHERE id = $1',
          [where.id],
        );
        return rows[0] ? { connectionId: rows[0].connection_id } : null;
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: { lastStructureSyncAt?: Date };
      }) => {
        if (data.lastStructureSyncAt) {
          await q('UPDATE ad_accounts SET last_structure_sync_at = $1 WHERE id = $2', [
            data.lastStructureSyncAt,
            where.id,
          ]);
        }
        return {};
      },
    },

    ...externalIdLookup('campaign', 'campaigns', q),
    ...externalIdLookup('adGroup', 'ad_groups', q),
    ...externalIdLookup('creative', 'creatives', q),

    platformConnection: { update: async () => ({}) },
    syncJob: { update: async () => ({}), findUnique: async () => null },
  } as unknown as TestDb;

  /**
   * Silme sırası CASCADE'e bırakılmıyor: tablo listesini açıkça vermek,
   * ileride eklenen bir tablonun sessizce temizlenmeden kalmasını engelliyor
   * — testler arası veri sızıntısı en yanıltıcı test hatası türü.
   */
  const reset = async (): Promise<void> => {
    await pg.exec(`
      TRUNCATE TABLE
        insights_daily, api_usage_log, sync_jobs,
        ads, creatives, ad_groups, campaigns,
        ad_accounts, social_profiles, platform_connections,
        memberships, refresh_tokens, audit_logs, users, clients, organizations
      CASCADE;
    `);
  };

  return { pg, db, q, reset, close: () => pg.close() };
}

/** `findMany({ where: { platform, externalId: { in } } })` taklidi. */
function externalIdLookup(
  model: string,
  table: string,
  q: <T>(sql: string, params?: unknown[]) => Promise<T[]>,
) {
  return {
    [model]: {
      findMany: async ({
        where,
      }: {
        where: { platform: string; externalId: { in: string[] } };
      }) => {
        const rows = await q<{ id: string; external_id: string }>(
          `SELECT id, external_id FROM ${table} WHERE platform = $1 AND external_id = ANY($2)`,
          [where.platform, where.externalId.in],
        );
        return rows.map((r) => ({ id: r.id, externalId: r.external_id }));
      },
    },
  };
}

export const IDS = {
  org: '11111111-1111-1111-1111-111111111111',
  client: '22222222-2222-2222-2222-222222222222',
  connection: '33333333-3333-3333-3333-333333333333',
  adAccount: '44444444-4444-4444-4444-444444444444',
  user: '55555555-5555-5555-5555-555555555555',
} as const;

/**
 * Minimum kiracı zinciri: organizasyon → müşteri → kullanıcı → bağlantı → hesap.
 *
 * `updated_at` her INSERT'te açıkça veriliyor: Prisma'nın `@updatedAt`
 * otomatizması uygulama seviyesinde, veritabanı kolonunun DEFAULT'u yok.
 */
export async function seedTenant(
  h: Harness,
  opts: { platform?: 'meta' | 'google'; externalId?: string; timezone?: string } = {},
): Promise<void> {
  const platform = opts.platform ?? 'meta';
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Test', 'test', now())`, [
    IDS.org,
  ]);
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'Müşteri', 'musteri', now())`,
    [IDS.client, IDS.org],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, password_hash, full_name, updated_at)
     VALUES ($1, $2, 'test@advetics.com', 'x', 'Test Kullanıcı', now())`,
    [IDS.user, IDS.org],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, $3, 'active', 'u1', 'Test', '\\x00', '{}', $4, now())`,
    [IDS.connection, IDS.client, platform, IDS.user],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'Hesap', 'TRY', $6, true, now())`,
    [
      IDS.adAccount,
      IDS.client,
      IDS.connection,
      platform,
      opts.externalId ?? 'act_999',
      opts.timezone ?? 'Europe/Istanbul',
    ],
  );
}
