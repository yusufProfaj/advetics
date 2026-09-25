import { describe, expect, it } from 'vitest';
import {
  demandGenAdGroupBody,
  demandGenCampaignBody,
  demandGenVideoAdBody,
  demandGenKonumBody,
  googleImageAssetBody,
  googleVideoAssetBody,
  kampanyayiYayinaAlBody,
  VARSAYILAN_KONUM,
} from './google-demandgen';

/**
 * DEMAND GEN — YouTube video reklamının API'den kurulabilen TEK yolu.
 *
 * BU DOSYADAKİ HER TEST BİR ARAŞTIRMA BULGUSUNU KİLİTLİYOR. Alan adlarının
 * hiçbiri tahmin edilmedi; hepsi v25 referansından ve çoğu ayrıca çürütme
 * turundan geçti. Yanlış bir alan adı Google tarafından ya reddedilir ya da —
 * daha kötüsü — sessizce yok sayılır.
 */

const CAMPAIGN = 'customers/123/campaigns/1';
const ADGROUP = 'customers/123/adGroups/1';
const VIDEO_ASSET = 'customers/123/assets/10';
const LOGO_ASSET = 'customers/123/assets/11';

function op(b: { operations: Array<{ create?: Record<string, unknown> }> }): Record<string, unknown> {
  return b.operations[0]!.create!;
}

describe('kısmi başarı', () => {
  it('KRİTİK: hepsinde `partialFailure: false`', () => {
    /*
     * `true` olsaydı Google geçersiz işlemleri atlayıp kalanları uygular ve
     * yanıt "başarılı" görünürdü — logosuz bir reklam, hatasız bir istek.
     */
    for (const b of [
      googleImageAssetBody({ name: 'x', bytes: Buffer.from('a') }),
      googleVideoAssetBody({ videoId: 'v', title: 't' }),
      demandGenCampaignBody({ name: 'n', budgetResource: 'b', stamp: 's' }),
      demandGenAdGroupBody({ name: 'n', campaignResource: CAMPAIGN }),
    ]) {
      expect(b.partialFailure).toBe(false);
    }
  });
});

describe('kampanya', () => {
  const c = op(demandGenCampaignBody({ name: 'Boost', budgetResource: 'b/1', stamp: '2026-08-18' }));

  it('KRİTİK: kanal tipi DEMAND_GEN', () => {
    // VIDEO kampanya API'den oluşturulamıyor; enum'da değerin durması
    // oluşturulabilir olduğunu göstermiyor.
    expect(c.advertisingChannelType).toBe('DEMAND_GEN');
  });

  it('KRİTİK: ALT TİP HİÇ GÖNDERİLMİYOR', () => {
    /*
     * Doküman birebir: "No AdvertisingChannelSubType should be set." Bir
     * değer yazmak "geçersiz alt tip" hatası veriyor ve kanal tipi
     * değiştirilemediği için yanlış kurulan kampanya tamir edilemiyor.
     */
    expect(c.advertisingChannelSubType).toBeUndefined();
  });

  it('KRİTİK: PAUSED kuruluyor — yayına alma en son, ayrı adımda', () => {
    // Konum, reklam grubu ve reklam yokken yayında olsaydı Google eksik
    // (konumsuz = bütün ülkeler) bir kampanyayı yayınlayabilirdi.
    expect(c.status).toBe('PAUSED');
  });

  it('KRİTİK: CPV teklifi YOK — Demand Gen desteklemiyor', () => {
    // MANUAL_CPV ve TARGET_CPV VIDEO kampanyalara ait. Kullanıcıya
    // "görüntüleme başına ödeme" vaat edilemez.
    expect(c.manualCpv).toBeUndefined();
    expect(c.targetCpv).toBeUndefined();
    expect(c.targetSpend).toBeDefined();
  });

  it('dönüşüm tabanlı strateji SEÇİLMEDİ', () => {
    // Dönüşüm takibi olmayan hesapta öğrenmiyor ve sessizce kötü çalışıyor.
    expect(c.maximizeConversions).toBeUndefined();
    expect(c.targetCpa).toBeUndefined();
  });

  it('bütçe kaynağa referansla bağlanıyor', () => {
    expect(c.campaignBudget).toBe('b/1');
  });
});

