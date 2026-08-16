import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { BoostRuleInput, TenantContext } from '@advetics/shared';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
 * INSTAGRAM GÖNDERİSİ BOOST EDİLEMİYOR — üç katman da bunu söylemeli.
 *
 * NEDEN BU TESTLER VAR: engelin kendisi geçici (K17 gelince kalkacak), ama
 * kalkana kadar SESSİZCE AÇILMAMALI. Engelin açılma yolu bugün çok kısa —
 * bir `profile_type` süzgecinin unutulması ya da bir dizge karşılaştırmasında
 * yazım hatası yeter, ve ikisi de hiçbir yerde hata üretmez: Meta'ya
 * `"<ig_user_id>_<ig_media_id>"` gider, çağrı 200 dönebilir, para harcanır ve
 * kullanıcı yanlış gönderiyi öne çıkardığını hiçbir ekranda göremez.
 *
 * ÜÇ KATMAN VE ÜÇÜ DE GEREKLİ:
 *
 *   1. Kural kaydı — Instagram profili AÇIKÇA seçilirse reddediyor.
 *   2. Aday üretimi — profil seçilmemiş kural bütün profilleri tarıyor;
 *      Instagram gönderisi atlanıyor ama SAYILARAK.
 *   3. Yürütücü — bu düzeltmeden ÖNCE oluşmuş `approved` kayıtlar için son
 *      savunma hattı. Bu katman olmasaydı veritabanında bekleyen bir aday
 *      düzeltmeden sonra da platforma giderdi.
 *
 * Ayrıntı: `docs/TASARIM-OLUSTUR.md` §7.2 ve K17.
 */

let h: Harness;
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
 * Profil ekler. `externalId` KASITLI OLARAK farklı biçimlerde: Instagram'da
 * bu değer sayfa kimliği değil IG kullanıcı kimliği ve hatanın kaynağı tam
 * olarak bu ayrım.
 */
async function seedProfile(
  id: string,
  type: 'facebook_page' | 'instagram_business',
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
      type === 'instagram_business' ? 'ig-user-1' : 'page-1',
      type === 'instagram_business' ? 'Ege Birlik IG' : 'Ege Birlik Sayfa',
      IDS.adAccount,
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
  boosts = new BoostsService(
    {
      withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
    } as unknown as PrismaService,
    // ELLE BOOST YOLU BU TESTLERDE KULLANILMIYOR; yürütücü yalnızca
    // bağımlılığı karşılamak için veriliyor.
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

// -----------------------------------------------------------------------------

describe('1. katman — kural kaydı', () => {
  it('KRİTİK: Instagram profiline kural KURULAMIYOR', async () => {
    // Doğrulama kullanım anında değil GİRİŞ anında. Kural kurulabilseydi
    // kullanıcı bunu ancak "neden hiç boost açılmadı" diye sorduğunda
    // öğrenirdi.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await expect(
      boosts.createRule(CTX, ruleInput({ socialProfileId: IG_PROFILE })),
    ).rejects.toThrow(/Instagram gönderileri henüz öne çıkarılamıyor/i);
  });

  it('hata mesajı NE YAPILACAĞINI söylüyor', async () => {
    // "Desteklenmiyor" tek başına kullanıcıyı ekranda çözüm ararken bırakır.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await expect(
      boosts.createRule(CTX, ruleInput({ socialProfileId: IG_PROFILE })),
    ).rejects.toThrow(/Facebook sayfa/i);
  });

  it('Instagram profiline kural GÜNCELLENEMİYOR de', async () => {
    // Yalnızca `createRule` korunsaydı, Facebook'a kurulmuş bir kuralı
    // sonradan Instagram'a taşımak engeli tamamen atlardı.
    await seedProfile(FB_PROFILE, 'facebook_page');
    await seedProfile(IG_PROFILE, 'instagram_business');
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: FB_PROFILE }));

    await expect(
      boosts.updateRule(CTX, rule.id, ruleInput({ socialProfileId: IG_PROFILE })),
    ).rejects.toThrow(/Instagram gönderileri henüz öne çıkarılamıyor/i);
  });

  it('Facebook sayfasına kural KURULABİLİYOR — engel yalnızca Instagram’a', async () => {
    await seedProfile(FB_PROFILE, 'facebook_page');
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: FB_PROFILE }));
    expect(rule.id).toBeTruthy();
  });
});

// -----------------------------------------------------------------------------

