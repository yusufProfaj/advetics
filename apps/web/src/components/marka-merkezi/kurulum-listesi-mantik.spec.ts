import { describe, expect, it } from 'vitest';
import { KURULUM_LISTESI_DURUMLARI, type KurulumListesiAdimi } from '@/lib/panel-adresleri';
import { HESAP_ADIMLARI, LISTE_DURUMU, adimOzeti, beyanDegistir, dugmeNedeni, rozetMetni, sayacMetni } from './kurulum-listesi-mantik';

/**
 * ═══ KURULUM LİSTESİ — EKRANIN KARARLARI, ÇALIŞTIRILARAK ═══
 *
 * Birleştirmenin kendisi `panel-adresleri.spec.ts`te (sözleşme); burada
 * ekranın söyledikleri: okunamayan adım "eksik" diye yazılmıyor, pasif düğme
 * sebepsiz kalmıyor, iki platform birden kapatılamıyor.
 */
const adim = (p: Partial<KurulumListesiAdimi>): KurulumListesiAdimi => ({ kod: 'meta', ad: 'Meta', durum: 'eksik', parcalar: [], ...p });

describe('rozet', () => {
  it('her durumun etiketi var (sözlük, dallanma değil)', () => {
    for (const d of KURULUM_LISTESI_DURUMLARI) expect(LISTE_DURUMU[d].etiket.length, d).toBeGreaterThan(2);
  });

  it('YEŞİL YALNIZ "tamam" (kılavuz: yeşil yalnız durum göstergesi)', () => {
    for (const d of KURULUM_LISTESI_DURUMLARI) {
      expect(LISTE_DURUMU[d].sinif.includes('ok-'), d).toBe(d === 'tamam');
    }
  });
});

describe('satırın kısa sonucu', () => {
  it('KRİTİK: bitmemiş adımda İLK BİTMEMİŞ parçanın nedeni yazar', () => {
    const a = adim({
      parcalar: [
        { kaynak: 'kurulum', kod: 'meta_hesap', durum: 'tamam', baslik: 'act_1 · Proje', neden: 'Atandı' },
        { kaynak: 'kurulum', kod: 'meta_odeme', durum: 'kullanicida', baslik: 'Ödeme yok', neden: 'Kartı şirket ekler.' },
      ],
    });
    expect(adimOzeti(a)).toBe('Ödeme yok: Kartı şirket ekler.');
  });

  it('tamam adımda parçaların kısa sonuçları; boş başlık atlanır', () => {
    const a = adim({
      durum: 'tamam',
      parcalar: [
        { kaynak: 'kurulum', kod: 'meta_hesap', durum: 'tamam', baslik: 'act_1 · Proje', neden: 'x' },
        { kaynak: 'hazirlik', kod: 'logo', durum: 'tamam', baslik: null, neden: 'y' },
      ],
    });
    expect(adimOzeti(a)).toBe('act_1 · Proje');
  });

  it('kullanılmayan adım sayaca girmediğini söylüyor', () => {
    expect(adimOzeti(adim({ durum: 'kullanilmiyor' }))).toContain('sayaca girmiyor');
  });
});

describe('sayaç', () => {
  it('KRİTİK: okunamayan adım AYRI yazılır, "bitti" denmez', () => {
    expect(sayacMetni({ tamam: 5, toplam: 7, kapsamDisi: 0, bilinmiyor: 1, bitti: false })).toBe('5 / 7 adım tamam · 1 okunamadı');
    expect(sayacMetni({ tamam: 7, toplam: 7, kapsamDisi: 0, bilinmiyor: 0, bitti: true })).toBe('7 / 7 adım tamam');
    expect(sayacMetni({ tamam: 0, toplam: 0, kapsamDisi: 0, bilinmiyor: 0, bitti: false })).toBe('Sayılacak adım yok');
    // Kapsam dışı adım da AYRI yazılır: "9 / 9" tek başına bir adımın beyanla kapandığını saklar.
    expect(sayacMetni({ tamam: 9, toplam: 9, kapsamDisi: 1, bilinmiyor: 0, bitti: true })).toBe('9 / 9 adım tamam · 1 kapsam dışı');
  });

  it('iç menü rozeti: bitince "tamam" tonu, okunamayanla kalan "eksik" değil nötr', () => {
    expect(rozetMetni({ tamam: 7, toplam: 7, kapsamDisi: 0, bilinmiyor: 0, bitti: true })).toEqual({ metin: '7 / 7', ton: 'tamam' });
    expect(rozetMetni({ tamam: 4, toplam: 7, kapsamDisi: 0, bilinmiyor: 0, bitti: false }).ton).toBe('eksik');
    expect(rozetMetni({ tamam: 6, toplam: 7, kapsamDisi: 0, bilinmiyor: 1, bitti: false }).ton).toBe('notr');
  });
});

describe('"Eksikleri tamamla" düğmesi', () => {
  const kapsam = { kurulumAdimlari: [], hazirlamaYeniden: false, kullaniciyaKalan: [], yapacakVar: false };

  it('KRİTİK: pasif düğme sebepsiz kalmıyor', () => {
    expect(dugmeNedeni(kapsam, true)).toBe('Sistemin kendi yapabileceği eksik yok.');
    expect(dugmeNedeni({ ...kapsam, kullaniciyaKalan: [{ adim: 'meta', neden: 'x' }] }, true)).toContain('kalan adımlar aşağıda');
    expect(dugmeNedeni(kapsam, false)).toBe('Kurulumu değiştirme yetkin yok.');
    expect(dugmeNedeni({ ...kapsam, kurulumAdimlari: ['gtm_konteyner'], yapacakVar: true }, true)).toBeNull();
  });
});

describe('kullanılmayan platform beyanı', () => {
  it('KRİTİK: en çok bir platform kapatılır; ikincisi reddedilir, geri alma serbest', () => {
    expect(beyanDegistir([], 'google')).toEqual(['google']);
    expect(beyanDegistir(['google'], 'meta')).toBeNull();
    expect(beyanDegistir(['google'], 'google')).toEqual([]);
  });
});

describe('hesap adımları (Ç-20)', () => {
  it('hesap seçen ve açan adımlar ayrı kapıda', () => {
    expect([...HESAP_ADIMLARI].sort()).toEqual(['google_hesap', 'meta_hesap', 'sayfa']);
  });
});
