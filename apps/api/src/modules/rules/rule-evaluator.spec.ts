import { describe, expect, it } from 'vitest';
import type { RuleCondition, RuleGuard } from '@advetics/shared';
import {
  evaluate,
  metricValue,
  nextBudgetMicros,
  widestWindow,
  type EntitySnapshot,
  type EvaluationContext,
  type WindowTotals,
} from './rule-evaluator';

/**
 * Kural değerlendirme motoru.
 *
 * NEDEN BU TESTLER DİĞERLERİNDEN ÖNEMLİ: buradaki bir hata veriyi yanlış
 * göstermiyor, müşterinin kampanyasını yanlış durduruyor. Rapor hatası
 * düzeltilebilir; durdurulan kampanyanın kaçırdığı satış geri gelmez.
 *
 * En kritik iki iddia:
 *   1. Türetilmiş metrikler PENCERE TOPLAMINDAN hesaplanıyor, günlük
 *      değerlerin ortalamasından değil.
 *   2. Harcama var + dönüşüm yok = EBM SONSUZ, "tanımsız" değil. Aksi hâlde
 *      kural, durdurması gereken en kötü varlığı sessizce atlar.
 */

const NOW = new Date('2026-08-07T10:00:00Z');

function totals(over: Partial<WindowTotals> = {}): WindowTotals {
  return {
    spendMicros: 0n,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    conversionValueMicros: 0n,
    reach: 0,
    days: 7,
    ...over,
  };
}

function guard(over: Partial<RuleGuard> = {}): RuleGuard {
  return { minImpressions: 0, minClicks: 0, minSpend: 0, minDaysWithData: 0, ...over };
}

function snapshot(over: Partial<EntitySnapshot> = {}): EntitySnapshot {
  return {
    entityId: 'e1',
    entityName: 'Test Kampanya',
    entityExternalId: '123',
    status: 'active',
    budgetMode: 'daily',
    budgetAmountMicros: 100_000_000n,
    currency: 'TRY',
    windows: { last_7d: totals() },
    budgetSpentRatio: null,
    newestDataAt: new Date('2026-08-06T20:00:00Z'),
    lastActionAt: null,
    ...over,
  };
}

function ctx(over: Partial<EvaluationContext> = {}): EvaluationContext {
  return {
    conditions: [{ metric: 'cpa', operator: 'gt', value: 250, window: 'last_7d' }],
    combinator: 'and',
    guard: guard(),
    cooldownMinutes: 0,
    maxDataAgeHours: 36,
    actionType: 'pause',
    now: NOW,
    ...over,
  };
}

// -----------------------------------------------------------------------------
// Metrik hesabı
// -----------------------------------------------------------------------------

