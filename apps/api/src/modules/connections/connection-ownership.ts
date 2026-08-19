import type { Platform } from '@advetics/shared';

/**
 * BİR PLATFORM BAĞLANTISININ SAHİBİ DEĞİŞTİRİLEMEZ.
 *
 * Karar saf bir fonksiyonda çünkü sınanması gereken şey bir SQL değil bir
 * kural, ve yanlış cevabı sessiz: kullanıcı bir workspace seçer, yetkilendirir,
 * ekran "bağlandı" der ve hesaplar BAŞKA bir workspace'te belirir.
 *
 * Sebep zinciri:
 *   · Tekillik `orgId_platform_externalUserId` üzerinde — aynı Meta/Google
 *     kimliği bir organizasyonda tek satır.
 *   · Bağlantı yazımı `upsert` ve `update` dalı `client_id`'ye dokunmuyor
 *     (dokunmamalı: token tazelemesi sahipliği değiştirmemeli).
 *   · Keşif (`discoverAndStore`) bağlantının `client_id`'sini okuyup bütün
 *     reklam hesaplarına ve sayfalara yazıyor.
 *
 * Üçü birleşince: ikinci workspace için yapılan yetkilendirme, birinci
 * workspace'in altına hesap doldurur.
 *
 * NULL → workspace geçişi de reddediliyor. Havuzda duran bağlantının altındaki
 * hesapların çoğu BAŞKA müşterilere ait; bağlantıyı tek bir workspace'e
 * işaretlemek sonraki bütün keşifleri oraya yazdırırdı.
 */
export type OwnershipDecision =
  | { ok: true }
  | { ok: false; message: string };

const PLATFORM_ADI: Record<Platform, string> = {
  meta: 'Meta',
  google: 'Google',
};

export function decideConnectionOwnership(p: {
  platform: Platform;
  /** Veritabanındaki satır. Yoksa `null` — ilk bağlantı. */
  existingClientId: string | null | undefined;
  /** Var olan satırın müşteri adı; mesajda kullanılıyor. */
  existingClientName?: string | null;
  /** Bu yetkilendirmenin hedefi. `null` = ajans havuzu. */
  requestedClientId: string | null;
}): OwnershipDecision {
  // İLK BAĞLANTI: satır yok, sahiplik serbestçe belirleniyor.
  if (p.existingClientId === undefined) return { ok: true };

  const mevcut = p.existingClientId ?? null;
  if (mevcut === p.requestedClientId) return { ok: true };

  const ad = PLATFORM_ADI[p.platform];
  const neredeydi = mevcut
    ? `"${p.existingClientName ?? 'başka bir workspace'}" workspace'ine`
    : 'ajans havuzuna';
  const nereye = p.requestedClientId ? 'Bu workspace' : 'Ajans havuzu';

  return {
    ok: false,
    message:
      `Bu ${ad} hesabı zaten ${neredeydi} bağlı. Aynı hesap iki yere birden ` +
      `bağlanamıyor: ${ad} her yeni yetkilendirmede önceki token'ı geçersiz ` +
      `kılıyor ve ilk bağlantı kopardı. ${nereye} için ya farklı bir ${ad} ` +
      `hesabı kullan ya da önce mevcut bağlantıyı kaldır.`,
  };
}
