import { z } from 'zod';
import { CAMPAIGN_GOALS, type CampaignGoal } from './ad-builder.schema';
import { GOAL_SPEC, advancedSettingsSchema } from './campaign-advanced.schema';

/**
 * Kampanya taslağı ağacı — kampanya → reklam grubu → reklam.
 *
 * BASİT YÜZEY AĞACI GÖRMÜYOR. Kullanıcı "ne olsun" diyor, `buildDraftTree`
 * ağacı kuruyor. Uzman yüzeyi aynı ağacı doğrudan düzenliyor. İkisi tek
 * modelde çünkü iki ayrı model iki ayrı yayın yolu demek ve bu projede altı
 * hatanın düzeltmesi zaten üç yoldan yalnızca birine gitmişti.
 */

export const DRAFT_SURFACES = ['simple', 'expert'] as const;
export type DraftSurface = (typeof DRAFT_SURFACES)[number];

export const DRAFT_STATUSES = ['draft', 'publishing', 'published', 'failed'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

/**
 * `BUDGET_MODES` (campaign-advanced) ile AYNI DEĞİL ve ayrı durması gerekiyor:
 * orada yalnızca `daily | lifetime` var çünkü gelişmiş panel bütçeyi zorunlu
 * tutuyor. Ağaçta bütçe iki seviyeden BİRİNDE duruyor (Meta CBO/ABO), yani
 * diğer seviyenin "bütçesiz" olduğunu söyleyecek bir değere ihtiyaç var.
 * `none` olmasaydı boş seviye 0 ile temsil edilirdi ve sıfır bütçe geçerli bir
 * sayı gibi görünürdü.
 */
export const DRAFT_BUDGET_MODES = ['none', 'daily', 'lifetime'] as const;
export type DraftBudgetMode = (typeof DRAFT_BUDGET_MODES)[number];

export const DRAFT_PLATFORMS = ['meta', 'google'] as const;
export type DraftPlatform = (typeof DRAFT_PLATFORMS)[number];

// -----------------------------------------------------------------------------
// Hedef ↔ platform desteği
// -----------------------------------------------------------------------------

/**
 * ÜÇ DURUM, İKİ DEĞİL — ve bu ayrım sağlayıcıdan geliyor.
 *
 * `google.provider.ts` yazma metotlarında zaten üç ayrı gerekçe ayırt ediyor:
 * "henüz yazılmadı", "karşılığı yok — bu bir Meta özelliği" ve "yapacak iş
 * yok". Bu bilgi bugün hiçbir yere ulaşmıyor.
 *
 * "Henüz yok" ile "hiç olmayacak"ı aynı göstermek, kullanıcının asla gelmeyecek
 * bir şeyi beklemesi demek. Arayüz üçünü üç ayrı cümleyle göstermeli.
 */
export type GoalSupport = 'yes' | 'not_yet' | 'never';

export interface GoalPlatformSupport {
  support: GoalSupport;
  /** Kullanıcıya gösterilecek düz Türkçe sebep. `yes` ise boş. */
  reason: string;
}

/**
 * Hedefin hangi platformda çalıştığı.
 *
 * BUGÜNKÜ ÜÇ HEDEFİN ÜÇÜ DE META BİÇİMİNDE ve bu tablo onu açığa çıkarıyor:
 * WhatsApp ile anlık formun Google'da karşılığı YOK, site trafiği ise iki
 * platformda da anlamlı. Google'ı gerçekten kullanmak, en az bir Google
 * biçimli hedef eklemek demek ("insanlar seni Google'da arıyor") — o hedef
 * geldiğinde bu tabloya da girecek.
 */
export const GOAL_PLATFORM_SUPPORT: Record<
  CampaignGoal,
  Record<DraftPlatform, GoalPlatformSupport>
> = {
  form: {
    meta: { support: 'yes', reason: '' },
    google: {
      support: 'never',
      reason:
        "Google Ads'te Meta'nın anlık formunun karşılığı yok. Lead form uzantısı " +
        'ayrı bir kavram ve ayrı bir veri modeli.',
    },
  },
  whatsapp: {
    meta: { support: 'yes', reason: '' },
    google: {
      support: 'never',
      reason: "Google Ads'te WhatsApp'a yönlendiren bir reklam tipi yok.",
    },
  },
  website: {
    meta: { support: 'yes', reason: '' },
    google: {
      support: 'not_yet',
      reason:
        'Google Ads reklam oluşturma henüz yazılmadı. Bağlantı ve okuma tarafı ' +
        'çalışıyor; eksik olan yazma kodu.',
    },
  },
};

export function supportsGoal(platform: DraftPlatform, goal: CampaignGoal): GoalPlatformSupport {
  return GOAL_PLATFORM_SUPPORT[goal][platform];
}

// -----------------------------------------------------------------------------
// Basit yüzeyin girdisi
// -----------------------------------------------------------------------------

const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}([.,]\d{1,2})?$/, 'Bütçe sayı olmalı')
  .refine((v) => Number(v.replace(',', '.')) > 0, 'Bütçe sıfırdan büyük olmalı');

