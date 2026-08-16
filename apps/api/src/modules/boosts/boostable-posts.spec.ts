import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostsService } from './boosts.service';

/**
 * Elle boost — gönderi seçim listesi.
 *
 * NEDEN BU TESTLER: bu listenin işi "hangi gönderiyi öne çıkarayım" sorusuna
 * cevap vermek ve YANLIŞ CEVABIN İKİ BİÇİMİ VAR, ikisi de sessiz:
 *
 *   · Öne çıkarılamayan bir gönderiyi çıkarılabilir göstermek → kullanıcı
 *     formu doldurur, yayına basar ve ham bir hatayla karşılaşır.
 *   · Öne çıkarılamayan bir gönderiyi LİSTEDEN GİZLEMEK → kullanıcı aradığı
 *     gönderiyi bulamaz ve senkronizasyonun bozuk olduğunu sanır.
 *
 * İkincisi daha sinsi olduğu için karar şu: hiçbir gönderi gizlenmiyor,
 * engelli olanlar SEBEBİYLE dönüyor.
 */

let h: Harness;
let svc: BoostsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const FB = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const IG = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const FB_UNLINKED = 'cccccccc-3333-3333-3333-cccccccccccc';

async function seedProfile(
  id: string,
  type: 'facebook_page' | 'instagram_business',
  linked = true,
): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, linked_ad_account_id, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, now())`,
    [
      id,
      IDS.org,
      IDS.client,
      IDS.connection,
      type,
      `ext-${id.slice(0, 8)}`,
      `Profil ${id.slice(0, 4)}`,
      linked ? IDS.adAccount : null,
    ],
  );
}

async function seedPost(
  id: string,
  profileId: string,
  publishedAt: string,
  boostedAt: string | null = null,
): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments, shares,
       saves, video_views, engagements, boosted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'photo', 'test', $6::timestamptz, 20000, 12000,
             400, 100, 50, 50, 0, 600, $7::timestamptz, now())`,
    // DIŞ KİMLİK SON HANEDEN: `organic_posts` (social_profile_id, external_id)
    // ikilisinde tekil ve test kimliklerinin ilk sekiz hanesi ortak.
    [id, IDS.org, IDS.client, profileId, `post-${id.slice(-4)}`, publishedAt, boostedAt],
  );
}

function postId(n: number): string {
  return `dddddddd-0000-0000-0000-00000000000${n}`;
}

beforeAll(async () => {
  h = await createHarness();
  svc = new BoostsService({
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

describe('listeleme ve sıra', () => {
  it('gönderiler TARİHE göre, yeniden eskiye', async () => {
    // Kural motoru en çok etkileşim alanı seçiyor çünkü kararı o veriyor.
    // Burada kararı kullanıcı veriyor ve aradığı gönderi neredeyse her zaman
    // "az önce paylaştığım" oluyor — kuralın asla seçemeyeceği yeni gönderi.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPost(postId(2), FB, '2026-08-14T12:00:00Z');
    await seedPost(postId(3), FB, '2026-08-12T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items.map((p) => p.id)).toEqual([postId(2), postId(3), postId(1)]);
  });

  it('KRİTİK: kesilen liste TOPLAMI söylüyor', async () => {
    // Sessiz kesme yok. İki satır gören kullanıcı bunun tamamı mı yoksa
    // kesilmiş bir liste mi olduğunu bilmek zorunda.
    await seedProfile(FB, 'facebook_page');
    for (let i = 1; i <= 5; i++) {
      await seedPost(postId(i), FB, `2026-08-1${i}T12:00:00Z`);
    }

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 2 });
    expect(out.items).toHaveLength(2);
    expect(out.total).toBe(5);
    expect(out.limit).toBe(2);
  });

  it('boş listede toplam sıfır', async () => {
    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out).toEqual({ items: [], total: 0, limit: 30 });
  });

  it('sayfa süzgeci uygulanıyor', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedProfile(IG, 'instagram_business');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await seedPost(postId(2), IG, '2026-08-11T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, {
      clientId: IDS.client,
      socialProfileId: FB,
      limit: 30,
    });
    expect(out.items).toHaveLength(1);
    expect(out.total).toBe(1);
  });

  it('etkileşim oranı hesaplanıyor, erişim sıfırsa null', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await h.q(`UPDATE organic_posts SET reach = 0 WHERE id = $1`, [postId(1)]);
    await seedPost(postId(2), FB, '2026-08-11T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    const [yeni, eski] = out.items;
    // 600 / 12.000 = %5
    expect(yeni!.engagementRate).toBeCloseTo(5);
    // Sıfır erişimde oran SIFIR DEĞİL, hesaplanamaz.
    expect(eski!.engagementRate).toBeNull();
  });
});

