import { describe, expect, it } from 'vitest';
import type { BoostRequest } from '../provider.types';
import { buildBoostAdSetParams, DEFAULT_BOOST_TARGETING } from './meta.provider';

/**
 * Boost ad set gövdesi — bütçe kipi, hedefleme ve özel kategori kısıtı.
 *
 * NEDEN AYRI TEST: burada üretilen üç değerin de hatası SESSİZ. Meta üçünü de
 * kabul eder ve hiçbir uyarı üretmez:
 *
 *   · Yanlış bütçe alanı → beklenenin katlarını harcar. 300 TL'lik toplam,
 *     günlük 300 TL olarak beş gün çalışırsa 1.500 TL eder.
 *   · Yanlış hedefleme → panelde "İzmir" yazarken Türkiye geneline gösterir.
 *   · Eksik `end_time` → "3 günlük boost" süresiz çalışan bir kampanya olur.
 *
 * Üçü de ancak fatura geldiğinde fark edilir.
 */

const NOW = new Date('2026-08-16T12:00:00.000Z');

function req(over: Partial<BoostRequest> = {}): BoostRequest {
  return {
    adAccountExternalId: '123',
    source: { surface: 'facebook_page', pageExternalId: 'page-1', postExternalId: 'post-1' },
    budget: { mode: 'daily', dailyMicros: 100_000_000n },
    durationDays: 3,
    objective: 'OUTCOME_ENGAGEMENT',
    currency: 'TRY',
    name: 'Boost',
    ...over,
  };
}

describe('bütçe kipi', () => {
  it('GÜNLÜK kip `daily_budget` gönderiyor', () => {
    const p = buildBoostAdSetParams(req(), 'c-1', NOW);
    // 100 ₺ = 100.000.000 micros = 10.000 kuruş.
    expect(p.daily_budget).toBe('10000');
    expect(p.lifetime_budget).toBeUndefined();
  });

  it('TOPLAM kip `lifetime_budget` gönderiyor', () => {
    const p = buildBoostAdSetParams(
      req({ budget: { mode: 'lifetime', totalMicros: 300_000_000n } }),
      'c-1',
      NOW,
    );
    expect(p.lifetime_budget).toBe('30000');
    expect(p.daily_budget).toBeUndefined();
  });

  it('KRİTİK: iki bütçe alanı ASLA birlikte gitmiyor', () => {
    // Meta ikisini birden alırsa hangisini uygulayacağı bizim kararımız
    // olmaktan çıkıyor. Ayrık birleşim tipi bunu zaten imkânsız kılıyor;
    // test kipi ekleyen bir değişikliğin bunu bozmadığını kilitliyor.
    for (const budget of [
      { mode: 'daily', dailyMicros: 100_000_000n },
      { mode: 'lifetime', totalMicros: 300_000_000n },
    ] as const) {
      const p = buildBoostAdSetParams(req({ budget }), 'c-1', NOW);
      expect('daily_budget' in p && 'lifetime_budget' in p).toBe(false);
    }
  });

  it('TOPLAM kipte `start_time` de gönderiliyor', () => {
    // Meta parayı bir aralığa bölüyor; aralığın başlangıcını söylememek
    // kararı platformun varsayılanına bırakmak olur.
    const p = buildBoostAdSetParams(
      req({ budget: { mode: 'lifetime', totalMicros: 300_000_000n } }),
      'c-1',
      NOW,
    );
    expect(p.start_time).toBe('2026-08-16T12:00:00.000Z');
  });

  it('GÜNLÜK kipte `start_time` GÖNDERİLMİYOR', () => {
    // Günlük bütçede başlangıç zamanı gerekmiyor ve göndermek, boost'un
    // hemen başlamamasına yol açabilecek gereksiz bir kısıt eklemek olurdu.
    expect(buildBoostAdSetParams(req(), 'c-1', NOW).start_time).toBeUndefined();
  });

  it('KÜSURATSIZ para birimi doğru çevriliyor', () => {
    // JPY'de kuruş yok; varsayılan iki küsurat uygulansa bütçe 100 KATINA
    // çıkardı.
    const p = buildBoostAdSetParams(
      req({ currency: 'JPY', budget: { mode: 'lifetime', totalMicros: 300_000_000n } }),
      'c-1',
      NOW,
    );
    expect(p.lifetime_budget).toBe('300');
  });
});

