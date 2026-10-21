import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualBoostInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
 * MCP BOOST'U — DURAKLATILMIŞ KURULUM (`docs/okuma-api/MCP-BOOST-MIMARI.md`).
 *
 * Panelin elle boost'uyla AYNI yürütücüden geçiyor; burada sınanan farklar:
 * Meta'ya duraklatma ve hedef gidiyor, harcama başlangıcı BOŞ kalıyor,
 * günlük bütçe günlük kalıyor ve panel yolu DEĞİŞMİYOR.
 *
 * Aşağıdaki kurulum `manual-boost.spec.ts`ten (aynı sahte sağlayıcı).
 *
 * ELLE BOOST — gönderi seç, bütçe ver, yayınla.
 *
 * BU YOL ARA ONAY OLMADAN PARA HARCIYOR ve testlerin çoğu tam olarak bunu
 * koruyor. Kural yolunda yanlış bir aday onay ekranında yakalanabiliyor;
 * burada yakalayacak kimse yok, düğmeye basıldığı anda Meta'ya gidiyor.
 *
 * ÜÇ İDDİA EN KRİTİK:
 *
 *   1. TOPLAM bütçe toplam olarak gidiyor (K18). Günlük sayılırsa 300 TL'lik
 *      bir boost beş günde 1.500 TL harcar ve hiçbir hata çıkmaz.
 *   2. Engeller SUNUCUDA da kontrol ediliyor — liste ekranının düğmeyi
 *      kapatması yetmiyor, API doğrudan çağrılabiliyor.
 *   3. Hata metni ÇAĞIRANA dönüyor. Kural yolunda hata kolona yazılıp
 *      listede sonra görülüyor; burada kullanıcı ekranda bekliyor.
 */

let h: Harness;
let svc: BoostsService;
let executor: BoostExecutorService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const FB = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const IG = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const POST = 'cccccccc-3333-3333-3333-cccccccccccc';
const IG_POST = 'eeeeeeee-5555-5555-5555-eeeeeeeeeeee';

const createBoost = vi.fn();
const canWrite = vi.fn();
const getSavedAudienceTargeting = vi.fn();
const getCampaignSummaries = vi.fn();

function input(over: Partial<ManualBoostInput> = {}): ManualBoostInput {
  return {
    clientId: IDS.client,
    organicPostId: POST,
    totalBudget: '300',
    durationDays: 5,
    targeting: {
      locations: [],
      ageMin: 18,
      ageMax: 65,
      genders: 'all',
    },
    ...over,
  } as ManualBoostInput;
}

async function seedProfile(
  id: string,
  type: 'facebook_page' | 'instagram_business',
  linked = true,
  anaSayfa: string | null = '345736801957026',
): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, linked_ad_account_id, parent_page_external_id,
       sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, now())`,
    [
      id,
      IDS.org,
      IDS.client,
      IDS.connection,
      type,
      `ext-${id.slice(0, 6)}`,
      'Profil',
      linked ? IDS.adAccount : null,
      type === 'instagram_business' ? anaSayfa : null,
    ],
  );
}

async function seedPost(id: string, profileId: string): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments, shares,
       saves, video_views, engagements, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'photo', 'test', now() - interval '2 days',
             20000, 12000, 400, 100, 50, 50, 0, 600, now())`,
    [id, IDS.org, IDS.client, profileId, `post-${id.slice(-4)}`],
  );
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;

  executor = new BoostExecutorService(
    {
      get: () => ({
        platform: 'meta',
        createBoost,
        canWrite,
        getSavedAudienceTargeting,
        getCampaignSummaries,
      }),
    } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
      // ADMIN PRISMA — yalnızca `completeEndedBoosts` kullanıyor ve bu
    // testlerde çağrılmıyor. Çağrılırsa SESSİZCE geçmesin diye fırlatan bir
    // yerine koyma veriliyor.
    { $executeRaw: () => { throw new Error('admin prisma bu testte beklenmiyor'); } } as never,
  );
  svc = new BoostsService(prisma, executor);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await seedProfile(FB, 'facebook_page');
  await seedPost(POST, FB);

  createBoost.mockReset();
  canWrite.mockReset();
  getSavedAudienceTargeting.mockReset();
  getCampaignSummaries.mockReset();
  getCampaignSummaries.mockResolvedValue({});
  canWrite.mockReturnValue({ ok: true, missing: [] });
  createBoost.mockResolvedValue({
    externalCampaignId: 'c-1',
    externalAdSetId: 'as-1',
    externalAdId: 'ad-1',
  });
});

