import { describe, expect, it } from 'vitest';
import { kitleSablonuInputSchema, restrictTargetingFor } from '@advetics/shared';
import { mapCustomAudience } from './meta.provider';
import { metaTargetingFrom } from '../../boosts/meta-targeting';
import { grupHedeflemesi } from '../../ad-builder/goal-mapping';

/**
 * ═══ META ÖZEL VE BENZER KİTLELER (Marka Merkezi Bölüm 4b) ═══
 *
 * Alan adları belgeden, canlıda doğrulanmadı (`meta-ilgi-kontrol --ozel`).
 */
describe('mapCustomAudience', () => {
  it('benzer kitle, büyüklük ve teslim durumu', () => {
    expect(
      mapCustomAudience({
        id: '2384',
        name: 'Benzer %1',
        subtype: 'LOOKALIKE',
        approximate_count_lower_bound: 1_000_000,
        approximate_count_upper_bound: 1_200_000,
        delivery_status: { code: 200, description: 'Bu hedef kitle hazır.' },
      }),
    ).toEqual({
      id: '2384',
      name: 'Benzer %1',
      tip: 'benzer',
      altTur: 'LOOKALIKE',
      sizeMin: 1_000_000,
      sizeMax: 1_200_000,
      hazir: true,
      durum: 'Bu hedef kitle hazır.',
    });
  });

  it('KRİTİK: -1 büyüklük "ölçülmemiş" — sayı gibi gösterilmiyor', () => {
    const o = mapCustomAudience({ id: '1', name: 'X', approximate_count_lower_bound: -1, approximate_count_upper_bound: -1 });
    expect(o?.sizeMin).toBeNull();
    expect(o?.sizeMax).toBeNull();
  });

  it('teslim kodu 200 değilse hazır DEĞİL; kod yoksa BİLİNMİYOR (hazır sayılmıyor)', () => {
    expect(mapCustomAudience({ id: '1', name: 'X', delivery_status: { code: 300 } })?.hazir).toBe(false);
    expect(mapCustomAudience({ id: '1', name: 'X' })?.hazir).toBeNull();
  });

  it('sayısal olmayan kimlik atılıyor', () => {
    expect(mapCustomAudience({ id: 'abc', name: 'X' })).toBeNull();
  });
});

describe('hedeflemeye çevirme', () => {
  const temel = { locations: [], ageMin: 18, ageMax: 65, genders: 'all' as const };

  it('dahil edilenler custom_audiences, hariçler excluded_custom_audiences', () => {
    const t = metaTargetingFrom({
      ...temel,
      ozelKitleler: [
        { id: '1', mod: 'dahil' },
        { id: '2', mod: 'haric' },
      ],
    });
    expect(t.custom_audiences).toEqual([{ id: '1' }]);
    expect(t.excluded_custom_audiences).toEqual([{ id: '2' }]);
    expect(metaTargetingFrom(temel).custom_audiences).toBeUndefined();
  });

  it('KRİTİK: özel kategoride özel ve hariç kitleler KALKIYOR ve söyleniyor', () => {
    const r = restrictTargetingFor(
      ['HOUSING'],
      metaTargetingFrom({ ...temel, ozelKitleler: [{ id: '1', mod: 'dahil' }, { id: '2', mod: 'haric' }] }),
    );
    expect(r.targeting.custom_audiences).toBeUndefined();
    expect(r.targeting.excluded_custom_audiences).toBeUndefined();
    expect(r.removed).toEqual(expect.arrayContaining(['özel/benzer kitleler', 'hariç tutulan kitleler']));
  });
});

describe('hesap kuralı', () => {
  const HESAP = '11111111-1111-1111-1111-111111111111';
  const BASKA = '22222222-2222-2222-2222-222222222222';
  const ozel = (hesapId: string, id = '9') => ({ id, name: 'Kitle', tip: 'ozel' as const, mod: 'dahil' as const, hesapId, hesapAdi: 'Hesap' });
  const kitle = (ozelKitleler: ReturnType<typeof ozel>[]) => ({
    sablonId: null,
    name: 'k',
    locations: [],
    ageMin: 18,
    ageMax: 65,
    genders: 'all',
    interests: [],
    ozelKitleler,
  });

  it('KRİTİK: kampanyanın hesabı farklıysa yayın kararı HATA — varsayılana düşmüyor', () => {
    const r = grupHedeflemesi(null, { kitle: kitle([ozel(BASKA)]) }, HESAP);
    expect(r.hata).toContain('başka bir hesapta');
    const tamam = grupHedeflemesi(null, { kitle: kitle([ozel(HESAP)]) }, HESAP);
    expect(tamam.hata).toBeNull();
    expect(tamam.targeting.custom_audiences).toEqual([{ id: '9' }]);
  });

  it('şablon iki hesabın kitlesini birlikte taşıyamıyor; aynı kitle iki kez olamıyor', () => {
    const g = (ozelKitleler: unknown[]) =>
      kitleSablonuInputSchema.safeParse({ clientId: HESAP, name: 'x', locations: [], ageMin: 18, ageMax: 65, genders: 'all', ozelKitleler }).success;
    expect(g([ozel(HESAP, '1'), ozel(BASKA, '2')])).toBe(false);
    expect(g([ozel(HESAP, '1'), ozel(HESAP, '1')])).toBe(false);
    expect(g([ozel(HESAP, '1'), ozel(HESAP, '2')])).toBe(true);
  });
});
