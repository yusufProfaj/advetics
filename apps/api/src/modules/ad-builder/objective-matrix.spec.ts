import { describe, expect, it } from 'vitest';
import { OBJECTIVES, type AdvancedSettings } from '@advetics/shared';
import {
  OBJECTIVE_RULES,
  allowedBillingEvents,
  defaultsFromSpec,
  needsLeadForm,
  validateAdvanced,
  type ValidationContext,
} from './objective-matrix';

/**
 * Uyumluluk matrisi testleri.
 *
 * NEDEN BU TESTLER: geçersiz bir hedef/optimizasyon kombinasyonunun en kötü
 * sonucu Meta'nın REDDETMESİ değil, KABUL ETMESİ. Ad set aktif görünüyor,
 * harcama sıfır kalıyor, hata mesajı yok. Bu dosya o kombinasyonların
 * yayına çıkmasını engelleyen tek katman.
 */

function settings(over: Partial<AdvancedSettings> = {}): AdvancedSettings {
  return {
    ...defaultsFromSpec({
      objective: 'OUTCOME_TRAFFIC',
      optimizationGoal: 'LANDING_PAGE_VIEWS',
      billingEvent: 'IMPRESSIONS',
    }),
    ...over,
  };
}

function ctx(over: Partial<ValidationContext> = {}): ValidationContext {
  return {
    hasLinkUrl: true,
    hasLeadForm: false,
    ratios: ['square'],
    dailyBudget: 200,
    currency: 'TRY',
    ...over,
  };
}

describe('matris bütünlüğü', () => {
  it('her hedefin en az bir optimizasyonu var', () => {
    // Boş liste, o hedefin arayüzde seçilebilir ama hiçbir optimizasyonun
    // geçerli olmadığı bir çıkmaz olması demek.
    for (const o of OBJECTIVES) {
      expect(OBJECTIVE_RULES[o].optimizationGoals.length).toBeGreaterThan(0);
    }
  });

  it('varsayılanlar kendi doğrulamasından geçiyor', () => {
    // Hızlı moddan gelişmişe geçen kullanıcı ilk saniyede hata görmemeli.
    const v = validateAdvanced(settings(), ctx());
    expect(v.blockers).toEqual([]);
  });

  it('üç hızlı mod eşlemesi de matriste geçerli', () => {
    // goal-mapping.ts'in ürettiği spec'ler gelişmiş modda AÇILABİLMELİ.
    // Aksi hâlde kendi ürettiğimiz taslağı kendi doğrulamamız reddederdi.
    const cases: Array<[string, string, string | undefined]> = [
      ['OUTCOME_LEADS', 'LEAD_GENERATION', 'ON_AD'],
      ['OUTCOME_LEADS', 'CONVERSATIONS', 'WHATSAPP'],
      ['OUTCOME_TRAFFIC', 'LANDING_PAGE_VIEWS', undefined],
    ];
    for (const [objective, goal, dest] of cases) {
      const v = validateAdvanced(
        settings(
          defaultsFromSpec({
            objective,
            optimizationGoal: goal,
            billingEvent: 'IMPRESSIONS',
            destinationType: dest,
          }),
        ),
        ctx({ hasLeadForm: true }),
      );
      expect(v.blockers, `${objective} + ${goal}`).toEqual([]);
    }
  });
});

