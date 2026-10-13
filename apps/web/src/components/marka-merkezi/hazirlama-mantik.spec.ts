import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { butceGirdisi, yoklamaGerekli } from './hazirlama-mantik';

describe('hazırlama kartı', () => {
  it('KRİTİK: bütçe girdisi Türkçe yazımla, kayan noktasız', () => {
    expect(butceGirdisi('750')).toEqual({ tur: 'tamam', micros: '750000000' });
    expect(butceGirdisi('1.250,5')).toEqual({ tur: 'tamam', micros: '1250500000' });
    expect(butceGirdisi(' 0,10 ')).toEqual({ tur: 'tamam', micros: '100000' });
    expect(butceGirdisi('0').tur).toBe('hata');
    expect(butceGirdisi('12a').tur).toBe('hata');
    expect(butceGirdisi('1,234').tur).toBe('hata');
  });

  it('KRİTİK: yalnız çalışırken yoklanır (hesapsız workspace boşa istek atmaz)', () => {
    expect(yoklamaGerekli('calisiyor')).toBe(true);
    for (const d of ['bekliyor', 'hazir', 'soru', 'eksik'] as const) expect(yoklamaGerekli(d)).toBe(false);
  });

  it('KRİTİK: hazırlık hatayı yutmaz ve yoklama sınırı taşır (2026-10-13: Kurulum listesinde)', () => {
    const soru = readFileSync(join(__dirname, 'hazirlama-karti.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(soru).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
    expect(soru).toContain('setHata(hataMetni(e))');
    const liste = readFileSync(join(__dirname, 'kurulum-listesi.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(liste).toContain('yoklama.current >= YOKLAMA_SINIRI');
    expect(liste).toContain('return { ok: false, hata: hataMetni(e) };');
  });
});
