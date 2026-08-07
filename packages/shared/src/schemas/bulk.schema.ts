import { z } from 'zod';

/**
 * Modül 8 — Toplu Oluşturucu sözleşmeleri.
 *
 * BU MODÜLÜN ASIL DEĞERİ YAYINLAMAK DEĞİL, YAYINLAMADAN ÖNCE DOĞRULAMAK.
 *
 * 60 reklamlık bir partiyi Meta'ya göndermek kolay; sorun 41. satırda başlık
 * 3 karakter uzun olduğunda ortaya çıkıyor. O noktada 40 reklam oluşmuş, 20
 * oluşmamış ve kullanıcı hangilerinin hangisi olduğunu bilmiyor. Bu yüzden
 * doğrulama TAMAMEN YEREL ve yayından ÖNCE: platformun reddedeceği her şeyi
 * önce biz reddediyoruz.
 */

/**
 * Meta metin sınırları.
 *
 * Bunlar Meta'nın reklam oluşturma uç noktasının reddettiği sınırlar. Uyarı
 * eşikleri AYRI ve daha düşük: Meta 125 karakterden uzun birincil metni kabul
 * ediyor ama akışta kırpıyor, yani teknik olarak geçerli, pratikte kötü.
 */
export const TEXT_LIMITS = {
  /** Meta reddetme sınırı. */
  primaryText: 2000,
  headline: 255,
  description: 255,
  /** Kırpılma sınırı — reddedilmiyor ama akışta "devamını gör" ile kesiliyor. */
  primaryTextTruncateAt: 125,
  headlineTruncateAt: 40,
  descriptionTruncateAt: 30,
} as const;

export const CALL_TO_ACTIONS = [
  'LEARN_MORE',
  'SHOP_NOW',
  'SIGN_UP',
  'CONTACT_US',
  'GET_QUOTE',
  'BOOK_TRAVEL',
  'DOWNLOAD',
  'MESSAGE_PAGE',
  'WHATSAPP_MESSAGE',
  'CALL_NOW',
  'APPLY_NOW',
] as const;
export type CallToAction = (typeof CALL_TO_ACTIONS)[number];

export const CTA_LABELS: Record<CallToAction, string> = {
  LEARN_MORE: 'Daha fazla bilgi',
  SHOP_NOW: 'Şimdi satın al',
  SIGN_UP: 'Kaydol',
  CONTACT_US: 'Bize ulaşın',
  GET_QUOTE: 'Teklif al',
  BOOK_TRAVEL: 'Rezervasyon yap',
  DOWNLOAD: 'İndir',
  MESSAGE_PAGE: 'Mesaj gönder',
  WHATSAPP_MESSAGE: 'WhatsApp',
  CALL_NOW: 'Hemen ara',
  APPLY_NOW: 'Başvur',
};

// -----------------------------------------------------------------------------
// Girdi
// -----------------------------------------------------------------------------

export const bulkItemInputSchema = z.object({
  rowNumber: z.coerce.number().int().min(1),
  name: z.string().trim().min(1).max(300),
  /**
   * METİN SINIRLARI BURADA UYGULANMIYOR — doğrulayıcının işi.
   *
   * Zod'da `max(255)` yazmak, sınırı aşan satırı hiç kaydedememek demek:
   * kullanıcı "3. satırda başlık 45 karakter fazla" yerine tüm parti için
   * tek bir şema hatası alırdı ve hangi satır olduğunu bilemezdi.
   *
   * Buradaki sınırlar yalnızca kötüye kullanıma karşı: kolon genişliği.
   */
  primaryText: z.string().trim().max(8000).nullable().optional(),
  headline: z.string().trim().max(2000).nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  linkUrl: z.string().trim().max(2048).nullable().optional(),
  callToAction: z.string().trim().max(60).nullable().optional(),
  mediaRef: z.string().trim().max(1024).nullable().optional(),
  overrides: z.record(z.unknown()).nullable().optional(),
});
export type BulkItemInput = z.infer<typeof bulkItemInputSchema>;

export const bulkBatchInputSchema = z.object({
  name: z.string().trim().min(1).max(160),
  clientId: z.string().uuid(),
  adAccountId: z.string().uuid(),
  /**
   * Mevcut kampanyaya eklemek EN YAYGIN kullanım.
   *
   * Ajans zaten kurulu bir yapıya 40 varyasyon ekliyor; her seferinde yeni
   * kampanya açmak Ads Manager'ı kirletir ve öğrenme aşamasını sıfırlar.
   */
  targetCampaignExternalId: z.string().trim().max(128).nullable().optional(),
  /** Partinin tamamına uygulanan ayarlar. */
  defaults: z.record(z.unknown()).default({}),
  /**
   * Satır sayısı üst sınırı 500.
   *
   * Meta toplu uç noktası yok; her satır ayrı bir API çağrısı (creative +
   * ad = 2). 500 satır 1000 çağrı demek ve kotanın büyük kısmını yakar.
   * Sınırı yüksek tutmak, kullanıcının fark etmeden bir günlük kotayı
   * tüketmesine izin vermek olurdu.
   */
  items: z.array(bulkItemInputSchema).min(1).max(500),
});
export type BulkBatchInput = z.infer<typeof bulkBatchInputSchema>;

// -----------------------------------------------------------------------------
// Doğrulama sonuçları
// -----------------------------------------------------------------------------

/**
 * Bir satırdaki sorun.
 *
 * `severity` ayrımı önemli: `error` yayını engelliyor, `warning` engellemiyor.
 * Kırpılacak bir başlık kötü ama kullanıcının bilinçli tercihi olabilir;
 * onu yayınlamayı engellemek, aracı kullanılamaz kılardı.
 */
export interface BulkIssue {
  field: string;
  severity: 'error' | 'warning';
  message: string;
}

export const BULK_ITEM_STATUSES = [
  'pending',
  'invalid',
  'publishing',
  'published',
  'failed',
] as const;
export type BulkItemStatus = (typeof BULK_ITEM_STATUSES)[number];

export const BULK_ITEM_STATUS_LABELS: Record<BulkItemStatus, string> = {
  pending: 'Hazır',
  invalid: 'Geçersiz',
  publishing: 'Yayınlanıyor',
  published: 'Yayınlandı',
  failed: 'Başarısız',
};

export const BULK_BATCH_STATUSES = [
  'draft',
  'validated',
  'publishing',
  'published',
  'failed',
] as const;
export type BulkBatchStatus = (typeof BULK_BATCH_STATUSES)[number];

export const BULK_BATCH_STATUS_LABELS: Record<BulkBatchStatus, string> = {
  draft: 'Taslak',
  validated: 'Doğrulandı',
  publishing: 'Yayınlanıyor',
  published: 'Yayınlandı',
  failed: 'Başarısız',
};

export interface BulkItemRecord {
  id: string;
  rowNumber: number;
  name: string;
  primaryText: string | null;
  headline: string | null;
  description: string | null;
  linkUrl: string | null;
  callToAction: string | null;
  mediaRef: string | null;
  status: BulkItemStatus;
  issues: BulkIssue[];
  externalAdId: string | null;
  error: string | null;
}

export interface BulkBatchRecord {
  id: string;
  name: string;
  clientId: string;
  adAccountId: string;
  adAccountName: string;
  targetCampaignExternalId: string | null;
  status: BulkBatchStatus;
  itemCount: number;
  /** Durum başına sayım — özet şeridi bunu gösteriyor. */
  counts: Record<BulkItemStatus, number>;
  publishedAt: string | null;
  createdAt: string;
}

export interface BulkBatchDetail extends BulkBatchRecord {
  items: BulkItemRecord[];
}
