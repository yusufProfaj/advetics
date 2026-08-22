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
  /**
   * `T` SONUCUN TAMAMI, eleman tipi değil — Prisma'nın kendi imzası böyle.
   *
   * `Promise<unknown[]>` yazmak koşum ortamını Prisma'dan AYIRIYORDU: testler
   * çalışıyor ama servisleri `TxLike` bekleyen bir parametreye geçirmek
   * derlenmiyordu. Koşum ortamının üretimden sapması, tam da onun engellemesi
   * gereken şey.
   */
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
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
const SQL_DIR = join(__dirname, '..', 'prisma', 'sql');

export async function createHarness(): Promise<Harness> {
  const pg = new PGlite();

  // Şemayı üretim migration'larından kur — tek doğruluk kaynağı.
  const dirs = readdirSync(MIGRATIONS_DIR)
    .filter((d) => /^\d/.test(d))
    .sort();
  for (const dir of dirs) {
    await pg.exec(readFileSync(join(MIGRATIONS_DIR, dir, 'migration.sql'), 'utf8'));
  }

  // ÜRETİMDEKİ TÜM SQL ADIMLARINI UYGULA.
  //
  // Prisma migration'ları şemanın tamamı DEĞİL. `insights_daily` partition'lı
  // bir tablo ve partition'lar `03_partitions.sql` ile geliyor (üretimde
  // `db:rls` adımı). Bu dosya atlandığında tabloya hiçbir satır yazılamıyor;
  // hata "no partition of relation found for row" oluyor ve sebebi hiç
  // anlatmıyor — arıza kodda sanılıyor.
  //
  // Dosyalar arası bağımlılık var ve SIRA ÖNEMLİ: 03'ün partition'lara kurduğu
  // RLS politikaları 02'deki `app.can_access_client()` yardımcısını çağırıyor.
  // 03'ü tek başına uygulamak "function app.can_access_client(uuid) does not
  // exist" ile düşüyor.
  for (const file of ['01_constraints.sql', '02_rls.sql', '03_partitions.sql']) {
    await pg.exec(readFileSync(join(SQL_DIR, file), 'utf8'));
  }
  // Test aralığını kapsayan partition'lar (24 ay geri, 24 ay ileri).
  await pg.exec('SELECT app.ensure_insights_partitions(24, 24);');

  // RLS ZORLAMASINI KAPAT — üretimi doğru taklit etmek için.
  //
  // Bu koşum ortamı `advetics_worker` bağlantısını temsil ediyor ve o rol
  // üretimde BYPASSRLS. `02_rls.sql` ise `FORCE ROW LEVEL SECURITY` kuruyor;
  // bu, tablo SAHİBİNE de politika uyguluyor ve PGlite'ta tek bağlantı
  // sahibin kendisi. Kapatmazsak testler kiracı bağlamı kurmadıkları için
  // hiçbir satır göremezdi — RLS'in kendisi doğru çalışsa bile.
  //
  // RLS'in gerçekten çalıştığı ayrı bir test paketiyle doğrulanıyor; orada
  // rol bazlı bağlantı taklit ediliyor.
  await pg.exec(`
    DO $$
    DECLARE t record;
    BEGIN
      FOR t IN SELECT schemaname, tablename FROM pg_tables WHERE schemaname = 'public'
      LOOP
        EXECUTE format('ALTER TABLE %I.%I NO FORCE ROW LEVEL SECURITY', t.schemaname, t.tablename);
        EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY', t.schemaname, t.tablename);
      END LOOP;
    END $$;
  `);

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
        const a = await loadAdAccount(q, where.id);
        if (!a) throw new Error(`ad_account bulunamadı: ${where.id}`);
        return a;
      },
      findUnique: async ({ where }: { where: { id: string } }) => loadAdAccount(q, where.id),
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          lastStructureSyncAt?: Date;
          lastInsightsSyncAt?: Date;
          clientId?: string | null;
          syncEnabled?: boolean;
        };
      }) => {
        if (data.lastStructureSyncAt) {
          await q('UPDATE ad_accounts SET last_structure_sync_at = $1 WHERE id = $2', [
            data.lastStructureSyncAt,
            where.id,
          ]);
        }
        if (data.lastInsightsSyncAt) {
          await q('UPDATE ad_accounts SET last_insights_sync_at = $1 WHERE id = $2', [
            data.lastInsightsSyncAt,
            where.id,
          ]);
        }
        // `clientId` UNDEFINED ile NULL AYRI ŞEYLER: undefined "dokunma",
        // null "havuza geri koy". `if (data.clientId)` yazmak, atamayı
        // kaldırma yolunu sessizce çalışmaz hâle getirirdi.
        if ('clientId' in data) {
          await q('UPDATE ad_accounts SET client_id = $1 WHERE id = $2', [
            data.clientId ?? null,
            where.id,
          ]);
        }
        if (data.syncEnabled !== undefined) {
          await q('UPDATE ad_accounts SET sync_enabled = $1 WHERE id = $2', [
            data.syncEnabled,
            where.id,
          ]);
        }
        return (await loadAdAccount(q, where.id)) ?? {};
      },
    },

    socialProfile: {
      findUnique: async ({ where }: { where: { id: string } }) => {
        const rows = await q<Record<string, unknown>>(
          'SELECT * FROM social_profiles WHERE id = $1',
          [where.id],
        );
        const p = rows[0];
        if (!p) return null;
        return {
          id: p.id,
          orgId: p.org_id,
          clientId: p.client_id,
          connectionId: p.connection_id,
          profileType: p.profile_type,
          externalId: p.external_id,
          name: p.name,
          syncEnabled: p.sync_enabled,
          linkedAdAccountId: p.linked_ad_account_id,
        };
      },
      /**
       * TANIMADIĞI ALANDA HATA FIRLATIYOR — sessizce yok saymıyor.
       *
       * Bu taklit bir süre yalnızca üç alanı biliyordu ve bilmediğini sessizce
       * atlıyordu. Sonucu somut: `linkedAdAccountId` eklendiğinde gerçek kod
       * doğru çalışırken test "güncellenmedi" diyordu ve hatanın taklitten
       * geldiği hiçbir yerde yazmıyordu. Tersi daha kötü olurdu — taklit
       * atlarken testin GEÇMESİ, yani var olmayan bir davranışın doğrulanmış
       * sayılması.
       *
       * Yeni bir kolon güncellenmeye başladığında bu liste de büyümek zorunda
       * ve hata mesajı bunu söylüyor.
       */
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: {
          clientId?: string | null;
          syncEnabled?: boolean;
          lastSyncAt?: Date;
          linkedAdAccountId?: string | null;
        };
      }) => {
        const bilinen = ['clientId', 'syncEnabled', 'lastSyncAt', 'linkedAdAccountId'];
        const tanimsiz = Object.keys(data).filter((k) => !bilinen.includes(k));
        if (tanimsiz.length > 0) {
          throw new Error(
            `pglite-harness: socialProfile.update bu alanları tanımıyor: ` +
              `${tanimsiz.join(', ')}. Taklide ekle — yoksa test sessizce ` +
              'güncellenmemiş bir satırı doğrulamış olur.',
          );
        }

        // `clientId` için `in` kontrolü: undefined "dokunma", null "havuza
        // geri koy" — ikisi ayrı komut.
        if ('clientId' in data) {
          await q('UPDATE social_profiles SET client_id = $1 WHERE id = $2', [
            data.clientId ?? null,
            where.id,
          ]);
        }
        if (data.syncEnabled !== undefined) {
          await q('UPDATE social_profiles SET sync_enabled = $1 WHERE id = $2', [
            data.syncEnabled,
            where.id,
          ]);
        }
        if (data.lastSyncAt) {
          await q('UPDATE social_profiles SET last_sync_at = $1 WHERE id = $2', [
            data.lastSyncAt,
            where.id,
          ]);
        }
        // `in` kontrolü yine ŞART: null "eşleşmeyi kaldır" demek ve
        // `!== undefined` ile ayırt edilemezdi.
        if ('linkedAdAccountId' in data) {
          await q('UPDATE social_profiles SET linked_ad_account_id = $1 WHERE id = $2', [
            data.linkedAdAccountId ?? null,
            where.id,
          ]);
        }
        const rows = await q<Record<string, unknown>>(
          `SELECT id, client_id, sync_enabled, name, linked_ad_account_id
           FROM social_profiles WHERE id = $1`,
          [where.id],
        );
        const p = rows[0];
        return p
          ? {
              id: p.id,
              clientId: p.client_id,
              syncEnabled: p.sync_enabled,
              name: p.name,
              linkedAdAccountId: p.linked_ad_account_id,
            }
          : {};
      },
    },

    leadForm: {
      count: async ({ where }: { where: { socialProfileId: string; clientId: string } }) => {
        const rows = await q<{ n: string }>(
          'SELECT count(*) AS n FROM lead_forms WHERE social_profile_id = $1 AND client_id = $2',
          [where.socialProfileId, where.clientId],
        );
        return Number(rows[0]!.n);
      },
    },

    /**
     * Denetim kaydı — servislerin `tx`'e yazdığı tek ortak tablo.
     *
     * `id` VERİLMİYOR: kolon BIGSERIAL, UUID değil. Elle id yazmak dizinin
     * kaymasına ve sonraki insert'lerin çakışmasına yol açıyor.
     */
    auditLog: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        await q(
          `INSERT INTO audit_logs
             (org_id, client_id, actor_type, actor_id, action, target_type, target_id,
              before, after, ip, user_agent, request_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            data.orgId,
            data.clientId ?? null,
            data.actorType ?? 'user',
            data.actorId ?? null,
            data.action,
            data.targetType ?? null,
            data.targetId ?? null,
            data.before === undefined ? null : JSON.stringify(data.before),
            data.after === undefined ? null : JSON.stringify(data.after),
            data.ip ?? null,
            data.userAgent ?? null,
            data.requestId ?? null,
          ],
        );
        return {};
      },
    },

    ...externalIdLookup('campaign', 'campaigns', q),
    ...externalIdLookup('adGroup', 'ad_groups', q),
    ...externalIdLookup('creative', 'creatives', q),
    // `ad` de gerekli: metrik senkronizasyonu reklam seviyesinde dış kimlik
    // eşlemesi yapıyor ve bu satır olmadan `db.ad` undefined kalıyor.
    ...externalIdLookup('ad', 'ads', q),

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
        draft_ads, draft_ad_groups, draft_campaigns,
        ad_creative_assets, ad_creatives,
        asset_platform_refs, assets,
        leads, lead_sync_cursors, lead_forms,
        bulk_items, bulk_batches,
        auto_boost_queue_items, auto_boost_subscriptions, auto_boost_presets,
        boosts, boost_rules, organic_posts,
        rule_action_logs, rule_runs, rules,
        monthly_budgets,
        -- RAPOR TABLOLARI ACIKCA YAZILI. Bugune kadar clients/organizations
        -- CASCADE'i sayesinde dolayli temizleniyorlardi; bu TESADUFI ve
        -- org_id/client_id iliskisi bir gun nullable olursa sessizce sizarlar.
        -- (Backtick YOK: sablon dizesini ortasindan kapatiyor — CLAUDE.md.)
        report_shares, report_templates, user_email_accounts,
        insights_daily, keyword_insights, search_term_insights,
        api_usage_log, sync_jobs,
        ads, creatives, ad_groups, campaigns,
        ad_accounts, social_profiles, platform_connections,
        memberships, refresh_tokens, audit_logs, users, clients, organizations
      CASCADE;
    `);
  };

  return { pg, db, q, reset, close: () => pg.close() };
}

