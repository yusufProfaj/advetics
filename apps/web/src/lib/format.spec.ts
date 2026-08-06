import { describe, expect, it } from 'vitest';
import {
  changePercent,
  changePercentMicros,
  formatDayShort,
  formatDecimal,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  formatRoas,
  isStale,
} from './format';

/**
 * Biçimlendirme testleri.
 *
 * NEDEN BU TEST VAR: panelin gösterdiği HER sayı buradan geçiyor. Bir hata
 * müşteriye yanlış harcama raporlamakla sonuçlanır ve bu, bu projede
 * yapılabilecek en pahalı hatalardan biri — kimse "7.612 TRY" ile "761 TRY"
 * arasındaki farkı fark etmeden karar verir.
 *
 * İki grup iddia:
 *   1. HASSASİYET. Para micros ve `BigInt`; `Number(micros)/1e6` 2^53 üstünde
 *      kuruş kaybediyor. Büyük hesaplarda yıllık harcama bu sınıra yaklaşıyor.
 *   2. NULL ANLAMBILIMI. `null` "hesaplanamaz" demek, sıfır DEĞİL. "%0" ya da
 *      "0.00×" göstermek müşteriye "kampanyan çalışmıyor" demek olur.
 */

describe('formatMoney', () => {
  it('micros değerini kuruşuyla biçimlendirir', () => {
    expect(formatMoney('7612190000', 'TRY')).toBe('7.612,19 ₺');
  });

  it('REGRESYON: 2^53 üstünde hassasiyet KAYBETMİYOR', () => {
    // `Number('99999999999999999') / 1e6` = 100000000000.00002 → kuruş bozuk.
    // BigInt aritmetiği tam sonucu koruyor.
    expect(formatMoney('99999999999999999', 'TRY')).toBe('99.999.999.999,99 ₺');
  });

  it('tek micros bile kaybolmuyor (aşağı yuvarlama)', () => {
    expect(formatMoney('1', 'TRY')).toBe('0,00 ₺');
    expect(formatMoney('10000', 'TRY')).toBe('0,01 ₺');
    expect(formatMoney('9999', 'TRY')).toBe('0,00 ₺');
  });

  it('null "—" olur, "0" DEĞİL', () => {
    // Sıfır göstermek "hiç harcama yok" der; doğrusu "hesaplanamıyor".
    expect(formatMoney(null, 'TRY')).toBe('—');
    expect(formatMoney(undefined, 'TRY')).toBe('—');
  });

  it('gerçek sıfırı sıfır olarak gösterir', () => {
    expect(formatMoney('0', 'TRY')).toBe('0,00 ₺');
  });

  it('negatif tutarı doğru işaretler', () => {
    expect(formatMoney('-5000000', 'USD')).toBe('-5,00 $');
  });

  it('bilinmeyen para birimi kodunu olduğu gibi gösterir', () => {
    expect(formatMoney('1000000', 'XYZ')).toBe('1,00 XYZ');
  });

  it('para birimi yoksa sembol koymaz', () => {
    // Karışık para biriminde tek bir sembol göstermek yanlış olurdu.
    expect(formatMoney('1000000', null)).toBe('1,00');
  });

  it('bozuk girişte çökmez', () => {
    expect(formatMoney('abc', 'TRY')).toBe('—');
    expect(formatMoney('1.5', 'TRY')).toBe('—');
  });

  it('kompakt biçim yalnızca büyüklük veriyor', () => {
    expect(formatMoney('7612190000', 'TRY', { compact: true })).toBe('7,6B ₺');
    expect(formatMoney('2500000000000', 'TRY', { compact: true })).toBe('2,5M ₺');
    expect(formatMoney('500000000', 'TRY', { compact: true })).toBe('500 ₺');
  });
});

describe('null anlambilimi', () => {
  it('oran biçimlendiricileri null için "—" döner', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatRoas(null)).toBe('—');
    expect(formatNumber(null)).toBe('—');
    expect(formatDecimal(null)).toBe('—');
  });

  it('sıfır oranı sıfır olarak gösterir — null ile karıştırmıyor', () => {
    expect(formatPercent(0)).toBe('%0,00');
    expect(formatRoas(0)).toBe('0,00×');
    expect(formatNumber(0)).toBe('0');
  });
});

describe('değişim yüzdesi', () => {
  it('önceki dönem SIFIRSA null — "%∞" ya da "%100" ikisi de yanlış', () => {
    expect(changePercentMicros('100', '0')).toBeNull();
    expect(changePercent(100, 0)).toBeNull();
  });

  it('önceki dönem yoksa null', () => {
    expect(changePercentMicros('100', null)).toBeNull();
    expect(changePercent(100, undefined)).toBeNull();
  });

  it('artış ve düşüşü doğru hesaplar', () => {
    expect(changePercentMicros('200', '100')).toBe(100);
    expect(changePercentMicros('50', '100')).toBe(-50);
    expect(changePercent(150, 100)).toBeCloseTo(50, 6);
  });

  it('büyük micros değerlerinde de doğru oran verir', () => {
    expect(changePercentMicros('2000000000000', '1000000000000')).toBeCloseTo(100, 6);
  });

  it('bozuk girişte null döner', () => {
    expect(changePercentMicros('abc', '100')).toBeNull();
  });
});

describe('tarih ve tazelik', () => {
  it('tarihi UTC olarak biçimlendirir — gün KAYMIYOR', () => {
    // Yerel saat dilimiyle yorumlamak UTC+3'te günü bir geriye alırdı.
    expect(formatDayShort('2026-08-05')).toBe('5 Ağu');
    expect(formatDayShort('2026-01-01')).toBe('1 Oca');
  });

  it('göreli zamanı okunur veriyor', () => {
    expect(formatRelative(null)).toBe('hiç');
    expect(formatRelative(new Date().toISOString())).toBe('az önce');
    expect(formatRelative(new Date(Date.now() - 5 * 60_000).toISOString())).toBe('5 dk önce');
    expect(formatRelative(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe('3 sa önce');
    expect(formatRelative(new Date(Date.now() - 2 * 86_400_000).toISOString())).toBe('2 gün önce');
  });

  it('bayatlık eşiği 2 saat', () => {
    // Mimari dokümandaki eşik: 2 saatten eski veri sarı bantla uyarılıyor.
    expect(isStale(null)).toBe(true);
    expect(isStale(new Date().toISOString())).toBe(false);
    expect(isStale(new Date(Date.now() - 90 * 60_000).toISOString())).toBe(false);
    expect(isStale(new Date(Date.now() - 3 * 3_600_000).toISOString())).toBe(true);
  });
});