describe('engeller — gizlenmiyor, sebebiyle dönüyor', () => {
  it('öne çıkarılabilir gönderide engel de uyarı da YOK', async () => {
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toBeNull();
    expect(p!.warning).toBeNull();
    expect(p!.adAccountId).toBe(IDS.adAccount);
  });

  it('KRİTİK: Instagram gönderisi LİSTEDE ama engelli', async () => {
    // Gizlemek en kolay yol ve en kötüsü: kullanıcı Instagram gönderisini
    // aramaya geliyor, bulamıyor ve senkronizasyonun bozuk olduğunu sanıyor.
    await seedProfile(IG, 'instagram_business');
    await seedPost(postId(1), IG, '2026-08-10T12:00:00Z');

    const out = await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 });
    expect(out.items).toHaveLength(1);
    expect(out.items[0]!.profileType).toBe('instagram_business');
    expect(out.items[0]!.blockedReason).toMatch(/Instagram gönderileri henüz/i);
  });

  it('bağlı reklam hesabı olmayan sayfa engelli ve NE YAPILACAĞINI söylüyor', async () => {
    await seedProfile(FB_UNLINKED, 'facebook_page', false);
    await seedPost(postId(1), FB_UNLINKED, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toMatch(/reklam hesabı yok/i);
    expect(p!.blockedReason).toMatch(/Platform Bağlantıları/i);
    expect(p!.adAccountId).toBeNull();
  });

  it('KRİTİK: canlı boost’u olan gönderi engelli', async () => {
    // Kısmi tekil indeks ikinci canlı boost'u zaten reddediyor; ekranın bunu
    // YAYINDAN ÖNCE bilmesi gerekiyor, yoksa kullanıcı formu doldurup ham bir
    // kısıt ihlaliyle karşılaşır.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'candidate', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'canlı', now())`,
      [IDS.org, IDS.client, postId(1), IDS.adAccount],
    );

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toMatch(/zaten yayında ya da onay bekleyen/i);
  });

  it('REDDEDİLMİŞ boost engel SAYILMIYOR', async () => {
    // Kısmi tekil indeks yalnızca canlı durumları çakıştırıyor; reddedilmiş
    // bir boost sonrası gönderi yeniden öne çıkarılabilmeli.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z');
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'rejected', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'reddedildi', now())`,
      [IDS.org, IDS.client, postId(1), IDS.adAccount],
    );

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toBeNull();
  });

  it('ENGEL SIRASI: Instagram, bağlı hesap eksikliğinden önce geliyor', async () => {
    // Kullanıcı TEK bir sebep görüyor ve o sebep en temeli olmalı. "Bağlı
    // reklam hesabı yok" demek, çözülse bile işe yaramayacak bir işe
    // göndermek olurdu.
    await seedProfile(IG, 'instagram_business', false);
    await seedPost(postId(1), IG, '2026-08-10T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toMatch(/Instagram/i);
    expect(p!.blockedReason).not.toMatch(/reklam hesabı yok/i);
  });
});

describe('uyarı — engel değil (K20)', () => {
  it('KRİTİK: daha önce öne çıkarılmış gönderi UYARI alıyor, ENGEL DEĞİL', async () => {
    // Gönderiyi seçen kullanıcının kendisi; kararı geri çevirmek değil,
    // bilgilendirmek doğru. Kural yolunda aynı gönderi ikinci kez seçilmiyor
    // ve o kısıt yerinde duruyor.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z', '2026-08-12T12:00:00Z');

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).toBeNull();
    expect(p!.warning).toMatch(/daha önce/i);
    expect(p!.boostedAt).not.toBeNull();
  });

  it('canlı boost varken UYARI değil ENGEL yazıyor', async () => {
    // İkisi birden gösterilseydi kullanıcı hangisinin bağlayıcı olduğunu
    // bilemezdi.
    await seedProfile(FB, 'facebook_page');
    await seedPost(postId(1), FB, '2026-08-10T12:00:00Z', '2026-08-12T12:00:00Z');
    await h.q(
      // ONAYLI BOOST `approved_at` TAŞIMAK ZORUNDA — `boosts_approval_chk`.
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason,
         approved_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'approved', 100000000, 3,
               'OUTCOME_ENGAGEMENT', 'onaylı', now(), now())`,
      [IDS.org, IDS.client, postId(1), IDS.adAccount],
    );

    const [p] = (await svc.listBoostablePosts(CTX, { clientId: IDS.client, limit: 30 })).items;
    expect(p!.blockedReason).not.toBeNull();
    expect(p!.warning).toBeNull();
  });
});
