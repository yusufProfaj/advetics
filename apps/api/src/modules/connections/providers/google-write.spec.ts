import { describe, expect, it } from 'vitest';
import {
  adGroupBody,
  campaignBody,
  campaignBudgetBody,
  googleDate,
  keywordsBody,
  nameStamp,
  removeBody,
  resourceCollection,
  responsiveSearchAdBody,
} from './google-write';

/**
 * Google yazma istek gövdeleri.
 *
 * BU KOD CANLI API'DE HİÇ ÇALIŞTIRILMADI ve bu testler onu değiştirmiyor:
 * gövdenin ŞEKLİNİ sınıyorlar, Google'ın davranışını değil. Meta'da ilk
 * gerçek yazma çağrısında altı hata çıktı ve hiçbiri birim testiyle
 * yakalanamazdı; buradaki testlerin işi, canlıda öğrenilecek dersleri
 * ÖĞRENİLDİKTEN SONRA kilitleyebileceğimiz bir zemin bırakmak.
 *
 * Şimdilik kilitledikleri şey, BİLEREK VERİLMİŞ kararların sessizce
 * kaybolmaması.
 */

describe('kampanya bütçesi', () => {
  it('paylaşımlı DEĞİL', () => {
    // Paylaşımlı bütçe, bir kampanyanın harcamasının diğerini aç bırakması
    // demek ve kullanıcı bunu istemedi.
    const b = campaignBudgetBody({ name: 'Yaz', amountMicros: '200000000', stamp: 's' });
    expect(b.operations[0]!.create).toMatchObject({
      explicitlyShared: false,
      deliveryMethod: 'STANDARD',
      amountMicros: '200000000',
    });
  });

  it('ADA ZAMAN DAMGASI ekleniyor', () => {
    // Google aynı adda ikinci bütçeyi reddediyor (DUPLICATE_NAME) ve mesaj
    // kullanıcının kampanya adıyla ilgili olduğunu söylemiyor.
    const b = campaignBudgetBody({ name: 'Yaz', amountMicros: '1', stamp: '2026-08-16 12:00' });
    expect(b.operations[0]!.create!.name).toContain('2026-08-16 12:00');
  });
});

describe('kampanya', () => {
  const b = campaignBody({ name: 'Yaz', budgetResource: 'customers/1/campaignBudgets/2', stamp: 's' });
  const create = b.operations[0]!.create!;

  it('KRİTİK: PAUSED açılıyor', () => {
    /**
     * Meta yolundan bilerek FARKLI: orada kampanya en sonda ACTIVE'e
     * alınıyor çünkü o yol canlıda bir kez çalıştı. Burası hiç çalışmadı ve
     * ilk gerçek çağrının sonucunu bir insan görmeden para harcanmamalı.
     */
    expect(create.status).toBe('PAUSED');
  });

  it('KRİTİK: arama ağı ortakları ve Görüntülü Reklam Ağı AÇIKÇA kapalı', () => {
    /**
     * Google'ın varsayılanı ikisini de AÇIK getiriyor. Alanı göndermemek,
     * arama kampanyası kurduğunu sanan kullanıcının bütçesinin bir kısmının
     * bambaşka bir envantere gitmesi demek — platformun varsayılanına
     * güvenmek bu projede yasak.
     */
    expect(create.networkSettings).toEqual({
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    });
  });

  it('teklif manualCpc — dönüşüm takibi istemiyor', () => {
    // `MaximizeConversions` dönüşüm takibi ister ve bu üründe yok; takipsiz
    // açmak kampanyanın hiç öğrenmemesi demek.
    expect(create.manualCpc).toEqual({ enhancedCpcEnabled: false });
  });

  it('bütçeye KAYNAK ADIYLA bağlanıyor', () => {
    // Meta'dan yapısal fark: bütçe ayrı bir kaynak.
    expect(create.campaignBudget).toBe('customers/1/campaignBudgets/2');
  });

  it('tarih verilmezse alan HİÇ gönderilmiyor', () => {
    expect(create.startDate).toBeUndefined();
    expect(create.endDate).toBeUndefined();
  });

  it('tarihler YYYY-MM-DD', () => {
    const withDates = campaignBody({
      name: 'Yaz',
      budgetResource: 'r',
      stamp: 's',
      startDate: '2026-08-16',
      endDate: '2026-08-23',
    });
    expect(withDates.operations[0]!.create!.startDate).toBe('2026-08-16');
  });
});

