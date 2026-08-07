import {
  WINDOW_DAYS,
  type ActionOutcome,
  type RuleCondition,
  type RuleGuard,
  type RuleMetric,
  type RuleWindow,
} from '@advetics/shared';

/**
 * Kural değerlendirme — SAF fonksiyonlar, veritabanı ve platform çağrısı yok.
 *
 * Bu dosyadaki bir hatanın bedeli diğerlerinden farklı: yanlış bir rapor
 * düzeltilebilir, yanlış durdurulan kampanyanın kaçırdığı satış geri gelmez.
 * Bu yüzden karar mantığı veri erişiminden tamamen ayrı ve doğrudan test
 * edilebilir.
 */

/** Bir varlığın tek bir penceredeki ham toplamları. */
export interface WindowTotals {
  spendMicros: bigint;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionValueMicros: bigint;
  reach: number;
  /** Pencerede veri satırı bulunan gün sayısı. */
  days: number;
}

export interface EntitySnapshot {
  entityId: string;
  entityName: string;
  entityExternalId: string;
  /** 'active' | 'paused' | … — platformdan gelen durum. */
  status: string;
  budgetMode: 'daily' | 'lifetime' | 'none';
  budgetAmountMicros: bigint | null;
  currency: string;
  /** Pencere → toplamlar. Yalnızca kuralın kullandığı pencereler dolu. */
  windows: Partial<Record<RuleWindow, WindowTotals>>;
  /**
   * Aylık bütçe tüketim oranı (0-1). Bütçe tanımlı değilse null.
   *
   * Sıfır DEĞİL null: sıfır "hiç harcanmamış" demek ve "bütçenin %90'ı
   * bittiyse durdur" kuralı bütçesiz kampanyalarda hiç tetiklenmezdi —
   * sessizce işlevsiz bir koruma.
   */
  budgetSpentRatio: number | null;
  /** Bu varlığın en taze veri satırının zamanı. */
  newestDataAt: Date | null;
  /** Bu kuralın bu varlığa en son ne zaman DOKUNDUĞU (atlananlar hariç). */
  lastActionAt: Date | null;
}

export interface EvaluationContext {
  conditions: RuleCondition[];
  combinator: 'and' | 'or';
  guard: RuleGuard;
  cooldownMinutes: number;
  maxDataAgeHours: number;
  actionType: 'pause' | 'resume' | 'adjust_budget' | 'notify';
  /** Değerlendirme anı — parametre, çünkü `new Date()` test edilemez. */
  now: Date;
}

export interface EvaluationResult {
  /** Koşullar sağlandı mı. */
  matched: boolean;
  /**
   * Aksiyon alınabilir mi; alınamıyorsa NEDEN.
   *
   * `null` = koşullar sağlanmadı, kaydedilecek bir şey yok. Eşleşmeyen her
   * varlık için kayıt yazmak, 400 reklamlık bir hesapta her turda 400 satır
   * demek olurdu ve gerçek kararlar arasında kaybolurdu.
   */
  outcome: ActionOutcome | 'eligible' | null;
  /** İnsan okunur gerekçe — kaydedilip arayüzde gösteriliyor. */
  reason: string;
}

/**
 * Metriği pencere TOPLAMLARINDAN hesaplar.
 *
 * GÜNLÜK DEĞERLERİN ORTALAMASI DEĞİL. 7 günlük EBM = 7 günün toplam harcaması
 * ÷ 7 günün toplam dönüşümü. Günlük EBM'lerin ortalaması bambaşka bir sayı:
 * dönüşümsüz bir günün EBM'si tanımsız, o günü atlamak ortalamayı düşürüyor,
 * sıfır saymak sonsuza götürüyor — ikisi de yanlış ve ikisi de sessiz.
 *
 * `null` = metrik bu veriyle TANIMSIZ; `Infinity` = tanımlı ve sonsuz.
 * Ayrım önemli, aşağıda açıklanıyor.
 */
