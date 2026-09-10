import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ `can_access_client` ORG YÖNETİCİSİNDE DEGENERE OLUYOR ═══
 *
 * Fonksiyon şöyle:
 *
 *   has_context()
 *   AND (is_org_admin() OR target = ANY(current_client_ids()))
 *   AND (current_active_client_id() IS NULL OR target = current_active_client_id())
 *
 * Org yöneticisinde ikinci satır KOŞULSUZ true. Panelde bir workspace
 * seçili değilse üçüncü satır da true. Geriye `has_context()` kalıyor —
 * yani YÜKLEM YOK.
 *
 * `org_id` TAŞIYAN tablolarda bu görünmüyor: politikaları ayrıca
 * `app.org_kapsaminda(org_id)` yazıyor ve kiracı sınırı oradan geliyor.
 * AMA `insights_daily`, `campaigns`, `ad_groups`, `ads` ve `creatives`
 * `org_id` TAŞIMIYOR (denormalize edilen kolon `client_id`) ve
 * politikaları TEK BAŞINA `can_access_client(client_id)`.
 *
 * İKİ SONUÇ:
 *
 *   1. İZOLASYON — başka bir kiracının metrik satırları görünür hâle
 *      geliyor. 2026-09-10'a kadar pratikte ortaya çıkmadı çünkü Profaj'ın
 *      bütün workspace'leri tek organizasyondaydı; taşımadan sonra 49 ayrı
 *      şirket var.
 *   2. HIZ — yüklem olmayınca `@@index([clientId, date DESC, entityLevel])`
 *      kullanılamıyor (indeks `client_id` ile başlıyor) ve sorgu bütün
 *      kiracıların satırlarını tarıyor. Kullanıcının tarifi "ajans tarafına
 *      tıkladığımda çok bekletiyor" — ve workspace SEÇİLİYKEN beklemiyor,
 *      çünkü orada üçüncü satır yüklemi geri geliyor.
 *
 * Bu paket ikisini de ÖLÇÜYOR: izolasyonu satır sayarak, yüklemi PLANI
 * okuyarak.
 */
let h: Harness;

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaa1111-1111-1111-1111-111111111111';
const CLIENT_B = 'bbbb2222-2222-2222-2222-222222222222';
const HESAP_A = 'aaaa3333-3333-3333-3333-333333333333';
const HESAP_B = 'bbbb4444-4444-4444-4444-444444444444';
const KAMPANYA_A = 'aaaa5555-5555-5555-5555-555555555555';
const KAMPANYA_B = 'bbbb6666-6666-6666-6666-666666666666';
const USER_A = 'aaaa7777-7777-7777-7777-777777777777';
const CONN_A = 'aaaa8888-8888-8888-8888-888888888888';
const CONN_B = 'bbbb9999-9999-9999-9999-999999999999';

const APP_ROLE = 'advetics_insights_izolasyon_test';

interface Ctx {
  orgId: string;
  clientIds: string[];
  activeClientId?: string | null;
  isOrgAdmin?: boolean;
}

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  await h.q(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO ${APP_ROLE}`);
  for (const t of ['insights_daily', 'campaigns']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }

  await h.q(`
    INSERT INTO organizations (id, name, slug, plan, status, created_at, updated_at) VALUES
      ('${ORG_A}', 'A Şirketi', 'a', 'starter', 'active', now(), now()),
      ('${ORG_B}', 'B Şirketi', 'b', 'starter', 'active', now(), now())
  `);
  await h.q(`
    INSERT INTO clients (id, org_id, name, slug, created_at, updated_at) VALUES
      ('${CLIENT_A}', '${ORG_A}', 'A Workspace', 'a-ws', now(), now()),
      ('${CLIENT_B}', '${ORG_B}', 'B Workspace', 'b-ws', now(), now())
  `);
  await h.q(`
    INSERT INTO users (id, org_id, email, full_name, password_hash, locale, status, created_at, updated_at)
    VALUES ('${USER_A}', '${ORG_A}', 'a@x.com', 'A', 'h', 'tr', 'active', now(), now())
  `);
  for (const [conn, org, client] of [
    [CONN_A, ORG_A, CLIENT_A],
    [CONN_B, ORG_B, CLIENT_B],
  ]) {
    await h.q(`
      INSERT INTO platform_connections
        (id, org_id, client_id, platform, status, external_user_id, account_label,
         access_token_enc, granted_scopes, connected_by_user_id, created_at, updated_at)
      VALUES ('${conn}', '${org}', '${client}', 'meta', 'active', 'u', 'L', '\\x00', '{}',
              '${USER_A}', now(), now())
    `);
  }
  for (const [hesap, org, client, conn, ext] of [
    [HESAP_A, ORG_A, CLIENT_A, CONN_A, 'act_a'],
    [HESAP_B, ORG_B, CLIENT_B, CONN_B, 'act_b'],
  ]) {
    await h.q(`
      INSERT INTO ad_accounts
        (id, org_id, client_id, connection_id, platform, external_id, name, currency,
         timezone, sync_enabled, created_at, updated_at)
      VALUES ('${hesap}', '${org}', '${client}', '${conn}', 'meta', '${ext}', 'Hesap',
              'TRY', 'Europe/Istanbul', true, now(), now())
    `);
  }
  for (const [kmp, hesap, client, ext] of [
    [KAMPANYA_A, HESAP_A, CLIENT_A, 'c-a'],
    [KAMPANYA_B, HESAP_B, CLIENT_B, 'c-b'],
  ]) {
    await h.q(`
      INSERT INTO campaigns
        (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, created_at, updated_at)
      VALUES ('${kmp}', '${hesap}', '${client}', 'meta', '${ext}', 'Kampanya', 'active', 'daily', now(), now())
    `);
    await h.q(`
      INSERT INTO insights_daily
        (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
         date, breakdown_key, impressions, clicks, spend_micros, conversions,
         conversion_value_micros, currency, reach)
      VALUES ('${client}', '${hesap}', 'meta', 'campaign', '${kmp}', '${ext}',
              '2026-08-10'::date, '', 100, 10, 1000000, 1, 0, 'TRY', 0)
    `);
  }
});

afterAll(async () => h.close());

async function asCtx<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',            '${ctx.orgId}', false),
           set_config('app.current_user_id',           '${USER_A}', false),
           set_config('app.current_client_ids',        '${ctx.clientIds.join(',')}', false),
           set_config('app.is_org_admin',              '${ctx.isOrgAdmin === false ? 'off' : 'on'}', false),
           set_config('app.current_active_client_id',  '${ctx.activeClientId ?? ''}', false),
           set_config('app.tum_sirketler',             'off', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

/** A şirketinin ORG YÖNETİCİSİ, hiçbir workspace seçili değil. */
const A_YONETICI: Ctx = { orgId: ORG_A, clientIds: [CLIENT_A], activeClientId: null };

describe('tarama boşa düşmüyor', () => {
  it('RLS açık ve iki kiracının da satırı var', async () => {
    const [row] = await h.q<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE relname = 'insights_daily'`,
    );
    expect(row?.relrowsecurity).toBe(true);
    const hepsi = await h.q(`SELECT client_id FROM insights_daily`);
    expect(hepsi).toHaveLength(2);
  });
});

