import { describe, expect, it } from 'vitest';
import { SIYAH_KARE_ESIGI, kapakAdayZamanlari, kucukOlcu, oneriKareZamanlari, ortalamaParlaklik, siyahMi, siyahlariAyikla } from './video-kare';

/*
 * VİDEO KARELERİ (VIDEO denetimi B10/B11) — tarayıcı işinin KARARLARI.
 * `<video>`/`<canvas>` testte yok; neyin hangi saniyeden alınacağı ve hangi
 * karenin atılacağı burada sınanıyor.
 */
describe('kapak adayları (B10)', () => {
  it('KRİTİK: %10, %33, %60 ve en erken 1. saniye', () => {
    expect(kapakAdayZamanlari(30)).toEqual([3, 10, 18]);
    // 5 sn: %10 = 0,5 → 1. saniyeye çekilir.
    expect(kapakAdayZamanlari(5)).toEqual([1, 1.7, 3]);
  });
  it('çok kısa videoda aynı saniyeye düşen adaylar teke iner; süre yoksa tek aday', () => {
    expect(kapakAdayZamanlari(1.05)).toHaveLength(1);
    expect(kapakAdayZamanlari(null)).toEqual([1]);
    expect(kapakAdayZamanlari(Number.NaN)).toEqual([1]);
  });
});

describe('öneri kareleri (B11)', () => {
  it('KRİTİK: başı, ortası, 15. saniye', () => {
    expect(oneriKareZamanlari(60)).toEqual([0.5, 30, 15]);
  });
  it('15 saniyeden kısa videoda sona yakın kare; eşleşenler teke iner', () => {
    expect(oneriKareZamanlari(10)).toEqual([0.5, 5, 9.9]);
    expect(oneriKareZamanlari(null)).toEqual([0.5]);
  });
});

describe('siyah kare (B10)', () => {
  const kare = (deger: number, piksel = 64) => Array.from({ length: piksel * 4 }, (_, i) => (i % 4 === 3 ? 255 : deger));
  it('KRİTİK: siyah aday atılıyor, aydınlık kalıyor', () => {
    const adaylar = [{ parlaklik: ortalamaParlaklik(kare(2)), id: 'siyah' }, { parlaklik: ortalamaParlaklik(kare(120)), id: 'iyi' }];
    expect(siyahlariAyikla(adaylar).map((x) => x.id)).toEqual(['iyi']);
  });
  it('hepsi siyahsa hiçbiri atılmıyor (boş seçici bırakılmaz)', () => {
    const adaylar = [{ parlaklik: 1, id: 'a' }, { parlaklik: 3, id: 'b' }];
    expect(siyahlariAyikla(adaylar).map((x) => x.id)).toEqual(['a', 'b']);
  });
  it('eşik video siyahı (16): altı siyah, kendisi değil', () => {
    expect(siyahMi(SIYAH_KARE_ESIGI - 0.1)).toBe(true);
    expect(siyahMi(SIYAH_KARE_ESIGI)).toBe(false);
    expect(Math.round(ortalamaParlaklik(kare(200)))).toBe(200);
  });
});

describe('model girdisinin sınırı (B11)', () => {
  it('uzun kenar 640’a iner, oran korunur; küçük kare büyütülmez', () => {
    expect(kucukOlcu(1920, 1080)).toEqual({ en: 640, boy: 360 });
    expect(kucukOlcu(1080, 1920)).toEqual({ en: 360, boy: 640 });
    expect(kucukOlcu(400, 300)).toEqual({ en: 400, boy: 300 });
  });
});
