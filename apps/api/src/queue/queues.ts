import type { EntityLevel, Platform, SyncJobType } from '@prisma/client';

/**
 * Kuyruk tanımları ve iş yükleri.
 *
 * TEK kuyruk kullanıyoruz, katmanları öncelikle ayırıyoruz. Katman başına ayrı
 * kuyruk açmak cazip görünüyor ama iki sorun üretiyor:
 *
 *   1. Worker slotları kuyruklar arasında paylaşılmaz — boş bir L7 kuyruğu için
 *      ayrılan slot, L2 sıkışırken boş bekler.
 *   2. Kota bir HESABA aittir, katmana değil. Aynı hesabın işleri farklı
 *      kuyruklarda olursa hepsini tek kota altında sıralamak zorlaşır.
 *
 * BullMQ'da düşük `priority` sayısı önce çalışır.
 */
export const SYNC_QUEUE = 'sync';

/** İş önceliği — düşük sayı önce. QuotaLayer ile birlikte kullanılır. */
export const JOB_PRIORITY = {
  /** Kullanıcı ekranda bekliyor. */
  interactive: 1,
  /** Modül 5 kural aksiyonu — para harcıyor. */
  rule_action: 2,
  structure: 4,
  insights_realtime: 4,
  insights_daily: 5,
  insights_backfill: 7,
  organic_posts: 7,
  insights_breakdown: 8,
  initial_backfill: 10,
} as const;

/**
 * Senkronizasyon işi yükü.
 *
 * `syncJobId` veritabanındaki kalıcı kaydı işaret ediyor: BullMQ işleri
 * Redis'te yaşıyor ve Redis temizlenince kaybolurlar. "En son ne zaman
 * senkronize edildi, neden başarısız oldu" sorusunun cevabı tabloda durmalı.
 */
export interface SyncJobPayload {
  syncJobId: string;
  clientId: string;
  platform: Platform;
  jobType: SyncJobType;
  adAccountId?: string;
  socialProfileId?: string;
  entityLevel?: EntityLevel;
  /**
   * Tarihler STRING olarak taşınıyor (YYYY-MM-DD), Date olarak DEĞİL.
   *
   * Postgres DATE kolonunu JS Date'e çevirmek saat dilimi kaydırması üretiyor:
   * hesabın kendi zaman dilimindeki "15 Ağustos" UTC'ye çevrilirken 14 Ağustos
   * 21:00 oluyor ve yanlış güne yazılıyor. Reklam metriklerinde bir günlük
   * kayma, kural motorunun yanlış günün verisiyle bütçe kapatması demek.
   */
  dateFrom?: string;
  dateTo?: string;
  /** Kullanıcı tetiklemeli mi — kota katmanı buna göre yükseliyor. */
  interactive?: boolean;
  /**
   * Modül 5 — değerlendirilecek kural.
   *
   * Dolu olması işin bir KURAL işi olduğunu söylüyor: hesap işiyle aynı
   * yolu izlemiyor çünkü bir kural birden fazla hesaba dokunabiliyor ve
   * kota kontrolü aksiyon başına, uygulayıcının içinde yapılıyor.
   */
  ruleId?: string;
}

/** İşin hangi kota katmanına ait olduğunu belirler. */
export function layerForJob(payload: SyncJobPayload): keyof typeof JOB_PRIORITY {
  if (payload.interactive) return 'interactive';
  switch (payload.jobType) {
    case 'structure':
      return 'structure';
    case 'insights_realtime':
      return 'insights_realtime';
    case 'insights_daily':
      return 'insights_daily';
    case 'insights_backfill':
      return 'insights_backfill';
    case 'insights_breakdown':
      return 'insights_breakdown';
    case 'organic_posts':
      return 'organic_posts';
    case 'initial_backfill':
      return 'initial_backfill';
    case 'rules_evaluate':
      return 'rule_action';
    // Boost OLUŞTURMAK para taahhüt ediyor; senkronizasyon kotayı doldurmuş
    // olsa bile geçmeli. Modül 5 aksiyonlarıyla aynı öncelikli kova.
    case 'boosts_evaluate':
      return 'rule_action';
    default:
      return 'insights_daily';
  }
}

/**
 * İş kimliği — aynı işin iki kez kuyruğa girmesini engeller.
 *
 * BullMQ aynı `jobId` ile ikinci bir iş kabul etmiyor. Zamanlanmış bir iş
 * gecikirse ve bir sonraki tetikleme gelirse, mükerrer senkronizasyon
 * çalışmıyor — kota iki kez harcanmıyor.
 */
export function buildJobId(p: {
  jobType: SyncJobType;
  adAccountId?: string;
  socialProfileId?: string;
  ruleId?: string;
  dateFrom?: string;
  dateTo?: string;
  entityLevel?: EntityLevel;
}): string {
  // AYIRICI `:` DEĞİL.
  //
  // BullMQ özel iş kimliğinde `:` yasaklıyor — tek istisna TAM ÜÇ parçalı
  // kimlikler (eski repeatable job'lar için bırakılmış bir muafiyet). Bu
  // fonksiyon 2 ilâ 5 parça üretiyor: `structure:<uuid>:all` tesadüfen üçe
  // denk gelip çalışıyordu, ama tarih taşıyan işler (`insights_daily` →
  // 5 parça) `Custom Id cannot contain :` ile patlıyordu.
  //
  // Muafiyete yaslanmak kırılgan: parça sayısı değiştiği anda geri döner.
  return [
    p.jobType,
    p.adAccountId ?? p.socialProfileId ?? p.ruleId ?? 'na',
    p.entityLevel ?? 'all',
    p.dateFrom ?? '',
    p.dateTo ?? '',
  ]
    .filter((s) => s !== '')
    .join('__');
}
