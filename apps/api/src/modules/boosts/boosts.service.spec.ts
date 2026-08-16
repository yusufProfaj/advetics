import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { BoostRuleInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
 * BoostsService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * NEDEN BU TESTLER: bu modül PARA TAAHHÜT EDİYOR. Modül 5'te yanlış karar
 * harcamayı durduruyordu; burada başlatıyor. En kritik iddialar:
 *
 *   1. Aylık tavan TAAHHÜT üzerinden hesaplanıyor, harcanan üzerinden değil.
 *   2. Aynı gönderi iki kez boost edilemiyor — veritabanı seviyesinde.
 *   3. Otomatik onay açıkken bile `approved_by` boş kalıyor: insan onayı ile
 *      makine onayı denetim kaydında ayırt edilebilir olmalı.
 */

let h: Harness;
let svc: BoostsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PROFILE = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOW = new Date('2026-08-07T12:00:00Z');

function ruleInput(over: Partial<BoostRuleInput> = {}): BoostRuleInput {
  return {
    name: 'İyi giden gönderileri boost et',
    clientId: IDS.client,
    socialProfileId: PROFILE,
    conditions: [{ metric: 'engagement_rate', operator: 'gte', value: 4 }],
    combinator: 'and',
    minPostAgeHours: 6,
    maxPostAgeHours: 72,
    dailyBudget: '500',
    durationDays: 3,
    objective: 'OUTCOME_ENGAGEMENT',
    monthlyCap: '4500',
    maxBoostsPerRun: 3,
    autoApprove: false,
    enabled: true,
    ...over,
  } as BoostRuleInput;
}

async function seedProfile(linkAccount = true): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id,
       name, linked_ad_account_id, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Ege Birlik Sayfa', $5, true, now())`,
    [PROFILE, IDS.org, IDS.client, IDS.connection, linkAccount ? IDS.adAccount : null],
  );
}

