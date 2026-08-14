import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE, RANGE_PRESETS, resolveRange, today } from './date-range';

/**
 * Tarih aralığı çözümlemesi.
 *
 * NEDEN BU TEST VAR: bir günlük kayma HİÇBİR HATA ÜRETMİYOR. Panel çalışır,
 * sayılar görünür, yalnızca yanlış günün verisidir — ve kimse fark etmez.
 * Bu projede daha önce tam olarak bu oldu: panel bugünü dışlarken rapor içine
 * alıyordu ve iki ekran farklı rakam gösteriyordu.
 *
 * `days` alanı gün SAYISI, aralığın uçları değil. `to - from + 1 = days`
 * olmalı; eksi bir hatası burada en kolay yapılan hata.
 */
const DAY = 86_400_000;

function spanDays(from: string, to: string): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY + 1;
}

describe('resolveRange', () => {
  it.each(RANGE_PRESETS.map((p) => [p.key, p.days] as const))(
    '%s aralığı tam %i gün kapsıyor',
    (key, days) => {
      const r = resolveRange(key);
      expect(spanDays(r.from, r.to)).toBe(days);
      expect(r.from <= r.to).toBe(true);
    },
  );

  it('bilinmeyen değer sessizce varsayılana düşüyor', () => {
    // URL elle düzenlenebiliyor; hata sayfası yerine çalışan panel.
    expect(resolveRange('hoyratbirdeger').key).toBe(DEFAULT_RANGE);
    expect(resolveRange(undefined).key).toBe(DEFAULT_RANGE);
  });

  it('BUGÜN aralığı bugünü kapsıyor ve tamamlanmamış işaretleniyor', () => {
    const r = resolveRange('bugun');
    expect(r.from).toBe(today());
    expect(r.to).toBe(today());
    expect(r.incomplete).toBe(true);
  });

  it('diğer aralıkların HİÇBİRİ bugünü içermiyor', () => {
    // Tamamlanmamış bir günü çok günlük ortalamaya katmak bütün oranları
    // aşağı çekiyor ve "CPA düştü" yanılsaması üretiyor. Bu kararın kaza
    // eseri bozulmaması gerekiyor.
    for (const p of RANGE_PRESETS.filter((x) => x.key !== 'bugun')) {
      const r = resolveRange(p.key);
      expect(r.to < today(), `${p.key} bugünü içeriyor`).toBe(true);
      expect(r.incomplete).toBe(false);
    }
  });

  it('kullanıcının istediği altı pencere de tanımlı', () => {
    // Bugün · dün · 7 · 30 · 60 · 90. Biri silinirse panelde sessizce kaybolur.
    expect(RANGE_PRESETS.map((p) => p.key)).toEqual([
      'bugun',
      'dun',
      '7g',
      '30g',
      '60g',
      '90g',
    ]);
  });

  it('hiçbir aralık API sınırını (400 gün) aşmıyor', () => {
    // metrics.schema.ts 400 günü reddediyor; aşan bir preset eklemek panelde
    // doğrulama hatasına düşen bir sekme demek.
    for (const p of RANGE_PRESETS) {
      expect(spanDays(resolveRange(p.key).from, resolveRange(p.key).to)).toBeLessThanOrEqual(400);
    }
  });
});