describe('KRİTİK: kiracı izolasyonu', () => {
  it('org yöneticisi BAŞKA KİRACININ metriklerini GÖRMÜYOR', async () => {
    /*
     * Bozuk hâlde iki satır da dönüyor: `is_org_admin()` kısa devresi
     * yüklemi tamamen kaldırıyor ve `insights_daily` `org_id` taşımadığı
     * için ikinci bir sınır YOK.
     */
    const rows = await asCtx<{ client_id: string }>(
      `SELECT client_id FROM insights_daily`,
      A_YONETICI,
    );
    expect(rows.map((r) => r.client_id)).toEqual([CLIENT_A]);
  });

  it('org yöneticisi BAŞKA KİRACININ kampanyalarını GÖRMÜYOR', async () => {
    // `campaigns` de `org_id` taşımıyor — aynı boşluk.
    const rows = await asCtx<{ client_id: string }>(
      `SELECT client_id FROM campaigns`,
      A_YONETICI,
    );
    expect(rows.map((r) => r.client_id)).toEqual([CLIENT_A]);
  });

  it('KENDİ verisini GÖRÜYOR — süzgeç fazla kesmiyor', async () => {
    /*
     * Ters yöndeki hata da gerçek: her şeyi gizleyen bir politika da
     * yukarıdaki iddiaları geçerdi ve panel bomboş kalırdı.
     */
    const rows = await asCtx(`SELECT client_id FROM insights_daily`, A_YONETICI);
    expect(rows).toHaveLength(1);
  });

  it('WORKSPACE SEÇİLİYKEN yalnızca o workspace — bugünkü davranış korunuyor', async () => {
    const rows = await asCtx<{ client_id: string }>(
      `SELECT client_id FROM insights_daily`,
      { ...A_YONETICI, activeClientId: CLIENT_A },
    );
    expect(rows.map((r) => r.client_id)).toEqual([CLIENT_A]);
  });

  it('ORG YÖNETİCİSİ OLMAYAN kullanıcıda davranış DEĞİŞMEDİ', async () => {
    // Bu yol zaten `current_client_ids()` üzerinden süzülüyordu.
    const rows = await asCtx<{ client_id: string }>(`SELECT client_id FROM insights_daily`, {
      orgId: ORG_A,
      clientIds: [CLIENT_A],
      isOrgAdmin: false,
    });
    expect(rows.map((r) => r.client_id)).toEqual([CLIENT_A]);
  });
});

describe('KRİTİK: yüklem PLANA giriyor — indeks kullanılabilsin', () => {
  it('sorgu planı `client_id` üzerinde bir SÜZGEÇ taşıyor', async () => {
    /*
     * ═══ HIZ TARAFI ═══
     *
     * `@@index([clientId, date DESC, entityLevel])` `client_id` ile
     * başlıyor. Yüklem degenere olup ortadan kalkınca indeks
     * kullanılamıyor ve sorgu bütün kiracıların satırlarını tarıyor —
     * "ajans tarafına tıkladığımda çok bekletiyor" tarifinin mekanizması
     * bu.
     *
     * PGlite'ta ZAMAN ÖLÇMÜYORUZ: WASM'daki süre üretimi temsil etmiyor ve
     * iki satırlık bir tabloda planlayıcı zaten seq scan seçer. ÖLÇÜLEN
     * ŞEY, yüklemin plana GİRİP GİRMEDİĞİ — girmiyorsa üretimde indeks
     * ihtimali sıfır.
     */
    const plan = await asCtx<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT client_id FROM insights_daily WHERE date = '2026-08-10'`,
      A_YONETICI,
    );
    const metin = plan.map((r) => r['QUERY PLAN']).join('\n');
    expect(metin.length, 'plan boş — tarama boşa düştü').toBeGreaterThan(10);
    expect(metin).toContain('client_id');
  });
});