async function seedPost(params: {
  id: string;
  publishedAt: string;
  reach?: number;
  engagements?: number;
  boostedAt?: string | null;
}): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments, shares,
       saves, video_views, engagements, boosted_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'photo', 'test', $6::timestamptz, 20000, $7,
             100, 10, 5, 5, 0, $8, $9::timestamptz, now())`,
    [
      params.id,
      IDS.org,
      IDS.client,
      PROFILE,
      `post-${params.id}`,
      params.publishedAt,
      params.reach ?? 12_000,
      params.engagements ?? 600,
      params.boostedAt ?? null,
    ],
  );
}

/**
 * Elle boost yolu bu dosyada sınanmıyor (kendi testi var); yürütücü yalnızca
 * yapıcı bağımlılığını karşılıyor. Gerçek bir yürütücü vermek, bu testleri
 * ilgisiz bir bileşenin davranışına bağlardı.
 */
function executorStub(): BoostExecutorService {
  return {
    createOneApproved: async () => ({ ok: true as const }),
  } as unknown as BoostExecutorService;
}

beforeAll(async () => {
  h = await createHarness();
  svc = new BoostsService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    // ELLE BOOST YOLU BU TESTLERDE KULLANILMIYOR; yürütücü yalnızca
    // bağımlılığı karşılamak için veriliyor.
    executorStub(),
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

async function boostRows(): Promise<
  Array<{ id: string; status: string; approved_by: string | null; reason: string }>
> {
  return h.q(`SELECT id, status, approved_by, reason FROM boosts ORDER BY created_at`);
}

// -----------------------------------------------------------------------------

describe('kural kaydı', () => {
  it('oluşturuluyor', async () => {
    await seedProfile();
    const r = await svc.createRule(CTX, ruleInput());
    expect(r.name).toBe('İyi giden gönderileri boost et');
    expect(r.autoApprove).toBe(false);
    expect(r.dailyBudgetMicros).toBe('500000000');
  });

  it('KRİTİK: bağlı reklam hesabı yoksa kural KAYDEDİLMİYOR', async () => {
    // Boost faturalandırılamaz. Bunu kural kaydedilirken söylemek, ayda bir
    // "neden hiç boost açılmadı" sorusunu sordurmaktan iyi.
    await seedProfile(false);
    await expect(svc.createRule(CTX, ruleInput())).rejects.toThrow(/reklam hesabı yok/i);
  });

  it('başka müşterinin profiline kural yazılamaz', async () => {
    await seedProfile();
    const other = '99999999-9999-9999-9999-999999999999';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'D','d',now())`,
      [other, IDS.org],
    );
    await expect(
      svc.createRule(CTX, ruleInput({ clientId: other })),
    ).rejects.toThrow(/bu müşteriye bağlı değil/i);
  });

  it('AYLIK TAVAN tek boost maliyetinden küçükse veritabanı reddediyor', async () => {
    // 500 × 3 = 1.500 ₺; tavan 1.000 ₺ ise kural HİÇBİR ZAMAN boost açamaz.
    await seedProfile();
    await expect(
      h.q(
        `INSERT INTO boost_rules (id, org_id, client_id, name, conditions, combinator,
           daily_budget_micros, duration_days, monthly_cap_micros, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'kötü', '[{"metric":"likes"}]'::jsonb, 'and',
                 500000000, 3, 1000000000, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow();
  });

  it('YAŞ PENCERESİ ters olamaz', async () => {
    await seedProfile();
    await expect(
      h.q(
        `INSERT INTO boost_rules (id, org_id, client_id, name, conditions, combinator,
           daily_budget_micros, duration_days, monthly_cap_micros,
           min_post_age_hours, max_post_age_hours, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'ters', '[{"metric":"likes"}]'::jsonb, 'and',
                 500000000, 3, 4500000000, 100, 10, now())`,
        [IDS.org, IDS.client],
      ),
    ).rejects.toThrow();
  });
});

// -----------------------------------------------------------------------------

describe('aday üretimi', () => {
  it('eşleşen gönderi ADAY oluyor, platforma dokunulmuyor', async () => {
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    const rule = await svc.createRule(CTX, ruleInput());

    const out = await svc.runRule(h.db, rule.id, NOW);
    expect(out.created).toBe(1);

    const rows = await boostRows();
    expect(rows[0]?.status).toBe('candidate');
    expect(rows[0]?.reason).toContain('Etkileşim oranı');
  });

  it('OTOMATİK ONAYDA approved_by BOŞ kalıyor', async () => {
    // İnsan onayı ile makine onayı denetim kaydında ayırt edilebilir olmalı.
    // Kuralın kimliğini buraya yazmak o ayrımı yok ederdi.
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    const rule = await svc.createRule(CTX, ruleInput({ autoApprove: true }));

    await svc.runRule(h.db, rule.id, NOW);
    const rows = await boostRows();
    expect(rows[0]?.status).toBe('approved');
    expect(rows[0]?.approved_by).toBeNull();
  });

  it('eşleşmeyen gönderi aday olmuyor', async () => {
    await seedProfile();
    // 12.000 erişim, 100 etkileşim = %0,83
    await seedPost({
      id: '11111111-0000-0000-0000-000000000001',
      publishedAt: '2026-08-06T12:00:00Z',
      engagements: 100,
    });
    const rule = await svc.createRule(CTX, ruleInput());
    expect((await svc.runRule(h.db, rule.id, NOW)).created).toBe(0);
  });

  it('ÇOK YENİ gönderi aday olmuyor', async () => {
    await seedProfile();
    await seedPost({
      id: '11111111-0000-0000-0000-000000000001',
      publishedAt: '2026-08-07T09:00:00Z',
    });
    const rule = await svc.createRule(CTX, ruleInput());
    expect((await svc.runRule(h.db, rule.id, NOW)).created).toBe(0);
  });

  it('DAHA ÖNCE BOOST EDİLMİŞ gönderi aday olmuyor', async () => {
    await seedProfile();
    await seedPost({
      id: '11111111-0000-0000-0000-000000000001',
      publishedAt: '2026-08-06T12:00:00Z',
      boostedAt: '2026-08-06T18:00:00Z',
    });
    const rule = await svc.createRule(CTX, ruleInput());
    expect((await svc.runRule(h.db, rule.id, NOW)).created).toBe(0);
  });

  it('TUR SINIRI uygulanıyor', async () => {
    await seedProfile();
    for (let i = 1; i <= 4; i++) {
      await seedPost({
        id: `1111111${i}-0000-0000-0000-00000000000${i}`,
        publishedAt: '2026-08-06T12:00:00Z',
      });
    }
    // Tavan 4 boost'a yetiyor ama tur sınırı 2.
    const rule = await svc.createRule(CTX, ruleInput({ maxBoostsPerRun: 2, monthlyCap: '9000' }));
    expect((await svc.runRule(h.db, rule.id, NOW)).created).toBe(2);
  });
});

// -----------------------------------------------------------------------------

describe('aylık harcama tavanı', () => {
  it('KRİTİK: TAAHHÜT üzerinden hesaplanıyor, harcanan üzerinden değil', async () => {
    // Tavan 4.500 ₺, boost başına 1.500 ₺ → tam 3 boost sığıyor.
    // Yalnızca "bugüne kadar harcanan" sayılsaydı, her gün "hâlâ yerimiz var"
    // denip ay sonunda tavanın katları taahhüt edilirdi.
    await seedProfile();
    for (let i = 1; i <= 5; i++) {
      await seedPost({
        id: `1111111${i}-0000-0000-0000-00000000000${i}`,
        publishedAt: '2026-08-06T12:00:00Z',
      });
    }
    const rule = await svc.createRule(CTX, ruleInput({ maxBoostsPerRun: 10 }));
    const out = await svc.runRule(h.db, rule.id, NOW);

    expect(out.created).toBe(3);
    expect(out.cappedOut).toBe(2);
    // SESSİZCE DURMUYOR — tavan doldu bilgisi notlarda.
    expect(out.notes.join(' ')).toContain('tavana takıldı');
  });

  it('İKİNCİ TURDA tavan hâlâ dolu', async () => {
    await seedProfile();
    for (let i = 1; i <= 5; i++) {
      await seedPost({
        id: `1111111${i}-0000-0000-0000-00000000000${i}`,
        publishedAt: '2026-08-06T12:00:00Z',
      });
    }
    const rule = await svc.createRule(CTX, ruleInput({ maxBoostsPerRun: 10 }));
    await svc.runRule(h.db, rule.id, NOW);
    const second = await svc.runRule(h.db, rule.id, NOW);
    expect(second.created).toBe(0);
  });

  it('REDDEDİLEN boost tavanı işgal ETMİYOR', async () => {
    // Para taahhüt edilmedi. Saymak, bir kez reddedilen adayın tavanı ay
    // boyunca kilitlemesi demek olurdu.
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    await seedPost({ id: '11111111-0000-0000-0000-000000000002', publishedAt: '2026-08-06T12:00:00Z' });
    await seedPost({ id: '11111111-0000-0000-0000-000000000003', publishedAt: '2026-08-06T12:00:00Z' });
    await seedPost({ id: '11111111-0000-0000-0000-000000000004', publishedAt: '2026-08-06T12:00:00Z' });

    const rule = await svc.createRule(CTX, ruleInput({ maxBoostsPerRun: 10 }));
    await svc.runRule(h.db, rule.id, NOW);

    const rows = await boostRows();
    expect(rows).toHaveLength(3);
    await svc.decide(CTX, rows[0]!.id, false);

    // Reddedilen serbest bıraktı → dördüncü gönderi artık sığıyor.
    const after = await svc.runRule(h.db, rule.id, NOW);
    expect(after.created).toBe(1);
  });

  it('kural kaydında bu ayki taahhüt görünüyor', async () => {
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    const rule = await svc.createRule(CTX, ruleInput());
    await svc.runRule(h.db, rule.id, NOW);

    const after = await svc.getRule(CTX, rule.id);
    expect(after.committedThisMonthMicros).toBe('1500000000');
  });
});

// -----------------------------------------------------------------------------

describe('tekillik', () => {
  it('KRİTİK: aynı gönderi için ikinci CANLI boost açılamıyor', async () => {
    // İki worker aynı anda çalışırsa ya da tur tekrarlanırsa bütçe iki
    // katına çıkardı. Kısıt veritabanında.
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    const rule = await svc.createRule(CTX, ruleInput());
    await svc.runRule(h.db, rule.id, NOW);

    await expect(
      h.q(
        `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
           status, daily_budget_micros, duration_days, objective, reason, updated_at)
         VALUES (gen_random_uuid(), $1, $2, $3, $4, 'candidate', 500000000, 3,
                 'OUTCOME_ENGAGEMENT', 'ikinci', now())`,
        [IDS.org, IDS.client, '11111111-0000-0000-0000-000000000001', IDS.adAccount],
      ),
    ).rejects.toThrow();
  });

  it('REDDEDİLMİŞ boost sonrası yeniden aday olunabiliyor', async () => {
    // Bir kez reddedilen gönderi sonsuza kadar kilitli kalmamalı.
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    const rule = await svc.createRule(CTX, ruleInput());
    await svc.runRule(h.db, rule.id, NOW);

    const rows = await boostRows();
    await svc.decide(CTX, rows[0]!.id, false);
    expect((await svc.runRule(h.db, rule.id, NOW)).created).toBe(1);
  });
});

// -----------------------------------------------------------------------------

describe('onay akışı', () => {
  async function seedCandidate(): Promise<string> {
    await seedProfile();
    await seedPost({ id: '11111111-0000-0000-0000-000000000001', publishedAt: '2026-08-06T12:00:00Z' });
    const rule = await svc.createRule(CTX, ruleInput());
    await svc.runRule(h.db, rule.id, NOW);
    return (await boostRows())[0]!.id;
  }

  it('onaylayan kaydediliyor', async () => {
    const id = await seedCandidate();
    const b = await svc.decide(CTX, id, true);
    expect(b.status).toBe('approved');
    expect(b.approvedAt).not.toBeNull();

    const rows = await boostRows();
    expect(rows[0]?.approved_by).toBe(IDS.user);
  });

  it('KRİTİK: onaylanmış boost tekrar onaylanamıyor', async () => {
    // Yalnızca `candidate` durumundan geçiş var. Zaten oluşturulmuş bir
    // boost'u "reddetmek" platformdaki kampanyayı durdurmuyor ve kaydı
    // gerçekle çelişir hâle getirirdi.
    const id = await seedCandidate();
    await svc.decide(CTX, id, true);
    await expect(svc.decide(CTX, id, false)).rejects.toThrow(/onay bekleyen/i);
  });

  it('TOPLAM bütçe listede görünüyor', async () => {
    // "500 ₺/gün" ile "1.500 ₺ taahhüt" farklı bilgiler; onay veren kişi
    // ikincisini görmeli.
    const id = await seedCandidate();
    const rows = await svc.listBoosts(CTX, { clientId: IDS.client });
    const b = rows.find((r) => r.id === id);
    expect(b?.dailyBudgetMicros).toBe('500000000');
    expect(b?.totalBudgetMicros).toBe('1500000000');
  });

  it('ONAY BEKLEYENLER listede EN ÜSTTE', async () => {
    const id = await seedCandidate();
    await svc.decide(CTX, id, true);
    await seedPost({ id: '11111111-0000-0000-0000-000000000002', publishedAt: '2026-08-06T12:00:00Z' });
    const rules = await svc.listRules(CTX, IDS.client);
    await svc.runRule(h.db, rules[0]!.id, NOW);

    const list = await svc.listBoosts(CTX, { clientId: IDS.client });
    expect(list[0]?.status).toBe('candidate');
  });
});
