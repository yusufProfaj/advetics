/**
 * ═══ GOOGLE ARAMA UZANTILARI: SİTE BAĞLANTISI VE AÇIKLAMA METNİ ═══
 *
 * "Siteme gelsinler" Arama kampanyası kampanya düzeyinde en çok 4 site
 * bağlantısı (SitelinkAsset) ve en çok 4 açıklama metni (CalloutAsset)
 * taşıyor. İkisi de reklamı büyütüyor ve tıklanma oranını artırıyor; ama
 * ikisi de MÜŞTERİ ADINA SÖZ: olmayan bir sayfaya bağlantı ya da verilmemiş
 * bir vaat yazmak, Google'ın onaylayıp göstereceği bir yalan olur.
 *
 * KAYNAK KURALLARI (yönetici kararı, 2026-10-12):
 * - Site bağlantısı YALNIZ sitenin GERÇEKTEN açılan alt sayfalarından;
 *   bağlantı metni sayfanın kendi başlığından (ya da sitedeki bağlantı
 *   metninden), ≤ 25 karakter. KIRPILMIYOR: yarıda kesilmiş "Hizmetlerim…"
 *   anlamı değiştirir; sığmayan sayfa atlanır. Açıklama satırları (≤ 35)
 *   sayfanın meta açıklamasından, yalnız iki satıra TAMAMEN sığıyorsa;
 *   sığmıyorsa satır yazılmaz (Google satırsız bağlantıyı da kabul ediyor).
 * - Açıklama metni YALNIZ Marka Merkezi'ndeki vaatlerden, ≤ 25 karakter,
 *   olduğu gibi. Sayı ya da fiyat/kampanya sözü taşıyan vaat ALINMIYOR:
 *   kampanya düzeyindeki bir öğe aylarca durur ve "%20 indirim" bittiğinde
 *   reklam hâlâ onu söyler (uydurma kapısı, aşağıda).
 *
 * SAF: ağ yok. HTML'i servis getiriyor (`sayfaHtmlGetir`, SSRF korumalı);
 * burada yalnız ayrıştırma ve seçim.
 */
import { karakterSayisi } from './metin';

/*
 * Shared `lib` yalnız ES2023 (DOM/Node tipleri yok); `URL` iki çalışma
 * ortamında da var. `sinyal/bildirim.ts` ile aynı yerel bildirim.
 */
interface AdresParcasi {
  protocol: string;
  hostname: string;
  /** Varsayılan port (https'te 443) BOŞ dizge; başka her değer açık port. */
  port: string;
  pathname: string;
  search: string;
  hash: string;
  toString(): string;
}
declare const URL: new (girdi: string, taban?: string) => AdresParcasi;

export const SITE_BAGLANTISI_EN_COK = 4;
/** Google tek site bağlantısını göstermiyor; ikiden azsa hiç kurulmaz. */
export const SITE_BAGLANTISI_EN_AZ = 2;
export const SITE_BAGLANTI_METNI_SINIRI = 25;
export const SITE_BAGLANTI_SATIR_SINIRI = 35;
export const ACIKLAMA_METNI_EN_COK = 4;
export const ACIKLAMA_METNI_SINIRI = 25;
/** Ana sayfadan en çok bu kadar alt sayfa açılıp okunur (paylaşımlı sunucu). */
export const ALT_SAYFA_ADAY_SINIRI = 6;
/**
 * Alt sayfalar en çok bu kadar EŞZAMANLI okunur. Paylaşımlı VPS'te bir
 * provanın müşteri sitesine altı isteği birden atması hem sunucunun hem
 * sitenin yükü; sıralı okumak ise 8 sn zaman aşımıyla provayı dakikalarca
 * tutardı. Üç, ikisinin ortası.
 */
export const ALT_SAYFA_ESZAMANLI = 3;

export interface SiteBaglantisi {
  metin: string;
  adres: string;
  /** İkisi birlikte ya da hiç: Google tek satırı kabul etmiyor. */
  satir1?: string;
  satir2?: string;
}

