import { describe, expect, it } from 'vitest';
import {
  ARAMA_DONUSUM_AYARI,
  adGroupBody,
  aramaAtomikIstek,
  aramaOgesiTelefonu,
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
    expect(create.startDateTime).toBeUndefined();
    expect(create.endDateTime).toBeUndefined();
  });

  it('KRİTİK: AB siyasi beyanı ve AI Max kapalı AÇIKÇA yazılıyor (A1 §7.2, S-19)', () => {
    // Beyansız oluşturma FieldError.REQUIRED; hesapta beyansız kampanya
    // kalırsa Google o hesabın kampanya yazmalarını kilitliyor.
    expect(create.containsEuPoliticalAdvertising).toBe('DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING');
    expect(create.aiMaxSetting).toEqual({ enableAiMax: false });
  });

  it('KRİTİK: tarihler v25 alan adlarıyla — startDate/endDate v23\'te KALDIRILDI', () => {
    const withDates = campaignBody({
      name: 'Yaz',
      budgetResource: 'r',
      stamp: 's',
      startDate: '2026-08-16',
      endDate: '2026-08-23',
    });
    const c = withDates.operations[0]!.create!;
    expect(c.startDateTime).toBe('2026-08-16 00:00:00');
    expect(c.endDateTime).toBe('2026-08-23 23:59:59');
    expect(c).not.toHaveProperty('startDate');
    expect(c).not.toHaveProperty('endDate');
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

describe('arama öğesi telefonu (E.164 → countryCode + ulusal numara)', () => {
  it('+90: TR ve santral öneki 0 OLMADAN 10 hane', () => {
    expect(aramaOgesiTelefonu('+905321234567')).toEqual({ countryCode: 'TR', phoneNumber: '5321234567' });
    expect(aramaOgesiTelefonu(' +902325551234 ')).toEqual({ countryCode: 'TR', phoneNumber: '2325551234' });
  });

  it('bilinmeyen önek TAHMİN EDİLMİYOR, açıkça patlıyor (+1 ABD de Kanada da)', () => {
    expect(() => aramaOgesiTelefonu('+12025550123')).toThrow(/tahmin edilmiyor/);
    expect(() => aramaOgesiTelefonu('+4930123456')).toThrow(/yalnız \+90/);
    // E.164 olmayan yazım da aynı kapıda.
    expect(() => aramaOgesiTelefonu('05321234567')).toThrow(/yalnız \+90/);
  });

  it('+90 ama hane sayısı yanlış: eksik/fazla numara reddediliyor', () => {
    expect(() => aramaOgesiTelefonu('+90532123456')).toThrow(/10 hane/);
    expect(() => aramaOgesiTelefonu('+9053212345678')).toThrow(/10 hane/);
    expect(() => aramaOgesiTelefonu('+90 532 123 45 67')).toThrow(/10 hane/);
  });
});

describe('atomik arama isteği — arama öğesi', () => {
  const temel = {
    customerId: '1234567890',
    name: 'WS · Beni arasınlar · adv-abcdef12',
    stamp: '20261010-0900',
    gunlukButceMicros: 250_000_000n,
    endDate: null,
    teklif: 'targetSpend' as const,
    konumlar: ['geoTargetConstants/1012782'],
    dil: 'languageConstants/1037',
    negatifler: ['ücretsiz'],
    anahtarKelimeler: ['kuşadası villa'],
    finalUrl: 'https://ornek.com.tr/',
    basliklar: ['Bir', 'İki', 'Üç'],
    aciklamalar: ['Birinci.', 'İkinci.'],
    validateOnly: true,
  };
  const turler = (ops: Array<Record<string, unknown>>) => ops.map((o) => Object.keys(o)[0]);

  it('telefon yoksa öğe işlemi YOK, sira.aramaOgesi null', () => {
    const { govde, sira } = aramaAtomikIstek(temel);
    expect(turler(govde.mutateOperations)).not.toContain('assetOperation');
    expect(turler(govde.mutateOperations)).not.toContain('campaignAssetOperation');
    expect(sira.aramaOgesi).toBeNull();
  });

  it('telefon varsa: öğe + CALL bağı SONDA, aynı istekte, geçici kimlikle; dönüşüm ayarı AÇIKÇA', () => {
    const { govde, sira } = aramaAtomikIstek({ ...temel, telefon: '+905321234567' });
    const ops = govde.mutateOperations;
    expect(turler(ops).slice(-2)).toEqual(['assetOperation', 'campaignAssetOperation']);
    expect(sira.aramaOgesi).toBe(ops.length - 1);
    expect((ops.at(-2) as { assetOperation: { create: unknown } }).assetOperation.create).toEqual({
      resourceName: 'customers/1234567890/assets/-4',
      callAsset: { countryCode: 'TR', phoneNumber: '5321234567', callConversionReportingState: ARAMA_DONUSUM_AYARI },
    });
    expect(ARAMA_DONUSUM_AYARI).toBe('USE_ACCOUNT_LEVEL_CALL_CONVERSION_ACTION');
    expect((ops.at(-1) as { campaignAssetOperation: { create: unknown } }).campaignAssetOperation.create).toEqual({
      campaign: 'customers/1234567890/campaigns/-2',
      asset: 'customers/1234567890/assets/-4',
      fieldType: 'CALL',
    });
    // Saat kısıtı uydurulmuyor: alan hiç yok.
    expect(JSON.stringify(ops)).not.toContain('adScheduleTargets');
    expect(govde.partialFailure).toBe(false);
    // Geçici kimlikler çakışmıyor (bütçe -1, kampanya -2, grup -3, öğe -4).
    const kimlikler = JSON.stringify(ops).match(/\/-\d+/g) ?? [];
    expect(new Set(kimlikler)).toEqual(new Set(['/-1', '/-2', '/-3', '/-4']));
  });

  it('bilinmeyen önekte HİÇBİR gövde üretilmeden patlıyor', () => {
    expect(() => aramaAtomikIstek({ ...temel, telefon: '+12025550123' })).toThrow(/tahmin edilmiyor/);
  });
});