describe('metricValue', () => {
  it('EBM pencere TOPLAMINDAN hesaplanıyor', () => {
    // 3.000 ₺ / 10 dönüşüm = 300 ₺. Günlük EBM'lerin ortalaması olsaydı
    // dönüşümsüz günler yüzünden bambaşka bir sayı çıkardı.
    const v = metricValue('cpa', totals({ spendMicros: 3_000_000_000n, conversions: 10 }), null);
    expect(v).toBe(300);
  });

  it('KRİTİK: harcama var + dönüşüm yok = SONSUZ, tanımsız değil', () => {
    // 5.000 ₺ harcayıp hiç dönüşüm almamış reklam, "EBM 250'yi aşarsa
    // duraklat" kuralının durdurmak isteyeceği EN KÖTÜ varlık. `null`
    // döndürüp atlamak kuralı tam da işini yapması gereken yerde sessizce
    // devre dışı bırakırdı.
    const v = metricValue('cpa', totals({ spendMicros: 5_000_000_000n, conversions: 0 }), null);
    expect(v).toBe(Number.POSITIVE_INFINITY);
  });

  it('harcama da yoksa EBM gerçekten TANIMSIZ', () => {
    // Hiçbir şey olmamış — yorum yapılacak veri yok.
    expect(metricValue('cpa', totals(), null)).toBeNull();
  });

  it('TBM aynı kuralı izliyor', () => {
    expect(metricValue('cpc', totals({ spendMicros: 1_000_000_000n, clicks: 250 }), null)).toBe(4);
    expect(
      metricValue('cpc', totals({ spendMicros: 1_000_000_000n, clicks: 0 }), null),
    ).toBe(Number.POSITIVE_INFINITY);
  });

  it('ROAS sıfır TANIMLI bir değer — harcama var, getiri yok', () => {
    // EBM'nin tersi durum: burada payda harcama. Sıfır getiri gerçek bir
    // ölçüm, tanımsızlık değil.
    expect(
      metricValue('roas', totals({ spendMicros: 1_000_000_000n, conversionValueMicros: 0n }), null),
    ).toBe(0);
    // Harcama yoksa tanımsız.
    expect(metricValue('roas', totals({ conversionValueMicros: 500_000_000n }), null)).toBeNull();
  });

  it('TO yüzde olarak dönüyor', () => {
    // Eşik de yüzde giriliyor; ikisi aynı ölçekte olmalı.
    expect(metricValue('ctr', totals({ impressions: 10_000, clicks: 150 }), null)).toBeCloseTo(1.5, 6);
    expect(metricValue('ctr', totals(), null)).toBeNull();
  });

  it('frekans gösterim ÷ erişim', () => {
    expect(metricValue('frequency', totals({ impressions: 30_000, reach: 10_000 }), null)).toBe(3);
    expect(metricValue('frequency', totals({ impressions: 30_000, reach: 0 }), null)).toBeNull();
  });

  it('bütçe tüketimi yüzde olarak, tanımsızsa null', () => {
    expect(metricValue('budget_spent_ratio', totals(), 0.9)).toBeCloseTo(90, 6);
    expect(metricValue('budget_spent_ratio', totals(), null)).toBeNull();
  });

  it('harcama micros DEĞİL para biriminde karşılaştırılıyor', () => {
    // Eşik "1000 ₺" olarak giriliyor; metrik micros kalsaydı 1.000.000.000
    // ile 1000 karşılaştırılır ve her kural tetiklenirdi.
    expect(metricValue('spend', totals({ spendMicros: 1_500_000_000n }), null)).toBe(1500);
  });
});

describe('widestWindow', () => {
  it('en geniş pencereyi seçiyor', () => {
    const conds: RuleCondition[] = [
      { metric: 'cpa', operator: 'gt', value: 1, window: 'last_3d' },
      { metric: 'spend', operator: 'gt', value: 1, window: 'last_14d' },
      { metric: 'ctr', operator: 'lt', value: 1, window: 'last_1d' },
    ];
    expect(widestWindow(conds)).toBe('last_14d');
  });
});

// -----------------------------------------------------------------------------
// Koşul birleştirme
// -----------------------------------------------------------------------------

