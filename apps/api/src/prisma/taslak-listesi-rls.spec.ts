import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ KAMPANYA LİSTESİ, HESABI EL DEĞİŞTİRİNCE SATIR KAYBEDİYOR ═══
 *
 * Rapor planı ve fatura listelerinde ölçülen hatanın aynısı, başka bir
 * tabloda: kampanya sorgusu `JOIN ad_accounts` taşıyor ve `ad_accounts`
 * politikası ATANMIŞ satırı aktif workspace'e daraltıyor
 * (`can_access_client`). Reklam hesabı bir başka workspace'e taşınınca
 * (ki bu üründe normal bir işlem, `hesap-verisi-tasima.ts`) o hesapla
 * kurulmuş YAYINDAKİ kampanya listeden sessizce kayboluyor.
 *
 * Kampanya satırının kendisi erişilebilir durumda; onu eleyen şey yalnızca
 * süsleme için yapılan join (hesabın ADI).
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CONN = '33333333-3333-3333-3333-333333333333';
const CLIENT_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HESAP = '44444444-4444-4444-4444-444444444444';
const KAMPANYA = '55555555-5555-5555-5555-555555555555';

const APP_ROLE = 'advetics_taslak_rls_test';

beforeAll(async () => {
  h = await createHarness();
  await h.q(`CREATE ROLE ${APP_ROLE} NOLOGIN`);
  await h.q(`GRANT USAGE ON SCHEMA public, app TO ${APP_ROLE}`);
  await h.q(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${APP_ROLE}`);
  for (const t of ['ad_accounts', 'draft_campaigns']) {
    await h.q(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
  }
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1,'Ajans','ajans',now())`, [ORG]);
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at)
     VALUES ($1,$2,'a@advetics.com','A',now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1,$3,'A','a',now()), ($2,$3,'B','b',now())`,
    [CLIENT_A, CLIENT_B, ORG],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1,$2,NULL,'meta','active','u1','Ajans BM','\\x00','{}',$3,now())`,
    [CONN, ORG, USER],
  );
  /*
   * HESAP ARTIK B WORKSPACE'İNDE. Kampanya A'da kuruldu ve yayınlandı;
   * hesap sonradan taşındı. Panelde A seçili.
   */
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'meta','act_1','Hesap','TRY','Europe/Istanbul',true,now())`,
    [HESAP, ORG, CLIENT_B, CONN],
  );
  await h.q(
    `INSERT INTO draft_campaigns
       (id, org_id, client_id, ad_account_id, platform, surface, goal, name,
        settings, status, external_campaign_id, published_at, created_by, updated_at)
     VALUES ($1,$2,$3,$4,'meta','simple','website','Yaz kampanyası',
             '{}'::jsonb,'published','23842',now(),$5,now())`,
    [KAMPANYA, ORG, CLIENT_A, HESAP, USER],
  );
});

/** Panelde A workspace'i seçili org yöneticisi. */
async function panelde<T = Record<string, unknown>>(sql: string): Promise<T[]> {
  await h.q(`
    SELECT set_config('app.current_org_id',           '${ORG}', false),
           set_config('app.current_user_id',          '${USER}', false),
           set_config('app.current_client_ids',       '${CLIENT_A},${CLIENT_B}', false),
           set_config('app.is_org_admin',             'on', false),
           set_config('app.current_active_client_id', '${CLIENT_A}', false),
           set_config('app.tum_sirketler',            'off', false)
  `);
  await h.q(`SET ROLE ${APP_ROLE}`);
  try {
    return await h.q<T>(sql);
  } finally {
    await h.q('RESET ROLE');
  }
}

/**
 * Servisin KENDİ kampanya sorgusunu çıkarır.
 *
 * Sorguyu teste kopyalamak işe yaramaz: kopya düzeltilmiş hâli taşır ve
 * servis eski hâlinde kalsa bile test yeşil geçerdi.
 */
function servisSorgusu(): string {
  const kaynak = readFileSync(
    join(__dirname, '..', 'modules', 'draft-tree', 'draft-tree.service.ts'),
    'utf8',
  );
  const bas = kaynak.indexOf('private async selectTree');
  if (bas === -1) throw new Error('selectTree bulunamadı — tarama boşa düştü');
  const im = 'Prisma.sql`';
  const sqlBas = kaynak.indexOf(im, bas);
  const sqlSon = kaynak.indexOf('`', sqlBas + im.length);
  const sql = kaynak.slice(sqlBas + im.length, sqlSon);
  if (!sql.includes('draft_campaigns')) throw new Error('yanlış sorgu yakalandı');
  return sql.replace(
    '${where}',
    `c.org_id = '${ORG}'::uuid AND c.client_id = '${CLIENT_A}'::uuid`,
  );
}

describe('ÖLÇÜM', () => {
  it('kampanya satırı TABLODA görünüyor', async () => {
    const rows = await panelde(
      `SELECT id::text FROM draft_campaigns WHERE client_id = '${CLIENT_A}'::uuid`,
    );
    expect(rows).toHaveLength(1);
  });

  it('KRİTİK: başka workspace’e taşınmış hesap GÖRÜNMÜYOR', async () => {
    // Politikanın kendisi doğru: A seçiliyken B'nin hesabı okunamaz.
    const rows = await panelde(`SELECT id::text FROM ad_accounts`);
    expect(rows).toHaveLength(0);
  });
});

describe('REGRESYON: servisin gerçek sorgusu', () => {
  it('KRİTİK: hesabı taşınmış kampanya LİSTEDEN DÜŞMÜYOR', async () => {
    /*
     * Kullanıcı kampanyayı A workspace'inde kurdu ve yayınladı. Hesap
     * sonradan B'ye taşındı. Kampanya A'nın listesinde durmaya devam
     * etmeli: platformda çalışan, para harcayan bir kampanya panelden
     * sessizce kaybolamaz.
     */
    const rows = await panelde(servisSorgusu());
    expect(rows, 'kampanya listeden düştü — join yine süzüyor').toHaveLength(1);
  });

  it('görünmeyen hesap ADI BOŞ bırakıyor, satırı düşürmüyor', async () => {
    /*
     * SATIR SAYISI ÖNCE. İlk yazımda yalnızca adın NULL olduğuna bakıyordu
     * ve satır HİÇ gelmediğinde de geçiyordu (`rows[0]?.x ?? null`): bozuk
     * kodda yeşil kalan bir iddia, olmayan bir iddiadır.
     */
    const rows = await panelde<{ ad_account_name: string | null }>(servisSorgusu());
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ad_account_name).toBeNull();
  });
});
