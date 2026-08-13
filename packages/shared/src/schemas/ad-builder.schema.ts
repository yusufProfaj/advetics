import { z } from 'zod';
import { CAMPAIGN_MODES, advancedSettingsSchema, type AdvancedSettings } from './campaign-advanced.schema';
import type { AssetCoverage } from './asset-routing.schema';

/**
 * Reklam Oluşturucu — Modül 4 (CREATE).
 *
 * TASARIM HEDEFİ: reklamcılık bilmeyen biri kullanabilsin.
 *
 * Bunun anlamı şu: Meta'nın karar sorduğu HER YERDE kararı biz veriyoruz.
 * Kullanıcıya yalnızca kendi işi hakkında bildiği şeyler soruluyor —
 * "ne yapmak istiyorsun", "kampanyanın adı ne", "ne yazalım", "günde ne kadar".
 *
 * Kullanıcıya SORULMAYAN, bizim karar verdiğimiz şeyler:
 *   · kampanya hedefi (objective)
 *   · optimizasyon hedefi (optimization_goal)
 *   · faturalama olayı (billing_event)
 *   · teklif stratejisi (bid_strategy)
 *   · yerleşimler (placements)
 *   · atıf ayarları (attribution)
 *   · reklam formatı (ad_format)
 *   · çağrı butonu (call to action)
 *
 * Bu liste bilinçli olarak uzun. Bunlardan birini "gelişmiş ayarlar" diye
 * göstermek, hedef kitlemizi kaybetmek demek: reklamcılık bilmeyen biri
 * "OUTCOME_LEADS mi OUTCOME_SALES mi" sorusuna cevap veremez ve o ekranı
 * kapatır.
 */

// -----------------------------------------------------------------------------
// Kampanya tipi — kullanıcının verdiği TEK stratejik karar
// -----------------------------------------------------------------------------

export const CAMPAIGN_GOALS = ['form', 'whatsapp', 'website'] as const;
export type CampaignGoal = (typeof CAMPAIGN_GOALS)[number];

export const GOAL_META: Record<
  CampaignGoal,
  {
    label: string;
    /** Kullanıcının kendi diliyle ne elde edeceği. */
    promise: string;
    /** Ne zaman seçilmeli — seçim ekranındaki yardım metni. */
    hint: string;
    /** Ek olarak neye ihtiyaç var. */
    requires: string;
  }
> = {
  form: {
    label: 'Form doldursunlar',
    promise: 'İnsanlar reklamın içinde açılan formu doldurur, iletişim bilgileri sana gelir.',
    hint: 'Teklif toplama, randevu, ön kayıt için. Web siten olmasa da çalışır.',
    requires: 'Facebook sayfası',
  },
  whatsapp: {
    label: 'WhatsApp’tan yazsınlar',
    promise: 'Reklama tıklayan kişi doğrudan WhatsApp’ta sana mesaj yazar.',
    hint: 'Hızlı iletişim ve satış görüşmesi için. Türkiye’de en yüksek dönüşen yol.',
    requires: 'Sayfaya bağlı WhatsApp numarası',
  },
  website: {
    label: 'Siteme gelsinler',
    promise: 'İnsanlar reklama tıklayıp web sitene gider.',
    hint: 'Ürün sayfası, blog yazısı ya da tanıtım sayfası varsa.',
    requires: 'Web sitesi adresi',
  },
};

// -----------------------------------------------------------------------------
// Görsel oranları
// -----------------------------------------------------------------------------

export const ASSET_RATIOS = ['square', 'vertical', 'horizontal'] as const;
export type AssetRatio = (typeof ASSET_RATIOS)[number];

export const RATIO_META: Record<
  AssetRatio,
  {
    label: string;
    /** En/boy — doğrulamada kullanılıyor. */
    aspect: number;
    /** Önerilen boyut. */
    recommended: string;
    /** Nerede görünecek — kullanıcı neden bunu yüklediğini anlasın. */
    shownAt: string;
    required: boolean;
  }
