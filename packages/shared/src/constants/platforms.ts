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

/**
 * KISA AD — rapor, mail ve dar alanlar için.
 *
 * `PLATFORM_LABELS` uzun ("Meta (Facebook / Instagram)") ve bir tablo
 * başlığına ya da rapor alt başlığına sığmıyor. İki tablo olmasının sebebi
 * bu; kopya değil, iki farklı iş.
 *
 * ┌─ BU TABLO BİR GERİLEMEDEN DOĞDU ──────────────────────────────────────┐
 * │ Kısa ad ONBEŞ ayrı yerde elle yazılıydı ve çoğu iki yolluydu           │
 * │ (`p === 'google' ? 'Google Ads' : 'Meta'`) — yani LinkedIn'e "Meta"    │
 * │ diyorlardı. Onları tek tek düzeltmeye çalışırken panelin rapor         │
 * │ başlığını `PLATFORM_LABELS`a bağladım ve PDF ikizi elle kaldı:         │
 * │ panel "Meta (Facebook / Instagram)", PDF "Meta Ads" yazmaya başladı.   │
 * │ CLAUDE.md'nin "aynı raporun iki gösterimi ayrışmamalı" kuralını tam    │
 * │ onu korumaya çalışırken bozdum.                                        │
 * │                                                                        │
 * │ İki gösterim de artık BU tablodan okuyor.                              │
 * └────────────────────────────────────────────────────────────────────────┘
 */
export const PLATFORM_KISA_ADLARI: Record<Platform, string> = {
  meta: 'Meta Ads',
  google: 'Google Ads',
  linkedin: 'LinkedIn Ads',
};

/** Bilinmeyen bir değer için ham dizeye düşer — `undefined` yazmaktansa. */
export function platformKisaAdi(platform: string): string {
  return PLATFORM_KISA_ADLARI[platform as Platform] ?? platform;
}

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
   * dilini görüyor. `linkedin-para.spec.ts` bunu kilitliyor.
   *
   * (Burada bir süre `linkedin-seviye-eslemesi.spec.ts` yazıyordu ve ÖYLE BİR
   * DOSYA YOK. Var olmayan bir teste atıf yapan yorum, iddiayı ANLATAN metni
   * iddianın KENDİSİ sanmanın bir biçimi — bu depoda adı konmuş bir tuzak ve
   * ona düşülmüş hâli.)
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