/**
 * Platform başına HESAP VE BÜTÇE AYRI.
 *
 * "Günde 200 ₺"yi ikiye bölmek bizim işimiz değil: bu kullanıcının kararı ve
 * uydurmak, hesabın varsayılanına güvenmekle aynı hata sınıfı. Arayüz bunu üç
 * hazır seçenekle soruyor ("önce Meta'da deneyelim / ikisini de / yalnızca
 * Google"), buraya ise çözülmüş hâlde geliyor.
 */
export const draftPlatformTargetSchema = z.object({
  platform: z.enum(DRAFT_PLATFORMS),
  adAccountId: z.string().uuid(),
  dailyBudget: money,
});

export type DraftPlatformTarget = z.infer<typeof draftPlatformTargetSchema>;

export const simpleDraftInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1, 'Kampanyaya bir ad ver').max(200),
  goal: z.enum(CAMPAIGN_GOALS),

  /** En az bir platform. Boş liste "hiçbir yere yayınla" demek olurdu. */
  targets: z.array(draftPlatformTargetSchema).min(1, 'En az bir platform seç'),

  /** Meta'da reklamın yayınlanacağı Facebook sayfası. */
  socialProfileId: z.string().uuid().optional(),
  creativeId: z.string().uuid(),

  /** 0 = süresiz. */
  durationDays: z.number().int().min(0).max(90).default(7),

  linkUrl: z.string().trim().max(2048).optional(),
  whatsappNumber: z.string().trim().max(20).optional(),
});

export type SimpleDraftInput = z.infer<typeof simpleDraftInputSchema>;

// -----------------------------------------------------------------------------
// Üretici
// -----------------------------------------------------------------------------

export interface PlannedAd {
  name: string;
  creativeId: string;
  position: number;
}

export interface PlannedAdGroup {
  name: string;
  position: number;
  socialProfileId?: string;
  settings: Record<string, unknown>;
  ads: PlannedAd[];
}

export interface PlannedCampaign {
  platform: DraftPlatform;
  adAccountId: string;
  name: string;
  surface: DraftSurface;
  /**
   * BASİT YÜZEYDE DOLU, UZMAN YÜZEYİNDE NULL.
   *
   * Uzman hedefi değil, doğrudan platformun amacını seçiyor. Ona bir hedef
   * uydurmak, taslağın neye göre kurulduğu sorusuna yanlış cevap vermek
   * olurdu — ve o cevap yayın anında `campaignSpec`'i yanlış çağırmaya yol
   * açardı.
   */
  goal: CampaignGoal | null;
  settings: Record<string, unknown>;
  budgetMode: DraftBudgetMode;
  /** Micros — string olarak taşınıyor, BigInt JSON'a girmiyor. */
  budgetAmountMicros: string;
  endAt: string | null;
  adGroups: PlannedAdGroup[];
}

export interface SkippedPlatform {
  platform: DraftPlatform;
  support: GoalSupport;
  reason: string;
}

export interface DraftTreePlan {
  campaigns: PlannedCampaign[];
  /**
   * Seçilip de kurulamayan platformlar — SESSİZCE ELENMİYOR.
   *
   * Kullanıcı "ikisine de çıkalım" dediyse ve biri kurulamadıysa bunu
   * bilmeli. Sessizce tek platforma düşmek, kullanıcının iki kampanya
   * açtığını sanması demek.
   */
  skipped: SkippedPlatform[];
  /**
   * Birden çok kampanya kurulduğunda ortak grup kimliği gerekiyor.
   *
   * KİMLİĞİ ÜRETİCİ ÜRETMİYOR: saf fonksiyon kalsın diye. Kimlik veritabanında
   * `gen_random_uuid()` ile üretiliyor.
   */
  groupRequired: boolean;
  /** Ağacı kurmayı engelleyen eksikler. */
  blockers: string[];
}

