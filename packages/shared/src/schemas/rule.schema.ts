import { z } from 'zod';

/**
 * Modül 5 — Kural motoru sözleşmeleri.
 *
 * BU MODÜLÜN DİĞERLERİNDEN FARKI: buradaki bir hata veriyi yanlış GÖSTERMİYOR,
 * müşterinin kampanyasını YANLIŞ DURDURUYOR. Rapor hatası düzeltilebilir;
 * durdurulmuş bir kampanyanın kaçırdığı satış geri gelmiyor.
 *
 * Tasarımın tamamı bu asimetriye göre: kural varsayılan olarak PROVA modunda
 * (`dryRun`), canlıya almak AYRI bir yetki (`rule.activate`), örneklem küçükse
 * tetiklenmiyor, veri bayatsa tetiklenmiyor.
 */

// -----------------------------------------------------------------------------
// Metrikler
// -----------------------------------------------------------------------------

/**
 * Kuralda kullanılabilecek metrikler.
 *
 * TÜRETİLMİŞ METRİKLER PENCERE TOPLAMINDAN hesaplanıyor, günlük değerlerin
 * ortalamasından DEĞİL. 7 günlük EBM = (7 günün toplam harcaması) / (7 günün
 * toplam dönüşümü). Günlük EBM'lerin ortalaması bambaşka bir sayı: dönüşümü
 * olmayan bir günün EBM'si tanımsız ve o günü atlamak ortalamayı düşürüyor,
 * sıfır saymak sonsuza götürüyor. İkisi de yanlış.
 */
export const RULE_METRICS = [
  'spend',
  'impressions',
  'clicks',
  'conversions',
  'ctr',
  'cpc',
  'cpa',
  'roas',
  'frequency',
  /**
   * Aylık bütçenin harcanan oranı (0-1).
   *
   * `monthly_budgets` ile kurulan bağ. "Bütçenin %90'ı bittiyse durdur"
   * kuralı bu metrikle yazılıyor ve hesap bazlı bütçe yoksa kural
   * DEĞERLENDİRİLMİYOR — bütçesizken 0 saymak "hiç harcanmamış" demek olur
   * ve durdurma kuralı hiç tetiklenmezdi.
   */
  'budget_spent_ratio',
] as const;
export type RuleMetric = (typeof RULE_METRICS)[number];

export const METRIC_META: Record<
  RuleMetric,
  { label: string; unit: 'money' | 'count' | 'ratio' | 'percent'; hint: string }
> = {
  spend: { label: 'Harcama', unit: 'money', hint: 'Pencere boyunca toplam harcama.' },
  impressions: { label: 'Gösterim', unit: 'count', hint: 'Toplam gösterim.' },
  clicks: { label: 'Tıklama', unit: 'count', hint: 'Toplam tıklama.' },
  conversions: { label: 'Dönüşüm', unit: 'count', hint: 'Toplam dönüşüm.' },
  ctr: { label: 'TO', unit: 'percent', hint: 'Toplam tıklama ÷ toplam gösterim.' },
  cpc: { label: 'TBM', unit: 'money', hint: 'Toplam harcama ÷ toplam tıklama.' },
  cpa: { label: 'EBM', unit: 'money', hint: 'Toplam harcama ÷ toplam dönüşüm.' },
  roas: { label: 'ROAS', unit: 'ratio', hint: 'Toplam dönüşüm değeri ÷ toplam harcama.' },
  frequency: {
    label: 'Frekans',
    unit: 'ratio',
    hint: 'Gösterim ÷ erişim. Reklam yorgunluğunun ana göstergesi.',
  },
  budget_spent_ratio: {
    label: 'Bütçe tüketimi',
    unit: 'percent',
    hint: 'Aylık bütçenin harcanan oranı. Bütçe tanımlı değilse kural atlanır.',
  },
};

/**
 * Değerlendirme penceresi.
 *
 * BUGÜN HİÇBİRİNE DÂHİL DEĞİL. Gün bitmeden gelen kısmi veri harcamayı düşük,
 * EBM'yi de düşük gösterir — "EBM 200 TL'nin altındaysa bütçeyi artır" kuralı
 * her sabah tetiklenirdi. Panel, rapor ve bütçe sayfası da aynı kuralda.
 */
export const RULE_WINDOWS = ['last_1d', 'last_3d', 'last_7d', 'last_14d', 'last_30d'] as const;
export type RuleWindow = (typeof RULE_WINDOWS)[number];

