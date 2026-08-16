import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  advancedDefaultsFor,
  buildExpertTree,
  type AdvancedSettings,
  type ExpertDraftInput,
  type TenantContext,
} from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { DraftPublishService } from './draft-publish.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * Uzman yüzeyi — kararlar KULLANICININ.
 *
 * En kritik iki iddia:
 *
 *   1. Uzmanın ayarları yayına AYNEN gidiyor. `campaignSpec` (bizim
 *      eşlememiz) devreye girmiyor; `resolveSpec` kullanıcının seçimini
 *      alıyor. Karışırsa kullanıcı seçmediği bir hedefle yayınlar ve bunu
 *      ancak Ads Manager'a bakarsa görür.
 *
 *   2. Aynı gruba birden çok kreatif konabiliyor ve BİR VARYANTIN DÜŞMESİ
 *      kampanyayı düşürmüyor. Kampanya ve ad set yayında; hepsini geri almak
 *      çalışan bir yapıyı bir varyant yüzünden yıkmak olurdu.
 */

let h: Harness;
let tree: DraftTreeService;
let svc: DraftPublishService;

const publishDraft = vi.fn();
const createAd = vi.fn();
const canWrite = vi.fn();
const ensureExternalRef = vi.fn();

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PAGE = '66666666-6666-6666-6666-666666666666';
const CREATIVE_A = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const CREATIVE_B = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const ASSET_A = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const ASSET_B = 'd1d1d1d1-d1d1-d1d1-d1d1-d1d1d1d1d1d1';

const NOW = new Date('2026-08-16T12:00:00.000Z');

function advanced(patch: Partial<AdvancedSettings> = {}): AdvancedSettings {
  return { ...advancedDefaultsFor('whatsapp'), ...patch };
}

