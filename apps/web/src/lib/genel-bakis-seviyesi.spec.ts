import { describe, expect, it } from 'vitest';
import { hesapCoz, panelSeviyesiCoz, platformSekmesiSorgusu } from './genel-bakis-seviyesi';

const HESAP = '44444444-4444-4444-4444-444444444444';
const bos = { seviye: undefined, hesap: undefined, kampanya: undefined, reklamSeti: undefined };

describe('panelSeviyesiCoz — varsayılan basamak adresin derinliği', () => {
  it('workspace açılınca REKLAM HESAPLARI (kullanıcının isteği: kampanya değil)', () => {
    expect(panelSeviyesiCoz(bos)).toBe('hesap');
  });
  it('hesap seçilince KAMPANYA', () => {
    expect(panelSeviyesiCoz({ ...bos, hesap: HESAP })).toBe('campaign');
  });
  it('eski seviye=mecra bağlantısı reklam hesaplarına düşüyor', () => {
    expect(panelSeviyesiCoz({ ...bos, seviye: 'mecra' })).toBe('hesap');
  });
});

describe('panelSeviyesiCoz — anlamsız istekler varsayılana düşüyor', () => {
  it('hesap seçiliyken "hesap" tek satır olurdu → kampanya', () => {
    expect(panelSeviyesiCoz({ ...bos, hesap: HESAP, seviye: 'hesap' })).toBe('campaign');
  });
  it('bilinmeyen seviye varsayılana düşüyor', () => {
    expect(panelSeviyesiCoz({ ...bos, seviye: 'account' })).toBe('hesap');
  });
});

describe('panelSeviyesiCoz — odak her şeyi ezer, eski davranış korunur', () => {
  it('KRİTİK: kampanya odağında hesap/kampanya listesi YOK → reklam seti', () => {
    for (const seviye of ['hesap', 'campaign', undefined]) {
      expect(panelSeviyesiCoz({ ...bos, kampanya: 'k', seviye })).toBe('ad_group');
    }
    expect(panelSeviyesiCoz({ ...bos, kampanya: 'k', seviye: 'ad' })).toBe('ad');
  });
  it('reklam seti odağı → reklam', () => {
    expect(panelSeviyesiCoz({ ...bos, reklamSeti: 's', seviye: 'campaign' })).toBe('ad');
  });
  it('"Kampanya" sekmesi hesapsız da çalışıyor: workspace’in bütün kampanyaları', () => {
    expect(panelSeviyesiCoz({ ...bos, seviye: 'campaign' })).toBe('campaign');
  });
});

describe('hesapCoz', () => {
  it('yalnızca UUID geçiyor — bozuk değer dört sorguyu 400 ile düşürürdü', () => {
    expect(hesapCoz(HESAP)).toBe(HESAP);
    expect(hesapCoz('act_123')).toBeUndefined();
    expect(hesapCoz(undefined)).toBeUndefined();
  });
});

describe('platformSekmesiSorgusu', () => {
  it('KRİTİK: başka mecraya geçince hesap ve altındaki odak düşüyor', () => {
    const s = platformSekmesiSorgusu('google', { platform: 'meta', hesap: HESAP, seviye: 'ad_group' });
    expect(s).toEqual({
      platform: 'google',
      hesap: undefined,
      kampanya: undefined,
      reklamSeti: undefined,
      seviye: undefined,
    });
    expect(panelSeviyesiCoz({ ...bos, seviye: s.seviye })).toBe('hesap');
  });
  it('hesap listesinde mecra sekmesi listeyi süzüyor, seviye varsayılanda', () => {
    const s = platformSekmesiSorgusu('meta', { platform: null, hesap: undefined, seviye: 'hesap' });
    expect(s).toEqual({ platform: 'meta', seviye: undefined });
  });
  it('hesapsız kampanya listesinde seviye korunuyor (önceki davranış)', () => {
    const s = platformSekmesiSorgusu('meta', { platform: null, hesap: undefined, seviye: 'campaign' });
    expect(s).toEqual({ platform: 'meta', seviye: 'campaign' });
  });
});
