import { describe, expect, it } from 'vitest';
import {
  agirlikliKonum,
  aramaOrtusmesi,
  disKimlikDenetle,
  eksikKaynakIzni,
  eslenemeyenPay,
  GA4_ISTEK_SINIRI,
  GA4_METRIK_TANIMI,
  GA4_RAPORLARI,
  ga4Kalite,
  ga4KotaIzni,
  ga4ParaMikro,
  ga4Tarih,
  googleUrunKimligi,
  kampanyaEsle,
  KAYNAK_IS_TURLERI,
  KAYNAK_PENCERESI,
  KAYNAK_SAGLIK_KONTROLLERI,
  KAYNAK_SAGLIK_TANIMI,
  KAYNAK_SUPURMELERI,
  KAYNAK_TABLOLARI,
  KAYNAK_TANIMI,
  KAYNAK_TURLERI,
  KAYNAK_UCLARI,
  kaynakGecmisParcalari,
  kaynakGunlukPencere,
  PAKET_A_DISARIDAN_TASINAN,
  PERMISSIONS,
  PLATFORMS,
  SIPARIS_SAKLANAN_ALANLAR,
  SIPARIS_YASAK_ALANLAR,
  takipAcigi,
  TAKIP_ACIGI,
  trafikKaynagi,
  urunEtiketi,
  type EslemeKampanyasi,
} from '@advetics/shared';

/**
 * ═══ VERİ KAYNAĞI SÖZLEŞMESİ (Paket F, Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor. NOT: `packages/shared`te
 * mutasyon yapılacaksa önce shared yeniden derlenmeli (testler `dist`i okuyor).
 */

describe('kaynak bir reklam platformu değil', () => {
  it('KRİTİK: hiçbir kaynak türü PLATFORMS içinde değil', () => {
    // Girerse 47 elle yazılmış liste ve PLATFORM_SIRASI kaynağı reklam
    // platformu sayar; harcama toplamına sıfır harcamalı "platform" girer.
    for (const t of KAYNAK_TURLERI) expect(PLATFORMS as readonly string[]).not.toContain(t);
  });

  it('hiçbir kaynak yazmıyor (Paket F salt okuma)', () => {
    for (const t of KAYNAK_TURLERI) expect(KAYNAK_TANIMI[t].yazar).toBe(false);
  });

  it('Google kaynakları tek okuma izni istiyor, hepsi https://www.googleapis.com/auth/', () => {
    for (const t of KAYNAK_TURLERI) {
      const d = KAYNAK_TANIMI[t];
      if (d.kimlik === 'google_oauth') expect(d.scope).toMatch(/^https:\/\/www\.googleapis\.com\/auth\/[a-z.]+$/);
      else expect(d.scope).toBeNull();
    }
    expect(KAYNAK_TANIMI.ga4.scope).toBe('https://www.googleapis.com/auth/analytics.readonly');
  });

  it('eksik izin yalnız kendi iznine bakar (ölçüm izinlerinin beşini istemez)', () => {
    expect(eksikKaynakIzni('ga4', ['https://www.googleapis.com/auth/adwords', 'https://www.googleapis.com/auth/analytics.readonly'])).toBeNull();
    expect(eksikKaynakIzni('ga4', ['https://www.googleapis.com/auth/adwords'])).toBe('https://www.googleapis.com/auth/analytics.readonly');
    expect(eksikKaynakIzni('search_console', [KAYNAK_TANIMI.ga4.scope!])).toBe('https://www.googleapis.com/auth/webmasters.readonly');
    expect(eksikKaynakIzni('ikas', [])).toBeNull();
  });
});

