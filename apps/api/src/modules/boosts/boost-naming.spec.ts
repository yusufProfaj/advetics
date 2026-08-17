import { describe, expect, it } from 'vitest';
import {
  boostAssetName,
  boostNameBase,
  boostNameWithLabel,
  firstWords,
} from '@advetics/shared';

/**
 * BOOST VARLIKLARININ ADI — K22.
 *
 * NEDEN TEST EDİLİYOR: ad beş ayrı yerde üretiliyordu ve her biri kendi
 * biçimini uyduruyordu (`Boost — elle — 89207`). Aynı boost panelde bir, Ads
 * Manager'da başka türlü görünüyordu; ikisini eşleştirmek gönderi kimliğinin
 * son sekiz hanesini karşılaştırmayı gerektiriyordu.
 *
 * Buradaki her kenar durum GERÇEK bir gönderiden çıktı: emoji, altyazısız
 * fotoğraf, uzun müşteri adı.
 */

const TARIH = new Date(2026, 7, 17, 14, 30); // 17 Ağustos 2026, yerel saat

const ORNEK = {
  clientName: 'Ege Birlik Yapı',
  postMessage:
    'Bu yaz hayalinizdeki yazlığa kavuşmanın tam zamanı! 🌞🌊 İster Garden Villas ile…',
  date: TARIH,
};

describe('boostAssetName — biçim', () => {
  it('KRİTİK: istenen biçimi birebir üretiyor', () => {
    expect(boostAssetName({ ...ORNEK, kind: 'campaign' })).toBe(
      'Ege Birlik Yapı - Bu yaz hayalinizdeki - 2026-08-17 - Boost - Kampanya',
    );
  });

  it('üç seviye AYNI TABANI paylaşıyor, yalnızca ek değişiyor', () => {
    // Panelde ve Ads Manager'da aynı boost'un üç satırı yan yana dizilsin.
    const k = boostAssetName({ ...ORNEK, kind: 'campaign' });
    const s = boostAssetName({ ...ORNEK, kind: 'adSet' });
    const r = boostAssetName({ ...ORNEK, kind: 'ad' });
    expect(s).toBe(k.replace(/Kampanya$/, 'Reklam Seti'));
    expect(r).toBe(k.replace(/Kampanya$/, 'Reklam'));
  });

  it('kreatif de ADLANDIRILIYOR', () => {
    // Adsız bırakılırsa Meta kendi üretiyor ve aynı gönderiden çıkan
    // kreatifler birbirinden ayırt edilemiyor.
    expect(boostAssetName({ ...ORNEK, kind: 'creative' })).toMatch(/- Boost - Kreatif$/);
  });

  it('KRİTİK: tarih YYYY-MM-DD — isme göre sıralama kronolojik olsun', () => {
    /*
     * `17.08.2026` alfabetik sıralamada yanlış diziliyor: bütün 17'ler bir
     * araya gelir, aylar karışır. Ads Manager'da isme göre sıralama sık
     * kullanılıyor.
     */
    const ad = boostAssetName({ ...ORNEK, kind: 'campaign' });
    expect(ad).toContain('2026-08-17');
    expect(ad).not.toContain('17.08.2026');
  });

  it('KRİTİK: tarih YEREL — UTC’ye çevrilmiyor', () => {
    /*
     * `toISOString()` kullanılsaydı Türkiye'de akşam 21:00'den sonra
     * oluşturulan boost ERTESİ GÜNÜN tarihini taşırdı. Depo genelinde tarih
     * kayması tam olarak böyle üretiliyor.
     */
    const gece = new Date(2026, 7, 17, 23, 30);
    expect(boostAssetName({ ...ORNEK, date: gece, kind: 'campaign' })).toContain(
      '2026-08-17',
    );
  });

  it('tek haneli ay ve gün SIFIRLA dolduruluyor', () => {
    // Doldurulmazsa `2026-8-5` çıkar ve sıralama yine bozulur.
    expect(
      boostAssetName({ ...ORNEK, date: new Date(2026, 0, 5), kind: 'campaign' }),
    ).toContain('2026-01-05');
  });
});

describe('firstWords — gönderi metninden ilk üç kelime', () => {
  it('KRİTİK: EMOJİ kelime sayılmıyor', () => {
    /*
     * Gerçek gönderi: "…tam zamanı! 🌞🌊 İster…". Ham ilk üç kelimeyi almak
     * "🌞🌊" gibi bir parça üretebiliyordu — Ads Manager'da hiçbir şey
     * söylemeyen bir ad.
     */
    expect(firstWords('🌞🌊 Yazlık fırsatı başladı')).toEqual([
      'Yazlık',
      'fırsatı',
      'başladı',
    ]);
  });

  it('KRİTİK: BAĞLANTI atılıyor', () => {
    // Uzun ve hiçbir şey anlatmıyor.
    expect(firstWords('https://egebirlik.com/kampanya Yeni proje başlıyor')).toEqual([
      'Yeni',
      'proje',
      'başlıyor',
    ]);
  });

  it('SATIR SONU boşluk sayılıyor', () => {
    // Gönderiler sık sık ilk satırda tek kelimelik başlıkla başlıyor.
    expect(firstWords('YAZLIĞINIZ\nOLSUN!\nEge Birlik')).toEqual([
      'YAZLIĞINIZ',
      'OLSUN!',
      'Ege',
    ]);
  });

  it('hashtag KORUNUYOR — harf içeriyor ve anlam taşıyor', () => {
    expect(firstWords('#Egebirlik yeni proje')).toEqual(['#Egebirlik', 'yeni', 'proje']);
  });

  it('metin yoksa ve boşsa BOŞ DİZİ', () => {
    expect(firstWords(null)).toEqual([]);
    expect(firstWords('')).toEqual([]);
    expect(firstWords('   ')).toEqual([]);
    // Yalnızca emoji: kelime yok.
    expect(firstWords('🌞🌊✨')).toEqual([]);
  });

  it('üçten az kelime varsa olanı veriyor', () => {
    expect(firstWords('Yeni proje')).toEqual(['Yeni', 'proje']);
  });
});

