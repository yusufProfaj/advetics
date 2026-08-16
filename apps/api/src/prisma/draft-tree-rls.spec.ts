import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * Kampanya taslağı ağacı — politikalar GERÇEKTEN uygulanıyor mu.
 *
 * `ad-account-pool-rls.spec.ts` deseni: koşum ortamı politikaları kurduktan
 * sonra RLS'i kapatıyor, bu yüzden normal testler bir boşluğu göremiyor.
 * `SET ROLE` ile tabloların sahibi olmayan bir role geçiliyor.
 *
 * BU AĞAÇTA ÖZEL BİR RİSK VAR: çocuk tablolarda `client_id` KOLONU YOK.
 * Müşteri bilgisi yalnızca kampanyada duruyor ve erişim kontrolü iki seviye
 * yukarı JOIN ile kuruluyor. Zincirin bir halkası unutulursa (örneğin
 * `draft_ads` yalnızca `org_id`'ye bakarsa) org içindeki bütün taslak
 * reklamlar birbirine açılır — ve bu SESSİZ olur: hata yok, yalnızca liste
 * beklenenden uzun.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC_A = '44444444-4444-4444-4444-444444444444';
const ACC_B = '55555555-5555-5555-5555-555555555555';

const CREATIVE_A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const CREATIVE_B = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const CAMP_A = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const CAMP_B = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';
const GRP_A = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
const GRP_B = 'f1f1f1f1-f1f1-f1f1-f1f1-f1f1f1f1f1f1';
const AD_A = '0a0a0a0a-0a0a-0a0a-0a0a-0a0a0a0a0a0a';
const AD_B = '0b0b0b0b-0b0b-0b0b-0b0b-0b0b0b0b0b0b';

const APP_ROLE = 'advetics_draft_tree_rls_test';

beforeAll(async () => {
  h = await createHarness();

  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);

  for (const t of ['draft_campaigns', 'draft_ad_groups', 'draft_ads']) {
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
     VALUES ($1, $2, NULL, 'meta', 'active', 'u1', 'Ajans BM', '\\x00', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1, $3, $4, $6, 'meta', 'act_a', 'A hesabı', 'TRY', 'Europe/Istanbul', now()),
            ($2, $3, $5, $6, 'meta', 'act_b', 'B hesabı', 'TRY', 'Europe/Istanbul', now())`,
    [ACC_A, ACC_B, ORG, CLIENT_A, CLIENT_B, CONN],
  );
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $3, $4, 'A kreatifi', '{}'::jsonb, now()),
            ($2, $3, $5, 'B kreatifi', '{}'::jsonb, now())`,
    [CREATIVE_A, CREATIVE_B, ORG, CLIENT_A, CLIENT_B],
  );
  await h.q(
    `INSERT INTO draft_campaigns
       (id, org_id, client_id, platform, ad_account_id, name, goal,
        budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $3, $4, 'meta', $6, 'A kampanyası', 'whatsapp', 'daily', 200000000, now()),
            ($2, $3, $5, 'meta', $7, 'B kampanyası', 'whatsapp', 'daily', 200000000, now())`,
    [CAMP_A, CAMP_B, ORG, CLIENT_A, CLIENT_B, ACC_A, ACC_B],
  );
  await h.q(
    `INSERT INTO draft_ad_groups (id, org_id, campaign_id, name, updated_at)
     VALUES ($1, $3, $4, 'A grubu', now()), ($2, $3, $5, 'B grubu', now())`,
    [GRP_A, GRP_B, ORG, CAMP_A, CAMP_B],
  );
  await h.q(
    `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, updated_at)
     VALUES ($1, $3, $4, $6, 'A reklamı', now()), ($2, $3, $5, $7, 'B reklamı', now())`,
    [AD_A, AD_B, ORG, GRP_A, GRP_B, CREATIVE_A, CREATIVE_B],
  );
});

interface Ctx {
  clientIds?: string[];
  isOrgAdmin?: boolean;
  orgId?: string | null;
}

