import { Prisma } from '@prisma/client';

/**
 * ═══ DÖNÜŞÜM İÇİN KURULMAMIŞ KAMPANYA (video ölçümü, 2026-10-13) ═══
 *
 * Bu dosya `arama-kampanyasi.ts`in (Ö-4) GENELLEŞMİŞ hâli. Ö-4 yalnız Meta
 * arama reklamını (QUALITY_CALL) tanıyordu; aynı hata video ve erişim
 * kampanyalarında da vardı ve PARA HARCATIYORDU: THRUPLAY ya da REACH ile
 * kurulan bir kampanyanın `conversions` değeri her gün 0 ve o 0 bir başarısızlık
 * ölçümü değil, kampanyanın işi o değil. Kural motoru "7 günde dönüşüm 0 ise
 * durdur" ile çalışan bir video reklamını durduruyor, sinyaller her sabah
 * "dönüşüm kesildi" diyor, İyileştir onun harcamasını dönüşümsüz sayıp
 * ortalama EBM'yi şişiriyordu.
 *
 * TEK YARDIMCI, TEK CÜMLE: kural motoru, sinyaller ve İyileştir aynı SQL'i
 * okuyor (`donusum-sayilmayan.spec.ts` kaynak taramasıyla kilitliyor).
 * İkinci bir liste doğduğu anda biri yeni hedefi unutur.
 *
 * NEYE GÖRE KARAR VERİLİYOR — YALNIZ KANITLI OLANLAR:
 *
 *  · META: reklam setinin `optimization_goal`i (yapı taraması yazıyor). Liste
 *    bu deponun kendi amaç matrisindeki (`ad-builder/objective-matrix.ts`)
 *    farkındalık/video hedefleri, rehberin kurduğu üç hedef
 *    (`reklam/meta/niyetler.ts`: QUALITY_CALL, REACH, THRUPLAY) ve Akıllı
 *    Boost'un gönderi öne çıkarma hedefi (POST_ENGAGEMENT, meta.provider.ts):
 *    hiçbiri Meta'ya dönüşüm için teklif verdirmiyor. LINK_CLICKS ve
 *    LANDING_PAGE_VIEWS BİLEREK YOK: trafik kampanyası çoğu zaman piksel
 *    dönüşümüyle değerlendiriliyor ve "dönüşüm yoksa durdur" orada meşru bir
 *    kural olabilir. Ayrıca `destination_type = PHONE_CALL` (Ö-4) korunuyor.
 *
 *  · GOOGLE: kampanyanın teklif stratejisi (`campaigns.bid_strategy`).
 *    Kanal türü YETMEZ: VIDEO kanalında TARGET_CPA ile kurulan "video eylem"
 *    kampanyası dönüşüm için optimize ediyor. Görüntüleme/gösterim başı
 *    teklif (MANUAL_CPV, TARGET_CPV, MANUAL_CPM, TARGET_CPM) tanımı gereği
 *    dönüşüm hedeflemiyor. Demand Gen + TARGET_SPEND (tıklama) Akıllı
 *    Boost'un video kampanyası (`google-demandgen.ts` `targetSpend`). Düz
 *    TARGET_SPEND (arama ağında "tıklamaları en üst düzeye çıkar") BİLEREK
 *    YOK: orada dönüşüm ölçütü kullanıcının meşru tercihi olabilir.
 *
 * NEDEN ATLAMAK GÜVENLİ TARAF: yanlışlıkla atlanan bir dönüşüm koşulu kural
 * geçmişinde sebebiyle görünüyor ve hiçbir şeyi durdurmuyor; yanlışlıkla
 * değerlendirilen ise çalışan bir reklamı durduruyor ve kaçan satış geri
 * gelmiyor. Bu yüzden kampanya seviyesinde "setlerinden BİRİ" yeterli
 * (Ö-4 kararı korunuyor): karışık bir kampanyada video setini durdurmamak,
 * form setini bir tur geç durdurmaktan ucuz.
 */

/** Meta reklam seti hedefi → kullanıcıya yazılan ad. */
export const DONUSUMSUZ_META_HEDEFLERI = {
  QUALITY_CALL: 'telefon araması',
  THRUPLAY: 'video izlenme',
  REACH: 'erişim',
  IMPRESSIONS: 'gösterim',
  AD_RECALL_LIFT: 'reklam hatırlanırlığı',
  POST_ENGAGEMENT: 'gönderi etkileşimi',
} as const;

/** Ö-4: hedefi okunamayan ama ham gövdesi telefon araması olan set. */
export const ARAMA_HEDEF_TURU = 'PHONE_CALL';

/** Google teklif stratejisi → ad (her kanalda dönüşümsüz). */
export const DONUSUMSUZ_GOOGLE_TEKLIFLERI = {
  MANUAL_CPV: 'video izlenme (görüntüleme başı teklif)',
  TARGET_CPV: 'video izlenme (hedef görüntüleme başı maliyet)',
  MANUAL_CPM: 'gösterim (bin gösterim başı teklif)',
  TARGET_CPM: 'gösterim (hedef bin gösterim başı maliyet)',
} as const;

