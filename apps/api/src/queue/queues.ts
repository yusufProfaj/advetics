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
  /**
   * Potansiyel müşteri çekme — SENKRONİZASYONUN ÖNÜNDE.
   *
   * Bir kişi az önce bilgilerini bıraktı ve ajans onu ne kadar erken ararsa
   * dönüşüm o kadar yüksek. Dünün metriklerini beklemek, canlı bir müşteriyi
   * bekletmek demek.
   */
  lead_fetch: 3,
  insights_breakdown: 8,
  /**
   * Paket D — kreatif etiketleme. Kırılımların ARKASINDA: metrik ve yapı
   * taraması bitmeden etiketlemenin seçeceği kreatif listesi eksik olur ve
   * iş zaten `insights_daily`nin sonuna zincirli. Geçmiş çekiminin önünde,
   * çünkü günde en çok 40 kreatif ve dakikalar süren bir iş değil.
   */
  creative_tag: 9,
  initial_backfill: 10,
  /*
   * VERİ KAYNAKLARI (Paket F). Reklam metriklerinin ARKASINDA: site verisi
   * bir gün gecikebilir, reklam kararı veremeyen bir panel gecikemez. Kota
   * ayrı (mülkün kotası), yani öncelik yalnız worker slotu sırası.
   */
  kaynak_yapi: 6,
  kaynak_gunluk: 7,
  kaynak_gecmis: 10,
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
  /**
   * Paket F — veri kaynağı işi (`kaynak_*`). Dolu olması işin bir REKLAM
   * HESABI işi OLMADIĞINI söylüyor: hesap kota bekçisinden ve hesap
   * döngüsünden geçmez (veri-kaynagi-is.service.ts).
   */
  veriKaynagiId?: string;
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
  /**
   * Meta'nın bildirdiği potansiyel müşteri kimliği (`lead_fetch`).
   *
   * Webhook yalnızca bu kimliği veriyor; alan değerleri ayrı bir çağrıda
   * sayfa token'ıyla çekiliyor.
   */
  externalLeadId?: string;
  /** Formun Meta kimliği (`leads_reconcile`). */
  externalFormId?: string;
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
    case 'search_terms':
      // Anahtar kelimeyle AYNI katman: ikisi de opsiyonel derinleşme.
      return 'insights_breakdown';
    case 'keyword_insights':
      // Kırılımlarla aynı katman: ikisi de opsiyonel derinleşme ve çekirdek
      // metriklerin önüne geçmemeli.
      return 'insights_breakdown';
    // Boost OLUŞTURMAK para taahhüt ediyor; senkronizasyon kotayı doldurmuş
    // olsa bile geçmeli. Modül 5 aksiyonlarıyla aynı öncelikli kova.
    case 'boosts_evaluate':
      return 'rule_action';
    case 'lead_fetch':
      return 'lead_fetch';
    case 'payment_check':
      // ÖDEME NABZI ÖNCELİKLİ KOVADA. Uzun bir geçmiş çekimi kuyruğu
      // doldurduğunda 15 dakikalık kontrolün arkaya düşmesi, "anında" mailin
      // yarım saat gecikmesi demekti. İş ucuz: kuyruğu tıkamıyor.
      return 'rule_action';
    case 'creative_tags':
      // Kendi katmanı: tazeleme `creative_tag` kotasıyla soruluyor (%50).
      return 'creative_tag';
    case 'leads_reconcile':
      // Tarama bir YEDEK yol: webhook çalışıyorsa hiçbir şey bulmuyor.
      // Canlı kaydın önüne geçmemeli.
      return 'organic_posts';
    case 'lead_feedback_send':
      // Paket E: sonuç 7 gün içinde gönderilebiliyor, birkaç dakikalık
      // gecikme zararsız. Çekirdek metriklerin arkasında; işin içindeki kota
      // isteği de aynı katmanı kullanıyor (geri-besleme-gonderim.service.ts).
      return 'insights_backfill';
    case 'kaynak_yapi':
      return 'kaynak_yapi';
    case 'kaynak_gunluk':
      return 'kaynak_gunluk';
    case 'kaynak_gecmis':
      return 'kaynak_gecmis';
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
  veriKaynagiId?: string;
  ruleId?: string;
  externalLeadId?: string;
  externalFormId?: string;
  dateFrom?: string;
  dateTo?: string;
  entityLevel?: EntityLevel;
  clientId?: string;
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
    // LEAD KİMLİĞİ AYIRICI OLARAK EN ÖNCE.
    //
    // Aynı sayfadan saniyeler içinde on kayıt gelebiliyor. Ayırıcı sosyal
    // profil olsaydı hepsi tek iş kimliğine düşer ve BullMQ'nun mükerrer
    // engeli dokuzunu SESSİZCE atardı — dokuz kayıp müşteri, sıfır hata.
    p.externalLeadId ??
      p.externalFormId ??
      p.adAccountId ??
      p.socialProfileId ??
      p.veriKaynagiId ??
      p.ruleId ??
      /*
       * WORKSPACE SON AYIRICI — BÜTÜN TÜRLER İÇİN (2026-10-13).
       *
       * Yalnız `clientId` taşıyan işler (`leads_reconcile`,
       * `boosts_evaluate`, `lead_feedback_send`, …) bu dal olmadan hepsi
       * `<tür>__na__all…` kimliğine düşüyordu. Süpürme workspace'leri art
       * arda kuyruğa koyarken ilki `waiting`teyken gelen ikincisi "zaten
       * kuyrukta" sayılıp SESSİZCE atılıyordu: her turda tek workspace
       * işleniyor, Akıllı Boost'un onaylı kartları diğer workspace'lerde
       * kurulmuyor, lead mutabakatı yalnız bir workspace'te koşuyordu.
       * Hata yok, log yok; süpürme notu "N workspace · 1 kuyruğa alındı"
       * diyordu. Paket E ajanı kendi türü için fark etti; burada geneli
       * kapanıyor. Deploy anında kuyrukta eski kimlikli bir iş varsa o tür
       * en fazla bir kez iki kez koşar (işler upsert / tekil indeksli).
       */
      p.clientId ??
      'na',
    p.entityLevel ?? 'all',
    p.dateFrom ?? '',
    p.dateTo ?? '',
  ]
    .filter((s) => s !== '')
    .join('__');
}
