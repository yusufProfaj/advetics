import type { Platform } from './constants/platforms';

/**
 * ═══ KAMPANYA TİPİ ═══
 *
 * Kampanya tablosunda Meta ve Google kampanyaları yan yana duruyor ve
 * "bu bir form kampanyası mı, YouTube mu" sorusu yalnızca kampanya adından
 * tahmin edilebiliyordu (kullanıcının isteği: "Meta - Form, Google - YouTube").
 *
 * KAYNAK `campaigns.objective`. Meta'da kampanya AMACI (`OUTCOME_LEADS`...),
 * Google'da KANAL TÜRÜ (`SEARCH`, `VIDEO`...) — `google.provider.ts` onu
 * aynı kolona yazıyor. Yani aynı kolon iki platformda iki farklı soruya
 * cevap veriyor ve etiket platforma göre çözülmek zorunda.
 *
 * "FORM" AMAÇTAN ÇIKMIYOR. `OUTCOME_LEADS` hem anında formu hem web sitesi
 * dönüşümünü hem mesajı kapsıyor; ayrım AD SET'in `optimization_goal`
 * alanında (`LEAD_GENERATION` / `QUALITY_LEAD` = Meta içi form). Amaçtan
 * "Form" demek, sitesine trafik gönderen bir potansiyel müşteri
 * kampanyasını form diye göstermek olurdu.
 *
 * BİLİNMEYEN DEĞER HAM HÂLİYLE DÖNÜYOR, gizlenmiyor. Platform yeni bir
 * amaç eklediğinde boş hücre "tip yok" gibi okunurdu; ham değer en azından
 * neyin eksik olduğunu söylüyor.
 *
 * `null` = platform bu seviyede tip bildirmiyor (LinkedIn'de kampanya
 * grubu amaç taşımıyor; amaç bir alt seviyede).
 */

/** Meta ad set hedefleri: Meta'nın kendi anında formu. */
const META_FORM_HEDEFLERI = new Set(['LEAD_GENERATION', 'QUALITY_LEAD']);

const META_AMACLARI: Record<string, string> = {
  OUTCOME_LEADS: 'Potansiyel müşteri',
  LEAD_GENERATION: 'Potansiyel müşteri',
  OUTCOME_SALES: 'Satış',
  CONVERSIONS: 'Satış',
  PRODUCT_CATALOG_SALES: 'Katalog satışı',
  OUTCOME_TRAFFIC: 'Trafik',
  LINK_CLICKS: 'Trafik',
  OUTCOME_AWARENESS: 'Bilinirlik',
  BRAND_AWARENESS: 'Bilinirlik',
  REACH: 'Erişim',
  OUTCOME_ENGAGEMENT: 'Etkileşim',
  POST_ENGAGEMENT: 'Etkileşim',
  PAGE_LIKES: 'Sayfa beğenisi',
  EVENT_RESPONSES: 'Etkinlik',
  MESSAGES: 'Mesaj',
  VIDEO_VIEWS: 'Video',
  OUTCOME_APP_PROMOTION: 'Uygulama',
  APP_INSTALLS: 'Uygulama',
  STORE_VISITS: 'Mağaza ziyareti',
};

const GOOGLE_KANALLARI: Record<string, string> = {
  SEARCH: 'Arama',
  DISPLAY: 'Görüntülü',
  VIDEO: 'YouTube',
  PERFORMANCE_MAX: 'Performance Max',
  DEMAND_GEN: 'Demand Gen',
  DISCOVERY: 'Demand Gen',
  SHOPPING: 'Alışveriş',
  MULTI_CHANNEL: 'Uygulama',
  LOCAL: 'Yerel',
  LOCAL_SERVICES: 'Yerel hizmetler',
  SMART: 'Akıllı',
  HOTEL: 'Otel',
  TRAVEL: 'Seyahat',
};

export function kampanyaTipi(
  platform: Platform,
  objective: string | null | undefined,
  /** Kampanyanın ad set'lerindeki `optimization_goal` değerleri (Meta). */
  setHedefleri: readonly string[] = [],
): string | null {
  if (!objective) return null;
  const kod = objective.toUpperCase();

  if (platform === 'meta') {
    const formlu = setHedefleri.filter((h) => META_FORM_HEDEFLERI.has(h)).length;
    if (formlu > 0) {
      // KARIŞIK KAMPANYA AYRI SÖYLENİYOR: bir set form, diğeri site ise
      // "Form" demek harcamanın yarısını yanlış anlatırdı.
      return formlu === setHedefleri.length ? 'Form' : 'Form ve diğer';
    }
    if (setHedefleri.length > 0 && setHedefleri.every((h) => h === 'CONVERSATIONS')) return 'Mesaj';
    return META_AMACLARI[kod] ?? objective;
  }
  if (platform === 'google') return GOOGLE_KANALLARI[kod] ?? objective;
  return objective;
}
