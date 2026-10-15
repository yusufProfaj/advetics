import { describe, expect, it } from 'vitest';
import { bicimKodu, dilBelirle, tarayiciDili } from '@advetics/shared';

/** MIMARI §2: yol öneki > sorgu > profil > çerez > SOR (null). */
describe('dil belirleme sırası', () => {
  it('önek her şeyi ezer, sonra sorgu, profil, çerez', () => {
    expect(dilBelirle({ onek: 'en', sorgu: 'tr', profil: 'tr', cerez: 'tr' })).toBe('en');
    expect(dilBelirle({ sorgu: 'en', profil: 'tr', cerez: 'tr' })).toBe('en');
    expect(dilBelirle({ profil: 'en', cerez: 'tr' })).toBe('en');
    expect(dilBelirle({ cerez: 'en' })).toBe('en');
  });

  it('KRİTİK: hiçbir kaynak yoksa null (= seçim ekranı); Türkçe varsayılana DÜŞMEZ', () => {
    expect(dilBelirle({})).toBeNull();
  });

  it('bozuk değer yok sayılır, sıradakine geçilir (eski "tr-TR" profili, elle yazılmış çerez)', () => {
    expect(dilBelirle({ profil: 'tr-TR', cerez: 'en' })).toBe('en');
    expect(dilBelirle({ cerez: 'de' })).toBeNull();
  });

  it('tarayıcı dili yalnız ön seçim: ilk TANINAN dil, yoksa Türkçe', () => {
    expect(tarayiciDili('en-GB,en;q=0.9,tr;q=0.8')).toBe('en');
    expect(tarayiciDili('de-DE,tr;q=0.5')).toBe('tr');
    expect(tarayiciDili('de-DE')).toBe('tr');
    expect(tarayiciDili(null)).toBe('tr');
  });

  it('biçim kodu Intl için tam kod', () => {
    expect(bicimKodu('en')).toBe('en-US');
    expect(bicimKodu('tr')).toBe('tr-TR');
  });
});
