import { describe, expect, it } from 'vitest';
import { YALNIZ_MEDYA } from './dongu';
import { ekranMetni } from './sohbet.service';

/**
 * Kullanıcı balonunun METNİ. Modele giden metinde iki ek var: yalnız medya
 * bırakıldıysa yer tutucu ve sonda "[Bırakılan medya: …]" satırı. İkisi de
 * modelin bağlamı için; kullanıcı bunları hiç yazmadı. İlk canlı turda
 * (2026-10-09) yenilenen sayfada balon "(yalnız medya bıraktı)" gösteriyordu.
 */
describe('ekranMetni — kullanıcı balonu', () => {
  it('KRİTİK: yalnız medya bırakıldıysa balonda metin YOK (görsel ayrıca çiziliyor)', () => {
    expect(ekranMetni('kullanici', [{ text: `${YALNIZ_MEDYA}\n\n[Bırakılan medya: 1. görsel]` }])).toBe('');
  });

  it('kullanıcının yazdığı metin aynen kalıyor, medya satırı düşüyor', () => {
    expect(ekranMetni('kullanici', [{ text: 'Siteme gelsinler\n\n[Bırakılan medya: 1. görsel]' }])).toBe('Siteme gelsinler');
  });
});
