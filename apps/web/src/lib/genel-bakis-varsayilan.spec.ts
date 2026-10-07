import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE, resolveRange } from './date-range';

/**
 * GENEL BAKIŞ "BU AY" İLE AÇILIR (kullanıcı kararı, 2026-10-07).
 *
 * Ortak varsayılan son 30 gün olarak kalıyor (raporlar, reklam gezgini);
 * Genel Bakış'ın kendi varsayılanı sayfada. İki iddia: sayfa adreste aralık
 * yokken `bu_ay` çözüyor ve ortak varsayılan bundan etkilenmiyor.
 */
const SAYFA = readFileSync(join(__dirname, '../app/(dashboard)/dashboard/page.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('Genel Bakış açılış aralığı', () => {
  it('KRİTİK: adreste aralık yoksa "Bu ay" seçili geliyor', () => {
    expect(SAYFA).toContain("const GENEL_BAKIS_ARALIGI = 'bu_ay';");
    expect(SAYFA).toContain('first(params.aralik) ?? GENEL_BAKIS_ARALIGI');
    // Ham parametre resolveRange'e doğrudan gitmiyor; gitse varsayılan 30 gün olurdu.
    expect(SAYFA).not.toMatch(/aralik:\s*first\(params\.aralik\)/);
    expect(resolveRange({ aralik: 'bu_ay' }).key).toBe('bu_ay');
  });

  it('ortak varsayılan değişmedi: diğer ekranlar son 30 günle açılıyor', () => {
    expect(DEFAULT_RANGE).toBe('30g');
  });
});
