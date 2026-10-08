/**
 * ═══ SİTEDEKİ YOUTUBE İZLERİ ═══
 *
 * Workspace'in kendi sitesi, kanalın kime ait olduğunun en güçlü kanıtı:
 * firma kanalını kendi sitesinde gösteriyorsa kanal onundur. İki iz var:
 *
 *   · KANAL BAĞLANTISI — altbilgideki YouTube simgesi (`/@ad`, `/channel/UC…`,
 *     eski `/user/ad`; `/c/ad` API'den çözülemiyor ve not olarak dönüyor).
 *   · GÖMÜLÜ VİDEO — `youtube.com/embed/ID`, `watch?v=ID`, `youtu.be/ID`.
 *     Kurumsal sitelerde kanal bağlantısından sık; videonun kanalı ayrıca
 *     soruluyor (`videoKanallari`).
 *
 * SAF ve sınırlı: en çok 5 kanal bağlantısı, 10 video. Bir sitenin her
 * sayfasında aynı altbilgi var ve sınırsız liste, kotayı boşa harcamak
 * olurdu. Gömülü başka markanın videosu (tanıtım, haber) da çıkabilir —
 * o yüzden kart "sitende videosu gömülü" diyor, "senin kanalın" demiyor.
 */
export interface SiteYoutubeIzleri {
  kanalKimlikleri: string[];
  tanitcilar: string[];
  kullaniciAdlari: string[];
  /** `/c/ad` — API'den çözülemiyor; kullanıcıya not olarak söyleniyor. */
  ozelAdlar: string[];
  videoKimlikleri: string[];
}

const KANAL = /(?:https?:)?\/\/(?:www\.|m\.)?youtube\.com\/(channel\/(UC[A-Za-z0-9_-]{22})|@([A-Za-z0-9._-]{3,100})|user\/([A-Za-z0-9._-]{1,100})|c\/([^"'\s/?#<>]{1,100}))/gi;
const VIDEO = /(?:https?:)?\/\/(?:(?:www\.|m\.)?youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?(?:[^"'\s<>]*&)?v=|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/gi;

export function youtubeIzleri(html: string): SiteYoutubeIzleri {
  const kanalKimlikleri = new Set<string>();
  const tanitcilar = new Set<string>();
  const kullaniciAdlari = new Set<string>();
  const ozelAdlar = new Set<string>();
  const videoKimlikleri = new Set<string>();
  // HTML varlıkları (`&amp;`) sorgu dizgesini bölmesin.
  const metin = html.replace(/&amp;/g, '&');

  for (const m of metin.matchAll(KANAL)) {
    if (m[2]) kanalKimlikleri.add(m[2]);
    else if (m[3]) tanitcilar.add(m[3].toLowerCase());
    else if (m[4]) kullaniciAdlari.add(m[4]);
    else if (m[5]) ozelAdlar.add(decodeURIComponent(m[5]));
  }
  for (const m of metin.matchAll(VIDEO)) {
    if (m[1]) videoKimlikleri.add(m[1]);
  }

  // Sınır SIRAYLA: önce en kesin biçim (kimlik), sonra tanıtıcı, sonra eski ad.
  const kes = <T>(s: Set<T>, kalan: number): T[] => [...s].slice(0, Math.max(0, kalan));
  const kimlik = kes(kanalKimlikleri, 5);
  const tanitci = kes(tanitcilar, 5 - kimlik.length);
  const kullanici = kes(kullaniciAdlari, 5 - kimlik.length - tanitci.length);
  return {
    kanalKimlikleri: kimlik,
    tanitcilar: tanitci,
    kullaniciAdlari: kullanici,
    ozelAdlar: [...ozelAdlar].slice(0, 5),
    videoKimlikleri: [...videoKimlikleri].slice(0, 10),
  };
}
