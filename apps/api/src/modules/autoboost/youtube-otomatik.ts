/**
 * ═══ YOUTUBE REKLAMININ METİNLERİ — videonun kendisinden ═══
 *
 * Kullanıcının isteği: *"metinleri de aldığın videonun başlığıyla dolduracak
 * bir sistem yapman gerekiyor ben sadece bütçe gireceğim"*. Önceden başlık,
 * uzun başlık ve açıklama ön ayarda bir kez yazılıyor ve HER VİDEO AYNI
 * metinle yayınlanıyordu; videonun kendi başlığı yalnızca kampanya adına
 * giriyordu.
 *
 * Bu dosya SAF: platform çağrısı yok, veritabanı yok. Kurallar çalıştırılarak
 * sınanıyor (`youtube-otomatik.spec.ts`) — bir karakterlik taşma Google'ın
 * reddi, bir kelimenin ortasından kesme ise reklamda yarım bir kelime demek
 * ve ikisi de kaynak taramasıyla görünmüyor.
 */

/**
 * GOOGLE'IN SINIRLARI — şemadakiyle AYNI sayılar.
 *
 * Demand Gen video reklamında dokümanlar çelişiyor (başlık 30 mu 40 mı);
 * şema sıkı olanı seçti (`googlePresetSettingsSchema` üzerindeki not) ve
 * burada da o. Gerçek sınır ilk canlı çağrıda netleşecek.
 */
export const GOOGLE_METIN_SINIRI = {
  marka: 25,
  baslik: 30,
  uzunBaslik: 90,
  aciklama: 90,
} as const;

/**
 * Reklam metnine GİRMEMESİ gereken parçaları atar.
 *
 * YouTube başlıkları reklam metni için yazılmıyor: `#shorts`, emoji, bağlantı
 * ve "|" ayraçları çok yaygın. Google reklam metinlerinde standart dışı
 * sembol ve emoji kullanımını politika ihlali sayıyor; reddedilen bir reklam
 * kullanıcıya "Google reddetti" olarak dönüyor ve sebebi başlığın
 * içindeki bir kalp işareti oluyor.
 *
 * Türkçe harfler KORUNUYOR — `\p{L}` her dildeki harfi kapsıyor; ASCII'ye
 * indirgemek "Şirketimiz"i "irketimiz" yapardı.
 */
export function temizle(metin: string): string {
  return metin
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/#[\p{L}\p{N}_]+/gu, ' ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, ' ')
    .replace(/[|•·~]+/g, ' ')
    .replace(/([!?.,])\1+/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s\-–—:,;]+|[\s\-–—:,;]+$/g, '');
}

/**
 * KELİME SINIRINDA KESER — kelimenin ortasından asla.
 *
 * Sınıra sığıyorsa metin aynen dönüyor. Sığmıyorsa sınırdan önceki son
 * boşlukta kesiliyor ve sondaki bağlaç işaretleri (virgül, tire, iki nokta)
 * atılıyor: "Bodrum'da yeni villa projemiz," gibi yarım bir cümle reklamda
 * yazım hatası gibi görünür.
 *
 * ÜÇ NOKTA KONMUYOR. Reklam başlığında "…" okuyana "devamı var" diyor ama
 * tıklayınca devam eden bir metin yok; Google da "…"ı gereksiz noktalama
 * sayabiliyor.
 *
 * TEK KELİME SINIRDAN UZUNSA boş dönüyor: onu kesmek anlamsız bir parça
 * üretirdi ve çağıran bir yedeğe düşmeli.
 */
export function kelimedeKes(metin: string, sinir: number): string {
  const t = temizle(metin);
  if (t.length <= sinir) return t;
  const parca = t.slice(0, sinir + 1);
  const bosluk = parca.lastIndexOf(' ');
  if (bosluk <= 0) return '';
  return parca.slice(0, bosluk).replace(/[\s\-–—:,;.]+$/g, '');
}

export type MarkaKaynagi = 'workspace' | 'kanal' | 'kisaltildi' | 'yok';

/**
 * MARKA ADI — reklamda "sponsorlu" satırında görünen ad.
 *
 * Önce WORKSPACE ADI: raporlarda ve panelde müşterinin adı o. Google 25
 * karakter sınırı koyuyor; sığmazsa YouTube KANAL ADI deneniyor (kanal
 * genelde markanın kısa adını taşıyor). İkisi de sığmazsa workspace adı
 * kelime sınırında kısaltılıyor ve kaynağı `kisaltildi` olarak işaretleniyor
 * — ekran bunu yazıyor, kullanıcı istemiyorsa değiştiriyor.
 */
