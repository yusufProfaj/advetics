import { z } from 'zod';

/**
 * Gelişmiş kampanya ayarları — "tek giriş, iki mod"un gelişmiş tarafı.
 *
 * NEDEN İKİ MOD.
 *
 * Ürünün vaadi "reklamcılık bilmeyen biri de kullanabilsin" ve o vaat duruyor:
 * hızlı mod Meta'nın sorduğu her soruya bizim adımıza cevap veriyor
 * (`goal-mapping.ts`). Ama ajansın kendi uzmanı için o mod bir kafes — hedef
 * kitleyi daraltmak, teklif tavanı koymak, toplam bütçeyle çalışmak
 * isteyebiliyor ve bunların hiçbiri hızlı modda yok.
 *
 * ÇÖZÜM AYRI EKRAN DEĞİL, AYNI EKRANDA MOD. İki ayrı sayfa olsaydı hızlı
 * modda başlayan bir taslak gelişmiş moda geçemezdi ve kullanıcı her şeyi
 * baştan yazardı. Aynı taslak, aynı görseller, aynı yayın yolu.
 *
 * BURADAKİ HER ALAN META'NIN GERÇEKTEN SORDUĞU BİR ŞEY. Uydurma bir soyutlama
 * katmanı yok: alan adları Meta'nın alan adlarıyla eşleşiyor ki hata mesajları
 * anlaşılır olsun ve Ads Manager'da görülen şeyle panelde yazan şey aynı olsun.
 */

// -----------------------------------------------------------------------------
// Hedef
// -----------------------------------------------------------------------------

/**
 * Desteklenen hedefler.
 *
 * Meta'nın tamamı DEĞİL. `OUTCOME_APP_PROMOTION` yok (bu ajansın mobil
 * uygulama müşterisi yok ve uygulama reklamı SDK entegrasyonu istiyor).
 * `OUTCOME_SALES` VAR ama pixel gerektiriyor ve doğrulama bunu zorluyor —
 * pixelsiz satış kampanyası hiç öğrenmiyor ve bu sessiz bir para kaybı.
 */
export const OBJECTIVES = [
  'OUTCOME_LEADS',
  'OUTCOME_TRAFFIC',
  'OUTCOME_ENGAGEMENT',
  'OUTCOME_AWARENESS',
  'OUTCOME_SALES',
] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const OPTIMIZATION_GOALS = [
  'LEAD_GENERATION',
  'QUALITY_LEAD',
  'CONVERSATIONS',
  'OFFSITE_CONVERSIONS',
  'LANDING_PAGE_VIEWS',
  'LINK_CLICKS',
  'POST_ENGAGEMENT',
  'THRUPLAY',
  'REACH',
  'IMPRESSIONS',
  'AD_RECALL_LIFT',
] as const;
export type OptimizationGoal = (typeof OPTIMIZATION_GOALS)[number];

export const BILLING_EVENTS = ['IMPRESSIONS', 'LINK_CLICKS', 'THRUPLAY'] as const;
export type BillingEvent = (typeof BILLING_EVENTS)[number];

export const DESTINATION_TYPES = ['ON_AD', 'WEBSITE', 'WHATSAPP', 'MESSENGER'] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];

// -----------------------------------------------------------------------------
// Teklif
// -----------------------------------------------------------------------------

/**
 * Teklif stratejisi.
 *
 * `LOWEST_COST_WITHOUT_CAP` varsayılan ve çoğu durumda doğru: Meta bütçeyi
 * harcamaya çalışır, sonuç başına maliyeti kendisi düşürür.
 *
 * Tavanlı stratejiler UZMAN İŞİ ve tehlikeli: tavan piyasa fiyatının altında
 * kalırsa kampanya HİÇ DAĞITIM YAPMAZ ve Meta bunu hata olarak bildirmez —
 * ad set "aktif" görünür, harcama sıfır kalır. Doğrulama bunu uyarı olarak
 * söylüyor.
 */
export const BID_STRATEGIES = [
  'LOWEST_COST_WITHOUT_CAP',
  'COST_CAP',
  'LOWEST_COST_WITH_BID_CAP',
] as const;
export type BidStrategy = (typeof BID_STRATEGIES)[number];

export const BID_STRATEGY_META: Record<
  BidStrategy,
  { label: string; description: string; risk: string | null }
