import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { degisimHali } from './degisim';

/**
 * ═══ DEĞİŞİM: İYİ Mİ KÖTÜ MÜ — TEK TANIM ═══
 *
 * Eski panelde aynı karar üç bileşende (KPI kartı, ikincil şerit, kırılım
 * tablosu) veriliyordu ve `delta-rozeti.spec.ts` bunu tek rozete bağlamıştı.
 * Onaylanan taslakla (2026-10-09) o bileşenler kalktı ve yeni iki ekran
 * kararı YENİDEN iki ayrı kopyada yazmıştı. Kural taşındı: karar burada,
 * ÇALIŞTIRILARAK sınanıyor; bileşenler yalnızca çiziyor.
 */
describe('degisimHali', () => {
  it('KRİTİK: null değişim HİÇ basılmıyor', () => {
    // "%0" yazmak "değişmedi" demek; anlamı ise "karşılaştırma yapılamadı".
    expect(degisimHali(null)).toBeNull();
    expect(degisimHali(undefined)).toBeNull();
    expect(degisimHali(Number.NaN)).toBeNull();
    expect(degisimHali(Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('KRİTİK: maliyet (`ters`) ARTIŞI KÖTÜ, düşüşü İYİ', () => {
    expect(degisimHali(12, true)!.iyi).toBe(false);
    expect(degisimHali(-12, true)!.iyi).toBe(true);
    expect(degisimHali(12, true)!.etiket).toBe('kötü yönde');
  });

  it('KRİTİK: harcama/dönüşüm artışı İYİ', () => {
    expect(degisimHali(12)!.iyi).toBe(true);
    expect(degisimHali(-12)!.iyi).toBe(false);
  });

  it('önemsiz değişim renksiz ve "değişmedi"', () => {
    const h = degisimHali(0.01, true)!;
    expect(h.iyi).toBeNull();
    expect(h.etiket).toBe('değişmedi');
    expect(h.metin.startsWith('→')).toBe(true);
  });

  it('yön oktan, büyüklük mutlak değerden', () => {
    expect(degisimHali(-12.34)!.metin).toBe('↓ %12,3');
    expect(degisimHali(5)!.metin).toBe('↑ %5');
  });
});

const yorumsuz = (yol: string): string =>
  readFileSync(join(__dirname, '..', yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('iki ekran da ortak kararı kullanıyor', () => {
  const BILESENLER = ['components/taslak/genel-bakis-parcalari.tsx', 'components/taslak/reklam-yoneticisi-tablosu.tsx'];

  it('KRİTİK: bileşenler KENDİ kopyasını tutmuyor', () => {
    for (const yol of BILESENLER) {
      const k = yorumsuz(yol);
      expect(k, yol).toContain('const h = degisimHali(d, ters);');
      expect(k, yol).not.toMatch(/!==\s*Boolean\(ters\)/);
    }
  });

  it('KRİTİK: iyi/kötü yalnızca RENKTEN okunmuyor', () => {
    // Renk ayırt edemeyen kullanıcı ve ekran okuyucu için etiket metinde.
    for (const yol of BILESENLER) {
      const k = yorumsuz(yol);
      expect(k, yol).toContain('title={h.etiket}');
      expect(k, yol).toContain('<span className="sr-only">, {h.etiket}</span>');
    }
  });

  it('KRİTİK: Reklam Yöneticisi’nde maliyet `ters`, harcama değil', () => {
    const YM = yorumsuz('app/(dashboard)/ads-explorer/page.tsx');
    const m = YM.slice(YM.indexOf('function ymMetrikleri'), YM.indexOf('function duzeySekmeleri'));
    const dbm = m.slice(m.indexOf("ad: 'Dönüşüm başı maliyet'"));
    expect(dbm.slice(0, dbm.indexOf('},'))).toContain('ters: true');
    const harcama = m.slice(m.indexOf("{ ad: 'Harcama'"));
    expect(harcama.length, 'harcama kutusu bulunamadı').toBeGreaterThan(0);
    expect(harcama.slice(0, harcama.indexOf('},'))).not.toContain('ters');
  });
});
