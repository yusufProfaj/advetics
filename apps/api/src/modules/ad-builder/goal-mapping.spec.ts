import { describe, expect, it } from 'vitest';
import { matchRatio, RATIO_TOLERANCE } from '@advetics/shared';
import {
  campaignSpec,
  customizationRules,
  defaultTargeting,
  endTimeFor,
  labelFor,
  placementsFor,
  placementsFrom,
  resolveSpec,
  targetingFrom,
  totalCommitmentMicros,
} from './goal-mapping';
import { defaultsFromSpec } from './objective-matrix';

/**
 * Kampanya tipi → Meta eşlemesi.
 *
 * NEDEN BU TESTLER ÜRÜNÜN EN KRİTİKLERİ ARASINDA: kullanıcı bu ayarların
 * HİÇBİRİNİ görmüyor. Yanlış bir optimizasyon hedefi hata vermiyor — reklam
 * yayınlanıyor, yanlış kitleye gösteriliyor ve para harcanıyor. Kullanıcı
 * "reklam çalışmadı" diyor, sebebi hiçbir yerde yazmıyor.
 */

const PAGE = '1234567890';

describe('form kampanyası', () => {
  const spec = campaignSpec('form', PAGE);

  it('anlık form: ON_AD hedefi', () => {
    // Form Meta'nın İÇİNDE açılıyor, web sitesine gitmiyor. Web sitesi
    // olmayan müşteri için tek çalışan yol.
    expect(spec.objective).toBe('OUTCOME_LEADS');
    expect(spec.destinationType).toBe('ON_AD');
  });

  it('KRİTİK: LEAD_GENERATION optimizasyonu, LINK_CLICKS DEĞİL', () => {
    // LINK_CLICKS seçilseydi Meta forma tıklayan ama doldurmayan kitleyi
    // optimize ederdi: "300 tıklama, 4 form" tablosu.
    expect(spec.optimizationGoal).toBe('LEAD_GENERATION');
  });

  it('sayfa promoted_object olarak taşınıyor', () => {
    expect(spec.promotedObject).toEqual({ page_id: PAGE });
  });
});

describe('whatsapp kampanyası', () => {
  const spec = campaignSpec('whatsapp', PAGE);

  it('WHATSAPP hedefi ve doğru CTA', () => {
    expect(spec.destinationType).toBe('WHATSAPP');
    expect(spec.callToAction).toBe('WHATSAPP_MESSAGE');
  });

  it('KRİTİK: CONVERSATIONS optimizasyonu, LINK_CLICKS DEĞİL', () => {
    // Tıklayıp WhatsApp'ı kapatan değil, GERÇEKTEN yazan kişi optimize
    // ediliyor. Ajansın en çok kullanacağı tip ve fark büyük.
    expect(spec.optimizationGoal).toBe('CONVERSATIONS');
  });
});

describe('web sitesi kampanyası', () => {
  const spec = campaignSpec('website', PAGE);

  it('KRİTİK: LANDING_PAGE_VIEWS, LINK_CLICKS DEĞİL', () => {
    // LINK_CLICKS tıklamayı sayıyor, sayfanın açılmasını değil. Yavaş açılan
    // bir sitede tıklayanların yarısı sayfayı hiç görmeden vazgeçiyor.
    expect(spec.objective).toBe('OUTCOME_TRAFFIC');
    expect(spec.optimizationGoal).toBe('LANDING_PAGE_VIEWS');
  });

  it('OUTCOME_SALES KULLANILMIYOR', () => {
    // Satış hedefi pixel + tanımlı dönüşüm olayı istiyor; ikisi de bu üründe
    // yok. Olmayan bir olayı hedeflemek, kampanyanın hiç öğrenmemesi demek.
    expect(spec.objective).not.toBe('OUTCOME_SALES');
  });

  it('promoted_object YOK — trafik hedefi istemiyor', () => {
    expect(spec.promotedObject).toBeUndefined();
  });
});