/** Okunmuş bir alt sayfa: adres SON adres (yönlendirmeden sonra). */
export interface SiteAltSayfasi {
  adres: string;
  baslik: string | null;
  aciklama: string | null;
  /** Ana sayfada bu sayfaya giden bağlantının metni. */
  baglantiMetni: string | null;
}

/**
 * Rehberin uzantı hâli (servis önbelleği → türetme ve karar tablosu).
 * `siteBaglantilari === null`: site OKUNMADI (prova öncesi okunur) — "alt
 * sayfa yok" ile karışmasın diye ayrı hâl.
 */
export interface GoogleUzantiKaynagi {
  siteBaglantilari: SiteBaglantisi[] | null;
  /**
   * Google provası uzantıları REDDETTİYSE sebebi: kurulum uzantısız gövdeyle
   * yeniden prova edildi ve ekran bunu söylüyor (`googleUzantiReddiCumlesi`).
   */
  googleReddi?: string | null;
  /** Bağlantı kurulmuyorsa NEDENİ (okunamadı / yeterli sayfa yok). */
  siteSebebi: string | null;
  aciklamaMetinleri: string[];
}

export const SITE_BAGLANTISI_YOK_CUMLESI = 'Sitenden alt sayfa okunamadı, site bağlantısı eklenmedi';

/** Google uzantı reddinin ekrandaki cümlesi (prova notu ve karar tablosu aynı yerden). */
export function googleUzantiReddiCumlesi(sebep: string): string {
  return `Site bağlantıları Google tarafından reddedildi: ${sebep}; reklam bağlantısız kuruldu`;
}

const VARLIK: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };

function metinCoz(s: string): string {
  return s
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+|#39);/gi, (t, k: string) => {
      if (k[0] === '#') {
        const n = k[1] === 'x' || k[1] === 'X' ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : t;
      }
      return VARLIK[k.toLowerCase()] ?? t;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sayfanın `<title>`'ı ve meta açıklaması. Yoksa `null`. */
export function sayfaOzeti(html: string): { baslik: string | null; aciklama: string | null } {
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  let aciklama: string | null = null;
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const etiket = m[0];
    if (!/\bname\s*=\s*["']?description["'\s>]/i.test(etiket)) continue;
    const c = /\bcontent\s*=\s*("([^"]*)"|'([^']*)')/i.exec(etiket);
    if (c) aciklama = metinCoz(c[2] ?? c[3] ?? '') || null;
    break;
  }
  const baslik = t ? metinCoz(t[1] ?? '') || null : null;
  return { baslik, aciklama };
}

const DOSYA = /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|docx?|xlsx?|pptx?|mp4|mp3)$/i;

/**
 * Ana sayfadaki AYNI SİTEYE giden alt sayfa bağlantıları, sayfadaki
 * sırayla, tekil. Ana sayfanın kendisi, çapa (#), sorgu dizgeli adres
 * (filtre/arama sayfası, kalıcı değil), dosya ve başka alan adı ATILIR.
 * `www.` farkı aynı site sayılıyor.
 */
export function altSayfaAdaylari(html: string, anaAdres: string, enCok = ALT_SAYFA_ADAY_SINIRI): Array<{ adres: string; metin: string | null }> {
  let ana: AdresParcasi;
  try {
    ana = new URL(anaAdres);
  } catch {
    return [];
  }
  const host = (h: string) => h.toLowerCase().replace(/^www\./, '');
  const anaYol = ana.pathname.replace(/\/+$/, '');
  const sonuc: Array<{ adres: string; metin: string | null }> = [];
  const gorulen = new Set<string>();
  for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    if (sonuc.length >= enCok) break;
    const h = /\bhref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(m[1] ?? '');
    const ham = (h?.[2] ?? h?.[3] ?? h?.[4] ?? '').trim();
    if (!ham || ham.startsWith('#') || /^(mailto|tel|javascript|data):/i.test(ham)) continue;
    let u: AdresParcasi;
    try {
      u = new URL(ham, ana.toString());
    } catch {
      continue;
    }
    if (u.protocol !== 'https:' || host(u.hostname) !== host(ana.hostname)) continue;
    // AÇIK PORT ADAY DEĞİL (Ajan 4, Ö-1): müşteri sitesi ajansın paylaşımlı
    // VPS'indeyse `:8443` bağlantısı sunucunun KENDİ yönetim portuna istek
    // attırır; iç ağ kontrolü bunu görmez (genel IP). Okuyucu da reddediyor
    // (`site-oku.ts#adresEngeli`), bu ilk kapı.
    if (u.port !== '') continue;
    if (u.search || DOSYA.test(u.pathname)) continue;
    const yol = u.pathname.replace(/\/+$/, '');
    if (yol === '' || yol === anaYol) continue;
    u.hash = '';
    const anahtar = `${host(u.hostname)}${yol.toLowerCase()}`;
    if (gorulen.has(anahtar)) continue;
    gorulen.add(anahtar);
    sonuc.push({ adres: u.toString(), metin: metinCoz(m[2] ?? '') || null });
  }
  return sonuc;
}

