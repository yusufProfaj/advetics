import { describe, expect, it } from 'vitest';
import sitemap from '@/app/sitemap';
import { SITE_SAYFALARI, YASAL_BELGELER } from '@/components/landing/site-icerik';
import { dilDegisinceYol, enOnekliMi, ingilizceYolu, turkceYolu, yerelYol } from './site-yollari';

/**
 * İKİ DİLLİ SİTE ADRESLERİ (Ç2). Eşlemesi eksik bir sayfa İngilizce
 * ziyaretçiye 404 verir ya da Türkçe sayfaya düşer; ikisi de hata mesajı
 * üretmez. Liste elle yazılı (Edge paketi site metnini içe aktarmıyor), bu
 * yüzden sitenin KENDİ sayfa listesiyle karşılaştırılıyor.
 */
const TR_SAYFALAR = [...SITE_SAYFALARI.map((s) => s.yol), ...YASAL_BELGELER.map((y) => y.href)];

describe('site yolları: Türkçe ↔ İngilizce', () => {
  it('BOŞA DÜŞME BEKÇİSİ: sayfa listesi okundu', () => {
    expect(TR_SAYFALAR.length).toBeGreaterThan(15);
  });

  it('KRİTİK: her site ve yasal sayfanın İngilizce adresi var ve geri dönüşü aynı sayfa', () => {
    for (const tr of TR_SAYFALAR) {
      const en = ingilizceYolu(tr);
      expect(en, tr).not.toBeNull();
      expect(enOnekliMi(en!), tr).toBe(true);
      expect(turkceYolu(en!), tr).toBe(tr);
    }
  });

  it('İngilizce adresler tekil (iki sayfa aynı adrese düşmüyor)', () => {
    const enler = TR_SAYFALAR.map((t) => ingilizceYolu(t));
    expect(new Set(enler).size).toBe(enler.length);
  });

  it('panel ve giriş ekranı öneklenmiyor; çapa korunuyor', () => {
    expect(ingilizceYolu('/login')).toBeNull();
    expect(ingilizceYolu('/dashboard')).toBeNull();
    expect(yerelYol('/login', 'en')).toBe('/login');
    expect(yerelYol('/ozellikler/akilli-boost', 'en')).toBe('/en/features/akilli-boost');
    expect(yerelYol('/cerez-politikasi#cerezler', 'en')).toBe('/en/cookies#cerezler');
    expect(yerelYol('/gizlilik', 'tr')).toBe('/gizlilik');
  });

  it('alt yol yalnız detay sayfası olan köklerde ve tek düzey', () => {
    expect(turkceYolu('/en/privacy/x')).toBeNull();
    expect(turkceYolu('/en/features/../../dashboard')).toBeNull();
    expect(turkceYolu('/en/dashboard')).toBeNull();
    expect(turkceYolu('/en/')).toBe('/');
  });

  it('dil değişince karşı dildeki sayfa; site dışında aynı yol', () => {
    expect(dilDegisinceYol('/gizlilik', 'en')).toBe('/en/privacy');
    expect(dilDegisinceYol('/en/privacy', 'tr')).toBe('/gizlilik');
    expect(dilDegisinceYol('/en/privacy', 'en')).toBe('/en/privacy');
    expect(dilDegisinceYol('/login', 'en')).toBe('/login');
    expect(dilDegisinceYol('/', 'en')).toBe('/en');
  });

  it('site haritasında her sayfanın iki dili var ve birbirine bağlı', () => {
    const harita = sitemap();
    const adresler = harita.map((s) => new URL(s.url).pathname);
    for (const tr of TR_SAYFALAR) {
      const en = ingilizceYolu(tr)!;
      expect(adresler, tr).toContain(tr);
      expect(adresler, en).toContain(en);
      const kayit = harita.find((s) => new URL(s.url).pathname === en)!;
      expect(new URL(kayit.alternates!.languages!.tr as string).pathname).toBe(tr);
    }
  });
});
