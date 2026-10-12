import { describe, expect, it } from 'vitest';
import { aramaOgesiE164, promosyonSorunu, siteHaritasiOku, type RehberPromosyon } from '@advetics/shared';
import { metinOnerisiTemizle } from '../rehber/oneriler';
import { googleGeriOkumaKarsilastir } from './google-yayin';
import type { GoogleBeklenen } from './derle-google';

/**
 * AJAN 4 KAPISI — Google Arama öğeleri (g-1.2.0, 2026-10-12).
 * Yeşil olanlar kapının ölçtüğü sınırları kilitliyor; KIRMIZI olanlar
 * bulgu (Ö-C, N-1) ve düzeltme bulguyu üreten ajanda.
 */

describe('Ö-C: yapay zekânın açıklama metni — "garanti" sözü kaynakta yoksa atılır', () => {
  /*
   * Açıklama metni (CalloutAsset) kampanya düzeyinde SÜRESİZ duruyor. Şema
   * açıklaması ve istem "garanti YOK" diyor ama KOD bunu dayatmıyor: dar
   * kapı (`aciklamaMetinleriUret`) yalnız sayı ve fiyat sözüne bakıyor,
   * genel uydurma kapısı (`uydurmaMi`) da öyle. "Garantili işçilik"
   * marka bilgisinde geçmeden reklama giriyor; istem bir kural değil.
   */
  it('KIRMIZI: kaynakta garanti geçmiyorsa "Garantili işçilik" atılır, "Uzman ekip" kalır', () => {
    const r = metinOnerisiTemizle(
      { anaMetin: 'a', basliklar: [], aciklamalar: [], aciklamaMetinleri: ['Garantili işçilik', 'Uzman ekip'] },
      { kaynakMetin: 'Marka: Ege Birlik Yapı. Hizmet: konut projeleri.', yasalUyari: null },
    );
    expect(r.aciklamaMetinleri).toEqual(['Uzman ekip']);
  });
});

describe('aramaOgesiE164 — sınır hâlleri (uydurma numara yok)', () => {
  it('dahili, iki numara, yabancı, 0800/0850/444 → null; 0090 ve parantezli biçim doğru', () => {
    expect(aramaOgesiE164('0232 555 12 34 dahili 12')).toBeNull();
    expect(aramaOgesiE164('0232 555 12 34 / 0532 111 22 33')).toBeNull();
    expect(aramaOgesiE164('+44 20 7946 0958')).toBeNull();
    expect(aramaOgesiE164('0800 211 00 00')).toBeNull();
    expect(aramaOgesiE164('+90 850 123 45 67')).toBeNull();
    expect(aramaOgesiE164('+90 444 75 09')).toBeNull();
    expect(aramaOgesiE164('0090 532 828 55 25')).toBe('+905328285525');
    expect(aramaOgesiE164('(0232) 555-12-34')).toBe('+902325551234');
  });
});

describe('N-1: promosyon tarihi takvimde olmalı (giriş anında)', () => {
  const p = (o: Partial<RehberPromosyon> = {}): RehberPromosyon => ({ hedef: 'Tüm daireler', indirim: { tur: 'yuzde', yuzde: 10 }, baslangic: null, bitis: '2026-12-31', ...o });
  /*
   * Şema yalnız YYYY-MM-DD BİÇİMİNE bakıyor; "2026-02-30" geçiyor ve
   * Google'a gidiyor. Google onu öğe hatası olarak reddederse öğe reddi
   * dalı BÜTÜN öğeleri (işletme adı, logo, snippet, site bağlantısı) atıp
   * yeniden prova ediyor: kullanıcının bir yazım hatası altı öğeyi götürür.
   */
  it('KIRMIZI: 30 Şubat bitiş tarihi engel', () => {
    expect(promosyonSorunu(p({ bitis: '2026-02-30' }))).not.toBeNull();
  });
  it('geçerli girdi engel değil', () => {
    expect(promosyonSorunu(p())).toBeNull();
  });
});

