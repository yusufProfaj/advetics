import { describe, expect, it } from 'vitest';
import { yayinIsKimligi } from './reklam-kuyrugu';

/**
 * Canlıda (2026-10-11) "Yeniden kontrol et" ikinci basışta sessizce yutuldu:
 * kimlik sabitti ve tamamlanmış iş Redis'te duruyordu.
 */
describe('yayinIsKimligi', () => {
  it('KRİTİK: kur sabit (mükerrer kampanya engeli), insan düğmeleri her basışta yeni kimlik', () => {
    const id = '00000000-0000-4000-8000-000000000001';
    expect(yayinIsKimligi(id, 'kur', 1)).toBe(yayinIsKimligi(id, 'kur', 2));
    for (const adim of ['devam', 'geri_al', 'yeniden_oku'] as const) {
      expect(yayinIsKimligi(id, adim, 1)).not.toBe(yayinIsKimligi(id, adim, 2));
      // BullMQ `:` içeren kimliği reddediyor.
      expect(yayinIsKimligi(id, adim, 1)).not.toContain(':');
    }
  });
});