> = {
  square: {
    label: 'Kare',
    aspect: 1,
    recommended: '1080 × 1080',
    shownAt: 'Facebook ve Instagram akışı',
    /**
     * KARE ZORUNLU çünkü tek evrensel yedek.
     *
     * Meta bir yerleşim için görsel bulamazsa reklamı orada göstermiyor.
     * Kare görsel her yerleşimde (kırpılarak da olsa) çalışıyor; diğer ikisi
     * yoksa reklam yine yayınlanıyor, kare yoksa yayınlanmıyor.
     */
    required: true,
  },
  vertical: {
    label: 'Dikey',
    aspect: 9 / 16,
    recommended: '1080 × 1920',
    shownAt: 'Hikâyeler ve Reels',
    required: false,
  },
  horizontal: {
    label: 'Yatay',
    aspect: 16 / 9,
    recommended: '1200 × 628',
    shownAt: 'Sağ sütun ve video akışları',
    required: false,
  },
};

/**
 * Oran toleransı — %8.
 *
 * Tam 1:1 dayatmak, telefondan çekilmiş 1080×1077 bir görseli reddetmek olur
 * ve kullanıcı neyi yanlış yaptığını anlamaz. Meta'nın kendi kırpma toleransı
 * da bu civarda.
 */
export const RATIO_TOLERANCE = 0.08;

export function matchRatio(width: number, height: number): AssetRatio | null {
  if (width <= 0 || height <= 0) return null;
  const actual = width / height;
  for (const ratio of ASSET_RATIOS) {
    const expected = RATIO_META[ratio].aspect;
    if (Math.abs(actual - expected) / expected <= RATIO_TOLERANCE) return ratio;
  }
  return null;
}

/**
 * Meta'nın en küçük kabul ettiği kenar.
 *
 * Altında kalan görseli Meta reddetmiyor ama düşük çözünürlükte gösteriyor ve
 * bu projede reklam görsellerinin kalitesi zaten bir kez sorun oldu.
 */
export const MIN_IMAGE_EDGE = 600;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const ACCEPTED_MIME = ['image/jpeg', 'image/png'] as const;

// -----------------------------------------------------------------------------
// Metin sınırları
// -----------------------------------------------------------------------------

/**
 * Metin sınırları — TOPLU OLUŞTURUCUYLA AYNI KAYNAKTAN.
 *
 * `bulk.schema.ts` içindeki `TEXT_LIMITS` yeniden kullanılıyor. Burada ikinci
 * bir tanım yapmak, iki ekranın aynı metni farklı sınırlarla doğrulaması
 * demek olurdu: kullanıcı toplu oluşturucuda geçen bir başlığın burada
 * reddedildiğini görür ve hangisinin doğru olduğunu bilemez.
 *
 * Buradaki tek ekleme, sınırların KULLANICIYA GÖRÜNEN adı.
 */
export const AD_TEXT_FIELDS = {
  primaryText: { soft: 125, hard: 2000, label: 'Ana metin' },
  headline: { soft: 40, hard: 255, label: 'Başlık' },
  description: { soft: 30, hard: 255, label: 'Açıklama' },
} as const;

// -----------------------------------------------------------------------------
// Girdi
// -----------------------------------------------------------------------------

const money = z
  .string()
  .trim()
  .regex(/^\d{1,9}([.,]\d{1,2})?$/, 'Günlük bütçe sayı olmalı')
  .refine((v) => Number(v.replace(',', '.')) > 0, 'Günlük bütçe sıfırdan büyük olmalı');

