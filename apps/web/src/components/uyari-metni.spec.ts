import { describe, expect, it } from 'vitest';
import { ODEME_SEBEPLERI, type Uyari } from '@advetics/shared';
import { genelBakisSozlugu } from '@/dil/sozlukler/genel-bakis';
import { uyariMetni } from './uyari-bandi';

/*
 * ÖDEME UYARISI İKİ DİLDE. API'nin `baslik`/`detay`ı Türkçe (mail için);
 * İngilizce panelde Türkçe cümle görünüyordu. Sebep kodu varsa metin
 * sözlükten, hesap numarasıyla.
 */
const u: Uyari = {
  kod: 'hesap_odeme_sorunu',
  siddet: 'error',
  baslik: 'Reklamlar yayınlanmıyor — ödeme yöntemi yok',
  detay: 'Türkçe detay',
  clientId: 'c',
  clientName: 'Ege',
  adAccountId: 'a',
  adAccountName: 'Ege Google',
  platform: 'google',
  eylem: null,
  veriZamani: null,
  odemeSebebi: 'google_odeme_yontemi_yok',
  odemeAdresi: 'https://ads.google.com/aw/billing/summary',
  odemeHesapNo: '516-174-6317',
};

describe('uyariMetni', () => {
  it('KRİTİK: İngilizce panelde ödeme uyarısı İngilizce, hesap numarasıyla', () => {
    const m = uyariMetni(u, genelBakisSozlugu.en.uyari);
    expect(m.baslik).toBe('Ads are not running: no payment method');
    expect(m.detay).toContain('516-174-6317');
    expect(m.detay).not.toMatch(/[çğışöüÇĞİŞÖÜ]/);
  });

  it('Türkçe panel de sözlükten', () => {
    expect(uyariMetni(u, genelBakisSozlugu.tr.uyari).baslik).toBe('Reklamlar yayınlanmıyor: ödeme yöntemi yok');
  });

  it('sebep kodu olmayan uyarı API metniyle', () => {
    const eski = { ...u, odemeSebebi: undefined };
    expect(uyariMetni(eski, genelBakisSozlugu.en.uyari)).toEqual({ baslik: eski.baslik, detay: 'Türkçe detay' });
  });

  it('her sebebin iki dilde başlığı ve açıklaması var', () => {
    for (const s of ODEME_SEBEPLERI) {
      for (const d of [genelBakisSozlugu.tr.uyari, genelBakisSozlugu.en.uyari]) {
        expect(d.odeme.baslik[s].length).toBeGreaterThan(5);
        expect(d.odeme.detay[s]('1').length).toBeGreaterThan(10);
      }
    }
  });

  it('KRİTİK: bütçe bitmek üzere iki dilde, sayılarla; API Türkçesi görünmüyor', () => {
    const b: Uyari = {
      ...u,
      kod: 'hesap_butcesi_bitmek_uzere',
      siddet: 'warn',
      baslik: 'Hesap bütçesi bitmek üzere',
      odemeSebebi: undefined,
      butce: { kalanYuzde: 0.83, kalanGun: 2.6 },
    };
    const en = uyariMetni(b, genelBakisSozlugu.en.uyari);
    expect(en.baslik).toBe('Account budget running out');
    expect(en.detay).toContain('516-174-6317');
    expect(en.detay).toContain('0.8%');
    expect(en.detay).toContain('about 2 days');
    expect(en.detay).not.toMatch(/[çğışöüÇĞİŞÖÜ]/);
    const tr = uyariMetni(b, genelBakisSozlugu.tr.uyari);
    expect(tr.detay).toContain('%0,8');
    expect(tr.detay).toContain('yaklaşık 2 gün');
    expect(uyariMetni({ ...b, butce: { kalanYuzde: 1, kalanGun: null } }, genelBakisSozlugu.tr.uyari).detay).not.toContain('Ortalama');
  });
});