describe('boostAssetName — kenar durumlar', () => {
  it('KRİTİK: ALTYAZISIZ gönderide boş parça üretilmiyor', () => {
    /*
     * Altyazısız fotoğraf Meta'da sıradan. Biçim `Müşteri -  - 2026-08-17`
     * olurdu; hiç bilgi vermeyen bir ad ile BOZUK GÖRÜNEN bir ad arasında
     * ikincisi daha kötü.
     */
    const ad = boostAssetName({
      clientName: 'Ege Birlik Yapı',
      postMessage: null,
      mediaLabel: 'Fotoğraf',
      date: TARIH,
      kind: 'campaign',
    });
    expect(ad).toBe('Ege Birlik Yapı - Fotoğraf - 2026-08-17 - Boost - Kampanya');
    expect(ad).not.toContain(' -  - ');
  });

  it('medya etiketi de yoksa "Gönderi" yazıyor', () => {
    expect(
      boostAssetName({
        clientName: 'X',
        postMessage: '',
        date: TARIH,
        kind: 'campaign',
      }),
    ).toBe('X - Gönderi - 2026-08-17 - Boost - Kampanya');
  });

  it('KRİTİK: uzun parça GERÇEKTEN kırpılıyor', () => {
    /*
     * Bu testin ilk hâli yalnızca ekin yerinde durduğunu kontrol ediyordu ve
     * kırpmayı tamamen kaldıran bir mutasyon onu geçiyordu — yani kırpmanın
     * OLDUĞUNU hiç doğrulamıyordu. Şimdi kısaldığı ve kesme işareti aldığı
     * ayrı ayrı yazılı.
     */
    const uzunAd = 'Çok Uzun Bir Müşteri Adı Limited Şirketi Anonim Holding A.Ş.';
    const ad = boostAssetName({
      clientName: uzunAd,
      postMessage: 'Bu yaz hayalinizdeki',
      date: TARIH,
      kind: 'adSet',
    });
    expect(ad).not.toContain(uzunAd);
    expect(ad).toContain('…');
    expect(ad.startsWith('Çok Uzun Bir Müşteri Adı')).toBe(true);
  });

  it('KRİTİK: kırpma SEVİYE EKİNİ yemiyor', () => {
    /*
     * Sondan kırpmak "Reklam Seti" ekini yiyip adı işe yaramaz hâle
     * getirirdi — oysa o ek, listede hangi seviyeye baktığını söyleyen tek şey.
     * Kırpma parça bazında, adın tamamı üzerinden değil.
     */
    const ad = boostAssetName({
      clientName: 'Çok Uzun Bir Müşteri Adı Limited Şirketi Anonim Holding A.Ş.',
      postMessage:
        'Çokuzunbirkelimebunungibi ikincisidebayagıuzunolabiliyor ucuncusudeuzun',
      date: TARIH,
      kind: 'adSet',
    });
    expect(ad.endsWith(' - Boost - Reklam Seti')).toBe(true);
    expect(ad).toContain('2026-08-17');
  });

  it('müşteri adı boşsa "Müşteri" yazıyor', () => {
    expect(
      boostAssetName({ clientName: '   ', postMessage: 'a b c', date: TARIH, kind: 'ad' }),
    ).toBe('Müşteri - a b c - 2026-08-17 - Boost - Reklam');
  });
});

describe('boostNameBase / boostNameWithLabel', () => {
  it('KRİTİK: taban SEVİYE EKİ TAŞIMIYOR', () => {
    /*
     * Sağlayıcı ekini kendi ekliyor. Taban "… - Kampanya" içerseydi ad
     * `… - Boost - Kampanya - Reklam Seti` gibi çift seviyeli çıkardı.
     */
    const base = boostNameBase(ORNEK);
    expect(base).toBe('Ege Birlik Yapı - Bu yaz hayalinizdeki - 2026-08-17 - Boost');
    expect(base).not.toContain('Kampanya');
  });

  it('taban + ek, doğrudan üretilen adla AYNI', () => {
    // İki ayrı birleştirme yolu bir gün ayrışırdı; test onları bağlıyor.
    const base = boostNameBase(ORNEK);
    for (const kind of ['campaign', 'adSet', 'ad', 'creative'] as const) {
      expect(boostNameWithLabel(base, kind)).toBe(boostAssetName({ ...ORNEK, kind }));
    }
  });
});
