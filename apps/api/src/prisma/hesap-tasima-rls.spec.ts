import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * VERİ TAŞIMASININ RLS POLİTİKALARINDAN GEÇTİĞİ TEST.
 *
 * `ad-account-assign.spec.ts` taşımayı doğruluyor ama RLS'İ HİÇ GÖRMÜYOR:
 * koşum ortamı politikaları kurduktan sonra RLS'i kapatıyor (worker'ın
 * BYPASSRLS rolünü taklit ediyor). Yani orada geçen bir taşıma, üretimde
 * `new row violates row-level security policy` ile düşebilir ve hiçbir test
 * bunu göstermez.
 *
 * BU RİSK VARSAYIMSAL DEĞİL. Aynı sınıftan bir hata `ad_accounts`'ta bir kez
 * yaşandı: UPDATE sonrası YENİ satır tablonun SELECT politikasından da geçmek
 * zorunda ve `can_access_client()` panelde SEÇİLİ müşteriye daraltıyor —
 * atama, satırı kendi görüş alanının dışına taşıdığı için reddediliyordu.
 * Çözüm çağıran taraftaydı: `activeClientId: null`. Taşıma AYNI çağrının
 * içinde ve sekiz tabloya birden yazıyor; aynı tuzağa sekiz kez daha açık.
 *
 * `SET ROLE` ile sahibi olmayan bir role geçiliyor: superuser RLS'i atlıyor,
 * sıradan rol atlamıyor. Böylece politikanın KENDİSİ sınanıyor.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC = '44444444-4444-4444-4444-444444444444';
const CAMP = '55555555-5555-5555-5555-555555555555';
const GRUP = '66666666-6666-6666-6666-666666666666';

const APP_ROLE = 'advetics_tasima_test';