function input(patch: Partial<ExpertDraftInput> = {}): ExpertDraftInput {
  return {
    clientId: IDS.client,
    name: 'Uzman Kampanyası',
    platform: 'meta',
    adAccountId: IDS.adAccount,
    socialProfileId: PAGE,
    budget: '500',
    creativeIds: [CREATIVE_A],
    advanced: advanced(),
    ...patch,
  };
}

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;

  tree = new DraftTreeService(prisma);
  svc = new DraftPublishService(
    prisma,
    tree,
    { get: () => ({ platform: 'meta', publishDraft, createAd, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
    { ensureExternalRef } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', now())`,
    [PAGE, IDS.org, IDS.client, IDS.connection],
  );
  const texts = `'{"primaryText":"Metin","headlines":["Başlık"],"longHeadlines":[],"descriptions":["Açıklama"]}'::jsonb`;
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $3, $4, 'A kreatifi', ${texts}, now()),
            ($2, $3, $4, 'B kreatifi', ${texts}, now())`,
    [CREATIVE_A, CREATIVE_B, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO assets
       (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
        width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $3, $4, 'image', 'Kare A', 'a.jpg', 'image/jpeg', 100, 1080, 1080,
             'k/a', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now()),
            ($2, $3, $4, 'image', 'Kare B', 'b.jpg', 'image/jpeg', 100, 1080, 1080,
             'k/b', 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', now())`,
    [ASSET_A, ASSET_B, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_creative_assets (id, org_id, creative_id, asset_id, position)
     VALUES (gen_random_uuid(), $1, $2, $4, 0), (gen_random_uuid(), $1, $3, $5, 0)`,
    [IDS.org, CREATIVE_A, CREATIVE_B, ASSET_A, ASSET_B],
  );

  publishDraft.mockReset();
  createAd.mockReset();
  canWrite.mockReset();
  ensureExternalRef.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  ensureExternalRef.mockResolvedValue('hash-1');
  publishDraft.mockResolvedValue({
    campaignId: 'c-1',
    adSetId: 'as-1',
    creativeId: 'cr-1',
    adId: 'ad-1',
  });
  createAd.mockResolvedValue({ externalAdId: 'ad-2', externalCreativeId: 'cr-2' });
});

describe('üretici', () => {
  it('HEDEF NULL — uzman hedefi değil amacı seçiyor', () => {
    const plan = buildExpertTree(input(), NOW);
    expect(plan.campaigns[0]!.goal).toBeNull();
    expect(plan.campaigns[0]!.surface).toBe('expert');
  });

  it('ayarlar kampanya ve grup arasında Meta\'daki gibi bölünüyor', () => {
    // Amaç ve teklif kampanyanın, optimizasyon ve hedefleme ad set'in alanı.
    const c = buildExpertTree(input(), NOW).campaigns[0]!;
    expect(c.settings).toMatchObject({ objective: 'OUTCOME_LEADS' });
    expect(c.adGroups[0]!.settings).toMatchObject({
      optimizationGoal: 'CONVERSATIONS',
      billingEvent: 'IMPRESSIONS',
    });
    expect(c.adGroups[0]!.settings.targeting).toBeDefined();
    expect(c.adGroups[0]!.settings.placement).toBeDefined();
  });

  it('KRİTİK: toplam bütçede bitiş zorunlu', () => {
    // Meta bütçeyi süreye bölüyor; süre yoksa ad set hiç dağıtım yapmıyor.
    const plan = buildExpertTree(
      input({ advanced: advanced({ budgetMode: 'lifetime', endAt: undefined }) }),
      NOW,
    );
    expect(plan.blockers.join(' ')).toContain('bitiş tarihi zorunlu');
  });

  it('her kreatif NUMARALI bir reklam oluyor', () => {
    // Ads Manager'da hangi varyantın hangisi olduğu ancak addan anlaşılıyor.
    const c = buildExpertTree(input({ creativeIds: [CREATIVE_A, CREATIVE_B] }), NOW)
      .campaigns[0]!;
    expect(c.adGroups[0]!.ads.map((a) => a.name)).toEqual([
      'Uzman Kampanyası — 1',
      'Uzman Kampanyası — 2',
    ]);
  });
});

describe('servis', () => {
  it('uzman taslağı kuruluyor ve okunuyor', async () => {
    const c = await tree.createFromExpert(CTX, input({ creativeIds: [CREATIVE_A, CREATIVE_B] }));
    expect(c.surface).toBe('expert');
    expect(c.goal).toBeNull();
    expect(c.adGroups[0]!.ads).toHaveLength(2);
  });

  it('KRİTİK: kreatiflerin HEPSİ denetleniyor, yalnızca ilki değil', async () => {
    /**
     * Birini denetleyip diğerlerini geçmek, listenin sonuna başka müşterinin
     * kreatifini koymanın yeterli olması demek olurdu.
     */
    const yabanciMusteri = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const yabanciKreatif = 'e1e1e1e1-e1e1-e1e1-e1e1-e1e1e1e1e1e1';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Diğer', 'diger', now())`,
      [yabanciMusteri, IDS.org],
    );
    await h.q(
      `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
       VALUES ($1, $2, $3, 'Yabancı', '{}'::jsonb, now())`,
      [yabanciKreatif, IDS.org, yabanciMusteri],
    );

    await expect(
      tree.createFromExpert(CTX, input({ creativeIds: [CREATIVE_A, yabanciKreatif] })),
    ).rejects.toThrow(/başka bir müşteriye ait/i);
  });
});

