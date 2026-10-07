import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  bugun,
  ekranDegerleri,
  gorselDegistir,
  gunEkle,
  kavramlarKur,
  onizlemeNiyetleri,
  tarihGoster,
} from './akis/akis';

/**
 * Yeni reklam modülü (panel) — saf kararlar ve modül sınırı.
 */
describe('tarih', () => {
  it('KRİTİK: "bugün" HESABIN saat diliminde, tarayıcınınkinde değil', () => {
    // 2026-10-08 02:00 İstanbul = 2026-10-07 16:00 Los Angeles.
    const an = new Date('2026-10-07T23:00:00Z');
    expect(bugun('Europe/Istanbul', an)).toBe('2026-10-08');
    expect(bugun('America/Los_Angeles', an)).toBe('2026-10-07');
  });

  it('gün ekleme yaz saati geçişinde kaymıyor', () => {
    expect(gunEkle('2026-10-20', 13)).toBe('2026-11-02');
    expect(gunEkle('2026-03-25', 7)).toBe('2026-04-01');
  });

  it('Türkçe tarih', () => {
    expect(tarihGoster('2026-11-03')).toBe('3 Kasım 2026');
  });
});

describe('taslaktan ekran', () => {
  const z = '2026-10-07T10:00:00.000Z';
  it('kavram listesi görsel sırasından; metin her fikirde aynı', () => {
    expect(kavramlarKur(['a', 'b'], 'B', 'M')).toEqual([
      { varlikId: 'a', baslik: 'B', metin: 'M' },
      { varlikId: 'b', baslik: 'B', metin: 'M' },
    ]);
  });

  it('boş taslak boş değerler; özel kategori sorusu "cevaplanmadı" (null) ile "Hayır" ([]) ayrı', () => {
    expect(ekranDegerleri({}).ekKategoriler).toBeNull();
    const d = ekranDegerleri({
      ekKategoriler: { deger: [], kaynak: 'kullanici', kim: null, zaman: z },
      kavramlar: { deger: [{ varlikId: 'a', baslik: 'B', metin: 'M' }], kaynak: 'kullanici', kim: null, zaman: z },
    });
    expect(d.ekKategoriler).toEqual([]);
    expect(d.gorseller).toEqual(['a']);
    expect(d.baslik).toBe('B');
  });

  it('beşten fazla fikir eklenmez, çıkarınca sıra korunur', () => {
    let s: string[] = [];
    for (const g of ['a', 'b', 'c', 'd', 'e', 'f']) s = gorselDegistir(s, g);
    expect(s).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(gorselDegistir(s, 'b')).toEqual(['a', 'c', 'd', 'e']);
  });

  it('önizlemede yalnız ilk tur + yönlendirme', () => {
    expect(onizlemeNiyetleri().map((n) => n.kod)).toEqual(['FORM', 'WHATSAPP', 'SITE', 'SATIS', 'ONE_CIKAR']);
  });
});

const kok = __dirname;
const sayfaKoku = join(kok, '..', 'app', '(dashboard)', 'reklam');
const topla = (d: string): string[] =>
  readdirSync(d).flatMap((f) => {
    const y = join(d, f);
    return statSync(y).isDirectory() ? topla(y) : /\.tsx?$/.test(f) && !f.endsWith('.spec.ts') ? [y] : [];
  });
const dosyalar = [...topla(kok), ...topla(sayfaKoku)];
const yorumsuz = (f: string) => readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * MODÜL SINIRI (kullanıcı kararı 2026-10-07: "tamamen ayrı modül"). Eski
 * reklam ekranları ve panelin ortak `components/ui` katmanı içe aktarılmaz.
 */
describe('reklam modülü sınırı (panel)', () => {
  const YASAK = ['@/components/ad-builder', '@/components/ui/', '/reklam-olustur/', '@/components/marka-merkezi'];

  it('modül ve sayfa dosyaları gerçekten okundu', () => {
    expect(dosyalar.some((f) => f.endsWith('yeni-reklam-akisi.tsx'))).toBe(true);
    expect(dosyalar.some((f) => f.endsWith(join('yeni', 'page.tsx')))).toBe(true);
  });

  it('hiçbir dosya eski reklam ekranlarından ya da components/ui’dan içe aktarmıyor', () => {
    for (const f of dosyalar) {
      const importlar = readFileSync(f, 'utf8')
        .split('\n')
        .filter((l) => /from\s+'/.test(l))
        .join('\n');
      for (const y of YASAK) expect(importlar, `${f} → ${y}`).not.toContain(y);
    }
  });
});

/**
 * TEK EKSİK LİSTESİ: "yayına ne kaldı" sunucunun döndürdüğü `eksikler`.
 * Panel kendi listesini kurarsa ekran "hazır" derken yayın kapısı reddeder.
 */
describe('tek eksik listesi', () => {
  const akis = yorumsuz(join(kok, 'akis', 'yeni-reklam-akisi.tsx'));

  it('bileşen dosyası gerçekten okundu', () => {
    expect(akis).toContain('export function YeniReklamAkisi');
  });

  it('panel eksikleri sunucudan okuyor, kendisi hesaplamıyor', () => {
    expect(akis).toContain('taslak.eksikler');
    expect(akis).not.toMatch(/taslakEksikleri\s*\(/);
    expect(akis).not.toMatch(/function\s+eksikler\s*\(/);
  });

  it('kayıt hatası yutulmuyor: sunucunun mesajı ekrana çıkıyor', () => {
    expect(akis).toMatch(/setKayit\(\{ tur: 'hata', mesaj: e instanceof ApiRequestError \? e\.message/);
    expect(akis).not.toMatch(/\.catch\(\(\)\s*=>/);
  });
});