export function metricValue(
  metric: RuleMetric,
  totals: WindowTotals,
  budgetSpentRatio: number | null,
): number | null {
  const spend = Number(totals.spendMicros) / 1_000_000;
  const value = Number(totals.conversionValueMicros) / 1_000_000;

  switch (metric) {
    case 'spend':
      return spend;
    case 'impressions':
      return totals.impressions;
    case 'clicks':
      return totals.clicks;
    case 'conversions':
      return totals.conversions;

    case 'ctr':
      // Yüzde olarak: eşik de yüzde giriliyor (%1,5 için 1.5).
      return totals.impressions > 0 ? (totals.clicks / totals.impressions) * 100 : null;

    /**
     * TBM ve EBM'de PAYDA SIFIRSA AMA HARCAMA VARSA sonuç SONSUZ.
     *
     * Bu bilinçli ve kritik. 5.000 ₺ harcayıp hiç dönüşüm almamış bir reklam,
     * "EBM 250 ₺'yi aşarsa duraklat" kuralının durdurmak isteyeceği EN KÖTÜ
     * varlıktır. `null` döndürüp atlamak, kuralı tam da işini yapması gereken
     * yerde sessizce devre dışı bırakırdı.
     *
     * Harcama da yoksa gerçekten tanımsız — hiçbir şey olmamış.
     *
     * `lt`/`lte` karşılaştırmaları sonsuzla asla eşleşmiyor, yani "EBM
     * düşükse bütçeyi artır" kuralı bu varlığı ödüllendirmiyor.
     */
    case 'cpc':
      if (totals.clicks > 0) return spend / totals.clicks;
      return spend > 0 ? Number.POSITIVE_INFINITY : null;

    case 'cpa':
      if (totals.conversions > 0) return spend / totals.conversions;
      return spend > 0 ? Number.POSITIVE_INFINITY : null;

    /**
     * ROAS'ta sıfır TANIMLI bir değer: harcama var, getiri yok.
     *
     * EBM'nin tersi durum — burada payda harcama ve o sıfırsa hiçbir şey
     * olmamış demek.
     */
    case 'roas':
      return spend > 0 ? value / spend : null;

    case 'frequency':
      return totals.reach > 0 ? totals.impressions / totals.reach : null;

    case 'budget_spent_ratio':
      // Yüzde olarak: eşik %90 için 90 giriliyor.
      return budgetSpentRatio === null ? null : budgetSpentRatio * 100;
  }
}

function compare(actual: number, operator: RuleCondition['operator'], threshold: number): boolean {
  switch (operator) {
    case 'gt':
      return actual > threshold;
    case 'gte':
      return actual >= threshold;
    case 'lt':
      return actual < threshold;
    case 'lte':
      return actual <= threshold;
  }
}

const OPERATOR_SYMBOL: Record<RuleCondition['operator'], string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
};

function formatValue(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return v.toLocaleString('tr-TR', { maximumFractionDigits: 2 });
}

const WINDOW_TEXT: Record<RuleWindow, string> = {
  last_1d: 'dün',
  last_3d: 'son 3 gün',
  last_7d: 'son 7 gün',
  last_14d: 'son 14 gün',
  last_30d: 'son 30 gün',
};

/**
 * Kuralın koşullarının değerlendirileceği EN GENİŞ pencere.
 *
 * Koruyucular (minimum gösterim/tıklama) bu pencereye uygulanıyor: en dar
 * pencereye uygulamak, 1 günlük veriden 30 günlük bir kararı engellemek
 * olurdu; en genişe uygulamak ise kuralın gerçekten baktığı toplam örneklemi
 * ölçüyor.
 */
export function widestWindow(conditions: RuleCondition[]): RuleWindow {
  let widest: RuleWindow = 'last_1d';
  for (const c of conditions) {
    if (WINDOW_DAYS[c.window] > WINDOW_DAYS[widest]) widest = c.window;
  }
  return widest;
}

