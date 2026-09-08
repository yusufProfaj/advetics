import { describe, expect, it } from 'vitest';
import {
  ENTITY_LEVEL_LABELS,
  PLATFORMS,
  linkedinPara,
  linkedinTutar,
  linkedinTutarMicros,
} from '@advetics/shared';

/**
 * ═══ LINKEDIN'İN İKİ PAHALI TUZAĞI ═══
 *
 * Bu dosya iki şeyi kilitliyor ve ikisi de bu projede "sessiz hata" sınıfında:
 * para ÖLÇEĞİ ve seviye EŞLEMESİ. İkisinin de yanlışı hata vermiyor.
 */

describe('linkedinTutar — micros ondalık string oluyor', () => {
  it('KRİTİK: 30 dolar "30.00" oluyor, "30000000" DEĞİL', () => {
    /*
     * BU TESTİN TAMAMI TEK BİR ARIZAYI ÖNLEMEK İÇİN. Micros değerini
     * LinkedIn'in `amount` alanına doğrudan yazmak bütçeyi 1.000.000 katına
     * çıkarıyor ve API bunu GEÇERLİ bir BigDecimal sayıyor — hata yok, log
     * yok, yalnızca harcama.
     */
    expect(linkedinTutar(30_000_000n)).toBe('30.00');
    expect(linkedinTutar(30_000_000n)).not.toBe('30000000');
  });

  it('kuruş korunuyor', () => {
    expect(linkedinTutar(18_500_000n)).toBe('18.50');
    expect(linkedinTutar(1_990_000n)).toBe('1.99');
    expect(linkedinTutar(0n)).toBe('0.00');
  });

  it('yuvarlama yukarı taştığında birim artıyor', () => {
    // 9,999 → 10.00, "9.100" gibi bozuk bir string üretilmiyor.
    expect(linkedinTutar(9_999_000n)).toBe('10.00');
    expect(linkedinTutar(9_995_000n)).toBe('10.00');
    expect(linkedinTutar(9_994_000n)).toBe('9.99');
  });

  it('negatif tutar PATLIYOR — sessizce sıfıra düşmüyor', () => {
    // Negatif bütçe anlamlı değil; sessizce 0 göndermek kampanyayı durdurur
    // ve sebebi hiçbir yerde görünmez.
    expect(() => linkedinTutar(-1n)).toThrow(/negatif/);
  });

  it('BÜYÜK DEĞERDE hassasiyet kaybı yok', () => {
    /*
     * Number'a çevirip bölen bir uygulama burada kayıyor. Aynı bütçenin iki
     * çağrıda iki farklı string üretmesi, "bütçeyi değiştirmedim ama değişti"
     * hâlini üretirdi.
     */
    expect(linkedinTutar(9_007_199_254_740_993_000_000n)).toBe('9007199254740993.00');
  });
});

describe('linkedinTutarMicros — LinkedIn BEŞ ondalık gönderiyor', () => {
  it('KRİTİK: "19.91833" tam olarak çevriliyor — kayan nokta hatası yok', () => {
    /*
     * `parseFloat('19.91833') * 1e6` = 19918329.999999998 veriyor ve
     * `Math.round` olmadan BigInt'e çevirmek patlıyor, `Math.round` ile de
     * kuruş sessizce kayıyor. Resmi örnek yanıt bu değeri taşıyor.
     */
    expect(linkedinTutarMicros('19.91833')).toBe(19_918_330n);
  });

  it('ondalıksız ve az ondalıklı değerler', () => {
    expect(linkedinTutarMicros('18')).toBe(18_000_000n);
    expect(linkedinTutarMicros('30.0')).toBe(30_000_000n);
    expect(linkedinTutarMicros('0.01')).toBe(10_000n);
  });

  it('KRİTİK: CANLIDA ÖLÇÜLEN 18 ONDALIK — doküman 5 diyordu', () => {
    /*
     * BU DEĞER GERÇEK. 2026-09-08 ölçüm turunda `adAnalytics`ten aynen bu
     * geldi: "539.700000000000192784" — ON SEKİZ ondalık. LinkedIn'in
     * dokümanı beş ondalıklı bir örnek veriyor ("19.91833") ve o örneğe göre
     * yazılmış bir çözümleyici bu değerde patlar ya da kuruş kaydırır.
     *
     * Sayı kayan noktanın seri hâli: 539.7 ikili tabanda tam durmuyor ve
     * LinkedIn onu ondalık string'e çevirirken gürültü de yazılıyor.
     *
     * `parseFloat("539.700000000000192784") * 1e6` = 539700000.0000002 ve
     * `BigInt()` onu REDDEDİYOR — yani kayan noktalı bir uygulama burada
     * çalışma anında patlardı. Tam sayı aritmetiği hem doğru hem gerekli.
     */
    expect(linkedinTutarMicros('539.700000000000192784')).toBe(539_700_000n);
    expect(linkedinTutarMicros('539.4700000000000674134')).toBe(539_470_000n);
    expect(linkedinTutarMicros('526.350000000000028826')).toBe(526_350_000n);
  });

  it('KRİTİK: canlıda ölçülen kampanya bütçesi ve teklifi', () => {
    /*
     * Aynı turda `adCampaigns` yanıtından: bütçe `{"currencyCode":"TRY",
     * "amount":"320"}`, teklif `{"currencyCode":"TRY","amount":"645.33"}`.
     * Ondalıksız ve iki ondalıklı biçim birlikte geliyor — ikisi de aynı
     * çözümleyiciden geçmek zorunda.
     */
    expect(linkedinTutarMicros('320')).toBe(320_000_000n);
    expect(linkedinTutarMicros('645.33')).toBe(645_330_000n);
  });

  it('gidiş-dönüş kayıpsız', () => {
    for (const micros of [0n, 1_000_000n, 18_500_000n, 999_990_000n]) {
      expect(linkedinTutarMicros(linkedinTutar(micros))).toBe(micros);
    }
  });

  it('sayı OLMAYAN değer PATLIYOR — NaN üretmiyor', () => {
    /*
     * `parseFloat` bozuk girdide NaN döndürüyor ve NaN bir metrik satırına
     * yazıldığında rapor sessizce yanlış oluyor. Bu depoda PDF üretimi tam
     * olarak bir NaN yüzünden HTTP 500 ile düştü.
     */
    expect(() => linkedinTutarMicros('bilinmiyor')).toThrow(/sayı değil/);
    expect(() => linkedinTutarMicros('')).toThrow(/sayı değil/);
    expect(() => linkedinTutarMicros('19,91')).toThrow(/sayı değil/);
  });
});

