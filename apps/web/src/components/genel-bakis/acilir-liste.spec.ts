import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ILK_SATIR } from './acilir-liste';

/** Bekleyen işler kutusu kısa açılıyor (canlı tasarım denetimi, 2026-10-09). */
const yorumsuz = (f: string) =>
  readFileSync(join(__dirname, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');
const LISTE = yorumsuz('acilir-liste.tsx');
const KUTU = yorumsuz('bekleyen-isler-kutusu.tsx');

describe('AcilirListe', () => {
  it('ilk beş satır', () => expect(ILK_SATIR).toBe(5));

  it('KRİTİK: sessiz kesme yok — kapalıyken "N / toplam gösteriliyor"', () => {
    expect(LISTE).toContain('`${ILK_SATIR} / ${toplam} gösteriliyor`');
    expect(LISTE).toContain('`Tümünü göster (${toplam})`');
  });

  it('KRİTİK: animasyon hatasız — satırlar DOM\'da, kapalıyken inert, grid-rows geçişi, reduced-motion', () => {
    expect(LISTE).toContain('inert={!acik}');
    expect(LISTE).toContain('transition-[grid-template-rows]');
    expect(LISTE).toContain('motion-reduce:transition-none');
    expect(LISTE).not.toMatch(/\{acik\s*&&\s*kalan\}/);
  });

  it('KRİTİK: kutu listeyi ilk satırlar + kalan olarak bölüyor', () => {
    expect(KUTU).toContain('yanit.isler.slice(0, ILK_SATIR).map(satir)');
    expect(KUTU).toContain('yanit.isler.slice(ILK_SATIR).map(satir)');
    expect(KUTU).toContain('<AcilirListe');
  });
});