export function evaluate(snapshot: EntitySnapshot, ctx: EvaluationContext): EvaluationResult {
  // ---------------------------------------------------------------------------
  // 1. Koşullar
  // ---------------------------------------------------------------------------
  const reasons: string[] = [];
  const results: boolean[] = [];
  let unavailable: RuleMetric | null = null;

  for (const c of ctx.conditions) {
    const totals = snapshot.windows[c.window];
    if (!totals) {
      // Pencerenin verisi hiç çekilmemiş — bu bir programlama hatası değil,
      // varlık o pencerede hiç yayında olmamış olabilir. Sıfır toplamlarla
      // devam etmek "harcama 0" demek olurdu ve "harcama 100'ün altındaysa"
      // gibi kurallar yeni varlıkları yanlışlıkla eşleştirirdi.
      results.push(false);
      continue;
    }

    const actual = metricValue(c.metric, totals, snapshot.budgetSpentRatio);
    if (actual === null) {
      unavailable = c.metric;
      results.push(false);
      continue;
    }

    const ok = compare(actual, c.operator, c.value);
    results.push(ok);
    if (ok) {
      reasons.push(
        `${METRIC_TEXT[c.metric]} ${formatValue(actual)} ${OPERATOR_SYMBOL[c.operator]} ${formatValue(c.value)} (${WINDOW_TEXT[c.window]})`,
      );
    }
  }

  const matched =
    ctx.combinator === 'and' ? results.every(Boolean) : results.some(Boolean);

  if (!matched) {
    /**
     * `budget_spent_ratio` hesaplanamadığı için eşleşmediyse bunu AYRICA
     * bildiriyoruz.
     *
     * "Bütçenin %90'ı bittiyse durdur" kuralı, bütçe tanımlanmadığı için hiç
     * çalışmıyorsa ajans bunu bilmeli. Sessizce eşleşmemek, çalıştığı sanılan
     * bir koruma bırakırdı.
     */
    if (unavailable === 'budget_spent_ratio') {
      return {
        matched: false,
        outcome: 'skipped_no_budget',
        reason: 'Bu varlık için aylık bütçe tanımlı değil — bütçe koşulu değerlendirilemedi.',
      };
    }
    return { matched: false, outcome: null, reason: '' };
  }

  const reason = reasons.join(ctx.combinator === 'and' ? ' ve ' : ' veya ');

  // ---------------------------------------------------------------------------
  // 2. Kapılar — sıra önemli, en bilgilendirici sebep kazanıyor
  // ---------------------------------------------------------------------------

  // 2a. BAYAT VERİ. Her şeyden önce: veri güvenilmezse eşleşme de güvenilmez.
  //     Senkronizasyon worker'ı sessizce durduğunda kural motoru dünkü
  //     veriyle karar vermeye devam ederdi — bu projede worker'ın hiç log
  //     üretmeden durduğu bir kez yaşandı.
  if (snapshot.newestDataAt === null) {
    return { matched, outcome: 'skipped_stale_data', reason: 'Bu varlık için hiç veri yok.' };
  }
  const ageHours = (ctx.now.getTime() - snapshot.newestDataAt.getTime()) / 3_600_000;
  if (ageHours > ctx.maxDataAgeHours) {
    return {
      matched,
      outcome: 'skipped_stale_data',
      reason: `Veri ${Math.round(ageHours)} saat eski (sınır ${ctx.maxDataAgeHours} saat) — aksiyon alınmadı.`,
    };
  }

  // 2b. ÖRNEKLEM. Kuralın baktığı EN GENİŞ pencereye uygulanıyor.
  //
  //     Bu koruma olmadan kural motoru sistematik olarak YENİ varlıkları
  //     öldürür: 3 tıklama almış bir reklamın EBM'si sonsuzdur ve "EBM
  //     yüksekse duraklat" onu durdurur. Ajans bunu asla fark etmez —
  //     durdurulan reklamın ne yapacağını göremezsiniz.
  const widest = widestWindow(ctx.conditions);
  const sample = snapshot.windows[widest];
  if (!sample) {
    return { matched, outcome: 'skipped_guard', reason: 'Değerlendirme penceresinde veri yok.' };
  }
  const guardFail = checkGuard(sample, ctx.guard);
  if (guardFail) return { matched, outcome: 'skipped_guard', reason: guardFail };

  // 2c. ZATEN BU DURUMDA. "Bekleme süresinde" demekten daha bilgilendirici:
  //     ikisi de doğru olabilir ama ajansın görmek istediği bu.
  const noop = checkNoop(snapshot, ctx.actionType);
  if (noop) return { matched, outcome: 'skipped_noop', reason: noop };

  // 2d. BEKLEME SÜRESİ — salınım engeli.
  //
  //     "EBM yüksekse duraklat" ve "EBM düşükse başlat" kuralları bekleme
  //     olmadan aynı reklamı saatte bir açıp kapatabilir. Meta böyle bir
  //     reklamı öğrenme aşamasına geri atıyor ve performans KALICI olarak
  //     bozuluyor — yani salınımın maliyeti geçici değil.
  if (ctx.cooldownMinutes > 0 && snapshot.lastActionAt) {
    const sinceMin = (ctx.now.getTime() - snapshot.lastActionAt.getTime()) / 60_000;
    if (sinceMin < ctx.cooldownMinutes) {
      const remaining = Math.ceil(ctx.cooldownMinutes - sinceMin);
      return {
        matched,
        outcome: 'skipped_cooldown',
        reason: `${reason} — ancak bekleme süresi dolmadı (${remaining} dk kaldı).`,
      };
    }
  }

  return { matched, outcome: 'eligible', reason };
}

