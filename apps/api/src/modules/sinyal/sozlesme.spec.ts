import { describe, expect, it } from 'vitest';
import {
  ANOMALI,
  ANOMALI_METRIKLERI,
  anomaliDegerlendir,
  beklenenAralik,
  bildirilirMi,
  kanalDurumu,
  kanalOlusturSchema,
  kotulestiMi,
  PERMISSIONS,
  resolvePermissions,
  ruleActionSchema,
  SAGLIK_KONTROLLERI,
  SINYAL_DURUMLARI,
  SINYAL_KAPALI_DURUMLARI,
  SINYAL_OLAYLARI,
  SINYAL_UCLARI,
  sinyalAnahtari,
  sinyalEylemTuru,
  sinyalGecisi,
  teslimSonrakiDurum,
  teslimSonucu,
  TESLIM_DURUMLARI,
  TESLIM_EN_FAZLA_DENEME,
  TESLIM_SON_DURUMLARI,
  webhookDenetle,
} from '@advetics/shared';

/**
 * ═══ SİNYAL + BİLDİRİM SÖZLEŞMESİ (Paket A, Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor (kaynak taraması değil). Ajan 2
 * ve 3 bu sözleşmeden okuyor; burada kilitlenen her kural iki tarafta aynı
 * davranışı garanti ediyor. NOT: `packages/shared`te bir satırı bozarak
 * mutasyon yapılacaksa önce shared yeniden derlenmeli (CLAUDE.md, testler
 * `dist`i okuyor).
 */

const UUID = '00000000-0000-4000-8000-000000000001';

describe('sinyal durum makinesi', () => {
  it('KRİTİK: her durumdan en az bir çıkış var (kalıcı kilit yok)', () => {
    for (const d of SINYAL_DURUMLARI) {
      const hedefler = SINYAL_OLAYLARI.map((o) => sinyalGecisi(d, o)).filter((h) => h !== null && h !== d);
      expect(hedefler.length, `${d} durumundan çıkış yok`).toBeGreaterThan(0);
    }
  });

  it('her kapalı durumdan açığa dönüş yolu var (kötüleşen sinyal susmaz)', () => {
    for (const d of SINYAL_KAPALI_DURUMLARI) {
      expect(SINYAL_OLAYLARI.some((o) => sinyalGecisi(d, o) === 'acik'), d).toBe(true);
    }
  });

  it('KRİTİK: kullanıcının kapattığı olay bitince kapatma referansı düşer', () => {
    // Bu geçiş olmasaydı Mart'ta kapatılan sinyal, Ekim'deki daha küçük yeni
    // olayda HİÇ açılmazdı (MIMARI § 4).
    expect(sinyalGecisi('kapatildi', 'sure_doldu')).toBe('kendiliginden_kapandi');
    expect(sinyalGecisi('kendiliginden_kapandi', 'gozlendi')).toBe('acik');
  });

  it('kapatılan sinyal aynı şiddette yeniden görülünce kapalı kalır, kötüleşince açılır', () => {
    expect(sinyalGecisi('kapatildi', 'gozlendi')).toBe('kapatildi');
    expect(sinyalGecisi('kapatildi', 'kotulesti')).toBe('acik');
  });

  it('uygulandı ve kullanıcı kapatması yalnız açık sinyalde', () => {
    expect(sinyalGecisi('acik', 'uygulandi')).toBe('kapatildi');
    expect(sinyalGecisi('kapatildi', 'uygulandi')).toBeNull();
    expect(sinyalGecisi('kendiliginden_kapandi', 'kullanici_kapatti')).toBeNull();
  });

  it('bildirim yalnız ilk açılışta ve kapalıdan açığa geçişte', () => {
    expect(bildirilirMi(null, 'acik')).toBe(true);
    expect(bildirilirMi('kapatildi', 'acik')).toBe(true);
    expect(bildirilirMi('kendiliginden_kapandi', 'acik')).toBe(true);
    // Her sabah yeniden gözlenen açık sinyal kanala tekrar DÜŞMEZ.
    expect(bildirilirMi('acik', 'acik')).toBe(false);
    expect(bildirilirMi('acik', 'kapatildi')).toBe(false);
  });
});

