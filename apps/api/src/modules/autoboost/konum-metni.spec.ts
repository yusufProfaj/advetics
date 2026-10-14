import { describe, expect, it } from 'vitest';
import { konumMetni } from '@advetics/shared';

/*
 * Akıllı Boost kartında "Konum 3684" (2026-10-14 canlı denetim): ad alanı
 * ön ayara sonradan eklendi ve eski ön ayarlarda yalnız Meta anahtarı var.
 * Ham anahtar kullanıcıya gösterilmez; adsız konum SAYILIR ve çözümü yazar.
 */
describe('konumMetni', () => {
  it('KRİTİK: adı olmayan konum ham anahtarla gösterilmiyor, sayılıyor', () => {
    const m = konumMetni([{ key: '3684' }]);
    expect(m).not.toContain('3684');
    expect(m).toBe('1 konum (adı kayıtlı değil; ön ayarı yeniden kaydet)');
  });

  it('adlı ve adsız karışıksa ikisi de yazıyor (sessiz düşürme yok)', () => {
    expect(konumMetni([{ key: '1', label: 'İzmir' }, { key: '2' }, { key: '3' }])).toBe('İzmir · 2 konum (adı kayıtlı değil; ön ayarı yeniden kaydet)');
  });

  it('adlılar eskisi gibi; üçten fazlası sayıyla', () => {
    expect(konumMetni([{ key: '1', label: 'İzmir' }, { key: '2', label: 'Manisa' }])).toBe('İzmir, Manisa');
    const dort = ['A', 'B', 'C', 'D'].map((a, i) => ({ key: String(i), label: a }));
    expect(konumMetni(dort)).toBe('A, B, C +1');
    expect(konumMetni([])).toBe('Türkiye geneli');
  });
});
