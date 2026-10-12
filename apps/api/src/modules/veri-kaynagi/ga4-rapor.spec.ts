import { afterEach, describe, expect, it, vi } from 'vitest';
import { ga4KotaIzni } from '@advetics/shared';
import { Ga4Istemcisi, ga4KotaOku } from '../connections/providers/ga4';
import { etkinlikSatirlari, ga4SatirHash, trafikSatirlari } from './ga4-veri';

/**
 * ═══ GA4 runReport — SAYFALAMA, "(other)", KOTA (fixture; canlı çağrı YOK) ═══
 *
 * Yanıt biçimi resmî belgeden (RunReportResponse, PropertyQuota,
 * ResponseMetaData). Canlıda ÖLÇÜLMEDİ: Ajan 5 listesi.
 */
afterEach(() => {
  vi.restoreAllMocks();
});

function sayfa(rows: Array<[string[], string[]]>, rowCount: number, ek: Record<string, unknown> = {}) {
  return new Response(
    JSON.stringify({
      rows: rows.map(([d, m]) => ({ dimensionValues: d.map((value) => ({ value })), metricValues: m.map((value) => ({ value })) })),
      rowCount,
      ...ek,
    }),
    { status: 200 },
  );
}

const tr = (g: string, kampanya: string): [string[], string[]] => [[g, 'google / cpc', kampanya, '(not set)', '1'], ['10', '5', '8', '1', '0', '0']];

describe('raporTamami', () => {
  it('KRİTİK: offset ile bütün sayfaları okur; offset okunan satır sayısı kadar ilerler', async () => {
    const govdeler: Array<{ offset: string; limit: string; returnPropertyQuota: boolean }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      const g = JSON.parse(String((init as RequestInit).body));
      govdeler.push(g);
      if (g.offset === '0') return sayfa([tr('20261012', 'A'), tr('20261012', 'B')], 3);
      return sayfa([tr('20261013', 'C')], 3);
    });
    const r = await new Ga4Istemcisi('tok').raporTamami('123456789', 'trafik', { from: '2026-10-12', to: '2026-10-13' }, () => null, 2);
    expect(r.satirlar).toHaveLength(3);
    expect(r.durdu).toBeNull();
    expect(govdeler.map((g) => g.offset)).toEqual(['0', '2']);
    expect(govdeler.every((g) => g.returnPropertyQuota === true)).toBe(true);
    expect(r.istek).toBe(2);
  });

  it('"(other)" satırı ve eşikleme bayrağı sayfalar arasında BİRLEŞİR', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      const g = JSON.parse(String((init as RequestInit).body));
      if (g.offset === '0') return sayfa([tr('20261012', '(other)')], 2, { metadata: { dataLossFromOtherRow: true } });
      return sayfa([tr('20261012', 'B')], 2, { metadata: { subjectToThresholding: true } });
    });
    const r = await new Ga4Istemcisi('tok').raporTamami('123456789', 'trafik', { from: '2026-10-12', to: '2026-10-12' }, () => null, 1);
    expect(r.kalite).toEqual({ digerSatiri: true, esiklendi: true, ornekleme: null });
  });

  it('KRİTİK: kota eşiğin altına inince sayfalama DURUR ve kısmi sonuç "durdu" ile döner', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      sayfa([tr('20261012', 'A')], 5, { propertyQuota: { tokensPerDay: { consumed: 190_000, remaining: 10_000 }, tokensPerHour: { consumed: 10, remaining: 39_990 } } }),
    );
    const r = await new Ga4Istemcisi('tok').raporTamami(
      '123456789',
      'trafik',
      { from: '2026-10-12', to: '2026-10-12' },
      (k) => ga4KotaIzni('gunluk', k).neden,
      1,
    );
    expect(r.istek).toBe(1);
    expect(r.durdu).toMatch(/günlük kotasının %5/);
    expect(r.kota).toEqual({ gunKalan: 10_000, gunToplam: 200_000, saatKalan: 39_990, saatToplam: 40_000 });
  });

  it('anahtar etkinlik raporu keyEvents > 0 süzgeciyle gider, trafik raporu süzgeçsiz', async () => {
    const govdeler: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_u, init) => {
      govdeler.push(JSON.parse(String((init as RequestInit).body)));
      return sayfa([], 0);
    });
    const ist = new Ga4Istemcisi('tok');
    await ist.raporTamami('1', 'trafik', { from: '2026-10-12', to: '2026-10-12' }, () => null);
    await ist.raporTamami('1', 'anahtarEtkinlik', { from: '2026-10-12', to: '2026-10-12' }, () => null);
    expect(govdeler[0]!.metricFilter).toBeUndefined();
    expect(govdeler[1]!.metricFilter).toEqual({ filter: { fieldName: 'keyEvents', numericFilter: { operation: 'GREATER_THAN', value: { int64Value: '0' } } } });
  });

  it('429 RESOURCE_EXHAUSTED rate_limited olarak fırlar (worker bunu kaynağın kesicisine yazar)', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'quota' } }), { status: 429 }));
    await expect(new Ga4Istemcisi('tok').raporTamami('1', 'trafik', { from: '2026-10-12', to: '2026-10-12' }, () => null)).rejects.toMatchObject({
      kind: 'rate_limited',
    });
  });
});

