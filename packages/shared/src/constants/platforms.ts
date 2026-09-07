/**
 * Desteklenen reklam platformları.
 *
 * KAPSAM: Meta, Google Ads ve LinkedIn Ads. LinkedIn 2026-09-07'de kullanıcının
 * açık talebiyle eklendi; o güne kadar burada "kapsam kilidi" yazıyordu ve
 * gerekçesi "istenmedi"ydi.
 *
 * BU SABİTİ GENİŞLETMEK TEK BAŞINA YETERLİ DEĞİL. Yeni platform en az şunları
 * istiyor: Prisma `Platform` enum'ına AYRI bir migration (`ALTER TYPE ... ADD
 * VALUE` aynı transaction'da kullanılamıyor), bir `IAdPlatformProvider`
 * uygulaması, sağlayıcı kaydı (`provider.registry.ts` + `connections.module.ts`),
 * kota bekçisi yapılandırması ve panelde platform listesi taşıyan her yer.
 */
export const PLATFORMS = ['meta', 'google', 'linkedin'] as const;
export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta (Facebook / Instagram)',
  google: 'Google Ads',
  linkedin: 'LinkedIn Ads',
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
  /*
   * ═══ LINKEDIN'DE "KAMPANYA" BİZİM KAMPANYAMIZ DEĞİL ═══
   *
   * Bu tablonun en pahalı satırı. LinkedIn'in hiyerarşisi:
   *
   *   Ad Account → Campaign Group → Campaign → Creative
   *
   * İsme bakarak eşlemek (LinkedIn Campaign → bizim `campaign`) DÖRT SEVİYEYİ
   * ÜÇE sıkıştırır, `ad` seviyesi hiç dolmaz ve raporun "Öne Çıkan Reklamlar"
   * sayfası LinkedIn için kalıcı olarak boş kalır. Daha kötüsü metrikler
   * kampanya satırlarına bağlanamaz ve hiçbir hata düşmez.
   *
   * Eşleme İSME DEĞİL ALANLARA dayanıyor. LinkedIn Campaign şunları taşıyor:
   * `targetingCriteria`, `dailyBudget`, `totalBudget`, `unitCost` (teklif),
   * `costType`, `optimizationTargetType` — yani hedefleme + bütçe + teklif.
   * Bu tam olarak Meta'nın ad set'i ve Google'ın reklam grubudur.
   * Raporlama pivotları da doğruluyor: ACCOUNT / CAMPAIGN_GROUP / CAMPAIGN /
   * CREATIVE dört ayrı pivot.
   *
   *   bizim `campaign`  ← LinkedIn Campaign Group
   *   bizim `ad_group`  ← LinkedIn Campaign
   *   bizim `ad`        ← LinkedIn Creative
   *
   * Etiketler KULLANICININ GÖRDÜĞÜ ad olmak zorunda: panelde "Kampanya Grubu →
   * Kampanya → Reklam" yazıyor ve bu Campaign Manager'daki adlarla birebir
   * aynı. Bizim iç modelimiz tek tip kalıyor, kullanıcı kendi platformunun
   * dilini görüyor. `linkedin-seviye-eslemesi.spec.ts` bunu kilitliyor.
   */
  linkedin: {
    account: 'Reklam Hesabı',
    campaign: 'Kampanya Grubu',
    ad_group: 'Kampanya',
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
