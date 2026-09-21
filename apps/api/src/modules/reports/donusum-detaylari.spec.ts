import { describe, expect, it } from 'vitest';
import { donusumDetaylari, donusumToplami } from '@advetics/shared';

/**
 * ═══ ADLANDIRILMIŞ DÖNÜŞÜM DETAYI ═══
 *
 * Panelde ve raporda tek bir "Dönüşüm: 47" sayısı vardı; 47'nin kaçı
 * WhatsApp tıklaması, kaçı telefon araması hiçbir yerde yazmıyordu.
 * Kullanıcının cümlesi: "dönüşümlerde ne olarak adlandırdıysam 'whatsapp
 * tıklaması' 'site içi telefon araması' gibi gibi dönüşümleri raporda düzgün
 * bir şekilde görebilmem lazım".
 *
 * İKİ PLATFORM İKİ AYRI GERÇEK ve testler bu farkı kilitliyor: Google'da ad
 * KULLANICININ kendi verdiği ad, Meta'da tekilleştirilmiş kova.
 */

const googleRaw = (
  liste: Array<{ name: string; conversions: number; valueMicros?: string }>,
): unknown => ({
  conversionActions: liste.map((l) => ({ ...l, valueMicros: l.valueMicros ?? '0' })),
});

describe('Google — kullanıcının kendi adları', () => {
  it('KRİTİK: dönüşüm eylemi adları OLDUĞU GİBİ geliyor', () => {
    const { satirlar } = donusumDetaylari(
      'google',
      googleRaw([
        { name: 'WhatsApp tıklaması', conversions: 12 },
        { name: 'Site içi telefon araması', conversions: 5 },
      ]),
    );
    expect(satirlar.map((s) => s.ad)).toEqual([
      'WhatsApp tıklaması',
      'Site içi telefon araması',
    ]);
  });

  it('SIFIR SAYILI eylem listeye girmiyor', () => {
    // Google, o dönemde hiç gerçekleşmemiş eylemler için de satır
    // döndürüyor; hepsini göstermek listeyi kullanılmaz yapardı.
    const { satirlar } = donusumDetaylari(
      'google',
      googleRaw([{ name: 'Kullanılmayan', conversions: 0 }]),
    );
    expect(satirlar).toEqual([]);
  });

  it('KRİTİK: DETAY ALINAMADIYSA hata taşınıyor — boş liste DEĞİL', () => {
    /*
     * "Bu dönemde dönüşüm yok" ile "Google detayı vermedi" farklı işler.
     * İkisini aynı boş listeye çevirmek, kullanıcıyı sebebi kendi Google Ads
     * kurulumunda aramaya gönderirdi.
     */
    const { satirlar, hata } = donusumDetaylari('google', {
      conversionActionsError: 'Request contains an invalid argument.',
    });
    expect(satirlar).toEqual([]);
    expect(hata).toContain('invalid argument');
  });

  it('bozuk gövdede fırlatmıyor', () => {
    // Rapor müşteriye gidiyor; bir bozuk satır yüzünden belgenin hiç
    // üretilmemesi, bir tablonun eksik olmasından çok daha kötü.
    expect(donusumDetaylari('google', null).satirlar).toEqual([]);
    expect(donusumDetaylari('google', { conversionActions: 'yok' }).satirlar).toEqual([]);
  });
});