describe('her tip için ortak garantiler', () => {
  it('üç tipin de açıklaması var ve reklam jargonu içermiyor', () => {
    for (const goal of ['form', 'whatsapp', 'website'] as const) {
      const spec = campaignSpec(goal, PAGE);
      expect(spec.explanation.length).toBeGreaterThan(30);
      // Açıklama kullanıcıya gösteriliyor; Meta terimleri sızmamalı.
      expect(spec.explanation).not.toMatch(/OUTCOME_|optimization|billing_event/i);
    }
  });

  it('faturalama her tipte IMPRESSIONS', () => {
    // Küçük hesaplarda Meta lead/konuşma başına faturalamayı desteklemiyor;
    // gösterim başına faturalama tek güvenli seçim.
    for (const goal of ['form', 'whatsapp', 'website'] as const) {
      expect(campaignSpec(goal, PAGE).billingEvent).toBe('IMPRESSIONS');
    }
  });
});

describe('hedefleme', () => {
  it('Türkiye ve 18+', () => {
    const t = defaultTargeting();
    expect(t.geo_locations).toEqual({ countries: ['TR'] });
    expect(t.age_min).toBe(18);
  });

  it('ÜST YAŞ SINIRI YOK', () => {
    // 65+ Meta'da tek kova; dışlamak satın alma gücü yüksek bir kitleyi
    // sebepsiz atmak olur.
    expect(defaultTargeting().age_max).toBeUndefined();
  });

  it('ilgi alanı daraltması YOK', () => {
    // Reklamcılık bilmeyen biri daraltmayı yanlış yapar ve kitleyi öldürür.
    expect(defaultTargeting().flexible_spec).toBeUndefined();
    expect(defaultTargeting().interests).toBeUndefined();
  });
});

describe('yerleşimler görsele göre', () => {
  it('yalnızca kare: akış, HİKÂYE YOK', () => {
    // Otomatik yerleşim dikey görsel yokken de Hikâyeler'de gösteriyor ve
    // kareyi oraya kırpıyor — metin kesiliyor, sonuç kötü görünüyor.
    const p = placementsFor(['square']);
    expect(p.facebook_positions).toEqual(['feed']);
    expect(p.instagram_positions).toEqual(['stream']);
  });

  it('dikey eklenince Hikâye ve Reels açılıyor', () => {
    const p = placementsFor(['square', 'vertical']);
    expect(p.instagram_positions).toContain('story');
    expect(p.instagram_positions).toContain('reels');
    expect(p.facebook_positions).toContain('story');
  });

  it('yatay eklenince sağ sütun açılıyor', () => {
    const p = placementsFor(['square', 'horizontal']);
    expect(p.facebook_positions).toContain('right_hand_column');
    // Sağ sütun Instagram'da yok.
    expect(p.instagram_positions).not.toContain('right_hand_column');
  });
});

describe('görsel özelleştirme kuralları', () => {
  it('KRİTİK: varlsayılan (kare) kuralı EN SONDA', () => {
    // Meta kuralları sırayla değerlendiriyor ve ilk eşleşen kazanıyor.
    // Varsayılanı başa koymak diğer kuralları işlevsiz bırakırdı: dikey
    // görsel yüklenmiş olmasına rağmen Hikâyeler'de kare gösterilirdi.
    const rules = customizationRules(['square', 'vertical', 'horizontal']);
    const last = rules[rules.length - 1] as { image_label: { name: string } };
    expect(last.image_label.name).toBe(labelFor('square'));
  });

  it('tek görselde tek kural', () => {
    const rules = customizationRules(['square']);
    expect(rules).toHaveLength(1);
  });

  it('her kuralın customization_spec’i var', () => {
    // Spec'siz bir kuralı Meta reddediyor ve hata mesajı hangi kuralın
    // sorunlu olduğunu söylemiyor.
    for (const rule of customizationRules(['square', 'vertical', 'horizontal'])) {
      expect(rule.customization_spec).toBeDefined();
      expect(rule.image_label).toBeDefined();
    }
  });

  it('dikey kuralı Hikâye ve Reels’i kapsıyor', () => {
    const rules = customizationRules(['square', 'vertical']);
    const vertical = rules.find(
      (r) => (r.image_label as { name: string }).name === labelFor('vertical'),
    ) as { customization_spec: Record<string, string[]> };
    expect(vertical.customization_spec.instagram_positions).toContain('reels');
  });
});