function checkGuard(totals: WindowTotals, guard: RuleGuard): string | null {
  if (totals.impressions < guard.minImpressions) {
    return `Örneklem yetersiz: ${totals.impressions} gösterim (en az ${guard.minImpressions}).`;
  }
  if (totals.clicks < guard.minClicks) {
    return `Örneklem yetersiz: ${totals.clicks} tıklama (en az ${guard.minClicks}).`;
  }
  const spend = Number(totals.spendMicros) / 1_000_000;
  if (spend < guard.minSpend) {
    return `Harcama yetersiz: ${formatValue(spend)} (en az ${formatValue(guard.minSpend)}).`;
  }
  if (guard.minDaysWithData > 0 && totals.days < guard.minDaysWithData) {
    return `Pencerede yalnızca ${totals.days} gün veri var (en az ${guard.minDaysWithData}).`;
  }
  return null;
}

function checkNoop(snapshot: EntitySnapshot, actionType: EvaluationContext['actionType']): string | null {
  if (actionType === 'pause' && snapshot.status !== 'active') {
    return `Varlık zaten yayında değil (${snapshot.status}).`;
  }
  if (actionType === 'resume' && snapshot.status === 'active') {
    return 'Varlık zaten yayında.';
  }
  if (actionType === 'adjust_budget') {
    // Bütçesi ÜST SEVİYEDE tanımlı bir varlığın (Meta CBO) kendi bütçesi yok;
    // değiştirilecek bir sayı da yok. Platform bu isteği reddederdi ve hata
    // olarak kaydedilirdi — oysa bu bir hata değil, yapılandırma gerçeği.
    if (snapshot.budgetMode === 'none' || snapshot.budgetAmountMicros === null) {
      return 'Bütçe üst seviyede tanımlı (CBO) — bu varlıkta değiştirilecek bütçe yok.';
    }
  }
  return null;
}

/**
 * Yeni bütçeyi hesaplar. Sınırlara KIRPILIYOR, sınır aşılırsa reddedilmiyor.
 *
 * Kırpmak doğru davranış: "%20 artır, en fazla 500 ₺" diyen kullanıcı 480'de
 * duran bir bütçenin 500'e çıkmasını istiyor, artışın tamamen iptal edilmesini
 * değil.
 *
 * Sonuç mevcut bütçeye EŞİTSE `null` dönüyor — çağıran bunu `skipped_noop`
 * olarak kaydediyor. Platforma aynı değeri yazmak boş bir API çağrısı ve kota
 * harcaması olurdu.
 */
export function nextBudgetMicros(
  currentMicros: bigint,
  percent: number,
  limits: { maxBudget?: number; minBudget?: number },
): bigint | null {
  // Yüzde hesabı BigInt'te tam sayı aritmetiğiyle: `Number`a çevirip geri
  // dönmek büyük bütçelerde kuruş kaydırıyor.
  const scaled = (currentMicros * BigInt(Math.round((100 + percent) * 100))) / 10_000n;

  let next = scaled;
  if (limits.maxBudget !== undefined) {
    const max = BigInt(Math.round(limits.maxBudget * 1_000_000));
    if (next > max) next = max;
  }
  if (limits.minBudget !== undefined) {
    const min = BigInt(Math.round(limits.minBudget * 1_000_000));
    if (next < min) next = min;
  }

  // Meta günlük bütçede asgari tutar istiyor ve sıfır bütçe kampanyayı fiilen
  // durdurur — "azalt" kuralının kampanyayı kapatması beklenmedik bir yan
  // etki olurdu.
  if (next <= 0n) return null;

  return next === currentMicros ? null : next;
}

const METRIC_TEXT: Record<RuleMetric, string> = {
  spend: 'Harcama',
  impressions: 'Gösterim',
  clicks: 'Tıklama',
  conversions: 'Dönüşüm',
  ctr: 'TO %',
  cpc: 'TBM',
  cpa: 'EBM',
  roas: 'ROAS',
  frequency: 'Frekans',
  budget_spent_ratio: 'Bütçe tüketimi %',
};