/** Meta'ya giden istek gövdesi. */
function istek(): Record<string, unknown> {
  return createBoost.mock.calls[0]![1] as Record<string, unknown>;
}

function mcpGirdi(over: Partial<Parameters<BoostsService['mcpBoostAc']>[1]> = {}): Parameters<BoostsService['mcpBoostAc']>[1] {
  return {
    clientId: IDS.client,
    organicPostId: POST,
    hedef: 'etkilesim',
    hedefAdres: null,
    butce: { kip: 'daily', micros: 100_000_000n },
    durationDays: 4,
    targeting: { geo_locations: { countries: ['TR'] }, age_min: 25 },
    savedAudienceId: null,
    objective: 'OUTCOME_ENGAGEMENT',
    neden: 'MCP testi',
    ...over,
  };
}

const satir = async () =>
  (
    await h.q<{ status: string; duraklatilmis_kur: boolean; yayin_baslangici: Date | null; hedef: string; budget_mode: string; daily_budget_micros: string | null; total_budget_micros: string | null }>(
      `SELECT status, duraklatilmis_kur, yayin_baslangici, hedef, budget_mode, daily_budget_micros::text, total_budget_micros::text FROM boosts`,
    )
  )[0]!;

describe('MCP boost\'u', () => {
  it('KRİTİK: Meta\'ya DURAKLATILMIŞ + hedef gidiyor; harcama başlangıcı boş', async () => {
    await svc.mcpBoostAc(CTX, mcpGirdi());
    expect(istek()).toMatchObject({ duraklatilmis: true, hedef: 'etkilesim', budget: { mode: 'daily', dailyMicros: 100_000_000n }, durationDays: 4 });
    const s = await satir();
    expect(s).toMatchObject({ status: 'active', duraklatilmis_kur: true, yayin_baslangici: null, hedef: 'etkilesim', budget_mode: 'daily', daily_budget_micros: '100000000', total_budget_micros: null });
  });

  it('KRİTİK: panelin elle boost\'u DEĞİŞMEDİ: duraklatma ve hedef gitmiyor, başlangıç yazılıyor', async () => {
    await svc.createManualBoost(CTX, {
      clientId: IDS.client,
      organicPostId: POST,
      totalBudget: '300',
      durationDays: 5,
      targeting: { locations: [], ageMin: 18, ageMax: 65, genders: 'all' },
    } as never);
    expect(istek().duraklatilmis).toBeUndefined();
    expect(istek().hedef).toBeUndefined();
    const s = await satir();
    expect(s.duraklatilmis_kur).toBe(false);
    expect(s.yayin_baslangici).not.toBeNull();
  });

  it('toplam bütçe toplam gidiyor, trafik adresi taşınıyor', async () => {
    await svc.mcpBoostAc(CTX, mcpGirdi({ hedef: 'trafik', hedefAdres: 'https://ornek.com', butce: { kip: 'lifetime', micros: 500_000_000n }, objective: 'OUTCOME_TRAFFIC' }));
    expect(istek()).toMatchObject({ hedef: 'trafik', hedefAdres: 'https://ornek.com', budget: { mode: 'lifetime', totalMicros: 500_000_000n } });
    expect(await satir()).toMatchObject({ budget_mode: 'lifetime', total_budget_micros: '500000000', daily_budget_micros: null });
  });

  it('KRİTİK: adressiz trafik veritabanında reddediliyor, Meta\'ya gidilmiyor', async () => {
    await expect(svc.mcpBoostAc(CTX, mcpGirdi({ hedef: 'trafik', hedefAdres: null }))).rejects.toThrow();
    expect(createBoost).not.toHaveBeenCalled();
  });

  it('hedefin geri okuması çağırana dönüyor', async () => {
    createBoost.mockResolvedValue({
      externalCampaignId: 'c-1',
      externalAdSetId: 'as-1',
      externalAdId: 'ad-1',
      hedefGeriOkuma: { optimizationGoal: 'POST_ENGAGEMENT', destinationType: 'ON_POST', uyustu: true },
    });
    const r = await svc.mcpBoostAc(CTX, mcpGirdi());
    expect(r.hedefGeriOkuma?.uyustu).toBe(true);
    expect(r.boost.externalCampaignId).toBe('c-1');
  });

  it('KRİTİK: canlı boost\'u olan gönderiye ikinci MCP boost\'u açılmıyor', async () => {
    await svc.mcpBoostAc(CTX, mcpGirdi());
    createBoost.mockClear();
    await expect(svc.mcpBoostAc(CTX, mcpGirdi())).rejects.toThrow();
    expect(createBoost).not.toHaveBeenCalled();
  });
});
