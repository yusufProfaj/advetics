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
 * "Dönüşüm" sayısı değil. Bir lead formu doldurmakla WhatsApp konuşması
 * başlatmak farklı işler ve müşteri ikisini ayrı görmek istiyor.
 *
 * `actionTypes` bir ÖNCELİK SIRASI, toplanacak liste DEĞİL. İlk DOLU olan
 * kazanıyor, diğerleri yok sayılıyor.
 *
 * NEDEN: Meta aynı olayı birden fazla aksiyon türü altında raporluyor. Canlı
 * hesapta ölçülen değerler (Ege Birlik Yapı, 1-6 Ağustos 2026):
 *
 *     lead                                        40
 *     onsite_conversion.lead_grouped              40   ← AYNI 40 lead
 *     onsite_conversion.messaging_conversation_started_7d   20
 *     onsite_conversion.total_messaging_connection          20   ← AYNI 20
 *     onsite_conversion.messaging_first_reply               19   ← BAŞKA olay
 *
 * İlk hâlinde bunlar TOPLANIYORDU ve rapor "Mesaj: 59" gösteriyordu — gerçek
 * sayı 20. Müşteriye üç kat konuşma raporlanıyordu.
 *
 * Kovalar `insights_daily.raw_metrics` içindeki ham aksiyon dizisinden sorgu
 * anında türetiliyor, kolonda saklanmıyor: bu liste bir KARAR ve değiştiğinde
 * 90 günlük veriyi yeniden çekmek gerekmesin.
 */
