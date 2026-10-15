import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ BÖLÜMLÜ SEÇİCİDE ETİKET VE SAYI BİTİŞMİYOR ═══
 * Düğme inline-flex; etiketteki her düğüm ayrı flex öğesi ve öğenin
 * sonundaki boşluk atılıyor. Varlıklar'da "Tümü <span>21</span>" ekranda
 * "Tümü21" çıkıyordu (canlı denetim).
 */
const K = readFileSync(join(__dirname, 'sekmeler.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('BolumluSecici düğmesi', () => {
  it('KRİTİK: düğümler arasında gap var', () => {
    const i = K.indexOf('export function BolumluSecici');
    expect(i).toBeGreaterThan(-1);
    const govde = K.slice(i, K.indexOf('\nexport function', i + 10) === -1 ? undefined : K.indexOf('\nexport function', i + 10));
    expect(govde).toContain('inline-flex h-[30px] items-center gap-1.5 whitespace-nowrap');
  });
});