export const WINDOW_DAYS: Record<RuleWindow, number> = {
  last_1d: 1,
  last_3d: 3,
  last_7d: 7,
  last_14d: 14,
  last_30d: 30,
};

export const WINDOW_LABELS: Record<RuleWindow, string> = {
  last_1d: 'Dün',
  last_3d: 'Son 3 gün',
  last_7d: 'Son 7 gün',
  last_14d: 'Son 14 gün',
  last_30d: 'Son 30 gün',
};

export const RULE_OPERATORS = ['gt', 'gte', 'lt', 'lte'] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const OPERATOR_LABELS: Record<RuleOperator, string> = {
  gt: 'büyüktür',
  gte: 'büyük veya eşittir',
  lt: 'küçüktür',
  lte: 'küçük veya eşittir',
};

// -----------------------------------------------------------------------------
// Koşullar
// -----------------------------------------------------------------------------

export const ruleConditionSchema = z.object({
  metric: z.enum(RULE_METRICS),
  operator: z.enum(RULE_OPERATORS),
  /**
   * Eşik — METRİĞİN KENDİ BİRİMİNDE, micros değil.
   *
   * "EBM 250 TL'yi aşarsa" kuralında kullanıcı 250 yazıyor. Micros'a çevirmek
   * eşiği 250.000.000 yapardı ve kuralı okunmaz kılardı. Karşılaştırma
   * sırasında metrik tarafı da para birimine indiriliyor.
   *
   * Oran metrikleri (TO, bütçe tüketimi) YÜZDE olarak giriliyor: %1,5 için
   * 1.5. Hem arayüzde hem raporda yüzde kullanılıyor, kuralda ondalık istemek
   * iki farklı ölçek demek olurdu.
   */
  value: z.number().finite(),
  window: z.enum(RULE_WINDOWS),
});
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

/**
 * MİNİMUM ÖRNEKLEM — kuralın gürültüyle tetiklenmesini engelleyen eşik.
 *
 * 3 tıklama almış bir reklamın dönüşümü yoksa EBM tanımsız ve "EBM çok yüksek"
 * kuralı onu durdurur. Oysa o reklam hakkında hiçbir şey bilmiyoruz — henüz
 * ölçülmemiş. Bu koruma olmadan kural motoru sistematik olarak YENİ reklamları
 * öldürür ve ajans bunu asla fark etmez, çünkü durdurulan reklamın ne
 * yapacağını göremezsiniz.
 *
 * Varsayılanlar Meta öğrenme aşamasından: bir ad set 50 dönüşüme kadar
 * optimize olmuyor; 1000 gösterim / 20 tıklama en alt sınır olarak makul.
 */
export const ruleGuardSchema = z.object({
  minImpressions: z.coerce.number().int().min(0).default(1000),
  minClicks: z.coerce.number().int().min(0).default(20),
  /** Para biriminde, micros değil. */
  minSpend: z.coerce.number().min(0).default(0),
  /**
   * Pencerede EN AZ kaç gün veri olmalı.
   *
   * 7 günlük pencerede tek gün veri varsa o gün 7 günü temsil etmiyor.
   * Senkronizasyon geride kaldığında kural sessizce yanlış veriyle karar
   * verirdi — Fenbay hesaplarında yaşanan durumun kural motorundaki karşılığı.
   * 0 = kontrol yok.
   */
  minDaysWithData: z.coerce.number().int().min(0).default(0),
});
export type RuleGuard = z.infer<typeof ruleGuardSchema>;

// -----------------------------------------------------------------------------
// Aksiyonlar
// -----------------------------------------------------------------------------

export const RULE_ACTIONS = ['pause', 'resume', 'adjust_budget', 'notify'] as const;
export type RuleActionType = (typeof RULE_ACTIONS)[number];

export const ACTION_LABELS: Record<RuleActionType, string> = {
  pause: 'Duraklat',
  resume: 'Yeniden başlat',
  adjust_budget: 'Bütçeyi değiştir',
  notify: 'Yalnızca bildir',
};

/**
 * Aksiyon tanımı.
 *
 * `notify` AYRI BİR AKSİYON, prova modunun eş anlamlısı değil: prova "canlıda
 * şunu yapardım" demek, `notify` ise canlıda da yalnızca haber vermek. Bir
 * ajans çoğu kuralı önce yalnızca uyarı olarak çalıştırmak istiyor.
 */
