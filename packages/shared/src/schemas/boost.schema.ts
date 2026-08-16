import { z } from 'zod';

/**
 * Modül 7 — Auto-Boost sözleşmeleri.
 *
 * KURAL MOTORUNDAN (Modül 5) TERS ASİMETRİ. Orada aksiyon çoğunlukla harcamayı
 * DURDURUYOR; burada BAŞLATIYOR. Yanlış duraklatılan kampanya yeniden açılır,
 * yanlış harcanan para geri gelmez.
 *
 * Bu yüzden Modül 5'in prova modu burada YETMİYOR: aday gönderiler `boost.approve`
 * yetkisi olan biri onaylayana kadar bekliyor. Otomatik onay açıkça
 * açılabiliyor ve o kararın kendisi de kaydediliyor.
 */

// -----------------------------------------------------------------------------
// Organik metrikler
// -----------------------------------------------------------------------------

export const BOOST_METRICS = [
  'engagements',
  'reach',
  'impressions',
  'likes',
  'comments',
  'shares',
  'saves',
  'video_views',
  /**
   * Etkileşim / erişim.
   *
   * MUTLAK SAYILARDAN DAHA İYİ BİR SEÇİM ÖLÇÜTÜ: 500 beğeni alan bir gönderi,
   * 200 bin kişiye ulaştıysa kötü performans göstermiş demektir. Mutlak eşik
   * kullanan bir kural, büyük sayfalarda her gönderiyi boost eder.
   */
  'engagement_rate',
] as const;
export type BoostMetric = (typeof BOOST_METRICS)[number];

export const BOOST_METRIC_META: Record<
  BoostMetric,
  { label: string; unit: 'count' | 'percent'; hint: string }
> = {
  engagements: {
    label: 'Etkileşim',
    unit: 'count',
    hint: 'Beğeni + yorum + paylaşım + kaydetme.',
  },
  reach: { label: 'Erişim', unit: 'count', hint: 'Gönderiyi gören tekil kişi sayısı.' },
  impressions: { label: 'Gösterim', unit: 'count', hint: 'Toplam görüntülenme.' },
  likes: { label: 'Beğeni', unit: 'count', hint: 'Beğeni sayısı.' },
  comments: { label: 'Yorum', unit: 'count', hint: 'Yorum sayısı.' },
  shares: { label: 'Paylaşım', unit: 'count', hint: 'Paylaşım sayısı.' },
  saves: { label: 'Kaydetme', unit: 'count', hint: 'Kaydedilme sayısı (Instagram).' },
  video_views: { label: 'Video izlenme', unit: 'count', hint: 'Video görüntüleme sayısı.' },
  engagement_rate: {
    label: 'Etkileşim oranı',
    unit: 'percent',
    hint: 'Etkileşim ÷ erişim. Mutlak sayıdan daha güvenilir bir seçim ölçütü.',
  },
};

export const boostConditionSchema = z.object({
  metric: z.enum(BOOST_METRICS),
  /** Boost seçiminde yalnızca "yeterince iyi mi" sorusu var; alt sınır aranıyor. */
  operator: z.enum(['gte', 'gt']),
  /** Oran metrikleri YÜZDE olarak: %4 için 4. */
  value: z.number().finite().nonnegative(),
});
export type BoostCondition = z.infer<typeof boostConditionSchema>;

export const MEDIA_TYPES = ['photo', 'video', 'carousel', 'reel', 'text', 'link'] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const MEDIA_TYPE_LABELS: Record<MediaType, string> = {
  photo: 'Fotoğraf',
  video: 'Video',
  carousel: 'Karusel',
  reel: 'Reels',
  text: 'Metin',
  link: 'Bağlantı',
};

// -----------------------------------------------------------------------------
// Kural
// -----------------------------------------------------------------------------

const money = z
  .string()
  .trim()
  .regex(/^\d{1,12}([.,]\d{1,2})?$/, 'Tutar en fazla 2 ondalıklı bir sayı olmalı')
  .refine((v) => Number(v.replace(',', '.')) > 0, 'Tutar sıfırdan büyük olmalı');