describe('dış kimlik denetimi (giriş anında)', () => {
  it('GA4: mülk kimliği, "properties/" öneki kabul, ölçüm kimliği ret', () => {
    expect(disKimlikDenetle('ga4', 'properties/123456789')).toEqual({ gecerli: true, deger: '123456789' });
    expect(disKimlikDenetle('ga4', 'G-ABC123XYZ').gecerli).toBe(false);
  });

  it('Search Console: alan adı mülkü ve sonu "/" ile biten adres mülkü', () => {
    expect(disKimlikDenetle('search_console', 'sc-domain:Ornek.com')).toEqual({ gecerli: true, deger: 'sc-domain:ornek.com' });
    expect(disKimlikDenetle('search_console', 'https://www.ornek.com/')).toEqual({ gecerli: true, deger: 'https://www.ornek.com/' });
    expect(disKimlikDenetle('search_console', 'https://www.ornek.com').gecerli).toBe(false);
  });

  it('KRİTİK: Shopify/ikas sonek kontrolü endsWith (includes değil)', () => {
    expect(disKimlikDenetle('shopify', 'magaza.myshopify.com')).toEqual({ gecerli: true, deger: 'magaza.myshopify.com' });
    const kotu = disKimlikDenetle('shopify', 'magaza.myshopify.com.evil.com');
    expect(kotu.gecerli).toBe(false);
    if (!kotu.gecerli) expect(kotu.neden).toContain('myshopify.com');
    expect(disKimlikDenetle('ikas', 'x.myikas.com.evil.com').gecerli).toBe(false);
  });

  it('KRİTİK: mağaza adresinde IP literali, port, kullanıcı bilgisi ret (iddia SEBEBE çapalı)', () => {
    const ip = disKimlikDenetle('ticimax', '169.254.169.254');
    expect(ip.gecerli).toBe(false);
    if (!ip.gecerli) expect(ip.neden).toContain('IP');
    const port = disKimlikDenetle('ticimax', 'magaza.com:8080');
    expect(port.gecerli).toBe(false);
    if (!port.gecerli) expect(port.neden).toContain('port');
    expect(disKimlikDenetle('ticimax', 'kullanici@magaza.com').gecerli).toBe(false);
    expect(disKimlikDenetle('ticimax', 'https://www.Magaza.com/')).toEqual({ gecerli: true, deger: 'www.magaza.com' });
  });
});

describe('GA4 raporları', () => {
  it('istek sınırları içinde (9 boyut, 10 metrik)', () => {
    for (const r of Object.values(GA4_RAPORLARI)) {
      expect(r.boyutlar.length).toBeLessThanOrEqual(GA4_ISTEK_SINIRI.boyut);
      expect(r.metrikler.length).toBeLessThanOrEqual(GA4_ISTEK_SINIRI.metrik);
    }
  });

  it('KRİTİK: eventName boyutlu rapor YALNIZ keyEvents seçer (oturum katlanmaz)', () => {
    for (const r of Object.values(GA4_RAPORLARI)) {
      if ((r.boyutlar as readonly string[]).includes('eventName')) expect(r.metrikler).toEqual(['keyEvents']);
    }
    expect(GA4_RAPORLARI.trafik.boyutlar as readonly string[]).not.toContain('eventName');
  });

  it('belgede olmayan sözdizimi ve eski ad kullanılmıyor', () => {
    for (const r of Object.values(GA4_RAPORLARI)) {
      for (const m of r.metrikler as readonly string[]) {
        expect(m).not.toContain(':');
        expect(m).not.toBe('conversions');
      }
    }
  });

  it('item kapsamlı ürün raporunda oturum boyutu yok', () => {
    expect(GA4_RAPORLARI.urun.boyutlar.some((b) => b.startsWith('session'))).toBe(false);
  });

  it('her metriğin tanımı var; kullanıcı TOPLANAMAZ', () => {
    for (const r of Object.values(GA4_RAPORLARI)) for (const m of r.metrikler) expect(GA4_METRIK_TANIMI[m], m).toBeDefined();
    expect(GA4_METRIK_TANIMI.totalUsers!.toplanabilir).toBe(false);
    expect(GA4_METRIK_TANIMI.sessions!.toplanabilir).toBe(true);
  });

  it('tarih ve para çözümleme', () => {
    expect(ga4Tarih('20261011')).toBe('2026-10-11');
    expect(() => ga4Tarih('2026-10-11')).toThrow();
    expect(ga4ParaMikro('539.700000000000192784')).toBe(539_700_000n);
    expect(ga4ParaMikro('12')).toBe(12_000_000n);
    expect(ga4ParaMikro('0.5')).toBe(500_000n);
    expect(() => ga4ParaMikro('abc')).toThrow();
  });

  it('kalite bayrakları', () => {
    expect(ga4Kalite(undefined)).toEqual({ digerSatiri: false, esiklendi: false, ornekleme: null });
    expect(ga4Kalite({ dataLossFromOtherRow: true, subjectToThresholding: true, samplingMetadatas: [{ samplesReadCount: '50', samplingSpaceSize: '100' }] })).toEqual({
      digerSatiri: true,
      esiklendi: true,
      ornekleme: 0.5,
    });
  });

  it('KRİTİK: kota azalınca geçmiş önce, günlük sonra kesilir; etkileşimli kesilmez', () => {
    const kota = { gunKalan: 40_000, gunToplam: 100_000 };
    expect(ga4KotaIzni('gecmis', kota).izin).toBe(false);
    expect(ga4KotaIzni('gunluk', kota).izin).toBe(true);
    expect(ga4KotaIzni('gunluk', { gunKalan: 10_000, gunToplam: 100_000 }).izin).toBe(false);
    expect(ga4KotaIzni('etkilesimli', { gunKalan: 1, gunToplam: 100_000 }).izin).toBe(true);
    expect(ga4KotaIzni('gecmis', null).izin).toBe(true);
  });
});

