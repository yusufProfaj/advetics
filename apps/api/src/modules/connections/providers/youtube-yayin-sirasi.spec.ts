import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GoogleProvider } from './google.provider';
import { VARSAYILAN_KONUM } from './google-demandgen';

/**
 * ═══ YOUTUBE YAYINI: SIRA PARA DEMEK ═══
 *
 * Kampanya duraklatılmış kuruluyor ve ANCAK konum, reklam grubu ve reklam
 * yerindeyken yayına alınıyor. Sıra bozulursa Google eksik bir kampanyayı
 * yayınlar: konumsuz Demand Gen kampanyası BÜTÜN ÜLKELERE açılıyor ve hiçbir
 * hata vermiyor. Ara adım düşerse kurulan her şey geri alınmalı; yarım bir
 * kampanya yayında kalmamalı.
 *
 * `fetch` global olarak yamanıyor ve her çağrının koleksiyonu ile gövdesi
 * kaydediliyor: sınanan şey gerçek `createVideoBoost`un Google'a gönderdiği
 * istek DİZİSİ.
 */

interface Cagri {
  koleksiyon: string;
  govde: { operations: Array<Record<string, unknown>> };
}

let cagrilar: Cagri[];
let patlayan: string | null;
let orijinal: typeof fetch;

function provider(): GoogleProvider {
  return new GoogleProvider({
    platforms: {
      google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v20' },
    },
  } as never);
}

const ISTEK = {
  name: 'Mia — Video',
  dailyBudgetMicros: 50_000_000n,
  durationDays: 3,
  videoId: 'abcdefghijk',
  videoTitle: 'Yeni proje',
  logoAssetResource: 'customers/123/assets/9',
  businessName: 'Mia Yapı',
  finalUrl: 'https://miayapi.com/',
  headlines: ['Yeni proje'],
  longHeadlines: ['Yeni proje'],
  descriptions: ['Mia Yapı kanalında yeni video'],
  konumlar: [VARSAYILAN_KONUM],
  yaslar: [] as string[],
};

beforeEach(() => {
  cagrilar = [];
  patlayan = null;
  orijinal = globalThis.fetch;
  let n = 0;
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const koleksiyon = String(url).match(/\/customers\/\d+\/(\w+):mutate/)?.[1] ?? '?';
    const govde = JSON.parse(String(init?.body ?? '{}')) as Cagri['govde'];
    cagrilar.push({ koleksiyon, govde });
    const yayinaAlma = koleksiyon === 'campaigns' && govde.operations[0]?.update !== undefined;
    const bu = yayinaAlma ? 'yayina-alma' : koleksiyon;
    if (patlayan === bu && govde.operations[0]?.remove === undefined) {
      return {
        ok: false,
        status: 400,
        headers: new Headers(),
        json: async () => ({ error: { message: `${bu} reddedildi`, status: 'INVALID_ARGUMENT' } }),
        text: async () => JSON.stringify({ error: { message: `${bu} reddedildi` } }),
      } as unknown as Response;
    }
    n++;
    const yanit = { results: [{ resourceName: `customers/123/${koleksiyon}/${n}` }] };
    return {
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => yanit,
      text: async () => JSON.stringify(yanit),
    } as unknown as Response;
  }) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = orijinal;
  vi.restoreAllMocks();
});

const ctx = { accessToken: 'T', accountExternalId: '123' };

