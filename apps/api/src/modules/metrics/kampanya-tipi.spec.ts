import { describe, expect, it } from 'vitest';
import { kampanyaTipi } from '@advetics/shared';

/**
 * KAMPANYA TİPİ ETİKETİ.
 *
 * Aynı `objective` kolonu Meta'da amaç, Google'da kanal türü taşıyor; etiket
 * platforma göre çözülmezse bir Google arama kampanyası "SEARCH", bir Meta
 * form kampanyası "Potansiyel müşteri" görünür.
 */
describe('kampanyaTipi', () => {
  it('KRİTİK: Meta form, AMAÇTAN değil ad set hedefinden çıkıyor', () => {
    expect(kampanyaTipi('meta', 'OUTCOME_LEADS', ['LEAD_GENERATION'])).toBe('Form');
    // Siteye trafik gönderen potansiyel müşteri kampanyası form DEĞİL.
    expect(kampanyaTipi('meta', 'OUTCOME_LEADS', ['OFFSITE_CONVERSIONS'])).toBe('Potansiyel müşteri');
    expect(kampanyaTipi('meta', 'OUTCOME_LEADS', ['LEAD_GENERATION', 'OFFSITE_CONVERSIONS'])).toBe(
      'Form ve diğer',
    );
    expect(kampanyaTipi('meta', 'OUTCOME_ENGAGEMENT', ['CONVERSATIONS'])).toBe('Mesaj');
  });

  it('Google kanal türü iş diline çevriliyor', () => {
    expect(kampanyaTipi('google', 'VIDEO')).toBe('YouTube');
    expect(kampanyaTipi('google', 'SEARCH')).toBe('Arama');
    expect(kampanyaTipi('google', 'PERFORMANCE_MAX')).toBe('Performance Max');
  });

  it('bilinmeyen değer gizlenmiyor, ham dönüyor; değer yoksa null', () => {
    expect(kampanyaTipi('meta', 'OUTCOME_YENI_BIR_SEY')).toBe('OUTCOME_YENI_BIR_SEY');
    expect(kampanyaTipi('linkedin', null)).toBeNull();
  });
});