describe('kampanya eşleme', () => {
  const k: EslemeKampanyasi[] = [
    { id: 'g1', platform: 'google', externalId: '2233445566', ad: 'Marka Arama' },
    { id: 'm1', platform: 'meta', externalId: '120210000000001', ad: 'Yaz İndirimi' },
    { id: 'm2', platform: 'meta', externalId: '120210000000002', ad: 'Ortak Ad' },
    { id: 'm3', platform: 'meta', externalId: '120210000000003', ad: 'ortak  ad' },
    { id: 'm4', platform: 'meta', externalId: '120210000000004', ad: 'Yaz İndirimi 2' },
  ];
  const s = (sourceMedium: string, kampanyaAdi: string | null, googleAdsKampanyaKimligi: string | null = null, kampanyaKimligi: string | null = null) => ({
    sourceMedium,
    kampanyaAdi,
    kampanyaKimligi,
    googleAdsKampanyaKimligi,
  });

  it('ücretli kaynak sınıflaması; organik Facebook ücretli değil', () => {
    expect(trafikKaynagi('google / cpc')).toBe('google_ucretli');
    expect(trafikKaynagi('facebook / paid_social')).toBe('meta_ucretli');
    expect(trafikKaynagi('ig / paid')).toBe('meta_ucretli');
    expect(trafikKaynagi('facebook / referral')).toBe('diger');
    expect(trafikKaynagi('google / organic')).toBe('diger');
    expect(trafikKaynagi('linkedin / cpc')).toBe('linkedin_ucretli');
  });

  it('Google: otomatik etiket kimliğiyle', () => {
    expect(kampanyaEsle(s('google / cpc', 'Başka Ad', '2233445566'), k)).toEqual({ sonuc: 'kimlik', kampanyaId: 'g1', platform: 'google' });
  });

  it('Meta: utm_campaign kampanya kimliği', () => {
    expect(kampanyaEsle(s('facebook / paid', '120210000000001'), k)).toEqual({ sonuc: 'utm_kimlik', kampanyaId: 'm1', platform: 'meta' });
  });

  it('Meta: ad eşleşmesi Türkçe büyük harfle', () => {
    expect(kampanyaEsle(s('facebook / paid', 'YAZ İNDİRİMİ'), k)).toEqual({ sonuc: 'ad', kampanyaId: 'm1', platform: 'meta' });
  });

  it('KRİTİK: aynı adlı iki kampanya varsa biri SEÇİLMEZ', () => {
    expect(kampanyaEsle(s('facebook / paid', 'Ortak Ad'), k)).toEqual({ sonuc: 'eslenemedi', neden: 'ad_belirsiz', platform: 'meta' });
  });

  it('KRİTİK: benzer ad eşlenmez (içerir/bulanık yok)', () => {
    expect(kampanyaEsle(s('facebook / paid', 'Yaz'), k)).toEqual({ sonuc: 'eslenemedi', neden: 'kampanya_bulunamadi', platform: 'meta' });
  });

  it('platform sınırı: Meta trafiği Google kampanyasına eşlenmez', () => {
    expect(kampanyaEsle(s('facebook / paid', 'Marka Arama'), k).sonuc).toBe('eslenemedi');
  });

  it('özel değerler: (not set) etiket yok, (other) kova, organik ücretli değil', () => {
    expect(kampanyaEsle(s('facebook / paid', '(not set)'), k)).toEqual({ sonuc: 'eslenemedi', neden: 'utm_yok', platform: 'meta' });
    expect(kampanyaEsle(s('facebook / paid', '(other)'), k)).toEqual({ sonuc: 'eslenemedi', neden: 'diger_kovasi', platform: null });
    expect(kampanyaEsle(s('google / organic', 'Marka Arama'), k)).toEqual({ sonuc: 'eslenemedi', neden: 'ucretli_degil', platform: null });
  });
});