describe('linkedinPara — para birimi zorunlu', () => {
  it('hesabın para birimiyle birlikte gidiyor', () => {
    expect(linkedinPara(30_000_000n, 'USD')).toEqual({ amount: '30.00', currencyCode: 'USD' });
  });

  it('KRİTİK: geçersiz para birimi PATLIYOR', () => {
    /*
     * LinkedIn `currencyCode`u hesabın para birimiyle eşleşmiyorsa isteği
     * reddediyor — sessiz OLMAYAN tek para hatası bu. Yine de biçimi burada
     * yakalamak, hatayı platforma gitmeden görmek demek.
     */
    expect(() => linkedinPara(1n, 'usd')).toThrow(/ISO 4217/);
    expect(() => linkedinPara(1n, 'TRYX')).toThrow(/ISO 4217/);
  });
});

/**
 * ═══ SEVİYE EŞLEMESİ ═══
 *
 * LinkedIn'in "Campaign"i bizim `campaign`ımız DEĞİL. Eşleme isme değil
 * ALANLARA dayanıyor: LinkedIn Campaign `targetingCriteria`, `dailyBudget`,
 * `unitCost` taşıyor — yani Meta'nın ad set'i, Google'ın reklam grubu.
 */
describe('LinkedIn seviye eşlemesi', () => {
  it('KRİTİK: LinkedIn "Kampanya" bizim ad_group seviyemiz', () => {
    const l = ENTITY_LEVEL_LABELS.linkedin;
    expect(l.campaign).toBe('Kampanya Grubu');
    expect(l.ad_group).toBe('Kampanya');
    expect(l.ad).toBe('Reklam');
  });

  it('KRİTİK: campaign ve ad_group etiketleri AYNI DEĞİL', () => {
    /*
     * Mutasyon bekçisi. Biri diğerine kopyalanırsa panel iki farklı seviyeyi
     * aynı adla gösterir ve kullanıcı hangi satıra baktığını bilemez — asıl
     * hata ise eşlemenin kaymış olması olurdu.
     */
    const l = ENTITY_LEVEL_LABELS.linkedin;
    expect(l.campaign).not.toBe(l.ad_group);
  });

  it('her platform BÜTÜN seviyeler için etiket taşıyor', () => {
    // Yeni platform eklenip etiket tablosu güncellenmezse panel `undefined`
    // yazıyor; TypeScript Record'u zorluyor ama çalışma anında da sınıyoruz.
    for (const p of PLATFORMS) {
      for (const seviye of ['account', 'campaign', 'ad_group', 'ad'] as const) {
        expect(ENTITY_LEVEL_LABELS[p]?.[seviye], `${p}.${seviye} etiketi yok`).toBeTruthy();
      }
    }
  });

  it('linkedin PLATFORMS listesinde', () => {
    expect(PLATFORMS).toContain('linkedin');
  });
});