export const CONVERSION_BUCKETS = {
  form: {
    label: 'Form',
    hint: 'Anlık form ve web sitesi form gönderimleri.',
    /**
     * `lead` Meta'nın toplayıcı metriği: onsite (anlık form) + offsite (pixel)
     * lead'lerinin toplamı. Varsa tek başına doğru sayıyı veriyor; yoksa
     * bileşenlerine düşülüyor.
     */
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
    /**
     * "Başlatılan konuşma" ölçülen şey. `total_messaging_connection` aynı
     * değeri veriyor, `messaging_first_reply` ise SONRAKİ bir olay (kullanıcı
     * cevap verdi) — onu eklemek aynı konuşmayı iki kez saymak olur.
     */
    actionTypes: [
      'onsite_conversion.messaging_conversation_started_7d',
      'onsite_conversion.total_messaging_connection',
    ],
  },
  purchase: {
    label: 'Satış',
    hint: 'Tamamlanan satın almalar.',
    /** `omni_purchase` kanallar arası toplayıcı; varsa en kapsayıcı olan o. */
    actionTypes: [
      'omni_purchase',
      'purchase',
      'offsite_conversion.fb_pixel_purchase',
      'onsite_conversion.purchase',
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

/**
 * SEÇİLEBİLİR METRİKLER — `METRIC_LABELS` TEK KAYNAK.
 *
 * Ekrandaki seçim listesi, sunucudaki doğrulama ve belgedeki sütunlar aynı
 * listeden besleniyor. Üçünü ayrı yazmak, birinin güncellenmemesi hâlinde
 * ekranda seçilebilen ama rapora hiç çıkmayan bir metrik demek — ve
 * TypeScript bunu söylemiyor.
 */
export const METRIC_KEYS = Object.keys(METRIC_LABELS) as Array<keyof typeof METRIC_LABELS>;
export type MetricKey = (typeof METRIC_KEYS)[number];
const METRIC_KEY_ENUM = z.enum(METRIC_KEYS as [MetricKey, ...MetricKey[]]);

/**
 * DÖNÜŞÜM KOVALARI YALNIZCA META'DA VAR.
 *
 * Google `actions` dizisi döndürmüyor; form/mesaj dökümü orada YOK ve 0
 * yazmak "hiç form gelmedi" gibi okunur. Seçim ekranı bunu gizlemek yerine
 * sebebiyle söylemek zorunda.
 */
export const BUCKET_KEYS = ['form', 'message', 'purchase'] as const;
export type BucketKey = (typeof BUCKET_KEYS)[number];

/**
 * BÖLÜM AYARLARI — `report_templates.options` JSONB'sinin şeması.
 *
 * Kolon migration'da ve Prisma'da baştan beri vardı, yorumu tam bu işi tarif
 * ediyordu ve TEK SATIR KOD onu okumuyordu. Artık okuyor.
 *
 * AYRIK BİRLEŞİM DEĞİL, BÖLÜM ANAHTARLI HARİTA: bölümlerin çoğu aynı iki
 * ayarı taşıyor (hangi metrikler, kaç satır) ve her biri için ayrı bir dal
 * yazmak, yeni bölüm eklendiğinde unutulacak bir yer daha demek.
 *
 * GÜVENLİ, ÇÜNKÜ OKURKEN ALAN ALAN EŞLENİYOR: JSONB olduğu gibi belgeye
 * geçmiyor. `auto_boost_presets.settings` deseni — bilinmeyen bir anahtarı
 * sessizce taşımak, ekranda "hazır" görünen bozuk bir kayıt üretir.
 */
export const sectionOptionsSchema = z.object({
  /**
   * Bu bölümde gösterilecek metrikler. Boş dizi = varsayılana dön.
   *
   * `undefined` ile boş dizi AYNI ŞEY DEĞİL: kullanıcı hepsini kaldırdıysa
   * bunu bir seçim olarak saklamak, bir dahaki açılışta boş bir tablo
   * göstermek olurdu. Boş kalan bölüm varsayılan sütunlarına dönüyor ve bu
   * ekranda yazılı.
   */
  metrics: z.array(METRIC_KEY_ENUM).max(METRIC_KEYS.length).optional(),
  /** Kaç satır gösterilecek (kampanya/kelime/reklam tabloları). */
  limit: z.number().int().min(1).max(100).optional(),
  /** Meta dönüşüm kovaları (form/mesaj/satış) sütun olarak gösterilsin mi. */
  buckets: z.array(z.enum(BUCKET_KEYS)).optional(),
});
export type SectionOptions = z.infer<typeof sectionOptionsSchema>;

export const reportOptionsSchema = z.record(REPORT_SECTION_ENUM, sectionOptionsSchema);
export type ReportOptions = z.infer<typeof reportOptionsSchema>;

export const reportTemplateInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  title: z.string().trim().max(200).optional(),
  closingText: z.string().trim().max(2000).optional(),
  /** null = organizasyon varsayılanı. */
  clientId: z.string().uuid().nullable().optional(),
  /*
   * SIRA BURADA VE TEKRAR YASAK.
   *
   * Aynı bölüm iki kez yazılırsa React aynı `key` ile iki düğüm basıyor ve
   * belgede bölüm iki kez çıkıyor. Şema bunu reddediyor: `parseSections`
   * geçersizleri eliyor ama tekrarı elemiyordu.
   */
  sections: z
    .array(REPORT_SECTION_ENUM)
    .min(1)
    .max(REPORT_SECTIONS.length)
    .refine((a) => new Set(a).size === a.length, 'Aynı bölüm iki kez eklenemez'),
  options: reportOptionsSchema.optional(),
});
export type ReportTemplateInput = z.infer<typeof reportTemplateInputSchema>;

/** Şablon listesi satırı — düzenleme ekranı bunu okuyor. */
export interface ReportTemplateSummary {
  id: string;
  name: string;
  clientId: string | null;
  clientName: string | null;
  sections: ReportSection[];
  options: ReportOptions;
  title: string | null;
  closingText: string | null;
  updatedAt: string;
  /**
   * Bu şablondan üretilmiş AKTİF paylaşım linki sayısı.
   *
   * Silme uçtan `ON DELETE CASCADE` ile bu linkleri de siliyor. Sayıyı
   * göstermeden silme sormak, müşteriye gönderilmiş bir raporu haber
   * vermeden 404'e çevirmek olurdu.
   */
  shareCount: number;
}

export const shareInputSchema = z
  .object({
    /**
     * Şablon — VERİLMEZSE sunucu bulur ya da oluşturur.
     *
     * Zorunlu tutmak, ilk raporu göndermek isteyen kullanıcıyı önce şablon
     * oluşturmaya zorlardı. Varsayılan şablon tüm bölümleri içeriyor ve
     * sonradan düzenlenebiliyor.
     */
    templateId: z.string().uuid().optional(),
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
  /**
   * VERİ KAPSAMASI — bu kampanyanın aralıkta kaç günü var.
   *
   * Yeni senkronize edilmiş bir kampanya aralığın yalnızca bir gününü
   * kapsayabiliyor. Rapor "1-6 Ağustos" derken o satır tek günü gösteriyor ve
   * müşteri bunu "bu kampanya neredeyse hiç harcamamış" diye okuyor — oysa
   * veri eksik. Farkı göstermeden rapor göndermek yanıltıcı olur.
   */
  dayCount: number;
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
  /**
   * BÖLÜM AYARLARI — hangi metrik sütunları, kaç satır.
   *
   * Şablonda saklanıyordu ama belgeye HİÇ ULAŞMIYORDU: `build()` yalnızca
   * `sections` döndürüyordu ve seçilen metrikler sessizce yok sayılıyordu.
   * Bir ayarı kaydedip hiçbir yerde göremeyen kullanıcı, özelliğin bozuk
   * olduğunu değil kendi yaptığını yanlış yaptığını düşünüyor.
   */
  options: ReportOptions;
  /** Aralıktaki gün sayısı — kampanya kapsamasıyla karşılaştırmak için. */
  rangeDays: number;
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
