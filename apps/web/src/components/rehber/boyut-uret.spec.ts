import { describe, expect, it } from 'vitest';
import { eksikOranlar, uretimYontemi, yerlesim } from './boyut-uret';

describe('boyut üretimi — yöntem ve yerleşim (kesmeyen tercih edilir)', () => {
  it('KRİTİK: yakın oran kırpılır, uzak oran sığdırılır (kare → 9:16 ve 1.91:1 kesilmez)', () => {
    expect(uretimYontemi(1080, 1080, 'dik45')).toBe('sigdir');
    expect(uretimYontemi(1080, 1080, 'dikey')).toBe('sigdir');
    expect(uretimYontemi(1080, 1080, 'yatay')).toBe('sigdir');
    expect(uretimYontemi(1080, 1350, 'kare')).toBe('sigdir');
    expect(uretimYontemi(1100, 1080, 'kare')).toBe('kirp');
  });
  it('sığdırmada görselin tamamı hedefin içinde, ortalı', () => {
    const [x, y, en, boy] = yerlesim(1080, 1080, 1080, 1920, false);
    expect([x, en, boy]).toEqual([0, 1080, 1080]);
    expect(y).toBe(420);
    const [kx, , ken] = yerlesim(1080, 1080, 1200, 628, true);
    expect(ken).toBe(1200);
    expect(kx).toBe(0);
  });
  it('eksik oranlar kılavuz sırasıyla', () => {
    expect(eksikOranlar(['kare'])).toEqual(['dikey', 'dik45', 'yatay']);
    expect(eksikOranlar(['dikey', 'dik45', 'kare', 'yatay'])).toEqual([]);
  });
});
