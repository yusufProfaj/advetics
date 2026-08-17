import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { BoostRuleInput, TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
 * INSTAGRAM BOOST — açıldı, ama iki kısıtla.
 *
 * K17 kapandı: Instagram gönderisi artık ELLE öne çıkarılabiliyor. Bu dosya
 * artık "Instagram yapılamaz"ı değil, KALAN İKİ KISITI sınıyor ve her ikisi de
 * sessizce açılmamalı.
 *
 * KISIT 1 — ANA SAYFASI OLMAYAN INSTAGRAM SATIRI.
 * Meta'da her reklam bir Facebook sayfasına bağlı ve Instagram satırındaki
 * `external_id` sayfa kimliği DEĞİL. Sayfa kimliği `parent_page_external_id`de
 * ve o kolon bu satırlar keşfedildikten sonra eklendi — üretimdeki eski
 * satırlarda NULL. NULL değerle boost denemek, ya reddedilen ya da YANLIŞ
 * kimlikle oluşan bir reklam demek.
 *
 * KISIT 2 — KURAL YOLU HENÜZ INSTAGRAM'A KAPALI.
 * Instagram yazma yolu canlıda doğrulanmadı ve kural motoru OTOMATİK, tekrar
 * tekrar harcıyor. Doğrulanmamış bir yolu ilk kez otomasyona vermek, bu
 * belgenin bütün teşhisine aykırı. Elle boost tek bir bilinçli tıklama.
 */

let h: Harness;
/**
 * Test çalıştırıcısı — yürütücü artık hazır bir `tx` değil, "şu işi bir
 * transaction'da koştur" diyen bir fonksiyon alıyor. Sebebi üretimde
 * öğrenildi: platform çağrısı transaction içinde kalınca Prisma'nın 5 saniyelik
 * sınırı doluyor ve hata bile kaydedilemiyor.
 */
const runner = <T>(fn: (tx: never) => Promise<T>): Promise<T> => fn(h.db as never);
let boosts: BoostsService;
let executor: BoostExecutorService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const IG_PROFILE = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const FB_PROFILE = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const IG_POST = 'cccccccc-3333-3333-3333-cccccccccccc';
const FB_POST = 'dddddddd-4444-4444-4444-dddddddddddd';
const NOW = new Date('2026-08-07T12:00:00Z');

/** Ana sayfa kimliği — Instagram satırının bağlı olduğu Facebook sayfası. */
const ANA_SAYFA = '345736801957026';

const createBoost = vi.fn();
const canWrite = vi.fn();

function ruleInput(over: Partial<BoostRuleInput> = {}): BoostRuleInput {
  return {
    name: 'İyi giden gönderileri boost et',
    clientId: IDS.client,
    socialProfileId: null,
    conditions: [{ metric: 'engagements', operator: 'gte', value: 100 }],
    combinator: 'and',
    minPostAgeHours: 6,
    maxPostAgeHours: 72,
    dailyBudget: '500',
    durationDays: 3,
    objective: 'OUTCOME_ENGAGEMENT',
    monthlyCap: '4500',
    maxBoostsPerRun: 10,
    autoApprove: false,
    enabled: true,
    ...over,
  } as BoostRuleInput;
}

/**
 * Profil ekler. Instagram satırında `external_id` KASITLI olarak IG kullanıcı
 * kimliği — hatanın kaynağı tam olarak bu ayrımdı.
 */
async function seedProfile(
  id: string,
  type: 'facebook_page' | 'instagram_business',
  anaSayfa: string | null = ANA_SAYFA,
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
      type === 'instagram_business' ? '17841457593418725' : 'page-1',
      type === 'instagram_business' ? 'Ege Birlik IG' : 'Ege Birlik Sayfa',
      IDS.adAccount,
      // CHECK kısıtı: ana sayfa YALNIZCA Instagram satırlarında dolu olabilir.
      type === 'instagram_business' ? anaSayfa : null,
    ],
  );
}

