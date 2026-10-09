import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleProvider } from './google.provider';
import { PlatformApiError, type VideoBoostIstegi } from '../provider.types';
import { VARSAYILAN_KONUM, googleAlanHatalari } from './google-demandgen';

/**
 * ═══ YOUTUBE YAYINI: TEK ATOMİK İSTEK ═══
 *
 * Eskiden yedi ayrı çağrı ve hata hâlinde elle geri alma vardı; geri alma
 * da düşebiliyordu ve hesapta yarım kampanya kalıyordu (plan P3/P4). Artık
 * hepsi TEK `googleAds:mutate` isteği: Google ya hepsini kuruyor ya
 * hiçbirini. Bu dosya Google'a GİDEN isteği kilitliyor: tek istek, işlem
 * sırası, geçici kimliklerin birbirine bağlanması, konum, yaş, logo ve
 * prova bayrağı.
 *
 * `fetch` global olarak yamanıyor ve her çağrı kaydediliyor.
 */
interface Cagri {
  url: string;
  govde: { mutateOperations: Array<Record<string, { create?: Record<string, unknown> }>>; partialFailure: boolean; validateOnly: boolean };
  giris: string | null;
}

let cagrilar: Cagri[];
let yanit: { ok: boolean; status: number; body: unknown };
let orijinal: typeof fetch;

function provider(): GoogleProvider {
  return new GoogleProvider({
    platforms: { google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v25' } },
  } as never);
}

const ISTEK: VideoBoostIstegi = {
  name: 'Ege Birlik — Video',
  dailyBudgetMicros: 100_000_000n,
  durationDays: 3,
  videoId: 'abcdefghijk',
  videoTitle: 'Yeni proje',
  logo: { resource: 'customers/123/assets/9' },
  businessName: 'Ege Birlik',
  finalUrl: 'https://egebirlik.com/',
  headlines: ['Yeni proje'],
  longHeadlines: ['Yeni proje videosu'],
  descriptions: ['Ege Birlik kanalında yeni video'],
  konumlar: [VARSAYILAN_KONUM],
  yaslar: [],
};

/** Gerçek Google yanıtının biçimi: işlem sırasıyla tek anahtarlı sonuçlar. */
function basariliYanit(n: number): unknown {
  const tur = ['campaignBudgetResult', 'campaignResult'];
  return {
    mutateOperationResponses: Array.from({ length: n }, (_, i) => ({
      [tur[i] ?? `sonuc${i}`]: { resourceName: `customers/123/x/${i}` },
    })),
  };
}

beforeEach(() => {
  cagrilar = [];
  yanit = { ok: true, status: 200, body: null };
  orijinal = globalThis.fetch;
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const govde = JSON.parse(String(init?.body ?? '{}')) as Cagri['govde'];
    const basliklar = (init?.headers ?? {}) as Record<string, string>;
    cagrilar.push({ url: String(url), govde, giris: basliklar['login-customer-id'] ?? null });
    const body = yanit.body ?? basariliYanit(govde.mutateOperations.length);
    return new Response(JSON.stringify(body), { status: yanit.status });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = orijinal;
  vi.restoreAllMocks();
});

const ctx = { accessToken: 'T', accountExternalId: '123' };
const turler = (c: Cagri) => c.govde.mutateOperations.map((o) => Object.keys(o)[0]);
const op = (c: Cagri, tur: string, kacinci = 0) =>
  c.govde.mutateOperations.filter((o) => Object.keys(o)[0] === tur)[kacinci]?.[tur]?.create as Record<string, unknown>;

describe('KRİTİK: tek atomik istek', () => {
  it('KRİTİK: TEK çağrı, googleAds:mutate, kısmi başarı KAPALI', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(cagrilar).toHaveLength(1);
    expect(cagrilar[0]!.url).toMatch(/\/v25\/customers\/123\/googleAds:mutate$/);
    expect(cagrilar[0]!.govde.partialFailure).toBe(false);
    expect(cagrilar[0]!.govde.validateOnly).toBe(false);
  });

  it('işlem sırası: bütçe → kampanya → grup → konum → video → reklam', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(turler(cagrilar[0]!)).toEqual([
      'campaignBudgetOperation',
      'campaignOperation',
      'adGroupOperation',
      'adGroupCriterionOperation',
      'assetOperation',
      'adGroupAdOperation',
    ]);
  });

  it('KRİTİK: geçici kimlikler birbirine bağlı (bütçe→kampanya→konum/grup→reklam, video→reklam)', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    const c = cagrilar[0]!;
    const butce = op(c, 'campaignBudgetOperation');
    const kampanya = op(c, 'campaignOperation');
    const konum = op(c, 'adGroupCriterionOperation');
    const grup = op(c, 'adGroupOperation');
    const video = op(c, 'assetOperation');
    const reklam = op(c, 'adGroupAdOperation');
    expect(butce.resourceName).toBe('customers/123/campaignBudgets/-1');
    expect(kampanya.campaignBudget).toBe(butce.resourceName);
    // KONUM GRUBA BAĞLI (ilk canlı prova kampanya seviyesini reddetti).
    expect(konum.adGroup).toBe(grup.resourceName);
    expect(konum.campaign).toBeUndefined();
    expect(grup.campaign).toBe(kampanya.resourceName);
    expect(reklam.adGroup).toBe(grup.resourceName);
    const dg = (reklam.ad as { demandGenVideoResponsiveAd: { videos: Array<{ asset: string }>; logoImages: Array<{ asset: string }> } })
      .demandGenVideoResponsiveAd;
    expect(dg.videos[0]!.asset).toBe(video.resourceName);
    expect(dg.logoImages[0]!.asset).toBe('customers/123/assets/9');
  });

  it('kampanya varsayılan AÇIK; istenirse DURAKLATILMIŞ (ilk canlı deneme)', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(op(cagrilar[0]!, 'campaignOperation').status).toBe('ENABLED');
    await provider().createVideoBoost(ctx, ISTEK, { acilis: 'PAUSED' });
    expect(op(cagrilar[1]!, 'campaignOperation').status).toBe('PAUSED');
  });

  it('KRİTİK: konum AÇIKÇA gidiyor — boş liste isteği hiç kurmuyor', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(op(cagrilar[0]!, 'adGroupCriterionOperation').location).toEqual({ geoTargetConstant: VARSAYILAN_KONUM });
    // Kampanya seviyesinde konum ÖLÇÜTÜ KALMADI — ikisi birden gitseydi
    // istek yine reddedilirdi.
    expect(turler(cagrilar[0]!)).not.toContain('campaignCriterionOperation');
    await expect(provider().createVideoBoost(ctx, { ...ISTEK, konumlar: [] })).rejects.toThrow(/bütün ülkelere/);
    expect(cagrilar).toHaveLength(1);
  });

  it('yaş kısıtı: kitle oluşturulup gruba bağlanıyor, grup kitle gruplamalı', async () => {
    await provider().createVideoBoost(ctx, { ...ISTEK, yaslar: ['AGE_RANGE_25_34', 'AGE_RANGE_35_44'] });
    const c = cagrilar[0]!;
    expect(turler(c)).toContain('audienceOperation');
    const kitle = op(c, 'audienceOperation');
    // Gruptaki İLK ölçüt konum (2026-10-09'dan beri), kitle bağı İKİNCİ.
    expect(op(c, 'adGroupCriterionOperation', 0).location).toEqual({ geoTargetConstant: VARSAYILAN_KONUM });
    const bag = op(c, 'adGroupCriterionOperation', 1);
    expect(bag.audience).toEqual({ audience: kitle.resourceName });
    expect(bag.adGroup).toBe(op(c, 'adGroupOperation').resourceName);
    expect(op(c, 'adGroupOperation').audienceSetting).toEqual({ useAudienceGrouped: true });
    expect(kitle.dimensions).toEqual([{ age: { ageRanges: [{ minAge: 25, maxAge: 44 }], includeUndetermined: false } }]);
  });

  it('yaş kısıtı yoksa kitle de yok', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(turler(cagrilar[0]!)).not.toContain('audienceOperation');
  });

  it('KRİTİK: yönetici kimliği login-customer-id olarak gidiyor', async () => {
    await provider().createVideoBoost({ ...ctx, loginCustomerId: '999' }, ISTEK);
    expect(cagrilar[0]!.giris).toBe('999');
  });

  it('video varlığının adı zaman damgalı (ikinci boost DUPLICATE_ASSET_NAME almasın)', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(String(op(cagrilar[0]!, 'assetOperation').name)).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});