/**
 * Basit yüzeyin girdisinden ağaç planı üretir — SAF FONKSİYON.
 *
 * Veritabanı yok, kimlik üretimi yok, tarih üretimi yok; `now` dışarıdan
 * geliyor. `goal-mapping.ts` ile aynı sınıfta bir dosya: bir eşleme hatası
 * SESSİZ — kampanya kurulur, yanlış amaçla yayınlanır ve para harcar.
 *
 * HEDEFLEME VE YERLEŞİM BURADA YOK ve bu bilinçli. Onlar yayın anında
 * `goal-mapping.ts` içinde, yüklenen görsellere bakılarak hesaplanıyor —
 * "dikey görsel yoksa Hikâyeler açılmasın" kuralı orada yaşıyor. Buraya
 * kopyalamak, aynı kararın iki yerde durması ve zamanla ayrışması olurdu.
 */
export function buildDraftTree(input: SimpleDraftInput, now: Date): DraftTreePlan {
  const campaigns: PlannedCampaign[] = [];
  const skipped: SkippedPlatform[] = [];
  const blockers: string[] = [];

  if (input.goal === 'website' && !input.linkUrl) {
    blockers.push('Web sitesi adresi eksik — trafik kampanyası adressiz kurulamaz.');
  }

  const endAt = endTimeFor(input.durationDays, now);

  for (const target of input.targets) {
    const fit = supportsGoal(target.platform, input.goal);
    if (fit.support !== 'yes') {
      skipped.push({ platform: target.platform, support: fit.support, reason: fit.reason });
      continue;
    }

    /**
     * META'DA SAYFA ZORUNLU. Reklam her zaman bir Facebook sayfası adına
     * yayınlanıyor; sayfasız bir taslak yayın anında düşerdi ve mesaj yetki
     * sorunu gibi okunurdu.
     */
    if (target.platform === 'meta' && !input.socialProfileId) {
      blockers.push('Meta reklamı bir Facebook sayfası adına yayınlanır — sayfa seçilmedi.');
      continue;
    }

    const spec = GOAL_SPEC[input.goal];

    campaigns.push({
      platform: target.platform,
      adAccountId: target.adAccountId,
      name: input.name,
      surface: 'simple',
      goal: input.goal,
      // Kampanya seviyesinde YALNIZCA amaç. Optimizasyon ve faturalama reklam
      // grubunun alanları; Meta'da da öyle duruyorlar.
      settings: { objective: spec.objective },
      /**
       * BÜTÇE KAMPANYADA (Meta'da CBO).
       *
       * Basit yüzeyde tek reklam grubu var ve iki seviyeden birini seçmek
       * gerekiyor; kampanya seviyesi, ileride ikinci bir grup eklendiğinde
       * bütçenin gruplar arasında paylaşılması demek — kullanıcıya ek soru
       * sormadan doğru davranan taraf bu.
       */
      budgetMode: 'daily',
      budgetAmountMicros: moneyToMicros(target.dailyBudget),
      endAt: endAt ? endAt.toISOString() : null,
      adGroups: [
        {
          name: input.name,
          position: 0,
          socialProfileId: input.socialProfileId,
          settings: {
            optimizationGoal: spec.optimizationGoal,
            billingEvent: spec.billingEvent,
            ...(spec.destinationType ? { destinationType: spec.destinationType } : {}),
            ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}),
            ...(input.whatsappNumber ? { whatsappNumber: input.whatsappNumber } : {}),
          },
          ads: [{ name: input.name, creativeId: input.creativeId, position: 0 }],
        },
      ],
    });
  }

  if (campaigns.length === 0 && blockers.length === 0) {
    blockers.push(
      'Seçilen hedef bu platformların hiçbirinde çalışmıyor — başka bir hedef seç.',
    );
  }

  return { campaigns, skipped, groupRequired: campaigns.length > 1, blockers };
}

/**
 * Bitiş zamanı. `durationDays = 0` süresiz demek.
 *
 * `goal-mapping.ts` içindeki `endTimeFor` ile AYNI KURAL. Orası yayın anında
 * çalışıyor ve Meta'ya gönderilecek değeri üretiyor; burası taslağı kurarken
 * kaydedilecek değeri. İkisi ayrışırsa taslakta yazan tarih ile platformdaki
 * tarih farklı olur ve kullanıcı hangisine bakacağını bilemez.
 */
