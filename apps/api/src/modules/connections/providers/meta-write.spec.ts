import { describe, expect, it } from 'vitest';
import { toMinorUnits } from './meta.provider';

/**
 * Meta yazma yolunun para birimi çevrimi.
 *
 * NEDEN AYRI TEST: bu çevrimdeki bir hata, kural motorunun yapabileceği EN
 * PAHALI hata. Micros'u doğrudan göndermek bütçeyi bir milyon katına çıkarır
 * ve Meta bunu sorgusuz kabul eder — 100 ₺'lik günlük bütçe 100.000.000 ₺
 * olur. Hata mesajı yok, uyarı yok; ertesi gün fatura var.
 */

describe('toMinorUnits', () => {
  it('TRY: micros → kuruş', () => {
    // 100 ₺ = 100_000_000 micros = 10.000 kuruş.
    expect(toMinorUnits(100_000_000n, 'TRY')).toBe(10_000n);
  });

  it('küsuratlı tutar korunuyor', () => {
    // 45,50 ₺ → 4.550 kuruş.
    expect(toMinorUnits(45_500_000n, 'TRY')).toBe(4_550n);
  });

  it('USD ve EUR de iki küsuratlı', () => {
    expect(toMinorUnits(100_000_000n, 'USD')).toBe(10_000n);
    expect(toMinorUnits(100_000_000n, 'EUR')).toBe(10_000n);
  });

  it('KÜSURATSIZ para birimi: JPY', () => {
    // 100 ¥ = 100_000_000 micros = 100 yen (kuruş yok).
    // Varsayılan 2 küsurat uygulansaydı 10.000 gönderilir ve bütçe 100 KATINA
    // çıkardı.
    expect(toMinorUnits(100_000_000n, 'JPY')).toBe(100n);
    expect(toMinorUnits(100_000_000n, 'KRW')).toBe(100n);
  });

  it('ÜÇ küsuratlı para birimi: KWD', () => {
    // Kuveyt dinarı 1000 fils. Varsayılan 2 uygulansaydı bütçe onda birine
    // düşerdi — ters yönde ama yine sessiz bir hata.
    expect(toMinorUnits(100_000_000n, 'KWD')).toBe(100_000n);
    expect(toMinorUnits(100_000_000n, 'BHD')).toBe(100_000n);
  });

  it('küçük harfli kod da tanınıyor', () => {
    expect(toMinorUnits(100_000_000n, 'jpy')).toBe(100n);
  });

  it('BÜYÜK tutarlarda hassasiyet kaybı yok', () => {
    // `Number` üzerinden geçseydi 2^53 sınırına yaklaşan tutarlarda kayardı.
    expect(toMinorUnits(999_999_999_000_000n, 'TRY')).toBe(99_999_999_900n);
  });

  it('bilinmeyen para birimi 2 küsurat varsayıyor', () => {
    // ISO 4217'de istisna olmayan her şey 2 küsuratlı. Bilinmeyen bir kodda
    // hata fırlatmak, tek bir egzotik hesap yüzünden tüm kural turunu
    // düşürürdü.
    expect(toMinorUnits(100_000_000n, 'ZZZ')).toBe(10_000n);
  });
});
