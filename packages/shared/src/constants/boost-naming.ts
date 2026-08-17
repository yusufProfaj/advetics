/**
 * BOOST VARLIKLARININ ADI — tek kaynak (K22).
 *
 * Biçim: `Müşteri - ilk üç kelime - tarih - Boost - Seviye`
 *
 *   Ege Birlik Yapı - Bu yaz hayalinizdeki - 2026-08-17 - Boost - Kampanya
 *   Ege Birlik Yapı - Bu yaz hayalinizdeki - 2026-08-17 - Boost - Reklam Seti
 *   Ege Birlik Yapı - Bu yaz hayalinizdeki - 2026-08-17 - Boost - Reklam
 *
 * NEDEN TEK FONKSİYON: ad beş ayrı yerde üretiliyordu (Meta'ya giden ad, panel
 * ağacının adı üç ayrı yolda ve sağlayıcıdaki üç ek) ve her biri kendi biçimini
 * uyduruyordu — `Boost — elle — 89207` gibi. Aynı boost panelde bir, Ads
 * Manager'da başka türlü görünüyordu ve ikisini eşleştirmek gönderi kimliğinin
 * son sekiz hanesini karşılaştırmayı gerektiriyordu.
 *
 * TARİH `YYYY-MM-DD`. Ads Manager'da isme göre sıralama yapıldığında `17.08.2026`
 * alfabetik olarak yanlış diziliyor (17'ler bir arada, aylar karışık); bu biçim
 * kronolojik diziliyor. Depo zaten tarihleri bu biçimde string tutuyor.
 *
 * AYNI GÖNDERİ AYNI GÜN İKİNCİ KEZ ÖNE ÇIKARILIRSA AD AYNI OLUYOR. Bu bilinçli:
 * biçime kimse istemediği bir sayaç eklenmedi. K20 bunu engellemiyor, uyarıyor —
 * ve kampanya seçim ekranı adın altında gönderi sayısı ile son kullanım tarihini
 * de yazdığı için iki satır orada hâlâ ayırt edilebiliyor.
 */

/** Meta'daki seviye adları — kullanıcının istediği sıra ve yazım. */
export const BOOST_ASSET_LABELS = {
  campaign: 'Kampanya',
  adSet: 'Reklam Seti',
  ad: 'Reklam',
  /**
   * Kreatif kullanıcının saydığı üç seviyede yok ama Meta'da AYRI BİR NESNE ve
   * Ads Manager'da adıyla görünüyor. Adsız bırakılırsa Meta kendi üretiyor ve
   * aynı gönderiden çıkan kreatifler birbirinden ayırt edilemiyor.
   */
  creative: 'Kreatif',
} as const;

export type BoostAssetKind = keyof typeof BOOST_ASSET_LABELS;

/** Bölücü. Kullanıcının yazdığı biçim tire, depoda başka yerde geçen uzun tire değil. */
const AYIRAC = ' - ';

/**
 * Tek bir parçanın en fazla uzunluğu.
 *
 * PARÇA BAZINDA KIRPILIYOR, ADIN SONUNDAN DEĞİL. Sondan kırpmak "Kampanya",
 * "Reklam Seti", "Reklam" eklerini yiyip adı işe yaramaz hâle getirirdi —
 * oysa o ek, listede hangi seviyeye baktığını söyleyen tek şey. Meta'nın kendi
 * sınırı daha cömert; buradaki sınırın amacı Ads Manager listesinde satırın
 * okunabilir kalması.
 */
const PARCA_SINIRI = 40;

function kirp(metin: string): string {
  return metin.length <= PARCA_SINIRI ? metin : `${metin.slice(0, PARCA_SINIRI - 1)}…`;
}

/**
 * Gönderi metninden ilk üç kelime.
 *
 * EMOJİ VE BAĞLANTI ATILIYOR. Gerçek gönderiler "Bu yaz hayalinizdeki yazlığa
 * kavuşmanın tam zamanı! 🌞🌊 İster…" gibi başlıyor ve ham ilk üç kelimeyi
 * almak "🌞🌊" gibi bir parça üretebiliyordu — Ads Manager'da hiçbir şey
 * söylemeyen bir ad. Harf ya da rakam içermeyen her belirteç düşüyor.
 *
 * SATIR SONU DA BOŞLUK SAYILIYOR: gönderiler sık sık ilk satırda tek kelimelik
 * bir başlıkla başlıyor.
 */