> = {
  LOWEST_COST_WITHOUT_CAP: {
    label: 'En düşük maliyet',
    description: 'Meta bütçeyi harcar ve sonuç başına maliyeti kendisi düşürmeye çalışır.',
    risk: null,
  },
  COST_CAP: {
    label: 'Maliyet hedefi',
    description: 'Sonuç başına ortalama maliyeti verdiğin rakamın altında tutmaya çalışır.',
    risk: 'Hedef piyasanın altındaysa bütçe tam harcanmaz.',
  },
  LOWEST_COST_WITH_BID_CAP: {
    label: 'Teklif tavanı',
    description: 'Her açık artırmada bu rakamın üstüne çıkmaz.',
    // Bu cümle uyarı değil, bilgi: tavan koymanın maliyeti bu.
    risk: 'Tavan düşükse kampanya HİÇ dağıtım yapmayabilir ve Meta bunu hata olarak bildirmez.',
  },
};

// -----------------------------------------------------------------------------
// Bütçe
// -----------------------------------------------------------------------------

/**
 * Günlük mü toplam mı.
 *
 * `lifetime` (toplam bütçe) BİTİŞ TARİHİ ZORUNLU kılıyor — Meta toplam
 * bütçeyi süreye bölerek dağıtıyor ve süre yoksa böleceği bir şey yok.
 * Doğrulama bunu engelliyor; Meta da reddediyor ama hatayı yayın anında
 * almak, her şeyi doldurmuş kullanıcıyı en kötü anda yakalamak demek.
 */
export const BUDGET_MODES = ['daily', 'lifetime'] as const;
export type BudgetMode = (typeof BUDGET_MODES)[number];

// -----------------------------------------------------------------------------
// Hedefleme
// -----------------------------------------------------------------------------

export const GENDERS = ['all', 'male', 'female'] as const;
export type GenderTarget = (typeof GENDERS)[number];

export const targetingSchema = z.object({
  /**
   * Ülke kodları. Varsayılan TR.
   *
   * Boş bırakılamıyor: ülkesiz hedefleme Meta'da "dünya geneli" demek ve bu
   * bir Türkiye ajansı için en pahalı sessiz hata olurdu.
   */
  countries: z.array(z.string().length(2)).min(1, 'En az bir ülke gerekiyor').max(25),
  /** Şehir bazlı daraltma — Meta şehir kimlikleri. Boşsa ülke geneli. */
  cityKeys: z.array(z.string().max(40)).max(50).default([]),
  ageMin: z.number().int().min(18).max(65),
  ageMax: z.number().int().min(18).max(65),
  genders: z.enum(GENDERS).default('all'),
  /** Meta dil kimlikleri. Boşsa dil kısıtı yok. */
  locales: z.array(z.number().int()).max(10).default([]),
});
export type TargetingInput = z.infer<typeof targetingSchema>;

// -----------------------------------------------------------------------------
// Yerleşim
// -----------------------------------------------------------------------------

export const PLACEMENT_MODES = ['auto', 'manual'] as const;
export type PlacementMode = (typeof PLACEMENT_MODES)[number];

export const FB_POSITIONS = [
  'feed',
  'story',
  'facebook_reels',
  'video_feeds',
  'right_hand_column',
  'marketplace',
  'search',
] as const;
export const IG_POSITIONS = ['stream', 'story', 'reels', 'explore'] as const;

export const placementSchema = z.object({
  mode: z.enum(PLACEMENT_MODES).default('auto'),
  platforms: z.array(z.enum(['facebook', 'instagram'])).default(['facebook', 'instagram']),
  facebookPositions: z.array(z.enum(FB_POSITIONS)).default([]),
  instagramPositions: z.array(z.enum(IG_POSITIONS)).default([]),
});
export type PlacementInput = z.infer<typeof placementSchema>;

// -----------------------------------------------------------------------------
// Bütün ayarlar
// -----------------------------------------------------------------------------

export const advancedSettingsSchema = z.object({
  objective: z.enum(OBJECTIVES),
  optimizationGoal: z.enum(OPTIMIZATION_GOALS),
  billingEvent: z.enum(BILLING_EVENTS).default('IMPRESSIONS'),
  destinationType: z.enum(DESTINATION_TYPES).optional(),

  bidStrategy: z.enum(BID_STRATEGIES).default('LOWEST_COST_WITHOUT_CAP'),
  /** Teklif/maliyet tavanı — para birimi ana biriminde (TL), micros değil. */
  bidAmount: z.string().regex(/^\d+([.,]\d{1,2})?$/, 'Geçerli bir tutar gir').optional(),

  budgetMode: z.enum(BUDGET_MODES).default('daily'),

  /**
   * Başlangıç zamanı — boşsa hemen.
   *
   * `YYYY-MM-DDTHH:mm` (yerel). Saat dilimi taşınmıyor: reklam hesabının
   * kendi saat dilimi kullanılıyor ve o `ad_accounts.timezone`'da duruyor.
   * Kullanıcının saatiyle hesabın saati farklıysa, kullanıcının beklediği
   * değil hesabın saati geçerli — arayüz bunu yazıyor.
   */
  startAt: z.string().max(20).optional(),
  endAt: z.string().max(20).optional(),

  targeting: targetingSchema,
  placement: placementSchema,

  /**
   * Dönüşüm pikseli — yalnızca `OFFSITE_CONVERSIONS` ve `OUTCOME_SALES` için.
   *
   * Pixelsiz satış kampanyası HİÇ ÖĞRENMİYOR: Meta neyi optimize edeceğini
   * bilmiyor, bütçe harcanıyor ve sonuç sayısı sıfır kalıyor. Doğrulama bunu
   * engelliyor.
   */
  pixelId: z.string().max(64).optional(),
  conversionEvent: z.string().max(64).optional(),
});
export type AdvancedSettings = z.infer<typeof advancedSettingsSchema>;