/** Kuralın ölçütünü RAHATÇA geçen bir gönderi — eleme sebebi hep profil türü olsun. */
async function seedPost(id: string, profileId: string): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments, shares,
       saves, video_views, engagements, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'photo', 'test', $6::timestamptz, 20000, 12000,
             400, 100, 50, 50, 0, 600, now())`,
    [id, IDS.org, IDS.client, profileId, `post-${id.slice(0, 8)}`, '2026-08-06T12:00:00Z'],
  );
}

function executorStub(): BoostExecutorService {
  return {
    createOneApproved: async () => ({ ok: true as const }),
  } as unknown as BoostExecutorService;
}

beforeAll(async () => {
  h = await createHarness();
  boosts = new BoostsService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    executorStub(),
  );
  executor = new BoostExecutorService(
    { get: () => ({ platform: 'meta', createBoost, canWrite }) } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  createBoost.mockReset();
  canWrite.mockReset();
  canWrite.mockReturnValue({ ok: true, missing: [] });
  createBoost.mockResolvedValue({
    externalCampaignId: 'c-1',
    externalAdSetId: 'as-1',
    externalAdId: 'ad-1',
  });
});

/** Onaylanmış bir boost ekler — elle boost gibi, kuralsız. */
async function onayliBoost(postId: string): Promise<void> {
  await h.q(
    `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
       status, daily_budget_micros, duration_days, objective, reason,
       approved_at, updated_at)
     VALUES (gen_random_uuid(), $1, $2, $3, $4, 'approved', 500000000, 3,
             'OUTCOME_ENGAGEMENT', 'elle', now(), now())`,
    [IDS.org, IDS.client, postId, IDS.adAccount],
  );
}

// -----------------------------------------------------------------------------

describe('Instagram artık yayınlanabiliyor', () => {
  it('KRİTİK: Instagram boost’u INSTAGRAM kaynağıyla gidiyor', async () => {
    /*
     * Üç kimlik doğru alanlara oturmalı: sayfa ana sayfadan, IG hesabı
     * profilin external_id'sinden, medya gönderinin external_id'sinden. Bu
     * ayrımın karışması işin başlangıç hatasıydı.
     */
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    await onayliBoost(IG_POST);

    const out = await executor.createApproved(runner, IDS.client);
    expect(out).toEqual({ created: 1, failed: 0 });

    expect(createBoost.mock.calls[0]![1].source).toEqual({
      surface: 'instagram',
      pageExternalId: ANA_SAYFA,
      instagramUserId: '17841457593418725',
      mediaExternalId: 'post-cccccccc',
      mediaType: 'photo',
    });
  });

  it('Facebook boost’u SAYFA GÖNDERİSİ kaynağıyla gidiyor', async () => {
    await seedProfile(FB_PROFILE, 'facebook_page');
    await seedPost(FB_POST, FB_PROFILE);
    await onayliBoost(FB_POST);

    await executor.createApproved(runner, IDS.client);
    expect(createBoost.mock.calls[0]![1].source).toEqual({
      surface: 'facebook_page',
      pageExternalId: 'page-1',
      postExternalId: 'post-dddddddd',
    });
  });
});

describe('KISIT 1 — ana sayfası olmayan Instagram satırı', () => {
  it('KRİTİK: ana sayfa NULL ise PLATFORMA GİTMİYOR', async () => {
    // Sayfa kimliği olmadan kurulacak kreatif ya reddedilir ya da yanlış
    // kimlikle oluşur; ikincisi sessiz ve para harcıyor.
    await seedProfile(IG_PROFILE, 'instagram_business', null);
    await seedPost(IG_POST, IG_PROFILE);
    await onayliBoost(IG_POST);

    const out = await executor.createApproved(runner, IDS.client);
    expect(out).toEqual({ created: 0, failed: 1 });
    expect(createBoost).not.toHaveBeenCalled();
  });

  it('sebep KAYDA yazılıyor ve NE YAPILACAĞINI söylüyor', async () => {
    await seedProfile(IG_PROFILE, 'instagram_business', null);
    await seedPost(IG_POST, IG_PROFILE);
    await onayliBoost(IG_POST);
    await executor.createApproved(runner, IDS.client);

    const [row] = await h.q<{ status: string; error: string }>(
      `SELECT status, error FROM boosts`,
    );
    expect(row!.status).toBe('failed');
    expect(row!.error).toMatch(/Hesapları yenile/i);
  });

  it('KRİTİK: kontrol KOTA ALINMADAN önce çalışıyor', async () => {
    // Hiçbir zaman yapılamayacak bir iş için kota yakmak, aynı turdaki gerçek
    // boost'ları sıraya atmak demek. Bu kontrol dal yazılırken bir kez kotanın
    // ARKASINA düştü ve test yakaladı.
    const acquire = vi.fn(async () => ({ allowed: true, usagePercent: 5 }));
    const kotali = new BoostExecutorService(
      { get: () => ({ platform: 'meta', createBoost, canWrite }) } as never,
      { getAccessToken: async () => 'token' } as never,
      { acquire, record: async () => {} } as never,
    );
    await seedProfile(IG_PROFILE, 'instagram_business', null);
    await seedPost(IG_POST, IG_PROFILE);
    await onayliBoost(IG_POST);

    await kotali.createApproved(runner, IDS.client);
    expect(acquire).not.toHaveBeenCalled();
  });

  it('listede de ENGELLİ görünüyor — yayına basmadan önce belli olsun', async () => {
    await seedProfile(IG_PROFILE, 'instagram_business', null);
    await seedPost(IG_POST, IG_PROFILE);

    const out = await boosts.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items[0]!.blockedReason).toMatch(/Hesapları yenile/i);
  });

  it('ANA SAYFASI OLAN Instagram gönderisi listede SEÇİLEBİLİR', async () => {
    // Kısıt Instagram'a değil, ana sayfası bilinmeyen Instagram'a.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);

    const out = await boosts.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items[0]!.blockedReason).toBeNull();
    expect(out.items[0]!.profileType).toBe('instagram_business');
  });
});

describe('KISIT 2 — kural yolu Instagram’a kapalı', () => {
  it('KRİTİK: Instagram profiline kural KURULAMIYOR', async () => {
    // Kural otomatik ve tekrar tekrar harcıyor; doğrulanmamış bir yazma yolu
    // ilk kez otomasyona verilmiyor.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await expect(
      boosts.createRule(CTX, ruleInput({ socialProfileId: IG_PROFILE })),
    ).rejects.toThrow(/Kurallar henüz Instagram/i);
  });

  it('hata mesajı ALTERNATİFİ söylüyor — elle öne çıkarma', async () => {
    // "Desteklenmiyor" tek başına kullanıcıyı çözümsüz bırakır; oysa elle yol
    // AÇIK ve mesaj oraya yönlendiriyor.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await expect(
      boosts.createRule(CTX, ruleInput({ socialProfileId: IG_PROFILE })),
    ).rejects.toThrow(/Gönderi öne çıkar/i);
  });

  it('Instagram profiline kural GÜNCELLENEMİYOR de', async () => {
    await seedProfile(FB_PROFILE, 'facebook_page');
    await seedProfile(IG_PROFILE, 'instagram_business');
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: FB_PROFILE }));

    await expect(
      boosts.updateRule(CTX, rule.id, ruleInput({ socialProfileId: IG_PROFILE })),
    ).rejects.toThrow(/Kurallar henüz Instagram/i);
  });

  it('KRİTİK: profil seçilmemiş kural Instagram gönderisini ADAY YAPMIYOR', async () => {
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: null }));

    const out = await boosts.runRule(h.db, rule.id, NOW);
    expect(out.created).toBe(0);
    expect(await h.q(`SELECT id FROM boosts`)).toHaveLength(0);
  });

  it('atlanan gönderi SAYILIYOR ve sebebi yazılıyor', async () => {
    // Sessiz kesme yok: sayı ve sebep olmadan kullanıcı kuralın çalışmadığını
    // sanır — oysa kural çalıştı, gönderi seçildi ve engel başka yerde.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: null }));

    const out = await boosts.runRule(h.db, rule.id, NOW);
    expect(out.notes.join(' ')).toMatch(/1 gönderi ölçütleri geçti ama Instagram'da/);
    expect(out.notes.join(' ')).toMatch(/Kurallar henüz Instagram/i);
  });

  it('AYNI TURDA Facebook gönderisi aday oluyor, Instagram olmuyor', async () => {
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedProfile(FB_PROFILE, 'facebook_page');
    await seedPost(IG_POST, IG_PROFILE);
    await seedPost(FB_POST, FB_PROFILE);
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: null }));

    const out = await boosts.runRule(h.db, rule.id, NOW);
    expect(out.created).toBe(1);

    const [row] = await h.q<{ organic_post_id: string }>(
      `SELECT organic_post_id::text AS organic_post_id FROM boosts`,
    );
    expect(row!.organic_post_id).toBe(FB_POST);
  });
});