describe('oran tanıma', () => {
  it('tam oranlar', () => {
    expect(matchRatio(1080, 1080)).toBe('square');
    expect(matchRatio(1080, 1920)).toBe('vertical');
    expect(matchRatio(1200, 675)).toBe('horizontal');
  });

  it('TOLERANS: telefondan çekilmiş neredeyse-kare kabul ediliyor', () => {
    // Tam 1:1 dayatmak 1080×1077 bir görseli reddetmek olur ve kullanıcı
    // neyi yanlış yaptığını anlamaz.
    expect(matchRatio(1080, 1077)).toBe('square');
    expect(matchRatio(1080, 1150)).toBe('square');
  });

  it('hiçbirine uymayan oran null', () => {
    // 4:5 (Instagram portre) bilinçli olarak listede yok: kare zaten o
    // yerleşimi kapsıyor ve dördüncü bir yükleme alanı arayüzü karmaşıklaştırır.
    expect(matchRatio(1080, 1350)).toBeNull();
  });

  it('geçersiz boyut null', () => {
    expect(matchRatio(0, 100)).toBeNull();
    expect(matchRatio(-5, 100)).toBeNull();
  });

  it('tolerans sınırının hemen dışı reddediliyor', () => {
    const justOutside = Math.round(1080 / (1 + RATIO_TOLERANCE * 1.5));
    expect(matchRatio(1080, justOutside)).not.toBe('square');
  });
});

describe('süre ve taahhüt', () => {
  const NOW = new Date('2026-08-07T10:00:00Z');

  it('süreli kampanyanın bitişi hesaplanıyor', () => {
    expect(endTimeFor(7, NOW)?.toISOString()).toBe('2026-08-14T10:00:00.000Z');
  });

  it('SÜRESİZ kampanyada bitiş yok', () => {
    expect(endTimeFor(0, NOW)).toBeNull();
  });

  it('toplam taahhüt günlük × gün', () => {
    // Kullanıcının onaylayacağı sayı bu: "günde 200 ₺" değil "toplam 1.400 ₺".
    expect(totalCommitmentMicros(200_000_000n, 7)).toBe(1_400_000_000n);
  });

  it('SÜRESİZDE toplam null — uydurma sayı gösterilmiyor', () => {
    expect(totalCommitmentMicros(200_000_000n, 0)).toBeNull();
  });
});

// -----------------------------------------------------------------------------
// İKİ MOD
// -----------------------------------------------------------------------------

