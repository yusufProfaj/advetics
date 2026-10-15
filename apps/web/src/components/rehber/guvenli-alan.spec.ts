import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DIKEY_GUVENLI_ALAN_NOTU, dikeyNotuGerekli } from './rehber-mantik';

/* 9:16 güvenli alan notu (docs/pazar/varliklar.md): Meta açık + dikey görsel. */
describe('dikey güvenli alan notu', () => {
  it('KRİTİK: yalnız Meta açıkken ve dikey görsel varken', () => {
    expect(dikeyNotuGerekli(true, ['kare', 'dikey'])).toBe(true);
    expect(dikeyNotuGerekli(true, ['kare', 'dik45', null])).toBe(false);
    expect(dikeyNotuGerekli(false, ['dikey'])).toBe(false);
  });

  it('metin iki bandı da söylüyor, uzun tire yok', () => {
    expect(DIKEY_GUVENLI_ALAN_NOTU).toContain('%14');
    expect(DIKEY_GUVENLI_ALAN_NOTU).toContain('%35');
    expect(DIKEY_GUVENLI_ALAN_NOTU).not.toContain('—');
  });

  it('reklam adımı notu ortak karardan gösteriyor', () => {
    const k = readFileSync(join(__dirname, 'adim-reklam.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(k).toContain('dikeyNotuGerekli(b.acik.meta, medya.map((x) => oranlar.get(x.varlikId)))');
  });
});