/** Taşınan tabloların hepsi — politikaları tek tek sınanıyor. */
const TASINAN = [
  'campaigns',
  'ad_groups',
  'ads',
  'creatives',
  'insights_daily',
  'keyword_insights',
  'search_term_insights',
  'sync_jobs',
] as const;

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  for (const t of [...TASINAN, 'ad_accounts']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(
    `INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`,
    [ORG],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $3, 'A', 'a', now()), ($2, $3, 'B', 'b', now())`,
    [CLIENT_A, CLIENT_B, ORG],
  );
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1, $2, 'a@advetics.com', 'A', now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'u1', 'BM', '\\x00', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'act_1', 'Hesap', 'TRY', 'Europe/Istanbul', now())`,
    [ACC, ORG, CLIENT_A, CONN],
  );
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES ($1, $2, $3, 'meta', 'c-1', 'Kampanya', now())`,
    [CAMP, ACC, CLIENT_A],
  );
  await h.q(
    `INSERT INTO insights_daily
       (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
        date, breakdown_key, impressions, clicks, spend_micros, conversions,
        conversion_value_micros, currency)
     VALUES ($1, $2, 'meta', 'campaign', $3, 'c-1', current_date, '', 10, 1, 1000, 0, 0, 'TRY')`,
    [CLIENT_A, ACC, CAMP],
  );
  /*
   * SEKİZ TABLONUN HEPSİNE SATIR YAZILIYOR — ve bu testin en önemli kısmı.
   *
   * İlk yazımda yalnızca `campaigns` ve `insights_daily` doluydu. Diğer altı
   * tablodaki UPDATE sıfır satıra dokunuyor, sıfır satırlık bir UPDATE ise
   * politikadan bağımsız olarak BAŞARILI dönüyor. Yani test sekiz tabloyu
   * saydığını sanarken ikisini sınıyordu; `sync_jobs`'un UPDATE politikası
   * hiç olmadığı hâlde yeşildi.
   */
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'g-1', 'Grup', now())`,
    [GRUP, CAMP, ACC, CLIENT_A],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, 'meta', 'a-1', 'Reklam', now())`,
    [GRUP, ACC, CLIENT_A],
  );
  await h.q(
    `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, updated_at)
     VALUES (gen_random_uuid(), $1, $2, 'meta', 'k-1', now())`,
    [ACC, CLIENT_A],
  );
  await h.q(
    `INSERT INTO keyword_insights
       (client_id, ad_account_id, external_criterion_id, keyword, match_type, date, currency)
     VALUES ($1, $2, 'kw-1', 'nakliyat', 'EXACT', current_date, 'TRY')`,
    [CLIENT_A, ACC],
  );
  await h.q(
    `INSERT INTO search_term_insights
       (client_id, ad_account_id, term_hash, search_term, date, currency)
     VALUES ($1, $2, repeat('a', 64), 'evden eve', current_date, 'TRY')`,
    [CLIENT_A, ACC],
  );
  await h.q(
    `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status)
     VALUES ($1, $2, 'structure', 'succeeded')`,
    [CLIENT_A, ACC],
  );
});

interface Ctx {
  clientIds?: string[];
  isOrgAdmin?: boolean;
  activeClientId?: string | null;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',           '${ORG}', false),
           set_config('app.current_user_id',          '${USER}', false),
           set_config('app.current_client_ids',       '${(ctx.clientIds ?? []).join(',')}', false),
           set_config('app.is_org_admin',             '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '${ctx.activeClientId ?? ''}', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

/** Atama uç noktasının kurduğu bağlam: seçim KAPALI. */
const ATAMA_BAGLAMI: Ctx = {
  clientIds: [CLIENT_A, CLIENT_B],
  isOrgAdmin: true,
  activeClientId: null,
};

/**
 * Taşımayı koşar ve GERÇEKTEN taşınan satırların kimliğini döndürür.
 *
 * `RETURNING` şart: politikası olmayan bir tabloda UPDATE hata vermiyor,
 * sessizce SIFIR satıra dokunuyor. "Patlamadı" burada bir kanıt değil.
 */
async function tasi(ctx: Ctx, tablo: string): Promise<unknown[]> {
  return asUser(
    `UPDATE ${tablo} SET client_id = '${CLIENT_B}'
      WHERE ad_account_id = '${ACC}' AND client_id IS DISTINCT FROM '${CLIENT_B}'
      RETURNING client_id`,
    ctx,
  );
}

describe('veri taşıması — RLS politikaları', () => {
  it('KRİTİK: taşıma atama bağlamında SEKİZ tabloda da SATIR TAŞIYOR', async () => {
    /*
     * "Patlamadı" YETERLİ DEĞİL. UPDATE politikası olmayan bir tabloda
     * Postgres hata vermiyor, satırı sessizce görmüyor — `sync_jobs`'ta tam
     * olarak bu oluyordu (yalnızca SELECT ve INSERT politikası vardı).
     * Sessiz sıfır, bu projedeki en pahalı hata türü.
     */
    for (const t of TASINAN) {
      const tasinanlar = await tasi(ATAMA_BAGLAMI, t);
      expect(tasinanlar, `${t}: politika taşımayı SESSİZCE yuttu`).toHaveLength(1);
    }
  });

  it('KRİTİK: aktif müşteri SEÇİLİYKEN taşıma REDDEDİLİYOR', async () => {
    /*
     * `activeClientId` kapatılmazsa `can_access_client(B)` FALSE dönüyor —
     * seçili müşteri A. Bu, atama uç noktasının `activeClientId: null`
     * kurmasının SEBEBİ ve o satır silinirse burası düşmeli.
     *
     * Postgres'in mesajı: "new row violates row-level security policy".
     */
    await expect(
      tasi({ clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true, activeClientId: CLIENT_A }, 'campaigns'),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: erişemediği müşteriye taşıma yapılamıyor', async () => {
    // Org yöneticisi olmayan bir kullanıcı B'ye erişemiyorsa, satırı oraya
    // taşımak yetki yükseltmesi olurdu.
    await expect(
      tasi({ clientIds: [CLIENT_A], isOrgAdmin: false, activeClientId: null }, 'campaigns'),
    ).rejects.toThrow(/row-level security/i);
  });

  it('insights_daily PARTITION üzerinden de taşınıyor', async () => {
    /*
     * `insights_daily` partition'lı ve politikası ANA tabloda tanımlı;
     * `03_partitions.sql` her partition'a AYRICA yalnızca SELECT politikası
     * ekliyor. Ana tablo üzerinden yapılan UPDATE'in reddedilip
     * reddedilmediği yalnızca gerçek Postgres'te görülebiliyor.
     */
    await tasi(ATAMA_BAGLAMI, 'insights_daily');
    const rows = await h.q<{ client_id: string }>(
      'SELECT client_id FROM insights_daily WHERE ad_account_id = $1',
      [ACC],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.client_id).toBe(CLIENT_B);
  });
});
