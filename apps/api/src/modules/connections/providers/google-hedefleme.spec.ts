import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleProvider } from './google.provider';
import { demandGenYasKitlesiBody, yasSegmentleri } from './google-demandgen';

/**
 * ═══ YOUTUBE HEDEFLEME: KONUM ARAMASI VE YAŞ ═══
 *
 * Yaş bir karakterlik hatayla bile yanlış kitleye gider: 65+ kovasına üst
 * sınır yazmak onu 55-64'e çevirir, bitişik aralıkları ayrı segment yapmak
 * sorunsuzdur ama AYRIK aralıkları birleştirmek arada kalan yaşa da reklam
 * göstermek demek. Hepsi hata vermeden. Kural çalıştırılarak sınanıyor.
 */

describe('yasSegmentleri', () => {
  it('seçim yoksa ya da hepsi seçiliyse KISIT YOK', () => {
    expect(yasSegmentleri([])).toEqual([]);
    expect(
      yasSegmentleri([
        'AGE_RANGE_18_24',
        'AGE_RANGE_25_34',
        'AGE_RANGE_35_44',
        'AGE_RANGE_45_54',
        'AGE_RANGE_55_64',
        'AGE_RANGE_65_UP',
      ]),
    ).toEqual([]);
  });

  it('KRİTİK: bitişik kovalar TEK segmente birleşiyor', () => {
    expect(yasSegmentleri(['AGE_RANGE_25_34', 'AGE_RANGE_35_44'])).toEqual([
      { minAge: 25, maxAge: 44 },
    ]);
  });

  it('KRİTİK: ayrık kovalar AYRI segment — arada kalan yaş hedeflenmiyor', () => {
    expect(yasSegmentleri(['AGE_RANGE_18_24', 'AGE_RANGE_45_54'])).toEqual([
      { minAge: 18, maxAge: 24 },
      { minAge: 45, maxAge: 54 },
    ]);
  });

  it('KRİTİK: 65+ üst sınırsız — 64 yazmak onu 55-64 yapardı', () => {
    expect(yasSegmentleri(['AGE_RANGE_65_UP'])).toEqual([{ minAge: 65 }]);
    expect(yasSegmentleri(['AGE_RANGE_55_64', 'AGE_RANGE_65_UP'])).toEqual([{ minAge: 55 }]);
  });

  it('sıra önemsiz, bilinmeyen kod atlanıyor', () => {
    expect(yasSegmentleri(['AGE_RANGE_35_44', 'X', 'AGE_RANGE_25_34'])).toEqual([
      { minAge: 25, maxAge: 44 },
    ]);
  });

  it('segmentsiz kitle İSTEĞE ÇIKMADAN reddediliyor', () => {
    expect(() => demandGenYasKitlesiBody({ name: 'a', stamp: 's', segmentler: [] })).toThrow();
  });
});

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

function provider(): GoogleProvider {
  return new GoogleProvider({
    platforms: {
      google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v25' },
    },
  } as never);
}

let orijinal: typeof fetch;
beforeEach(() => {
  orijinal = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = orijinal;
  vi.restoreAllMocks();
});

describe('Google konum araması', () => {
  it('KRİTİK: anahtar KAYNAK ADI, etiket üst bölge ve ülkeyle', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) =>
      YANIT({
        geoTargetConstantSuggestions: [
          {
            geoTargetConstant: {
              resourceName: 'geoTargetConstants/1012782',
              name: 'Izmir',
              countryCode: 'TR',
              targetType: 'City',
              status: 'ENABLED',
              canonicalName: 'Izmir,Izmir,Turkey',
            },
          },
        ],
      }),
    );
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await provider().searchGeoLocations({ accessToken: 'T', accountExternalId: '1' }, 'İzmir');
    expect(r).toEqual([
      {
        key: 'geoTargetConstants/1012782',
        type: 'city',
        name: 'Izmir',
        label: 'Izmir, Izmir, Turkey',
        countryCode: 'TR',
      },
    ]);
    expect(String(f.mock.calls[0]![0])).toContain('/v25/geoTargetConstants:suggest');
  });

  it('KRİTİK: ülke SÜZGECİ gönderilmiyor — yurt dışı arama boş dönmüyor', async () => {
    const f = vi.fn(async (_u: string, _i?: RequestInit) => YANIT({}));
    globalThis.fetch = f as unknown as typeof fetch;
    await provider().searchGeoLocations({ accessToken: 'T', accountExternalId: '1' }, 'Berlin');
    const govde = JSON.parse(String(f.mock.calls[0]![1]?.body));
    expect(govde).toEqual({ locale: 'tr', locationNames: { names: ['Berlin'] } });
  });

  it('kaldırılması planlanan konum seçtirilmiyor', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({
        geoTargetConstantSuggestions: [
          { geoTargetConstant: { resourceName: 'geoTargetConstants/9', name: 'Eski', status: 'REMOVAL_PLANNED' } },
        ],
      }),
    ) as unknown as typeof fetch;
    expect(await provider().searchGeoLocations({ accessToken: 'T', accountExternalId: '1' }, 'Eski')).toEqual([]);
  });

  it('iki harften kısa sorgu Google’a gitmiyor', async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    expect(await provider().searchGeoLocations({ accessToken: 'T', accountExternalId: '1' }, 'i')).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });

  it('KRİTİK: çağrı düşerse FIRLATIYOR — boş liste "yer bulunamadı" sanılırdı', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({ error: { message: 'The caller does not have permission', status: 'PERMISSION_DENIED' } }, 403),
    ) as unknown as typeof fetch;
    await expect(
      provider().searchGeoLocations({ accessToken: 'T', accountExternalId: '1' }, 'İzmir'),
    ).rejects.toThrow();
  });
});