describe('süre', () => {
  it('bitiş zamanı SÜREDEN türüyor ve her iki kipte de var', () => {
    for (const budget of [
      { mode: 'daily', dailyMicros: 100_000_000n },
      { mode: 'lifetime', totalMicros: 300_000_000n },
    ] as const) {
      const p = buildBoostAdSetParams(req({ budget, durationDays: 5 }), 'c-1', NOW);
      expect(p.end_time).toBe('2026-08-21T12:00:00.000Z');
    }
  });
});

describe('hedefleme', () => {
  it('VERİLMEZSE ülke geneli TR — kural yolunun bugünkü davranışı', () => {
    const p = buildBoostAdSetParams(req(), 'c-1', NOW);
    expect(JSON.parse(p.targeting!)).toEqual(DEFAULT_BOOST_TARGETING);
  });

  it('KRİTİK: verilen hedefleme OLDUĞU GİBİ gidiyor', () => {
    // Ekranda seçilen şehri gönderip sabit ülkeyi bırakmak, panelde "İzmir"
    // gösterip Meta'ya "Türkiye" göndermek olurdu.
    const targeting = {
      geo_locations: { countries: ['TR'], cities: [{ key: '2420351' }] },
      age_min: 25,
      age_max: 44,
      genders: [2],
    };
    const p = buildBoostAdSetParams(req({ targeting }), 'c-1', NOW);
    expect(JSON.parse(p.targeting!)).toEqual(targeting);
  });

  it('hedefleme JSON DİZGE olarak gidiyor', () => {
    // Graph form-encoded; nesne gönderilirse "[object Object]" yazılır ve
    // Meta bunu sessizce yok sayar.
    expect(typeof buildBoostAdSetParams(req(), 'c-1', NOW).targeting).toBe('string');
  });
});

describe('özel reklam kategorisi', () => {
  const daraltilmis = {
    geo_locations: { countries: ['TR'] },
    age_min: 25,
    age_max: 44,
    genders: [2],
  };

  it('KRİTİK: konut beyanında yaş ve cinsiyet DÜŞÜYOR', () => {
    // Meta bu alanları ya reddediyor ya da KABUL EDİP sessizce yok sayıyor.
    // İkincisinde kullanıcı uygulanmamış bir hedeflemeye reklam verdiğini
    // sanır — kısıtı biz uyguluyoruz.
    const p = buildBoostAdSetParams(
      req({ targeting: daraltilmis, specialAdCategories: ['HOUSING'] }),
      'c-1',
      NOW,
    );
    const t = JSON.parse(p.targeting!);
    expect(t.age_max).toBeUndefined();
    expect(t.genders).toBeUndefined();
    // Yaş SIFIRLANMIYOR, 18'e sabitleniyor: alanı hiç göndermemek "her yaş"
    // demek olurdu, oysa Meta özel kategoride 18+ istiyor.
    expect(t.age_min).toBe(18);
  });

  it('lokasyon KORUNUYOR — kısıtlanan yalnızca yaş ve cinsiyet', () => {
    const p = buildBoostAdSetParams(
      req({
        targeting: { ...daraltilmis, geo_locations: { countries: ['TR'], cities: [{ key: '1' }] } },
        specialAdCategories: ['CREDIT'],
      }),
      'c-1',
      NOW,
    );
    expect(JSON.parse(p.targeting!).geo_locations).toEqual({
      countries: ['TR'],
      cities: [{ key: '1' }],
    });
  });

  it('beyan yoksa hedefleme AYNEN gidiyor', () => {
    const p = buildBoostAdSetParams(req({ targeting: daraltilmis }), 'c-1', NOW);
    expect(JSON.parse(p.targeting!)).toEqual(daraltilmis);
  });

  it('KRİTİK: kısıt ÇAĞIRANA bırakılmıyor — varsayılan hedeflemede de çalışıyor', () => {
    // Boost'un üç çağıranı olacak. Kısıtı çağırana bırakmak, bir gün birinin
    // unutması demek ve unutulduğu hiçbir yerde görünmez.
    const p = buildBoostAdSetParams(req({ specialAdCategories: ['EMPLOYMENT'] }), 'c-1', NOW);
    expect(JSON.parse(p.targeting!).age_min).toBe(18);
  });
});
