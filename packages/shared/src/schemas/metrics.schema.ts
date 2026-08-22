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

/**
 * "Şimdi güncelle" gövdesi — EKRANDA SEÇİLİ ARALIK.
 *
 * Düğme bir süre yalnızca BUGÜNÜN verisini tazeliyordu. Kullanıcı "Son 30
 * gün" seçip düğmeye basıyor, hiçbir şey değişmiyordu — çünkü tazelenen gün
 * seçili aralığın içinde bile olsa geri kalan 29 gün hiç dokunulmuyordu.
 * Adı ile yaptığı iş ayrışıyordu.
 *
 * Alanlar OPSİYONEL: gövdesiz çağrı eski davranışı (bugün) koruyor.
 */
export const refreshRangeSchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD bekleniyor')
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD bekleniyor')
    .optional(),
});
export type RefreshRangeInput = z.infer<typeof refreshRangeSchema>;
import { PLATFORMS, type Platform } from '../constants/platforms';

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

/**
 * KARŞILAŞTIRMA PENCERESİ AÇIKÇA GELİYOR — sunucuda türetilmiyor.
 *
 * Önceki dönem bir süre `summary()` içinde koşulsuz hesaplanıyordu: her
 * çağrıda ikinci bir tam tarama yapılıyor, kullanıcı ne kapatabiliyor ne de
 * "önceki yıl" gibi başka bir pencere seçebiliyordu.
 *
 * Pencereyi İSTEMCİNİN göndermesi tercih edildi çünkü seçim zaten orada
 * yapılıyor ve ekranda hangi dönemle karşılaştırıldığı YAZILIYOR. Sunucu ayrı
 * bir hesap yaparsa iki taraf ayrışır ve "%12 arttı" diyen ekran ile
 * gerçekte karşılaştırılan dönem farklı olur — üstelik hiçbir hata vermeden.
 *
 * İkisi de verilmezse karşılaştırma KAPALI.
 */
const compareAlanlari = {
  compareFrom: isoDate.optional(),
  compareTo: isoDate.optional(),
};

export const metricsQuerySchema = metricsQueryBase
  .extend(compareAlanlari)
  .refine(orderOk, ORDER_MSG)
  .refine(spanOk, SPAN_MSG);

export type MetricsQuery = z.infer<typeof metricsQuerySchema>;

export const breakdownQuerySchema = metricsQueryBase
  /*
   * KIRILIM DA KARŞILAŞTIRMA ALIYOR. Alanlar tabanda değil burada tekrar
   * ediliyor gibi görünüyor ama tek tanımdan (`compareAlanlari`) geliyor —
   * ayrı yazılsalardı panelin iki ucu farklı pencerelerle karşılaştırırdı.
   */
  .extend(compareAlanlari)
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

/**
 * Zaman serisi — cari dönem ve (istenmişse) karşılaştırma dönemi.
 *
 * DÜZ DİZİ DEĞİL, İKİ DİZİ. Karşılaştırma penceresinin TARİHLERİ farklı;
 * hepsini tek diziye koymak, grafiği çizen tarafı "bu nokta hangi döneme
 * ait" sorusunu tarih aralığından tekrar türetmeye zorlardı — ve o türetme
 * iki yerde birden yazılınca ayrışır.
 *
 * `previous` NULL: karşılaştırma kapalı. Boş dizi DEĞİL — "karşılaştırma
 * istenmedi" ile "istendi ama o dönemde hiç veri yok" farklı iki şey ve
 * grafiğin ikincisinde efsanede önceki dönemi GÖSTERMESİ, birincisinde
 * göstermemesi gerekiyor.
 */
