import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { raporButceCumlesi } from '@advetics/shared';

/* Raporun özetinde aylık bütçe satırı: panel ve PDF AYNI cümle. */
const BELGE = readFileSync(join(__dirname, 'report-document.tsx'), 'utf8')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('rapor aylık bütçe satırı', () => {
  it('cümle tutar, harcanan ve yüzdeyi söylüyor; uzun tire yok', () => {
    const c = raporButceCumlesi({ ay: '2026-08', tutarMicros: '10000000000', harcananMicros: '8250000000', paraBirimi: 'TRY' });
    expect(c).toContain('Aylık bütçe');
    expect(c).toContain('(%82,5)');
    expect(c).not.toContain('—');
  });

  it('KRİTİK: panel özeti ortak cümleyi kullanıyor', () => {
    expect(BELGE).toContain('{data.aylikButce && <Note>{raporButceCumlesi(data.aylikButce)}</Note>}');
  });
});
