import { describe, expect, it } from 'vitest';
import { restrictTargetingFor, kitleSablonuInputSchema } from '@advetics/shared';
import { mapInterest } from './meta.provider';
import { metaTargetingFrom } from '../../boosts/meta-targeting';

/**
 * ═══ META İLGİ ALANLARI (Marka Merkezi Bölüm 4c) ═══
 *
 * Yanıt biçimi Graph belgesinden, canlıda doğrulanmadı (`meta-ilgi-kontrol`).
 * Burada sınanan: eşleme uydurmuyor, hedefleme birleşim olarak kuruluyor,
 * özel kategoride ilgi hiç gitmiyor.
 */
describe('mapInterest', () => {
  it('belgelenen satır', () => {
    expect(
      mapInterest({
        id: '6003187297451',
        name: 'Lüks araçlar',
        audience_size_lower_bound: 1_200_000,
        audience_size_upper_bound: 1_400_000,
        path: ['İlgi alanları', 'Araçlar', 'Lüks araçlar'],
      }),
    ).toEqual({
      id: '6003187297451',
      name: 'Lüks araçlar',
      path: ['İlgi alanları', 'Araçlar', 'Lüks araçlar'],
      audienceMin: 1_200_000,
      audienceMax: 1_400_000,
    });
  });

  it('sayı olarak gelen kimlik dizgeye çevriliyor; sayısal olmayan kimlik ATILIYOR', () => {
    expect(mapInterest({ id: 6003187297451, name: 'X' })?.id).toBe('6003187297451');
    expect(mapInterest({ id: 'abc', name: 'X' })).toBeNull();
    expect(mapInterest({ name: 'Kimliksiz' })).toBeNull();
  });

  it('büyüklük yoksa null — sıfır "kimse yok" diye okunurdu', () => {
    const r = mapInterest({ id: '1', name: 'X' });
    expect(r?.audienceMin).toBeNull();
    expect(r?.audienceMax).toBeNull();
    expect(r?.path).toEqual([]);
  });
});

describe('hedeflemeye çevirme', () => {
  const temel = { locations: [], ageMin: 18, ageMax: 65, genders: 'all' as const };

  it('KRİTİK: ilgiler TEK grupta — "bunlardan biri", kesişim değil', () => {
    const t = metaTargetingFrom({
      ...temel,
      interests: [
        { id: '1', name: 'Lüks araçlar' },
        { id: '2', name: 'Golf' },
      ],
    });
    expect(t.flexible_spec).toEqual([
      { interests: [{ id: '1', name: 'Lüks araçlar' }, { id: '2', name: 'Golf' }] },
    ]);
  });

  it('ilgi yoksa alan HİÇ gitmiyor — boş dizi "hiçbir ilgi" diye okunabilir', () => {
    expect(metaTargetingFrom({ ...temel, interests: [] }).flexible_spec).toBeUndefined();
    expect(metaTargetingFrom(temel).flexible_spec).toBeUndefined();
  });

  it('KRİTİK: özel kategoride ilgi alanları KALKIYOR ve bu SÖYLENİYOR', () => {
    const r = restrictTargetingFor(['HOUSING'], metaTargetingFrom({ ...temel, interests: [{ id: '1', name: 'X' }] }));
    expect(r.targeting.flexible_spec).toBeUndefined();
    expect(r.removed).toContain('ilgi alanları');
  });

  it('şablon şeması uydurma kimliği reddediyor', () => {
    const g = {
      clientId: '11111111-1111-1111-1111-111111111111',
      name: 'x',
      locations: [],
      ageMin: 18,
      ageMax: 65,
      genders: 'all',
    };
    expect(kitleSablonuInputSchema.safeParse({ ...g, interests: [{ id: 'lüks', name: 'Lüks' }] }).success).toBe(false);
    expect(kitleSablonuInputSchema.safeParse({ ...g, interests: [{ id: '123', name: 'Lüks' }] }).success).toBe(true);
    // Eski istemci alanı hiç göndermezse boş liste.
    const r = kitleSablonuInputSchema.safeParse(g);
    expect(r.success && r.data.interests).toEqual([]);
  });
});
