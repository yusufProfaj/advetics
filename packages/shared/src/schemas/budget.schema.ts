import { z } from 'zod';

/**
 * Modül 5 — Aylık bütçe sözleşmeleri.
 *
 * Bu tablo şu ana kadar sistemde OLMAYAN tek şeyi ekliyor: bir HEDEF. Harcama
 * verisi ilk günden beri var ama "çok mu harcadık" sorusunun karşılaştırılacak
 * bir referansı yoktu. Bütçe pacing, sert limit, otomatik durdurma ve sağlık
 * skoru dördü de aynı referansa bağlı.
 */

/**
 * Ay — `YYYY-MM`.
 *
 * Sınırda string, tıpkı tarihler gibi: `new Date('2026-08-01')` UTC gece yarısı
 * demek ve batıdaki bir sunucuda ÖNCEKİ AY'a düşüyor. Veritabanında ayın ilk
 * günü olarak `DATE` saklanıyor, çevrim yalnızca SQL içinde yapılıyor.
 */
export const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Ay YYYY-MM biçiminde olmalı')
  .refine((v) => {
    const year = Number(v.slice(0, 4));
    return year >= 2000 && year <= 2100;
  }, 'Geçersiz yıl');

/** `YYYY-MM` → `YYYY-MM-01`. Veritabanı sınırındaki tek çevrim noktası. */
export function monthToDate(month: string): string {
  return `${month}-01`;
}

/** `YYYY-MM-DD` → `YYYY-MM`. */
export function dateToMonth(date: string): string {
  return date.slice(0, 7);
}

/**
 * Bütçe girdisi.
 *
 * `amount` KULLANICI BİRİMİNDE (₺), micros değil. Panelde "45000" yazan biri
 * 45.000 ₺ demek istiyor; formu micros'a çevirmeyi istemciye bırakmak, ondalık
 * ayırıcı ve kayan nokta hatalarını istemciye dağıtmak olurdu. Çevrim tek
 * yerde, sunucuda ve string üzerinden yapılıyor.
 */
export const budgetInputSchema = z.object({
  clientId: z.string().uuid(),
  /**
   * null / verilmemiş = MÜŞTERİ GENELİ bütçe.
   *
   * Bir müşterinin birden fazla projesi (dolayısıyla reklam hesabı) olabiliyor.
   * Ajans hem her projeye ayrı bütçe hem şirkete tek bir şemsiye bütçe
   * tanımlayabilmeli; ikisi aynı anda var olabilir.
   */
  adAccountId: z.string().uuid().nullable().optional(),
  month: monthSchema,
  /**
   * Para birimi cinsinden tutar. En fazla 2 ondalık.
   *
   * String olarak alınıyor: `0.1 + 0.2 !== 0.3` ve para float'ta taşınmamalı.
   */
  amount: z
    .string()
    .trim()
    .regex(/^\d{1,12}([.,]\d{1,2})?$/, 'Tutar en fazla 2 ondalıklı bir sayı olmalı')
    .refine((v) => Number(v.replace(',', '.')) > 0, 'Tutar sıfırdan büyük olmalı'),
  /** Verilmezse müşterinin raporlama para birimi kullanılıyor. */
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'ISO 4217 kodu olmalı')
    .optional(),
  /** Günlük sert limit. Boş = limit yok. */
  dailyCap: z
    .string()
    .trim()
    .regex(/^\d{1,12}([.,]\d{1,2})?$/, 'Günlük limit en fazla 2 ondalıklı bir sayı olmalı')
    .nullable()
    .optional(),
  alertThresholdPct: z.coerce.number().int().min(1).max(200).default(80),
  /**
   * Otomatik durdurma eşiği. VARSAYILAN KAPALI.
   *
   * Kampanya durdurmak harcamayı keserken satışı da kesiyor. Böyle bir şeyin
   * varsayılan olarak açık gelmesi, kullanıcının istemediği bir kararı onun
   * adına vermek olurdu.
   */
  autoPauseAtPct: z.coerce.number().int().min(1).max(200).nullable().optional(),
  note: z.string().trim().max(500).nullable().optional(),
});
export type BudgetInput = z.infer<typeof budgetInputSchema>;

export const budgetQuerySchema = z.object({
  clientId: z.string().uuid().optional(),
  month: monthSchema.optional(),
});
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

/** Pacing sorgusu — tek bir ayın tüketim durumu. */
export const pacingQuerySchema = z.object({
  clientId: z.string().uuid(),
  /** Verilmezse İÇİNDE BULUNULAN ay. */
  month: monthSchema.optional(),
});
export type PacingQuery = z.infer<typeof pacingQuerySchema>;