describe('koşullar', () => {
  it('eşleşen tek koşul aksiyona uygun', () => {
    const r = evaluate(
      snapshot({ windows: { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) } }),
      ctx(),
    );
    expect(r.matched).toBe(true);
    expect(r.outcome).toBe('eligible');
    expect(r.reason).toContain('EBM 300');
  });

  it('eşleşmeyen koşulda KAYIT YAZILMIYOR', () => {
    // 400 reklamlık bir hesapta her turda 400 satır yazmak, gerçek kararları
    // gürültüde boğardı.
    const r = evaluate(
      snapshot({ windows: { last_7d: totals({ spendMicros: 1_000_000_000n, conversions: 10 }) } }),
      ctx(),
    );
    expect(r.matched).toBe(false);
    expect(r.outcome).toBeNull();
  });

  it('AND: hepsi sağlanmalı', () => {
    const conds: RuleCondition[] = [
      { metric: 'cpa', operator: 'gt', value: 250, window: 'last_7d' },
      { metric: 'spend', operator: 'gt', value: 5000, window: 'last_7d' },
    ];
    const w = { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) };
    // EBM 300 > 250 ✓, harcama 3000 > 5000 ✗
    expect(evaluate(snapshot({ windows: w }), ctx({ conditions: conds })).matched).toBe(false);
  });

  it('OR: biri yeterli', () => {
    const conds: RuleCondition[] = [
      { metric: 'cpa', operator: 'gt', value: 250, window: 'last_7d' },
      { metric: 'spend', operator: 'gt', value: 5000, window: 'last_7d' },
    ];
    // EBM 300 > 250 ✓, harcama 3000 > 5000 ✗ — biri yeterli.
    const w = { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) };
    const r = evaluate(snapshot({ windows: w }), ctx({ conditions: conds, combinator: 'or' }));
    expect(r.matched).toBe(true);
    // GEREKÇE YALNIZCA SAĞLANAN koşulu anıyor. Sağlanmayan koşulu da yazmak
    // ajansa "harcama 5000'i aştı" dedirtirdi — aşmadı, kural OR olduğu için
    // tetiklendi.
    expect(r.reason).toBe('EBM 300 > 250 (son 7 gün)');
  });

  it('OR: İKİSİ de sağlanırsa gerekçe ikisini de anıyor', () => {
    const conds: RuleCondition[] = [
      { metric: 'cpa', operator: 'gt', value: 250, window: 'last_7d' },
      { metric: 'spend', operator: 'gt', value: 1000, window: 'last_7d' },
    ];
    const w = { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) };
    const r = evaluate(snapshot({ windows: w }), ctx({ conditions: conds, combinator: 'or' }));
    expect(r.reason).toContain(' veya ');
    expect(r.reason).toContain('Harcama 3.000');
  });

  it('PENCERE VERİSİ YOKSA koşul sağlanmıyor', () => {
    // Sıfır toplamlarla devam etmek "harcama 0" demek olurdu ve "harcama
    // 100'ün altındaysa" gibi kurallar hiç yayında olmamış varlıkları
    // yanlışlıkla eşleştirirdi.
    const r = evaluate(
      snapshot({ windows: {} }),
      ctx({ conditions: [{ metric: 'spend', operator: 'lt', value: 100, window: 'last_7d' }] }),
    );
    expect(r.matched).toBe(false);
  });

  it('sonsuz EBM "düşükse" kuralıyla EŞLEŞMİYOR', () => {
    // "EBM düşükse bütçeyi artır" kuralı, hiç dönüşüm almamış bir reklamı
    // ödüllendirmemeli.
    const r = evaluate(
      snapshot({ windows: { last_7d: totals({ spendMicros: 5_000_000_000n, conversions: 0 }) } }),
      ctx({ conditions: [{ metric: 'cpa', operator: 'lt', value: 250, window: 'last_7d' }] }),
    );
    expect(r.matched).toBe(false);
  });
});

// -----------------------------------------------------------------------------
// Kapılar
// -----------------------------------------------------------------------------

describe('bayat veri', () => {
  const matching = { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) };

  it('sınırı aşan veriyle AKSİYON ALINMIYOR', () => {
    // Senkronizasyon worker'ı sessizce durduğunda kural motoru dünkü veriyle
    // karar vermeye devam ederdi. Bu projede worker'ın hiç log üretmeden
    // durduğu bir kez yaşandı.
    const r = evaluate(
      snapshot({ windows: matching, newestDataAt: new Date('2026-08-04T10:00:00Z') }),
      ctx({ maxDataAgeHours: 36 }),
    );
    expect(r.matched).toBe(true);
    expect(r.outcome).toBe('skipped_stale_data');
    expect(r.reason).toContain('saat eski');
  });

  it('hiç veri yoksa da atlanıyor', () => {
    const r = evaluate(snapshot({ windows: matching, newestDataAt: null }), ctx());
    expect(r.outcome).toBe('skipped_stale_data');
  });

  it('sınırın altındaki veri geçiyor', () => {
    const r = evaluate(
      snapshot({ windows: matching, newestDataAt: new Date('2026-08-06T20:00:00Z') }),
      ctx({ maxDataAgeHours: 36 }),
    );
    expect(r.outcome).toBe('eligible');
  });
});

