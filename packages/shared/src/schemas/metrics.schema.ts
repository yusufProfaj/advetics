import { z } from 'zod';

/**
 * Geçmiş metrik çekme (backfill) isteği.
 *
 * "Şimdi güncelle" bilerek yalnızca BUGÜNÜ çekiyor. Geriye dönük çekim ayrı,
 * çünkü maliyeti bambaşka: 90 gün × hesap sayısı kadar API çağrısı ve Google
 * tarafında günlük kota bittiğinde senkronizasyon ertesi güne kalıyor.
 *
 * `apply` VARSAYILAN OLARAK FALSE. Sunucudaki `sync-cli` ile aynı desen: önce
 * ne olacağını söyle, sonra uygula. Panelde tek tık ile 90 günü başlatmak,
 * kotayı geri alınamaz biçimde harcamanın en kolay yolu olurdu.
 */
export const backfillSchema = z.object({
  /**
   * Kaç gün geriye. Üst sınır 365: Meta 37 aya kadar veri veriyor ama tek
   * seferde bir yıldan fazlasını istemek, iş başına dönen satır sayısını
   * hesabın işleyemeyeceği boyuta çıkarıyor.
   */
  days: z.number().int().min(1).max(365),
  apply: z.boolean().default(false),
});
export type BackfillInput = z.infer<typeof backfillSchema>;
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

/**
 * Erişim nasıl hesaplandı.
 *
 * Erişim TEKİL KULLANICI sayısı ve TOPLANAMAZ — iki günün erişimini toplamak
 * aynı kişiyi iki kez sayar. `insights_daily` günlük granülerlikte, yani çok
 * günlü bir aralık için gerçek tekil erişimi hesaplamak imkânsız; onu
 * platformdan o aralıkla sormak gerekir.
 *
 *   'exact'        → aralık tek gün, değer platformun bildirdiği tekil erişim
 *   'daily_average' → çok günlü aralık, değer GÜNLÜK ORTALAMA
 *
 * Arayüz etiketi buna göre değişmek zorunda: "Erişim: 106.412" ile "Günlük
 * ort. erişim: 106.412" farklı şeyler ve ikincisini birincisi gibi sunmak
 * müşteriye yanlış kitle büyüklüğü söylemek olur.
 */
export type ReachKind = 'exact' | 'daily_average';

export interface MetricsSummary extends MetricTotals, CurrencyBreakdown {
  from: string;
  to: string;
  /**
   * Erişim — hesap seviyesi satırlarından.
   *
   * Kampanya seviyesinden toplamak mükerrer sayardı: aynı kişi iki kampanyayı
   * da görmüş olabilir. Hesap seviyesi satırı yoksa (bazı platformlarda) null.
   */
  reach: number | null;
  reachKind: ReachKind;
  /** Birden fazla hesap varsa erişim hesaplar arası mükerrer olabilir. */
  reachAcrossAccounts: boolean;
  /** Önceki eşit uzunluktaki dönem — yüzde değişim için. */
  previous: MetricTotals | null;
  /** Metriklerin en son ne zaman doğrulandığı (ISO). Bayat veri uyarısı için. */
  lastFetchedAt: string | null;
  /** Veri bulunan reklam hesabı sayısı. */
  accountCount: number;
  /**
   * İZLENMESİ KAPALI olduğu için panele girmeyen hesap sayısı.
   *
   * Sessizce kaybolan veri bu projede tekrar eden hata deseni. Kapatılan bir
   * hesabın harcaması genel toplamdan düştüğünde, sebebini görmeyen kullanıcı
   * "harcama neden düştü" diye sorar. Sayı burada, arayüz bunu yazıyor.
   */
  hiddenAccounts: number;
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

// -----------------------------------------------------------------------------
// ROAS — TEK KAYNAK
// -----------------------------------------------------------------------------

/**
 * Dönüşüm başına bu değerin altı GERÇEK GELİR SAYILMIYOR.
 *
 * Google Ads'te dönüşüm eylemine değer atanmadığında varsayılan 1 birim
 * kullanılıyor. Sonuç: `conversion_value == conversions`. Canlı veriden
 * (Ege Birlik Yapı, 4-10 Ağustos 2026):
 *
 *     38 dönüşüm → 38 TRY      31 dönüşüm → 31 TRY
 *     19,5 dönüşüm → 19,5 TRY  17 dönüşüm → 16 TRY
 *
 * Hiçbir işte bir form ya da telefon dönüşümü 1 TL etmiyor. Bu değer bir
 * ölçüm değil, Google'ın yer tutucusu.
 */
const PLACEHOLDER_VALUE_PER_CONVERSION = 1;

/**
 * ROAS — yer tutucu gelir tespit edilirse `null`.
 *
 * NEDEN TEK FONKSİYON: bu kural hem panelde hem raporda gerekiyor. İki yerde
 * ayrı yazmak, ikisinin zamanla ayrışması demek — bu projede panelin ve
 * raporun aynı soruya farklı cevap vermesi bir kez yaşandı ve müşteriye giden
 * belgeyle ekranın çelişmesine yol açtı.
 *
 * ÜÇ DURUM:
 *   · harcama yok        → null (bölünecek bir şey yok)
 *   · gelir yok          → null. "0.00×" göstermek "sıfır getiri" anlamını
 *                          dayatıyor ve gelir hiç takip edilmeyen bir lead
 *                          kampanyasını battı gösteriyor.
 *   · gelir YER TUTUCU   → null. Teknik olarak sıfırdan büyük ama ölçüm değil;
 *                          0,02× göstermek "her liraya 2 kuruş dönüyor" diye
 *                          okunuyor ve gerçekte öyle bir şey söylenmiyor.
 *
 * @param spendUnits   harcama, PARA BİRİMİNDE (micros değil)
 * @param valueUnits   dönüşüm değeri, para biriminde
 * @param conversions  dönüşüm sayısı — yer tutucu tespiti için gerekli
 */
export function deriveRoas(
  spendUnits: number,
  valueUnits: number,
  conversions: number,
): number | null {
  if (spendUnits <= 0 || valueUnits <= 0) return null;

  // YER TUTUCU TESPİTİ. Dönüşüm başına ortalama değer 1 birimi aşmıyorsa
  // gerçek gelir takibi yok demektir.
  //
  // Eşiğin ALTINI da kapsıyor: bazı dönüşüm eylemlerine 1, bazılarına 0
  // atanmış hesaplarda ortalama 1'in altına düşüyor (canlı veride
  // 17 dönüşüm → 16 TRY gibi). Ortalama 1'i AŞTIĞI anda gerçek bir değer
  // tanımlanmış sayılıyor.
  if (conversions > 0 && valueUnits / conversions <= PLACEHOLDER_VALUE_PER_CONVERSION) {
    return null;
  }

  return valueUnits / spendUnits;
}
