import { describe, expect, it } from 'vitest';

import { baglantiHatasiMetni } from './baglanti-hatasi';
import { PlatformApiError } from './provider.types';

/**
 * YETKİLENDİRME HATASI KULLANICIYA NE SÖYLÜYOR.
 *
 * Üretimde panelde şu göründü:
 *   "(#4) Application request limit reached · fbtrace=AuzMkXw_q6mdNlu1tKTE6O1"
 *
 * Doğru ama eyleme dönük değil. Kod 4 `rate_limited`, yani GEÇİCİ ve doğru
 * davranış beklemek; kullanıcı bunu bilmeyince ya tekrar tekrar deniyor
 * (kotayı daha da yakıyor) ya da bağlantıyı kaldırıyor — bu kod tabanında en
 * pahalı yanlış hamle.
 */
describe('bağlantı hatası metni', () => {
  const kota = new PlatformApiError(
    'meta',
    'rate_limited',
    '(#4) Application request limit reached · fbtrace=AuzMkXw_q6mdNlu1tKTE6O1',
  );

  it('KRİTİK: geçici kota hatası BEKLEMEYİ söylüyor', () => {
    const m = baglantiHatasiMetni(kota);
    expect(m).toContain('geçici');
    expect(m).toContain('bekleyip tekrar dene');
  });

  it('KRİTİK: platformun ham mesajı ve fbtrace KORUNUYOR', () => {
    /*
      Ham metni atmak teşhisi imkânsızlaştırır: `fbtrace` Meta'ya soru
      sorarken istenen şeyin ta kendisi, kod da bizim tek ipucumuz.
    */
    const m = baglantiHatasiMetni(kota);
    expect(m).toContain('(#4) Application request limit reached');
    expect(m).toContain('fbtrace=AuzMkXw_q6mdNlu1tKTE6O1');
  });

  it('KALICI hatada "tekrar dene" DEMİYOR', () => {
    // Yanlış tavsiye tavsiyesizlikten kötü: kullanıcı beş kez dener, her
    // seferinde aynı sonucu alır ve arızayı kendi yaptığı bir şeyde arar.
    const m = baglantiHatasiMetni(
      new PlatformApiError('meta', 'permanent', 'Invalid parameter'),
    );
    expect(m).not.toContain('tekrar dene');
    expect(m).toContain('Invalid parameter');
  });

  it('her hata türü kendi cümlesini alıyor — ikisi aynı değil', () => {
    const turler = ['rate_limited', 'invalid_token', 'permission_denied', 'transient', 'permanent'] as const;
    const cumleler = turler.map((k) =>
      baglantiHatasiMetni(new PlatformApiError('meta', k, 'ham')).replace(' · ham', ''),
    );
    expect(new Set(cumleler).size).toBe(turler.length);
  });

  it('PlatformApiError OLMAYAN hatada uydurmuyor', () => {
    // Bilinmeyen bir hatayı bilinen gibi göstermek, teşhisi yanlış yöne çevirir.
    expect(baglantiHatasiMetni(new Error('bilinmeyen çökme'))).toBe('bilinmeyen çökme');
  });
});
