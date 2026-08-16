import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * Kampanya taslağı ağacı — şema ve kısıtlar.
 *
 * BU PAKETİN ASIL SORUSU: ağaç "Meta çıktı, Google düştü" durumunu ifade
 * edebiliyor mu? Bugünkü `ad_drafts` edemiyor — tek `status`, tek `error`,
 * tek dış kimlik. Tasarım belgesinin K13 kararının bütün gerekçesi bu ve
 * doğrulanmadan şema doğru sayılamaz.
 *
 * Geri kalanı kısıtlar. Hepsi bir sessiz hatanın karşılığı: bütçesiz
 * kampanya, sebepsiz başarısızlık, kimliksiz "yayında" kaydı.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONN = '33333333-3333-3333-3333-333333333333';
const ACC_META = '44444444-4444-4444-4444-444444444444';
const ACC_GOOGLE = '55555555-5555-5555-5555-555555555555';
const CREATIVE = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

/** Aynı niyetin iki platformdaki eşini bağlayan kimlik. */
const GROUP = '99999999-9999-9999-9999-999999999999';

beforeAll(async () => {
  h = await createHarness();
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
    `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'A', 'a', now())`,
    [CLIENT, ORG],
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
     VALUES ($1, $3, $4, $5, 'meta',   'act_meta', 'Meta hesabı',   'TRY', 'Europe/Istanbul', now()),
            ($2, $3, $4, $5, 'google', '1695129827', 'Google hesabı', 'TRY', 'Europe/Istanbul', now())`,
    [ACC_META, ACC_GOOGLE, ORG, CLIENT, CONN],
  );
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $2, $3, 'Yaz kreatifi', '{"headlines":["Yaz indirimi"]}'::jsonb, now())`,
    [CREATIVE, ORG, CLIENT],
  );
});

async function campaign(
  id: string,
  patch: Record<string, unknown> = {},
): Promise<void> {
  const row = {
    platform: 'meta',
    ad_account_id: ACC_META,
    group_id: null,
    name: 'Yaz Kampanyası',
    surface: 'simple',
    goal: 'whatsapp',
    budget_mode: 'daily',
    budget_amount_micros: '200000000',
    status: 'draft',
    end_at: null,
    error: null,
    external_campaign_id: null,
    published_at: null,
    ...patch,
  };
  await h.q(
    `INSERT INTO draft_campaigns
       (id, org_id, client_id, group_id, platform, ad_account_id, name, surface, goal,
        budget_mode, budget_amount_micros, end_at, status, external_campaign_id,
        error, published_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::"Platform", $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, now())`,
    [
      id,
      ORG,
      CLIENT,
      row.group_id,
      row.platform,
      row.ad_account_id,
      row.name,
      row.surface,
      row.goal,
      row.budget_mode,
      row.budget_amount_micros,
      row.end_at,
      row.status,
      row.external_campaign_id,
      row.error,
      row.published_at,
    ],
  );
}