describe('resolveSpec — tek yayın yolu', () => {
  it('hızlı modda goal-mapping kararı geçerli', () => {
    const spec = resolveSpec({ goal: 'whatsapp', mode: 'simple', advanced: null }, 'page-1');
    expect(spec.optimizationGoal).toBe('CONVERSATIONS');
    expect(spec.destinationType).toBe('WHATSAPP');
  });

  it('mod gelişmiş ama ayar boşsa hızlı moda düşüyor', () => {
    // Veritabanı kısıtı bunu zaten engelliyor. Yine de çökmek yerine güvenli
    // varsayılana düşmek doğru: yayın anında `undefined.objective` okumak,
    // sebebi anlaşılmayan bir hataya dönerdi.
    const spec = resolveSpec({ goal: 'website', mode: 'advanced', advanced: null }, 'page-1');
    expect(spec.objective).toBe('OUTCOME_TRAFFIC');
  });

  it('gelişmiş modda kullanıcının seçimi geçiyor', () => {
    const advanced = defaultsFromSpec({
      objective: 'OUTCOME_ENGAGEMENT',
      optimizationGoal: 'POST_ENGAGEMENT',
      billingEvent: 'IMPRESSIONS',
    });
    const spec = resolveSpec({ goal: 'website', mode: 'advanced', advanced }, 'page-1');
    // `goal` alanı 'website' ama gelişmiş mod onu GÖRMEZDEN GELİYOR: hızlı
    // modun kararını taşıyor, gelişmiş modun değil.
    expect(spec.objective).toBe('OUTCOME_ENGAGEMENT');
  });

  it('piksel varsa promoted_object piksel taşıyor, sayfa DEĞİL', () => {
    // İkisini birden göndermek Meta tarafından reddediliyor.
    const advanced = {
      ...defaultsFromSpec({
        objective: 'OUTCOME_SALES',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        billingEvent: 'IMPRESSIONS',
      }),
      pixelId: '999',
      conversionEvent: 'PURCHASE',
    };
    const spec = resolveSpec({ goal: 'website', mode: 'advanced', advanced }, 'page-1');
    expect(spec.promotedObject).toEqual({ pixel_id: '999', custom_event_type: 'PURCHASE' });
  });

  it('lead hedefinde piksel yoksa sayfa kimliği gidiyor', () => {
    const advanced = defaultsFromSpec({
      objective: 'OUTCOME_LEADS',
      optimizationGoal: 'LEAD_GENERATION',
      billingEvent: 'IMPRESSIONS',
      destinationType: 'ON_AD',
    });
    const spec = resolveSpec({ goal: 'form', mode: 'advanced', advanced }, 'page-1');
    expect(spec.promotedObject).toEqual({ page_id: 'page-1' });
  });
});

describe('gelişmiş hedefleme', () => {
  const base = defaultsFromSpec({
    objective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LINK_CLICKS',
    billingEvent: 'IMPRESSIONS',
  }).targeting;

  it('65 üst yaşı GÖNDERİLMİYOR', () => {
    // Meta'da 65 "65 ve üzeri". Alanı göndermek Ads Manager'da "18-65"
    // yazması ve kullanıcının 66 yaşındakilerin dışlandığını sanması demek.
    expect(targetingFrom(base).age_max).toBeUndefined();
  });

  it('65 altı üst yaş gönderiliyor', () => {
    expect(targetingFrom({ ...base, ageMax: 44 }).age_max).toBe(44);
  });

  it('cinsiyet Meta kodlarına çevriliyor', () => {
    expect(targetingFrom({ ...base, genders: 'female' }).genders).toEqual([2]);
    expect(targetingFrom({ ...base, genders: 'male' }).genders).toEqual([1]);
    // 'all' hiç alan göndermiyor — boş dizi "hiçbir cinsiyet" demek olurdu.
    expect(targetingFrom(base).genders).toBeUndefined();
  });

  it('şehir seçilmemişse yalnızca ülke gidiyor', () => {
    expect(targetingFrom(base).geo_locations).toEqual({ countries: ['TR'] });
  });

  it('şehir seçilmişse Meta anahtar biçimine çevriliyor', () => {
    expect(targetingFrom({ ...base, cityKeys: ['12345'] }).geo_locations).toEqual({
      countries: ['TR'],
      cities: [{ key: '12345' }],
    });
  });
});

describe('gelişmiş yerleşim', () => {
  it('OTOMATİK yerleşimde hiçbir alan gönderilmiyor', () => {
    // Boş `publisher_platforms` göndermek "hiçbir platform" demek ve ad set
    // sessizce hiç dağıtım yapmaz. Alanı hiç göndermemek "hepsi" demek.
    expect(
      placementsFrom({
        mode: 'auto',
        platforms: ['facebook', 'instagram'],
        facebookPositions: [],
        instagramPositions: [],
      }),
    ).toEqual({});
  });

  it('elle yerleşimde seçilen konumlar gidiyor', () => {
    const out = placementsFrom({
      mode: 'manual',
      platforms: ['instagram'],
      facebookPositions: ['feed'],
      instagramPositions: ['reels'],
    });
    expect(out.publisher_platforms).toEqual(['instagram']);
    expect(out.instagram_positions).toEqual(['reels']);
    // Facebook seçili DEĞİL: konumları gönderilmiyor, yoksa Meta reddediyor.
    expect(out.facebook_positions).toBeUndefined();
  });
});