/**
 * Reklam hesabı satırını Prisma'nın döndürdüğü camelCase şekle çevirir.
 *
 * TEK YERDEN: `findUnique` eskiden yalnızca `connectionId` döndürüyordu ve
 * atama yolu (`client_id`, `sync_enabled`) eklendiğinde iki metot birbirinden
 * ayrı düşerdi — test koşum ortamının üretimden sapması, tam da onun
 * engellemesi gereken şey.
 */
async function loadAdAccount(
  q: <T>(sql: string, params?: unknown[]) => Promise<T[]>,
  id: string,
): Promise<Record<string, unknown> | null> {
  const rows = await q<Record<string, unknown>>('SELECT * FROM ad_accounts WHERE id = $1', [id]);
  const a = rows[0];
  if (!a) return null;
  return {
    id: a.id,
    orgId: a.org_id,
    clientId: a.client_id,
    connectionId: a.connection_id,
    platform: a.platform,
    externalId: a.external_id,
    name: a.name,
    managerExternalId: a.manager_external_id,
    timezone: a.timezone,
    currency: a.currency,
    status: a.status,
    syncEnabled: a.sync_enabled,
    lastStructureSyncAt: a.last_structure_sync_at,
    lastInsightsSyncAt: a.last_insights_sync_at,
  };
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
  /**
   * BAĞLANTI VE HESAP `org_id` TAŞIYOR.
   *
   * Sahiplik ajansta; `client_id` yalnızca ATAMA. Bu yardımcı ATANMIŞ bir
   * hesap kuruyor — testlerin çoğu müşteri bazlı davranışı sınıyor. Havuz
   * (`client_id IS NULL`) davranışını sınayan paketler kendi kurulumlarını
   * yapıyor: `ad-account-pool-rls.spec.ts`, `agency-connection-schema.spec.ts`.
   */
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, $3, $4, 'active', 'u1', 'Test', '\\x00', '{}', $5, now())`,
    [IDS.connection, IDS.org, IDS.client, platform, IDS.user],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'Hesap', 'TRY', $7, true, now())`,
    [
      IDS.adAccount,
      IDS.org,
      IDS.client,
      IDS.connection,
      platform,
      opts.externalId ?? 'act_999',
      opts.timezone ?? 'Europe/Istanbul',
    ],
  );
}
