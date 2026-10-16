import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KURULUM_ADIM_DURUMLARI, kurulumIstegiSchema } from '@advetics/shared';
import { durumGosterimi, gelistiriciEpostasi, izinDonusu, otomatikIstek, secimIstegi } from './kurulum-mantik';

describe('kurulum bölümü', () => {
  it('her durumun gösterimi var', () => {
    for (const d of KURULUM_ADIM_DURUMLARI) {
      expect(durumGosterimi(d, 'tr').etiket.length).toBeGreaterThan(2);
      expect(durumGosterimi(d, 'en').etiket.length).toBeGreaterThan(2);
    }
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
    // Dil verilince e-posta o dilde yazılıyor (İngilizce arayüzde Türkçe mail gitmesin).
    expect(decodeURIComponent(gelistiriciEpostasi(null, 'GTM-ABC123', 'h', 'b', 'en'))).toContain('Could you add the two codes');
    expect(decodeURIComponent(gelistiriciEpostasi(null, 'GTM-ABC123', 'h', 'b'))).toContain('Sitemize aşağıdaki');
    // Sözleşmenin üreticisinden ve ÇAPASIZ: OAuth dönüş denetimi `#` kabul etmiyor.
    expect(izinDonusu('abc')).toBe('/marka-merkezi?musteri=abc&bolum=kurulum');
  });

  it('KRİTİK: bileşen hatayı yutmaz', () => {
    const k = readFileSync(join(__dirname, 'kurulum-bolumu.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).not.toMatch(/\.catch\(\s*\(\)\s*=>/);
    // Seçenekler okunamazsa sebebi, adım isteği düşerse platformun mesajı yazıyor.
    expect(k).toContain("setS({ tur: 'hata', mesaj: hataMetni(e) })");
    expect(k).toContain('setHata(hataMetni(e))');
  });

  it('KRİTİK: gerçek hesap açan düğme onaysız istek göndermiyor (Ç-20)', () => {
    const k = readFileSync(join(__dirname, 'kurulum-bolumu.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    // Hesap adı isteyen adımda (Meta/Google hesabı) ilk tık ONAYI açıyor.
    expect(k).toContain("onClick={() => (AD_ISTEYEN.has(kod) ? setYeniOnay(true) : istek({ tur: 'yeni', ust, ad }))}");
    // İsteği gönderen tek düğme onay panelinin içinde.
    const panel = k.slice(k.indexOf('role="alertdialog"'));
    if (panel.length === k.length) throw new Error('onay paneli bulunamadı');
    expect(panel.slice(0, panel.indexOf('Vazgeç'))).toContain("onClick={() => istek({ tur: 'yeni', ust, ad })}");
    // Onay DOM'dan çıkmıyor; görünürlük sınıfla.
    expect(k).toContain("${yeniOnay ? 'opacity-100' : 'pointer-events-none hidden opacity-0'}");
  });

  it('KRİTİK: hesap adımlarının eylemi kurulum.hesap kapısıyla, diğerleri kurulum.yaz ile', () => {
    const k = readFileSync(join(__dirname, 'kurulum-bolumu.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain('const eylemYetkisi = HESAP_ADIMLARI.has(a.kod) ? hesapYazabilir : yazabilir;');
    expect(k).toContain('{eylemYetkisi && e && (');
  });
});