export const ruleActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('pause') }),
  z.object({ type: z.literal('resume') }),
  z.object({
    type: z.literal('adjust_budget'),
    /**
     * Yüzde değişim: +20 = %20 artır, -30 = %30 azalt.
     *
     * Mutlak tutar DEĞİL: kural birçok varlığa birden uygulanıyor ve hepsine
     * aynı mutlak bütçeyi vermek anlamsız. ±%80 sınırı kaza sonucu 10 katına
     * çıkarmayı engelliyor.
     */
    percent: z.number().min(-80).max(80),
    /**
     * Değişim sonrası bütçe bu sınırların dışına çıkamaz. Para biriminde.
     *
     * Yüzdesel artışın bileşik etkisi hızlı: günde %20 artan bir bütçe bir
     * haftada 3,5 katına çıkıyor. Tavan olmadan kural kendi kendini besler.
     */
    maxBudget: z.number().positive().optional(),
    minBudget: z.number().positive().optional(),
  }),
  z.object({ type: z.literal('notify') }),
]);
export type RuleAction = z.infer<typeof ruleActionSchema>;

// -----------------------------------------------------------------------------
// Kural
// -----------------------------------------------------------------------------

export const RULE_LEVELS = ['campaign', 'ad_group', 'ad'] as const;
export type RuleLevel = (typeof RULE_LEVELS)[number];

/**
 * Hesap seviyesi YOK.
 *
 * Bir hesabı duraklatmak diye bir şey yok; hesap seviyesinde aksiyon
 * alınabilecek tek şey bütçe ve o zaten `monthly_budgets` işi.
 */
export const RULE_LEVEL_LABELS: Record<RuleLevel, string> = {
  campaign: 'Kampanya',
  ad_group: 'Ad set',
  ad: 'Reklam',
};

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    clientId: z.string().uuid(),
    /** null = müşterinin TÜM reklam hesapları. */
    adAccountId: z.string().uuid().nullable().optional(),
    level: z.enum(RULE_LEVELS),
    conditions: z.array(ruleConditionSchema).min(1).max(5),
    /**
     * Koşulların birleştirilme şekli.
     *
     * İç içe gruplama (A AND (B OR C)) DESTEKLENMİYOR. Böyle bir DSL yazmak
     * kolay ama okumak zor: kuralın ne yapacağını anlamayan bir kullanıcı onu
     * canlıya almamalı. Karmaşık mantık iki ayrı kuralla ifade edilebiliyor.
     */
    combinator: z.enum(['and', 'or']).default('and'),
    action: ruleActionSchema,
    guard: ruleGuardSchema.default({}),
    /**
     * Aynı varlığa iki aksiyon arasında beklenecek süre.
     *
     * SALINIMI (flapping) ENGELLİYOR: "EBM yüksekse duraklat" ve "EBM düşükse
     * başlat" kuralları bekleme olmadan aynı reklamı saatte bir açıp
     * kapatabilir. Meta böyle bir reklamı öğrenme aşamasına geri atıyor ve
     * performans kalıcı olarak bozuluyor.
     *
     * Varsayılan 24 saat: günlük veriyle çalışıyoruz, aynı gün içinde ikinci
     * kez karar vermenin dayanağı yok.
     */
    cooldownMinutes: z.coerce.number().int().min(0).max(20_160).default(1440),
    /**
     * Tek çalıştırmada en fazla kaç varlığa dokunulur.
     *
     * KAZAYA KARŞI SON EMNİYET. Yanlış yazılmış bir eşik 400 reklamı birden
     * duraklatabilir; sınır bunu 20'de kesiyor ve kalanı `capped` olarak
     * raporluyor. Sessizce kesmemek şart — "20 reklam duraklatıldı" ile
     * "400 reklamdan 20'si duraklatıldı, 380'i sınıra takıldı" farklı
     * bilgiler.
     */
    maxActionsPerRun: z.coerce.number().int().min(1).max(200).default(20),
    /**
     * Veri bu kadar saatten eskiyse HİÇBİR aksiyon alınmıyor.
     *
     * Senkronizasyon worker'ı durduğunda kural motoru dünkü veriyle karar
     * vermeye devam ederdi. Bu projede worker'ın sessizce durduğu bir kez
     * yaşandı ve hiçbir log üretmedi.
     */
    maxDataAgeHours: z.coerce.number().int().min(1).max(168).default(36),
    enabled: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.action.type !== 'adjust_budget' ||
      v.action.maxBudget === undefined ||
      v.action.minBudget === undefined ||
      v.action.maxBudget >= v.action.minBudget,
    { message: 'Üst bütçe sınırı alt sınırdan küçük olamaz', path: ['action'] },
  )
  .refine(
    // `budget_spent_ratio` yalnızca kampanya seviyesinde anlamlı: bütçe
    // hesap/kampanya seviyesinde tanımlı, tek bir reklamın "bütçe tüketimi"
    // diye bir şeyi yok.
    (v) =>
      !v.conditions.some((c) => c.metric === 'budget_spent_ratio') || v.level === 'campaign',
    {
      message: 'Bütçe tüketimi koşulu yalnızca kampanya seviyesinde kullanılabilir',
      path: ['conditions'],
    },
  );
