import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SimpleDraftInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { PlatformApiError } from '../connections/provider.types';
import { DraftPublishService } from './draft-publish.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * Ağacın yayın yolu.
 *
 * EN KRİTİK İDDİA KISMİ BAŞARI: Meta çıkar, Google düşer ve ikisi de kendi
 * durumunu taşır. Bu istisna değil normal sonuç — iki API, iki onay süreci,
 * iki politika motoru. Tek satırlık eski modelde bu durumu yazmanın yolu yoktu.
 *
 * İkinci iddia: metin havuzundan Meta paketi kuruluyor ve platforma giden
 * değerler havuzun İLK elemanları. Sıra rastgele olsaydı, kullanıcının Google
 * için yazdığı beşinci alternatif Meta reklamının ana başlığı olurdu.
 */

let h: Harness;
let tree: DraftTreeService;
let svc: DraftPublishService;

const publishDraft = vi.fn();
const canWrite = vi.fn();
const ensureExternalRef = vi.fn();

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PAGE = '66666666-6666-6666-6666-666666666666';
const CREATIVE = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const ASSET = 'c1c1c1c1-c1c1-c1c1-c1c1-c1c1c1c1c1c1';
const GOOGLE_ACC = '77777777-7777-7777-7777-777777777777';

function input(patch: Partial<SimpleDraftInput> = {}): SimpleDraftInput {
  return {
    clientId: IDS.client,
    name: 'Yaz Kampanyası',
    goal: 'whatsapp',
    targets: [{ platform: 'meta', adAccountId: IDS.adAccount, dailyBudget: '200' }],
    socialProfileId: PAGE,
    creativeId: CREATIVE,
    durationDays: 7,
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
    { get: () => ({ platform: 'meta', publishDraft, canWrite }) } as never,
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
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '169512', 'Google hesabı', 'TRY', 'Europe/Istanbul', now())`,
    [GOOGLE_ACC, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $2, $3, 'Yaz kreatifi',
             '{"primaryText":"Yaz indirimi başladı","headlines":["Yaz indirimi","İkinci başlık"],
               "longHeadlines":[],"descriptions":["Sınırlı süre"]}'::jsonb, now())`,
    [CREATIVE, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO assets
       (id, org_id, client_id, kind, name, file_name, mime_type, byte_size,
        width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'Kare görsel', 'k.jpg', 'image/jpeg', 100,
             1080, 1080, 'k/1', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', now())`,
    [ASSET, IDS.org, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_creative_assets (id, org_id, creative_id, asset_id, position)
     VALUES (gen_random_uuid(), $1, $2, $3, 0)`,
    [IDS.org, CREATIVE, ASSET],
  );

  publishDraft.mockReset();
  canWrite.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  ensureExternalRef.mockReset();
  ensureExternalRef.mockResolvedValue('hesap-hash-1');
  publishDraft.mockResolvedValue({
    campaignId: 'c-1',
    adSetId: 'as-1',
    creativeId: 'cr-1',
    adId: 'ad-1',
  });
});

describe('kontrol', () => {
  it('eksiksiz taslak yayına hazır', async () => {
    const created = await tree.createFromSimple(CTX, input());
    const check = await svc.check(CTX, created.campaigns[0]!.id);
    expect(check.blockers).toEqual([]);
    expect(check.ok).toBe(true);
  });

  it('kapsama Meta VE Google için hesaplanıyor', async () => {
    // Google bloğu yayını engellemiyor: yazılmamış bir özellik yüzünden
    // çalışan bir akışı durdurmak olurdu.
    const created = await tree.createFromSimple(CTX, input());
    const check = await svc.check(CTX, created.campaigns[0]!.id);
    expect(check.assetCoverage.map((c) => c.platform)).toEqual(['meta', 'google']);
    expect(check.ok).toBe(true);
  });

  it('KRİTİK: ana metni olmayan kreatif yayını ENGELLİYOR', async () => {
    await h.q(`UPDATE ad_creatives SET texts = '{"headlines":["Başlık"]}'::jsonb WHERE id = $1`, [
      CREATIVE,
    ]);
    const created = await tree.createFromSimple(CTX, input());
    const check = await svc.check(CTX, created.campaigns[0]!.id);
    expect(check.blockers.join(' ')).toContain('Ana metin boş');
  });

  it('yayınlanmış kampanya tekrar yayınlanamıyor', async () => {
    const created = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, created.campaigns[0]!.id);
    const check = await svc.check(CTX, created.campaigns[0]!.id);
    expect(check.blockers.join(' ')).toContain('zaten yayınlanmış');
  });

  it('süresiz kampanya UYARIYOR ama engellemiyor', async () => {
    const created = await tree.createFromSimple(CTX, input({ durationDays: 0 }));
    const check = await svc.check(CTX, created.campaigns[0]!.id);
    expect(check.ok).toBe(true);
    expect(check.warnings.join(' ')).toContain('Süre sınırı yok');
  });
});

describe('yayın', () => {
  it('metin havuzundan Meta paketi kuruluyor', async () => {
    /**
     * SIRA ANLAMLI: Meta tek başlık alıyor ve havuzun İLKİNİ alıyor.
     * Rastgele olsaydı kullanıcının ikinci alternatifi ana başlık olurdu.
     */
    const created = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, created.campaigns[0]!.id);

    const req = publishDraft.mock.calls[0]![1] as Record<string, unknown>;
    expect(req.primaryText).toBe('Yaz indirimi başladı');
    expect(req.headline).toBe('Yaz indirimi');
    expect(req.description).toBe('Sınırlı süre');
  });

  it('hedef eşlemesi goal-mapping\'ten geliyor', async () => {
    // `LEAD_GENERATION` yerine `LINK_CLICKS` sınıfı hatalar bu eşlemede
    // yaşanmıştı; ikinci bir eşleme yazmamanın sebebi bu.
    const created = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, created.campaigns[0]!.id);

    const req = publishDraft.mock.calls[0]![1] as { spec: Record<string, string> };
    expect(req.spec.objective).toBe('OUTCOME_LEADS');
    expect(req.spec.optimizationGoal).toBe('CONVERSATIONS');
    expect(req.spec.callToAction).toBe('WHATSAPP_MESSAGE');
  });

  it('görsel hash\'i hesap başına önbellekten geliyor', async () => {
    const created = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, created.campaigns[0]!.id);

    expect(ensureExternalRef).toHaveBeenCalledTimes(1);
    const params = ensureExternalRef.mock.calls[0]![1] as Record<string, string>;
    expect(params.assetId).toBe(ASSET);
    expect(params.adAccountId).toBe(IDS.adAccount);
    // Etiket oranla aynı: `asset_customization_rules` bununla eşleştiriyor.
    expect(params.label).toBe('advetics_square');
  });

  it('DIŞ KİMLİKLER ağacın kendi seviyelerine yazılıyor', async () => {
    /**
     * Hepsini kampanyaya yığmak kolay olurdu ama "bu reklam grubu platformda
     * hangisi" sorusunun cevabı olmazdı.
     */
    const created = await tree.createFromSimple(CTX, input());
    const published = await svc.publish(CTX, created.campaigns[0]!.id);

    expect(published.status).toBe('published');
    expect(published.externalCampaignId).toBe('c-1');
    expect(published.adGroups[0]!.externalAdSetId).toBe('as-1');
    expect(published.adGroups[0]!.ads[0]!.externalAdId).toBe('ad-1');
  });

  it('KRİTİK: yayın hatası satıra SEBEBİYLE yazılıyor', async () => {
    publishDraft.mockRejectedValue(
      new PlatformApiError('meta', 'permanent', 'Reklam kreatif gönderisi reddedildi'),
    );
    const created = await tree.createFromSimple(CTX, input());

    await expect(svc.publish(CTX, created.campaigns[0]!.id)).rejects.toThrow(/reddedildi/);

    const after = await tree.get(CTX, created.campaigns[0]!.id);
    expect(after.status).toBe('failed');
    expect(after.error).toContain('reddedildi');
  });

  it('yazma izni yoksa yayın durduruluyor', async () => {
    canWrite.mockReturnValue({ ok: false, missing: ['ads_management'] });
    const created = await tree.createFromSimple(CTX, input());
    await expect(svc.publish(CTX, created.campaigns[0]!.id)).rejects.toThrow(/Yazma izni yok/);
    expect(publishDraft).not.toHaveBeenCalled();
  });
});

describe('KISMİ BAŞARI — K13 kararının sınavı', () => {
  it('Meta yayında, Google başarısız ve İKİSİ DE kendi durumunu taşıyor', async () => {
    /**
     * Bu testin geçmesi tasarımın bütün gerekçesi.
     *
     * Kullanıcı "siteme ziyaretçi gelsin, ikisine de çıkalım" dedi. Meta
     * yayınlandı ve o anda para harcamaya başladı; Google düştü çünkü yazma
     * kodu yok. Tek hata fırlatmak, yayına girmiş Meta kampanyasını
     * kullanıcıdan gizlemek olurdu.
     */
    const created = await tree.createFromSimple(
      CTX,
      input({ goal: 'website', linkUrl: 'https://site.com' }),
    );
    const metaId = created.campaigns[0]!.id;

    /**
     * Google kampanyası ELLE ekleniyor: üretici onu 'not_yet' diye atlıyor
     * (K15) ve buradaki soru ayrı — yayın yolu kısmi başarıyı taşıyor mu?
     *
     * AĞACIN TAMAMI KOPYALANIYOR (grup ve reklam dahil). Yalnızca kampanyayı
     * kopyalamak, Google satırının "grup yok / reklam yok" gibi ALAKASIZ
     * engellerle düşmesi demek olurdu; o zaman test doğru sebepten değil
     * yanlış sebepten geçerdi.
     */
    const googleId = 'ca11ab1e-0000-4000-8000-000000000001';
    const googleGroupId = 'ca11ab1e-0000-4000-8000-000000000002';
    await h.q(`UPDATE draft_campaigns SET group_id = id WHERE id = $1`, [metaId]);
    await h.q(
      `INSERT INTO draft_campaigns
         (id, org_id, client_id, group_id, platform, ad_account_id, name, goal,
          budget_mode, budget_amount_micros, end_at, updated_at)
       SELECT $2, org_id, client_id, group_id, 'google', $3, name, goal,
              budget_mode, budget_amount_micros, end_at, now()
       FROM draft_campaigns WHERE id = $1`,
      [metaId, googleId, GOOGLE_ACC],
    );
    await h.q(
      `INSERT INTO draft_ad_groups
         (id, org_id, campaign_id, name, position, social_profile_id, settings, updated_at)
       SELECT $2, org_id, $3, name, position, social_profile_id, settings, now()
       FROM draft_ad_groups WHERE campaign_id = $1`,
      [metaId, googleGroupId, googleId],
    );
    await h.q(
      `INSERT INTO draft_ads (id, org_id, ad_group_id, creative_id, name, position, updated_at)
       SELECT gen_random_uuid(), d.org_id, $2, d.creative_id, d.name, d.position, now()
       FROM draft_ads d
       JOIN draft_ad_groups g ON g.id = d.ad_group_id
       WHERE g.campaign_id = $1`,
      [metaId, googleGroupId],
    );

    const group = await svc.publishGroup(CTX, metaId);

    const byPlatform = Object.fromEntries(group.campaigns.map((c) => [c.platform, c]));
    expect(byPlatform.meta!.status).toBe('published');
    expect(byPlatform.meta!.externalCampaignId).toBe('c-1');
    expect(byPlatform.google!.status).toBe('failed');
    // TEK ENGEL: platformun yazma kodu. Ağaç eksiksiz olduğu için başka bir
    // sebep karışmıyor — hata mesajı kullanıcıya doğru şeyi söylüyor.
    expect(byPlatform.google!.error).toBe(
      'Google Ads reklam oluşturma henüz yazılmadı. Bağlantı ve okuma tarafı çalışıyor; ' +
        'eksik olan yazma kodu.',
    );
  });

  it('grup yayını HATA FIRLATMIYOR', async () => {
    // Fırlatsaydı arayüz "yayınlanamadı" derdi ve Meta kampanyası panelde
    // görünmezken harcamaya devam ederdi.
    const created = await tree.createFromSimple(CTX, input());
    await expect(svc.publishGroup(CTX, created.campaigns[0]!.id)).resolves.toBeDefined();
  });

  it('zaten yayınlanmış kampanya grup yayınında ATLANIYOR', async () => {
    // Yoksa aynı kampanya Meta'da ikinci kez oluşur ve bütçe ikiye katlanır.
    const created = await tree.createFromSimple(CTX, input());
    await svc.publish(CTX, created.campaigns[0]!.id);
    publishDraft.mockClear();

    await svc.publishGroup(CTX, created.campaigns[0]!.id);
    expect(publishDraft).not.toHaveBeenCalled();
  });
});