describe('KISMİ BAŞARI — K13 kararının sınavı', () => {
  it('aynı grup, iki platform, İKİ AYRI DURUM', async () => {
    /**
     * Bu testin geçmesi şemanın var oluş sebebi.
     *
     * Kullanıcı "siteme ziyaretçi gelsin" dedi, ikisine birden çıktık: Meta
     * yayınlandı, Google reddedildi. Bu istisna değil normal sonuç — iki API,
     * iki onay süreci, iki politika motoru.
     *
     * Tek satırlık modelde bu durumu yazmanın yolu yok: "başarısız" demek
     * yayındaki Meta reklamını gizler, "yayında" demek hiç oluşmamış Google
     * kampanyasını var gösterir.
     */
    await campaign('c0000000-0000-0000-0000-000000000001', {
      group_id: GROUP,
      platform: 'meta',
      ad_account_id: ACC_META,
      status: 'published',
      external_campaign_id: '120000000000001',
      published_at: new Date().toISOString(),
    });
    await campaign('c0000000-0000-0000-0000-000000000002', {
      group_id: GROUP,
      platform: 'google',
      ad_account_id: ACC_GOOGLE,
      status: 'failed',
      error: 'Google Ads reklam oluşturma henüz yazılmadı.',
    });

    const rows = await h.q<{ platform: string; status: string; error: string | null }>(
      `SELECT platform::text AS platform, status, error
       FROM draft_campaigns WHERE group_id = $1 ORDER BY platform`,
      [GROUP],
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.platform, r.status])).toEqual([
      ['google', 'failed'],
      ['meta', 'published'],
    ]);
    // Düşen tarafın sebebi kendi satırında — tek başına yeniden denenebilmesi
    // için gereken bilgi bu.
    expect(rows[0]!.error).toContain('henüz yazılmadı');
  });

  it('grup kimliği OPSİYONEL — tek platformluk taslak normal', async () => {
    // WhatsApp'ın Google'da karşılığı yok; her taslağı gruba zorlamak, olmayan
    // bir eşi varmış gibi göstermek olurdu.
    await campaign('c0000000-0000-0000-0000-000000000003');
    const [row] = await h.q<{ group_id: string | null }>(
      `SELECT group_id FROM draft_campaigns WHERE id = $1`,
      ['c0000000-0000-0000-0000-000000000003'],
    );
    expect(row!.group_id).toBeNull();
  });
});

describe('bütçe kısıtları', () => {
  it('mod ile tutar BİRLİKTE gider — tutarsız satır reddediliyor', async () => {
    // Modu 'daily' olup tutarı NULL olan satır, yayın anında bütçesiz kampanya
    // demek; Meta reddediyor ama hangi alanın eksik olduğunu söylemiyor.
    await expect(
      campaign('c0000000-0000-0000-0000-000000000004', {
        budget_mode: 'daily',
        budget_amount_micros: null,
      }),
    ).rejects.toThrow(/draft_campaigns_budget_chk/);
  });

  it("modu 'none' iken duran tutar reddediliyor", async () => {
    // Kullanıcının girdiği ama hiçbir yere gitmeyen bir sayı — sessiz.
    await expect(
      campaign('c0000000-0000-0000-0000-000000000005', {
        budget_mode: 'none',
        budget_amount_micros: '100000000',
      }),
    ).rejects.toThrow(/draft_campaigns_budget_chk/);
  });

  it('sıfır bütçe reddediliyor', async () => {
    await expect(
      campaign('c0000000-0000-0000-0000-000000000006', { budget_amount_micros: '0' }),
    ).rejects.toThrow(/draft_campaigns_budget_chk/);
  });

  it('KRİTİK: toplam bütçede bitiş tarihi ZORUNLU', async () => {
    // Meta bütçeyi süreye bölüyor; süre yoksa bölecek bir şey de yok ve ad set
    // hiç dağıtım yapmıyor. Sessiz sıfır harcama.
    await expect(
      campaign('c0000000-0000-0000-0000-000000000007', {
        budget_mode: 'lifetime',
        end_at: null,
      }),
    ).rejects.toThrow(/draft_campaigns_lifetime_end_chk/);
  });

  it('bitişi verilen toplam bütçe kabul ediliyor', async () => {
    await campaign('c0000000-0000-0000-0000-000000000008', {
      budget_mode: 'lifetime',
      end_at: new Date('2026-09-01T00:00:00Z').toISOString(),
    });
    const rows = await h.q(`SELECT id FROM draft_campaigns WHERE budget_mode = 'lifetime'`);
    expect(rows).toHaveLength(1);
  });
});