describe('minimum örneklem', () => {
  it('KRİTİK: 3 tıklamalı reklam durdurulmuyor', () => {
    // Bu koruma olmadan kural motoru sistematik olarak YENİ reklamları
    // öldürür ve ajans bunu asla fark etmez — durdurulan reklamın ne
    // yapacağını göremezsiniz.
    const r = evaluate(
      snapshot({
        windows: { last_7d: totals({ spendMicros: 50_000_000n, clicks: 3, impressions: 120 }) },
      }),
      ctx({ guard: guard({ minImpressions: 1000, minClicks: 20 }) }),
    );
    expect(r.matched).toBe(true); // EBM sonsuz, koşul sağlanıyor
    expect(r.outcome).toBe('skipped_guard');
    expect(r.reason).toContain('Örneklem yetersiz');
  });

  it('EN GENİŞ pencereye uygulanıyor', () => {
    // 1 günlük pencerede az veri olması, 30 günlük bir kararı engellememeli.
    const conds: RuleCondition[] = [
      { metric: 'cpa', operator: 'gt', value: 250, window: 'last_1d' },
      { metric: 'spend', operator: 'gt', value: 100, window: 'last_30d' },
    ];
    const r = evaluate(
      snapshot({
        windows: {
          last_1d: totals({ spendMicros: 100_000_000n, conversions: 0, impressions: 50, clicks: 2 }),
          last_30d: totals({ spendMicros: 9_000_000_000n, impressions: 500_000, clicks: 9000 }),
        },
      }),
      ctx({ conditions: conds, guard: guard({ minImpressions: 1000, minClicks: 20 }) }),
    );
    expect(r.outcome).toBe('eligible');
  });

  it('asgari harcama eşiği', () => {
    const r = evaluate(
      snapshot({
        windows: {
          last_7d: totals({ spendMicros: 50_000_000n, conversions: 0, impressions: 5000, clicks: 100 }),
        },
      }),
      ctx({ guard: guard({ minSpend: 500 }) }),
    );
    expect(r.outcome).toBe('skipped_guard');
    expect(r.reason).toContain('Harcama yetersiz');
  });

  it('asgari VERİLİ GÜN eşiği', () => {
    // Fenbay hesaplarında yaşanan durumun kural motorundaki karşılığı:
    // 7 günlük pencerede tek gün veri varsa o gün 7 günü temsil etmiyor.
    const r = evaluate(
      snapshot({
        windows: {
          last_7d: totals({
            spendMicros: 3_000_000_000n,
            conversions: 0,
            impressions: 50_000,
            clicks: 900,
            days: 1,
          }),
        },
      }),
      ctx({ guard: guard({ minDaysWithData: 4 }) }),
    );
    expect(r.outcome).toBe('skipped_guard');
    expect(r.reason).toContain('1 gün veri');
  });
});

describe('zaten bu durumda', () => {
  const matching = { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) };

  it('duraklatılmışı duraklatmıyor', () => {
    const r = evaluate(snapshot({ windows: matching, status: 'paused' }), ctx({ actionType: 'pause' }));
    expect(r.outcome).toBe('skipped_noop');
  });

  it('yayındakini başlatmıyor', () => {
    const r = evaluate(snapshot({ windows: matching, status: 'active' }), ctx({ actionType: 'resume' }));
    expect(r.outcome).toBe('skipped_noop');
  });

  it('CBO varlığında bütçe değiştirmiyor', () => {
    // Bütçesi üst seviyede tanımlı bir varlığın kendi bütçesi yok. Platform
    // isteği reddederdi ve HATA olarak kaydedilirdi — oysa bu bir hata değil,
    // yapılandırma gerçeği.
    const r = evaluate(
      snapshot({ windows: matching, budgetMode: 'none', budgetAmountMicros: null }),
      ctx({ actionType: 'adjust_budget' }),
    );
    expect(r.outcome).toBe('skipped_noop');
    expect(r.reason).toContain('CBO');
  });
});

