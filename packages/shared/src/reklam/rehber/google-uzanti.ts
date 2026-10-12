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
  /**
   * Açıklama metinlerinin kaynağı: rehberde yazılan/önerilen (`rehber`) ya da
   * Marka Merkezi vaatleri (`vaatler`). Ekran hangisinin gittiğini söylüyor.
   * Eski çağıranlarda yok = vaatler.
   */
  aciklamaKaynagi?: 'rehber' | 'vaatler' | null;
  /** Kapıdan geçemeyen açıklama metinleri ve sebepleri (sessiz atma yok). */
  aciklamaAtilan?: Array<{ metin: string; sebep: string }>;
}

/**
 * AÇIKLAMA METNİ KAYNAĞI — tek kural. Rehberde yazılan (yapay zekânın
 * önerip kullanıcının gördüğü ya da kullanıcının yazdığı) metin ÖNCE:
 * kullanıcının düzelttiği metni vaatlerle ezmek, düzeltmeyi boşa çıkarırdı.
 * Rehber boşsa Marka Merkezi vaatleri. İkisi de AYNI uydurma kapısından
 * (`aciklamaMetinleriUret`: sayı yok, fiyat sözü yok, ≤ 25).
 */
export function aciklamaMetniSec(rehber: readonly string[] | undefined, vaatler: readonly string[], kaynak = vaatler.join(' ')): {
  metinler: string[];
  kaynak: 'rehber' | 'vaatler' | null;
  atilan: Array<{ metin: string; sebep: string }>;
} {
  // Abartı sözü yalnız müşterinin KENDİ yazdığı kaynakta (vaatler, marka
  // bilgisi) geçiyorsa kalır; vaatlerin kendisi de o kaynağın parçası.
  const r = aciklamaMetinleriUret(rehber ?? [], kaynak);
  if (r.metinler.length) return { metinler: r.metinler, kaynak: 'rehber', atilan: r.atilan };
  const v = aciklamaMetinleriUret(vaatler, kaynak);
  return { metinler: v.metinler, kaynak: v.metinler.length ? 'vaatler' : null, atilan: [...r.atilan, ...v.atilan] };
}

/*
 * "OKUNAMADI" DEĞİL "BULUNAMADI": cümle site OKUNDUĞUNDA da (tek sayfalık
 * site) görünüyordu ve kullanıcıyı olmayan bir okuma arızasına
 * gönderiyordu. Gerçek sebep ayrıca yazılıyor (`siteSebebi`).
 */
export const SITE_BAGLANTISI_YOK_CUMLESI = 'Sitende site bağlantısı olacak ayrı sayfa bulunamadı, site bağlantısı eklenmedi';

