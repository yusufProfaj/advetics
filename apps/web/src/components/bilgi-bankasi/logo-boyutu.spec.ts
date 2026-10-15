import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GOOGLE_LOGO_MAKS_BAYT, googleLogoBoyutUyarisi } from '@advetics/shared';

/* Google Demand Gen logosu en çok 150 KB: giriş anında uyarı (docs/pazar/varliklar.md). */
describe('Google logo dosya boyutu', () => {
  it('KRİTİK: 150 KB sınırda uyarı yok, üstünde var ve boyutu söylüyor', () => {
    expect(googleLogoBoyutUyarisi(GOOGLE_LOGO_MAKS_BAYT)).toBeNull();
    const u = googleLogoBoyutUyarisi(400 * 1024);
    expect(u).toContain('400 KB');
    expect(u).toContain('150 KB');
    expect(u).not.toContain('—');
  });

  it('KRİTİK: logo sekmesi seçili logonun boyutunu ortak fonksiyonla soruyor', () => {
    const k = readFileSync(join(__dirname, 'logo-sekmesi.tsx'), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    expect(k).toContain('googleLogoBoyutUyarisi(secili.byteSize)');
    expect(k).toContain('<Serit ton="uyari" baslik={uyari} />');
  });
});