export interface MetricsTimeseries {
  points: MetricsTimeseriesPoint[];
  previous: MetricsTimeseriesPoint[] | null;
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
  /**
   * Önceki dönem — yüzde değişim için.
   *
   * `null` = o varlığın önceki dönemde HİÇ verisi yok. Sıfırlı bir nesne
   * döndürmek her yeni kampanyayı "-%100" gösterirdi; özet uçta aynı kural
   * zaten var (`hasData`).
   *
   * Karşılaştırma istenmediğinde de `null`.
   */
  previous: MetricTotals | null;
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

// -----------------------------------------------------------------------------
// Senkronizasyon teşhisi
// -----------------------------------------------------------------------------

/**
 * "VERİ NEDEN YOK" SORUSUNUN TEK CEVAP YERİ.
 *
 * Bu sözleşme, panelde altı farklı arızanın AYNI boş ekrana düşmesini
 * bitirmek için var. Bugüne kadar şunların hepsi "grafik boş" olarak
 * görünüyordu ve ayırt etmenin tek yolu sunucuya SSH ile girip
 * `sync-cli -- jobs` çalıştırmaktı:
 *
 *   · hesap müşteriye atanmamış
 *   · atanmış ama izleme kapalı
 *   · izleme açık ama bağlantı yeniden yetki istiyor
 *   · hesabın platform durumu zamanlanmış süpürmenin süzgecine takılıyor
 *   · yapı taraması hiç koşmadı → metrikler kampanya satırına bağlanamıyor
 *   · iş koştu, başarılı bitti ama SIFIR satır yazdı
 *
 * Altısının yapılacak işi farklı. `blockedReason` her hesap için bunlardan
 * hangisinin geçerli olduğunu YAZIYOR; boşsa hesapta bilinen bir engel yok.
 */
export interface SyncAccountStatus {
  id: string;
  name: string;
  platform: Platform;
  /** `ad_accounts.status` — platformdan geldiği hâliyle. */
  status: string;
  syncEnabled: boolean;
  connectionStatus: string;
  lastStructureSyncAt: string | null;
  lastInsightsSyncAt: string | null;
  /**
   * Zamanlanmış süpürme bu hesabı ALIYOR mu?
   *
   * "Şimdi güncelle" düğmesinin süzgeci ile zamanlanmış süpürmenin süzgeci
   * aynı değil: süpürme hesabın platform durumuna da bakıyor, düğme bakmıyor.
   * Bu ayrım "elle basınca geliyor, kendiliğinden gelmiyor" hâlini üretiyor
   * ve başka hiçbir yerde görünmüyor.
   */
  inScheduledSweep: boolean;
  /** Metrik yazılabilmesi için yapı taraması koşmuş olmak ZORUNDA. */
  structureReady: boolean;
  /** Doluysa KULLANICIYA OLDUĞU GİBİ gösterilecek cümle. */
  blockedReason: string | null;
  /**
   * BU HESABIN İŞ TÜRÜ BAŞINA EN SON İŞİ.
   *
   * Önce yalnızca "son iş" ve "son düşen iş" vardı ve bir kilidi
   * gizliyordu: bir Meta hesabında yapı taraması kotaya takılıp
   * `throttled` kalmıştı, ama daha yeni bir metrik işi olduğu için o satır
   * hiçbir yerde görünmüyordu. Panelde "Yapı: hiç" yazıyor, sebebi
   * yazmıyordu.
   *
   * İŞ TÜRÜ BAŞINA TEK SATIR, çünkü sorulan soru tür bazlı: "yapı taraması
   * ne oldu", "metrik ne oldu", "anahtar kelimeler ne oldu". Bir tür hiç
   * görünmüyorsa o iş HİÇ KUYRUĞA GİRMEMİŞ demek — bu da bir cevap.
   */
  lastJobs: SyncJobStatusRow[];
}

/** Bir senkronizasyon işinin panelde gösterilen hâli. */
export interface SyncJobStatusRow {
  /** `sync_jobs.id` BIGSERIAL — JSON'da string taşınıyor. */
  id: string;
  jobType: string;
  entityLevel: string | null;
  status: string;
  attempts: number;
  rowsUpserted: number;
  apiCallsUsed: number;
  errorCode: string | null;
  /**
   * Platformun KENDİ mesajı (Meta'da subcode ve fbtrace dahil).
   *
   * Bu alan tabloya bugüne kadar da yazılıyordu ama okuyan hiçbir uç nokta
   * yoktu: "izin yok", "kota doldu", "hesap bulunamadı" panelde hiç
   * görünmüyordu.
   */
  errorMessage: string | null;
  /**
   * ATILAN satır sayısı. `null` = bilinmiyor (kolon öncesi kayıt) ve bu 0 ile
   * AYNI ŞEY DEĞİL. `rowsUpserted = 0` + `rowsSkipped > 0` olan bir iş
   * "başarılı" görünür ama hiçbir veri yazmamıştır — "atadım, veri gelmiyor"
   * hâlinin imzası budur.
   */
  rowsSkipped: number | null;
  /** İnsan okuması için özet: hangi aralık, hangi seviye, ne oldu. */
  note: string | null;
  adAccountId: string | null;
  adAccountName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

/**
 * Süzgeçlerin ELEDİĞİ hesapların sayımı — kategorisiyle birlikte.
 *
 * ATANMAMIŞ HESAP BURADA SAYILMIYOR ve bu bilinçli. Genel Bakış'taki
 * `hiddenAccounts` sayacı tam bu hatayı yapıyor: ajansın havuzundaki
 * yüzlerce atanmamış hesabı da sayıyor ve kullanıcı hangi müşteriyi seçerse
 * seçsin devasa, alakasız bir rakam görüyor. Uyarı böyle olunca gerçek bir
 * gizlenmeyi işaret ettiğinde de kimse ciddiye almıyor. Bu uç yalnızca
 * MÜŞTERİYE ATANMIŞ hesaplara bakıyor; hiç atanmamışsa cevap zaten boş
 * `accounts` dizisi.
 *
 * SESSİZ KESME YOK: bir hesabın listede olmaması bir bilgi. Kaç tanesinin
 * hangi sebeple elendiği yazılmazsa "hiç hesap yok" ile "üç hesap var ama
 * üçü de elendi" aynı ekrana düşer.
 */
export interface SyncExcludedCounts {
  syncDisabled: number;
  clientInactive: number;
  connectionInactive: number;
  accountStatus: number;
}

export interface SyncStatusResponse {
  accountCount: number;
  neverSyncedCount: number;
  oldestSyncAt: string | null;
  accounts: SyncAccountStatus[];
  excluded: SyncExcludedCounts;
  recentJobs: SyncJobStatusRow[];
  /** Gösterilen iş sayısı toplamı tutmuyorsa kullanıcı bunu GÖRMELİ. */
  recentJobsTotal: number;
  /**
   * SAYAÇLAR BÜTÜN İŞLER ÜZERİNDEN — gösterilen 25 üzerinden DEĞİL.
   *
   * İlk sürümde bu sayılar `recentJobs` dizisinden hesaplanıyordu ve tam
   * olarak kaçınmaya çalıştığım hatayı yapıyordu: "5 düşen iş" aslında
   * "gösterilen 25 işin 5'i" demekti, 356 işin 5'i değil. Kesilmiş bir
   * listeden sayı türetmek, sessiz kesmenin bir başka biçimi.
   */
  jobCounts: {
    failed: number;
    /** `succeeded` ama tek satır yazmamış METRİK işleri. Diğer iş türlerinde
     * sıfır satır normal (o gün yeni gönderi yok gibi) ve sayılmıyor. */
    emptySuccess: number;
    running: number;
  };
}