describe('2. katman — aday üretimi', () => {
  it('KRİTİK: profil seçilmemiş kural Instagram gönderisini ADAY YAPMIYOR', async () => {
    // `social_profile_id` boş = müşterinin BÜTÜN profilleri. 1. katman bu yolu
    // görmüyor; süzgeç burada olmasaydı Instagram gönderisi onay kuyruğuna
    // düşerdi.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: null }));

    const out = await boosts.runRule(h.db, rule.id, NOW);
    expect(out.created).toBe(0);
    expect(await h.q(`SELECT id FROM boosts`)).toHaveLength(0);
  });

  it('KRİTİK: atlanan gönderi SAYILIYOR ve sebebi yazılıyor', async () => {
    // Sessiz kesme yok. Sayı ve sebep olmadan kullanıcı "kural çalışmıyor"
    // sanır — oysa kural çalıştı, gönderi seçildi ve engel başka yerde.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    const rule = await boosts.createRule(CTX, ruleInput({ socialProfileId: null }));

    const out = await boosts.runRule(h.db, rule.id, NOW);
    expect(out.notes.join(' ')).toMatch(/1 gönderi ölçütleri geçti ama Instagram'da/);
    expect(out.notes.join(' ')).toMatch(/Instagram gönderileri henüz öne çıkarılamıyor/i);
  });

  it('ÖLÇÜTÜ GEÇMEYEN Instagram gönderisi sayıya girmiyor', async () => {
    // Zaten boost edilmeyecek gönderileri "atlandı" diye bildirmek,
    // kullanıcıya kaybettiği bir şey varmış hissi verir. Buradaki sayı
    // gerçekten boost edilecekken engellenmiş gönderilerin sayısı olmalı.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    const rule = await boosts.createRule(
      CTX,
      // Ölçüt 5.000 etkileşim; gönderide 600 var.
      ruleInput({
        socialProfileId: null,
        conditions: [{ metric: 'engagements', operator: 'gte', value: 5000 }],
      }),
    );

    const out = await boosts.runRule(h.db, rule.id, NOW);
    expect(out.notes.join(' ')).not.toMatch(/Instagram/i);
  });

  it('AYNI TURDA Facebook gönderisi aday oluyor, Instagram olmuyor', async () => {
    // Engel turu durdurmuyor: bir Instagram gönderisi yüzünden Facebook
    // gönderilerinin de atlanması, çalışan davranışı bozmak olurdu.
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

// -----------------------------------------------------------------------------

describe('3. katman — yürütücü', () => {
  /**
   * Düzeltmeden ÖNCE oluşmuş bir aday: aday üretimi o gün Instagram'ı
   * eliyor olmadığı için `approved` bir satır veritabanında duruyor olabilir.
   * Doğrudan INSERT ediliyor, çünkü artık `runRule` bunu üretemiyor.
   */
  async function eskiOnayliBoost(): Promise<void> {
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason,
         approved_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'approved', 500000000, 3,
               'OUTCOME_ENGAGEMENT', 'düzeltmeden önce onaylanmış', now(), now())`,
      [IDS.org, IDS.client, IG_POST, IDS.adAccount],
    );
  }

  it('KRİTİK: eski onaylı Instagram boost’u PLATFORMA GİTMİYOR', async () => {
    // Bu testin tek iddiası bu: `createBoost` HİÇ çağrılmamalı. Çağrılırsa
    // Meta'ya iki parçası da yanlış uzaydan gelen bir kimlik gider.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    await eskiOnayliBoost();

    const out = await executor.createApproved(h.db, IDS.client);
    expect(out).toEqual({ created: 0, failed: 1 });
    expect(createBoost).not.toHaveBeenCalled();
  });

  it('sebep KAYDA yazılıyor, yalnızca log’a değil', async () => {
    // Panelde "başarısız" yazıp sebebini söylememek, kullanıcıyı hatayı
    // kendi kurulumunda aramaya gönderir.
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    await eskiOnayliBoost();
    await executor.createApproved(h.db, IDS.client);

    const [row] = await h.q<{ status: string; error: string }>(
      `SELECT status, error FROM boosts`,
    );
    expect(row!.status).toBe('failed');
    expect(row!.error).toMatch(/Instagram gönderileri henüz öne çıkarılamıyor/i);
  });

  it('Facebook boost’u yürütücüden GEÇİYOR — engel yalnızca Instagram’a', async () => {
    await seedProfile(FB_PROFILE, 'facebook_page');
    await seedPost(FB_POST, FB_PROFILE);
    await h.q(
      `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id,
         status, daily_budget_micros, duration_days, objective, reason,
         approved_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'approved', 500000000, 3,
               'OUTCOME_ENGAGEMENT', 'facebook', now(), now())`,
      [IDS.org, IDS.client, FB_POST, IDS.adAccount],
    );

    const out = await executor.createApproved(h.db, IDS.client);
    expect(out).toEqual({ created: 1, failed: 0 });
    expect(createBoost).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: engel KOTA ALINMADAN önce çalışıyor', async () => {
    // Hiçbir zaman yapılamayacak bir iş için kota yakmak, aynı turdaki
    // gerçek boost'ları sıraya atmak demek.
    const acquire = vi.fn(async () => ({ allowed: true, usagePercent: 5 }));
    const kotali = new BoostExecutorService(
      { get: () => ({ platform: 'meta', createBoost, canWrite }) } as never,
      { getAccessToken: async () => 'token' } as never,
      { acquire, record: async () => {} } as never,
    );
    await seedProfile(IG_PROFILE, 'instagram_business');
    await seedPost(IG_POST, IG_PROFILE);
    await eskiOnayliBoost();

    await kotali.createApproved(h.db, IDS.client);
    expect(acquire).not.toHaveBeenCalled();
  });
});
