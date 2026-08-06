import { z } from 'zod';
import { PLATFORMS } from '../constants/platforms';

/**
 * Metrik sorgu ve yanıt sözleşmeleri.
 *
 * TARİHLER STRING. `Date` değil.
 *
 * Postgres `DATE` kolonu ile JS `Date` arasındaki çevrim saat dilimine göre bir
 * gün kayıyor: `new Date('2026-08-05')` UTC gece yarısı demek ve Istanbul'da
 * 03:00, ama Los Angeles'ta ÖNCEKİ GÜN 17:00. Bir raporun "dün"ünün sunucunun
 * nerede durduğuna göre değişmesi kabul edilemez, bu yüzden tarih sınırda
 * string olarak taşınıyor ve yalnızca SQL içinde `::date` ile yorumlanıyor.
 */

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-MM-DD biçiminde olmalı')
  // Takvimsel geçerlilik: 2026-02-31 biçime uyuyor ama gün yok.
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, 'Geçersiz tarih');

/** Metrik kırılım seviyesi — `insights_daily.entity_level` ile aynı. */
export const METRIC_LEVELS = ['account', 'campaign', 'ad_group', 'ad'] as const;
export type MetricLevel = (typeof METRIC_LEVELS)[number];

/**
 * Ortak alanlar AYRI tutuluyor.
 *
 * Zod 3'te `.refine()` bir `ZodEffects` döndürüyor ve onun `.extend()` metodu
 * YOK. Doğrulamaları taban nesneye uygulayıp sonra genişletmeye çalışmak
 * derleme hatası veriyor; bu yüzden taban nesne saf bırakılıyor ve
 * doğrulamalar her şemaya ayrı ayrı ekleniyor.
 */
const metricsQueryBase = z.object({
  from: isoDate,
  to: isoDate,
  /** Belirli bir platforma daralt. Verilmezse hepsi. */
  platform: z.enum(PLATFORMS).optional(),
  /** Belirli bir reklam hesabına daralt. */
  adAccountId: z.string().uuid().optional(),
});

/**
 * Aralık yüklemleri.
 *
 * Doğrulamaları jenerik bir sarmalayıcıya almak denendi ve TİPİ BOZDU:
 * `<T extends z.ZodType<{from,to}>>` çıkarımı `{from, to}`'ya daraltıyor,
 * `level`/`limit` alanları kayboluyor. Yüklemleri paylaşıp `.refine()`
 * çağrılarını her şemada ayrı yazmak tipi tam koruyor — iki satır tekrar,
 * kaybedilen tip güvenliğinden ucuz.
 */
const orderOk = (v: { from: string; to: string }): boolean => v.from <= v.to;

const spanOk = (v: { from: string; to: string }): boolean => {
  const days = (Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86_400_000;
  return days <= 400;
};

const ORDER_MSG = {
  message: 'Başlangıç tarihi bitiş tarihinden sonra olamaz',
  path: ['from'],
};
// Aralık üst sınırı: partition pruning olsa bile 10 yıllık bir sorgu onlarca
// partition tarar ve veritabanını bekletir. 400 gün, yıldan yıla karşılaştırma
// için yeterli.
const SPAN_MSG = { message: 'Tarih aralığı en fazla 400 gün olabilir', path: ['to'] };

export const metricsQuerySchema = metricsQueryBase
  .refine(orderOk, ORDER_MSG)
  .refine(spanOk, SPAN_MSG);

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

export const breakdownQuerySchema = metricsQueryBase
  .extend({
    level: z.enum(METRIC_LEVELS).default('campaign'),
    limit: z.coerce.number().int().min(1).max(200).default(50),
  })
  .refine(orderOk, ORDER_MSG)
  .refine(spanOk, SPAN_MSG);
export type BreakdownQuery = z.infer<typeof breakdownQuerySchema>;

/**
 * Para tutarları STRING olarak taşınıyor.
 *
 * Micros `BigInt` ve JSON'da `BigInt` yok; `Number`a çevirmek 2^53'ün üstünde
 * hassasiyet kaybediyor (9,007 milyar micros = ~9.007 birim para — büyük
 * hesaplarda yıllık harcama bu sınıra yaklaşıyor). String taşımak kaybı
 * imkânsız kılıyor.
 */
export interface MetricTotals {
  impressions: number;
  clicks: number;
  /** Micros, string. */
  spendMicros: string;
  conversions: number;
  /** Micros, string. */
  conversionValueMicros: string;

  /**
   * Türetilmiş oranlar — SAKLANMIYOR, sorgu anında hesaplanıyor.
   *
   * `null` "hesaplanamaz" demek, sıfır demek DEĞİL:
   *   · ctr: gösterim yoksa null
   *   · cpa: dönüşüm yoksa null
   *   · roas: harcama VEYA dönüşüm değeri yoksa null — lead formu ve
   *     mesajlaşma kampanyalarında gelir hiç takip edilmiyor ve "0.00×"
   *     göstermek "sıfır getiri" anlamını dayatıyor.
   */
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cpa: number | null;
  roas: number | null;
}

/**
 * Para birimi durumu.
 *
 * Farklı para birimindeki hesapları toplamak sessizce yanlış sonuç üretir
 * (1 USD + 1 TRY = 2 ne?). `fx_rates` çevrimi henüz yok, bu yüzden karışık
 * durumu GİZLEMİYORUZ: tek para birimi varsa `currency` dolu ve toplam
 * anlamlı; birden fazlaysa `currency` null ve tutarlar `byCurrency` içinde
 * ayrı ayrı veriliyor.
 */
export interface CurrencyBreakdown {
  currency: string | null;
  byCurrency: Array<{ currency: string; spendMicros: string }>;
}

export interface MetricsSummary extends MetricTotals, CurrencyBreakdown {
  from: string;
  to: string;
  /** Önceki eşit uzunluktaki dönem — yüzde değişim için. */
  previous: MetricTotals | null;
  /** Metriklerin en son ne zaman doğrulandığı (ISO). Bayat veri uyarısı için. */
  lastFetchedAt: string | null;
  /** Veri bulunan reklam hesabı sayısı. */
  accountCount: number;
}

export interface MetricsTimeseriesPoint extends MetricTotals {
  date: string;
}

export interface MetricsBreakdownRow extends MetricTotals {
  entityId: string;
  entityExternalId: string;
  name: string;
  /** Üst varlık adı — reklam adları ad set'ler arasında tekrar ediyor. */
  parentName: string | null;
  platform: (typeof PLATFORMS)[number];
  status: string;
  currency: string;
}