describe('teslim durum makinesi', () => {
  it('son durumlar listesi durum listesinin alt kümesi ve iki tane', () => {
    expect(TESLIM_SON_DURUMLARI).toEqual(['gonderildi', 'vazgecildi']);
    for (const d of TESLIM_SON_DURUMLARI) expect(TESLIM_DURUMLARI).toContain(d);
  });

  it('HTTP sınıflandırması', () => {
    expect(teslimSonucu(200)).toBe('basarili');
    expect(teslimSonucu(204)).toBe('basarili');
    expect(teslimSonucu(null)).toBe('gecici_hata');
    expect(teslimSonucu(429)).toBe('gecici_hata');
    expect(teslimSonucu(503)).toBe('gecici_hata');
    expect(teslimSonucu(404)).toBe('kalici_hata');
    expect(teslimSonucu(410)).toBe('kalici_hata');
  });

  it('KRİTİK: geçici hata sonsuza kadar denenmez, satır bir son duruma varır', () => {
    let durum = teslimSonrakiDurum('gecici_hata', 1);
    let deneme = 1;
    while (!TESLIM_SON_DURUMLARI.includes(durum)) {
      deneme++;
      expect(deneme).toBeLessThanOrEqual(TESLIM_EN_FAZLA_DENEME);
      durum = teslimSonrakiDurum('gecici_hata', deneme);
    }
    expect(durum).toBe('vazgecildi');
    expect(teslimSonrakiDurum('kalici_hata', 1)).toBe('vazgecildi');
  });
});

describe('beklenen aralık', () => {
  it('geçmiş yetersizse aralık yok (tahmin etmektense kısıtla)', () => {
    expect(beklenenAralik([100, 110, 90])).toBeNull();
    // Değeri olmayan gün noktaya sayılmaz.
    expect(beklenenAralik([100, null, 110, null, 90])).toBeNull();
  });

  it('tek aykırı gün ortanca ve MAD ile aralığı şişirmez', () => {
    const a = beklenenAralik([100, 105, 95, 100, 5000, 98])!;
    expect(a.orta).toBeGreaterThan(95);
    expect(a.orta).toBeLessThan(110);
    expect(a.ust).toBeLessThan(200);
  });

  it('sabit geçmişte (MAD = 0) yayılım tabanı uygulanır', () => {
    const a = beklenenAralik([1000, 1000, 1000, 1000])!;
    expect(a.yayilim).toBeCloseTo(1000 * ANOMALI.enAzYayilimOrani);
  });

  it('alt sınır sıfırın altına inmez', () => {
    const a = beklenenAralik([10, 300, 20, 500, 15, 400])!;
    expect(a.alt).toBe(0);
  });
});