describe('bekleme süresi', () => {
  const matching = { last_7d: totals({ spendMicros: 3_000_000_000n, conversions: 10 }) };

  it('süre dolmadan İKİNCİ aksiyon alınmıyor', () => {
    // Salınım engeli: Meta, açılıp kapatılan bir reklamı öğrenme aşamasına
    // geri atıyor ve performans KALICI olarak bozuluyor.
    const r = evaluate(
      snapshot({ windows: matching, lastActionAt: new Date('2026-08-07T02:00:00Z') }),
      ctx({ cooldownMinutes: 1440 }),
    );
    expect(r.outcome).toBe('skipped_cooldown');
    expect(r.reason).toContain('dk kaldı');
  });

  it('süre dolunca aksiyon alınabiliyor', () => {
    const r = evaluate(
      snapshot({ windows: matching, lastActionAt: new Date('2026-08-05T02:00:00Z') }),
      ctx({ cooldownMinutes: 1440 }),
    );
    expect(r.outcome).toBe('eligible');
  });

  it('bekleme 0 ise kontrol edilmiyor', () => {
    const r = evaluate(
      snapshot({ windows: matching, lastActionAt: new Date('2026-08-07T09:59:00Z') }),
      ctx({ cooldownMinutes: 0 }),
    );
    expect(r.outcome).toBe('eligible');
  });
});

describe('bütçe koşulu', () => {
  it('bütçe tanımsızsa AYRICA bildiriliyor', () => {
    // "Bütçenin %90'ı bittiyse durdur" kuralı bütçe olmadığı için hiç
    // çalışmıyorsa ajans bunu bilmeli — sessizce eşleşmemek, çalıştığı
    // sanılan bir koruma bırakırdı.
    const r = evaluate(
      snapshot({ budgetSpentRatio: null }),
      ctx({
        conditions: [{ metric: 'budget_spent_ratio', operator: 'gte', value: 90, window: 'last_7d' }],
      }),
    );
    expect(r.matched).toBe(false);
    expect(r.outcome).toBe('skipped_no_budget');
  });

  it('bütçe tanımlıysa normal değerlendiriliyor', () => {
    const r = evaluate(
      snapshot({ budgetSpentRatio: 0.95 }),
      ctx({
        conditions: [{ metric: 'budget_spent_ratio', operator: 'gte', value: 90, window: 'last_7d' }],
      }),
    );
    expect(r.outcome).toBe('eligible');
  });
});

// -----------------------------------------------------------------------------
// Bütçe hesabı
// -----------------------------------------------------------------------------

describe('nextBudgetMicros', () => {
  it('yüzde artış', () => {
    expect(nextBudgetMicros(100_000_000n, 20, {})).toBe(120_000_000n);
  });

  it('yüzde azalış', () => {
    expect(nextBudgetMicros(100_000_000n, -30, {})).toBe(70_000_000n);
  });

  it('üst sınıra KIRPILIYOR, iptal edilmiyor', () => {
    // "%20 artır, en fazla 500 ₺" diyen kullanıcı 480'de duran bir bütçenin
    // 500'e çıkmasını istiyor, artışın tamamen iptal edilmesini değil.
    expect(nextBudgetMicros(480_000_000n, 20, { maxBudget: 500 })).toBe(500_000_000n);
  });

  it('alt sınıra kırpılıyor', () => {
    expect(nextBudgetMicros(100_000_000n, -50, { minBudget: 80 })).toBe(80_000_000n);
  });

  it('sonuç MEVCUTLA AYNIYSA null — boş API çağrısı yok', () => {
    // Tavana dayanmış bir bütçeye her turda aynı değeri yazmak kota harcaması
    // ve gereksiz platform yazması olurdu.
    expect(nextBudgetMicros(500_000_000n, 20, { maxBudget: 500 })).toBeNull();
  });

  it('sıfıra düşen bütçe UYGULANMIYOR', () => {
    // Sıfır bütçe kampanyayı fiilen durdurur — "azalt" kuralının kampanyayı
    // kapatması beklenmedik bir yan etki olurdu.
    expect(nextBudgetMicros(1_000_000n, -80, { minBudget: undefined })).not.toBeNull();
    expect(nextBudgetMicros(1n, -80, {})).toBeNull();
  });

  it('BÜYÜK bütçelerde kuruş kaymıyor', () => {
    // `Number`a çevirip geri dönmek 2^53 sınırına yaklaşan tutarlarda
    // hassasiyet kaybediyor.
    expect(nextBudgetMicros(999_999_999_000_000n, 10, {})).toBe(1_099_999_998_900_000n);
  });

  it('küsuratlı yüzde tam sayı aritmetiğinde çözülüyor', () => {
    expect(nextBudgetMicros(100_000_000n, 12.5, {})).toBe(112_500_000n);
  });
});