export function markaAdiSec(
  workspaceAdi: string | null,
  kanalAdi: string | null,
): { deger: string | null; kaynak: MarkaKaynagi } {
  const ws = workspaceAdi ? temizle(workspaceAdi) : '';
  const kanal = kanalAdi ? temizle(kanalAdi) : '';
  if (ws && ws.length <= GOOGLE_METIN_SINIRI.marka) return { deger: ws, kaynak: 'workspace' };
  if (kanal && kanal.length <= GOOGLE_METIN_SINIRI.marka) return { deger: kanal, kaynak: 'kanal' };
  const kisa = kelimedeKes(ws || kanal, GOOGLE_METIN_SINIRI.marka);
  return kisa ? { deger: kisa, kaynak: 'kisaltildi' } : { deger: null, kaynak: 'yok' };
}

/**
 * AÇIKLAMANIN İLK ANLAMLI SATIRI.
 *
 * YouTube açıklamaları çoğu zaman uzun ve dağınık: ilk satır videonun
 * özeti, altı bağlantılar, zaman damgaları ve hashtag'ler. Yalnızca
 * bağlantıdan ya da hashtag'den ibaret satırlar atlanıyor; "00:00 Giriş"
 * gibi bölüm satırları da.
 */
export function aciklamaSatiri(aciklama: string | null): string {
  if (!aciklama) return '';
  for (const satir of aciklama.split(/\r?\n/)) {
    if (/^\s*\d{1,2}:\d{2}/.test(satir)) continue;
    const t = temizle(satir);
    // Temizlikten sonra harf kalmıyorsa (yalnızca bağlantı/hashtag) atla.
    if (/\p{L}{2,}/u.test(t)) return t;
  }
  return '';
}

export interface VideoMetinleri {
  headlines: string[];
  longHeadlines: string[];
  descriptions: string[];
}

/**
 * Videodan reklam metinleri.
 *
 *   · Başlık (30)       → video başlığı, kelime sınırında
 *   · Uzun başlık (90)  → video başlığı
 *   · Açıklama (90)     → açıklamanın ilk anlamlı satırı
 *
 * YEDEKLER UYDURMUYOR. Başlık boş kalırsa (tamamı emoji/hashtag bir başlık)
 * marka adı kullanılıyor; açıklama yoksa "<marka> kanalında yeni video" —
 * doğru ve tarafsız bir cümle, bir vaat değil. Google üç alanı da zorunlu
 * tuttuğu için boş gönderilemiyor.
 */
export function videoMetinleri(
  baslik: string | null,
  aciklama: string | null,
  marka: string,
): VideoMetinleri {
  const kisa = kelimedeKes(baslik ?? '', GOOGLE_METIN_SINIRI.baslik) || kelimedeKes(marka, GOOGLE_METIN_SINIRI.baslik);
  const uzun = kelimedeKes(baslik ?? '', GOOGLE_METIN_SINIRI.uzunBaslik) || kisa;
  const ilkSatir = kelimedeKes(aciklamaSatiri(aciklama), GOOGLE_METIN_SINIRI.aciklama);
  const yedek = kelimedeKes(`${marka} kanalında yeni video`, GOOGLE_METIN_SINIRI.aciklama);
  return {
    headlines: [kisa],
    longHeadlines: [uzun],
    descriptions: [ilkSatir || yedek],
  };
}

/**
 * WEB SİTESİ → HEDEF URL.
 *
 * Workspace'in web sitesi serbest metin olarak saklanıyor ("miayapi.com").
 * Google tam bir adres istiyor; şemasız adres "geçersiz URL" ile düşerdi.
 * `http://` bilerek `https://`e çevriliyor: reklamın varış adresi düz http
 * olursa tarayıcı "güvenli değil" uyarısı gösteriyor.
 *
 * AYRIŞTIRILAMAYAN değer `null` — tahmin edilmiyor, eksik olarak yazılıyor.
 */
export function hedefUrl(website: string | null): string | null {
  const t = (website ?? '').trim();
  if (!t) return null;
  const tam = /^https:\/\//i.test(t)
    ? t
    : /^http:\/\//i.test(t)
      ? `https://${t.slice(7)}`
      : `https://${t}`;
  try {
    const u = new URL(tam);
    return u.hostname.includes('.') ? u.toString() : null;
  } catch {
    return null;
  }
}
