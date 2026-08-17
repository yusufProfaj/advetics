import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManualBoostInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { BoostExecutorService } from './boost-executor.service';
import { BoostsService } from './boosts.service';

/**
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

function input(over: Partial<ManualBoostInput> = {}): ManualBoostInput {
  return {
    clientId: IDS.client,
    organicPostId: POST,
    totalBudget: '300',
    durationDays: 5,
    targeting: {
      countries: ['TR'],
      cityKeys: [],
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
      get: () => ({ platform: 'meta', createBoost, canWrite, getSavedAudienceTargeting }),
    } as never,
    { getAccessToken: async () => 'token' } as never,
    { acquire: async () => ({ allowed: true, usagePercent: 5 }), record: async () => {} } as never,
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

// -----------------------------------------------------------------------------

describe('yayın', () => {
  it('gönderi öne çıkıyor ve kayıt YAYINDA dönüyor', async () => {
    const kayit = await svc.createManualBoost(CTX, input());
    expect(kayit.status).toBe('active');
    expect(kayit.externalAdId).toBe('ad-1');
    expect(createBoost).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: TOPLAM bütçe toplam olarak gidiyor', async () => {
    // Günlük sayılsaydı 300 TL beş günde 1.500 TL harcardı ve hiçbir hata
    // çıkmazdı — Meta günlük 300 TL'yi sorgusuz kabul eder.
    await svc.createManualBoost(CTX, input({ totalBudget: '300', durationDays: 5 }));
    expect(istek().budget).toEqual({ mode: 'lifetime', totalMicros: 300_000_000n });
  });

  it('ARA ONAY YOK — kayıt doğrudan yayına gidiyor', async () => {
    // Kural yolunda aday → onay → yayın var. Burada kararı zaten kullanıcı
    // verdi ve ikinci kez sormak, istenen akışı bozmak olurdu.
    await svc.createManualBoost(CTX, input());
    const [row] = await h.q<{ status: string; approved_by: string | null }>(
      `SELECT status, approved_by::text AS approved_by FROM boosts`,
    );
    expect(row!.status).toBe('active');
    // ONAYLAYAN KULLANICININ KENDİSİ. Kuralın otomatik onayında bu alan boş
    // kalıyor çünkü onaylayan bir insan yok; burada var.
    expect(row!.approved_by).toBe(IDS.user);
  });

  it('KURAL YOK — kaydın kuralı boş, kökeni "manual_boost"', async () => {
    await svc.createManualBoost(CTX, input());
    const [boost] = await h.q<{ boost_rule_id: string | null }>(
      `SELECT boost_rule_id::text AS boost_rule_id FROM boosts`,
    );
    expect(boost!.boost_rule_id).toBeNull();

    const [kampanya] = await h.q<{ source: string; budget_mode: string }>(
      `SELECT source, budget_mode FROM draft_campaigns`,
    );
    // Elle kurulmuş bir kampanyadan ayırt edilebilmeli: "bu harcama nereden
    // çıktı" sorusunda ikisi bambaşka iş.
    expect(kampanya!.source).toBe('manual_boost');
    expect(kampanya!.budget_mode).toBe('lifetime');
  });

  it('AĞACA YAZILIYOR — boost Reklamlar listesinde de duruyor', async () => {
    await svc.createManualBoost(CTX, input());
    const [ad] = await h.q<{ organic_post_id: string; creative_id: string | null }>(
      `SELECT organic_post_id::text AS organic_post_id, creative_id::text AS creative_id
       FROM draft_ads`,
    );
    expect(ad!.organic_post_id).toBe(POST);
    // Boost'un kreatifi yok: metni ve görseli zaten Meta'da.
    expect(ad!.creative_id).toBeNull();
  });

  it('gönderi BOOST EDİLDİ diye işaretleniyor', async () => {
    await svc.createManualBoost(CTX, input());
    const [post] = await h.q<{ boosted_at: Date | null }>(
      `SELECT boosted_at FROM organic_posts WHERE id = $1`,
      [POST],
    );
    expect(post!.boosted_at).not.toBeNull();
  });
});

describe('hedefleme', () => {
  it('şehir seçimi Meta nesnesine dönüşüyor', async () => {
    await svc.createManualBoost(
      CTX,
      input({
        targeting: {
          countries: ['TR'],
          cityKeys: ['2420351'],
          ageMin: 25,
          ageMax: 44,
          genders: 'female',
        },
      }),
    );
    expect(istek().targeting).toEqual({
      geo_locations: { countries: ['TR'], cities: [{ key: '2420351' }] },
      age_min: 25,
      age_max: 44,
      genders: [2],
    });
  });

  it('KRİTİK: 65 üst sınırı GÖNDERİLMİYOR', async () => {
    // Meta'da 65 "65 ve üzeri" demek. Alanı göndermek Ads Manager'da "18-65"
    // yazdırıyor ve kullanıcı 66 yaşındakilerin dışlandığını sanıyor.
    await svc.createManualBoost(CTX, input());
    expect((istek().targeting as Record<string, unknown>).age_max).toBeUndefined();
  });

  it('cinsiyet "hepsi" ise alan HİÇ gönderilmiyor', async () => {
    // Boş dizi göndermek Meta'da "hiç kimse" demek.
    await svc.createManualBoost(CTX, input());
    expect((istek().targeting as Record<string, unknown>).genders).toBeUndefined();
  });

  it('hedefleme KAYDEDİLİYOR — sonradan "kime gösterildi" sorulabilsin', async () => {
    await svc.createManualBoost(CTX, input({ targeting: { ...input().targeting, ageMin: 30 } }));
    const [row] = await h.q<{ targeting: Record<string, unknown> }>(
      `SELECT targeting FROM boosts`,
    );
    expect(row!.targeting.age_min).toBe(30);
  });
});

describe('kayıtlı kitle (K16)', () => {
  it('KRİTİK: kitlenin tanımı YAYIN ANINDA platformdan okunuyor', async () => {
    // Seçim anında çekip saklamak, kullanıcının Ads Manager'da bu arada
    // değiştirdiği kitlenin ESKİ hâlini göndermek olurdu.
    getSavedAudienceTargeting.mockResolvedValue({
      geo_locations: { countries: ['TR'] },
      interests: [{ id: '1', name: 'Mobilya' }],
    });

    await svc.createManualBoost(
      CTX,
      input({ targeting: { ...input().targeting, savedAudienceId: 'sa-1' } }),
    );

    expect(getSavedAudienceTargeting).toHaveBeenCalledWith(expect.anything(), 'sa-1');
    expect((istek().targeting as Record<string, unknown>).interests).toEqual([
      { id: '1', name: 'Mobilya' },
    ]);
  });

  it('KRİTİK: kitle bulunamazsa YAYIN DURUYOR, geniş hedeflemeye düşmüyor', async () => {
    // Geniş hedeflemeye düşmek, seçtiği kitleye reklam verdiğini sanan
    // kullanıcının parasını başka yere harcamak olur — ve hiçbir yerde
    // görünmez.
    getSavedAudienceTargeting.mockResolvedValue(null);

    await expect(
      svc.createManualBoost(
        CTX,
        input({ targeting: { ...input().targeting, savedAudienceId: 'silinmis' } }),
      ),
    ).rejects.toThrow(/kayıtlı kitle Meta.*bulunamadı/i);
    expect(createBoost).not.toHaveBeenCalled();
  });

  it('kitle seçilince elle hedefleme SAKLANMIYOR', async () => {
    // İkisini birden saklamak, yayın anında hangisinin kazanacağını kodun
    // sırasına bırakmak demek. Kısıt veritabanında da var.
    getSavedAudienceTargeting.mockResolvedValue({ geo_locations: { countries: ['TR'] } });
    await svc.createManualBoost(
      CTX,
      input({
        targeting: { countries: ['TR'], cityKeys: ['1'], ageMin: 25, ageMax: 44, genders: 'male', savedAudienceId: 'sa-1' },
      }),
    );

    const [row] = await h.q<{ targeting: unknown; saved_audience_id: string }>(
      `SELECT targeting, saved_audience_id FROM boosts`,
    );
    expect(row!.targeting).toBeNull();
    expect(row!.saved_audience_id).toBe('sa-1');
  });
});

describe('engeller — sunucuda da kontrol ediliyor', () => {
  it('KRİTİK: Instagram gönderisi ARTIK YAYINLANIYOR', async () => {
    // K17 kapandı. Bu test bir zamanlar reddedilmesini sınıyordu; artık
    // yayınlanması ve doğru kaynakla gitmesi sınanıyor.
    await seedProfile(IG, 'instagram_business');
    await seedPost(IG_POST, IG);

    const kayit = await svc.createManualBoost(CTX, input({ organicPostId: IG_POST }));
    expect(kayit.status).toBe('active');
    expect(istek().source).toMatchObject({
      surface: 'instagram',
      pageExternalId: '345736801957026',
    });
  });

  it('KRİTİK: ANA SAYFASI OLMAYAN Instagram gönderisi reddediliyor', async () => {
    // Liste ekranı düğmeyi kapatıyor ama API doğrudan çağrılabilir; üstelik
    // arada geçen sürede sayfa yenilenmemiş olabilir.
    await seedProfile(IG, 'instagram_business', true, null);
    await seedPost(IG_POST, IG);

    await expect(
      svc.createManualBoost(CTX, input({ organicPostId: IG_POST })),
    ).rejects.toThrow(/Hesapları yenile/i);
    expect(createBoost).not.toHaveBeenCalled();
  });

  it('canlı boost varken ikincisi açılamıyor', async () => {
    await svc.createManualBoost(CTX, input());
    createBoost.mockClear();

    await expect(svc.createManualBoost(CTX, input())).rejects.toThrow(
      /zaten yayında ya da onay bekleyen/i,
    );
    expect(createBoost).not.toHaveBeenCalled();
  });

  it('başka müşterinin gönderisi bulunamıyor', async () => {
    const other = '99999999-9999-9999-9999-999999999999';
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'D','d',now())`,
      [other, IDS.org],
    );
    await expect(
      svc.createManualBoost(CTX, input({ clientId: other })),
    ).rejects.toThrow(/bulunamadı/i);
  });
});

describe('platform hatası', () => {
  it('KRİTİK: hata METNİYLE çağırana dönüyor', async () => {
    // Kural yolunda hata kolona yazılıp listede sonra görülüyor; burada
    // kullanıcı düğmeye BASMIŞ ve ekranda bekliyor. "Bir şey oldu" demek,
    // bu projede tekrar tekrar çıkan sessiz hatanın arayüz karşılığı.
    createBoost.mockRejectedValue(new Error('(#100) Invalid parameter: targeting'));

    await expect(svc.createManualBoost(CTX, input())).rejects.toThrow(
      /Invalid parameter: targeting/,
    );
  });

  it('düşen boost kaydı DURUYOR ve sebebi yazılı', async () => {
    // Kayıt silinseydi kullanıcı neyi denediğini ve neden düştüğünü
    // göremezdi.
    createBoost.mockRejectedValue(new Error('(#100) Invalid parameter'));
    await expect(svc.createManualBoost(CTX, input())).rejects.toThrow();

    const [row] = await h.q<{ status: string; error: string }>(
      `SELECT status, error FROM boosts`,
    );
    expect(row!.status).toBe('failed');
    expect(row!.error).toMatch(/Invalid parameter/);
  });
});

describe('harcama özeti (K19)', () => {
  it('bu ayki taahhüt TOPLAM kipte de doğru sayılıyor', async () => {
    // Toplam bütçeli boost'ta çarpım YOK; 300 TL'lik bir boost beş gün sürse
    // de taahhüt 300 TL.
    await svc.createManualBoost(CTX, input({ totalBudget: '300', durationDays: 5 }));

    const ozet = await svc.spendSummary(CTX, IDS.client);
    expect(ozet.committedThisMonthMicros).toBe('300000000');
  });

  it('KRİTİK: aylık bütçe tanımlı değilse NULL, sıfır DEĞİL', async () => {
    // Sıfır yazmak ekranda "bütçe aşıldı" uyarısı üretirdi; oysa söylenecek
    // şey "bu müşteride aylık bütçe tanımlı değil".
    const ozet = await svc.spendSummary(CTX, IDS.client);
    expect(ozet.monthlyBudgetMicros).toBeNull();
  });

  it('tanımlıysa aylık bütçe dönüyor', async () => {
    await h.q(
      `INSERT INTO monthly_budgets (id, org_id, client_id, month, amount_micros, currency, updated_at)
       VALUES (gen_random_uuid(), $1, $2, date_trunc('month', now())::date, 5000000000, 'TRY', now())`,
      [IDS.org, IDS.client],
    );
    const ozet = await svc.spendSummary(CTX, IDS.client);
    expect(ozet.monthlyBudgetMicros).toBe('5000000000');
    expect(ozet.currency).toBe('TRY');
  });
});
