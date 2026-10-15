import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPercent } from '@advetics/shared';
import { formatRelative, formatTarih } from '@/lib/format';

/** Ç12: Türkçe çıktı BAYT BAYT eskisi gibi; İngilizcede ayırıcı ve simgenin yeri değişir, birim değişmez. */
describe('biçim dili', () => {
  it('KRİTİK: Türkçe varsayılan değişmedi', () => {
    expect(formatMoney('1234500000', 'TRY')).toBe('1.234,50 ₺');
    expect(formatMoney('7600000000', 'TRY', { compact: true })).toBe('7,6B ₺');
    expect(formatPercent(12.5)).toBe('%12,50');
    expect(formatNumber(12345)).toBe('12.345');
  });

  it('İngilizce: ₺ önde, nokta ondalık, K kısaltma, yüzde sonda; birim TRY kalır', () => {
    expect(formatMoney('1234500000', 'TRY', { dil: 'en' })).toBe('₺1,234.50');
    expect(formatMoney('-1234500000', 'USD', { dil: 'en' })).toBe('-$1,234.50');
    expect(formatMoney('7600000000', 'TRY', { compact: true, dil: 'en' })).toBe('₺7.6K');
    expect(formatPercent(12.5, 2, 'en')).toBe('12.50%');
    expect(formatNumber(12345, 'en')).toBe('12,345');
  });

  it('tarih ve göreli zaman metni dile göre', () => {
    expect(formatTarih(null, 'en')).toBe('no date');
    expect(formatRelative(null, 'en')).toBe('never');
    expect(formatRelative(new Date(Date.now() - 3 * 60_000).toISOString(), 'en')).toBe('3 min ago');
    expect(formatRelative(new Date(Date.now() - 3 * 60_000).toISOString())).toBe('3 dk önce');
  });
});