describe('reklam grubu', () => {
  const g = op(demandGenAdGroupBody({ name: 'Boost', campaignResource: CAMPAIGN }));

  it('KRİTİK: TİP GÖNDERİLMİYOR', () => {
    /*
     * "Create an ad group without a type." AdGroupType enum'unda DEMAND_GEN
     * karşılığı yok; oradaki VIDEO_* değerleri VIDEO kampanyalara ait ve tip
     * alanı değiştirilemediği için yanlış tip ad group'u tamir edilemez yapar.
     */
    expect(g.type).toBeUndefined();
  });

  it('KRİTİK: KANAL KONTROLLERİ AÇIKÇA VERİLİYOR', () => {
    /*
     * EN KOLAY ATLANAN VE EN PAHALI ALAN. Varsayılan ALL_CHANNELS: bu blok
     * gönderilmezse reklam Gmail, Discover, Maps ve Display'de de yayınlanır
     * ve kullanıcı "YouTube videomu tanıttım" sanırken bütçesinin bir kısmı
     * bambaşka envantere gider — hatasız.
     */
    const kanallar = (g.demandGenAdGroupSettings as { channelControls: { selectedChannels: Record<string, boolean> } })
      .channelControls.selectedChannels;
    expect(kanallar.youtubeInStream).toBe(true);
    expect(kanallar.youtubeInFeed).toBe(true);
    expect(kanallar.youtubeShorts).toBe(true);
  });

  it('KRİTİK: YouTube DIŞI kanallar açıkça KAPALI', () => {
    // Alanı hiç göndermemek "varsayılana bırak" demek ve varsayılan AÇIK.
    const kanallar = (g.demandGenAdGroupSettings as { channelControls: { selectedChannels: Record<string, boolean> } })
      .channelControls.selectedChannels;
    expect(kanallar.discover).toBe(false);
    expect(kanallar.gmail).toBe(false);
    expect(kanallar.display).toBe(false);
  });
});

describe('varlıklar', () => {
  it('logo IMAGE tipinde ve base64', () => {
    const a = op(googleImageAssetBody({ name: 'Logo', bytes: Buffer.from('abc') }));
    expect(a.type).toBe('IMAGE');
    expect((a.imageAsset as { data: string }).data).toBe(Buffer.from('abc').toString('base64'));
  });

  it('KRİTİK: logo `AssetFieldType` KULLANMIYOR', () => {
    /*
     * LOGO / SQUARE_MARKETING_IMAGE gibi alanlar `DemandGenMultiAssetAdInfo`'ya
     * ait; video responsive reklam yalnızca `logoImages` tanıyor. Yanlış alan
     * sessizce yok sayılırdı.
     */
    const a = op(googleImageAssetBody({ name: 'Logo', bytes: Buffer.from('abc') }));
    expect(a.fieldType).toBeUndefined();
    expect(a.marketingImages).toBeUndefined();
  });

  it('video YOUTUBE_VIDEO tipinde ve 11 karakterlik kimlikle', () => {
    const a = op(googleVideoAssetBody({ videoId: 'dQw4w9WgXcQ', title: 'Yazlık' }));
    expect(a.type).toBe('YOUTUBE_VIDEO');
    expect((a.youtubeVideoAsset as { youtubeVideoId: string }).youtubeVideoId).toBe('dQw4w9WgXcQ');
  });
});