async function asUser<T = Record<string, unknown>>(sql: string, ctx: Ctx): Promise<T[]> {
  const orgId = ctx.orgId === undefined ? ORG : (ctx.orgId ?? '');
  await h.q(`
    SELECT set_config('app.current_org_id',           '${orgId}', false),
           set_config('app.current_user_id',          '${orgId ? USER : ''}', false),
           set_config('app.current_client_ids',       '${(ctx.clientIds ?? []).join(',')}', false),
           set_config('app.is_org_admin',             '${ctx.isOrgAdmin ? 'on' : 'off'}', false),
           set_config('app.current_active_client_id', '', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

const HEPSI: Ctx = { clientIds: [CLIENT_A, CLIENT_B], isOrgAdmin: true };
const ONLY_A: Ctx = { clientIds: [CLIENT_A], isOrgAdmin: false };

async function names(table: string, ctx: Ctx): Promise<string[]> {
  const rows = await asUser<{ name: string }>(`SELECT name FROM ${table} ORDER BY name`, ctx);
  return rows.map((r) => r.name);
}

describe('ağacın üç seviyesi de süzülüyor', () => {
  it('kampanya — yalnızca yetkili müşterininki', async () => {
    expect(await names('draft_campaigns', HEPSI)).toEqual(['A kampanyası', 'B kampanyası']);
    expect(await names('draft_campaigns', ONLY_A)).toEqual(['A kampanyası']);
  });

  it('KRİTİK: reklam grubu KAMPANYA üzerinden süzülüyor', async () => {
    // Grupta `client_id` kolonu yok; kontrol tek seviye yukarıdan geliyor.
    // Zincir kopsaydı B müşterisinin grubu da görünürdü.
    expect(await names('draft_ad_groups', ONLY_A)).toEqual(['A grubu']);
  });

  it('KRİTİK: reklam İKİ SEVİYE yukarıdan süzülüyor', async () => {
    // reklam → grup → kampanya. Zincirin kısaltılması org içindeki bütün
    // taslak reklamları birbirine açardı ve bu sessiz olurdu.
    expect(await names('draft_ads', ONLY_A)).toEqual(['A reklamı']);
  });

  it('BAĞLAM YOKSA HİÇBİR SATIR — üç seviyede de', async () => {
    const bos: Ctx = { orgId: null, clientIds: [] };
    expect(await names('draft_campaigns', bos)).toEqual([]);
    expect(await names('draft_ad_groups', bos)).toEqual([]);
    expect(await names('draft_ads', bos)).toEqual([]);
  });
});

describe('yazma politikaları', () => {
  it('KRİTİK: başka müşterinin kampanyasına grup EKLENEMİYOR', async () => {
    /**
     * Okuma engelli ama yazma açık kalsaydı, bir kullanıcı göremediği bir
     * kampanyaya reklam grubu ekleyebilirdi — ve o grup yayına çıkıp para
     * harcardı. Sahibi de kimin eklediğini göremezdi.
     */
    await expect(
      asUser(
        `INSERT INTO draft_ad_groups (id, org_id, campaign_id, name, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', '${CAMP_B}', 'Sızıntı', now())`,
        ONLY_A,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('KRİTİK: başka müşterinin grubuna reklam EKLENEMİYOR', async () => {
    await expect(
      asUser(
        `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, updated_at)
         VALUES (gen_random_uuid(), '${ORG}', '${GRP_B}', '${CREATIVE_A}', 'Sızıntı', now())`,
        ONLY_A,
      ),
    ).rejects.toThrow(/row-level security/i);
  });

  it('yetkili müşterinin ağacına yazılabiliyor', async () => {
    await asUser(
      `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, position, updated_at)
       VALUES (gen_random_uuid(), '${ORG}', '${GRP_A}', '${CREATIVE_A}', 'Varyant B', 1, now())`,
      ONLY_A,
    );
    expect(await names('draft_ads', ONLY_A)).toEqual(['A reklamı', 'Varyant B']);
  });

  it('başka müşterinin kampanyası güncellenemiyor', async () => {
    await asUser(
      `UPDATE draft_campaigns SET name = 'Ele geçirildi' WHERE id = '${CAMP_B}'`,
      ONLY_A,
    );
    // Politika satırı eşleştirmiyor: hata yok ama satır da değişmiyor.
    expect(await names('draft_campaigns', HEPSI)).toEqual(['A kampanyası', 'B kampanyası']);
  });
});
