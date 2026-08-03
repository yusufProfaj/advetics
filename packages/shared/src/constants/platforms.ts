/**
 * Desteklenen reklam platformları.
 *
 * KAPSAM KİLİDİ: Bu liste yalnızca Meta ve Google Ads içerir.
 * TikTok, Snapchat, LinkedIn ve diğerleri ürün kapsamı dışındadır.
 * Yeni platform eklemek şema, adapter ve kota yönetimi değişikliği gerektirir —
 * bu sabiti genişletmek tek başına yeterli değildir.
 */
export const PLATFORMS = ['meta', 'google'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta (Facebook / Instagram)',
  google: 'Google Ads',
};

/** Meta ve Google'ın farklı hiyerarşi isimlerini tek modele indirger. */
export const ENTITY_LEVELS = ['account', 'campaign', 'ad_group', 'ad'] as const;
export type EntityLevel = (typeof ENTITY_LEVELS)[number];

export const ENTITY_LEVEL_LABELS: Record<Platform, Record<EntityLevel, string>> = {
  meta: {
    account: 'Reklam Hesabı',
    campaign: 'Kampanya',
    ad_group: 'Reklam Seti',
    ad: 'Reklam',
  },
  google: {
    account: 'Hesap',
    campaign: 'Kampanya',
    ad_group: 'Reklam Grubu',
    ad: 'Reklam',
  },
};

/**
 * Para birimi micros cinsinden saklanır (1 birim = 1_000_000 micros).
 * Google Ads API zaten micros kullanır; Meta'yı da bu formata normalize ediyoruz.
 * Float ile para tutmak, toplama sırasına göre kuruş kaymaları üretir.
 */
export const MICROS_PER_UNIT = 1_000_000n;

export function toMicros(amount: number): bigint {
  return BigInt(Math.round(amount * 1_000_000));
}

export function fromMicros(micros: bigint | number): number {
  return Number(micros) / 1_000_000;
}
