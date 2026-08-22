import { describe, expect, it } from 'vitest';
import { baglanti } from './baglanti';

/**
 * Bağlantı üreticisi.
 *
 * NEDEN TEST VAR: düşen bir süzgeç hiçbir hata üretmiyor. Kullanıcı "Meta"
 * seçip başka bir sekmeye basıyor, süzgeç sessizce sıfırlanıyor ve ekranda
 * "neden bütün kampanyalar geldi" sorusu kalıyor. Canlıda tam olarak bu
 * vardı: kırılım sekmesi `platform` parametresini düşürüyordu.
 */
describe('baglanti', () => {
  const TASINAN = { aralik: 'ozel', baslangic: '2026-07-01', bitis: '2026-07-31', platform: 'meta' };

  it('KRİTİK: taşınan süzgeçlerin HEPSİ korunuyor', () => {
    const url = baglanti('/dashboard', TASINAN, { seviye: 'ad_group' });
    for (const parca of ['aralik=ozel', 'baslangic=2026-07-01', 'bitis=2026-07-31', 'platform=meta']) {
      expect(url, parca).toContain(parca);
    }
    expect(url).toContain('seviye=ad_group');
  });

  it('over var olan anahtarı EZİYOR', () => {
    expect(baglanti('/dashboard', { platform: 'meta' }, { platform: 'google' })).toContain(
      'platform=google',
    );
  });

  it('undefined anahtarı DÜŞÜRÜYOR — "bu süzgeci kaldır"ın yolu bu', () => {
    expect(baglanti('/dashboard', TASINAN, { platform: undefined })).not.toContain('platform');
  });

  it('boş dize de düşüyor — boş bir süzgeç parametresi sunucuda hataya dönüşüyor', () => {
    expect(baglanti('/dashboard', { ara: '' })).toBe('/dashboard');
  });

  it('hiç parametre yoksa düz yol dönüyor', () => {
    expect(baglanti('/dashboard', {})).toBe('/dashboard');
  });
});
