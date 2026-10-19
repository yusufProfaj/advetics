import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ SÜTUNSUZ IZGARA TELEFONDA SAYFAYI TAŞIRMIYOR (2. tur) ═══
 * Marka Merkezi'nden sonra aynı desen tarandı (2026-10-19). 375 piksellik
 * çerçevede uygulamanın kendi CSS'iyle ölçüldü: Ekip 662, Okuma API 409
 * piksel çiziyordu; `grid-cols-1` / `min-w-0` ile 375. E-posta imza
 * önizlemesi taşmıyor (kaydırma kabı doğrudan ızgara öğesi) ve bilerek
 * DEĞİŞTİRİLMEDİ. Yorumsuz kaynakta taranır (docs/kurallar/test.md).
 */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, yol), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('sütunsuz ızgara taşması (Ekip, Okuma API, sayfa iskeleti)', () => {
  it('KRİTİK: Ekip ekranının kökü tek sütun, rol matrisi sarmalayıcısı daralabiliyor', () => {
    const k = yorumsuz('../tenancy/team-screen.tsx');
    expect(k).toContain('<div className="grid grid-cols-1 gap-5">');
    expect(k).toContain('<div id="roller" className="min-w-0 scroll-mt-24">');
  });

  it('KRİTİK: Okuma API örnek bloğu ve MCP adresi dar ekranda sayfayı itmiyor', () => {
    const k = yorumsuz('../okuma-api/okuma-api-paneli.tsx');
    expect(k).toContain('<code className="font-mono [overflow-wrap:anywhere]">{mcpUrl}</code>');
    expect(k).toContain('className="grid min-w-0 grid-cols-1 gap-1"');
    expect(k).toContain('<div className="grid grid-cols-1 gap-5">');
  });

  it('KRİTİK: ortak sayfa iskeleti ve başlığı sütunlu', () => {
    const k = yorumsuz('sayfa-basligi.tsx');
    expect(k).toContain('<header className="grid grid-cols-1 gap-4">');
    expect(k).toContain('grid w-full grid-cols-1 gap-6');
  });
});
