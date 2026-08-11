import { describe, expect, it } from 'vitest';
import { deriveRoas } from '@advetics/shared';

/**
 * ROAS türetme kuralı.
 *
 * NEDEN BU TESTLER: bu sayı hem panelde hem raporda görünüyor ve yanlış
 * olduğunda kimse fark etmiyor — sadece kampanya battı gibi okunuyor.
 *
 * Kural CANLI VERİDEN çıktı. Ege Birlik Yapı'nın Google hesabında dönüşüm
 * eylemlerine değer atanmamış ve Google varsayılan 1 birim kullanıyor:
 * "38 dönüşüm → 38 TRY". Panel ROAS 0,02× gösteriyordu; teknik olarak doğru
 * ama "her liraya 2 kuruş dönüyor" diye okunuyor ve gerçekte gelir hiç
 * ölçülmüyor.
 */

describe('deriveRoas', () => {
  it('GERÇEK gelir varsa hesaplıyor', () => {
    // 12.000 TL gelir / 3.000 TL harcama = 4×. Dönüşüm başına 400 TL,
    // yani yer tutucu değil.
    expect(deriveRoas(3000, 12_000, 30)).toBe(4);
  });

  it('KRİTİK: değer = dönüşüm sayısı ise GİZLENİYOR', () => {
    // Canlı veri: 38 dönüşüm, 38 TRY değer, 1.725,84 TRY harcama.
    // Eski kural 0,02× gösteriyordu.
    expect(deriveRoas(1725.84, 38, 38)).toBeNull();
  });

  it('kısmi yer tutucu da gizleniyor', () => {
    // Bazı dönüşüm eylemlerine 1, bazılarına 0 atanmış hesap:
    // 17 dönüşüm → 16 TRY. Ortalama 1'in altında.
    expect(deriveRoas(373.38, 16, 17)).toBeNull();
    // 9 dönüşüm → 6 TRY.
    expect(deriveRoas(302.4, 6, 9)).toBeNull();
  });

  it('KESİRLİ dönüşümde de çalışıyor', () => {
    // Google kesirli dönüşüm raporluyor: 19,5 dönüşüm → 19,5 TRY.
    expect(deriveRoas(1756.04, 19.5, 19.5)).toBeNull();
  });

  it('ortalama 1 birimi AŞARSA gerçek sayılıyor', () => {
    // Sınırın hemen üstü: 10 dönüşüm, 10,01 TL. Küçük ama tanımlanmış bir
    // değer; eşik "1 birimi aşan her şey gerçek" diyor ve bu bilinçli —
    // ajans 2 TL'lik bir dönüşüm değeri tanımladıysa onu ölçmek istiyor.
    expect(deriveRoas(100, 10.01, 10)).toBeCloseTo(0.1001, 6);
  });

  it('gelir SIFIRSA null — "0.00×" battı gibi okunuyor', () => {
    // Lead formu ve mesajlaşma kampanyalarında gelir hiç takip edilmiyor.
    expect(deriveRoas(1000, 0, 25)).toBeNull();
  });

  it('harcama yoksa null', () => {
    expect(deriveRoas(0, 500, 10)).toBeNull();
  });

  it('DÖNÜŞÜM YOKKEN gelir varsa gizlenmiyor', () => {
    // Tuhaf ama mümkün (atıf gecikmesi). Yer tutucu tespiti dönüşüm
    // sayısına dayanıyor ve sıfıra bölemeyiz; değer gerçek sayılıyor.
    expect(deriveRoas(100, 500, 0)).toBe(5);
  });

  it('negatif değerler null', () => {
    expect(deriveRoas(-100, 500, 10)).toBeNull();
    expect(deriveRoas(100, -500, 10)).toBeNull();
  });
});
