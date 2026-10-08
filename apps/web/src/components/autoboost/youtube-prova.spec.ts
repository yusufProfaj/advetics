import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * YOUTUBE PROVA + DURAKLATILMIŞ KUR — panel kaynak kilitleri.
 *
 * Kritik iddia: prova yayının AYNISINI sınamalı. Kartta düzenlenen
 * değerler ve "duraklatılmış kur" seçimi hem provaya hem yayına gitmeli;
 * biri unutulursa kullanıcı sınadığından başka bir kampanya yayınlar.
 */
const KAYNAK = readFileSync(join(__dirname, 'bildirim-havuzu.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function govde(bas: string): string {
  const i = KAYNAK.indexOf(bas);
  if (i < 0) throw new Error(`${bas} bulunamadı`);
  const a = KAYNAK.indexOf('{', KAYNAK.indexOf(')', i));
  let d = 0;
  for (let j = a; j < KAYNAK.length; j++) {
    if (KAYNAK[j] === '{') d++;
    else if (KAYNAK[j] === '}' && --d === 0) return KAYNAK.slice(a, j + 1);
  }
  throw new Error('kapanmadı');
}

describe('YouTube prova', () => {
  const PROVA = govde('async function provaEt(');
  const KARAR = govde('async function karar(');

  it('tarama boşa düşmüyor', () => {
    expect(PROVA.length).toBeGreaterThan(200);
    expect(KARAR.length).toBeGreaterThan(200);
  });

  it('KRİTİK: prova düzenlenen değerleri ve duraklatma seçimini taşıyor', () => {
    expect(PROVA).toContain('duzenle.topla()');
    expect(PROVA).toContain('duraklatilmisKur ? { duraklatilmis: true }');
    expect(PROVA).toContain('/prova`');
  });

  it('KRİTİK: yayın da duraklatma seçimini taşıyor', () => {
    expect(KARAR).toMatch(/if \(approve && youtubeBekliyor && duraklatilmisKur\) \{\s*override = \{ \.\.\.\(override \?\? \{\}\), duraklatilmis: true \}/);
  });

  it('prova hatası yutulmuyor — sunucunun cümlesi ekranda', () => {
    expect(PROVA).toContain("setProva({ tur: 'hata', mesaj:");
  });

  it('kontrol gerekli sonucu da kullanıcıya yazılıyor', () => {
    expect(KARAR).toContain("r.status === 'failed' || r.status === 'kontrol'");
  });
});