export const CAMPAIGN_MODES = ['simple', 'advanced'] as const;
export type CampaignMode = (typeof CAMPAIGN_MODES)[number];

// -----------------------------------------------------------------------------
// Doğrulama sonucu
// -----------------------------------------------------------------------------

/**
 * Engelleyici ile uyarı AYRI.
 *
 * Engelleyici: Meta reddedecek ya da kampanya çalışmayacak. Yayın durur.
 * Uyarı: sonuç kötü olabilir ama bu uzmanın kararı olabilir. Yayın durmaz.
 *
 * Ayrımı yapmamak iki yönde de zarar: her şeyi engellemek uzmanı kafese
 * geri sokar, hiçbir şeyi engellememek sessiz para kaybına yol açar.
 */
export interface AdvancedIssue {
  /** Arayüzün ilgili alana odaklanabilmesi için. */
  field: string;
  message: string;
}

export interface AdvancedValidation {
  blockers: AdvancedIssue[];
  warnings: AdvancedIssue[];
}

// -----------------------------------------------------------------------------
// Hızlı mod → gelişmiş mod köprüsü
// -----------------------------------------------------------------------------

/**
 * Hızlı modun üç tipinin Meta karşılıkları — TEK DOĞRULUK KAYNAĞI.
 *
 * Bu tablo hem sunucuda (`goal-mapping.ts` → `campaignSpec`) hem arayüzde
 * (gelişmiş moda geçerken varsayılan) kullanılıyor. İki yerde ayrı ayrı
 * yazılsaydı zamanla ayrışırlardı ve fark şöyle görünürdü: kullanıcı hızlı
 * modda kaydediyor, gelişmişe geçiyor ve karşısında bambaşka bir ayar
 * buluyor — hangisinin yayınlanacağı belirsiz.
 *
 * Gerekçeler `goal-mapping.ts` içinde, her satırın yanında duruyor.
 */
export const GOAL_SPEC: Record<
  'form' | 'whatsapp' | 'website',
  {
    objective: Objective;
    optimizationGoal: OptimizationGoal;
    billingEvent: BillingEvent;
    destinationType?: DestinationType;
  }
> = {
  form: {
    objective: 'OUTCOME_LEADS',
    optimizationGoal: 'LEAD_GENERATION',
    billingEvent: 'IMPRESSIONS',
    destinationType: 'ON_AD',
  },
  whatsapp: {
    objective: 'OUTCOME_LEADS',
    optimizationGoal: 'CONVERSATIONS',
    billingEvent: 'IMPRESSIONS',
    destinationType: 'WHATSAPP',
  },
  website: {
    objective: 'OUTCOME_TRAFFIC',
    optimizationGoal: 'LANDING_PAGE_VIEWS',
    billingEvent: 'IMPRESSIONS',
  },
};

/**
 * Hızlı moddan gelişmiş moda geçerken kullanılan varsayılanlar.
 *
 * Sunucudaki `defaultsFromSpec` ile AYNI DEĞERLERİ üretiyor; ikisi de bu
 * tablodan besleniyor.
 */
export function advancedDefaultsFor(goal: 'form' | 'whatsapp' | 'website'): AdvancedSettings {
  return {
    ...GOAL_SPEC[goal],
    bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
    budgetMode: 'daily',
    targeting: {
      countries: ['TR'],
      cityKeys: [],
      ageMin: 18,
      // 65 = "65 ve üzeri", dışlama değil.
      ageMax: 65,
      genders: 'all',
      locales: [],
    },
    placement: {
      mode: 'auto',
      platforms: ['facebook', 'instagram'],
      facebookPositions: [],
      instagramPositions: [],
    },
  };
}