describe('takip açığı', () => {
  it('KRİTİK: düşük hacimde karar yok', () => {
    expect(takipAcigi({ platformDonusum: 4, siteDonusum: 1, platformTiklama: 500 }).etiket).toBe('veri_yetersiz');
    expect(takipAcigi({ platformDonusum: 40, siteDonusum: 10, platformTiklama: TAKIP_ACIGI.enAzTiklama - 1 }).etiket).toBe('veri_yetersiz');
  });

  it('iki yön ve "hiç görmüyor" ayrı', () => {
    expect(takipAcigi({ platformDonusum: 40, siteDonusum: 10, platformTiklama: 500 }).etiket).toBe('platform_fazla');
    expect(takipAcigi({ platformDonusum: 10, siteDonusum: 40, platformTiklama: 500 }).etiket).toBe('site_fazla');
    expect(takipAcigi({ platformDonusum: 40, siteDonusum: 0, platformTiklama: 500 }).etiket).toBe('site_hic_gormuyor');
    expect(takipAcigi({ platformDonusum: 0, siteDonusum: 20, platformTiklama: 500 })).toEqual({ etiket: 'site_fazla', oran: null });
    expect(takipAcigi({ platformDonusum: 40, siteDonusum: 36, platformTiklama: 500 }).etiket).toBe('uyumlu');
  });

  it('eşlenemeyen pay paydası yalnız ücretli trafik', () => {
    const r = eslenemeyenPay([
      { eslendi: true, ucretli: true, anahtarEtkinlik: 30 },
      { eslendi: false, ucretli: true, anahtarEtkinlik: 10 },
      { eslendi: false, ucretli: false, anahtarEtkinlik: 500 },
    ]);
    expect(r).toEqual({ pay: 0.25, eslenemeyen: 10, ucretliToplam: 40 });
    expect(eslenemeyenPay([]).pay).toBeNull();
  });
});

describe('çekim pencereleri (çalıştırılarak)', () => {
  it('GA4 günlük: son 3 tam gün', () => {
    expect(kaynakGunlukPencere('ga4', '2026-10-12')).toEqual({ from: '2026-10-09', to: '2026-10-11' });
    expect(kaynakGunlukPencere('meta_katalog', '2026-10-12')).toBeNull();
  });

  it('KRİTİK: geçmiş parçaları boşluksuz, örtüşmesiz, tam gün sayısı, yeniden eskiye', () => {
    for (const t of KAYNAK_TURLERI) {
      const parcalar = kaynakGecmisParcalari(t, '2026-03-01');
      const p = KAYNAK_PENCERESI[t];
      if (p.gecmisGun === 0) {
        expect(parcalar).toEqual([]);
        continue;
      }
      let gun = 0;
      for (let i = 0; i < parcalar.length; i++) {
        const { from, to } = parcalar[i]!;
        expect(from <= to).toBe(true);
        gun += (Date.parse(to) - Date.parse(from)) / 86_400_000 + 1;
        if (i > 0) {
          const onceki = parcalar[i - 1]!;
          // Bir sonraki (daha eski) parçanın bitişi, öncekinin başlangıcının bir gün öncesi.
          expect((Date.parse(onceki.from) - Date.parse(to)) / 86_400_000, `${t} parça ${i}`).toBe(1);
        }
      }
      expect(gun, t).toBe(p.gecmisGun);
      expect(parcalar[0]!.to).toBe(kaynakGunlukPencere(t, '2026-03-01')?.to ?? '2026-03-01');
    }
  });

  it('Shopify geçmişi 60 günü aşmıyor (read_orders sınırı)', () => {
    expect(KAYNAK_PENCERESI.shopify.gecmisGun).toBeLessThanOrEqual(60);
  });
});

describe('tablolar ve işler', () => {
  it('her tablo üç durak kararını taşıyor ve adlar tekil', () => {
    const adlar = KAYNAK_TABLOLARI.map((t) => t.tablo);
    expect(new Set(adlar).size).toBe(adlar.length);
    for (const t of KAYNAK_TABLOLARI) {
      expect(t.truncate).toBe(true);
      expect(t.rls).toBe('workspace');
      expect(t.workspaceTasima).toBe('tasinir');
    }
  });

  it('KRİTİK: yalnız platform aynası olan ürün performansı hesapla taşınır', () => {
    const tasinan = KAYNAK_TABLOLARI.filter((t) => t.hesapTasima === 'tasinir').map((t) => t.tablo);
    expect(tasinan).toEqual(['urun_performansi_gunluk']);
  });

  it('her süpürmenin iş türü listede', () => {
    for (const s of KAYNAK_SUPURMELERI) expect(KAYNAK_IS_TURLERI).toContain(s.is);
  });
});

