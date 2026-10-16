import { describe, expect, it } from 'vitest';
import { kelimeleriAyir } from './kitleler-bolumu';

describe('kelimeleriAyir', () => {
  it('satır başına bir terim; boş, tek harf ve tekrar atılıyor; en çok 50', () => {
    expect(kelimeleriAyir(' golf sopası \n\na\ngolf sopası\ngolf kulübü')).toEqual(['golf sopası', 'golf kulübü']);
    expect(kelimeleriAyir(Array.from({ length: 60 }, (_, i) => `k${i}`).join('\n'))).toHaveLength(50);
  });
});
