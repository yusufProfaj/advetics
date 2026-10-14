import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { iptalEdilebilirMi } from './kapatma';

/**
 * ═══ STRATEJİYİ İPTAL ET / SİL (2026-10-14) ═══
 *
 * Kullanıcı: *"stratejiyi iptal ettiğimde hâlâ oluşturamıyorum"*. Yeni
 * stratejiyi panelde iptal etmenin yolu yoktu; onay bekleyen strateji
 * yenisini kilitliyordu. Bileşen çizen test altyapısı yok: karar saf
 * fonksiyonda, bağlantılar yorumsuz kaynak taramasıyla.
 */
const oku = (yol: string) =>
  readFileSync(join(__dirname, yol), 'utf8')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('iptalEdilebilirMi', () => {
  it('KRİTİK: onay bekleyen yeni strateji iptal edilebilir (kilidi açan yol)', () => {
    expect(iptalEdilebilirMi({ bicim: 2, durum: 'onayda' })).toBe(true);
    expect(iptalEdilebilirMi({ bicim: 2, durum: 'taslak' })).toBe(true);
    expect(iptalEdilebilirMi({ bicim: 2, durum: 'onaylandi' })).toBe(true);
  });
  it('son durumlar ve eski medya planı iptal sunmaz (yalnız silinir)', () => {
    expect(iptalEdilebilirMi({ bicim: 2, durum: 'iptal' })).toBe(false);
    expect(iptalEdilebilirMi({ bicim: 2, durum: 'kapandi' })).toBe(false);
    expect(iptalEdilebilirMi({ bicim: 1, durum: 'onayda' })).toBe(false);
  });
});

describe('bağlantılar (kaynak taraması)', () => {
  it('KRİTİK: pencere iptali eylem ucuna, silmeyi DELETE ucuna gönderiyor', () => {
    const k = oku('kapatma.tsx');
    expect(k).toContain("{ eylem: 'iptal', surum: hedef.surum }");
    expect(k).toContain("apiFetch(stratejiUcYolu('/strateji/v2/planlar/:id', { id: hedef.id }), { method: 'DELETE' })");
  });

  it('KRİTİK: liste ⋯ menüsünde iptal ve sil, yetkiye bağlı; bitince liste tazeleniyor', () => {
    const g = oku('giris.tsx');
    expect(g).toContain("{yonetebilir && iptalEdilebilirMi(p) && <MenuOgesi onClick={() => kapatma(p, 'iptal')}>İptal et</MenuOgesi>}");
    expect(g).toContain("<MenuOgesi tehlike onClick={() => kapatma(p, 'sil')}>");
    expect(g).toContain('router.refresh();');
  });

  it('rapor ekranında iptal ve sil; silince listeye dönüyor', () => {
    const r = oku('rapor-ekrani.tsx');
    expect(r).toMatch(/yazabilir && iptalEdilebilirMi\(\{ bicim: 2, durum: plan\.durum \}\)/);
    expect(r).toContain("setKapatma({ tur: 'sil'");
    expect(r).toContain("router.push(stratejiPanelAdresi({ musteri: clientId, adim: 'raporlar' }))");
  });

  it('sayfa yetkiyi strategy.write’tan veriyor ve iki ekrana da geçiriyor', () => {
    const s = oku('../../../app/(dashboard)/strateji/page.tsx');
    expect(s).toContain("const yonetebilir = session.permissions.includes('strategy.write');");
    expect(s.match(/yonetebilir=\{yonetebilir\}/g)?.length).toBe(2);
  });
});
