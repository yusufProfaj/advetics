import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { metaTargetingFrom } from './meta-targeting';

/**
 * HEDEFLEME NESNESİNİN BİÇİMİ — canlıda öğrenildi, birim testiyle kilitli.
 *
 * Bu dosya bir ayrışmanın ardından yazıldı: Bilgi Bankası ön ayarı yolu kendi
 * hedefleme fonksiyonunu yazmıştı ve elle boost yolundakinden İKİ yerde
 * farklıydı. İkisi de derleniyordu, ikisi de "çalışıyordu".
 */
describe('geo_locations biçimi', () => {
  const temel = { ageMin: 18, ageMax: 65, genders: 'all' as const };

  it('KRİTİK: il ve şehir { key } NESNESİ, düz string DEĞİL', () => {
    /*
     * Ayrışan kopya buraya düz string koyuyordu. Meta bu kovalarda nesne
     * bekliyor; en iyi ihtimalle reddediyor, en kötüsünde alanı görmezden
     * gelip ülke geneline çıkıyor — hata vermeden.
     */
    const t = metaTargetingFrom({
      ...temel,
      locations: [
        { key: '3646', type: 'region' },
        { key: '1039127', type: 'city' },
      ],
    });
    const geo = t.geo_locations as Record<string, unknown>;
    expect(geo.regions).toEqual([{ key: '3646' }]);
    expect(geo.cities).toEqual([{ key: '1039127' }]);
  });

  it('ülke DÜZ STRING — kovaların biçimi aynı değil', () => {
    const geo = metaTargetingFrom({ ...temel, locations: [{ key: 'TR', type: 'country' }] })
      .geo_locations as Record<string, unknown>;
    expect(geo.countries).toEqual(['TR']);
  });

  it('KRİTİK: şehir seçiliyken ÜLKE GENELİ gönderilmiyor', () => {
    // Meta kovaları BİRLEŞİM olarak uyguluyor: "Türkiye + İzmir" = Türkiye.
    const geo = metaTargetingFrom({ ...temel, locations: [{ key: '1039127', type: 'city' }] })
      .geo_locations as Record<string, unknown>;
    expect(geo.countries).toBeUndefined();
  });

  it('hiç lokasyon yoksa Türkiye geneli — boş geo DÜNYA geneli demek', () => {
    const geo = metaTargetingFrom({ ...temel, locations: [] }).geo_locations as Record<
      string,
      unknown
    >;
    expect(geo.countries).toEqual(['TR']);
  });
});

describe('yaş ve cinsiyet', () => {
  const yer = [{ key: 'TR', type: 'country' as const }];

  it('KRİTİK: age_max 65 ise alan HİÇ gönderilmiyor', () => {
    // Meta'da 65 "65 ve üzeri" demek. Alanı göndermek 65 üstünü DIŞLIYOR ve
    // ayrışan kopya her zaman gönderiyordu.
    const t = metaTargetingFrom({ locations: yer, ageMin: 18, ageMax: 65, genders: 'all' });
    expect('age_max' in t).toBe(false);
    expect(t.age_min).toBe(18);
  });

  it('age_max 65 altındaysa gönderiliyor', () => {
    const t = metaTargetingFrom({ locations: yer, ageMin: 25, ageMax: 44, genders: 'all' });
    expect(t.age_max).toBe(44);
  });

  it('cinsiyet "hepsi" ise alan yok — boş dizi Meta’da "hiç kimse"', () => {
    const t = metaTargetingFrom({ locations: yer, ageMin: 18, ageMax: 65, genders: 'all' });
    expect('genders' in t).toBe(false);
  });

  it('kadın 2, erkek 1', () => {
    expect(
      metaTargetingFrom({ locations: yer, ageMin: 18, ageMax: 65, genders: 'female' }).genders,
    ).toEqual([2]);
    expect(
      metaTargetingFrom({ locations: yer, ageMin: 18, ageMax: 65, genders: 'male' }).genders,
    ).toEqual([1]);
  });
});

/**
 * İKİNCİ BİR HEDEFLEME ÜRETİCİSİ DOĞMASIN.
 *
 * Ayrışma tam olarak böyle oldu: yeni yolu yazan (ben) mevcut fonksiyonu
 * bulamayıp kendi küçük sürümünü yazdı. Tarama, yayın yollarının kendi
 * `geo_locations` nesnesini kurmasını yasaklıyor.
 */
describe('tek üretici', () => {
  const YOLLAR = [
    join(__dirname, 'boosts.service.ts'),
    join(__dirname, '..', 'autoboost', 'autoboost-launch.service.ts'),
  ];

  it('tarama dosyaları gerçekten okuyor', () => {
    for (const yol of YOLLAR) {
      const k = readFileSync(yol, 'utf8');
      // DİLİM BOŞ DÜŞERSE iddia her zaman doğru olurdu.
      expect(k.length).toBeGreaterThan(2000);
      expect(k).toContain('metaTargetingFrom');
    }
  });

  it('KRİTİK: yayın yolları kendi geo_locations nesnesini KURMUYOR', () => {
    for (const yol of YOLLAR) {
      const kod = readFileSync(yol, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      expect(kod, `${yol} kendi hedeflemesini kuruyor`).not.toContain('geo_locations');
    }
  });
});
