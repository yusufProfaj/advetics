import { z } from 'zod';
import type { MetricTotals } from './metrics.schema';

/**
 * Modül 6 — White-label raporlama sözleşmeleri.
 *
 * Yapı, ajansın hâlihazırda elle hazırladığı rapordan çıkarıldı (Ege Birlik
 * Yapı, Temmuz 2026). Bu önemli: rapor formatı bizim icat ettiğimiz bir şey
 * değil, müşterinin alışkın olduğu ve onayladığı bir belge. Terminoloji de
 * oradan geliyor — CPA değil EBM, CTR değil TO.
 */

/**
 * Türkçe ajans terminolojisi.
 *
 * Panelde CPA/CPC/CTR kullanıyoruz çünkü orada izleyici reklam uzmanı. Raporda
 * izleyici MÜŞTERİ ve o kişi EBM/TBM/TO kısaltmalarını biliyor — Google Ads ve
 * Meta'nın Türkçe arayüzleri de bunları kullanıyor. Aynı metriğe iki ekranda
 * iki farklı ad vermek kafa karıştırıcı görünebilir ama izleyici farklı.
 *
 * Referans rapor her sayfada bu kısaltmaların TANIMINI dipnot olarak veriyor;
 * biz de veriyoruz.
 */
export const METRIC_LABELS = {
  spend: { label: 'Harcama', tr: 'Harcama' },
  impressions: { label: 'Gösterim', tr: 'Gösterim' },
  clicks: { label: 'Tıklama', tr: 'Tıklama' },
  reach: { label: 'Erişim', tr: 'Erişim' },
  ctr: { label: 'TO', tr: 'Tıklama Oranı', hint: 'Tıklama sayısının gösterim sayısına bölümü.' },
  cpc: {
    label: 'Ort. TBM',
    tr: 'Tıklama Başına Maliyet',
    hint: 'Toplam harcamanın tıklama sayısına bölümü.',
  },
  cpa: {
    label: 'EBM',
    tr: 'Edinme Başına Maliyet',
    hint: 'Toplam harcamanın dönüşüm sayısına bölümü.',
  },
  conversions: { label: 'Dönüşüm', tr: 'Dönüşüm' },
} as const;

/**
 * Rapor bölümleri.
 *
 * Prisma enum'u OLARAK tanımlanmadı: hiçbir kolonun tipi değil, `sections`
 * JSONB dizisinin içeriği. Veritabanında karşılığı olmayan bir enum bildirmek
 * yanlış izlenim verirdi.
 */
export const REPORT_SECTIONS = [
  'cover',
  'summary',
  'meta_campaigns',
  'google_campaigns',
  'google_keywords',
  'top_ads',
  'closing',
] as const;
export type ReportSection = (typeof REPORT_SECTIONS)[number];

export const SECTION_LABELS: Record<ReportSection, string> = {
  cover: 'Kapak',
  summary: 'Reklam Özet Raporu',
  meta_campaigns: 'Kampanyalar — Meta Ads',
  google_campaigns: 'Kampanyalar — Google Ads',
  google_keywords: 'Anahtar Kelime Performansı',
  top_ads: 'Öne Çıkan Reklamlar',
  closing: 'Kapanış',
};

/**
 * ADLANDIRILMIŞ DÖNÜŞÜM KOVALARI.
 *
 * Referans raporun Meta tablosunda "Form" ve "Mesaj" AYRI sütunlar — tek bir
 * "Dönüşüm" sayısı değil. Bu doğru: bir lead formu doldurmakla WhatsApp
 * konuşması başlatmak farklı işler ve müşteri ikisini ayrı görmek istiyor.
 *
 * Kovalar `insights_daily.raw_metrics` içindeki ham Meta aksiyon dizisinden
 * TÜRETİLİYOR, ayrı bir kolonda saklanmıyor. Sebep: hangi aksiyon türünün
 * hangi kovaya girdiği bir KARAR ve zamanla değişiyor. Kolon olsaydı her
 * değişiklikte 90 günlük veriyi yeniden çekmek gerekirdi; ham gövde durduğu
 * için sorgu anında yeniden hesaplıyoruz.
 */
export const CONVERSION_BUCKETS = {
  form: {
    label: 'Form',
    hint: 'Anlık form ve web sitesi form gönderimleri.',
    actionTypes: [
      'lead',
      'onsite_conversion.lead_grouped',
      'offsite_conversion.fb_pixel_lead',
      'leadgen_grouped',
      'onsite_conversion.lead_form_submit',
    ],
  },
  message: {
    label: 'Mesaj',
    hint: 'Başlatılan WhatsApp ve Messenger konuşmaları.',
    actionTypes: [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.total_messaging_connection',
      'onsite_conversion.messaging_first_reply',
    ],
  },
  purchase: {
    label: 'Satış',
    hint: 'Tamamlanan satın almalar.',
    actionTypes: [
      'purchase',
      'onsite_conversion.purchase',
      'offsite_conversion.fb_pixel_purchase',
      'omni_purchase',
    ],
  },
} as const;