describe('anomali değerlendirmesi', () => {
  const gosterimler = [20_000, 21_000, 19_500, 20_500, 20_200, 19_800];

  it('KRİTİK: maliyet sıçraması anomali (iki yön)', () => {
    const r = anomaliDegerlendir({ metrik: 'harcama', gozlenen: 4800, gecmis: [2000, 2100, 1900, 2050, 1950, 2000], gecmisHacim: gosterimler });
    expect(r.anomali).toBe(true);
    if (r.anomali) expect(r.yon).toBe('artis');
  });

  it('iyi yöndeki sapma sinyal değil (tıklama oranı arttı)', () => {
    const r = anomaliDegerlendir({ metrik: 'tiklama_orani', gozlenen: 0.05, gecmis: [0.02, 0.021, 0.019, 0.02, 0.02], gecmisHacim: gosterimler });
    expect(r).toEqual({ anomali: false, neden: 'iyi_yon' });
  });

  it('düşük hacim GEÇMİŞE bakar: gösterim sıfıra düşünce susmaz', () => {
    const r = anomaliDegerlendir({ metrik: 'gosterim', gozlenen: 0, gecmis: gosterimler, gecmisHacim: gosterimler });
    expect(r.anomali).toBe(true);
    const az = anomaliDegerlendir({ metrik: 'gosterim', gozlenen: 0, gecmis: [100, 120, 90, 110], gecmisHacim: [100, 120, 90, 110] });
    expect(az).toEqual({ anomali: false, neden: 'hacim_dusuk' });
  });

  it('KRİTİK: gürültülü seride tam durma yine anomali (alt sınır sıfıra kırpılsa da)', () => {
    const gurultulu = [5000, 30_000, 8000, 25_000, 6000, 28_000];
    expect(beklenenAralik(gurultulu)!.alt).toBe(0);
    const r = anomaliDegerlendir({ metrik: 'harcama', gozlenen: 0, gecmis: gurultulu, gecmisHacim: gurultulu });
    expect(r.anomali).toBe(true);
    if (r.anomali) {
      expect(r.yon).toBe('dusus');
      expect(r.onem).toBe('yuksek');
    }
  });

  it('artış kötü olan metrikte sıfır anomali değil (tıklama başı maliyet 0)', () => {
    const r = anomaliDegerlendir({ metrik: 'tiklama_basi_maliyet', gozlenen: 0, gecmis: [5, 5.2, 4.8, 5.1], gecmisHacim: [200, 210, 190, 205] });
    expect(r.anomali).toBe(false);
  });

  it('aralık dışı ama küçük göreli sapma elenir', () => {
    // Çok kararlı seri: aralık dar (±%15), %20'lik artış dışarıda ama iş için önemsiz.
    const r = anomaliDegerlendir({ metrik: 'harcama', gozlenen: 1200, gecmis: [1000, 1000, 1001, 999, 1000], gecmisHacim: gosterimler });
    expect(r).toEqual({ anomali: false, neden: 'goreli_sapma_kucuk' });
  });

  it('değer yok ve geçmiş yetersiz ayrı nedenler', () => {
    expect(anomaliDegerlendir({ metrik: 'tiklama_orani', gozlenen: null, gecmis: [1, 1, 1, 1], gecmisHacim: gosterimler })).toEqual({ anomali: false, neden: 'deger_yok' });
    expect(anomaliDegerlendir({ metrik: 'harcama', gozlenen: 10, gecmis: [1, 1], gecmisHacim: gosterimler })).toEqual({ anomali: false, neden: 'gecmis_yetersiz' });
  });

  it('kötüleşme yalnız aynı yönde ve katsayı kadar', () => {
    expect(kotulestiMi(4, 4 * ANOMALI.kotulesmeKatsayisi)).toBe(true);
    expect(kotulestiMi(4, 5)).toBe(false);
    expect(kotulestiMi(4, -10)).toBe(false);
    expect(kotulestiMi(null, 10)).toBe(false);
  });

  it('göreli sapma eşiği ölü kod değil: tabanlı aralık ondan dar', () => {
    expect(ANOMALI.esikZ * ANOMALI.enAzYayilimOrani).toBeLessThan(ANOMALI.enAzGoreliSapma);
  });

  it('metrik ve kontrol listeleri çakışmıyor (CHECK kısıtı birleşimi tekil)', () => {
    const hepsi = [...ANOMALI_METRIKLERI, ...SAGLIK_KONTROLLERI];
    expect(new Set(hepsi).size).toBe(hepsi.length);
  });
});