describe('logo: kayıtlı ya da aynı istekte yeni', () => {
  it('yeni logo AYNI istekte oluşturuluyor ve reklam ona bağlanıyor; kaynak adı dönüyor', async () => {
    const r = await provider().createVideoBoost(ctx, {
      ...ISTEK,
      logo: { yeniGorsel: { name: 'Ege logo', bytes: Buffer.from('png') } },
    });
    const c = cagrilar[0]!;
    const logo = op(c, 'assetOperation', 1);
    expect(logo).toMatchObject({ type: 'IMAGE', imageAsset: { data: Buffer.from('png').toString('base64') } });
    const dg = (op(c, 'adGroupAdOperation').ad as { demandGenVideoResponsiveAd: { logoImages: Array<{ asset: string }> } })
      .demandGenVideoResponsiveAd;
    expect(dg.logoImages[0]!.asset).toBe(logo.resourceName);
    // Yanıt işlem sırasıyla; logonun sonucu kendi sırasından okunuyor.
    expect(r.logoAssetResource).toBe(`customers/123/x/${turler(c).lastIndexOf('assetOperation')}`);
  });

  it('kayıtlı logoda yeni varlık yok ve dönen logo null', async () => {
    const r = await provider().createVideoBoost(ctx, ISTEK);
    expect(turler(cagrilar[0]!).filter((t) => t === 'assetOperation')).toHaveLength(1);
    expect(r.logoAssetResource).toBeNull();
  });
});