export const adDraftInputSchema = z
  .object({
    clientId: z.string().uuid(),
    adAccountId: z.string().uuid(),
    /** Reklamın yayınlanacağı Facebook sayfası. */
    socialProfileId: z.string().uuid(),

    goal: z.enum(CAMPAIGN_GOALS),
    name: z.string().trim().min(1, 'Kampanyaya bir ad ver').max(200),

    primaryText: z.string().trim().min(1, 'Ana metin boş olamaz').max(2000),
    headline: z.string().trim().max(255).optional(),
    description: z.string().trim().max(255).optional(),

    /** `website` için zorunlu. */
    linkUrl: z.string().trim().max(2048).optional(),
    /**
     * `whatsapp` için. Boşsa sayfaya bağlı numara kullanılıyor.
     *
     * Ülke koduyla, boşluksuz: 905551112233.
     */
    whatsappNumber: z
      .string()
      .trim()
      .regex(/^\d{10,15}$/, 'Numara ülke koduyla ve yalnızca rakam olmalı')
      .optional()
      .or(z.literal('')),

    dailyBudget: money,
    /** Kaç gün yayında kalsın. 0 = süresiz. */
    durationDays: z.coerce.number().int().min(0).max(90).default(7),

    /**
     * simple | advanced — "tek giriş, iki mod".
     *
     * Aynı taslak iki modda da açılabiliyor. Gelişmişe geçen kullanıcı
     * görsellerini ve metinlerini kaybetmiyor; yalnızca Meta'ya giden
     * kararların kimin verdiği değişiyor.
     */
    mode: z.enum(CAMPAIGN_MODES).default('simple'),
    advanced: advancedSettingsSchema.optional(),
    /** Gelişmiş modda kütüphaneden seçilen anlık form. */
    leadFormId: z.string().uuid().optional(),
  })
  .superRefine((v, ctx) => {
    // GELİŞMİŞ MOD AYARSIZ OLAMAZ.
    //
    // Modu gelişmiş görünüp ayarı olmayan bir taslak, yayın anında "hangi
    // hedefi kullanayım" sorusunu cevapsız bırakır. Veritabanı kısıtı da
    // aynı şeyi söylüyor; burada söylemek hatayı formda gösteriyor.
    if (v.mode === 'advanced' && !v.advanced) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['advanced'],
        message: 'Gelişmiş modda kampanya ayarları zorunlu',
      });
    }

    if (v.goal === 'website') {
      const url = v.linkUrl?.trim();
      if (!url) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linkUrl'],
          message: 'Siteye trafik için web sitesi adresi gerekiyor',
        });
      } else if (!/^https?:\/\/.+\..+/i.test(url)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['linkUrl'],
          message: 'Adres http:// ya da https:// ile başlamalı',
        });
      }
    }
  });
export type AdDraftInput = z.infer<typeof adDraftInputSchema>;

// -----------------------------------------------------------------------------
// Kayıtlar
// -----------------------------------------------------------------------------

export const AD_DRAFT_STATUSES = ['draft', 'publishing', 'published', 'failed'] as const;
export type AdDraftStatus = (typeof AD_DRAFT_STATUSES)[number];

export const AD_DRAFT_STATUS_LABELS: Record<AdDraftStatus, string> = {
  draft: 'Taslak',
  publishing: 'Yayınlanıyor',
  published: 'Yayında',
  failed: 'Başarısız',
};

export interface AdAssetRecord {
  id: string;
  ratio: AssetRatio;
  fileName: string;
  width: number;
  height: number;
  byteSize: number;
  /** Önizleme adresi — kimlik doğrulamalı. */
  previewUrl: string;
}

export interface AdDraftRecord {
  id: string;
  clientId: string;
  adAccountId: string;
  adAccountName: string;
  socialProfileId: string;
  socialProfileName: string;
  goal: CampaignGoal;
  name: string;
  primaryText: string;
  headline: string | null;
  description: string | null;
  linkUrl: string | null;
  whatsappNumber: string | null;
  dailyBudgetMicros: string;
  durationDays: number;
  mode: (typeof CAMPAIGN_MODES)[number];
  advanced: AdvancedSettings | null;
  leadFormId: string | null;
  status: AdDraftStatus;
  assets: AdAssetRecord[];
  externalCampaignId: string | null;
  externalAdId: string | null;
  error: string | null;
  publishedAt: string | null;
  createdAt: string;
}

/** Yayınlanmadan önce gösterilen kontrol listesi. */
export interface PublishCheck {
  ok: boolean;
  /** Yayını ENGELLEYEN sorunlar. */
  blockers: string[];
  /** Engellemeyen ama söylenmesi gereken şeyler. */
  warnings: string[];
  /** Kullanıcının onaylayacağı özet: "Günde 200 ₺ · 7 gün · toplam 1.400 ₺". */
  summary: string;
  totalBudgetMicros: string;
  /**
   * Yuva kapsaması — Meta VE Google.
   *
   * Meta kapsamasının engelleri `blockers` içine de giriyor ve yayını
   * durduruyor. GOOGLE KAPSAMASI BİLGİLENDİRME: Google yazma yolu henüz yok
   * ve onun engellerini Meta yayınının önüne koymak, çalışan bir akışı
   * yazılmamış bir özellik yüzünden durdurmak olurdu.
   *
   * Yine de gösteriliyor: ajans aynı görsel setiyle Google'a da çıkacaksa
   * neyin eksik olduğunu görselleri yüklerken bilmeli, aylar sonra değil.
   */
  assetCoverage: AssetCoverage[];
}
