import { describe, expect, it } from 'vitest';
import {
  AYARLAR_SEKMELERI,
  PANEL_KAPILARI,
  ROL_ETIKETI,
  SHARED_ETIKETLER_EN,
  ayarSekmesiAdi,
  kapiNedeni,
  rolEtiketi,
} from '@advetics/shared';
import { HESABIM_SATIRI, SECTIONS_HEDEF, menuEtiketiCevir, menuyuCevir } from '@/lib/nav-sections';
import { olusturSecenekleri } from '@/lib/olustur-menusu';

/**
 * D2: menü ve shared etiketleri iki dilde. Menü tanımı Türkçe; ekrana
 * çizilmeden çevriliyor. Sözlükte olmayan bir satır ÇEVİRİDE PATLIYOR
 * (`menuEtiketiCevir`), bu test o patlamanın derleme sırasında değil
 * test sırasında görülmesini sağlıyor: menüye satır ekleyip sözlüğü
 * unutan kişi İngilizce panelde Türkçe satır yerine kırmızı test görür.
 */
const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

describe('menü iki dilde', () => {
  const bolumler = [...SECTIONS_HEDEF, { title: undefined, items: [HESABIM_SATIRI] }];

  it('BOŞA DÜŞME BEKÇİSİ: menü okundu', () => {
    expect(bolumler.flatMap((b) => b.items).length).toBeGreaterThan(10);
  });

  it('KRİTİK: her bölüm başlığı, satır ve vurgu İngilizceye çevriliyor', () => {
    const duzle = (bs: typeof bolumler) =>
      bs.flatMap((b) => [
        ...(b.title ? [b.title] : []),
        ...b.items.flatMap((i) => [i.label, ...(i.vurgu ? [i.vurgu] : []), ...(i.children ?? []).map((c) => c.label)]),
      ]);
    const etiketler = duzle(menuyuCevir(bolumler, 'en'));
    // Türkçe harfe bakmak yetmiyor ("Otomatik" vurgusu harfsiz): Türkçe
    // menünün KENDİ etiketlerinden hiçbiri İngilizcede kalmamalı. Ürün adları
    // ve kimlik olarak kalan Ayarlar başlığı hariç.
    const ayni = new Set(['AdvStrategy', 'AdvCampaign', 'Base', 'Ayarlar']);
    const turkceler = new Set(duzle(bolumler).filter((e) => !ayni.has(e)));
    expect(etiketler.filter((e) => turkceler.has(e))).toEqual([]);
    expect(etiketler.filter((e) => TURKCE.test(e) && e !== 'Ayarlar')).toEqual([]);
    expect(etiketler).toEqual(expect.arrayContaining(['Overview', 'Ads Manager', 'Brand Center', 'Smart Boost']));
  });

  it('Türkçede menü olduğu gibi döner (aynı nesne)', () => {
    expect(menuyuCevir(bolumler, 'tr')).toBe(bolumler);
  });

  it('sözlükte olmayan etiket sessizce Türkçe kalmaz, hata verir', () => {
    expect(() => menuEtiketiCevir('satir', 'Yepyeni Ekran', 'en')).toThrow(/menu sozlugunde yok/);
  });

  it('+ Oluştur seçenekleri iki dilde aynı sayıda ve aynı adreslerde', () => {
    const oturum = { rol: 'admin' as const, permissions: ['bulk.write', 'strategy.write', 'boost.write', 'rule.write', 'report.write'] as never[] };
    const tr = olusturSecenekleri(oturum, 'tr');
    const en = olusturSecenekleri(oturum, 'en');
    expect(en.map((s) => s.href)).toEqual(tr.map((s) => s.href));
    expect(en.some((s) => TURKCE.test(s.ad + (s.aciklama ?? '')))).toBe(false);
  });
});

describe('shared etiketleri İngilizce', () => {
  it('KRİTİK: her İngilizce etiket dolu, Türkçe harf taşımıyor', () => {
    const yapraklar = JSON.stringify(SHARED_ETIKETLER_EN).match(/"(?:[^"\\]|\\.)*"/g) ?? [];
    expect(yapraklar.length).toBeGreaterThan(50);
    const dizeler = (v: unknown): string[] =>
      typeof v === 'string' ? [v] : v && typeof v === 'object' ? Object.values(v).flatMap(dizeler) : [];
    const turkce = dizeler(SHARED_ETIKETLER_EN);
    for (const m of turkce) {
      expect(m.trim(), m).not.toBe('');
      expect(TURKCE.test(m), m).toBe(false);
    }
  });

  it('yardımcılar iki dilde: Türkçe sabitle aynı, İngilizcesi farklı', () => {
    for (const rol of Object.keys(ROL_ETIKETI) as Array<keyof typeof ROL_ETIKETI>) {
      expect(rolEtiketi(rol, 'tr')).toBe(ROL_ETIKETI[rol]);
      expect(rolEtiketi(rol, 'en')).not.toBe(ROL_ETIKETI[rol]);
    }
    for (const s of AYARLAR_SEKMELERI) expect(ayarSekmesiAdi(s.kod, 'tr')).toBe(s.ad);
    for (const k of Object.keys(PANEL_KAPILARI) as Array<keyof typeof PANEL_KAPILARI>) {
      expect(kapiNedeni(k, 'tr')).toBe(PANEL_KAPILARI[k].neden);
      expect(kapiNedeni(k, 'en'), k).not.toBe(PANEL_KAPILARI[k].neden);
    }
  });
});