describe('yanıt', () => {
  it('kaynak adları işlem sırasından okunuyor', async () => {
    const r = await provider().createVideoBoost(ctx, ISTEK);
    expect(r).toEqual({
      campaignId: 'customers/123/x/1',
      // Grup artık üçüncü işlem (konum gruptan SONRA geliyor).
      adGroupId: 'customers/123/x/2',
      adId: 'customers/123/x/5',
      logoAssetResource: null,
    });
  });

  it('KRİTİK: 200 ama sonuç eksikse başarı DEĞİL ve hata "belirsiz" (transient) — kart kontrol olur', async () => {
    yanit.body = { mutateOperationResponses: [] };
    const hata = await provider().createVideoBoost(ctx, ISTEK).catch((e: unknown) => e);
    expect(hata).toBeInstanceOf(PlatformApiError);
    expect((hata as PlatformApiError).kind).toBe('transient');
  });

  it('KRİTİK: ret hâlinde geri alma çağrısı YOK — tek istek, hiçbir şey kurulmadı', async () => {
    yanit = { ok: false, status: 400, body: { error: { message: 'Request contains an invalid argument.', status: 'INVALID_ARGUMENT' } } };
    await expect(provider().createVideoBoost(ctx, ISTEK)).rejects.toBeInstanceOf(PlatformApiError);
    expect(cagrilar).toHaveLength(1);
  });
});

describe('KRİTİK: prova — aynı gövde, validateOnly', () => {
  it('prova ile yayın gövdesi validateOnly DIŞINDA aynı', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    yanit.body = {};
    await provider().videoBoostProva(ctx, ISTEK);
    const [yayin, prova] = cagrilar;
    expect(prova!.govde.validateOnly).toBe(true);
    const temizle = (c: Cagri) =>
      JSON.stringify({ ...c.govde, validateOnly: null }).replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}/g, 'T');
    expect(temizle(prova!)).toBe(temizle(yayin!));
  });

  it('prova boş yanıtı başarı sayıyor ve işlem sayısını dönüyor', async () => {
    yanit.body = {};
    await expect(provider().videoBoostProva(ctx, ISTEK)).resolves.toEqual({ islemSayisi: 6 });
  });

  it('Google ret gövdesinden BÜTÜN hatalar alan yoluyla okunuyor', () => {
    const raw = {
      error: {
        details: [
          {
            errors: [
              {
                errorCode: { stringLengthError: 'TOO_LONG' },
                message: 'Too long.',
                location: {
                  fieldPathElements: [
                    { fieldName: 'mutate_operations', index: 5 },
                    { fieldName: 'ad_group_ad_operation' },
                    { fieldName: 'create' },
                    { fieldName: 'headlines', index: 0 },
                  ],
                },
              },
              { errorCode: { campaignError: 'INVALID_DATE' }, message: 'Bad date.' },
            ],
          },
        ],
      },
    };
    expect(googleAlanHatalari(raw)).toEqual([
      {
        kod: 'stringLengthError=TOO_LONG',
        mesaj: 'Too long.',
        alan: 'mutate_operations[5].ad_group_ad_operation.create.headlines[0]',
        islemSirasi: 5,
        ayrinti: null,
      },
      { kod: 'campaignError=INVALID_DATE', mesaj: 'Bad date.', alan: null, islemSirasi: null, ayrinti: null },
    ]);
  });

  it('KRİTİK: hatanın `details` ve `trigger` alanları ATILMIYOR (asgari bütçe tutarı orada)', () => {
    // İlk canlı prova (2026-10-09) "asgari tutarın altında" dedi ve tutarı
    // yalnız `details` taşıyordu; ayrıştırıcı onu atıyordu. Alt alan adları
    // belgede net değil — biçimle okunuyor (`...Micros` + `currencyCode`).
    const raw = {
      error: {
        details: [
          {
            errors: [
              {
                errorCode: { campaignBudgetError: 'BUDGET_BELOW_PER_DAY_MINIMUM' },
                message: 'Budget amount or total amount must be above the per-day minimum.',
                details: {
                  budgetPerDayMinimumErrorDetails: {
                    currencyCode: 'TRY',
                    budgetPerDayMinimumMicros: '212500000',
                    budgetAmountMicros: '50000000',
                  },
                },
              },
              { errorCode: { requestError: 'UNKNOWN' }, message: 'x', trigger: { stringValue: 'geoTargetConstants/2792' } },
            ],
          },
        ],
      },
    };
    const [butce, konum] = googleAlanHatalari(raw);
    expect(butce?.ayrinti).toBe(
      'budgetPerDayMinimumErrorDetails.budgetPerDayMinimumMicros=212.50 TRY · budgetPerDayMinimumErrorDetails.budgetAmountMicros=50.00 TRY',
    );
    expect(konum?.ayrinti).toBe('reddedilen değer=geoTargetConstants/2792');
  });
});
