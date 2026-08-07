import { describe, expect, it } from 'vitest';
import type { BudgetRecord } from '@advetics/shared';
import { computePacing, inclusiveDays, monthEnd, resolveThroughDate } from './budget-pacing';

/**
 * Pacing matematiği.
 *
 * NEDEN BU TESTLER VAR: buradaki her hata SESSİZ. Yanlış bir oran hata
 * fırlatmıyor, panelde yeşil bir çubuk gösteriyor ve ajans ay sonunda bütçenin
 * iki katını harcamış oluyor. Bu projede şimdiye kadar yakalanan bütün hatalar
 * bu türdendi — hiçbiri log üretmedi.
 */

function budget(over: Partial<BudgetRecord> = {}): BudgetRecord {
  return {
    id: 'b1',
    clientId: 'c1',
    adAccountId: null,
    adAccountName: null,
    platform: null,
    month: '2026-08',
    amountMicros: '30000000000', // 30.000 ₺
    currency: 'TRY',
    dailyCapMicros: null,
    alertThresholdPct: 80,
    autoPauseAtPct: null,
    note: null,
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

describe('monthEnd', () => {
  it('31 ve 30 günlük ayları ayırır', () => {
    expect(monthEnd('2026-08')).toBe('2026-08-31');
    expect(monthEnd('2026-04')).toBe('2026-04-30');
  });

  it('ŞUBAT: artık yıl ve normal yıl', () => {
    // Bütçe 28'e bölünürken 29'a bölünürse günlük hedef %3,5 kayar.
    expect(monthEnd('2026-02')).toBe('2026-02-28');
    expect(monthEnd('2028-02')).toBe('2028-02-29');
  });

  it('ARALIK yıl sınırını aşmıyor', () => {
    // `Date.UTC(2026, 12, 0)` 13. ay demek; Date bunu 2027 Ocak sayıyor ve
    // 0. gün geri sararak 2026-12-31 veriyor. Doğru ama kolayca yanlış
    // yazılabilecek bir yer.
    expect(monthEnd('2026-12')).toBe('2026-12-31');
  });
});

describe('resolveThroughDate', () => {
  it('İÇİNDE BULUNULAN ayda DÜNE kadar — bugün DÂHİL DEĞİL', () => {
    // Panel ve rapor arasındaki tutarsızlık tam olarak buydu ve düzeltildi.
    // Burada bugünü dâhil etmek aynı farkı üçüncü bir ekranda geri getirirdi.
    expect(resolveThroughDate('2026-08', '2026-08-07')).toBe('2026-08-06');
  });

  it('GEÇMİŞ ayda ayın son günü', () => {
    expect(resolveThroughDate('2026-07', '2026-08-07')).toBe('2026-07-31');
  });

  it('GELECEK ayda null', () => {
    expect(resolveThroughDate('2026-09', '2026-08-07')).toBeNull();
  });

  it('AYIN 1İNDE null — o ayın henüz tamamlanmış günü yok', () => {
    // 1 Ağustos'ta "dün" 31 Temmuz; Ağustos'un hiçbir günü bitmedi.
    // Sıfır harcamayı "bütçeyi hiç kullanmamışsın" diye raporlamamak için
    // bu durum ayrı ele alınıyor.
    expect(resolveThroughDate('2026-08', '2026-08-01')).toBeNull();
  });

  it('AYIN 2SİNDE ilk gün kapsanıyor', () => {
    expect(resolveThroughDate('2026-08', '2026-08-02')).toBe('2026-08-01');
  });
});

describe('inclusiveDays', () => {
  it('iki uç dâhil', () => {
    expect(inclusiveDays('2026-08-01', '2026-08-01')).toBe(1);
    expect(inclusiveDays('2026-08-01', '2026-08-06')).toBe(6);
  });

  it('YAZ SAATİ geçişinde kaymıyor', () => {
    // Yerel `Date` ile hesaplansaydı 30 Mart gecesi saat ileri alındığı için
    // gün farkı 30,96 çıkar ve `Math.round` olmadan 30 güne yuvarlanırdı.
    expect(inclusiveDays('2026-03-01', '2026-03-31')).toBe(31);
  });
});

describe('computePacing', () => {
  it('bütçe yoksa yalnızca harcamayı bildirir', () => {
    const p = computePacing({
      budget: null,
      spentMicros: 5_000_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
    });
    expect(p.status).toBe('no_budget');
    expect(p.spentMicros).toBe('5000000000');
    expect(p.spentRatio).toBeNull();
    expect(p.paceDelta).toBeNull();
    // Ayın geçen kısmı bütçeden bağımsız olarak biliniyor.
    expect(p.daysElapsed).toBe(6);
  });

  it('HEDEFTE: harcama ayın geçen kısmıyla orantılı', () => {
    // 6/31 gün geçmiş (%19,4). 30.000 ₺'nin %19,4'ü = 5.806 ₺.
    const p = computePacing({
      budget: budget(),
      spentMicros: 5_806_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
    });
    expect(p.status).toBe('on_track');
    expect(p.elapsedRatio).toBeCloseTo(6 / 31, 6);
    expect(p.paceDelta).toBeCloseTo(0, 2);
  });

  it('HIZLI: 5 puanlık bandın üstü', () => {
    // %19,4 geçmiş, %35 harcanmış → 15,6 puan sapma.
    const p = computePacing({
      budget: budget(),
      spentMicros: 10_500_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
    });
    expect(p.status).toBe('over');
    expect(p.paceDelta).toBeGreaterThan(0.05);
  });

  it('YAVAŞ: bandın altı', () => {
    const p = computePacing({
      budget: budget(),
      spentMicros: 1_000_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
    });
    expect(p.status).toBe('under');
  });

  it('BANT SINIRI: tam 5 puan sapma hâlâ hedefte', () => {
    // 15/31 gün = %48,39. Bunun 5 puan üstü %53,39 → 16.016.129 micro-birim
    // yerine tam sınırda kalan bir değer seçiliyor.
    const elapsed = 15 / 31;
    const amount = 30_000_000_000n;
    const spent = BigInt(Math.round((elapsed + 0.05) * Number(amount)));
    const p = computePacing({
      budget: budget(),
      spentMicros: spent,
      month: '2026-08',
      today: '2026-08-16',
      daysWithData: 15,
    });
    // Sınır DÂHİL hedefte sayılıyor (`>` kullanıldı, `>=` değil).
    expect(p.status).toBe('on_track');
  });

  it('BÜTÇE DOLDU: aşımda "hızlı" değil "doldu" der', () => {
    // Ay bitmek üzereyken bütçe dolmuşsa `paceDelta` küçük çıkıyor ve
    // yalnızca sapmaya bakılsaydı durum "hedefte" görünürdü — oysa harcanacak
    // para kalmadı ve söylenmesi gereken şey bu.
    const p = computePacing({
      budget: budget(),
      spentMicros: 30_000_000_000n,
      month: '2026-08',
      today: '2026-08-31',
      daysWithData: 30,
    });
    expect(p.status).toBe('exhausted');
    expect(p.remainingMicros).toBe('0');
  });

  it('AŞIM: kalan NEGATİF kalıyor, sıfıra kırpılmıyor', () => {
    // "Kalan: 0 ₺" ile "Kalan: -4.000 ₺" farklı bilgiler. Kırpmak aşımın
    // BÜYÜKLÜĞÜNÜ gizlerdi.
    const p = computePacing({
      budget: budget(),
      spentMicros: 34_000_000_000n,
      month: '2026-08',
      today: '2026-08-20',
      daysWithData: 19,
    });
    expect(p.remainingMicros).toBe('-4000000000');
    expect(p.spentRatio).toBeCloseTo(34 / 30, 6);
    // Önerilen günlük harcama ise NEGATİF olamaz.
    expect(p.suggestedDailyMicros).toBe('0');
  });

  it('önerilen günlük harcama kalanı kalan güne böler', () => {
    // 6 gün geçti, 25 gün kaldı. 30.000 - 6.000 = 24.000 → günde 960 ₺.
    const p = computePacing({
      budget: budget(),
      spentMicros: 6_000_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
    });
    expect(p.daysRemaining).toBe(25);
    expect(p.suggestedDailyMicros).toBe('960000000');
  });

  it('AY BİTTİYSE önerilen günlük 0 — sıfıra bölünmüyor', () => {
    const p = computePacing({
      budget: budget(),
      spentMicros: 20_000_000_000n,
      month: '2026-07',
      today: '2026-08-07',
      daysWithData: 31,
    });
    expect(p.daysRemaining).toBe(0);
    expect(p.suggestedDailyMicros).toBe('0');
  });

  it('AY SONU TAHMİNİ bu hızla devam edilirse', () => {
    // 6 günde 6.000 ₺ → günde 1.000 ₺ → 31 günde 31.000 ₺.
    const p = computePacing({
      budget: budget(),
      spentMicros: 6_000_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
    });
    expect(p.projectedMicros).toBe('31000000000');
  });

  it('AYIN 1İNDE hiçbir şey bölünmüyor', () => {
    // `daysElapsed = 0`. Tahmin ve geçen oran sıfıra bölme üretmemeli.
    const p = computePacing({
      budget: budget(),
      spentMicros: 0n,
      month: '2026-08',
      today: '2026-08-01',
      daysWithData: 0,
    });
    expect(p.daysElapsed).toBe(0);
    expect(p.elapsedRatio).toBe(0);
    expect(p.projectedMicros).toBeNull();
    expect(p.throughDate).toBe('2026-08-01');
    // Sıfır harcama + sıfır geçen gün = sapma yok. "Yavaş" demek yanlış olurdu.
    expect(p.status).toBe('on_track');
  });

  it('GELECEK AY için bütçe tanımlanabiliyor, pacing sıfır', () => {
    const p = computePacing({
      budget: budget({ month: '2026-09' }),
      spentMicros: 0n,
      month: '2026-09',
      today: '2026-08-07',
      daysWithData: 0,
    });
    expect(p.daysElapsed).toBe(0);
    expect(p.daysTotal).toBe(30);
    expect(p.daysRemaining).toBe(30);
  });

  it('UYARI EŞİĞİ yüzde üzerinden tetikleniyor', () => {
    const p = computePacing({
      budget: budget({ alertThresholdPct: 80 }),
      spentMicros: 24_000_000_000n, // tam %80
      month: '2026-08',
      today: '2026-08-25',
      daysWithData: 24,
    });
    expect(p.alertTriggered).toBe(true);
  });

  it('uyarı eşiğinin bir micro altında tetiklenmiyor', () => {
    const p = computePacing({
      budget: budget({ alertThresholdPct: 80 }),
      spentMicros: 23_999_999_999n,
      month: '2026-08',
      today: '2026-08-25',
      daysWithData: 24,
    });
    expect(p.alertTriggered).toBe(false);
  });

  it('VERİ KAPSAMASI ayrı bildiriliyor — hesaba gömülmüyor', () => {
    // Fenbay hesaplarında yaşanan durum: 6 günün yalnızca 1'i senkronize.
    // Tahmin TAKVİM gününe bölünüyor, veri bulunan güne değil; aksi hâlde
    // 1 günlük veriden 31 günlük bir tahmin uydurulmuş olurdu.
    const p = computePacing({
      budget: budget(),
      spentMicros: 1_000_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 1,
    });
    expect(p.daysElapsed).toBe(6);
    expect(p.daysWithData).toBe(1);
    // 1.000 / 6 gün * 31 = 5.166,67 → tam sayı bölmesi
    expect(p.projectedMicros).toBe('5166666666');
  });

  it('ŞUBAT bütçesi 28 güne bölünüyor', () => {
    // 14/28 = tam yarı. 31'e bölünseydi %45,2 çıkar ve durum "hızlı"ya kayardı.
    const p = computePacing({
      budget: budget({ month: '2026-02' }),
      spentMicros: 15_000_000_000n,
      month: '2026-02',
      today: '2026-02-15',
      daysWithData: 14,
    });
    expect(p.daysTotal).toBe(28);
    expect(p.elapsedRatio).toBeCloseTo(0.5, 6);
    expect(p.status).toBe('on_track');
  });

  it('BÜYÜK TUTARLAR micro hassasiyetini kaybetmiyor', () => {
    // 999.999.999,99 ₺ — `Number` ile taşınsaydı 2^53 sınırına yaklaşırdı.
    const p = computePacing({
      budget: budget({ amountMicros: '999999999990000' }),
      spentMicros: 500_000_000_000_000n,
      month: '2026-08',
      today: '2026-08-16',
      daysWithData: 15,
    });
    expect(p.remainingMicros).toBe('499999999990000');
  });

  it('para birimi uyuşmazlığı bildiriliyor', () => {
    const p = computePacing({
      budget: budget(),
      spentMicros: 5_000_000_000n,
      month: '2026-08',
      today: '2026-08-07',
      daysWithData: 6,
      excludedCurrencies: ['USD'],
    });
    expect(p.excludedCurrencies).toEqual(['USD']);
  });
});