export const boostRuleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1000).nullable().optional(),
    clientId: z.string().uuid(),
    /** null = müşterinin tüm sosyal profilleri. */
    socialProfileId: z.string().uuid().nullable().optional(),
    conditions: z.array(boostConditionSchema).min(1).max(5),
    combinator: z.enum(['and', 'or']).default('and'),

    /**
     * Gönderi yaş penceresi.
     *
     * ALT SINIR DA VAR ve önemli: ilk saatlerdeki etkileşim gönderinin gerçek
     * performansını temsil etmiyor (takipçilerin ilk dalgası her gönderide
     * benzer). 6 saat beklemek, boost kararını gerçek veriye dayandırıyor.
     */
    minPostAgeHours: z.coerce.number().int().min(0).max(720).default(6),
    maxPostAgeHours: z.coerce.number().int().min(1).max(720).default(72),

    /** Boost başına günlük bütçe, kullanıcı biriminde. */
    dailyBudget: money,
    durationDays: z.coerce.number().int().min(1).max(30).default(3),
    objective: z.string().trim().max(60).default('OUTCOME_ENGAGEMENT'),

    /**
     * Bu kuralın bir ayda taahhüt edebileceği azami tutar.
     *
     * `monthly_budgets`ten AYRI ve ona EK. Aylık bütçe tüm harcamanın tavanı;
     * bu ise otomatik boost'un o bütçe içindeki payının tavanı. Tek bir yanlış
     * eşik aylık bütçenin tamamını boost'a yönlendirmesin diye.
     */
    monthlyCap: money,
    maxBoostsPerRun: z.coerce.number().int().min(1).max(50).default(3),

    /**
     * Onay olmadan boost açılsın mı. VARSAYILAN HAYIR.
     *
     * Para harcayan bir otomasyonun varsayılan olarak onaysız çalışması,
     * kullanıcının vermediği bir kararı onun adına vermek olur.
     */
    autoApprove: z.boolean().default(false),
    enabled: z.boolean().default(true),
  })
  .refine((v) => v.minPostAgeHours < v.maxPostAgeHours, {
    message: 'Alt yaş sınırı üst sınırdan küçük olmalı',
    path: ['minPostAgeHours'],
  })
  .refine(
    (v) =>
      Number(v.monthlyCap.replace(',', '.')) >=
      Number(v.dailyBudget.replace(',', '.')) * v.durationDays,
    {
      // Tavan tek bir boost'un maliyetini karşılamıyorsa kural HİÇBİR ZAMAN
      // boost açamaz — sessizce çalışmayan bir otomasyon.
      message: 'Aylık tavan, tek bir boost’un toplam maliyetinden küçük olamaz',
      path: ['monthlyCap'],
    },
  );
export type BoostRuleInput = z.infer<typeof boostRuleInputSchema>;

export const boostQuerySchema = z.object({
  clientId: z.string().uuid(),
  status: z
    .enum(['candidate', 'approved', 'rejected', 'creating', 'active', 'failed'])
    .optional(),
});
export type BoostQuery = z.infer<typeof boostQuerySchema>;

/** Onay / ret. Ayrı uç nokta, ayrı yetki (`boost.approve`). */
export const boostDecisionSchema = z.object({
  approve: z.boolean(),
});

// -----------------------------------------------------------------------------
// Kayıtlar
// -----------------------------------------------------------------------------

export const BOOST_STATUSES = [
  'candidate',
  'approved',
  'rejected',
  'creating',
  'active',
  'failed',
] as const;
export type BoostStatus = (typeof BOOST_STATUSES)[number];

export const BOOST_STATUS_LABELS: Record<BoostStatus, string> = {
  candidate: 'Onay bekliyor',
  approved: 'Onaylandı',
  rejected: 'Reddedildi',
  creating: 'Oluşturuluyor',
  active: 'Yayında',
  failed: 'Başarısız',
};

export interface OrganicPostRecord {
  id: string;
  socialProfileId: string;
  socialProfileName: string;
  externalId: string;
  mediaType: MediaType;
  message: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  publishedAt: string;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  videoViews: number;
  engagements: number;
  /** Etkileşim ÷ erişim, yüzde. Erişim sıfırsa null. */
  engagementRate: number | null;
  boostedAt: string | null;
}

