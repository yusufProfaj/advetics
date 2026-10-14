import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ═══ RAPOR ÖNİZLEMESİ TELEFONDA KESİLMİYOR ═══
 * Belge 32 px iç boşlukla 375 px ekranda ~280 px kalıyordu; kapak satırı
 * (tarih + logo), 52 px kapak başlığı ve bölüm başlığı sığmıyor ve kap
 * overflow-hidden olduğu için SESSİZCE kesiliyordu.
 */
const yorumsuz = (k: string) => k.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const BELGE = yorumsuz(readFileSync(join(__dirname, 'report-document.tsx'), 'utf8'));
const SAYFA = yorumsuz(readFileSync(join(__dirname, '../../app/(dashboard)/raporlar/page.tsx'), 'utf8'));

describe('rapor önizlemesi telefonda', () => {
  it('KRİTİK: önizleme kabı taşanı kesmiyor, kaydırıyor', () => {
    const i = SAYFA.indexOf('<ReportDocument data={report} />');
    expect(i).toBeGreaterThan(0);
    const kap = SAYFA.slice(SAYFA.lastIndexOf('<div', i), i);
    expect(kap).toContain('overflow-x-auto');
    expect(kap).not.toContain('overflow-hidden');
  });

  it('KRİTİK: kapak başlığı ekran genişliğine göre küçülüyor; satırlar sarılıyor; dar kenar yalnız ekranda', () => {
    expect(BELGE).toContain('text-[clamp(2rem,11vw,52px)]');
    expect(BELGE).toContain('<div className="flex flex-wrap items-start justify-between gap-6">');
    expect(BELGE).toContain('<header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-3">');
    expect(BELGE).toContain('px-4 py-6 text-slate-900 sm:px-8 sm:py-10 print:px-0 print:py-0');
  });
});