describe('durum kısıtları', () => {
  it('SEBEPSİZ başarısızlık reddediliyor', async () => {
    // "Çalışmadı"dan fazlasını söylemeyen bir kayıt, kullanıcıya yapacak bir
    // şey bırakmıyor.
    await expect(
      campaign('c0000000-0000-0000-0000-000000000009', { status: 'failed', error: null }),
    ).rejects.toThrow(/draft_campaigns_error_chk/);
  });

  it('KİMLİKSİZ "yayında" kaydı reddediliyor', async () => {
    // Panelde çalışıyor görünen ama platformda bulunamayan bir harcama.
    await expect(
      campaign('c0000000-0000-0000-0000-000000000010', {
        status: 'published',
        external_campaign_id: null,
        published_at: new Date().toISOString(),
      }),
    ).rejects.toThrow(/draft_campaigns_published_chk/);
  });

  it('uzman yüzeyinde hedef NULL olabiliyor', async () => {
    // Uzman hedefi değil, platformun amacını doğrudan seçiyor.
    await campaign('c0000000-0000-0000-0000-000000000011', {
      surface: 'expert',
      goal: null,
    });
    const [row] = await h.q<{ goal: string | null }>(
      `SELECT goal FROM draft_campaigns WHERE surface = 'expert'`,
    );
    expect(row!.goal).toBeNull();
  });

  it('tanınmayan hedef reddediliyor', async () => {
    await expect(
      campaign('c0000000-0000-0000-0000-000000000012', { goal: 'satis' }),
    ).rejects.toThrow(/draft_campaigns_goal_chk/);
  });
});

describe('ağaç ilişkileri', () => {
  const CAMP = 'c0000000-0000-0000-0000-0000000000aa';
  const GROUP_ROW = 'c0000000-0000-0000-0000-0000000000bb';
  const AD = 'c0000000-0000-0000-0000-0000000000cc';

  beforeEach(async () => {
    await campaign(CAMP);
    await h.q(
      `INSERT INTO draft_ad_groups (id, org_id, campaign_id, name, updated_at)
       VALUES ($1, $2, $3, 'Grup 1', now())`,
      [GROUP_ROW, ORG, CAMP],
    );
    await h.q(
      `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, updated_at)
       VALUES ($1, $2, $3, $4, 'Varyant A', now())`,
      [AD, ORG, GROUP_ROW, CREATIVE],
    );
  });

  it('aynı gruba İKİNCİ kreatif eklenebiliyor — A/B mümkün', async () => {
    /**
     * Bu tablonun varlık sebebi. Bugün bir taslak tek bir reklam demek ve aynı
     * reklam grubuna ikinci bir deneme eklemenin yolu yok; ajans pratiğinde
     * grup başına 3-5 kreatif standart.
     */
    const ikinci = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1b2';
    await h.q(
      `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
       VALUES ($1, $2, $3, 'İkinci kreatif', '{}'::jsonb, now())`,
      [ikinci, ORG, CLIENT],
    );
    await h.q(
      `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, position, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'Varyant B', 1, now())`,
      [ORG, GROUP_ROW, ikinci],
    );

    const rows = await h.q(`SELECT id FROM draft_ads WHERE ad_group_id = $1`, [GROUP_ROW]);
    expect(rows).toHaveLength(2);
  });

  it('KRİTİK: kullanımdaki kreatif SİLİNEMİYOR', async () => {
    /**
     * Cascade olsaydı kütüphaneden bir kreatifi silmek, ona bağlı taslak
     * reklamları sessizce yok ederdi — kullanıcı kütüphaneyi topluyor sanır,
     * kampanyası eksilir.
     */
    await expect(h.q(`DELETE FROM ad_creatives WHERE id = $1`, [CREATIVE])).rejects.toThrow(
      /draft_ads_creative_id_fkey|violates foreign key/i,
    );
  });

  it('kampanya silinince ağacın tamamı gidiyor', async () => {
    await h.q(`DELETE FROM draft_campaigns WHERE id = $1`, [CAMP]);
    expect(await h.q(`SELECT id FROM draft_ad_groups`)).toHaveLength(0);
    expect(await h.q(`SELECT id FROM draft_ads`)).toHaveLength(0);
    // Kreatif KALIYOR: kütüphaneye ait, kampanyaya değil.
    expect(await h.q(`SELECT id FROM ad_creatives`)).toHaveLength(1);
  });

  it('reklam grubunun bütçesi de kısıtlı', async () => {
    await expect(
      h.q(
        `INSERT INTO draft_ad_groups
           (id, org_id, campaign_id, name, budget_mode, budget_amount_micros, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'Grup 2', 'daily', NULL, now())`,
        [ORG, CAMP],
      ),
    ).rejects.toThrow(/draft_ad_groups_budget_chk/);
  });
});
