import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kitleBuyuklugu } from './ilgi-secici';

const K = readFileSync(resolve(__dirname, 'ilgi-secici.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const SECICI = readFileSync(resolve(__dirname, '../autoboost/hedefleme-secici.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

describe('İlgi seçici', () => {
  it('kitle büyüklüğü bilinmiyorsa AÇIKÇA söyleniyor — sıfır yazılmıyor', () => {
    expect(kitleBuyuklugu({ audienceMin: null, audienceMax: null })).toBe('büyüklük bilinmiyor');
    expect(kitleBuyuklugu({ audienceMin: 1000, audienceMax: 2500 })).toBe('dünya geneli ~1.000–2.500 kişi');
  });

  it('KRİTİK: sayı "dünya geneli" etiketi olmadan gösterilmiyor (Meta sayısı ülkeye göre değil)', () => {
    expect(kitleBuyuklugu({ audienceMin: 264_000_000, audienceMax: 310_000_000 })).toMatch(/^dünya geneli /);
  });

  it('hesap kararı TEK yerde — konum seçicisiyle aynı hook', () => {
    expect(K).toContain('useIzlenenMetaHesabi(clientId)');
    expect(SECICI).toContain('const { hesap, hesapHata } = useIzlenenMetaHesabi(clientId);');
    expect(SECICI.match(/apiFetch<ConnectionSummary\[\]>\('\/connections'\)/g)).toHaveLength(1);
  });

  it('KRİTİK: hesap YÜKLENİRKEN "hesap atanmamış" DENMİYOR (bilinmiyor ≠ yok)', () => {
    const y = SECICI.indexOf('if (hesap === undefined)');
    const n = SECICI.indexOf('if (hesap === null)');
    expect(y).toBeGreaterThan(0);
    expect(n).toBeGreaterThan(y);
    expect(K).toContain('if (hesap === undefined)');
  });

  it('çağrı düştüğünde hata yutulmuyor', () => {
    expect(K).toContain("setHata(err instanceof ApiRequestError ? err.message : 'İlgi alanı araması düştü.')");
    expect(K).not.toMatch(/\.catch\(\(\) => set/);
  });
});