describe('sağlık kontrolleri ve Paket A bağı', () => {
  it('Paket A\'dan taşınan kod F1 kontrolü olarak tanımlı', () => {
    for (const k of PAKET_A_DISARIDAN_TASINAN) expect(KAYNAK_SAGLIK_KONTROLLERI as readonly string[]).toContain(k);
  });
  it('her kontrolün tanımı var', () => {
    for (const k of KAYNAK_SAGLIK_KONTROLLERI) expect(KAYNAK_SAGLIK_TANIMI[k].kosul.length).toBeGreaterThan(20);
  });
});

describe('uçlar', () => {
  it('izinler gerçek izin, rota/yöntem tekil', () => {
    const anahtar = KAYNAK_UCLARI.map((u) => `${u.yontem} ${u.yol}`);
    expect(new Set(anahtar).size).toBe(anahtar.length);
    for (const u of KAYNAK_UCLARI) expect(PERMISSIONS as readonly string[]).toContain(u.izin);
  });
  it('bağla/kaldır hesap ataması ağırlığında (connection.manage)', () => {
    const bagla = KAYNAK_UCLARI.find((u) => u.yontem === 'POST' && u.yol === '/veri-kaynaklari');
    const kaldir = KAYNAK_UCLARI.find((u) => u.yontem === 'DELETE');
    expect(bagla?.izin).toBe('connection.manage');
    expect(kaldir?.izin).toBe('connection.manage');
  });
});

describe('Search Console', () => {
  it('KRİTİK: konum gösterim ağırlıklı', () => {
    expect(agirlikliKonum([{ konum: 1, gosterim: 1 }, { konum: 10, gosterim: 9999 }])).toBeCloseTo(9.9991, 3);
    expect(agirlikliKonum([])).toBeNull();
  });

  it('örtüşme: Türkçe büyük harf aynı anahtarda buluşur', () => {
    const r = aramaOrtusmesi(
      [{ sorgu: 'İzmir Konut', tiklama: 5, gosterim: 100, konum: 2 }, { sorgu: 'organik', tiklama: 1, gosterim: 10, konum: 5 }],
      [{ terim: 'izmir konut', tiklama: 3, harcamaMikro: 9_000_000n }, { terim: 'ucretli', tiklama: 2, harcamaMikro: 1n }],
    );
    const tur = Object.fromEntries(r.map((x) => [x.anahtar, x.tur]));
    expect(tur).toEqual({ 'izmir konut': 'ikisi_de', organik: 'yalniz_organik', ucretli: 'yalniz_ucretli' });
  });
});

describe('e-ticaret', () => {
  it('KRİTİK: sipariş saklanan alanlarda kişisel veri yok', () => {
    for (const y of SIPARIS_YASAK_ALANLAR) expect(SIPARIS_SAKLANAN_ALANLAR as readonly string[]).not.toContain(y);
    for (const a of SIPARIS_SAKLANAN_ALANLAR) expect(a).not.toMatch(/e_?posta|telefon|adres|soyad|musteri/);
  });

  it('Google ürün kimliği öneki çözülür', () => {
    expect(googleUrunKimligi('online:tr:TR:SKU-12')).toBe('SKU-12');
    expect(googleUrunKimligi('SKU-12')).toBe('SKU-12');
  });

  it('ürün etiketi: eşlenemedi, satış yok, takip açığı, kur farkında kıyas yok', () => {
    expect(urunEtiketi({ harcamaMikro: 10n, platformDegerMikro: 0n, magazaNetMikro: null, ayniParaBirimi: true })).toBe('eslenemedi');
    expect(urunEtiketi({ harcamaMikro: 10n, platformDegerMikro: 50n, magazaNetMikro: 0n, ayniParaBirimi: true })).toBe('satis_yok');
    expect(urunEtiketi({ harcamaMikro: 10n, platformDegerMikro: 100n, magazaNetMikro: 30n, ayniParaBirimi: true })).toBe('takip_acigi');
    expect(urunEtiketi({ harcamaMikro: 10n, platformDegerMikro: 100n, magazaNetMikro: 30n, ayniParaBirimi: false })).toBe('gelir_yuksek');
    expect(urunEtiketi({ harcamaMikro: 50n, platformDegerMikro: 40n, magazaNetMikro: 40n, ayniParaBirimi: true })).toBe('gelir_dusuk');
  });
});
