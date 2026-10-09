import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformApiError } from '../provider.types';
import { GoogleProvider } from './google.provider';
import { butceTutariBody, durumGuncelleBody, googleKaynakAdi } from './google-write';
import { MetaProvider } from './meta.provider';

/**
 * ═══ İYİLEŞTİR YAZMA YOLU — GOOGLE MUTATE GÖVDELERİ VE GERİ OKUMA ═══
 *
 * Google yazma yolu CANLIDA HİÇ DENENMEDİ; burada sahte `fetch` ile
 * gövdenin ŞEKLİ, uç adresi, paylaşımlı bütçe reddi, prova bayrağı ve hata
 * ayrıntısı sınanıyor. Gerçek kabul ilk `validateOnly` provasında (Ajan 5).
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

function google(): GoogleProvider {
  return new GoogleProvider({
    platforms: { google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v25' } },
  } as never);
}
function meta(): MetaProvider {
  return new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v25.0' } } } as never);
}

const CTX = { accessToken: 'T', accountExternalId: '123', loginCustomerId: '999' };

let orijinal: typeof fetch;
beforeEach(() => {
  orijinal = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = orijinal;
  vi.restoreAllMocks();
});

function sahte(...yanitlar: Response[]) {
  const f = vi.fn(async (_u: string, _i?: RequestInit) => {
    const r = yanitlar.shift();
    if (!r) throw new Error('beklenmeyen ek çağrı');
    return r;
  });
  globalThis.fetch = f as unknown as typeof fetch;
  return f;
}
const govde = (f: ReturnType<typeof sahte>, i: number) => JSON.parse(String(f.mock.calls[i]![1]?.body));

describe('Google mutate gövdeleri (saf)', () => {
  it('KRİTİK: durum güncellemesi — tek alan maskesi, partialFailure KAPALI, prova yalnız istenince', () => {
    expect(durumGuncelleBody({ resourceName: 'customers/1/campaigns/2', status: 'PAUSED', validateOnly: false })).toEqual({
      operations: [{ update: { resourceName: 'customers/1/campaigns/2', status: 'PAUSED' }, updateMask: 'status' }],
      partialFailure: false,
    });
    expect(durumGuncelleBody({ resourceName: 'r', status: 'ENABLED', validateOnly: true }).validateOnly).toBe(true);
  });

  it('KRİTİK: bütçe tutarı STRING, maske amount_micros; sıfır reddediliyor', () => {
    expect(butceTutariBody({ budgetResourceName: 'customers/1/campaignBudgets/7', amountMicros: 120_000_000n, validateOnly: false })).toEqual({
      operations: [
        { update: { resourceName: 'customers/1/campaignBudgets/7', amountMicros: '120000000' }, updateMask: 'amount_micros' },
      ],
      partialFailure: false,
    });
    expect(() => butceTutariBody({ budgetResourceName: 'r', amountMicros: 0n, validateOnly: false })).toThrow();
  });

  it('reklam kaynak adı grup~reklam; grup kimliği yoksa TAHMİN edilmiyor', () => {
    expect(googleKaynakAdi('1', 'ad', '5', '4')).toEqual({ koleksiyon: 'adGroupAds', kaynak: 'customers/1/adGroupAds/4~5' });
    expect(() => googleKaynakAdi('1', 'ad', '5')).toThrow();
  });
});

describe('Google applyAction', () => {
  it('KRİTİK: kampanya duraklatma campaigns:mutate ucuna, login-customer-id ile', async () => {
    const f = sahte(YANIT({ results: [{ resourceName: 'customers/123/campaigns/55' }] }));
    await google().applyAction(CTX, { type: 'pause', level: 'campaign', externalId: '55' });
    expect(String(f.mock.calls[0]![0])).toMatch(/\/customers\/123\/campaigns:mutate$/);
    expect((f.mock.calls[0]![1]?.headers as Record<string, string>)['login-customer-id']).toBe('999');
    expect(govde(f, 0)).toEqual({
      operations: [{ update: { resourceName: 'customers/123/campaigns/55', status: 'PAUSED' }, updateMask: 'status' }],
      partialFailure: false,
    });
  });

  it('KRİTİK: reklam duraklatma adGroupAds:mutate, kaynak grup~reklam', async () => {
    const f = sahte(YANIT({ results: [{ resourceName: 'customers/123/adGroupAds/7~8' }] }));
    await google().applyAction(CTX, { type: 'pause', level: 'ad', externalId: '8', ustExternalId: '7' });
    expect(String(f.mock.calls[0]![0])).toMatch(/adGroupAds:mutate$/);
    expect(govde(f, 0).operations[0].update.resourceName).toBe('customers/123/adGroupAds/7~8');
  });

  it('reklam grubu kimliği yoksa platforma HİÇ gidilmiyor', async () => {
    const f = sahte();
    await expect(google().applyAction(CTX, { type: 'pause', level: 'ad', externalId: '8' })).rejects.toBeInstanceOf(PlatformApiError);
    expect(f).not.toHaveBeenCalled();
  });

  it('KRİTİK: bütçe — önce bütçe kaynağı okunuyor, sonra campaignBudgets:mutate', async () => {
    const f = sahte(
      YANIT({ results: [{ campaign: { campaignBudget: 'customers/123/campaignBudgets/77' }, campaignBudget: { explicitlyShared: false } }] }),
      YANIT({ results: [{ resourceName: 'customers/123/campaignBudgets/77' }] }),
    );
    await google().applyAction(CTX, { type: 'set_budget', level: 'campaign', externalId: '55', amountMicros: 120_000_000n, budgetMode: 'daily', currency: 'TRY' });
    expect(String(f.mock.calls[0]![0])).toMatch(/googleAds:search$/);
    expect(govde(f, 0).query).toMatch(/campaign_budget\.explicitly_shared/);
    expect(govde(f, 0).query).toMatch(/campaign\.id = 55/);
    expect(String(f.mock.calls[1]![0])).toMatch(/campaignBudgets:mutate$/);
    expect(govde(f, 1).operations[0]).toEqual({
      update: { resourceName: 'customers/123/campaignBudgets/77', amountMicros: '120000000' },
      updateMask: 'amount_micros',
    });
  });

  it('KRİTİK: PAYLAŞIMLI bütçeye yazma REDDEDİLİYOR ve mutate çağrısı YAPILMIYOR', async () => {
    const f = sahte(YANIT({ results: [{ campaign: { campaignBudget: 'customers/123/campaignBudgets/77' }, campaignBudget: { explicitlyShared: true } }] }));
    await expect(
      google().applyAction(CTX, { type: 'set_budget', level: 'campaign', externalId: '55', amountMicros: 1n * 1_000_000n, budgetMode: 'daily', currency: 'TRY' }),
    ).rejects.toThrow(/PAYLAŞILIYOR/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('paylaşım bayrağı GELMEDİYSE de yazılmıyor (bilinmeyen = paylaşımlı)', async () => {
    const f = sahte(YANIT({ results: [{ campaign: { campaignBudget: 'customers/123/campaignBudgets/77' } }] }));
    await expect(
      google().applyAction(CTX, { type: 'set_budget', level: 'campaign', externalId: '55', amountMicros: 1_000_000n, budgetMode: 'daily', currency: 'TRY' }),
    ).rejects.toThrow(/PAYLAŞILIYOR/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('reklam grubu bütçesi ve toplam bütçe Google\'da reddediliyor', async () => {
    sahte();
    await expect(
      google().applyAction(CTX, { type: 'set_budget', level: 'ad_group', externalId: '5', amountMicros: 1_000_000n, budgetMode: 'daily', currency: 'TRY' }),
    ).rejects.toThrow(/kampanya seviyesinde/);
    await expect(
      google().applyAction(CTX, { type: 'set_budget', level: 'campaign', externalId: '5', amountMicros: 1_000_000n, budgetMode: 'lifetime', currency: 'TRY' }),
    ).rejects.toThrow(/günlük/);
  });

  it('KRİTİK: prova gövdede validateOnly taşıyor ve BOŞ yanıt hata sayılmıyor', async () => {
    const f = sahte(YANIT({}));
    const r = await google().applyAction(CTX, { type: 'pause', level: 'campaign', externalId: '55' }, { validateOnly: true });
    expect(govde(f, 0).validateOnly).toBe(true);
    expect(r.afterState.prova).toBe(true);
  });

  it('gerçek yazmada kaynak adı yoksa başarı SAYILMIYOR', async () => {
    sahte(YANIT({ results: [] }));
    await expect(google().applyAction(CTX, { type: 'pause', level: 'campaign', externalId: '55' })).rejects.toThrow(/kaynak adı yok/);
  });

  it('KRİTİK: hata ayrıntısı (details/trigger) ATILMIYOR', async () => {
    sahte(
      YANIT(
        {
          error: {
            code: 400,
            message: 'Request contains an invalid argument.',
            status: 'INVALID_ARGUMENT',
            details: [
              {
                errors: [
                  {
                    errorCode: { campaignBudgetError: 'BUDGET_BELOW_PER_DAY_MINIMUM' },
                    message: 'Budget below minimum',
                    trigger: { int64Value: '50000000' },
                    details: { budgetPerDayMinimumErrorDetails: { minimumBudgetAmountMicros: '172000000', currencyCode: 'TRY' } },
                    location: { fieldPathElements: [{ fieldName: 'operations', index: 0 }, { fieldName: 'update' }, { fieldName: 'amount_micros' }] },
                  },
                ],
              },
            ],
          },
        },
        400,
      ),
    );
    const hata = (await google()
      .applyAction(CTX, { type: 'resume', level: 'campaign', externalId: '55' })
      .then(() => null, (e: unknown) => e)) as PlatformApiError;
    expect(hata).toBeInstanceOf(PlatformApiError);
    expect(hata.message).toMatch(/172\.00 TRY/);
    expect(hata.message).toMatch(/reddedilen değer=50000000/);
    expect(hata.kind).toBe('permanent');
  });

  it('GAQL\'e rakam olmayan kimlik YAZILMIYOR', async () => {
    const f = sahte();
    await expect(google().applyAction(CTX, { type: 'pause', level: 'campaign', externalId: "1 OR 1=1" })).rejects.toThrow(/Geçersiz/);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('Google durumOku', () => {
  it('kampanya: durum + günlük bütçe', async () => {
    const f = sahte(YANIT({ results: [{ campaign: { status: 'PAUSED' }, campaignBudget: { amountMicros: '120000000', period: 'DAILY' } }] }));
    const r = await google().durumOku(CTX, { level: 'campaign', externalId: '55', currency: 'TRY' });
    expect(r).toEqual({ status: 'paused', hamDurum: 'PAUSED', dailyBudgetMicros: 120_000_000n, lifetimeBudgetMicros: null });
    expect(govde(f, 0).query).toMatch(/FROM campaign WHERE campaign\.id = 55/);
  });

  it('reklam: grup kimliğiyle daraltılmış sorgu', async () => {
    const f = sahte(YANIT({ results: [{ adGroupAd: { status: 'ENABLED' } }] }));
    const r = await google().durumOku(CTX, { level: 'ad', externalId: '8', ustExternalId: '7', currency: 'TRY' });
    expect(r.status).toBe('active');
    expect(govde(f, 0).query).toMatch(/ad_group_ad\.ad\.id = 8 AND ad_group\.id = 7/);
  });

  it('varlık yoksa hata (boş sonuç "durum bilinmiyor" sayılmıyor)', async () => {
    sahte(YANIT({ results: [] }));
    await expect(google().durumOku(CTX, { level: 'ad_group', externalId: '3', currency: 'TRY' })).rejects.toThrow(/bulunamadı/);
  });
});

describe('Meta durumOku ve prova', () => {
  it('KRİTİK: reklam düğümünde bütçe alanı İSTENMİYOR (Graph isteği düşürürdü)', async () => {
    const f = sahte(YANIT({ status: 'PAUSED' }));
    const r = await meta().durumOku({ accessToken: 'T', accountExternalId: '1' }, { level: 'ad', externalId: '42', currency: 'TRY' });
    expect(String(f.mock.calls[0]![0])).toMatch(/\/42\?fields=status$/);
    expect(r.status).toBe('paused');
  });

  it('KRİTİK: bütçe en küçük birimden micros\'a (TRY kuruş, JPY küsuratsız)', async () => {
    sahte(YANIT({ status: 'ACTIVE', daily_budget: '12000', lifetime_budget: '0' }));
    const r = await meta().durumOku({ accessToken: 'T', accountExternalId: '1' }, { level: 'ad_group', externalId: '42', currency: 'TRY' });
    expect(r).toEqual({ status: 'active', hamDurum: 'ACTIVE', dailyBudgetMicros: 120_000_000n, lifetimeBudgetMicros: null });
    sahte(YANIT({ status: 'ACTIVE', daily_budget: '500' }));
    const j = await meta().durumOku({ accessToken: 'T', accountExternalId: '1' }, { level: 'campaign', externalId: '42', currency: 'JPY' });
    expect(j.dailyBudgetMicros).toBe(500_000_000n);
  });

  it('KRİTİK: Meta prova bayrağını REDDEDİYOR (sessizce gerçek yazma yok)', async () => {
    const f = sahte();
    await expect(
      meta().applyAction({ accessToken: 'T', accountExternalId: '1' }, { type: 'pause', level: 'ad', externalId: '42' }, { validateOnly: true }),
    ).rejects.toThrow(/prova/);
    expect(f).not.toHaveBeenCalled();
  });
});