export type RuleInput = z.infer<typeof ruleInputSchema>;

/** Prova → canlı geçişi. AYRI uç nokta, ayrı yetki (`rule.activate`). */
export const ruleModeSchema = z.object({
  dryRun: z.boolean(),
});

export const ruleQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  enabled: z.coerce.boolean().optional(),
});
export type RuleQuery = z.infer<typeof ruleQuerySchema>;

// -----------------------------------------------------------------------------
// Çalışma sonuçları
// -----------------------------------------------------------------------------

/**
 * Bir varlık için aksiyonun ne olduğu / neden olmadığı.
 *
 * `skipped_*` durumları AYRI AYRI tutuluyor, tek bir "atlandı" değil: ajans
 * "kuralım neden hiç çalışmıyor" diye sorduğunda cevap bu alanda. Tek bir
 * "atlandı" değeri o soruyu cevaplanamaz kılardı.
 */
export const ACTION_OUTCOMES = [
  /** Prova modunda: canlıda uygulanacaktı. */
  'simulated',
  /** Canlıda uygulandı. */
  'applied',
  /** Platform reddetti. */
  'failed',
  'skipped_cooldown',
  'skipped_guard',
  'skipped_stale_data',
  'skipped_no_budget',
  /** `maxActionsPerRun` sınırına takıldı. */
  'skipped_capped',
  /** Varlık zaten istenen durumda (duraklatılmışı duraklatmak). */
  'skipped_noop',
] as const;
export type ActionOutcome = (typeof ACTION_OUTCOMES)[number];

export const OUTCOME_LABELS: Record<ActionOutcome, string> = {
  simulated: 'Prova',
  applied: 'Uygulandı',
  failed: 'Başarısız',
  skipped_cooldown: 'Bekleme süresinde',
  skipped_guard: 'Örneklem yetersiz',
  skipped_stale_data: 'Veri bayat',
  skipped_no_budget: 'Bütçe tanımsız',
  skipped_capped: 'Sınıra takıldı',
  skipped_noop: 'Zaten bu durumda',
};

export interface RuleActionRecord {
  id: string;
  ruleId: string;
  runId: string;
  entityLevel: RuleLevel;
  entityId: string;
  entityName: string;
  entityExternalId: string;
  actionType: RuleActionType;
  outcome: ActionOutcome;
  /** İnsan okunur gerekçe: "EBM 312,40 ₺ > 250 ₺ (son 7 gün)". */
  reason: string;
  /** Aksiyon öncesi durum — geri alma ve denetim için. */
  beforeState: Record<string, unknown> | null;
  afterState: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

export interface RuleRunRecord {
  id: string;
  ruleId: string;
  ruleName: string;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string | null;
  /** Kural kapsamında kaç varlık incelendi. */
  evaluatedCount: number;
  /** Koşulları sağlayan varlık sayısı. */
  matchedCount: number;
  /** Gerçekten aksiyon alınan (ya da provada alınacak olan) sayı. */
  actionCount: number;
  error: string | null;
}

export interface RuleRecord {
  id: string;
  name: string;
  description: string | null;
  clientId: string;
  adAccountId: string | null;
  adAccountName: string | null;
  level: RuleLevel;
  conditions: RuleCondition[];
  combinator: 'and' | 'or';
  action: RuleAction;
  guard: RuleGuard;
  cooldownMinutes: number;
  maxActionsPerRun: number;
  maxDataAgeHours: number;
  enabled: boolean;
  /**
   * PROVA MODU — varsayılan `true`.
   *
   * Canlıya almak `rule.activate` yetkisi istiyor. Bir kuralı yazmakla onu
   * müşterinin hesabında çalıştırmak farklı ağırlıkta kararlar.
   */
  dryRun: boolean;
  lastRunAt: string | null;
  lastTriggeredAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Prova çalıştırmasının anlık sonucu — kaydedilmeden önce gösterilen. */
export interface RulePreview {
  evaluatedCount: number;
  matchedCount: number;
  actions: RuleActionRecord[];
}