describe('ga4KotaOku', () => {
  it('toplam = tüketilen + kalan; alan yoksa null (bilinmeyen kota)', () => {
    expect(ga4KotaOku({ tokensPerDay: { consumed: 5, remaining: 95 } })).toEqual({ gunKalan: 95, gunToplam: 100 });
    expect(ga4KotaOku(undefined)).toBeNull();
    expect(ga4KotaOku({})).toBeNull();
  });
});

describe('satır dönüşümü', () => {
  it('sütunlar TANIMDAN okunuyor: gelir micros, tarih YYYY-MM-DD, boş kampanya NULL, "(not set)" aynen', () => {
    const [s] = trafikSatirlari([{ boyutlar: ['20261012', 'facebook / paid_social', '', '(not set)', '(not set)'], metrikler: ['12', '7', '9', '2.5', '99.123456789', '1'] }]);
    expect(s).toMatchObject({
      gun: '2026-10-12',
      kaynakOrtam: 'facebook / paid_social',
      kampanyaAdi: null,
      kampanyaKimligi: '(not set)',
      oturum: 12,
      etkilesimliOturum: 7,
      kullanici: 9,
      anahtarEtkinlik: 2.5,
      satinAlma: 1,
      gelirMikro: 99_123_456n,
    });
  });

  it('biçim dışı tarih SESSİZCE geçmez', () => {
    expect(() => trafikSatirlari([{ boyutlar: ['2026-10-12', 'a / b', 'x', 'x', 'x'], metrikler: ['1', '1', '1', '1', '0', '0'] }])).toThrow(/tarih/);
  });

  it('satır anahtarı alan sınırını korur ("a|b"+"c" ile "a"+"b|c" aynı anahtar değil)', () => {
    const a = ga4SatirHash({ kaynakOrtam: 'a|b', kampanyaAdi: 'c', kampanyaKimligi: null, adsKampanyaKimligi: null });
    const b = ga4SatirHash({ kaynakOrtam: 'a', kampanyaAdi: 'b|c', kampanyaKimligi: null, adsKampanyaKimligi: null });
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('etkinlik satırı adsız olay atılır, ad 100 karakterle sınırlı', () => {
    const r = etkinlikSatirlari([
      { boyutlar: ['20261012', 'a / b', 'k', 'k', 'k', ''], metrikler: ['3'] },
      { boyutlar: ['20261012', 'a / b', 'k', 'k', 'k', 'generate_lead'], metrikler: ['3'] },
    ]);
    expect(r.map((x) => x.etkinlik)).toEqual(['generate_lead']);
  });
});
