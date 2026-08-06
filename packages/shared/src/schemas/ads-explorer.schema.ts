import { z } from 'zod';
import { PLATFORMS } from '../constants/platforms';
import type { MetricTotals } from './metrics.schema';

/**
 * Ads Explorer — reklam düzeyinde arama, süzme ve creative inceleme.
 *
 * Modül 3'ün panelinden farkı: orada soru "nasıl gidiyoruz", burada "hangi
 * reklam neyi yapıyor". Bu yüzden creative İÇERİĞİ (metin, görsel, CTA, hedef)
 * ve İNCELEME DURUMU (reddedilme sebepleri) birinci sınıf alanlar.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Geçersiz tarih');

/** Reklam durumu — `EntityStatus` ile aynı sözlük. */
export const AD_STATUSES = [
  'active',
  'paused',
  'deleted',
  'pending_review',
  'ended',
  'unknown',
] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/**
 * Sıralama alanları.
 *
 * Türetilmiş metrikler (ctr, cpa) de sıralanabiliyor ve SQL içinde
 * hesaplanıyor — istemcide sıralamak yalnızca o SAYFAYI sıralar ve
 * "en pahalı reklam" sorusunu yanlış yanıtlar.
 */
export const AD_SORT_FIELDS = [
  'spend',
  'impressions',
  'clicks',
  'conversions',
  'ctr',
  'cpa',
  'name',
] as const;
export type AdSortField = (typeof AD_SORT_FIELDS)[number];

export const adsExploreQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    platform: z.enum(PLATFORMS).optional(),
    adAccountId: z.string().uuid().optional(),
    campaignId: z.string().uuid().optional(),
    adGroupId: z.string().uuid().optional(),
    status: z.enum(AD_STATUSES).optional(),
    /** Yalnızca inceleme sorunu olan reklamlar. */
    onlyIssues: z.coerce.boolean().optional(),
    /** Reklam ya da creative metninde arama. */
    q: z.string().trim().max(120).optional(),
    sort: z.enum(AD_SORT_FIELDS).default('spend'),
    dir: z.enum(['asc', 'desc']).default('desc'),
    /**
     * Sayfalama OFFSET tabanlı.
     *
     * Cursor daha ölçeklenir ama burada sıralama kullanıcı seçimli ve türetilmiş
     * metriklere göre olabiliyor; cursor'ı harcamaya göre kurmak sıralama
     * değiştiğinde bozulur. Reklam sayısı hesap başına binler mertebesinde,
     * offset bu ölçekte sorun değil.
     */
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine((v) => v.from <= v.to, {
    message: 'Başlangıç tarihi bitiş tarihinden sonra olamaz',
    path: ['from'],
  })
  .refine(
    (v) =>
      (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000 <= 400,
    { message: 'Tarih aralığı en fazla 400 gün olabilir', path: ['to'] },
  );

export type AdsExploreQuery = z.infer<typeof adsExploreQuerySchema>;

/** Creative içeriği — reklamın ne söylediği. */
export interface AdCreative {
  externalId: string;
  creativeType: string | null;
  headline: string | null;
  primaryText: string | null;
  description: string | null;
  ctaType: string | null;
  destinationUrl: string | null;
  displayUrl: string | null;
  /**
   * Görsel adresleri.
   *
   * Platform CDN adresleri ve SÜRESİ DOLABİLİYOR. Arayüz yüklenmeyen görseli
   * yer tutucuyla karşılamak zorunda; kırık resim ikonu göstermek panelin
   * bozuk olduğu izlenimi verir.
   */
  assetUrls: string[];
}

/**
 * İnceleme sorunu.
 *
 * Meta ve Google reddedilme bilgisini tamamen farklı şekillerde veriyor
 * (Meta: `ad_review_feedback` serbest biçimli nesne; Google:
 * `policy_topic_entries` dizisi). İkisi de burada normalize ediliyor —
 * arayüzün platform bilmesi gerekmiyor.
 */
export interface AdReviewIssue {
  /** Politika başlığı ya da alan adı. */
  topic: string;
  /** Platformun açıklaması. */
  detail: string | null;
}

export interface AdExplorerRow extends MetricTotals {
  id: string;
  externalId: string;
  name: string;
  status: AdStatus;
  effectiveStatus: string | null;
  platform: (typeof PLATFORMS)[number];
  currency: string;

  adGroupId: string;
  adGroupName: string;
  campaignId: string;
  campaignName: string;
  campaignObjective: string | null;

  /** Platformda silinmiş — geçmiş metrikleri korunuyor. */
  deleted: boolean;
  reviewStatus: string | null;
  issues: AdReviewIssue[];

  creative: AdCreative | null;
  previewUrl: string | null;
}

export interface AdsExploreResult {
  rows: AdExplorerRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Aralıktaki tüm reklamların toplamı — sayfadaki değil. */
  totals: MetricTotals;
  currency: string | null;
  /** Süzgeç panelini doldurmak için. */
  facets: {
    /**
     * Reklam hesapları.
     *
     * Kampanya süzgecinden ÖNCE gelmesi gerekiyor: bir ajans görünümünde
     * onlarca kampanya var ve hangi müşteriye ait olduğu ancak hesaptan
     * anlaşılıyor. Hesap seçilmeden kampanya listesi anlamsız uzunlukta.
     */
    adAccounts: Array<{ id: string; name: string; platform: string; adCount: number }>;
    campaigns: Array<{ id: string; name: string; adCount: number }>;
    statuses: Array<{ status: AdStatus; count: number }>;
    issueCount: number;
  };
}

/** Tek reklam detayı — günlük seyir dâhil. */
export interface AdDetail extends AdExplorerRow {
  daily: Array<{ date: string } & MetricTotals>;
  /**
   * Erişim — reklam düzeyinde.
   *
   * Toplanamıyor: aynı kişi reklamı iki gün de görmüş olabilir. Tek günlük
   * aralıkta tam, çok günlü aralıkta günlük ortalama; `reachKind` hangisi
   * olduğunu söylüyor.
   */
  reach: number | null;
  reachKind: 'exact' | 'daily_average';
  /** Ham platform alanları — teşhis için. */
  raw: unknown;
}