/** Demand Gen + tıklama teklifi (Akıllı Boost video kampanyası). */
export const DEMAND_GEN_TIKLAMA = 'DEMAND_GEN_TARGET_SPEND';

/** SQL'in döndürdüğü kod → ad. Bilinmeyen kod (olmamalı) kodun kendisi. */
export function donusumsuzHedefAdi(kod: string): string {
  if (kod in DONUSUMSUZ_META_HEDEFLERI) return DONUSUMSUZ_META_HEDEFLERI[kod as keyof typeof DONUSUMSUZ_META_HEDEFLERI];
  if (kod in DONUSUMSUZ_GOOGLE_TEKLIFLERI) return DONUSUMSUZ_GOOGLE_TEKLIFLERI[kod as keyof typeof DONUSUMSUZ_GOOGLE_TEKLIFLERI];
  if (kod === DEMAND_GEN_TIKLAMA) return 'Demand Gen tıklama (video kampanyası)';
  return kod;
}

/**
 * Kullanıcıya ve kural geçmişine yazılan cümle (TEK YER). `rule_action_logs.
 * reason` VARCHAR(500): en uzun hedef adıyla ~150 karakter.
 */
export function donusumSayilmiyorCumlesi(kod: string | null | undefined): string {
  const hedef = kod ? ` (hedef: ${donusumsuzHedefAdi(kod)})` : '';
  return `Değerlendirilemedi: kampanya dönüşüm için kurulmamış${hedef}; dönüşüm 0 bir ölçüm değil`;
}

function takmaAd(alias: string): Prisma.Sql {
  if (!/^[a-z_][a-z0-9_]*$/.test(alias)) throw new Error(`Geçersiz takma ad: ${alias}`);
  return Prisma.raw(alias);
}

const META_KODLARI = Object.keys(DONUSUMSUZ_META_HEDEFLERI);
const GOOGLE_KODLARI = Object.keys(DONUSUMSUZ_GOOGLE_TEKLIFLERI);

/** Meta reklam seti satırı (alias) için: eşleşen hedef kodu ya da NULL. */
function metaSetKodu(g: string): Prisma.Sql {
  const a = takmaAd(g);
  return Prisma.sql`(CASE WHEN ${a}.platform = 'meta'::"Platform" AND ${a}.optimization_goal IN (${Prisma.join(META_KODLARI)}) THEN ${a}.optimization_goal::text
    WHEN ${a}.platform = 'meta'::"Platform" AND ${a}.raw ->> 'destination_type' = ${ARAMA_HEDEF_TURU} THEN 'QUALITY_CALL' END)`;
}

/** Google kampanya satırı (alias) için: eşleşen kod ya da NULL. */
function googleKampanyaKodu(c: string): Prisma.Sql {
  const a = takmaAd(c);
  return Prisma.sql`(CASE WHEN ${a}.platform = 'google'::"Platform" AND ${a}.bid_strategy IN (${Prisma.join(GOOGLE_KODLARI)}) THEN ${a}.bid_strategy::text
    WHEN ${a}.platform = 'google'::"Platform" AND ${a}.objective = 'DEMAND_GEN' AND ${a}.bid_strategy = 'TARGET_SPEND' THEN ${DEMAND_GEN_TIKLAMA} END)`;
}

/**
 * Varlığın (kampanya / reklam seti / reklam) dönüşüm için KURULMAMIŞ olduğunu
 * söyleyen hedef KODU (text) ya da NULL. `alias` varlık tablosunun takma adı.
 * Kampanya: kendi teklifi (Google) ya da setlerinden BİRİ (Meta). Set: kendi
 * hedefi ya da kampanyasının teklifi. Reklam: kendi setininki.
 */
export function donusumsuzHedefSql(seviye: 'campaign' | 'ad_group' | 'ad', alias: string): Prisma.Sql {
  const a = takmaAd(alias);
  switch (seviye) {
    case 'campaign':
      return Prisma.sql`COALESCE(${googleKampanyaKodu(alias)}, (SELECT ${metaSetKodu('ag_dz')} FROM ad_groups ag_dz WHERE ag_dz.campaign_id = ${a}.id AND ${metaSetKodu('ag_dz')} IS NOT NULL ORDER BY 1 LIMIT 1))`;
    case 'ad_group':
      return Prisma.sql`COALESCE(${metaSetKodu(alias)}, (SELECT ${googleKampanyaKodu('c_dz')} FROM campaigns c_dz WHERE c_dz.id = ${a}.campaign_id))`;
    case 'ad':
      return Prisma.sql`(SELECT COALESCE(${metaSetKodu('ag_dz')}, (SELECT ${googleKampanyaKodu('c_dz')} FROM campaigns c_dz WHERE c_dz.id = ag_dz.campaign_id)) FROM ad_groups ag_dz WHERE ag_dz.id = ${a}.ad_group_id)`;
  }
}

/** Boolean hâli — yalnız "atla mı" sorusu için (sinyal, İyileştir). */
export function donusumsuzVarlikSql(seviye: 'campaign' | 'ad_group' | 'ad', alias: string): Prisma.Sql {
  return Prisma.sql`((${donusumsuzHedefSql(seviye, alias)}) IS NOT NULL)`;
}
