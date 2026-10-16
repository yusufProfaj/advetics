import { describe, expect, it } from 'vitest';
import { olusturDugmesi } from './reklam-yoneticisi';

/** Sağ üstteki "Oluştur" sekmeye göre (kullanıcı, 2026-10-16). */
describe('olusturDugmesi', () => {
  const WS = '11111111-1111-4111-8111-111111111111';
  const HEPSI = { reklam: true, kitle: true };

  it('KRİTİK: Kampanyalar → Yeni kampanya, Reklamlar → Reklam, Hedef kitleler → Hedef kitle', () => {
    expect(olusturDugmesi('campaign', WS, HEPSI)).toEqual({ etiket: 'Yeni kampanya', href: `/reklam?musteri=${WS}` });
    expect(olusturDugmesi('ad', WS, HEPSI)).toEqual({ etiket: 'Reklam', href: `/reklam?musteri=${WS}` });
    const kitle = olusturDugmesi('kitle', WS, HEPSI)!;
    expect(kitle.etiket).toBe('Hedef kitle');
    // Base › Varlıklar › Kitleler, yeni kitle formu AÇIK gelir.
    expect(kitle.href).toContain('sekme=kitleler');
    expect(kitle.href).toContain('yeni=1');
  });

  it('yetkisi olmayana düğme yok; kitle workspace’siz açılmaz', () => {
    expect(olusturDugmesi('campaign', WS, { reklam: false, kitle: true })).toBeNull();
    expect(olusturDugmesi('kitle', WS, { reklam: true, kitle: false })).toBeNull();
    expect(olusturDugmesi('kitle', null, HEPSI)).toBeNull();
    // Üst düzeylerde (workspace seçili değil) AdvCampaign kendi workspace seçimini soruyor.
    expect(olusturDugmesi('sirket', null, HEPSI)).toEqual({ etiket: 'Yeni kampanya', href: '/reklam' });
  });
});
