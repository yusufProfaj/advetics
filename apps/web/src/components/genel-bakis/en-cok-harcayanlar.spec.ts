import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OZET_KAMPANYA_SAYISI } from './en-cok-harcayanlar';

const KOD = readFileSync(join(__dirname, 'en-cok-harcayanlar.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('Genel Bakış › en çok harcayan kampanyalar', () => {
  it('beş satır', () => expect(OZET_KAMPANYA_SAYISI).toBe(5));

  it('KRİTİK: sessiz kesme yok — kaçı gösterildiği ve sınır yazılı', () => {
    expect(KOD).toContain('`${gosterilen.length} / ${rows.length} kampanya gösteriliyor`');
    expect(KOD).toContain('en az ${rows.length} kampanya harcadı');
  });

  it('KRİTİK: pay GELEN BÜTÜN satırların toplamından, ilk beşten değil', () => {
    expect(KOD).toContain('const toplamHarcama = rows.reduce(');
    expect(KOD).not.toContain('gosterilen.reduce(');
  });

  it('KRİTİK: satır Reklam Yöneticisi’nde o kampanyanın reklam setlerine iniyor', () => {
    expect(KOD).toContain("baglanti(REKLAM_YONETICISI, tasinan, { seviye: 'ad_group', kampanya: r.entityId })");
  });
});
