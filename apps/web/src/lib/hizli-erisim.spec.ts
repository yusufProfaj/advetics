import { describe, expect, it } from 'vitest';
import { ROLE_PERMISSIONS } from '@advetics/shared';
import { SECTIONS, visibleSections } from './nav-sections';
import { HIZLI_ERISIM, hizliErisim } from './hizli-erisim';

/**
 * HIZLI ERİŞİM — menüyle AYNI süzgeç. Kısayol menüde görünmüyorsa çizilmiyor;
 * ayrı bir yetki listesi yok, bu test de ayrı bir liste YAZMIYOR: rol
 * matrisini menü süzgecinden geçirip sonucu okuyor.
 */
const kisayollar = (rol: keyof typeof ROLE_PERMISSIONS): string[] =>
  hizliErisim(visibleSections([...ROLE_PERMISSIONS[rol]], { ustHesapGorunur: true, platformSahibi: false })).map(
    (k) => k.etiket,
  );

describe('hızlı erişim', () => {
  it('KRİTİK BOŞA DÜŞME BEKÇİSİ: her kısayolun adresi menüde VAR', () => {
    /*
     * Menüde adres değişirse (ör. `/reklam` taşınırsa) süzgeç o kısayolu
     * HERKESTEN sessizce gizlerdi; hata yok, düğme yok.
     */
    const menu = new Set(SECTIONS.flatMap((s) => s.items.map((i) => i.href)));
    for (const k of HIZLI_ERISIM) expect(menu.has(k.href), k.href).toBe(true);
  });

  it('yönetici dördünü görüyor', () => {
    expect(kisayollar('admin')).toEqual(['Akıllı Boost', 'Yeni reklam', 'AdvStrategy', 'Raporlar']);
  });

  it('KRİTİK: müşteri hesabı yalnız AdvStrategy ve Raporlar', () => {
    expect(kisayollar('client_viewer')).toEqual(['AdvStrategy', 'Raporlar']);
  });

  it('menüde görünmeyen kısayol çizilmiyor (boş menü → boş liste)', () => {
    expect(hizliErisim([])).toEqual([]);
  });
});
