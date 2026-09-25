import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  GOOGLE_METIN_SINIRI,
  aciklamaSatiri,
  hedefUrl,
  kelimedeKes,
  markaAdiSec,
  temizle,
  videoMetinleri,
} from './youtube-otomatik';
import { eksikler } from './youtube-otomatik.service';

/**
 * ═══ YOUTUBE REKLAM METİNLERİ VİDEODAN ═══
 *
 * Bir karakterlik taşma Google'ın reddi, kelimenin ortasından kesme reklamda
 * yarım bir kelime. İkisi de kaynak taramasıyla görünmüyor; kurallar
 * çalıştırılarak sınanıyor.
 */

describe('temizle', () => {
  it('hashtag, bağlantı, emoji ve ayraçlar atılıyor — Türkçe harf kalıyor', () => {
    expect(temizle('Bodrum’da Yeni Villa 🏡 | #shorts #emlak https://x.co/a')).toBe(
      'Bodrum’da Yeni Villa',
    );
    expect(temizle('Şişli’de Çağdaş Ofis!!!')).toBe('Şişli’de Çağdaş Ofis!');
  });

  it('baştaki ve sondaki bağlaç işaretleri atılıyor', () => {
    expect(temizle(' - Yeni Proje: ')).toBe('Yeni Proje');
  });
});

describe('kelimedeKes', () => {
  it('sığan metin aynen dönüyor', () => {
    expect(kelimedeKes('Mia Yapı', 30)).toBe('Mia Yapı');
  });

  it('KRİTİK: kelimenin ORTASINDAN kesmiyor ve sınırı aşmıyor', () => {
    const t = 'Bodrum Yalıkavak’ta deniz manzaralı villa projemiz satışta';
    const k = kelimedeKes(t, 30);
    expect(k.length).toBeLessThanOrEqual(30);
    expect(t.startsWith(k)).toBe(true);
    // Kesilen yerden sonraki karakter boşluk olmalı: kelime bütün kaldı.
    expect(t[k.length]).toBe(' ');
  });

  it('sonda virgül/tire bırakmıyor, üç nokta koymuyor', () => {
    const k = kelimedeKes('Yeni projemiz, Bodrum’da açıldı ve satışta', 15);
    expect(k).toBe('Yeni projemiz');
    expect(k).not.toContain('…');
  });

  it('tek kelime sınırdan uzunsa BOŞ — anlamsız parça üretilmiyor', () => {
    expect(kelimedeKes('Süpercalifragilistikekspialidosyus', 10)).toBe('');
  });
});

describe('markaAdiSec', () => {
  it('önce workspace adı', () => {
    expect(markaAdiSec('Mia Yapı', 'Mia Yapı Official')).toEqual({
      deger: 'Mia Yapı',
      kaynak: 'workspace',
    });
  });

  it('workspace adı 25’e sığmazsa kanal adı', () => {
    expect(markaAdiSec('Mia Yapı İnşaat Taahhüt Ticaret A.Ş.', 'Mia Yapı')).toEqual({
      deger: 'Mia Yapı',
      kaynak: 'kanal',
    });
  });

  it('ikisi de sığmazsa kısaltılıyor ve KAYNAK bunu söylüyor', () => {
    const r = markaAdiSec('Mia Yapı İnşaat Taahhüt Ticaret A.Ş.', null);
    expect(r.kaynak).toBe('kisaltildi');
    expect(r.deger!.length).toBeLessThanOrEqual(GOOGLE_METIN_SINIRI.marka);
  });
});

describe('aciklamaSatiri', () => {
  it('bağlantı, hashtag ve zaman damgası satırlarını atlıyor', () => {
    const a = 'https://miayapi.com\n#emlak #bodrum\n00:00 Giriş\nDeniz manzaralı 12 villa.\nDetay';
    expect(aciklamaSatiri(a)).toBe('Deniz manzaralı 12 villa.');
  });

  it('boş açıklama boş satır', () => {
    expect(aciklamaSatiri(null)).toBe('');
    expect(aciklamaSatiri('#a #b\nhttps://x.co')).toBe('');
  });
});