/** Başlığın parçaları: "Hizmetler | Ege Birlik Yapı" → ["Hizmetler", "Ege Birlik Yapı"]. */
function basligiBol(b: string): string[] {
  return b
    .split(/\s+[|–—\-·:»]\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * TAMAMI BÜYÜK HARF metin Türkçe başlık düzenine: "HİZMETLERİMİZ" →
 * "Hizmetlerimiz", "İLETİŞİM" → "İletişim". Menü başlıkları sık sık büyük
 * harf ve Google reklamda aşırı büyük harfi politika gereği reddediyor;
 * reddedilen bir öğe atomik isteğin tamamını düşürürdü. Dönüşüm `tr`
 * yerel ayarıyla (I/İ, ı/i): İngilizce kural "İLETİŞİM"i "Ileti̇şim" yapar.
 * Karışık yazılmış metne dokunulmaz (marka adı "AdTech" gibi).
 */
export function buyukHarfDuzelt(metin: string): string {
  const harfler = metin.replace(/[^\p{L}]/gu, '');
  if (!harfler || harfler !== harfler.toLocaleUpperCase('tr') || harfler === harfler.toLocaleLowerCase('tr')) return metin;
  return metin
    .toLocaleLowerCase('tr')
    .split(' ')
    .map((k) => (k ? k.charAt(0).toLocaleUpperCase('tr') + k.slice(1) : k))
    .join(' ');
}

/**
 * Tekillik anahtarı SON adresten: alan adı küçük harf, `www.` ve sondaki `/`
 * atılır. Yönlendirme sonrası iki aday aynı sayfaya düşebilir; ikisi de
 * bağlantı olsaydı Google aynı adresli bağlantıyı reddeder ya da göstermez
 * ve ekran "2 site bağlantısı" derdi.
 */
function adresAnahtari(adres: string): string {
  try {
    const u = new URL(adres);
    return `${u.hostname.toLowerCase().replace(/^www\./, '')}${u.pathname.replace(/\/+$/, '').toLowerCase()}${u.search}`;
  } catch {
    return adres;
  }
}

/** Metni iki satıra KIRPMADAN böler; sığmıyorsa `null`. */
function ikiSatir(metin: string, sinir: number): [string, string] | null {
  const kelimeler = metin.split(' ').filter(Boolean);
  const satirlar: string[] = [''];
  for (const k of kelimeler) {
    const son = satirlar[satirlar.length - 1]!;
    const aday = son ? `${son} ${k}` : k;
    if (karakterSayisi(aday) <= sinir) satirlar[satirlar.length - 1] = aday;
    else if (satirlar.length < 2 && karakterSayisi(k) <= sinir) satirlar.push(k);
    else return null;
  }
  return satirlar.length === 2 ? [satirlar[0]!, satirlar[1]!] : null;
}

/**
 * Okunmuş alt sayfalardan site bağlantıları. Metin sırası: sayfa
 * başlığının İLK parçası (marka adı genellikle sonda) ve sığmazsa ana
 * sayfadaki bağlantı metni. İkisi de 25'e sığmıyorsa sayfa ATLANIR.
 * Aynı metin iki sayfada çıkarsa ikincisi atlanır (Google aynı metni iki
 * bağlantıda reddediyor). İkiden az bağlantı çıkarsa HİÇ kurulmaz.
 */
/**
 * `disla`: bağlantı OLAMAYAN son adresler — ana sayfa ve reklamın kendi
 * hedef adresi. Eski bir alt sayfa ana sayfaya yönleniyorsa o bağlantı
 * reklamın zaten gittiği yere gider: Google onu bağlantı saymaz, ekran sayar.
 */
export function siteBaglantilariUret(sayfalar: readonly SiteAltSayfasi[], markaAdi: string | null = null, disla: readonly string[] = []): SiteBaglantisi[] {
  const marka = markaAdi?.toLocaleLowerCase('tr-TR').trim() ?? null;
  const sonuc: SiteBaglantisi[] = [];
  const metinler = new Set<string>();
  const adresler = new Set<string>(disla.map(adresAnahtari));
  for (const s of sayfalar) {
    if (sonuc.length >= SITE_BAGLANTISI_EN_COK) break;
    const adresK = adresAnahtari(s.adres);
    if (adresler.has(adresK)) continue;
    const adaylar = [...(s.baslik ? basligiBol(s.baslik) : []).filter((p) => p.toLocaleLowerCase('tr-TR') !== marka), ...(s.baglantiMetni ? [s.baglantiMetni] : [])].map(buyukHarfDuzelt);
    const metin = adaylar.find((x) => karakterSayisi(x) >= 2 && karakterSayisi(x) <= SITE_BAGLANTI_METNI_SINIRI);
    if (!metin) continue;
    adresler.add(adresK);
    const anahtar = metin.toLocaleLowerCase('tr-TR');
    if (metinler.has(anahtar)) continue;
    metinler.add(anahtar);
    const satirlar = s.aciklama ? ikiSatir(s.aciklama, SITE_BAGLANTI_SATIR_SINIRI) : null;
    sonuc.push({ metin, adres: s.adres, ...(satirlar ? { satir1: satirlar[0], satir2: satirlar[1] } : {}) });
  }
  return sonuc.length >= SITE_BAGLANTISI_EN_AZ ? sonuc : [];
}

/**
 * UYDURMA KAPISI — açıklama metni. Sayı (fiyat, yüzde, süre) ve fiyat/
 * kampanya sözü taşıyan vaat ALINMIYOR. Metin önerisinin kapısı
 * (`oneriler.ts#metinOnerisiTemizle`) sözü kaynakta ARIYOR ve kaynakta varsa
 * geçiriyor; burada kaynak vaadin kendisi, yani o kural her şeyi
 * geçirirdi. Kampanya düzeyindeki öğe süresiz durduğu için daha dar kural:
 * hiç sayı, hiç fiyat sözü.
 */
const FIYAT_SOZU = /(%|₺|(?<![\p{L}\p{N}])tl(?![\p{L}])|(?<![\p{L}\p{N}])(indirim|fiyat|ücretsiz|bedava|taksit|peşin|hediye|kampanyal[ıi]))/iu;

export function aciklamaMetinleriUret(vaatler: readonly string[]): { metinler: string[]; atilan: Array<{ metin: string; sebep: string }> } {
  const metinler: string[] = [];
  const atilan: Array<{ metin: string; sebep: string }> = [];
  const gorulen = new Set<string>();
  for (const ham of vaatler) {
    const v = ham.replace(/\s+/g, ' ').trim();
    if (!v) continue;
    if (metinler.length >= ACIKLAMA_METNI_EN_COK) {
      atilan.push({ metin: v, sebep: `en çok ${ACIKLAMA_METNI_EN_COK} açıklama metni` });
      continue;
    }
    if (karakterSayisi(v) > ACIKLAMA_METNI_SINIRI) {
      atilan.push({ metin: v, sebep: `${ACIKLAMA_METNI_SINIRI} karakteri aşıyor` });
      continue;
    }
    if (/\d/.test(v) || FIYAT_SOZU.test(v)) {
      atilan.push({ metin: v, sebep: 'sayı ya da fiyat sözü taşıyor' });
      continue;
    }
    const k = v.toLocaleLowerCase('tr-TR');
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    metinler.push(v);
  }
  return { metinler, atilan };
}