describe('createVideoBoost sırası', () => {
  it('KRİTİK: yayına alma EN SON — konum, reklam grubu ve reklamdan sonra', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    const sira = cagrilar.map((c) =>
      c.koleksiyon === 'campaigns' && c.govde.operations[0]?.update ? 'yayina-alma' : c.koleksiyon,
    );
    expect(sira).toEqual([
      'campaignBudgets',
      'campaigns',
      'campaignCriteria',
      'adGroups',
      'assets',
      'adGroupAds',
      'yayina-alma',
    ]);
  });

  it('KRİTİK: kampanya DURAKLATILMIŞ kuruluyor, yayına alma yalnızca durumu değiştiriyor', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    const kur = cagrilar.find((c) => c.koleksiyon === 'campaigns' && c.govde.operations[0]?.create);
    expect((kur!.govde.operations[0]!.create as Record<string, unknown>).status).toBe('PAUSED');
    const al = cagrilar.at(-1)!;
    expect(al.govde.operations[0]).toMatchObject({
      update: { status: 'ENABLED' },
      updateMask: 'status',
    });
  });

  it('KRİTİK: konum kampanyaya Türkiye olarak gidiyor', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    const k = cagrilar.find((c) => c.koleksiyon === 'campaignCriteria')!;
    expect(k.govde.operations[0]!.create).toMatchObject({
      location: { geoTargetConstant: 'geoTargetConstants/2792' },
    });
  });

  it('KRİTİK: konum reddedilirse kampanya YAYINA ALINMIYOR ve geri alınıyor', async () => {
    patlayan = 'campaignCriteria';
    await expect(provider().createVideoBoost(ctx, ISTEK)).rejects.toThrow();
    expect(cagrilar.some((c) => c.govde.operations[0]?.update)).toBe(false);
    const silinen = cagrilar.filter((c) => c.govde.operations[0]?.remove).map((c) => c.koleksiyon);
    expect(silinen).toEqual(['campaigns', 'campaignBudgets']);
  });

  it('KRİTİK: yayına alma düşerse kurulan her şey geri alınıyor', async () => {
    patlayan = 'yayina-alma';
    await expect(provider().createVideoBoost(ctx, ISTEK)).rejects.toThrow();
    const silinen = cagrilar.filter((c) => c.govde.operations[0]?.remove).map((c) => c.koleksiyon);
    expect(silinen).toEqual(['adGroups', 'campaigns', 'campaignBudgets']);
  });
});

describe('yaş kitlesi — Demand Gen’de Audience kaydıyla', () => {
  const YASLI = { ...ISTEK, yaslar: ['AGE_RANGE_25_34', 'AGE_RANGE_35_44'] };
  const sira = (): string[] =>
    cagrilar
      .filter((c) => c.govde.operations[0]?.remove === undefined)
      .map((c) => (c.koleksiyon === 'campaigns' && c.govde.operations[0]?.update ? 'yayina-alma' : c.koleksiyon));

  it('KRİTİK: yaş seçiliyse kitle kuruluyor, reklam grubuna bağlanıyor, SONRA yayına alınıyor', async () => {
    await provider().createVideoBoost(ctx, YASLI);
    expect(sira()).toEqual([
      'campaignBudgets',
      'campaigns',
      'campaignCriteria',
      'adGroups',
      'audiences',
      'adGroupCriteria',
      'assets',
      'adGroupAds',
      'yayina-alma',
    ]);
  });

  it('KRİTİK: reklam grubu `useAudienceGrouped` ile kuruluyor — sonradan değiştirilemez', async () => {
    await provider().createVideoBoost(ctx, YASLI);
    const ag = cagrilar.find((c) => c.koleksiyon === 'adGroups')!;
    expect(ag.govde.operations[0]!.create).toMatchObject({
      audienceSetting: { useAudienceGrouped: true },
    });
  });

  it('kitle bitişik aralığı TEK segment olarak taşıyor ve bilinmeyen yaş dışarıda', async () => {
    await provider().createVideoBoost(ctx, YASLI);
    const k = cagrilar.find((c) => c.koleksiyon === 'audiences')!;
    expect(k.govde.operations[0]!.create).toMatchObject({
      dimensions: [{ age: { ageRanges: [{ minAge: 25, maxAge: 44 }], includeUndetermined: false } }],
    });
    const bag = cagrilar.find((c) => c.koleksiyon === 'adGroupCriteria')!;
    expect(bag.govde.operations[0]!.create).toMatchObject({
      audience: { audience: expect.stringContaining('/audiences/') },
    });
  });

  it('yaş seçilmediyse kitle YOK ve reklam grubu kitle kipinde değil', async () => {
    await provider().createVideoBoost(ctx, ISTEK);
    expect(cagrilar.some((c) => c.koleksiyon === 'audiences')).toBe(false);
    const ag = cagrilar.find((c) => c.koleksiyon === 'adGroups')!;
    expect(ag.govde.operations[0]!.create).not.toHaveProperty('audienceSetting');
  });

  it('KRİTİK: kitle bağlanamazsa kampanya YAYINA ALINMIYOR', async () => {
    patlayan = 'adGroupCriteria';
    await expect(provider().createVideoBoost(ctx, YASLI)).rejects.toThrow();
    expect(cagrilar.some((c) => c.govde.operations[0]?.update)).toBe(false);
    const silinen = cagrilar.filter((c) => c.govde.operations[0]?.remove).map((c) => c.koleksiyon);
    expect(silinen).toEqual(['adGroups', 'campaigns', 'campaignBudgets']);
  });
});