/** Google uzantı reddinin ekrandaki cümlesi (prova notu ve karar tablosu aynı yerden). */
export function googleUzantiReddiCumlesi(sebep: string): string {
  // Öğeler (g-1.2.0) de aynı yeniden provaya giriyor: cümle hepsini kapsıyor.
  return `Ek öğeler (site bağlantısı, açıklama metni, işletme adı, logo, snippet, promosyon, fiyat) Google tarafından reddedildi: ${sebep}; reklam bu öğeler olmadan kuruldu`;
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

/**
 * ═══ SİTE HARİTASI — İKİNCİ KAYNAK ═══
 *
 * TEŞHİS (2026-10-12, Ege Birlik Yapı ilk canlı Arama kampanyası, site
 * bağlantıları BOŞ): hedef site tek sayfalık bir tanıtım sayfası. Menüdeki
 * dört bağlantının dördü de AYNI sayfanın bölümlerine gidiyor (`#hakkinda`,
 * `#ozellikler`, `#galeri`, `#iletisim`) ve `altSayfaAdaylari` çapaları
 * doğru olarak atıyor: çapa ayrı bir sayfa değil, Google aynı adrese giden
 * bağlantıyı site bağlantısı saymıyor. Okuma DÜŞMEDİ; sitede alt sayfa YOK.
 * Ekran ise "Sitenden alt sayfa okunamadı" diyordu: kullanıcı olmayan bir
 * okuma arızasını aramaya gidiyordu.
 *
 * Menüyü JavaScript ile çizen sitelerde de ana sayfa HTML'inde bağlantı
 * olmuyor; o yüzden alt sayfa bulunamazsa site haritası (`sitemap.xml`,
 * WordPress'te `wp-sitemap.xml`) ikinci kaynak. Aynı SSRF kuralları:
 * yalnız https, aynı alan, açık port yok, sorgu ve dosya yok.
 *
 * Harita dizini (`<sitemapindex>`) bir kat açılıyor: WordPress'in dizini
 * sayfaları ayrı haritada tutuyor (`wp-sitemap-posts-page-1.xml`).
 */
export function siteHaritasiOku(xml: string, anaAdres: string): { sayfalar: string[]; altHaritalar: string[] } {
  let ana: AdresParcasi;
  try {
    ana = new URL(anaAdres);
  } catch {
    return { sayfalar: [], altHaritalar: [] };
  }
  const host = (h: string) => h.toLowerCase().replace(/^www\./, '');
  const uygun = (ham: string): AdresParcasi | null => {
    let u: AdresParcasi;
    try {
      u = new URL(metinCoz(ham), ana.toString());
    } catch {
      return null;
    }
    if (u.protocol !== 'https:' || host(u.hostname) !== host(ana.hostname) || u.port !== '' || u.search) return null;
    return u;
  };
  const dizin = /<sitemapindex\b/i.test(xml);
  const sayfalar: string[] = [];
  const altHaritalar: string[] = [];
  for (const m of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
    // CDATA SARMALI (`<loc><![CDATA[https://…]]></loc>`) bazı eklentilerin
    // biçimi; açılmazsa adres "geçersiz" sayılıp sessizce atlanırdı. Yalnız
    // sarmal açılıyor, içerik yine aynı SSRF kurallarından geçiyor.
    const ham = (m[1] ?? '').replace(/^<!\[CDATA\[([\s\S]*?)\]\]>$/, '$1').trim();
    const u = uygun(ham);
    if (!u) continue;
    if (dizin) {
      // Sayfa haritaları önce: yazı/kullanıcı haritası site bağlantısı olmaz.
      altHaritalar.push(u.toString());
      continue;
    }
    if (DOSYA.test(u.pathname)) continue;
    u.hash = '';
    sayfalar.push(u.toString());
  }
  altHaritalar.sort((a, b) => Number(/page/i.test(b)) - Number(/page/i.test(a)));
  return { sayfalar, altHaritalar };
}

/**
 * Ana sayfanın menüsü yalnız AYNI sayfadaki bölümlere mi gidiyor? Sebep
 * cümlesi için: "alt sayfa bağlantısı bulunamadı" ile "site tek sayfa"
 * kullanıcıya farklı iş söylüyor (ilkinde siteye bakılır, ikincisinde
 * site bağlantısı için ayrı sayfa açmak gerekir).
 */
export function cipaBaglantiSayisi(html: string): number {
  const gorulen = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']#([^"'\s]+)["']/gi)) {
    const k = (m[1] ?? '').toLowerCase();
    if (k && k !== 'content' && k !== 'top' && k !== 'main') gorulen.add(k);
  }
  return gorulen.size;
}

