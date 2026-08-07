import type { BudgetPacing, BudgetRecord, PacingStatus } from '@advetics/shared';

/**
 * Bütçe pacing hesabı — SAF fonksiyonlar, veritabanı yok.
 *
 * Ayrı dosyada olmasının sebebi test edilebilirlik: buradaki hataların hepsi
 * SESSİZ. Yanlış bir pacing oranı hata fırlatmıyor, sadece müşteriye "hedefte
 * gidiyoruz" diyor ve ay sonunda bütçe iki katına çıkmış oluyor. Bu projede
 * şimdiye kadar yakalanan her hata bu türdendi.
 */

/**
 * "Hedefte" sayılan sapma bandı — 5 puan.
 *
 * Neden mutlak, oransal değil: oransal bant (`elapsed * 1.1`) ayın başında
 * saç teli kadar inceliyor. 1 Ağustos'ta geçen oran %3,2; %10 tolerans %3,5
 * demek ve bütçenin %4'ünü harcamak "hızlı" diye işaretleniyor — oysa tek
 * günlük veriyle böyle bir yargı gürültüden ibaret.
 *
 * Mutlak bant öngörülebilir: ayın hangi gününde olursak olalım "hedefin 5
 * puan üstü" aynı şeyi ifade ediyor.
 */
const TOLERANCE = 0.05;

export interface PacingInput {
  budget: BudgetRecord | null;
  /** Aralıkta ölçülen toplam harcama (micros). */
  spentMicros: bigint;
  /** `YYYY-MM` */
  month: string;
  /**
   * Bugün — `YYYY-MM-DD`, UTC.
   *
   * Parametre olarak alınıyor: `new Date()` çağıran bir fonksiyon test
   * edilemez ve gerçek hatalar yılın yalnızca belirli günlerinde çıkar.
   */
  today: string;
  /** Aralıkta gerçekten veri satırı bulunan gün sayısı. */
  daysWithData: number;
  /** Bütçe para biriminden farklı olduğu için dışarıda bırakılan birimler. */
  excludedCurrencies?: string[];
}

/** Ayın ilk günü — `YYYY-MM-01`. */
export function monthStart(month: string): string {
  return `${month}-01`;
}

/** Ayın son günü. Artık yıl dâhil doğru. */
export function monthEnd(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  // Bir sonraki ayın 0. günü = bu ayın son günü. Aralık'ta m=12 → 13. ay
  // olur ve Date bunu ertesi yılın Ocak'ı sayar; sonuç yine doğru.
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

/** İki tarih arası gün sayısı, iki uç DÂHİL. */
export function inclusiveDays(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Hesabın kapsadığı son gün.
 *
 * BUGÜN DÂHİL DEĞİL. Gün bitmeden o günün verisi eksik geliyor ve eksik
 * veriyle pacing hesaplamak her sabah "bütçeyi az kullanıyoruz" demek olurdu.
 * Panel ve rapor bu konuda zaten hizalandı; burada farklı bir kural koymak
 * geçen sefer düzeltilen tutarsızlığı geri getirirdi.
 *
 * Geçmiş bir ay için ayın son günü, gelecek bir ay için `null`.
 */
export function resolveThroughDate(month: string, today: string): string | null {
  const start = monthStart(month);
  const end = monthEnd(month);
  const yesterday = shiftDate(today, -1);
  if (yesterday < start) return null; // ay henüz başlamadı ya da bugün 1'i
  return yesterday < end ? yesterday : end;
}

export function computePacing(input: PacingInput): BudgetPacing {
  const { budget, spentMicros, month, today, daysWithData } = input;
  const start = monthStart(month);
  const end = monthEnd(month);
  const daysTotal = inclusiveDays(start, end);
  const through = resolveThroughDate(month, today);

  const daysElapsed = through === null ? 0 : inclusiveDays(start, through);
  const daysRemaining = Math.max(0, daysTotal - daysElapsed);
  const elapsedRatio = daysElapsed / daysTotal;

  const base: BudgetPacing = {
    budget,
    spentMicros: spentMicros.toString(),
    remainingMicros: null,
    spentRatio: null,
    elapsedRatio,
    paceDelta: null,
    status: 'no_budget',
    suggestedDailyMicros: null,
    projectedMicros: null,
    // Ay başlamadıysa `through` yok; bu durumda ayın ilk gününü bildiriyoruz.
    // Boş string döndürmek arayüzde "-" yerine boşluk olurdu.
    throughDate: through ?? start,
    monthStart: start,
    monthEnd: end,
    daysElapsed,
    daysTotal,
    daysRemaining,
    daysWithData,
    alertTriggered: false,
    excludedCurrencies: input.excludedCurrencies ?? [],
  };

  if (!budget) return base;

  const amount = BigInt(budget.amountMicros);
  // Şemada `amount_micros > 0` kısıtı var; yine de sıfıra bölmeye karşı
  // koruma bırakıyoruz — kısıt migration'da, bu fonksiyon ise saf ve
  // veritabanı garantisine bel bağlamamalı.
  if (amount <= 0n) return base;

  const remaining = amount - spentMicros;
  const spentRatio = Number(spentMicros) / Number(amount);
  const paceDelta = spentRatio - elapsedRatio;

  /**
   * Ay sonu tahmini — TAKVİM günlerine bölünüyor, veri bulunan günlere değil.
   *
   * `daysWithData < daysElapsed` olduğunda tahmin olduğundan düşük çıkıyor.
   * Bilerek: eksik gün "senkronize edilmedi" de olabilir "kampanya duruyordu,
   * gerçekten sıfır harcandı" da. İkisini ayırt edemiyoruz ve eksik günü
   * harcamış saymak, olmayan bir harcamayı uydurmak olurdu. Belirsizlik
   * `daysWithData` ile arayüze taşınıyor, hesaba gömülmüyor.
   */
  const projected =
    daysElapsed > 0 ? (spentMicros * BigInt(daysTotal)) / BigInt(daysElapsed) : null;

  const suggestedDaily =
    daysRemaining > 0 && remaining > 0n ? remaining / BigInt(daysRemaining) : 0n;

  return {
    ...base,
    remainingMicros: remaining.toString(),
    spentRatio,
    paceDelta,
    status: resolveStatus(spentRatio, paceDelta),
    suggestedDailyMicros: suggestedDaily.toString(),
    projectedMicros: projected === null ? null : projected.toString(),
    alertTriggered: spentRatio * 100 >= budget.alertThresholdPct,
  };
}

function resolveStatus(spentRatio: number, paceDelta: number): PacingStatus {
  // Bütçe dolduysa hız artık önemli değil: harcanacak bir şey kalmadı ve
  // "hedefte" demek yanıltıcı olurdu.
  if (spentRatio >= 1) return 'exhausted';
  if (paceDelta > TOLERANCE) return 'over';
  if (paceDelta < -TOLERANCE) return 'under';
  return 'on_track';
}