describe('yapısal uyumsuzluk — SESSİZ HATA', () => {
  it('bilinirlik hedefinde form optimizasyonu ENGELLENİYOR', () => {
    // Meta bunu kabul edebiliyor ve reklam hiç gösterilmiyor.
    const v = validateAdvanced(
      settings({ objective: 'OUTCOME_AWARENESS', optimizationGoal: 'LEAD_GENERATION' }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('optimizationGoal');
    expect(v.blockers[0]?.message).toContain('hiç gösterilmiyor');
  });

  it('trafik hedefinde mesaj optimizasyonu engelleniyor', () => {
    const v = validateAdvanced(
      settings({ objective: 'OUTCOME_TRAFFIC', optimizationGoal: 'CONVERSATIONS' }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('optimizationGoal');
  });

  it('bilinirlik hedefinde varış tipi engelleniyor', () => {
    const v = validateAdvanced(
      settings({
        objective: 'OUTCOME_AWARENESS',
        optimizationGoal: 'REACH',
        destinationType: 'WHATSAPP',
      }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('destinationType');
  });
});

describe('faturalama olayı', () => {
  it('varsayılan olarak yalnızca IMPRESSIONS', () => {
    expect(allowedBillingEvents('LEAD_GENERATION')).toEqual(['IMPRESSIONS']);
  });

  it('tıklama optimizasyonunda tıklama faturalaması da geçerli', () => {
    expect(allowedBillingEvents('LINK_CLICKS')).toContain('LINK_CLICKS');
  });

  it('uyumsuz faturalama engelleniyor', () => {
    const v = validateAdvanced(
      settings({ optimizationGoal: 'LANDING_PAGE_VIEWS', billingEvent: 'LINK_CLICKS' }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('billingEvent');
  });
});

describe('eksik ön koşullar', () => {
  it('pikselsiz dönüşüm optimizasyonu ENGELLENİYOR', () => {
    // Pikselsiz kampanya hiç öğrenmiyor: bütçe harcanır, sonuç gelmez.
    const v = validateAdvanced(
      settings({ objective: 'OUTCOME_SALES', optimizationGoal: 'OFFSITE_CONVERSIONS' }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('pixelId');
  });

  it('piksel var ama olay yoksa engelleniyor', () => {
    const v = validateAdvanced(
      settings({
        objective: 'OUTCOME_SALES',
        optimizationGoal: 'OFFSITE_CONVERSIONS',
        pixelId: '123',
      }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('conversionEvent');
  });

  it('formsuz anlık form optimizasyonu engelleniyor', () => {
    const v = validateAdvanced(
      settings({
        objective: 'OUTCOME_LEADS',
        optimizationGoal: 'LEAD_GENERATION',
        destinationType: 'ON_AD',
      }),
      ctx({ hasLeadForm: false }),
    );
    expect(v.blockers.map((b) => b.field)).toContain('leadForm');
  });

  it('WhatsApp varışında form aranmıyor', () => {
    // needsLeadForm yalnızca ON_AD ile birlikte doğru olmalı; aksi hâlde
    // WhatsApp kampanyası formsuz yayınlanamazdı.
    expect(
      needsLeadForm({ optimizationGoal: 'CONVERSATIONS', destinationType: 'WHATSAPP' }),
    ).toBe(false);
  });

  it('adres olmadan web sitesi varışı engelleniyor', () => {
    const v = validateAdvanced(
      settings({ destinationType: 'WEBSITE' }),
      ctx({ hasLinkUrl: false }),
    );
    expect(v.blockers.map((b) => b.field)).toContain('linkUrl');
  });
});

describe('bütçe ve takvim', () => {
  it('bitiş tarihsiz toplam bütçe ENGELLENİYOR', () => {
    // Meta toplam bütçeyi süreye bölüyor; süre yoksa istek reddediliyor.
    const v = validateAdvanced(settings({ budgetMode: 'lifetime' }), ctx());
    expect(v.blockers.map((b) => b.field)).toContain('endAt');
  });

  it('bitiş tarihli toplam bütçe geçiyor', () => {
    const v = validateAdvanced(
      settings({ budgetMode: 'lifetime', endAt: '2026-09-01T00:00' }),
      ctx(),
    );
    expect(v.blockers).toEqual([]);
  });

  it('bitiş başlangıçtan önce olamaz', () => {
    const v = validateAdvanced(
      settings({ startAt: '2026-09-10T00:00', endAt: '2026-09-01T00:00' }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('endAt');
  });
});

describe('teklif stratejisi', () => {
  it('tavan stratejisinde tutar zorunlu', () => {
    const v = validateAdvanced(settings({ bidStrategy: 'COST_CAP' }), ctx());
    expect(v.blockers.map((b) => b.field)).toContain('bidAmount');
  });

  it('bütçenin yarısından büyük tavan UYARIYOR ama engellemiyor', () => {
    // Aritmetik: tavan bütçenin yarısıysa günde en fazla iki sonuç alınır ve
    // öğrenme aşaması (haftada ~50 sonuç) hiç tamamlanmaz.
    const v = validateAdvanced(
      settings({ bidStrategy: 'COST_CAP', bidAmount: '150' }),
      ctx({ dailyBudget: 200 }),
    );
    expect(v.blockers).toEqual([]);
    expect(v.warnings.map((w) => w.field)).toContain('bidAmount');
  });

  it('makul tavan uyarı üretmiyor', () => {
    const v = validateAdvanced(
      settings({ bidStrategy: 'COST_CAP', bidAmount: '20' }),
      ctx({ dailyBudget: 200 }),
    );
    expect(v.warnings.map((w) => w.field)).not.toContain('bidAmount');
  });

  it('teklif tavanı stratejisi dağıtım riskini yazıyor', () => {
    const v = validateAdvanced(
      settings({ bidStrategy: 'LOWEST_COST_WITH_BID_CAP', bidAmount: '10' }),
      ctx(),
    );
    expect(v.warnings.map((w) => w.message).join(' ')).toContain('hiç dağıtım yapmaz');
  });

  it('virgüllü tutar okunuyor', () => {
    // Türkçe klavyede ondalık ayırıcı virgül; nokta beklemek sessizce NaN
    // üretir ve uyarı hiç çıkmazdı.
    const v = validateAdvanced(
      settings({ bidStrategy: 'COST_CAP', bidAmount: '150,50' }),
      ctx({ dailyBudget: 200 }),
    );
    expect(v.warnings.map((w) => w.field)).toContain('bidAmount');
  });
});

describe('hedefleme', () => {
  it('ters yaş aralığı engelleniyor', () => {
    const v = validateAdvanced(
      settings({ targeting: { ...settings().targeting, ageMin: 45, ageMax: 25 } }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('ageMax');
  });

  it('dar yaş aralığı uyarıyor', () => {
    const v = validateAdvanced(
      settings({ targeting: { ...settings().targeting, ageMin: 25, ageMax: 30 } }),
      ctx(),
    );
    expect(v.warnings.map((w) => w.field)).toContain('ageMax');
  });

  it('cinsiyet daraltması uyarıyor ama engellemiyor', () => {
    const v = validateAdvanced(
      settings({ targeting: { ...settings().targeting, genders: 'female' } }),
      ctx(),
    );
    expect(v.blockers).toEqual([]);
    expect(v.warnings.map((w) => w.field)).toContain('genders');
  });
});

describe('yerleşim', () => {
  it('elle yerleşimde boş seçim ENGELLENİYOR', () => {
    // Yerleşimsiz ad set dağıtım yapmıyor ve bunu da sessizce yapıyor.
    const v = validateAdvanced(
      settings({
        placement: {
          mode: 'manual',
          platforms: ['facebook'],
          facebookPositions: [],
          instagramPositions: [],
        },
      }),
      ctx(),
    );
    expect(v.blockers.map((b) => b.field)).toContain('placement');
  });

  it('dikey görsel olmadan Hikâye seçimi uyarıyor', () => {
    const v = validateAdvanced(
      settings({
        placement: {
          mode: 'manual',
          platforms: ['instagram'],
          facebookPositions: [],
          instagramPositions: ['stream', 'story', 'reels'],
        },
      }),
      ctx({ ratios: ['square'] }),
    );
    expect(v.warnings.map((w) => w.message).join(' ')).toContain('dikey görsel');
  });

  it('dikey görsel varsa Hikâye uyarısı çıkmıyor', () => {
    const v = validateAdvanced(
      settings({
        placement: {
          mode: 'manual',
          platforms: ['instagram'],
          facebookPositions: [],
          instagramPositions: ['stream', 'story', 'reels'],
        },
      }),
      ctx({ ratios: ['square', 'vertical'] }),
    );
    expect(v.warnings.map((w) => w.message).join(' ')).not.toContain('dikey görsel yüklenmedi');
  });

  it('otomatik yerleşimde yerleşim uyarısı yok', () => {
    const v = validateAdvanced(settings(), ctx());
    expect(v.warnings.map((w) => w.field)).not.toContain('placement');
  });
});