/**
 * Pacing durumu.
 *
 * Eşiklerle DEĞİL, sapma ile tanımlı: "hedefin %10 üstündeyiz" bilgisi
 * "kırmızı" kelimesinden daha kullanışlı ve renk kararını arayüze bırakıyor.
 */
export const PACING_STATUSES = ['under', 'on_track', 'over', 'exhausted', 'no_budget'] as const;
export type PacingStatus = (typeof PACING_STATUSES)[number];

export const PACING_STATUS_LABELS: Record<PacingStatus, string> = {
  under: 'Yavaş',
  on_track: 'Hedefte',
  over: 'Hızlı',
  exhausted: 'Bütçe doldu',
  no_budget: 'Bütçe tanımsız',
};

export interface BudgetRecord {
  id: string;
  clientId: string;
  adAccountId: string | null;
  /** Reklam hesabının adı — null ise müşteri geneli satır. */
  adAccountName: string | null;
  platform: 'meta' | 'google' | null;
  month: string;
  amountMicros: string;
  currency: string;
  dailyCapMicros: string | null;
  alertThresholdPct: number;
  autoPauseAtPct: number | null;
  note: string | null;
  updatedAt: string;
}

/**
 * Tek bir bütçe satırının pacing hesabı.
 *
 * Tüm oranlar 0-1 arası ondalık, yüzde değil: yüzdeye çevirmek sunumun işi ve
 * ara hesapta yüzde kullanmak yuvarlama hatası biriktiriyor.
 */
export interface BudgetPacing {
  budget: BudgetRecord | null;
  /** Bütçe yoksa yalnızca harcama dolu, geri kalanı null. */
  spentMicros: string;
  remainingMicros: string | null;
  /** Harcanan / bütçe. Bütçe yoksa null. Bütçe aşılmışsa 1'den büyük. */
  spentRatio: number | null;
  /**
   * Ayın NE KADARI GEÇTİ — bütçenin o âna kadar harcanmış OLMASI GEREKEN oranı.
   *
   * "Bugüne kadar" derken bugün DAHİL DEĞİL. Panel ve rapor bu konuda
   * hizalandı: bugünün verisi gün bitmeden eksik geliyor ve eksik veriyle
   * pacing hesaplamak her sabah "yavaş gidiyoruz" demek olurdu.
   */
  elapsedRatio: number;
  /**
   * spentRatio - elapsedRatio. Pozitif = hedeften hızlı.
   *
   * Bütçe yoksa null.
   */
  paceDelta: number | null;
  status: PacingStatus;
  /** Kalan bütçenin kalan güne bölümü — "günde şu kadar harcayabilirsin". */
  suggestedDailyMicros: string | null;
  /** Bu hızla devam edilirse ay sonu toplamı. */
  projectedMicros: string | null;
  /** Hesabın kapsadığı son gün (dâhil). Genellikle dün. */
  throughDate: string;
  /** Ayın ilk ve son günü. */
  monthStart: string;
  monthEnd: string;
  daysElapsed: number;
  daysTotal: number;
  daysRemaining: number;
  /**
   * VERİ KAPSAMASI — aralıkta gerçekten veri bulunan gün sayısı.
   *
   * `daysElapsed`ten küçükse pacing OLDUĞUNDAN YAVAŞ görünüyor: eksik günün
   * harcaması sıfır sayılıyor. Raporda `†` ile işaretlenen aynı sorun; burada
   * da göstermeden geçmek yanıltıcı olurdu.
   */
  daysWithData: number;
  /** Alarm eşiği aşıldı mı — `spentRatio >= alertThresholdPct/100`. */
  alertTriggered: boolean;
  /**
   * Bütçe para biriminden FARKLI olduğu için harcaması hesaba katılmayan
   * para birimleri.
   *
   * Bir müşterinin hesapları farklı para birimlerinde olabiliyor ve
   * `fx_rates` çevrimi henüz yazılmadı. 1 USD + 1 TRY toplamını bütçeyle
   * karşılaştırmak anlamsız bir sayı üretirdi; bu yüzden eşleşmeyen para
   * birimi harcaması TOPLANMIYOR, burada bildiriliyor. Boş dizi = sorun yok.
   */
  excludedCurrencies: string[];
}

/** Müşteri için tüm bütçe satırlarının pacing özeti. */
export interface ClientPacing {
  clientId: string;
  month: string;
  currency: string | null;
  /** `adAccountId IS NULL` satırı — müşteri geneli şemsiye bütçe. */
  overall: BudgetPacing;
  /** Hesap bazlı bütçeler. Bütçesi olmayan hesap da harcamasıyla listeleniyor. */
  accounts: Array<BudgetPacing & { adAccountId: string; adAccountName: string }>;
}