// -----------------------------------------------------------------------------
// Elle boost — gönderi seçim listesi
// -----------------------------------------------------------------------------

/**
 * Elle boost ekranının gönderi satırı.
 *
 * `OrganicPostRecord`'a ÜÇ ALAN EKLİYOR ve üçü de aynı soruya cevap veriyor:
 * "bu gönderi öne çıkarılabilir mi, çıkarılamazsa neden".
 *
 * ÖNE ÇIKARILAMAYAN GÖNDERİ LİSTEDEN GİZLENMİYOR. Gizlemek en kolay yol ama
 * en kötüsü: kullanıcı Instagram gönderisini seçmeye geliyor, listede
 * bulamıyor ve senkronizasyonun bozuk olduğunu sanıyor. Sebebi yazmak,
 * sessizce elemekten her zaman iyi.
 */
export interface BoostablePostRecord extends OrganicPostRecord {
  profileType: 'facebook_page' | 'instagram_business';
  /** Faturalandırma hesabı — sayfaya bağlı hesap yoksa null. */
  adAccountId: string | null;
  /**
   * Boşsa öne çıkarılabilir. Doluysa SEBEP yazıyor ve ekran seçimi kapatıyor.
   *
   * Engel, uyarıdan farklı: buradaki bir değer "bu gönderi bugün
   * yayınlanamaz" demek ve ekranın düğmeyi kapatması gerekiyor.
   */
  blockedReason: string | null;
  /**
   * Engel DEĞİL, bilgi. Kullanıcı yine de öne çıkarabilir.
   *
   * Bugünkü tek kullanımı K20: daha önce öne çıkarılmış bir gönderiyi ikinci
   * kez öne çıkarmak reddedilmiyor — gönderiyi seçen kullanıcının kendisi ve
   * kararı geri çevirmek değil, bilgilendirmek doğru.
   */
  warning: string | null;
}

/**
 * Gönderi listesi — SAYIYLA BİRLİKTE.
 *
 * `items` tek başına dönseydi otuz satır gören kullanıcı bunun tamamı mı yoksa
 * kesilmiş bir liste mi olduğunu bilemezdi. "Sessiz kesme yok" kuralı: kaç
 * gösterildiği ve toplamın kaç olduğu her listede yazılı.
 */
export interface BoostablePostList {
  items: BoostablePostRecord[];
  /** Süzgece uyan TOPLAM — `items.length` sınırla kesilmiş olabilir. */
  total: number;
  limit: number;
}

export const boostablePostQuerySchema = z.object({
  clientId: z.string().uuid(),
  /** Boşsa müşterinin bütün sayfaları. */
  socialProfileId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type BoostablePostQuery = z.infer<typeof boostablePostQuerySchema>;

export interface BoostRecord {
  id: string;
  clientId: string;
  boostRuleId: string | null;
  boostRuleName: string | null;
  post: OrganicPostRecord;
  adAccountId: string;
  adAccountName: string;
  status: BoostStatus;
  dailyBudgetMicros: string;
  durationDays: number;
  /** `dailyBudget × duration` — taahhüt edilen toplam. */
  totalBudgetMicros: string;
  objective: string;
  reason: string;
  externalCampaignId: string | null;
  externalAdId: string | null;
  error: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface BoostRuleRecord {
  id: string;
  name: string;
  description: string | null;
  clientId: string;
  socialProfileId: string | null;
  socialProfileName: string | null;
  conditions: BoostCondition[];
  combinator: 'and' | 'or';
  minPostAgeHours: number;
  maxPostAgeHours: number;
  dailyBudgetMicros: string;
  durationDays: number;
  objective: string;
  monthlyCapMicros: string;
  maxBoostsPerRun: number;
  autoApprove: boolean;
  enabled: boolean;
  lastRunAt: string | null;
  /** Bu ay taahhüt edilen tutar — tavanın ne kadarı kullanıldı. */
  committedThisMonthMicros: string;
}
