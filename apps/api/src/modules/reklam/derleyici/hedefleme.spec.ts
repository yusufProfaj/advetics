import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { etkinKategoriler, hedeflemeUret, type HedeflemeGirdisi } from '@advetics/shared';

const IZMIR = { tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' };
const TR = { tur: 'country' as const, key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' };
const temel: HedeflemeGirdisi = {
  konumlar: [IZMIR],
  enDusukYas: 18,
  ipucuYas: null,
  ipucuCinsiyet: null,
  advantageAudience: 1,
  kategoriler: [],
};
const tamam = (g: Partial<HedeflemeGirdisi>) => {
  const r = hedeflemeUret({ ...temel, ...g });
  if (r.tur !== 'tamam') throw new Error(JSON.stringify(r.retler));
  return r;
};
const retKodlari = (g: Partial<HedeflemeGirdisi>) => {
  const r = hedeflemeUret({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
};

describe('konum', () => {
  it('KRİTİK: boş konum gövde ÜRETMEZ (TR yedeği yok)', () => {
    expect(retKodlari({ konumlar: [] })).toEqual(['KNM-01']);
  });

  it('KRİTİK: il seçilince countries GÖNDERİLMEZ (kovalar birleşim)', () => {
    const r = tamam({});
    expect(r.targeting.geo_locations).toEqual({ regions: [{ key: '2347' }] });
  });

  it('ülke + il birlikte yalnız kullanıcı ikisini de seçtiyse', () => {
    const r = tamam({ konumlar: [{ ...TR, key: 'de', ulkeKodu: 'DE', etiket: 'Almanya' }, IZMIR] });
    expect(r.targeting.geo_locations).toEqual({ countries: ['DE'], regions: [{ key: '2347' }] });
    expect(r.ulkeler).toEqual(['DE', 'TR']);
  });

  it('nokta yarıçapı HER ZAMAN kilometre', () => {
    const r = tamam({
      konumlar: [{ tur: 'custom', key: '', etiket: 'Alsancak', ulkeKodu: 'TR', enlem: 38.4, boylam: 27.1, yaricapKm: 5 }],
    });
    expect(r.targeting.geo_locations).toEqual({
      custom_locations: [{ latitude: 38.4, longitude: 27.1, radius: 5, distance_unit: 'kilometer' }],
    });
  });

  it('UK değil GB', () => {
    expect(tamam({ konumlar: [{ ...TR, key: 'UK', ulkeKodu: 'UK' }] }).ulkeler).toEqual(['GB']);
  });
});

describe('Advantage+ kitle: kesin ve ipucu', () => {
  it('advantage_audience çağıranın değeri; age_max HİÇ yok; user_age_unknown false', () => {
    const r = tamam({ ipucuYas: { min: 25, max: 45 }, ipucuCinsiyet: 'kadin' });
    expect(r.targeting).toMatchObject({
      age_min: 18,
      age_range: [25, 45],
      genders: [2],
      user_age_unknown: false,
      targeting_automation: { advantage_audience: 1 },
    });
    expect(r.targeting).not.toHaveProperty('age_max');
    expect(tamam({ advantageAudience: 0 }).targeting.targeting_automation).toEqual({ advantage_audience: 0 });
  });

  it('kesin yaş 18-25 dışında giriş anında reddedilir', () => {
    expect(retKodlari({ enDusukYas: 30 })).toEqual(['KTL-01']);
    expect(retKodlari({ enDusukYas: 17 })).toEqual(['KTL-01']);
  });

  it('KRİTİK: advantageAudience parametresinin VARSAYILANI YOK (kaynak taraması)', () => {
    const kaynak = readFileSync(
      resolve(__dirname, '../../../../../../packages/shared/src/reklam/meta/hedefleme.ts'),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const satir = kaynak.split('\n').find((l) => /advantageAudience\s*[?:]/.test(l));
    expect(satir, 'alan bulunamadı').toBeTruthy();
    expect(satir).toMatch(/advantageAudience: 0 \| 1;/);
    expect(kaynak).not.toMatch(/advantageAudience\s*\?\?|advantageAudience\s*=\s*[01]/);
  });
});

describe('özel kategoriler', () => {
  it('taban taslakta düşürülemez: etkin = taban ∪ ek', () => {
    expect(etkinKategoriler(['HOUSING'], [])).toEqual(['HOUSING']);
    expect(etkinKategoriler(['HOUSING'], ['EMPLOYMENT'])).toEqual(['HOUSING', 'EMPLOYMENT']);
  });

  it('KRİTİK: konutta yaş 18 sabit, cinsiyet/yaş aralığı GİTMEZ ve adıyla söylenir', () => {
    const r = tamam({
      kategoriler: ['HOUSING'],
      enDusukYas: 21,
      ipucuYas: { min: 25, max: 45 },
      ipucuCinsiyet: 'kadin',
    });
    expect(r.targeting.age_min).toBe(18);
    expect(r.targeting).not.toHaveProperty('genders');
    expect(r.targeting).not.toHaveProperty('age_range');
    expect(r.targeting.targeting_automation).toEqual({ advantage_audience: 1 });
    expect(r.kapatilanlar).toEqual([
      'En düşük yaş 21 (bu reklam türünde 18 sabit)',
      'Yaş aralığı 25-45',
      'Cinsiyet: Kadın',
    ]);
  });

  it('konutta nokta yarıçapı TR’de en az 17, ABD varsa 25 km', () => {
    const nokta = (km: number, ulke = 'TR') => ({
      tur: 'custom' as const, key: '', etiket: 'N', ulkeKodu: ulke, enlem: 1, boylam: 1, yaricapKm: km,
    });
    expect(retKodlari({ kategoriler: ['HOUSING'], konumlar: [nokta(15)] })).toEqual(['OZK-06']);
    expect(retKodlari({ kategoriler: ['HOUSING'], konumlar: [nokta(17)] })).toEqual([]);
    expect(retKodlari({ kategoriler: ['HOUSING'], konumlar: [nokta(20), nokta(30, 'US')] })).toEqual(['OZK-06']);
    expect(retKodlari({ konumlar: [nokta(5)] })).toEqual([]);
  });

  it('özel kategoride ülkesi okunamayan nokta ENGEL', () => {
    const n = { tur: 'custom' as const, key: '', etiket: 'N', ulkeKodu: null, enlem: 1, boylam: 1, yaricapKm: 20 };
    expect(retKodlari({ kategoriler: ['HOUSING'], konumlar: [n] })).toEqual(['OZK-04']);
  });

  it('siyasi konu yeni modülde kurulmaz', () => {
    expect(retKodlari({ kategoriler: ['ISSUES_ELECTIONS_POLITICS'] })).toEqual(['OZK-SIYASI']);
  });
});