describe('video reklamı', () => {
  const ad = op(
    demandGenVideoAdBody({
      adGroupResource: ADGROUP,
      finalUrl: 'https://egebirlik.com',
      businessName: 'Ege Birlik Yapı',
      videoAssetResource: VIDEO_ASSET,
      logoAssetResource: LOGO_ASSET,
      headlines: ['Yazlığınız olsun'],
      longHeadlines: ['Hayalinizdeki yazlığa kavuşun'],
      descriptions: ['Bankasız, kefilsiz, vade farksız taksit'],
    }),
  );
  const bilgi = (ad.ad as Record<string, unknown>).demandGenVideoResponsiveAd as Record<string, unknown>;

  it('KRİTİK: alan adı `demandGenVideoResponsiveAd`', () => {
    // API'den oluşturulabilen TEK YouTube video reklamı bu. VideoAdInfo ve
    // VideoResponsiveAdInfo salt raporlama.
    expect(bilgi).toBeDefined();
    expect((ad.ad as Record<string, unknown>).videoAd).toBeUndefined();
    expect((ad.ad as Record<string, unknown>).videoResponsiveAd).toBeUndefined();
  });

  it('KRİTİK: v24’ten beri ZORUNLU üç alan da var', () => {
    /*
     * `logoImages` ve `videos` v23'te opsiyoneldi, v24'te zorunlu oldu. Eski
     * örneklere bakarak yazılan kod bugün reddediliyor.
     */
    expect(bilgi.businessName).toEqual({ text: 'Ege Birlik Yapı' });
    expect(bilgi.videos).toEqual([{ asset: VIDEO_ASSET }]);
    expect(bilgi.logoImages).toEqual([{ asset: LOGO_ASSET }]);
  });

  it('KRİTİK: başlıklar `AdTextAsset` sarmalayıcısında, düz string DEĞİL', () => {
    expect(bilgi.headlines).toEqual([{ text: 'Yazlığınız olsun' }]);
    expect(bilgi.descriptions).toEqual([{ text: 'Bankasız, kefilsiz, vade farksız taksit' }]);
    expect(bilgi.longHeadlines).toEqual([{ text: 'Hayalinizdeki yazlığa kavuşun' }]);
  });

  it('KRİTİK: HEDEF URL ad seviyesinde, reklam bilgisinin İÇİNDE DEĞİL', () => {
    expect((ad.ad as Record<string, unknown>).finalUrls).toEqual(['https://egebirlik.com']);
    expect(bilgi.finalUrls).toBeUndefined();
  });

  it('eylem çağrısı GÖNDERİLMİYOR — inline metin yazılamıyor', () => {
    /*
     * Alan yalnızca bir Asset kaynak adı taşıyor; resmî örnek kod da
     * göndermiyor ve Google kendisi seçiyor ("automated and required").
     */
    expect(bilgi.callToActions).toBeUndefined();
  });

  it('KRİTİK: reklam ENABLED açılıyor — yayın kararı kampanya seviyesinde', () => {
    // Reklam da duraklatılmış kalsaydı kampanya yayına alındığında hiçbir şey
    // yayınlanmazdı: hata yok, harcama yok, gösterim yok.
    expect(ad.status).toBe('ENABLED');
  });

  it('KRİTİK: metinler burada KIRPILMIYOR', () => {
    /*
     * Sınır tek yerde (Zod şeması) uygulanmalı; iki yerde kırpmak, iki
     * kuralın zamanla ayrışması demek. Ayrıca Google'ın gerçek sınırı
     * doğrulanmadı — kendi dokümanları çelişiyor.
     */
    const uzun = 'x'.repeat(200);
    const a2 = op(
      demandGenVideoAdBody({
        adGroupResource: ADGROUP,
        finalUrl: 'https://x.com',
        businessName: 'B',
        videoAssetResource: VIDEO_ASSET,
        logoAssetResource: LOGO_ASSET,
        headlines: [uzun],
        longHeadlines: ['y'],
        descriptions: ['z'],
      }),
    );
    const b2 = (a2.ad as Record<string, unknown>).demandGenVideoResponsiveAd as Record<string, unknown>;
    expect(b2.headlines).toEqual([{ text: uzun }]);
  });
});

describe('konum — konumsuz kampanya BÜTÜN ÜLKELERE açılıyor', () => {
  it('varsayılan Türkiye (2000 + ISO 792)', () => {
    expect(VARSAYILAN_KONUM).toBe('geoTargetConstants/2792');
  });

  it('her konum ayrı bir kampanya ölçütü', () => {
    const b = demandGenKonumBody({ campaignResource: CAMPAIGN, konumlar: [VARSAYILAN_KONUM, 'geoTargetConstants/1012782'] });
    expect(b.partialFailure).toBe(false);
    expect(b.operations.map((o) => o.create)).toEqual([
      { campaign: CAMPAIGN, location: { geoTargetConstant: VARSAYILAN_KONUM } },
      { campaign: CAMPAIGN, location: { geoTargetConstant: 'geoTargetConstants/1012782' } },
    ]);
  });

  it('KRİTİK: boş liste İSTEĞE ÇIKMADAN reddediliyor', () => {
    expect(() => demandGenKonumBody({ campaignResource: CAMPAIGN, konumlar: [] })).toThrow(/bütün ülkelere/);
  });
});

describe('yayına alma', () => {
  it('KRİTİK: yalnızca durum, maskeyle birlikte', () => {
    const b = kampanyayiYayinaAlBody(CAMPAIGN);
    expect(b.operations).toEqual([
      { update: { resourceName: CAMPAIGN, status: 'ENABLED' }, updateMask: 'status' },
    ]);
    expect(b.partialFailure).toBe(false);
  });
});