describe('yayın', () => {
  it('KRİTİK: uzmanın ayarları AYNEN gidiyor, campaignSpec devreye girmiyor', async () => {
    /**
     * Karışırsa kullanıcı seçmediği bir hedefle yayınlar. `OUTCOME_AWARENESS`
     * seçen bir uzmanın kampanyası `OUTCOME_LEADS` olarak açılırsa fark
     * yalnızca Ads Manager'da görünür.
     */
    const c = await tree.createFromExpert(
      CTX,
      input({
        advanced: advanced({
          objective: 'OUTCOME_AWARENESS',
          optimizationGoal: 'REACH',
          destinationType: undefined,
        }),
      }),
    );
    await svc.publish(CTX, c.id);

    const req = publishDraft.mock.calls[0]![1] as { spec: Record<string, string> };
    expect(req.spec.objective).toBe('OUTCOME_AWARENESS');
    expect(req.spec.optimizationGoal).toBe('REACH');
  });

  it('hedefleme uzmanın seçimi — varsayılan değil', async () => {
    const c = await tree.createFromExpert(
      CTX,
      input({
        advanced: advanced({
          targeting: {
            countries: ['DE'],
            cityKeys: [],
            ageMin: 25,
            ageMax: 45,
            genders: 'female',
            locales: [],
          },
        }),
      }),
    );
    await svc.publish(CTX, c.id);

    const req = publishDraft.mock.calls[0]![1] as { targeting: Record<string, unknown> };
    expect(req.targeting.geo_locations).toEqual({ countries: ['DE'] });
    expect(req.targeting.age_min).toBe(25);
    expect(req.targeting.age_max).toBe(45);
    // Meta: 1 = erkek, 2 = kadın.
    expect(req.targeting.genders).toEqual([2]);
  });

  it('OTOMATİK YERLEŞİMDE hiçbir alan gönderilmiyor', async () => {
    /**
     * Boş `publisher_platforms` göndermek "hiçbir platform" demek ve ad set
     * hiç dağıtım yapmıyor; alanı hiç göndermemek "hepsi" demek. Fark sessiz
     * bir sıfır harcama.
     */
    const c = await tree.createFromExpert(CTX, input());
    await svc.publish(CTX, c.id);
    const req = publishDraft.mock.calls[0]![1] as { placements: Record<string, unknown> };
    expect(req.placements).toEqual({});
  });

  it('ÇOKLU KREATİF: ilki publishDraft, kalanı createAd ile AYNI ad set\'e', async () => {
    const c = await tree.createFromExpert(CTX, input({ creativeIds: [CREATIVE_A, CREATIVE_B] }));
    const yayinlanan = await svc.publish(CTX, c.id);

    expect(publishDraft).toHaveBeenCalledTimes(1);
    expect(createAd).toHaveBeenCalledTimes(1);
    const ek = createAd.mock.calls[0]![1] as Record<string, string>;
    expect(ek.adSetExternalId).toBe('as-1');

    const ads = yayinlanan.adGroups[0]!.ads;
    expect(ads.map((a) => a.externalAdId)).toEqual(['ad-1', 'ad-2']);
  });

  it('KRİTİK: bir varyant düşerse kampanya YAYINDA kalıyor', async () => {
    /**
     * Kampanya ve ad set çoktan açıldı ve para harcamaya başladı. Hepsini
     * geri almak, çalışan bir yapıyı bir varyant yüzünden yıkmak olurdu.
     * Düşen varyantın sebebi KENDİ satırına yazılıyor.
     */
    createAd.mockRejectedValue(new Error('Kreatif reddedildi'));

    const c = await tree.createFromExpert(CTX, input({ creativeIds: [CREATIVE_A, CREATIVE_B] }));
    const yayinlanan = await svc.publish(CTX, c.id);

    expect(yayinlanan.status).toBe('published');
    const ads = yayinlanan.adGroups[0]!.ads;
    expect(ads[0]!.externalAdId).toBe('ad-1');
    expect(ads[1]!.externalAdId).toBeNull();
    expect(ads[1]!.error).toContain('reddedildi');
  });

  it('uyumsuz kombinasyon YAYINI ENGELLİYOR', async () => {
    /**
     * Meta bazı uyumsuz kombinasyonları KABUL EDİP hiç dağıtım yapmıyor —
     * en tehlikeli hata sınıfı. `objective-matrix` doğrulaması aynı kontrol
     * listesine katılıyor.
     */
    const c = await tree.createFromExpert(
      CTX,
      input({
        advanced: advanced({ objective: 'OUTCOME_AWARENESS', optimizationGoal: 'CONVERSATIONS' }),
      }),
    );
    const check = await svc.check(CTX, c.id);
    expect(check.ok).toBe(false);
    expect(check.blockers.length).toBeGreaterThan(0);
  });

  it('çok kreatifli kontrolde MESAJDA VARYANT NUMARASI var', async () => {
    // "Ana metin boş" tek başına, beş kreatifli bir kampanyada hangisini
    // düzelteceğini söylemiyor.
    await h.q(`UPDATE ad_creatives SET texts = '{"headlines":[]}'::jsonb WHERE id = $1`, [
      CREATIVE_B,
    ]);
    const c = await tree.createFromExpert(CTX, input({ creativeIds: [CREATIVE_A, CREATIVE_B] }));
    const check = await svc.check(CTX, c.id);
    expect(check.blockers.join(' ')).toContain('2. reklam:');
  });
});