/** Site bağlantısı çıkmadığında ekrandaki sebep — okunamadı / tek sayfa / yetersiz ayrı. */
export function siteBaglantisiSebebi(p: { cipa: number; aday: number; haritaSayfasi: number | null; acilan: number }): string {
  const harita = p.haritaSayfasi === null ? 'site haritası bulunamadı' : `site haritasında ${p.haritaSayfasi} ayrı sayfa var`;
  if (p.aday === 0 && p.cipa > 0) return `Site tek sayfa: menüdeki ${p.cipa} bağlantı aynı sayfanın bölümlerine gidiyor ve ${harita}. Site bağlantısı için sitede ayrı sayfalar gerekiyor`;
  if (p.aday === 0) return `Ana sayfada ayrı sayfaya giden bağlantı bulunamadı ve ${harita}`;
  return `${p.aday} alt sayfadan ${p.acilan} tanesi açıldı; 25 karaktere sığan en az 2 farklı başlık çıkmadı`;
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

/**
 * ABARTI SÖZÜ (Ajan 4, Ö-C): "garanti", "en iyi", "1 numara", "ücretsiz".
 * İstem "garanti yazma" diyordu ama KOD dayatmıyordu; istem bir kural değil.
 * Sözcük kaynak metinde AYNEN geçiyorsa (müşterinin kendi vaadi) kalır,
 * geçmiyorsa atılır: süresiz duran bir öğede verilmemiş bir söz Google'ın
 * onaylayıp göstereceği bir yalan olur. Sınama Türkçe küçük harfle: `/i`
 * bayrağı "İ"yi "i" saymıyor.
 */
const ABARTI_SOZU = /(?<![\p{L}\p{N}])(garanti\p{L}*|en iyi\p{L}*|en ucuz\p{L}*|en uygun\p{L}*|1 numara|bir numara|numara 1|ücretsiz|bedava)(?![\p{L}\p{N}])/u;

/** Abartı sözü kaynakta AYNEN geçmiyorsa sözün kendisi, geçiyorsa (ya da yoksa) `null`. */
export function abartiSozu(metin: string, kaynak = ''): string | null {
  const m = ABARTI_SOZU.exec(metin.toLocaleLowerCase('tr-TR'));
  if (!m) return null;
  return kaynak.toLocaleLowerCase('tr-TR').includes(m[1]!) ? null : m[1]!;
}

/**
 * Snippet ve açıklama metni gibi SÜRESİZ duran kısa öğelerin dar kapısı:
 * sayı yok, fiyat sözü yok, kaynakta geçmeyen abartı yok. Sebebi döner.
 */
export function kisaOgeSorunu(metin: string, kaynak = ''): string | null {
  /*
   * MÜŞTERİNİN KENDİ BEYANI GEÇER (yönetici kararı, 2026-10-12, Ajan 4 Ö-D).
   * Öğe Marka Merkezi vaatlerinde / marka bilgisinde / sitede AYNEN yazıyorsa
   * ("Ücretsiz keşif", "7/24 destek") bu bir uydurma değil, müşterinin
   * kendi sözü; Google da doğru olduğu sürece "ücretsiz"e izin veriyor.
   * Eskiden fiyat süzgeci kaynağa bakmadan reddediyordu ve müşterinin
   * kendi vaadi bile atılıyordu. `kaynak` yalnız KULLANICI/MÜŞTERİ kaynaklı
   * metni taşımalı; yapay zekânın ürettiği metin buraya girerse kural her
   * şeyi geçirir (çağıranlar bunu ayırıyor).
   */
  const n = (x: string) => x.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR');
  if (kaynak && n(metin) && n(kaynak).includes(n(metin))) return null;
  if (/\d/.test(metin) || FIYAT_SOZU.test(metin)) return 'sayı ya da fiyat sözü taşıyor';
  const a = abartiSozu(metin, kaynak);
  return a ? `"${a}" sözü kaynakta yok` : null;
}

/**
 * `kaynak`: abartı sözünün AYNEN aranacağı metin (Marka Merkezi vaatleri,
 * marka bilgisi). Verilmezse abartı sözü her zaman atılır.
 */
export function aciklamaMetinleriUret(vaatler: readonly string[], kaynak = ''): { metinler: string[]; atilan: Array<{ metin: string; sebep: string }> } {
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
    const sorun = kisaOgeSorunu(v, kaynak);
    if (sorun) {
      atilan.push({ metin: v, sebep: sorun });
      continue;
    }
    const k = v.toLocaleLowerCase('tr-TR');
    if (gorulen.has(k)) continue;
    gorulen.add(k);
    metinler.push(v);
  }
  return { metinler, atilan };
}
