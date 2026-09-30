import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * PANEL TASARIM KATMANI (`globals.css`). Görünüş kalıba bağlandığı için
 * kurallar küçük bir yanlışla BÜTÜN panele ya da panelin dışına sızabilir;
 * burada o sınırlar kilitli.
 */
const CSS = readFileSync(join(__dirname, 'globals.css'), 'utf8');
const KOK = readFileSync(join(__dirname, 'layout.tsx'), 'utf8');
const PANEL = readFileSync(join(__dirname, '(dashboard)', 'layout.tsx'), 'utf8');
const SABLON = readFileSync(join(__dirname, '(dashboard)', 'template.tsx'), 'utf8');

function blok(bas: string): string {
  const i = CSS.indexOf(bas);
  if (i === -1) throw new Error(`${bas} bulunamadı — tarama boşa düştü`);
  let d = 0;
  for (let j = CSS.indexOf('{', i); j < CSS.length; j++) {
    if (CSS[j] === '{') d++;
    if (CSS[j] === '}' && --d === 0) return CSS.slice(i, j + 1);
  }
  throw new Error(`${bas} kapanmadı`);
}

describe('panel tasarım katmanı', () => {
  it('KRİTİK: kapsam `.panel` ve o sınıf YALNIZCA panel düzeninde', () => {
    // Tanıtım sayfası, giriş ekranları ve müşteriye giden rapor bu kuralların dışında.
    expect(PANEL).toContain('className="panel flex min-h-screen"');
    // Kök düzen hiçbir öğeye `panel` sınıfı vermiyor (yorumdaki "Panel" sayılmıyor).
    expect(KOK).not.toMatch(/className=\{?["'`][^"'`]*\bpanel\b/);
  });

  it('KRİTİK: kart ve düğme kuralları `@layer components` içinde — ekranın kendi sınıfı kazanıyor', () => {
    const katman = blok('@layer components {');
    expect(katman).toContain('.border-line.bg-surface:is(.rounded-xl, .rounded-2xl)');
    expect(katman).toContain('.panel :is(button, a).bg-brand {');
    // Kart kuralı yalnızca kutu etiketlerinde: input/button kartlaşmamalı.
    expect(katman).toMatch(/\.panel :is\(div, section, article, li, form, aside, details\)\.border-line/);
  });

  it('KRİTİK: bütün giriş animasyonları hareket azaltma tercihinin ALTINDA', () => {
    const hareket = blok('@media (prefers-reduced-motion: no-preference) {\n  .sayfa-gecis');
    for (const s of ['.sayfa-gecis {', 'panel-blok-gir', 'panel-pencere-gir', 'panel-cekmece-gir', 'panel-parilti']) {
      expect(hareket).toContain(s);
    }
    // Hareket bloğu DIŞINDA animasyon atanmıyor (keyframe tanımları hariç).
    const disari = CSS.replace(hareket, '').replace(/@keyframes[\s\S]*?\n}\n/g, '');
    expect(disari).not.toMatch(/animation: panel-/);
  });

  it('KRİTİK: sıralı giriş kendi animasyonu olan öğeyi EZMİYOR', () => {
    // Yoksa ikinci seviyedeki yükleniyor noktası ya da iskelet bir kez kayıp durur.
    expect(CSS).toContain(".sayfa-gecis > * > :not([class*='animate-'], [class*='advetics-'])");
  });

  it('KRİTİK: giriş animasyonları bitince İZ BIRAKMIYOR (`backwards`, `both` değil)', () => {
    /*
     * `both` son kareyi tutuyor ve her kart ayrı bir katman oluyordu:
     * Raporlar'daki "Paylaş" menüsü bir sonraki kartın ALTINDA kaldı.
     */
    const atamalar = [...CSS.matchAll(/animation:\s*(panel-[\w-]+)[^;]*;/g)].map((m) => m[0]);
    expect(atamalar.length).toBeGreaterThan(4);
    for (const a of atamalar) {
      if (a.includes('infinite')) continue;
      expect(a, a).toContain('backwards');
      expect(a, a).not.toMatch(/\bboth\b|\bforwards\b/);
    }
  });

  it('KRİTİK: giriş animasyonunun son karesi nötr (fixed pencere hapsolmasın)', () => {
    for (const ad of ['panel-sayfa-gir', 'panel-blok-gir', 'panel-pencere-gir']) {
      const k = blok(`@keyframes ${ad} {`);
      expect(k.slice(k.indexOf('to {'))).toContain('transform: none');
      expect(k).not.toContain('filter');
    }
  });

  it('KRİTİK: yazı tipi gerçekten yükleniyor ve Türkçe alt kümeyi taşıyor', () => {
    expect(KOK).toContain("from 'next/font/google'");
    expect(KOK).toContain("subsets: ['latin', 'latin-ext']");
    expect(KOK).toContain('className={inter.variable}');
    expect(CSS).toContain('--brand-font: var(--font-inter)');
    // Markanın yazı tipi yoksa yüklenen yazı tipine düşülüyor.
    expect(PANEL).toContain("var(--font-inter), ui-sans-serif");
  });

  it('şablon her gezinmede sarmalıyor ve veri çekmiyor', () => {
    expect(SABLON).toContain('<div className="sayfa-gecis">{children}</div>');
    expect(SABLON).not.toMatch(/fetch|await|useState/);
  });

  it('tema köprüsünde kendine başvuran gölge değişkeni yok', () => {
    // Yorumsuz: döngüyü ANLATAN yorum aynı blokta duruyor.
    const tema = blok('@theme inline {').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of tema.matchAll(/(--[\w-]+):\s*var\((--[\w-]+)\)/g)) {
      expect(m[1], `${m[1]} kendine başvuruyor`).not.toBe(m[2]);
    }
  });
});