describe('videoMetinleri', () => {
  it('KRİTİK: her alan GOOGLE SINIRINDA ve videodan geliyor', () => {
    const baslik =
      'Bodrum Yalıkavak’ta deniz manzaralı 12 villalık yeni projemiz satışta — erken rezervasyon fırsatı kaçmaz #shorts';
    const m = videoMetinleri(baslik, 'Detaylar için sitemizi ziyaret edin.\nhttps://x', 'Mia Yapı');
    expect(m.headlines[0]!.length).toBeLessThanOrEqual(GOOGLE_METIN_SINIRI.baslik);
    expect(m.longHeadlines[0]!.length).toBeLessThanOrEqual(GOOGLE_METIN_SINIRI.uzunBaslik);
    expect(m.descriptions[0]!.length).toBeLessThanOrEqual(GOOGLE_METIN_SINIRI.aciklama);
    expect(m.headlines[0]).toMatch(/^Bodrum Yalıkavak’ta/);
    expect(m.longHeadlines[0]).not.toContain('#shorts');
    expect(m.descriptions[0]).toBe('Detaylar için sitemizi ziyaret edin.');
  });

  it('KRİTİK: iki farklı video İKİ FARKLI metin — sabit metin yok', () => {
    const a = videoMetinleri('Yalıkavak villaları', null, 'Mia');
    const b = videoMetinleri('Göltürkbükü daireleri', null, 'Mia');
    expect(a.headlines).not.toEqual(b.headlines);
  });

  it('başlık tamamen emoji/hashtag ise marka adına düşüyor — boş alan gitmiyor', () => {
    const m = videoMetinleri('🔥🔥 #shorts', null, 'Mia Yapı');
    expect(m.headlines).toEqual(['Mia Yapı']);
    expect(m.longHeadlines).toEqual(['Mia Yapı']);
  });

  it('açıklama yoksa tarafsız yedek — uydurma vaat değil', () => {
    expect(videoMetinleri('Yeni proje', '', 'Mia Yapı').descriptions).toEqual([
      'Mia Yapı kanalında yeni video',
    ]);
  });
});

describe('hedefUrl', () => {
  it('şemasız siteye https ekliyor, http’yi https’e çeviriyor', () => {
    expect(hedefUrl('miayapi.com')).toBe('https://miayapi.com/');
    expect(hedefUrl('http://miayapi.com/tr')).toBe('https://miayapi.com/tr');
    expect(hedefUrl(' https://miayapi.com ')).toBe('https://miayapi.com/');
  });

  it('boş ya da ayrıştırılamayan değer null — tahmin yok', () => {
    expect(hedefUrl(null)).toBeNull();
    expect(hedefUrl('   ')).toBeNull();
    expect(hedefUrl('mia yapi')).toBeNull();
    expect(hedefUrl('localhost')).toBeNull();
  });
});

describe('eksikler — her biri NEREDE düzeltileceğini söylüyor', () => {
  it('hepsi tamamsa boş', () => {
    expect(eksikler('Mia', 'kanal', 'https://x.co/', { id: 'k' })).toEqual([]);
  });

  it('logo ve site eksikliği yeriyle yazılıyor', () => {
    const e = eksikler('Mia', 'yok', null, { id: 'k' });
    expect(e.join(' ')).toContain('Logo sekmesi');
    expect(e.join(' ')).toContain('web sitesini ekle');
  });

  it('kanal yoksa söyleniyor', () => {
    expect(eksikler('Mia', 'kanal', 'https://x.co/', null)[0]).toContain('YouTube kanalı yok');
  });
});

describe('KRİTİK: yayın yolu ön ayarın SABİT metnini değil videoyu kullanıyor', () => {
  const kaynak = readFileSync(resolve(__dirname, 'autoboost-launch.service.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  const i = kaynak.indexOf('private async launchGoogle(');
  const dilim = kaynak.slice(i, kaynak.indexOf('\n  }\n', i));

  it('tarama boşa düşmüyor', () => {
    expect(i).toBeGreaterThan(-1);
    expect(dilim).toContain('createVideoBoost(');
  });

  it('metinler videodan, marka/logo/adres çözümleyiciden', () => {
    expect(dilim).toContain('headlines: metin.headlines');
    expect(dilim).toContain('descriptions: metin.descriptions');
    expect(dilim).toContain('businessName: degerler.businessName');
    expect(dilim).toContain('finalUrl: degerler.finalUrl');
    expect(dilim).toContain('assetId: degerler.logoAssetId');
    expect(dilim).not.toContain('g.headlines');
  });

  it('KRİTİK: eksikler KİLİTTEN ÖNCE — kart failed olmuyor', () => {
    expect(dilim.indexOf('this.youtubeOtomatik.yayinDegerleri(')).toBeGreaterThan(-1);
    expect(dilim.indexOf('this.youtubeOtomatik.yayinDegerleri(')).toBeLessThan(
      dilim.indexOf("SET status = 'launching'"),
    );
  });

  it('KRİTİK: konum HER ZAMAN gidiyor — ön ayarda yoksa Türkiye', () => {
    // Konumsuz Demand Gen kampanyası bütün ülkelere açılıyor.
    expect(dilim).toContain(
      'konumlar: g.locations.length > 0 ? g.locations.map((l) => l.key) : [VARSAYILAN_KONUM]',
    );
  });

  it('KRİTİK: ön ayardaki yaşlar yayına gidiyor', () => {
    // Şemada alan vardı ve hiçbir zaman okunmuyordu; bu satır düşerse panel
    // yaş seçtirir, Google'a hiçbir şey gitmez.
    expect(dilim).toContain('yaslar: g.ageRanges,');
  });

  it('açıklama yayın anında TAZE okunuyor', () => {
    expect(dilim).toContain('this.youtube.getVideo(kayit.external_id)');
  });
});