export function endTimeFor(durationDays: number, now: Date): Date | null {
  if (durationDays <= 0) return null;
  return new Date(now.getTime() + durationDays * 86_400_000);
}

/**
 * Para → micros. `ad-builder.service.ts`'deki `toMicros` ile aynı kural.
 *
 * `constants/platforms.ts` içindeki `toMicros` KULLANILMIYOR: o `number`
 * alıyor ve `Math.round(amount * 1_000_000)` yapıyor. Float çarpımı kuruş
 * kaydırıyor (0.29 * 1e6 = 289999.99999999994) ve para bu projede BigInt
 * olarak saklanıyor. Burada metin baştan parçalanıyor, hiç float'a
 * dönüşmüyor.
 */
export function moneyToMicros(amount: string): string {
  const normalized = amount.trim().replace(',', '.');
  const parts = normalized.split('.');
  const whole = parts[0] || '0';
  const padded = ((parts[1] ?? '') + '000000').slice(0, 6);
  return (BigInt(whole) * 1_000_000n + BigInt(padded)).toString();
}

// -----------------------------------------------------------------------------
// Uzman yüzeyi
// -----------------------------------------------------------------------------

/**
 * Uzman girdisi — kararları KULLANICI veriyor.
 *
 * `AdvancedSettings` OLDUĞU GİBİ KULLANILIYOR, yeni bir tip yazılmadı. O şema
 * amaç, optimizasyon, faturalama, teklif, hedefleme ve yerleşimi zaten
 * taşıyor ve `objective-matrix.ts` onu doğruluyor — ikinci bir tip yazmak,
 * uyumsuz kombinasyonların yalnızca bir yolda yakalanması demek olurdu.
 * Meta bazı uyumsuz kombinasyonları KABUL EDİP hiç dağıtım yapmıyor; bu
 * yüzden doğrulamanın tek olması kritik.
 *
 * HEDEF (`goal`) YOK ve olmayacak. Uzman "form mu WhatsApp mı" demiyor,
 * doğrudan `OUTCOME_LEADS` + `LEAD_GENERATION` seçiyor. Ona bir hedef
 * uydurmak, taslağın neye göre kurulduğu sorusuna yanlış cevap vermek olurdu.
 */
export const expertDraftInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1, 'Kampanyaya bir ad ver').max(200),

  platform: z.enum(DRAFT_PLATFORMS),
  adAccountId: z.string().uuid(),
  socialProfileId: z.string().uuid().optional(),
  leadFormId: z.string().uuid().optional(),

  /** Bütçe — uzman tutarı ve tipini kendisi veriyor. */
  budget: money,

  /**
   * ÇOKLU KREATİF — bu yüzeyin varlık sebeplerinden biri.
   *
   * Aynı reklam grubuna 3-5 kreatif koymak ajans pratiğinde standart ve
   * basit yüzeyde mümkün değil. Sıra anlamlı: platformda ilk sırada
   * oluşturulan reklam listede de ilk görünüyor.
   */
  creativeIds: z.array(z.string().uuid()).min(1, 'En az bir kreatif seç').max(10),

  advanced: advancedSettingsSchema,

  linkUrl: z.string().trim().max(2048).optional(),
  whatsappNumber: z.string().trim().max(20).optional(),
});

export type ExpertDraftInput = z.infer<typeof expertDraftInputSchema>;

/**
 * Uzman girdisinden ağaç planı — SAF FONKSİYON.
 *
 * Basit yüzeyin üreticisinden farkı, karar vermemesi: `buildDraftTree` hedefi
 * Meta ayarlarına ÇEVİRİYOR, bu ise kullanıcının verdiği ayarları olduğu gibi
 * taşıyor. Doğrulama ayrı ve sunucuda (`validateAdvanced`) — kullanıcının
 * seçimi bizim eşlememizden daha ayrıcalıklı değil.
 */
