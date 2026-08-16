import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { DraftPublishService } from './draft-publish.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * Ağaçtan boost yayını — `createBoost` yolu.
 *
 * NEDEN AYRI VE NEDEN ŞİMDİ: `publishBoost` bugüne kadar HİÇ test edilmiyordu
 * ve tutarı koşulsuz GÜNLÜK bütçe sayıyordu. Bu bugüne kadar doğru sonuç
 * veriyordu, çünkü boost ağacına yazan tek yol kural yürütücüsüydü ve o hep
 * `budget_mode = 'daily'` yazıyor.
 *
 * Elle boost TOPLAM bütçe yazacak (K18) ve o gün bu satır sessizce yanlış
 * olurdu: kullanıcının "300 TL, 5 gün" dediği bir boost, günlük 300 TL olarak
 * beş gün çalışır ve 1.500 TL harcardı. Hiçbir hata çıkmaz — Meta günlük
 * 300 TL'yi sorgusuz kabul eder.
 */

let h: Harness;
let tree: DraftTreeService;
let svc: DraftPublishService;

const createBoost = vi.fn();
const publishDraft = vi.fn();
const canWrite = vi.fn();

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PAGE = '66666666-6666-6666-6666-666666666666';
const POST = '55555555-5555-5555-5555-555555555555';
const CAMPAIGN = '44444444-4444-4444-4444-444444444444';
const GROUP = '43434343-4343-4343-4343-434343434343';
const AD = '42424242-4242-4242-4242-424242424242';

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;

  tree = new DraftTreeService(prisma);
  svc = new DraftPublishService(
    prisma,
    tree,
    { get: () => ({ platform: 'meta', createBoost, publishDraft, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
    { ensureExternalRef: vi.fn() } as never,
  );
});

afterAll(async () => {
  await h.close();
});

/**
 * Yayına hazır bir boost ağacı kurar.
 *
 * `draft_ads.organic_post_id` dolu ve `creative_id` boş — boost edilen
 * gönderinin metni ve görseli zaten Meta'da, kreatif kütüphanesinde karşılığı
 * yok. `publish` bu ayrımdan boost olduğunu anlıyor.
 */
async function seedBoostTree(
  budgetMode: 'daily' | 'lifetime',
  budgetMicros: string,
): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', now())`,
    [PAGE, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO organic_posts
       (id, org_id, client_id, social_profile_id, external_id, media_type,
        published_at, updated_at)
     VALUES ($1, $2, $3, $4, 'post-abcdefgh', 'photo', now() - interval '2 days', now())`,
    [POST, IDS.org, IDS.client, PAGE],
  );
  await h.q(
    `INSERT INTO draft_campaigns
       (id, org_id, client_id, platform, ad_account_id, name, surface, goal, settings,
        budget_mode, budget_amount_micros, end_at, status, source, updated_at)
     VALUES ($1, $2, $3, 'meta', $4, 'Boost — gönderi', 'simple', NULL,
             '{"objective":"OUTCOME_ENGAGEMENT"}'::jsonb, $5, $6::bigint,
             now() + interval '5 days', 'draft', 'manual', now())`,
    [CAMPAIGN, IDS.org, IDS.client, IDS.adAccount, budgetMode, budgetMicros],
  );
  // Grup ve reklamda `client_id` YOK: kiracılığı kampanya üzerinden
  // taşıyorlar ve RLS de iki seviye yukarıdan süzüyor.
  await h.q(
    `INSERT INTO draft_ad_groups
       (id, org_id, campaign_id, name, position, social_profile_id, updated_at)
     VALUES ($1, $2, $3, 'Boost grubu', 0, $4, now())`,
    [GROUP, IDS.org, CAMPAIGN, PAGE],
  );
  await h.q(
    `INSERT INTO draft_ads
       (id, org_id, ad_group_id, name, position, creative_id,
        organic_post_id, updated_at)
     VALUES ($1, $2, $3, 'Boost reklamı', 0, NULL, $4, now())`,
    [AD, IDS.org, GROUP, POST],
  );
}

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  createBoost.mockReset();
  publishDraft.mockReset();
  canWrite.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  createBoost.mockResolvedValue({
    externalCampaignId: 'c-1',
    externalAdSetId: 'as-1',
    externalAdId: 'ad-1',
  });
});

describe('boost ağaçtan yayınlanıyor', () => {
  it('`createBoost` çağrılıyor, `publishDraft` DEĞİL', () => {
    // Boost edilen gönderinin metni ve görseli zaten Meta'da; `publishDraft`
    // bir kreatif kurmaya çalışır ve elinde kreatif yoktur.
    return seedBoostTree('daily', '100000000')
      .then(() => svc.publish(CTX, CAMPAIGN))
      .then(() => {
        expect(createBoost).toHaveBeenCalledTimes(1);
        expect(publishDraft).not.toHaveBeenCalled();
      });
  });

  it('KRİTİK: `daily` kipte GÜNLÜK bütçe gönderiliyor', async () => {
    await seedBoostTree('daily', '100000000');
    await svc.publish(CTX, CAMPAIGN);

    expect(createBoost.mock.calls[0]![1].budget).toEqual({
      mode: 'daily',
      dailyMicros: 100_000_000n,
    });
  });

  it('KRİTİK: `lifetime` kipte TOPLAM bütçe gönderiliyor', async () => {
    // Bu satır yazılmadan önce burası tutarı koşulsuz günlük sayıyordu:
    // 300 TL'lik toplam, günlük 300 TL olarak beş gün harcanırdı.
    await seedBoostTree('lifetime', '300000000');
    await svc.publish(CTX, CAMPAIGN);

    expect(createBoost.mock.calls[0]![1].budget).toEqual({
      mode: 'lifetime',
      totalMicros: 300_000_000n,
    });
  });

  it('süre BİTİŞ TARİHİNDEN türüyor', async () => {
    await seedBoostTree('lifetime', '300000000');
    await svc.publish(CTX, CAMPAIGN);
    expect(createBoost.mock.calls[0]![1].durationDays).toBe(5);
  });

  it('yayın sonrası kampanya `published` ve platform kimliklerini taşıyor', async () => {
    await seedBoostTree('daily', '100000000');
    await svc.publish(CTX, CAMPAIGN);

    const [row] = await h.q<{ status: string; external_campaign_id: string }>(
      `SELECT status, external_campaign_id FROM draft_campaigns WHERE id = $1`,
      [CAMPAIGN],
    );
    expect(row!.status).toBe('published');
    expect(row!.external_campaign_id).toBe('c-1');
  });
});
