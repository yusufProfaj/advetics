import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { aktifMi } from '@/components/nav';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';

/*
 * ═══ HESABIM KIRINTIDA ADIYLA GÖRÜNÜYOR ═══
 * Kırıntı sayfa adını menüden buluyordu; Hesabım menü satırı değil
 * (kapısı kullanıcı kartı) ve üst yol "Şirket ›" yazıp adı göstermiyordu.
 */
const K = readFileSync(join(__dirname, 'layout.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('kırıntıda Hesabım', () => {
  it('KRİTİK: menüde yoksa Hesabım sayfa listesine ekleniyor', () => {
    expect(K).toContain("const hesabimYolu = ayarlarYolu('hesabim');");
    // Ad sözlükte (D2): kırıntı menünün diliyle aynı anahtarı okuyor.
    expect(K).toContain('[...menudenSayfalar, { href: hesabimYolu, label: k.hesabim, ekYollar: [] as string[] }]');
    expect(K).toContain('const k = sec(kabukSozlugu, dil).kenar;');
    expect(kabukSozlugu.tr.kenar.hesabim).toBe('Hesabım');
    expect(kabukSozlugu.en.kenar.hesabim).toBeTruthy();
    expect(kabukSozlugu.en.kenar.hesabim).not.toBe('Hesabım');
    expect(K).toContain('<Kirinti kapsam={kirintiKapsami} sayfalar={kirintiSayfalari} />');
  });

  it('eklenen satır Hesabım adresinde etkin sayılıyor', () => {
    expect(aktifMi({ href: '/ayarlar/hesabim', ekYollar: [] }, '/ayarlar/hesabim')).toBe(true);
  });
});
