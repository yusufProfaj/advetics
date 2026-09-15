import { describe, expect, it } from 'vitest';
import { nihaiBasarisizlik } from './nihai-basarisizlik';

/**
 * Bu kararın yanlış tarafı SESSİZ: "nihai değil" derken yanılmak satırı
 * sonsuza kadar açık bırakıyor (çubuk %99'da durur), "nihai" derken yanılmak
 * ise hâlâ tekrar denenecek bir işi panelde düşmüş gösteriyor.
 */
describe('nihai mi', () => {
  it('KRİTİK: denemeler tükendiyse nihai', () => {
    expect(nihaiBasarisizlik({ attemptsMade: 5, opts: { attempts: 5 } })).toBe(true);
  });

  it('KRİTİK: deneme kaldıysa nihai DEĞİL', () => {
    // Ters yön: her düşüşü nihai sayan bir kısayol da yukarıdaki testi
    // geçerdi ve tekrar denenecek işler panelde düşmüş görünürdü.
    expect(nihaiBasarisizlik({ attemptsMade: 2, opts: { attempts: 5 } })).toBe(false);
  });

  it('KRİTİK: kalıcı hata tek denemede nihai', () => {
    expect(nihaiBasarisizlik({ attemptsMade: 1, opts: { attempts: 5 }, kalici: true })).toBe(true);
  });

  it('`attempts` yoksa varsayılan BİR', () => {
    // 5 varsaymak ilk düşüşte satırı açık bırakır ve BullMQ o işi bir daha
    // hiç denemez.
    expect(nihaiBasarisizlik({ attemptsMade: 1 })).toBe(true);
  });
});