export function firstWords(message: string | null | undefined, count = 3): string[] {
  if (!message) return [];
  return message
    .split(/\s+/)
    .filter((k) => k.length > 0)
    // Bağlantılar atılıyor: hiçbir şey anlatmıyor ve uzun.
    .filter((k) => !/^https?:\/\//i.test(k))
    // Harf/rakam içermeyen belirteçler (emoji, salt noktalama) atılıyor.
    .filter((k) => /[\p{L}\p{N}]/u.test(k))
    .slice(0, count);
}

/**
 * Boost varlığının tam adı.
 *
 * `date` DIŞARIDAN GELİYOR: içeride `new Date()` olsaydı ad teste
 * bağlanamazdı ve aynı boost'un kampanyası ile reklamı gün dönümünde farklı
 * tarih taşıyabilirdi.
 *
 * BOŞ PARÇA ÜRETİLMİYOR. Altyazısı olmayan bir gönderide (Meta'da sıradan)
 * kelime yok ve biçim `Müşteri -  - 2026-08-17` olurdu; o boşluk yerine medya
 * türü yazılıyor ("Fotoğraf", "Reel"), çünkü hiç bilgi vermeyen bir ad ile
 * bozuk görünen bir ad arasında ikincisi daha kötü.
 */
export function boostAssetName(params: {
  kind: BoostAssetKind;
  clientName: string;
  postMessage: string | null | undefined;
  /** Metin yoksa kullanılacak yedek — medya türü etiketi ("Fotoğraf", "Reel"). */
  mediaLabel?: string;
  date: Date;
}): string {
  const kelimeler = firstWords(params.postMessage);
  const orta = kelimeler.length > 0 ? kelimeler.join(' ') : (params.mediaLabel ?? 'Gönderi');

  return [
    kirp(params.clientName.trim() || 'Müşteri'),
    kirp(orta),
    isoDate(params.date),
    'Boost',
    BOOST_ASSET_LABELS[params.kind],
  ].join(AYIRAC);
}

/**
 * `YYYY-MM-DD`.
 *
 * `toISOString()` UTC'ye çeviriyor ve Türkiye'de akşam 21:00'den sonra
 * oluşturulan bir boost'a ERTESİ GÜNÜN tarihini yazardı. Depo genelinde tarih
 * kayması bu şekilde üretiliyor ve bu yüzden yerel bileşenler okunuyor.
 */
function isoDate(d: Date): string {
  const ay = String(d.getMonth() + 1).padStart(2, '0');
  const gun = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${ay}-${gun}`;
}

/**
 * Sağlayıcının ek yapabilmesi için TABAN ad (seviye eki olmadan).
 *
 * Sağlayıcı kampanya/ad set/reklam adlarını kendi türetiyor ve taban ile ek
 * ayrı gelmezse ad `… - Boost - Kampanya - ad set` gibi çift seviyeli çıkardı.
 */
export function boostNameWithLabel(base: string, kind: BoostAssetKind): string {
  return `${base}${AYIRAC}${BOOST_ASSET_LABELS[kind]}`;
}

/** Seviye eki OLMADAN taban ad — çağıran bunu `BoostRequest.name` olarak veriyor. */
export function boostNameBase(params: {
  clientName: string;
  postMessage: string | null | undefined;
  mediaLabel?: string;
  date: Date;
}): string {
  // Tam adı üretip ekini kesmek yerine ekleme noktası tek yerde tutuluyor:
  // iki ayrı birleştirme mantığı bir gün ayrışırdı.
  const tam = boostAssetName({ ...params, kind: 'campaign' });
  return tam.slice(0, tam.length - (AYIRAC + BOOST_ASSET_LABELS.campaign).length);
}
