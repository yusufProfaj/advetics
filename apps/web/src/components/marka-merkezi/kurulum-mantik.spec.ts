import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KURULUM_GRUPLARI, KURULUM_ADIM_DURUMLARI, kurulumIstegiSchema } from '@advetics/shared';
import { DURUM_GOSTERIMI, GRUP_BASLIGI, gelistiriciEpostasi, izinDonusu, otomatikIstek, secimIstegi } from './kurulum-mantik';

describe('kurulum bölümü', () => {
  it('her grup ve durumun gösterimi var', () => {
    for (const g of KURULUM_GRUPLARI) expect(GRUP_BASLIGI[g].baslik.length).toBeGreaterThan(3);
    for (const d of KURULUM_ADIM_DURUMLARI) expect(DURUM_GOSTERIMI[d].etiket.length).toBeGreaterThan(2);
  });

  it('KRİTİK: seçim formundan kurulan her istek sunucunun şemasından geçer', () => {
    const uuid = '11111111-1111-4111-8111-111111111111';
    const istekler = [
      secimIstegi('meta_hesap', { tur: 'mevcut', deger: uuid }),
      secimIstegi('meta_hesap', { tur: 'yeni', ust: '123456789', ad: 'Proje A' }),
      secimIstegi('google_hesap', { tur: 'yeni', ust: '1234567890', ad: 'Proje A' }),
      secimIstegi('google_hesap', { tur: 'davet', ust: '1234567890', musteriNo: '123-456-7890' }),
      secimIstegi('sayfa', { tur: 'mevcut', deger: uuid }),
      secimIstegi('meta_piksel', { tur: 'yeni', ust: '', ad: '' }),
      secimIstegi('gtm_konteyner', { tur: 'yeni', ust: '6000000001', ad: '' }),
      secimIstegi('gtm_konteyner', { tur: 'mevcut', deger: 'accounts/1/containers/2' }),
      secimIstegi('ga4_mulk', { tur: 'mevcut', deger: '123456' }),
    ];
    for (const i of istekler) {
      expect(i).not.toBeNull();
      expect(kurulumIstegiSchema.safeParse(i).success, JSON.stringify(i)).toBe(true);
    }
  });

  it('KRİTİK: etiket yayını kayıtlı tetik olmadan istek kurmaz (boş tetikle yayın yok)', () => {
    expect(otomatikIstek('gtm_etiket', null)).toBeNull();
    expect(otomatikIstek('gtm_etiket', { formYolu: '/t', telefon: true, whatsapp: false })).toEqual({ kod: 'gtm_etiket', tetik: { formYolu: '/t', telefon: true, whatsapp: false } });
    expect(otomatikIstek('meta_hesap', null)).toBeNull();
  });

  it('geliştirici e-postası kodu ve kimliği taşır; dönüş adresi göreli', () => {
    const m = gelistiriciEpostasi('https://ornek.com', 'GTM-ABC123', '<script>h</script>', '<noscript>b</noscript>');
    expect(m.startsWith('mailto:?subject=')).toBe(true);
    expect(decodeURIComponent(m)).toContain('GTM-ABC123');
    expect(decodeURIComponent(m)).toContain('<script>h</script>');
    expect(izinDonusu('abc').startsWith('/marka-merkezi?bolum=kurulum')).toBe(true);
  });

  it('KRİTİK: bileşen hatayı yutmaz', () => {
    const k = readFileSync(join(__dirname, 'kurulum-bolumu.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
    expect(k).toContain("setHal({ tur: 'hata'");
  });
});