describe('reklam grubu ve anahtar kelimeler', () => {
  it('teklif tavanı ZORUNLU alanda', () => {
    // Tavansız grup, Google'ın hesap varsayılanını kullanması demek ve o
    // varsayılan müşteriden müşteriye değişiyor.
    const b = adGroupBody({ name: 'G', campaignResource: 'c', cpcBidMicros: '10000000' });
    expect(b.operations[0]!.create!.cpcBidMicros).toBe('10000000');
    expect(b.operations[0]!.create!.type).toBe('SEARCH_STANDARD');
  });

  it('eşleme tipi PHRASE', () => {
    // BROAD alakasız aramaları yakalayıp bütçeyi hızla tüketiyor, EXACT ise
    // çok dar başlayıp hiç gösterim almayabiliyor.
    const b = keywordsBody({ adGroupResource: 'g', keywords: ['halı yıkama', ' koltuk yıkama '] });
    expect(b.operations).toHaveLength(2);
    expect(b.operations[0]!.create!.keyword).toEqual({
      text: 'halı yıkama',
      matchType: 'PHRASE',
    });
    // Baştaki/sondaki boşluk temizleniyor: Google onu kelimenin parçası
    // sayıyor ve eşleşmeyi bozuyor.
    expect((b.operations[1]!.create!.keyword as { text: string }).text).toBe('koltuk yıkama');
  });
});

describe('duyarlı arama reklamı', () => {
  const b = responsiveSearchAdBody({
    adGroupResource: 'g',
    finalUrl: 'https://site.com',
    headlines: ['Bir', 'İki', 'Üç'],
    descriptions: ['Açıklama bir', 'Açıklama iki'],
  });
  const create = b.operations[0]!.create!;

  it('PAUSED açılıyor', () => {
    expect(create.status).toBe('PAUSED');
  });

  it('metinler {text} nesnelerine sarılıyor', () => {
    const ad = create.ad as { responsiveSearchAd: { headlines: Array<{ text: string }> } };
    expect(ad.responsiveSearchAd.headlines).toEqual([
      { text: 'Bir' },
      { text: 'İki' },
      { text: 'Üç' },
    ]);
  });

  it('hedef URL dizi içinde', () => {
    expect((create.ad as { finalUrls: string[] }).finalUrls).toEqual(['https://site.com']);
  });
});

describe('kısmi başarı ve geri alma', () => {
  it('KRİTİK: partialFailure her gövdede KAPALI', () => {
    /**
     * Açık olsaydı Google geçersiz işlemleri atlayıp kalanları uygular ve
     * yanıt "başarılı" görünürdü — üç anahtar kelimeden ikisi eklenmiş bir
     * kampanya, hiçbir hata olmadan. Bu projenin klasik sessiz hatası.
     */
    for (const b of [
      campaignBudgetBody({ name: 'a', amountMicros: '1', stamp: 's' }),
      campaignBody({ name: 'a', budgetResource: 'r', stamp: 's' }),
      adGroupBody({ name: 'a', campaignResource: 'c', cpcBidMicros: '1' }),
      keywordsBody({ adGroupResource: 'g', keywords: ['x'] }),
      responsiveSearchAdBody({
        adGroupResource: 'g',
        finalUrl: 'u',
        headlines: [],
        descriptions: [],
      }),
      removeBody('customers/1/campaigns/2'),
    ]) {
      expect(b.partialFailure).toBe(false);
    }
  });

  it('kaynak adından koleksiyon çıkarılıyor — geri alma için', () => {
    expect(resourceCollection('customers/123/campaignBudgets/456')).toBe('campaignBudgets');
    expect(resourceCollection('customers/123/campaigns/456')).toBe('campaigns');
    expect(resourceCollection('customers/123/adGroups/456')).toBe('adGroups');
  });
});

describe('yardımcılar', () => {
  it('googleDate saat dilimi kaydırmıyor', () => {
    // Date'e çevirip geri almak kayma üretiyor; bu projede tarihler zaten
    // string olarak taşınıyor.
    expect(googleDate(new Date('2026-08-16T23:30:00.000Z'))).toBe('2026-08-16');
  });

  it('nameStamp dakika hassasiyetinde', () => {
    expect(nameStamp(new Date('2026-08-16T12:34:56.000Z'))).toBe('2026-08-16 12:34');
  });
});
