import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BOS_TASLAK, eksikler, gorselDegistir, metinUyariIceriyor, onizlemeNiyetleri, toplamUstSinir } from './akis/akis';

/**
 * Yeni reklam modülü (panel) — saf kararlar ve modül sınırı.
 */
describe('eksikler()', () => {
  const dolu = {
    ...BOS_TASLAK,
    niyet: 'FORM' as const,
    reklamHesabiId: 'h',
    sayfaId: 's',
    gorseller: ['g1'],
    baslik: 'Başlık',
    metin: 'Metin',
    gunlukButce: 500,
  };

  it('dolu taslakta eksik yok', () => {
    expect(eksikler(dolu, null)).toEqual([]);
  });

  it('her eksik KENDİ adımını gösteriyor (özet kartındaki bağlantı oraya gider)', () => {
    const e = eksikler(BOS_TASLAK, null);
    expect(e.find((x) => x.metin === 'Amaç seçilmedi')?.adim).toBe(0);
    expect(e.find((x) => x.metin === 'En az bir görsel seç')?.adim).toBe(1);
    expect(e.find((x) => x.metin === 'Başlık boş')?.adim).toBe(2);
    expect(e.find((x) => x.metin === 'Günlük bütçe seçilmedi')?.adim).toBe(3);
  });

  it('yasal uyarı metinde yoksa eksik; boşluk/satır farkı uyarıyı "yok" saydırmaz', () => {
    expect(eksikler(dolu, 'Yatırım tavsiyesi değildir.').map((x) => x.metin)).toContain(
      'Zorunlu yasal uyarı metinde yok',
    );
    expect(eksikler({ ...dolu, metin: 'Metin\n\nYatırım  tavsiyesi\ndeğildir.' }, 'Yatırım tavsiyesi değildir.')).toEqual(
      [],
    );
    expect(metinUyariIceriyor('YATIRIM TAVSİYESİ DEĞİLDİR.', 'yatırım tavsiyesi değildir.')).toBe(true);
  });

  it('sıfır ya da negatif bütçe eksik sayılır', () => {
    expect(eksikler({ ...dolu, gunlukButce: 0 }, null).map((x) => x.adim)).toEqual([3]);
  });
});

describe('görsel ve para', () => {
  it('beşten fazla fikir eklenmez, çıkarınca sıra korunur', () => {
    let s: string[] = [];
    for (const g of ['a', 'b', 'c', 'd', 'e', 'f']) s = gorselDegistir(s, g);
    expect(s).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(gorselDegistir(s, 'b')).toEqual(['a', 'c', 'd', 'e']);
  });

  it('süresizde toplam yok', () => {
    expect(toplamUstSinir(500, 14)).toBe(7000);
    expect(toplamUstSinir(500, null)).toBeNull();
    expect(toplamUstSinir(null, 14)).toBeNull();
  });

  it('önizlemede yalnız ilk tur + yönlendirme; ikinci tur ve Gelişmiş yok', () => {
    expect(onizlemeNiyetleri().map((n) => n.kod)).toEqual(['FORM', 'WHATSAPP', 'SITE', 'SATIS', 'ONE_CIKAR']);
  });
});

/**
 * MODÜL SINIRI (kullanıcı kararı 2026-10-07: "tamamen ayrı modül"). Eski
 * reklam ekranları ve panelin ortak `components/ui` katmanı içe aktarılmaz;
 * Aşama 7'de eskiler silinince bu modül etkilenmemeli.
 */
describe('reklam modülü sınırı (panel)', () => {
  const kok = __dirname;
  const sayfaKoku = join(kok, '..', 'app', '(dashboard)', 'reklam');
  const topla = (d: string): string[] =>
    readdirSync(d).flatMap((f) => {
      const y = join(d, f);
      return statSync(y).isDirectory() ? topla(y) : /\.tsx?$/.test(f) && !f.endsWith('.spec.ts') ? [y] : [];
    });
  const dosyalar = [...topla(kok), ...topla(sayfaKoku)];
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