export type ConversionBucket = keyof typeof CONVERSION_BUCKETS;
export const CONVERSION_BUCKET_KEYS = Object.keys(CONVERSION_BUCKETS) as ConversionBucket[];

// -----------------------------------------------------------------------------
// Sorgu ve yanıt
// -----------------------------------------------------------------------------

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı')
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Geçersiz tarih');

export const reportQuerySchema = z
  .object({
    clientId: z.string().uuid(),
    from: isoDate,
    to: isoDate,
    /** Şablon verilmezse organizasyon varsayılanı kullanılıyor. */
    templateId: z.string().uuid().optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: 'Başlangıç tarihi bitiş tarihinden sonra olamaz',
    path: ['from'],
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;

export const REPORT_SECTION_ENUM = z.enum(REPORT_SECTIONS);

export const reportTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().max(200).optional(),
  closingText: z.string().trim().max(2000).optional(),
  /** null = organizasyon varsayılanı. */
  clientId: z.string().uuid().nullable().optional(),
  sections: z.array(REPORT_SECTION_ENUM).min(1).max(REPORT_SECTIONS.length),
});
export type ReportTemplateInput = z.infer<typeof reportTemplateInputSchema>;

export const shareInputSchema = z
  .object({
    templateId: z.string().uuid(),
    clientId: z.string().uuid(),
    from: isoDate,
    to: isoDate,
    /** Gün cinsinden. Verilmezse süresiz. */
    expiresInDays: z.coerce.number().int().min(1).max(365).optional(),
  })
  .refine((v) => v.from <= v.to, { message: 'Geçersiz aralık', path: ['from'] });
export type ShareInput = z.infer<typeof shareInputSchema>;

/** Kova bazında dönüşüm sayıları. */
export type ConversionCounts = Record<ConversionBucket, number>;

export interface ReportCampaignRow extends MetricTotals {
  id: string;
  name: string;
  status: string;
  objective: string | null;
  /**
   * Erişim — TEK BİR KAMPANYANIN aralık boyunca erişimi.
   *
   * Günlük satırların TOPLAMI değil ortalaması: aynı kişi kampanyayı iki gün
   * de görmüş olabilir ve toplamak müşteriye iki kat kitle söylemek olur.
   * `reachIsDailyAverage` hangisi olduğunu söylüyor.
   */
  reach: number | null;
  reachIsDailyAverage: boolean;
  conversionCounts: ConversionCounts;
}

export interface ReportPlatformBlock extends MetricTotals {
  platform: 'meta' | 'google';
  label: string;
  currency: string | null;
  conversionCounts: ConversionCounts;
}

export interface ReportDailyPoint {
  date: string;
  conversionCounts: ConversionCounts;
  spendMicros: string;
}

export interface ReportData {
  client: { id: string; name: string };
  branding: {
    logoUrl: string | null;
    primaryColor: string;
    accentColor: string;
    fontFamily: string;
    footerText: string | null;
    hidePoweredBy: boolean;
  };
  title: string;
  closingText: string | null;
  from: string;
  to: string;
  sections: ReportSection[];
  currency: string | null;
  /** Platform blokları + TOPLAM. */
  platforms: ReportPlatformBlock[];
  total: ReportPlatformBlock | null;
  metaCampaigns: ReportCampaignRow[];
  googleCampaigns: ReportCampaignRow[];
  /** Günlük dönüşüm serisi — grafiğin verisi. */
  daily: ReportDailyPoint[];
  topAds: Array<{
    id: string;
    name: string;
    campaignName: string;
    imageUrl: string | null;
    headline: string | null;
    spendMicros: string;
    conversions: number;
    cpa: number | null;
    ctr: number | null;
  }>;
  /**
   * Anahtar kelime performansı.
   *
   * `null` "veri yok" DEĞİL, "bu yetenek henüz yok" demek: Google anahtar
   * kelime seviyesi senkronizasyonu yazılmadı ve Google Ads Basic Access onayı
   * bekleniyor. Boş dizi göstermek "anahtar kelimen yok" demek olurdu.
   */
  keywords: null | Array<{
    keyword: string;
    spendMicros: string;
    impressions: number;
    clicks: number;
    ctr: number | null;
    cpc: number | null;
  }>;
  generatedAt: string;
}
