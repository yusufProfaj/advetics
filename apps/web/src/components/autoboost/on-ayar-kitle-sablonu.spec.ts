import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Akıllı Boost ön ayar formu Marka Merkezi kitle şablonunu okuyor. Panelde
 * bileşen render eden test altyapısı yok; kurallar YORUMSUZ kaynakta taranıyor.
 */
const K = readFileSync(resolve(__dirname, 'boost-on-ayarlari-formu.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function govde(bas: string): string {
  const i = K.indexOf(bas);
  if (i === -1) throw new Error(`${bas} bulunamadı — tarama boşa düştü`);
  // Gövde, imzayı kapatan ") {" ya da "> {" ile başlıyor; parametre
  // nesnesinin süslü parantezi gövde sanılmamalı.
  const acilis = /[)>] \{\n/g;
  acilis.lastIndex = i;
  const m = acilis.exec(K);
  if (!m) throw new Error(`${bas} gövdesi bulunamadı`);
  let derinlik = 0;
  for (let j = m.index + 2; j < K.length; j++) {
    if (K[j] === '{') derinlik++;
    if (K[j] === '}' && --derinlik === 0) return K.slice(i, j + 1);
  }
  throw new Error(`${bas} gövdesi kapanmadı`);
}

describe('ön ayar formu — kitle şablonu', () => {
  it('KRİTİK: kayıtlı konumun ADI yükleniyor, anahtar ad yerine yazılmıyor', () => {
    // Anahtarı ad diye yüklemek, kaydet'te saklanan adı her seferinde siliyordu.
    expect(K).toContain('name: l.label ?? l.key');
    expect(K).toContain('label: l.label ?? l.key');
    expect(K).not.toMatch(/label: l\.key,/);
  });

  it('KRİTİK: kayıtlı kitle seçiliyken şablon alanları GÖNDERİLMİYOR', () => {
    const k = govde('async function kaydet(');
    expect(k).toContain('interests: kitleId ? [] : ilgiler');
    expect(k).toContain('ozelKitleler: kitleId ? [] : ozelKitleler');
  });

  it('KRİTİK: şablon seçmek Meta kayıtlı kitlesini kaldırıyor', () => {
    expect(govde('function sablondanDoldur(')).toContain('setKitleId(null)');
  });

  it('şablon listesi hatayı yutmuyor ve dört hâli ayrı yazıyor', () => {
    const g = govde('function SablondanDoldur(');
    expect(g).toContain("setHata(err instanceof ApiRequestError ? err.message : 'Kitle şablonları okunamadı.')");
    expect(g).toContain('if (liste === undefined)');
    expect(g).toContain('if (liste.length === 0)');
    expect(K).not.toMatch(/\.catch\(\(\) => set/);
  });
});
