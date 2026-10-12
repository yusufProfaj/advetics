import { describe, expect, it } from 'vitest';
import {
  BOS_ARAMA_OGELERI,
  GOOGLE_SNIPPET_BASLIKLARI,
  altSayfaAdaylari,
  aramaOgesiE164,
  aciklamaMetniSec,
  cipaBaglantiSayisi,
  googleAramaOgeleri,
  kararTablosu,
  ogeDurumlariGovdeyle,
  promosyonSorunu,
  rehberdenGoogle,
  rehberEksikleri,
  siteBaglantisiSebebi,
  siteHaritasiOku,
  type GoogleDerlemeGirdisi,
  type GoogleOgeKaynagi,
  type GoogleTuretmeBaglami,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';
import type { FetchContext } from '../../connections/provider.types';
import { aramaOgeIslemleriEkle } from '../../connections/providers/google-arama-ogeleri';
import { derleGoogle, GOOGLE_DERLEYICI_SURUMU, type GoogleDerlemeBaglami } from './derle-google';
import { googleGeriOku, googleGeriOkumaKarsilastir, ogeSorgusu, type GoogleOkunan, type GoogleYayinPortu } from './google-yayin';

/**
 * ARAMA ÖĞELERİ (g-1.2.0) — ilk canlı "Siteme gelsinler" Arama kampanyasında
 * (2026-10-12, Ege Birlik Yapı) Google Ads arayüzü aramalar, işletme adı,
 * logo, site bağlantıları, açıklama metinleri, snippet, promosyon ve fiyatı
 * BOŞ gösterdi. Bu dosya üç şeyi kilitliyor:
 *  1. Site bağlantısı teşhisi (fixture, ağ yok): tek sayfalık site.
 *  2. Öğe seçimi: kaynağı olan kurulur, olmayan SEBEBİYLE kurulmaz.
 *  3. Derleyici: aynı atomik istek, sıra, geri okuma beklentisi.
 */

// ---------------------------------------------------------------------------
// 1. TEŞHİS — Ege Birlik Seasight ana sayfasının bağlantı yapısı (2026-10-12
// okunan sayfadan; metin içerikleri atıldı, bağlantı yapısı birebir).
// ---------------------------------------------------------------------------
const SEASIGHT = 'https://egebirlikseasight.com/';
const SEASIGHT_HTML = `<!doctype html><html lang="tr"><head><title>Ege Birlik</title></head><body>
<a class="skip-link screen-reader-text" href="#content">İçeriğe geç</a>
<a href="https://egebirlikseasight.com"><img src="logo.webp"></a>
<nav><a href="#hakkinda" class="elementor-item elementor-item-anchor">Hakkında</a>
<a href="#ozellikler" class="elementor-item elementor-item-anchor">Özellikler</a>
<a href="#galeri" class="elementor-item elementor-item-anchor">Galeri</a>
<a href="#iletisim" class="elementor-item elementor-item-anchor">İletişim</a></nav>
<a class="elementor-button" href="#iletisim">Bilgi al</a>
<a href="https://www.facebook.com/egebirlikyapi/" target="_blank">f</a>
<a href="http://instagram.com/egebirlikyapi/" target="_blank">i</a>
<a href="tel:905308285525">Ara</a><a href="tel:4447509">444</a><a href="mailto:info@egebirlikyapi.com">e</a>
</body></html>`;
// WordPress'in kendi haritası: dizin → sayfa haritası → YALNIZ ana sayfa.
const WP_DIZIN = `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://egebirlikseasight.com/wp-sitemap-users-1.xml</loc></sitemap>
<sitemap><loc>https://egebirlikseasight.com/wp-sitemap-posts-page-1.xml</loc></sitemap></sitemapindex>`;
const WP_SAYFALAR = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://egebirlikseasight.com/</loc><lastmod>2026-08-06T13:22:38+00:00</lastmod></url></urlset>`;

describe('TEŞHİS: Ege Birlik Seasight — site bağlantıları neden boş', () => {
  it('KÖK SEBEP: menünün dört bağlantısı da aynı sayfanın bölümleri; alt sayfa adayı YOK', () => {
    expect(altSayfaAdaylari(SEASIGHT_HTML, SEASIGHT)).toEqual([]);
    // #content atlama bağlantısı menü sayılmıyor.
    expect(cipaBaglantiSayisi(SEASIGHT_HTML)).toBe(4);
  });

  it('site haritası: dizin bir kat açılır, sayfa haritası ÖNCE; sayfalar yalnız ana sayfa', () => {
    const d = siteHaritasiOku(WP_DIZIN, SEASIGHT);
    expect(d.sayfalar).toEqual([]);
    expect(d.altHaritalar[0]).toBe('https://egebirlikseasight.com/wp-sitemap-posts-page-1.xml');
    expect(siteHaritasiOku(WP_SAYFALAR, SEASIGHT).sayfalar).toEqual(['https://egebirlikseasight.com/']);
  });

  it('ekran "okunamadı" DEMİYOR: tek sayfa olduğunu ve haritadaki sayfa sayısını söylüyor', () => {
    const s = siteBaglantisiSebebi({ cipa: 4, aday: 0, haritaSayfasi: 0, acilan: 0 });
    expect(s).toContain('Site tek sayfa');
    expect(s).toContain('menüdeki 4 bağlantı');
    expect(s).toContain('site haritasında 0 ayrı sayfa');
    expect(s).not.toContain('okunamadı');
    expect(siteBaglantisiSebebi({ cipa: 0, aday: 0, haritaSayfasi: null, acilan: 0 })).toContain('site haritası bulunamadı');
  });

  it('harita SSRF kuralları: başka alan, http, port, sorgu ve dosya atılır; www aynı site', () => {
    const xml = `<urlset>
      <url><loc>https://www.egebirlikseasight.com/villa</loc></url>
      <url><loc>https://evil.com/x</loc></url>
      <url><loc>http://egebirlikseasight.com/http</loc></url>
      <url><loc>https://egebirlikseasight.com:8443/port</loc></url>
      <url><loc>https://egebirlikseasight.com/?p=1</loc></url>
      <url><loc>https://egebirlikseasight.com/brosur.pdf</loc></url>
      <url><loc>https://egebirlikseasight.com/a&amp;b</loc></url></urlset>`;
    expect(siteHaritasiOku(xml, SEASIGHT).sayfalar).toEqual(['https://www.egebirlikseasight.com/villa', 'https://egebirlikseasight.com/a&b']);
  });
});

// ---------------------------------------------------------------------------
// 2. ÖĞE SEÇİMİ — tek fonksiyon, ekran ve gövde aynı çıktıyı okuyor
// ---------------------------------------------------------------------------
const KAYNAK = (o: Partial<GoogleOgeKaynagi> = {}): GoogleOgeKaynagi => ({
  ulasma: 'site',
  workspaceTelefonu: '0232 555 12 34',
  markaAdi: 'Ege Birlik Yapı',
  logo: { varlikId: '11111111-0000-4000-8000-000000000001', genislik: 512, yukseklik: 512 },
  urunKategorileri: ['Daire', 'Villa', 'Ofis'],
  menuMetinleri: null,
  promosyon: null,
  fiyatListesi: null,
  ...o,
});
const durum = (k: GoogleOgeKaynagi, kod: string) => googleAramaOgeleri(k).durumlar.find((d) => d.kod === kod)!;

describe('aramaOgesiE164 — serbest numara', () => {
  it('Türkiye sabit ve cep numaraları E.164; 444 hattı ve yabancı numara TAHMİN EDİLMEZ', () => {
    expect(aramaOgesiE164('0232 555 12 34')).toBe('+902325551234');
    expect(aramaOgesiE164('+90 (530) 828 55 25')).toBe('+905308285525');
    expect(aramaOgesiE164('905308285525')).toBe('+905308285525');
    expect(aramaOgesiE164('5308285525')).toBe('+905308285525');
    expect(aramaOgesiE164('444 75 09')).toBeNull();
    expect(aramaOgesiE164('0850 123 45 67')).toBeNull();
    expect(aramaOgesiE164('+1 212 555 0100')).toBeNull();
    expect(aramaOgesiE164('')).toBeNull();
  });
});

describe('googleAramaOgeleri — kaynağı olan kurulur, olmayan SEBEBİYLE kurulmaz', () => {
  it('tam kaynak: arama, işletme adı, logo, snippet eklendi; promosyon ve fiyat verilmedi', () => {
    const r = googleAramaOgeleri(KAYNAK());
    expect(r.ogeler).toEqual({
      telefon: '+902325551234',
      isletmeAdi: 'Ege Birlik Yapı',
      logoVarlikId: '11111111-0000-4000-8000-000000000001',
      snippet: { baslik: 'Türler', degerler: ['Daire', 'Villa', 'Ofis'] },
      promosyon: null,
      fiyat: null,
    });
    expect(r.durumlar.map((d) => [d.kod, d.eklendi])).toEqual([
      ['ARAMA', true],
      ['ISLETME_ADI', true],
      ['LOGO', true],
      ['SNIPPET', true],
      ['PROMOSYON', false],
      ['FIYAT', false],
    ]);
  });

  it('ARAMA: telefon ulaşmasında ikinci arama öğesi YOK (numara reklamın kendisi)', () => {
    const r = googleAramaOgeleri(KAYNAK({ ulasma: 'telefon' }));
    expect(r.ogeler.telefon).toBeNull();
    expect(durum(KAYNAK({ ulasma: 'telefon' }), 'ARAMA')).toMatchObject({ eklendi: true, metin: 'Reklamın kendi numarası' });
  });

  it('ARAMA: telefon yok / okunamaz → eklenmez ve sebep ayrı', () => {
    expect(durum(KAYNAK({ workspaceTelefonu: null }), 'ARAMA').metin).toBe("Marka Merkezi'nde telefon yok");
    expect(durum(KAYNAK({ workspaceTelefonu: '444 75 09' }), 'ARAMA').metin).toContain('444 75 09');
  });

  it('İŞLETME ADI: 25 karakteri aşan ad KISALTILMAZ; marka adı yoksa workspace adına DÜŞÜLMEZ', () => {
    const uzun = KAYNAK({ markaAdi: 'EGE BİRLİK İNŞAAT ANONİM ŞİRKETİ' });
    expect(googleAramaOgeleri(uzun).ogeler.isletmeAdi).toBeNull();
    expect(durum(uzun, 'ISLETME_ADI').metin).toContain('kısaltma uydurmuyoruz');
    expect(googleAramaOgeleri(KAYNAK({ markaAdi: '  ' })).ogeler.isletmeAdi).toBeNull();
    expect(googleAramaOgeleri(KAYNAK({ markaAdi: 'A'.repeat(25) })).ogeler.isletmeAdi).toBe('A'.repeat(25));
  });

  it('LOGO: kare değil / küçük / ölçüsüz → eklenmez; ±%1 kare kabul', () => {
    expect(googleAramaOgeleri(KAYNAK({ logo: { varlikId: 'x', genislik: 1200, yukseklik: 300 } })).ogeler.logoVarlikId).toBeNull();
    expect(durum(KAYNAK({ logo: { varlikId: 'x', genislik: 1200, yukseklik: 300 } }), 'LOGO').metin).toContain('kare değil');
    expect(durum(KAYNAK({ logo: { varlikId: 'x', genislik: 100, yukseklik: 100 } }), 'LOGO').metin).toContain('en az 128');
    expect(durum(KAYNAK({ logo: { varlikId: 'x', genislik: null, yukseklik: null } }), 'LOGO').eklendi).toBe(false);
    expect(googleAramaOgeleri(KAYNAK({ logo: { varlikId: 'x', genislik: 128, yukseklik: 129 } })).ogeler.logoVarlikId).toBe('x');
  });

  it('SNIPPET: başlık RESMÎ Türkçe listeden; profil < 3 ise site menüsü (genel bağlantılar atılır); ikisi de yoksa sebep', () => {
    expect(Object.values(GOOGLE_SNIPPET_BASLIKLARI)).toContain('Türler');
    const menu = KAYNAK({ urunKategorileri: ['Villa'], menuMetinleri: ['Kurumsal', 'Konut Projeleri', 'Ticari Alanlar', 'Arsa Danışmanlığı', 'İletişim'] });
    expect(googleAramaOgeleri(menu).ogeler.snippet).toEqual({ baslik: 'Hizmetler', degerler: ['Konut Projeleri', 'Ticari Alanlar', 'Arsa Danışmanlığı'] });
    const yok = KAYNAK({ urunKategorileri: ['Villa', 'Villa '], menuMetinleri: ['Kurumsal', 'Haberler', 'İletişim'] });
    expect(googleAramaOgeleri(yok).ogeler.snippet).toBeNull();
    expect(durum(yok, 'SNIPPET').metin).toContain("Marka Merkezi'nde 1 ürün/hizmet kategorisi var, site menüsünde 0 hizmet");
    // 25'i aşan değer atlanır ve sayısı söylenir; en çok 10.
    // Rakamsız adlar: sayı taşıyan değer snippet'e girmiyor (Ö-C, aşağıda).
    const cok = KAYNAK({ urunKategorileri: [...'ABCDEFGHIJKL'].map((h) => `Tür ${h}`).concat('Bu kategori adı yirmi beş karakterden uzun') });
    expect(googleAramaOgeleri(cok).ogeler.snippet!.degerler).toHaveLength(10);
  });

  it('Ö-C SNIPPET: sayı, fiyat ve abartı taşıyan değer KAYNAKTAN gelse de atılır ve sayısı söylenir', () => {
    const k = KAYNAK({ urunKategorileri: ['Daire', 'Villa', 'Ofis', '3+1 Daire', 'Garantili villa', 'En ucuz arsa', 'Ücretsiz keşif'] });
    expect(googleAramaOgeleri(k).ogeler.snippet!.degerler).toEqual(['Daire', 'Villa', 'Ofis']);
    const az = KAYNAK({ urunKategorileri: ['Daire', '3+1 Daire', 'Garantili villa'] });
    expect(durum(az, 'SNIPPET').metin).toContain('2 kategori sayı, fiyat ya da abartı sözü taşıdığı için alınmadı');
  });

  it('Ö-C AÇIKLAMA METNİ: abartı sözü vaatlerde AYNEN geçmiyorsa atılır; geçiyorsa kalır', () => {
    expect(aciklamaMetniSec(['Garantili işçilik', 'Uzman ekip'], [])).toMatchObject({ metinler: ['Uzman ekip'] });
    expect(aciklamaMetniSec(['En iyi hizmet', '1 numara firma'], ['Uzman ekip']).metinler).toEqual(['Uzman ekip']);
    // Müşterinin kendi vaadi kaynak: "Garantili işçilik" vaatte geçiyor.
    expect(aciklamaMetniSec([], ['Garantili işçilik']).metinler).toEqual(['Garantili işçilik']);
  });

  it('N-1 PROMOSYON: takvimde olmayan tarih, başlangıç > bitiş ve geçmiş bitiş engel', () => {
    const p = (o: Record<string, unknown>) => KAYNAK({ promosyon: { hedef: 'Tüm daireler', indirim: { tur: 'yuzde', yuzde: 10 }, baslangic: null, bitis: '2026-12-31', ...o } });
    expect(durum(p({ bitis: '2026-02-30' }), 'PROMOSYON').metin).toContain('takvimde yok');
    expect(durum(p({ baslangic: '2026-13-01' }), 'PROMOSYON').metin).toContain('takvimde yok');
    expect(durum(p({ baslangic: '2027-01-01' }), 'PROMOSYON').metin).toContain('başlangıçtan önce');
    expect(promosyonSorunu({ hedef: 'X', indirim: { tur: 'yuzde', yuzde: 10 }, baslangic: null, bitis: '2026-10-01' }, '2026-10-12')).toContain('geçmiş');
    expect(promosyonSorunu({ hedef: 'X', indirim: { tur: 'yuzde', yuzde: 10 }, baslangic: null, bitis: '2026-10-12' }, '2026-10-12')).toBeNull();
    expect(durum(p({ bitis: '2028-02-29' }), 'PROMOSYON').eklendi).toBe(true);
  });

  it('PROMOSYON: uydurulmaz; geçerli girdi micros/yüzde ile, bitişsiz girdi eklenmez', () => {
    const p = KAYNAK({ promosyon: { hedef: 'Tüm daireler', indirim: { tur: 'yuzde', yuzde: 15 }, baslangic: null, bitis: '2026-12-31' } });
    expect(googleAramaOgeleri(p).ogeler.promosyon).toEqual({ hedef: 'Tüm daireler', yuzdeMicros: '150000', tutarMicros: null, baslangic: null, bitis: '2026-12-31' });
    const b = KAYNAK({ promosyon: { hedef: 'Tüm daireler', indirim: { tur: 'yuzde', yuzde: 15 }, baslangic: null, bitis: null } });
    expect(googleAramaOgeleri(b).ogeler.promosyon).toBeNull();
    expect(durum(b, 'PROMOSYON').metin).toContain('bitiş');
  });

  it('FİYAT: en az 3 dolu kalem, 25 karakter, fiyat > 0', () => {
    const k = (baslik: string, micros = '1000000000') => ({ baslik, aciklama: '1+1 daire', micros });
    expect(googleAramaOgeleri(KAYNAK({ fiyatListesi: { tur: 'SERVICES', kalemler: [k('A'), k('B')] } })).ogeler.fiyat).toBeNull();
    expect(googleAramaOgeleri(KAYNAK({ fiyatListesi: { tur: 'SERVICES', kalemler: [k('A'), k('B'), k('C', '0')] } })).ogeler.fiyat).toBeNull();
    expect(googleAramaOgeleri(KAYNAK({ fiyatListesi: { tur: 'SERVICES', kalemler: [k('A'), k('B'), k('C')] } })).ogeler.fiyat!.kalemler).toHaveLength(3);
  });

  it('Google reddi: isteğe bağlı BÜTÜN öğeler "eklenmedi" ve sebep söyleniyor', () => {
    const r = googleAramaOgeleri(KAYNAK({ googleReddi: 'politika' }));
    expect(r.ogeler).toEqual(BOS_ARAMA_OGELERI);
    expect(r.durumlar.filter((d) => d.kod !== 'PROMOSYON' && d.kod !== 'FIYAT').every((d) => !d.eklendi && d.metin.includes('politika'))).toBe(true);
  });
});

describe('açıklama metni kaynağı — rehber ÖNCE, sonra vaatler; ikisi de aynı kapıdan', () => {
  it('kullanıcının/yapay zekânın rehberde yazdığı metin vaatleri ezer; boşsa vaatler', () => {
    expect(aciklamaMetniSec(['Yerinde keşif', ''], ['Uzman ekip'])).toMatchObject({ metinler: ['Yerinde keşif'], kaynak: 'rehber' });
    expect(aciklamaMetniSec([], ['Uzman ekip'])).toMatchObject({ metinler: ['Uzman ekip'], kaynak: 'vaatler' });
    // Rehberdeki metin de kapıdan geçer: sayı ve fiyat sözü atılır.
    expect(aciklamaMetniSec(['%20 indirim', '3 yıl garanti'], ['Uzman ekip'])).toMatchObject({ metinler: ['Uzman ekip'], kaynak: 'vaatler' });
  });
});

// ---------------------------------------------------------------------------
// 3. Türetme → derleme → atomik istek → geri okuma
// ---------------------------------------------------------------------------
const Z = '2026-10-12T09:00:00.000+03:00';
const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: Z });
const rehber = (amac: 'SITE' | 'TELEFON', ek: Partial<RehberAlanlari> = {}): RehberAlanlari => ({
  amac: al(amac),
  platformlar: al({ meta: false, google: true }),
  konumlar: al([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }]),
  hedefAdres: al('https://ornek.com.tr/'),
  telefon: al('+902325551234'),
  metin: al({ anaMetin: 'Metin', basliklar: ['Bir', 'İki', 'Üç'], aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'] }),
  anahtarKelimeler: al([{ metin: 'izmir villa', aylikArama: 100 }]),
  butce: al({ tip: 'gunluk' as const, micros: '250000000' }),
  takvim: al({ baslangic: '2026-10-13', bitis: null }),
  ...ek,
});
const TB = (o: Partial<GoogleTuretmeBaglami> = {}): GoogleTuretmeBaglami => ({
  musteriId: '123-456-7890',
  paraBirimi: 'TRY',
  saatDilimi: 'Europe/Istanbul',
  donusumEtkin: true,
  son30GunDonusum: 0,
  uzantilar: { siteBaglantilari: [{ metin: 'Hizmetler', adres: 'https://ornek.com.tr/hizmetler' }, { metin: 'Projeler', adres: 'https://ornek.com.tr/projeler' }], siteSebebi: null, aciklamaMetinleri: ['Uzman ekip'] },
  ogeKaynagi: KAYNAK({
    promosyon: { hedef: 'Tüm daireler', indirim: { tur: 'yuzde', yuzde: 15 }, baslangic: null, bitis: '2026-12-31' },
    fiyatListesi: { tur: 'SERVICES', kalemler: ['1+1', '2+1', '3+1'].map((x, i) => ({ baslik: `${x} daire`, aciklama: 'Deniz manzaralı', micros: String((i + 1) * 1_000_000_000_000) })) },
  }),
  satisOlcumu: null,
  isletmeAdi: 'Ornek',
  logoVarlikId: null,
  kategoriTabani: [],
  ...o,
});
function turet(amac: 'SITE' | 'TELEFON', o: Partial<GoogleTuretmeBaglami> = {}, ek: Partial<RehberAlanlari> = {}): GoogleDerlemeGirdisi {
  const r = rehberdenGoogle(rehber(amac, ek), { meta: false, google: true }, TB(o));
  if (r.tur !== 'tamam') throw new Error(r.kodlar.join(','));
  return r.deger;
}
const DB: GoogleDerlemeBaglami = {
  kimlik: 'abcdef12-0000-4000-8000-000000000000',
  workspaceKisaAdi: 'Ornek',
  amacEkranAdi: 'Siteme gelsinler',
  simdi: new Date('2026-10-12T09:00:00+03:00'),
  validateOnly: true,
  logo: { yeniGorsel: { name: 'Ege logo', bytes: Buffer.from('PNG') } },
  youtubeVideoBasligi: null,
};
function derle(g: GoogleDerlemeGirdisi, b: Partial<GoogleDerlemeBaglami> = {}) {
  const d = derleGoogle(g, { ...DB, ...b });
  if (d.tur !== 'govde') throw new Error(JSON.stringify(d.retler));
  return d;
}
type Op = Record<string, { create?: Record<string, unknown> }>;
const tur = (o: Record<string, unknown>) => Object.keys(o)[0]!;

describe('KRİTİK: öğeler TEK atomik istekte (site ulaşması)', () => {
  const d = derle(turet('SITE'));
  const ops = d.govde.mutateOperations as Op[];
  const baglar = ops.filter((o) => tur(o) === 'campaignAssetOperation').map((o) => o.campaignAssetOperation!.create!);

  it('sürüm artırıldı; partialFailure false; bütün öğe türleri kampanyaya bağlı', () => {
    expect(GOOGLE_DERLEYICI_SURUMU).toBe('g-1.3.0');
    expect(d.govde.partialFailure).toBe(false);
    expect(baglar.map((b) => b.fieldType)).toEqual(['CALL', 'SITELINK', 'SITELINK', 'CALLOUT', 'BUSINESS_NAME', 'BUSINESS_LOGO', 'STRUCTURED_SNIPPET', 'PROMOTION', 'PRICE']);
    const kampanya = ops.find((o) => tur(o) === 'campaignOperation')!.campaignOperation!.create!.resourceName;
    for (const b of baglar) expect(b.campaign).toBe(kampanya);
  });

  it('her öğe bağından ÖNCE, geçici kimlikler TEKİL (site bağlantısıyla çakışmıyor)', () => {
    const kurulan = new Map<string, number>();
    ops.forEach((o, i) => {
      const r = o.assetOperation?.create?.resourceName;
      if (r) {
        expect(kurulan.has(String(r)), String(r)).toBe(false);
        kurulan.set(String(r), i);
      }
    });
    ops.forEach((o, i) => {
      const b = o.campaignAssetOperation?.create;
      if (b) expect(kurulan.get(String(b.asset))!).toBeLessThan(i);
    });
  });

  it('öğe içerikleri: workspace telefonu TR ulusal biçimde; snippet resmî başlık; promosyon %15 = 150000; fiyat micros dizge', () => {
    const c = (k: string) => ops.find((o) => o.assetOperation?.create?.[k])!.assetOperation!.create![k];
    expect(c('callAsset')).toMatchObject({ countryCode: 'TR', phoneNumber: '2325551234' });
    expect(c('textAsset')).toEqual({ text: 'Ege Birlik Yapı' });
    expect(c('structuredSnippetAsset')).toEqual({ header: 'Türler', values: ['Daire', 'Villa', 'Ofis'] });
    expect(c('promotionAsset')).toEqual({ promotionTarget: 'Tüm daireler', languageCode: 'tr', percentOff: '150000', endDate: '2026-12-31' });
    expect(c('priceAsset')).toMatchObject({ type: 'SERVICES', languageCode: 'tr' });
    expect((c('priceAsset') as { priceOfferings: unknown[] }).priceOfferings[0]).toEqual({
      header: '1+1 daire',
      description: 'Deniz manzaralı',
      price: { currencyCode: 'TRY', amountMicros: '1000000000000' },
      finalUrl: 'https://ornek.com.tr/',
    });
    expect(c('imageAsset')).toBeDefined();
  });

  it('ogeIslemleri: arama öğesi + yeni öğelerin TAMAMI, çekirdek işlem YOK; yeni logo sırası yazılıyor', () => {
    const s = new Set(d.sira.ogeIslemleri);
    const tip = (i: number) => {
      const o = ops[i]!;
      return tur(o) === 'campaignAssetOperation' ? o.campaignAssetOperation!.create!.fieldType : tur(o);
    };
    expect(d.sira.ogeIslemleri!.map(tip).filter((x) => x !== 'assetOperation')).toEqual(['CALL', 'BUSINESS_NAME', 'BUSINESS_LOGO', 'STRUCTURED_SNIPPET', 'PROMOTION', 'PRICE']);
    for (const k of [d.sira.kampanya, d.sira.reklamGrubu, d.sira.reklam!]) expect(s.has(k)).toBe(false);
    expect(d.sira.logo).not.toBeNull();
    expect(ops[d.sira.logo!]!.assetOperation!.create!.imageAsset).toBeDefined();
  });

  it('beklenen yankı: öğeler içerikle; site ulaşmasında arama öğesi de bekleniyor', () => {
    expect(d.beklenen.aramaOgesi).toEqual({ countryCode: 'TR', phoneNumber: '2325551234' });
    expect(d.beklenen.ogeler).toEqual({
      isletmeAdi: 'Ege Birlik Yapı',
      logo: 1,
      snippet: { baslik: 'Türler', degerler: ['Daire', 'Villa', 'Ofis'] },
      promosyon: { hedef: 'Tüm daireler', yuzdeMicros: '150000', tutarMicros: null, baslangic: null, bitis: '2026-12-31' },
      fiyat: { tur: 'SERVICES', kalemler: ['1+1', '2+1', '3+1'].map((x, i) => ({ baslik: `${x} daire`, aciklama: 'Deniz manzaralı', micros: String((i + 1) * 1_000_000_000_000) })) },
    });
  });
});

describe('derleyici: yayın anına bağlı kontroller', () => {
  it('telefon ulaşması: tek CALL (reklamın numarası), ogeIslemleri onu İÇERMEZ (reddi kampanyanın reddi)', () => {
    const d = derle(turet('TELEFON'));
    const ops = d.govde.mutateOperations as Op[];
    expect(ops.filter((o) => o.campaignAssetOperation?.create?.fieldType === 'CALL')).toHaveLength(1);
    expect(d.sira.ogeIslemleri!.includes(d.sira.aramaOgesi!)).toBe(false);
  });

  it('bitmiş promosyon eklenmez ve notta söylenir (kampanya durmaz)', () => {
    const d = derle(turet('SITE', {}, { takvim: al({ baslangic: '2027-02-01', bitis: null }) }), { simdi: new Date('2027-01-05T09:00:00+03:00') });
    expect((d.govde.mutateOperations as Op[]).some((o) => o.campaignAssetOperation?.create?.fieldType === 'PROMOTION')).toBe(false);
    expect(d.notlar.join(' ')).toContain('Promosyonun bitiş tarihi (2026-12-31) geçti');
    expect(d.beklenen.ogeler!.promosyon).toBeNull();
  });

  it('logo okunamadıysa (baglam.logo null) BUSINESS_LOGO yok, beklenen 0 ve not', () => {
    const d = derle(turet('SITE'), { logo: null });
    expect((d.govde.mutateOperations as Op[]).some((o) => o.campaignAssetOperation?.create?.fieldType === 'BUSINESS_LOGO')).toBe(false);
    expect(d.beklenen.ogeler!.logo).toBe(0);
    expect(d.notlar).toContain('İşletme logosu okunamadı; logo eklenmedi.');
  });

  it('hesapta kayıtlı logo: yeniden yüklenmez, bağ kayıtlı kaynağa', () => {
    const d = derle(turet('SITE'), { logo: { resource: 'customers/1234567890/assets/777' } });
    const ops = d.govde.mutateOperations as Op[];
    expect(ops.some((o) => o.assetOperation?.create?.imageAsset)).toBe(false);
    expect(ops.find((o) => o.campaignAssetOperation?.create?.fieldType === 'BUSINESS_LOGO')!.campaignAssetOperation!.create!.asset).toBe('customers/1234567890/assets/777');
    expect(d.sira.logo).toBeNull();
  });

  it('eklenmeyen öğeler (kaynağı olmayan) notta SEBEBİYLE; Google reddiyle kurulan girdide tekrarlanmıyor', () => {
    const d = derle(turet('SITE', { ogeKaynagi: KAYNAK({ markaAdi: null, workspaceTelefonu: null }) }));
    expect(d.notlar.join(' ')).toContain("İşletme adı (Marka Merkezi'nde marka adı yok)");
    const r = derle(turet('SITE', { ogeKaynagi: KAYNAK({ googleReddi: 'x' }) }));
    expect(r.notlar.join(' ')).not.toContain('Eklenmeyen öğeler');
    expect(r.sira.ogeIslemleri).toEqual([]);
  });

  it('ogeKaynagi verilmeyen (eski) girdi: öğe alanı yok, beklenen öğe yok', () => {
    const d = derle(turet('SITE', { ogeKaynagi: null }));
    expect(d.beklenen.ogeler).toBeUndefined();
    expect(d.sira.ogeIslemleri).toBeUndefined();
  });
});

describe('aramaOgeIslemleriEkle — doğrudan', () => {
  it('logo seçilip görseli yoksa PATLAR (sessiz logosuz gövde yok)', () => {
    expect(() =>
      aramaOgeIslemleriEkle([], { customerId: '1', kampanya: 'customers/1/campaigns/-2', ogeler: { ...BOS_ARAMA_OGELERI, logoVarlikId: 'x' }, logo: null, paraBirimi: 'TRY', finalUrl: 'https://o.com/' }),
    ).toThrow(/logo/);
  });
  it('öğe yoksa hiçbir işlem eklenmez', () => {
    const ops: Array<Record<string, unknown>> = [{ x: 1 }];
    expect(aramaOgeIslemleriEkle(ops, { customerId: '1', kampanya: 'k', ogeler: BOS_ARAMA_OGELERI, logo: null, paraBirimi: 'TRY', finalUrl: 'https://o.com/' }).islemler).toEqual([]);
    expect(ops).toHaveLength(1);
  });
});

describe('karar tablosu ve eksik listesi — öğe satırları', () => {
  it('Arama kurgusunda her öğe ayrı OGE satırı: "Eklendi"/"Eklenmedi" + sebep', () => {
    const satirlar = kararTablosu('SITE', { meta: false, google: true }, 'MAKS_TIKLAMA', false, null, { ogeler: googleAramaOgeleri(KAYNAK({ markaAdi: null })).durumlar });
    const oge = satirlar.filter((x) => x.kod === 'OGE');
    expect(oge.map((x) => x.konu)).toEqual(['Aramalar', 'İşletme adı', 'İşletme logosu', 'Ek açıklamalı snippet', 'Promosyon', 'Fiyatlar']);
    expect(oge[1]!.google).toEqual({ deger: 'Eklenmedi', not: "Marka Merkezi'nde marka adı yok" });
    expect(JSON.stringify(oge)).not.toMatch(/[—–]/);
  });

  it('yazılmış ama hatalı promosyon/fiyat ENGEL; doğru olan engel değil', () => {
    const b: RehberEksikBaglami = { ajansYoneticisi: true, onKosullar: null, yasalUyari: null, asgariGunluk: { meta: null, googleTalepYaratma: null }, paraBirimi: 'TRY', paraBirimleriAyni: true };
    const kodlar = (ek: Partial<RehberAlanlari>) => rehberEksikleri(rehber('SITE', ek), b).filter((e) => e.seviye === 'engel').map((e) => e.kod);
    expect(kodlar({ googlePromosyon: al({ hedef: 'Daireler', indirim: { tur: 'yuzde' as const, yuzde: 10 }, baslangic: null, bitis: null }) })).toContain('G-PROMOSYON');
    expect(kodlar({ googlePromosyon: al({ hedef: 'Daireler', indirim: { tur: 'yuzde' as const, yuzde: 10 }, baslangic: null, bitis: '2026-12-31' }) })).not.toContain('G-PROMOSYON');
    expect(kodlar({ googleFiyatListesi: al({ tur: 'SERVICES' as const, kalemler: [{ baslik: 'A', aciklama: 'a', micros: '1' }] }) })).toContain('G-FIYAT');
  });
});

describe('geri okuma — öğeler', () => {
  const d = derle(turet('SITE'));
  const okunan = (o: Partial<GoogleOkunan> = {}): GoogleOkunan => ({
    kampanyaAdi: d.beklenen.kampanyaAdi,
    durum: 'PAUSED',
    kanal: 'SEARCH',
    gunlukButceMicros: d.beklenen.gunlukButceMicros,
    aglar: d.beklenen.aglar,
    konumTuru: 'PRESENCE',
    konumSayisi: d.beklenen.konumSayisi,
    anahtarKelimeSayisi: d.beklenen.anahtarKelimeSayisi!,
    negatifSayisi: d.beklenen.negatifSayisi!,
    aramaOgeleri: [{ countryCode: 'TR', phoneNumber: '+90 232 555 12 34' }],
    teklif: 'TARGET_SPEND',
    uzantilar: d.beklenen.uzantilar,
    ogeler: d.beklenen.ogeler,
    ...o,
  });

  it('aynı öğeler → temiz; logo eksik → fark (oge.logo) ve yalnız o satır', () => {
    expect(googleGeriOkumaKarsilastir(d.beklenen, okunan()).sonuc).toBe('temiz');
    const f = googleGeriOkumaKarsilastir(d.beklenen, okunan({ ogeler: { ...d.beklenen.ogeler!, logo: 0 } }));
    expect(f.satirlar.map((x) => x.alan)).toEqual(['oge.logo']);
    expect(googleGeriOkumaKarsilastir(d.beklenen, okunan({ ogeler: null })).sonuc).toBe('fark');
  });

  it('GAQL: Google’ın kendi ürettiği öğe sayılmıyor, int64 dizge, WHERE alanı SELECT’te', async () => {
    const sorgular: string[] = [];
    const port: GoogleYayinPortu = {
      ara: async <T>(_c: FetchContext, q: string) => {
        sorgular.push(q);
        if (!q.includes("'BUSINESS_NAME'")) return [] as T[];
        return [
          { campaignAsset: { fieldType: 'BUSINESS_NAME', status: 'ENABLED', source: 'ADVERTISER' }, asset: { textAsset: { text: 'Ege Birlik Yapı' } } },
          { campaignAsset: { fieldType: 'BUSINESS_NAME', status: 'ENABLED', source: 'AUTOMATICALLY_CREATED' }, asset: { textAsset: { text: 'egebirlik' } } },
          { campaignAsset: { fieldType: 'BUSINESS_LOGO', status: 'ENABLED' }, asset: {} },
          { campaignAsset: { fieldType: 'PROMOTION', status: 'ENABLED' }, asset: { promotionAsset: { promotionTarget: 'Tüm daireler', percentOff: 150000, endDate: '2026-12-31' } } },
        ] as T[];
      },
    } as unknown as GoogleYayinPortu;
    const o = await googleGeriOku(port, {} as FetchContext, '24351543772', d.beklenen);
    expect(o.ogeler).toEqual({
      isletmeAdi: 'Ege Birlik Yapı',
      logo: 1,
      snippet: null,
      promosyon: { hedef: 'Tüm daireler', yuzdeMicros: '150000', tutarMicros: null, baslangic: null, bitis: '2026-12-31' },
      fiyat: null,
    });
    const q = sorgular.find((x) => x.includes("'BUSINESS_NAME'"))!;
    expect(q).toMatch(/SELECT campaign\.id,/);
    expect(q).toContain('campaign_asset.source');
  });
});

// ---------------------------------------------------------------------------
// Ajan 4 kapısı düzeltmeleri — canlı risk, CDATA, gövdeyle uzlaştırma
// ---------------------------------------------------------------------------
describe('CANLI RİSK: öğe geri okuma sorgusu', () => {
  const d = derle(turet('SITE'));
  const bos = { isletmeAdi: 'X', logo: 0, snippet: null, promosyon: null, fiyat: null };

  it('promosyon/fiyat alanları YALNIZ o öğe gönderildiyse SELECT’te; tür WHERE’de hep var', () => {
    const q = ogeSorgusu('1', bos);
    expect(q).not.toContain('asset.promotion_asset.');
    expect(q).not.toContain('asset.price_asset.');
    expect(q).toContain("'PROMOTION', 'PRICE'");
    const tam = ogeSorgusu('1', d.beklenen.ogeler!);
    expect(tam).toContain('asset.promotion_asset.percent_off');
    expect(tam).toContain('asset.price_asset.price_offerings');
  });

  it('öğe sorgusu "alan seçilemez" ile düşerse ana geri okuma TAMAMLANIR, öğe kısmı "okunamadı: sebep" ve kıyaslanmaz', async () => {
    const port: GoogleYayinPortu = {
      ara: async <T>(_c: FetchContext, q: string) => {
        if (q.includes("'BUSINESS_NAME'")) throw new Error('PROHIBITED_FIELD_IN_SELECT_CLAUSE: asset.price_asset.price_offerings');
        if (q.includes('FROM campaign WHERE')) return [{ campaign: { name: d.beklenen.kampanyaAdi, status: 'PAUSED', advertisingChannelType: 'SEARCH' } }] as T[];
        return [] as T[];
      },
    } as unknown as GoogleYayinPortu;
    const o = await googleGeriOku(port, {} as FetchContext, '24351543772', d.beklenen);
    expect(o.kampanyaAdi).toBe(d.beklenen.kampanyaAdi);
    expect(o.ogeler).toBeUndefined();
    expect(o.ogeOkumaHatasi).toContain('okunamadı: PROHIBITED_FIELD_IN_SELECT_CLAUSE');
    const k = googleGeriOkumaKarsilastir(d.beklenen, o);
    expect(k.satirlar.some((x) => x.alan.startsWith('oge.'))).toBe(false);
  });

  it('beklenmeyen ama bağlı promosyon (içerik seçilmeden) yine FARK', async () => {
    const b = { ...d.beklenen, ogeler: { ...d.beklenen.ogeler!, promosyon: null, fiyat: null } };
    const port: GoogleYayinPortu = {
      ara: async <T>(_c: FetchContext, q: string) =>
        (q.includes("'BUSINESS_NAME'")
          ? [
              { campaignAsset: { fieldType: 'BUSINESS_NAME', status: 'ENABLED' }, asset: { textAsset: { text: 'Ege Birlik Yapı' } } },
              { campaignAsset: { fieldType: 'PROMOTION', status: 'ENABLED' }, asset: {} },
            ]
          : []) as T[],
    } as unknown as GoogleYayinPortu;
    const o = await googleGeriOku(port, {} as FetchContext, '1', b);
    expect(googleGeriOkumaKarsilastir(b, o).satirlar.map((x) => x.alan)).toContain('oge.promosyon');
  });
});

describe('N: site haritasında CDATA', () => {
  it('<loc><![CDATA[…]]></loc> okunur ve SSRF kuralları yine uygulanır', () => {
    const xml = '<urlset><url><loc><![CDATA[https://ornek.com.tr/villa]]></loc></url><url><loc><![CDATA[https://evil.com/x]]></loc></url></urlset>';
    expect(siteHaritasiOku(xml, 'https://ornek.com.tr/').sayfalar).toEqual(['https://ornek.com.tr/villa']);
  });
});

describe('Ö-A: "Eklendi" yalnız gövdede varsa', () => {
  it('girdinin öğelerinde olmayan öğe "Eklenmedi"ye çevrilir; telefon ulaşmasında ARAMA çekirdek', () => {
    const r = googleAramaOgeleri(KAYNAK());
    const ogeler = { ...r.ogeler, logoVarlikId: null, isletmeAdi: null };
    const u = ogeDurumlariGovdeyle(r.durumlar, ogeler, 'site');
    expect(u.find((x) => x.kod === 'LOGO')).toMatchObject({ eklendi: false });
    expect(u.find((x) => x.kod === 'ISLETME_ADI')).toMatchObject({ eklendi: false });
    expect(u.find((x) => x.kod === 'SNIPPET')).toMatchObject({ eklendi: true });
    const t = googleAramaOgeleri(KAYNAK({ ulasma: 'telefon' }));
    expect(ogeDurumlariGovdeyle(t.durumlar, t.ogeler, 'telefon').find((x) => x.kod === 'ARAMA')).toMatchObject({ eklendi: true });
  });

  it('Ö-B: logo dosyası okunamadıysa yalnız logo düşer ve sebep söylenir', () => {
    const r = googleAramaOgeleri(KAYNAK({ logoSorunu: 'ENOENT' }));
    expect(r.ogeler.logoVarlikId).toBeNull();
    expect(r.ogeler.isletmeAdi).toBe('Ege Birlik Yapı');
    expect(durum(KAYNAK({ logoSorunu: 'ENOENT' }), 'LOGO').metin).toContain('Logo dosyası okunamadı (ENOENT)');
  });
});
