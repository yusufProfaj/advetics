import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleProvider, gorselKaynakAdlari } from './google.provider';

/**
 * ═══ DEMAND GEN GÖRSELLERİ (Paket D, MIMARI Ç-3) ═══
 *
 * Alanlar ana yapı sorgusuna EKLENMEDİ (canlıda ölçülmedi; GAQL'de tek
 * tanınmayan alan isteğin tamamını düşürüyor). Ayrı sorgu: yalnız Demand
 * Gen kampanyası varsa atılıyor, düşerse yapı taraması yine dönüyor ve
 * not yazılıyor.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({ ok: status >= 200 && status < 300, status, headers: new Headers(), json: async () => govde, text: async () => JSON.stringify(govde) }) as unknown as Response;

const provider = () =>
  new GoogleProvider({ platforms: { google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v20' } } } as never);
const CTX = { accessToken: 'T', accountExternalId: '1234567890' };
const KAYNAK = 'customers/1234567890/assets/42';
const ADRES = 'https://tpc.googlesyndication.com/simgad/42';
const orijinal = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = orijinal;
});

function sunucu(o: { kanal: string; dgDusur?: boolean }) {
  return vi.fn(async (_u: string, init?: RequestInit) => {
    const q = String(JSON.parse(String(init?.body ?? '{}')).query ?? '');
    if (q.includes('FROM campaign')) return YANIT({ results: [{ campaign: { id: '1', name: 'K', advertisingChannelType: o.kanal, status: 'ENABLED' } }] });
    if (q.includes("ad_group_ad.ad.type = 'DEMAND_GEN_MULTI_ASSET_AD'")) {
      if (o.dgDusur) return YANIT({ error: { code: 400, status: 'INVALID_ARGUMENT', message: 'Unrecognized field' } }, 400);
      return YANIT({ results: [{ adGroupAd: { ad: { id: '9', demandGenMultiAssetAd: { marketingImages: [{ asset: KAYNAK }] } } } }] });
    }
    if (q.includes('FROM ad_group_ad')) return YANIT({ results: [{ adGroupAd: { adGroup: 'customers/1234567890/adGroups/5', status: 'ENABLED', ad: { id: '9', type: 'DEMAND_GEN_MULTI_ASSET_AD' } } }] });
    if (q.includes('FROM asset')) return YANIT({ results: [{ asset: { resourceName: KAYNAK, imageAsset: { fullSize: { url: ADRES } } } }] });
    return YANIT({ results: [] });
  });
}

describe('Demand Gen görselleri', () => {
  it('KRİTİK: Demand Gen kampanyası varsa ayrı sorgu görseli kreatife bağlıyor (adres asset sorgusundan)', async () => {
    const f = sunucu({ kanal: 'DEMAND_GEN' });
    globalThis.fetch = f as unknown as typeof fetch;
    const yapi = await provider().fetchStructure(CTX);
    expect(yapi.creatives[0]!.assetUrls).toEqual([ADRES]);
  });

  it('Demand Gen kampanyası YOKSA sorgu atılmıyor (boş çağrı kota yerdi)', async () => {
    const f = sunucu({ kanal: 'DISPLAY' });
    globalThis.fetch = f as unknown as typeof fetch;
    await provider().fetchStructure(CTX);
    const sorgular = f.mock.calls.map((c) => String(JSON.parse(String(c[1]?.body ?? '{}')).query ?? ''));
    expect(sorgular.some((q) => q.includes('DEMAND_GEN_MULTI_ASSET_AD'))).toBe(false);
  });

  it('KRİTİK: sorgu düşerse yapı taraması DÜŞMÜYOR ama sessiz de değil (not)', async () => {
    const f = sunucu({ kanal: 'DEMAND_GEN', dgDusur: true });
    globalThis.fetch = f as unknown as typeof fetch;
    const yapi = await provider().fetchStructure(CTX);
    expect(yapi.creatives).toHaveLength(1);
    expect(yapi.notes?.join(' ')).toContain('Demand Gen görselleri okunamadı');
  });

  it('gorselKaynakAdlari üç Demand Gen listesini okuyor, yatay önce', () => {
    expect(
      gorselKaynakAdlari({
        demandGenMultiAssetAd: {
          portraitMarketingImages: [{ asset: 'c' }],
          squareMarketingImages: [{ asset: 'b' }],
          marketingImages: [{ asset: 'a' }],
        },
      }),
    ).toEqual(['a', 'b', 'c']);
  });
});