describe('webhook beyaz listesi', () => {
  const slack = 'https://hooks.slack.com/services/T000/B000/XXXXXXXX';

  it('geçerli Slack ve iki Teams ailesi kabul', () => {
    expect(webhookDenetle('slack', slack).gecerli).toBe(true);
    expect(webhookDenetle('teams', 'https://profaj.webhook.office.com/webhookb2/abc').gecerli).toBe(true);
    expect(webhookDenetle('teams', 'https://prod-12.westeurope.logic.azure.com:443/workflows/abc/triggers/manual/paths/invoke').gecerli).toBe(true);
  });

  it('KRİTİK: sonek kontrolü includes değil endsWith (alt alan adı hilesi)', () => {
    expect(webhookDenetle('teams', 'https://x.webhook.office.com.evil.com/a').gecerli).toBe(false);
    expect(webhookDenetle('slack', 'https://hooks.slack.com.evil.com/services/a').gecerli).toBe(false);
    expect(webhookDenetle('teams', 'https://webhook.office.com.evil.com/a').gecerli).toBe(false);
  });

  it('http, IP, kullanıcı bilgisi, özel port ve eksik yol reddedilir', () => {
    expect(webhookDenetle('slack', slack.replace('https', 'http')).gecerli).toBe(false);
    expect(webhookDenetle('slack', 'https://169.254.169.254/services/a').gecerli).toBe(false);
    expect(webhookDenetle('slack', 'https://a:b@hooks.slack.com/services/a').gecerli).toBe(false);
    expect(webhookDenetle('slack', 'https://hooks.slack.com:8443/services/a').gecerli).toBe(false);
    expect(webhookDenetle('slack', 'https://hooks.slack.com/workflows/a').gecerli).toBe(false);
    expect(webhookDenetle('slack', 'bir şey').gecerli).toBe(false);
  });

  it('ret nedeni kullanıcıya gösterilecek cümle taşır', () => {
    const r = webhookDenetle('slack', 'https://example.com/x');
    expect(r.gecerli).toBe(false);
    if (!r.gecerli) expect(r.neden).toContain('hooks.slack.com');
  });

  it('kanal şeması aynı denetimi kullanır (giriş anında = kayıt anında)', () => {
    const tamam = kanalOlusturSchema.safeParse({ tur: 'slack', clientId: UUID, ad: 'Reklam uyarıları', olaylar: ['sinyal'], adres: slack });
    expect(tamam.success).toBe(true);
    const kotu = kanalOlusturSchema.safeParse({ tur: 'slack', clientId: UUID, ad: 'x', olaylar: ['sinyal'], adres: 'https://evil.com/services/a' });
    expect(kotu.success).toBe(false);
    const olaysiz = kanalOlusturSchema.safeParse({ tur: 'eposta', clientId: UUID, ad: 'x', olaylar: [], alicilar: ['a@b.com'] });
    expect(olaysiz.success).toBe(false);
  });

  it('kanal durumu: kapalı > hata > doğrulanmadı > çalışıyor', () => {
    const hata = { zaman: 'x', durum: 'vazgecildi' as const, hata: '404' };
    expect(kanalDurumu({ etkin: false, dogrulandi: 'x', sonTeslim: hata })).toBe('kapali');
    expect(kanalDurumu({ etkin: true, dogrulandi: 'x', sonTeslim: hata })).toBe('hata');
    expect(kanalDurumu({ etkin: true, dogrulandi: null, sonTeslim: null })).toBe('dogrulanmadi');
    expect(kanalDurumu({ etkin: true, dogrulandi: 'x', sonTeslim: null })).toBe('calisiyor');
  });
});

describe('eylem, anahtar, izinler', () => {
  it('durdur yalnız para yakan yönde ve hesap seviyesinde değil', () => {
    expect(sinyalEylemTuru('harcama', 'artis', 'campaign')).toBe('durdur');
    expect(sinyalEylemTuru('harcama', 'dusus', 'campaign')).toBe('incele');
    expect(sinyalEylemTuru('harcama', 'artis', 'account')).toBeNull();
    expect(sinyalEylemTuru('reklam_onaysiz', null, 'ad')).toBe('incele');
    expect(sinyalEylemTuru('donusum_kesildi', null, 'account')).toBe('olcum');
  });

  it('anahtar client_id taşımaz (hesap taşınınca hedefte çakışma doğmaz)', () => {
    const a = sinyalAnahtari({ tur: 'anomali', kod: 'harcama', yon: 'artis', seviye: 'campaign', varlikId: UUID });
    expect(a).toBe(`anomali:harcama:artis:campaign:${UUID}`);
  });

  it('uç izinleri gerçek izinler; müşteri hesabı sinyal göremez', () => {
    for (const u of SINYAL_UCLARI) expect(PERMISSIONS).toContain(u.izin);
    const musteri = resolvePermissions('client_viewer');
    for (const u of SINYAL_UCLARI) expect(musteri.has(u.izin), `${u.yontem} ${u.yol}`).toBe(false);
  });

  it('kural notify eski biçimi (kanalsız) hâlâ geçerli', () => {
    expect(ruleActionSchema.safeParse({ type: 'notify' }).success).toBe(true);
    expect(ruleActionSchema.safeParse({ type: 'notify', kanalIdleri: [UUID] }).success).toBe(true);
    expect(ruleActionSchema.safeParse({ type: 'notify', kanalIdleri: ['x'] }).success).toBe(false);
  });
});