describe('site haritası — derinlik ve alan sınırı', () => {
  it('alt harita yine dizinse sayfa ÜRETMEZ (dizin yalnız bir kat açılır)', () => {
    const ic = '<sitemapindex><sitemap><loc>https://ornek.com.tr/derin.xml</loc></sitemap></sitemapindex>';
    expect(siteHaritasiOku(ic, 'https://ornek.com.tr/')).toEqual({ sayfalar: [], altHaritalar: ['https://ornek.com.tr/derin.xml'] });
  });
  it('alt harita adresi de aynı alan, https, portsuz', () => {
    const d = `<sitemapindex>
      <sitemap><loc>https://169.254.169.254/latest.xml</loc></sitemap>
      <sitemap><loc>https://ornek.com.tr:6379/x.xml</loc></sitemap>
      <sitemap><loc>http://ornek.com.tr/x.xml</loc></sitemap>
      <sitemap><loc>https://ornek.com.tr.evil.com/x.xml</loc></sitemap>
      <sitemap><loc>https://ornek.com.tr/page.xml</loc></sitemap></sitemapindex>`;
    expect(siteHaritasiOku(d, 'https://ornek.com.tr/').altHaritalar).toEqual(['https://ornek.com.tr/page.xml']);
  });
  it('varlık bildirimi (DOCTYPE/ENTITY) GENİŞLETİLMEZ: ayrıştırıcı yok, düzenli ifade', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "https://ornek.com.tr/gizli">]><urlset><url><loc>&a;</loc></url></urlset>`;
    expect(siteHaritasiOku(xml, 'https://ornek.com.tr/').sayfalar.some((s) => s.includes('gizli'))).toBe(false);
  });
});

describe('geri okuma — öğe biçimleri ve eski satırlar', () => {
  const taban: GoogleBeklenen = {
    kanal: 'SEARCH',
    kampanyaAdi: 'x',
    durum: 'PAUSED',
    butceMicros: '1000000',
    konumSayisi: 1,
    anahtarKelimeSayisi: 1,
    negatifSayisi: 0,
    aramaOgesi: null,
    teklif: 'TARGET_SPEND',
  } as unknown as GoogleBeklenen;
  const okunanTaban = { kanal: 'SEARCH', kampanyaAdi: 'x', durum: 'PAUSED', butceMicros: '1000000', konumSayisi: 1, anahtarKelimeSayisi: 1, negatifSayisi: 0, aramaOgeleri: [], teklif: 'TARGET_SPEND' };
  const ogeler = {
    isletmeAdi: 'Ege Birlik Yapı',
    logo: 1,
    snippet: { baslik: 'Türler', degerler: ['Daire', 'Villa', 'Ofis'] },
    promosyon: { hedef: 'Tüm daireler', yuzdeMicros: '150000', tutarMicros: null, baslangic: null, bitis: '2026-12-31' },
    fiyat: null,
  };

  it('eski satır (beklentide ogeler YOK) sonradan bağlanan öğe yüzünden fark vermez', () => {
    const r = googleGeriOkumaKarsilastir(taban, { ...okunanTaban, ogeler } as never);
    expect(r.satirlar.filter((s) => String((s as { alan?: string }).alan ?? '').startsWith('oge.'))).toEqual([]);
  });
  it('aynı içerik → oge satırı yok; Google percent_off başka değer → yalnız oge.promosyon', () => {
    const b = { ...taban, ogeler } as GoogleBeklenen;
    const ayni = googleGeriOkumaKarsilastir(b, { ...okunanTaban, ogeler: structuredClone(ogeler) } as never);
    expect(JSON.stringify(ayni.satirlar)).not.toContain('oge.');
    const farkli = googleGeriOkumaKarsilastir(b, { ...okunanTaban, ogeler: { ...ogeler, promosyon: { ...ogeler.promosyon, yuzdeMicros: '15000' } } } as never);
    expect(JSON.stringify(farkli.satirlar)).toContain('oge.promosyon');
    expect(JSON.stringify(farkli.satirlar)).not.toContain('oge.isletmeAdi');
  });
});
