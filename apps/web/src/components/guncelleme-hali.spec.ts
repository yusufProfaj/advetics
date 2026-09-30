import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dugmeHali } from './guncelleme-hali';

const d = (x: Partial<Parameters<typeof dugmeHali>[0]>) => ({
  toplam: 4, bekleyen: 0, biten: 0, dusen: 0, bulunamayan: 0, sonHata: null, ...x,
});

describe('"Şimdi güncelle" hâli', () => {
  it('bekleyen iş varken "Güncelleniyor", düşen iş de işlendi sayılıyor', () => {
    expect(dugmeHali(d({ bekleyen: 2, biten: 1, dusen: 1 }), false)).toEqual({
      tur: 'guncelleniyor', biten: 2, toplam: 4,
    });
  });

  it('KRİTİK: süre dolunca "Güncellendi" DEMİYOR', () => {
    expect(dugmeHali(d({ bekleyen: 1, biten: 3 }), true)).toEqual({ tur: 'uzun' });
  });

  it('KRİTİK: hiçbir iş görünmüyorsa bitti sayılmıyor', () => {
    expect(dugmeHali(d({ bulunamayan: 4 }), false).tur).toBe('bilinmiyor');
  });

  it('düşen ve görünmeyen iş SAYILIYOR, sessizce yeşil kalmıyor', () => {
    expect(dugmeHali(d({ biten: 2, dusen: 1, bulunamayan: 1, sonHata: 'kota' }), false)).toEqual({
      tur: 'guncellendi', dusen: 2, sonHata: 'kota',
    });
  });

  it('hepsi bitti', () => {
    expect(dugmeHali(d({ biten: 4 }), false)).toEqual({ tur: 'guncellendi', dusen: 0, sonHata: null });
  });
});

describe('düğme kaynağı', () => {
  const K = readFileSync(resolve(__dirname, 'refresh-button.tsx'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('KRİTİK: "kuyruğa alındı" metni yok, ilerleme soruluyor', () => {
    expect(K).not.toContain('kuyruğa alındı');
    expect(K).toContain('/sync/refresh/durum?ids=');
    expect(K).toContain('dugmeHali(d,');
  });

  it('yoklama sayfadan çıkınca duruyor', () => {
    expect(K).toContain('clearTimeout(zamanlayici.current)');
  });

  it('hata yutulmuyor', () => {
    expect(K).not.toMatch(/\.catch\(\(\) => set/);
  });
});
