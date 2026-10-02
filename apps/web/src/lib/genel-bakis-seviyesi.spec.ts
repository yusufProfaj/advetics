import { describe, expect, it } from 'vitest';
import { hesapCoz, panelSeviyesiCoz, platformSekmesiSorgusu } from './genel-bakis-seviyesi';

const HESAP = '44444444-4444-4444-4444-444444444444';
const bos = { seviye: undefined, platform: null, hesap: undefined, kampanya: undefined, reklamSeti: undefined };

describe('panelSeviyesiCoz — varsayılan basamak adresin derinliği', () => {
  it('workspace açılınca MECRA (kullanıcının isteği: kampanya değil)', () => {
    expect(panelSeviyesiCoz(bos)).toBe('mecra');
  });
  it('mecra seçilince HESAP', () => {
    expect(panelSeviyesiCoz({ ...bos, platform: 'meta' })).toBe('hesap');
  });
  it('hesap seçilince KAMPANYA', () => {
    expect(panelSeviyesiCoz({ ...bos, platform: 'meta', hesap: HESAP })).toBe('campaign');
  });
  it('mecra satırına tıklanınca gelen seviye=hesap korunuyor', () => {
    expect(panelSeviyesiCoz({ ...bos, platform: 'google', seviye: 'hesap' })).toBe('hesap');
  });
});

describe('panelSeviyesiCoz — anlamsız istekler varsayılana düşüyor', () => {
  it('mecra seçiliyken "mecra" tek satır olurdu → hesap', () => {
    expect(panelSeviyesiCoz({ ...bos, platform: 'meta', seviye: 'mecra' })).toBe('hesap');
  });
  it('hesap seçiliyken "hesap" tek satır olurdu → kampanya', () => {
    expect(panelSeviyesiCoz({ ...bos, hesap: HESAP, seviye: 'hesap' })).toBe('campaign');
  });
  it('bilinmeyen seviye varsayılana düşüyor', () => {
    expect(panelSeviyesiCoz({ ...bos, seviye: 'account' })).toBe('mecra');
  });
});

describe('panelSeviyesiCoz — odak her şeyi ezer, eski davranış korunur', () => {
  it('KRİTİK: kampanya odağında mecra/hesap/kampanya listesi YOK → reklam seti', () => {
    for (const seviye of ['mecra', 'hesap', 'campaign', undefined]) {
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
  });
  it('mecra listesinden bir sekmeye basmak hesap listesine götürüyor', () => {
    const s = platformSekmesiSorgusu('meta', { platform: null, hesap: undefined, seviye: 'mecra' });
    expect(s.seviye).toBeUndefined();
    expect(panelSeviyesiCoz({ ...bos, platform: s.platform })).toBe('hesap');
  });
  it('hesapsız kampanya listesinde seviye korunuyor (önceki davranış)', () => {
    const s = platformSekmesiSorgusu('meta', { platform: null, hesap: undefined, seviye: 'campaign' });
    expect(s).toEqual({ platform: 'meta', seviye: 'campaign' });
  });
});