describe('Meta — tekilleştirilmiş kovalar', () => {
  it('KRİTİK: AYNI OLAY İKİ KEZ SAYILMIYOR', () => {
    /*
     * Canlı hesapta ölçüldü: `lead` ve `onsite_conversion.lead_grouped`
     * ikisi de 40 döndürüyor ve bunlar AYNI 40 lead. Toplamak müşteriye iki
     * katını raporlamak olurdu.
     */
    const { satirlar } = donusumDetaylari('meta', {
      actions: [
        { action_type: 'lead', value: '40' },
        { action_type: 'onsite_conversion.lead_grouped', value: '40' },
      ],
    });
    expect(satirlar).toEqual([{ ad: 'Form', sayi: 40, degerMikros: '0' }]);
  });

  it('KRİTİK: mesaj kovasında sonraki olay EKLENMİYOR', () => {
    // `messaging_first_reply` BAŞKA bir olay (kullanıcı cevap verdi);
    // eklemek aynı konuşmayı iki kez saymak olurdu.
    const { satirlar } = donusumDetaylari('meta', {
      actions: [
        { action_type: 'onsite_conversion.messaging_conversation_started_7d', value: '20' },
        { action_type: 'onsite_conversion.total_messaging_connection', value: '20' },
        { action_type: 'onsite_conversion.messaging_first_reply', value: '19' },
      ],
    });
    expect(satirlar).toEqual([{ ad: 'Mesaj', sayi: 20, degerMikros: '0' }]);
  });

  it('satın almada PARASAL DEĞER micros olarak taşınıyor', () => {
    // Meta parayı ONDALIK veriyor; çevrimi çağırana bırakmak, iki yerde
    // yapılıp birinde unutulması demekti.
    const { satirlar } = donusumDetaylari('meta', {
      actions: [{ action_type: 'purchase', value: '3' }],
      action_values: [{ action_type: 'purchase', value: '1250.5' }],
    });
    expect(satirlar).toEqual([{ ad: 'Satış', sayi: 3, degerMikros: '1250500000' }]);
  });

  it('KRİTİK: HAM TEKNİK TÜRLER listeye sızmıyor', () => {
    /*
     * `onsite_conversion.messaging_conversation_started_7d` gibi bir dize
     * müşteri raporunda okunmaz; ayrıca aynı olay birden çok tür altında
     * geliyor ve hepsini basmak mükerrer bir liste üretirdi.
     */
    const { satirlar } = donusumDetaylari('meta', {
      actions: [
        { action_type: 'lead', value: '4' },
        { action_type: 'landing_page_view', value: '100' },
      ],
    });
    expect(satirlar.map((s) => s.ad)).toEqual(['Form']);
  });
});

describe('toplama', () => {
  it('KRİTİK: PLATFORMLAR BİRLEŞTİRİLMİYOR — aynı ad iki satır', () => {
    /*
     * İki platformda aynı adlı bir dönüşüm olabilir ve onları toplamak iki
     * ayrı ölçüm sistemini tek sayıda birleştirmek olurdu; atıf pencereleri
     * bile farklı.
     */
    const { satirlar } = donusumToplami([
      { platform: 'google', raw: googleRaw([{ name: 'Satış', conversions: 3 }]) },
      { platform: 'meta', raw: { actions: [{ action_type: 'purchase', value: '2' }] } },
    ]);
    expect(satirlar).toHaveLength(2);
    expect(satirlar.map((s) => s.platform).sort()).toEqual(['google', 'meta']);
  });

  it('aynı platformdaki aynı ad GÜNLER BOYUNCA toplanıyor', () => {
    const { satirlar } = donusumToplami([
      { platform: 'google', raw: googleRaw([{ name: 'WhatsApp', conversions: 2 }]) },
      { platform: 'google', raw: googleRaw([{ name: 'WhatsApp', conversions: 3 }]) },
    ]);
    expect(satirlar).toEqual([
      { platform: 'google', ad: 'WhatsApp', sayi: 5, degerMikros: '0' },
    ]);
  });

  it('KRİTİK: KESİRLİ ATIF SONDA yuvarlanıyor', () => {
    /*
     * Meta bir dönüşümü iki reklama 0,5/0,5 dağıtabiliyor. Ara toplamlarda
     * yuvarlamak hata biriktirirdi: üç gün 0,4 gelen bir dönüşüm sıfıra
     * yuvarlanıp kaybolurdu.
     */
    const gun = { platform: 'meta', raw: { actions: [{ action_type: 'lead', value: '0.4' }] } };
    const { satirlar } = donusumToplami([gun, gun, gun]);
    expect(satirlar[0]?.sayi).toBe(1);
  });

  it('ÇOK OLAN ÜSTTE — kullanıcının ilk sorusu "en çok hangisi"', () => {
    const { satirlar } = donusumToplami([
      {
        platform: 'google',
        raw: googleRaw([
          { name: 'Az', conversions: 1 },
          { name: 'Çok', conversions: 9 },
        ]),
      },
    ]);
    expect(satirlar[0]?.ad).toBe('Çok');
  });

  it('KRİTİK: hatalar TEKİLLEŞTİRİLİP taşınıyor', () => {
    // Otuz günlük aralıkta aynı hata otuz satırda geliyor; hepsini ekrana
    // basmak uyarıyı okunmaz yapardı.
    const bozuk = { platform: 'google', raw: { conversionActionsError: 'kota doldu' } };
    const { hatalar } = donusumToplami([bozuk, bozuk, bozuk]);
    expect(hatalar).toEqual(['kota doldu']);
  });
});