export function buildExpertTree(input: ExpertDraftInput, now: Date): DraftTreePlan {
  const blockers: string[] = [];
  const a = input.advanced;

  if (input.platform === 'meta' && !input.socialProfileId) {
    blockers.push('Meta reklamı bir Facebook sayfası adına yayınlanır — sayfa seçilmedi.');
  }

  /**
   * TOPLAM BÜTÇEDE BİTİŞ ZORUNLU — veritabanı kısıtıyla AYNI kural.
   *
   * Meta bütçeyi süreye bölüyor; süre yoksa bölecek bir şey de yok ve ad set
   * hiç dağıtım yapmıyor. Kısıt burada da duruyor ki kullanıcı hatayı ham bir
   * veritabanı ihlali olarak değil, cümle olarak görsün.
   */
  if (a.budgetMode === 'lifetime' && !a.endAt) {
    blockers.push('Toplam bütçe seçtiğinde bitiş tarihi zorunlu — Meta bütçeyi süreye böler.');
  }

  if (blockers.length > 0) {
    return { campaigns: [], skipped: [], groupRequired: false, blockers };
  }

  return {
    campaigns: [
      {
        platform: input.platform,
        adAccountId: input.adAccountId,
        name: input.name,
        surface: 'expert',
        goal: null,
        settings: {
          objective: a.objective,
          bidStrategy: a.bidStrategy,
          ...(a.bidAmount ? { bidAmount: a.bidAmount } : {}),
        },
        budgetMode: a.budgetMode,
        budgetAmountMicros: moneyToMicros(input.budget),
        endAt: a.endAt ? new Date(a.endAt).toISOString() : null,
        adGroups: [
          {
            name: input.name,
            position: 0,
            socialProfileId: input.socialProfileId,
            /**
             * AYARLARIN TAMAMI REKLAM GRUBUNDA.
             *
             * Meta'da da öyle duruyorlar: optimizasyon, faturalama, hedefleme
             * ve yerleşim ad set'in alanları. Kampanyaya taşımak, ikinci bir
             * grup eklendiğinde ayarların paylaşılması demek olurdu ve o
             * davranış Meta'da yok.
             */
            settings: {
              optimizationGoal: a.optimizationGoal,
              billingEvent: a.billingEvent,
              ...(a.destinationType ? { destinationType: a.destinationType } : {}),
              targeting: a.targeting,
              placement: a.placement,
              ...(a.pixelId ? { pixelId: a.pixelId } : {}),
              ...(a.conversionEvent ? { conversionEvent: a.conversionEvent } : {}),
              ...(a.startAt ? { startAt: a.startAt } : {}),
              ...(input.linkUrl ? { linkUrl: input.linkUrl } : {}),
              ...(input.whatsappNumber ? { whatsappNumber: input.whatsappNumber } : {}),
            },
            ads: input.creativeIds.map((creativeId, position) => ({
              // AD SIRAYLA: Ads Manager'da hangi varyantın hangisi olduğu
              // ancak addan anlaşılıyor ve hepsine aynı adı vermek, uzmanı
              // sonuçları eşleştiremez hâle getirirdi.
              name: `${input.name} — ${position + 1}`,
              creativeId,
              position,
            })),
          },
        ],
      },
    ],
    skipped: [],
    groupRequired: false,
    blockers: [],
  };
}

// -----------------------------------------------------------------------------
// Kayıt tipleri
// -----------------------------------------------------------------------------

export interface DraftAdRecord {
  id: string;
  name: string;
  position: number;
  creativeId: string;
  creativeName: string;
  externalAdId: string | null;
  error: string | null;
}

export interface DraftAdGroupRecord {
  id: string;
  name: string;
  position: number;
  socialProfileId: string | null;
  socialProfileName: string | null;
  leadFormId: string | null;
  settings: Record<string, unknown> | null;
  budgetMode: DraftBudgetMode;
  budgetAmountMicros: string | null;
  externalAdSetId: string | null;
  error: string | null;
  ads: DraftAdRecord[];
}

export interface DraftCampaignRecord {
  id: string;
  clientId: string;
  groupId: string | null;
  platform: DraftPlatform;
  adAccountId: string;
  adAccountName: string;
  name: string;
  surface: DraftSurface;
  goal: CampaignGoal | null;
  settings: Record<string, unknown> | null;
  budgetMode: DraftBudgetMode;
  budgetAmountMicros: string | null;
  startAt: string | null;
  endAt: string | null;
  status: DraftStatus;
  externalCampaignId: string | null;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
  adGroups: DraftAdGroupRecord[];
}

/**
 * Bir niyetin bütün platformlardaki hâli.
 *
 * KISMİ BAŞARININ ARAYÜZDEKİ KARŞILIĞI BU. Tek bir "durum" alanı yok; her
 * platform kendi satırını ve kendi hatasını taşıyor, böylece düşen taraf tek
 * başına yeniden denenebiliyor.
 */
export interface DraftGroupRecord {
  groupId: string | null;
  name: string;
  campaigns: DraftCampaignRecord[];
}
