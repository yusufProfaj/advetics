/**
 * ═══ RAPOR PDF'İ İÇİN KREATİF GÖRSELİ İNDİRME ═══
 *
 * `top_ads` bölümü PDF'te yoktu ve sebebi buydu: görseli getirmek, sunucudan
 * DIŞARI bir HTTP isteği yapmak demek ve o istek üç ayrı şekilde zarar
 * verebiliyor. Üçü de burada kapatılıyor.
 *
 * 1. SSRF. Adres veritabanından geliyor, yani platformun bize verdiği bir
 *    dizge. "Platformdan geldi" güvenli demek değil: o alan bir gün başka bir
 *    şey taşırsa sunucumuz onu ÇEKER. Paylaşımlı VPS'te bu, iç ağa ya da
 *    bulut metadata ucuna yapılmış bir istek olabilir. Bu yüzden yalnızca
 *    HTTPS ve yalnızca BİLİNEN platform CDN'leri kabul ediliyor — kara liste
 *    değil BEYAZ liste, çünkü kara liste her yeni durumda güncellenmek zorunda.
 *
 * 2. Askıda kalan istek. Ölü bir CDN adresi isteği dakikalarca bekletebilir ve
 *    o sırada PDF üretimi — dolayısıyla kullanıcının isteği — bloklanır. Her
 *    indirmenin kendi zaman aşımı ve tüm bölümün toplam bütçesi var.
 *
 * 3. Bellek. Sınırsız bir gövde okumak, birkaç eşzamanlı rapor üretiminde
 *    süreci düşürür. Boyut sınırı gövde OKUNURKEN uygulanıyor;
 *    `content-length`e güvenmek yetmiyor, sunucu yalan söyleyebiliyor.
 *
 * BAŞARISIZLIK SESSİZ DEĞİL. Her indirme bir SEBEPLE dönüyor ve PDF o sebebi
 * yazıyor: "görseli olmayan metin reklamı" ile "görseli vardı ama alınamadı"
 * farklı iki şey ve ikisini aynı boş kutuya çevirmek bu projenin tekrar eden
 * hatası.
 */

/**
 * pdf-lib YALNIZCA JPEG ve PNG gömebiliyor.
 *
 * Meta thumbnail'ları sık sık WebP dönüyor ve `embedJpg` onu okumaya
 * çalışınca anlaşılmaz bir hata fırlatıyor. Biçim GÖVDEDEN anlaşılıyor,
 * uzantıdan değil: CDN adreslerinde uzantı çoğu zaman yok ve
 * `content-type` da yanlış olabiliyor.
 */
export type GorselTuru = 'jpg' | 'png';

export type GorselSonucu =
  | { ok: true; bytes: Uint8Array; tur: GorselTuru }
  | { ok: false; sebep: string };

/**
 * İzin verilen ana makine sonekleri.
 *
 * Meta görselleri `*.fbcdn.net` ve `*.cdninstagram.com` üzerinden; Google
 * varlıkları `*.googleusercontent.com` ve `*.gstatic.com` üzerinden geliyor.
 * Liste büyütülürken kural aynı: TAM alan adı soneki, joker değil —
 * `evil-fbcdn.net` eşleşmemeli.
 */
export const IZINLI_SONEKLER = [
  '.fbcdn.net',
  '.cdninstagram.com',
  '.googleusercontent.com',
  '.gstatic.com',
  '.ggpht.com',
] as const;

/** Tek görsel için üst sınırlar. */
export const GORSEL_SINIRI = {
  /** Bayt. 4 MB'ın üstünde bir reklam görseli yok; olan varsa da rapora girmesin. */
  maxBayt: 4 * 1024 * 1024,
  /** Milisaniye. Ölü bir CDN adresinde beklenen süre bu kadar. */
  zamanAsimiMs: 4000,
} as const;

/** Bütün bölüm için toplam bütçe — altı görsel dizi hâlinde bile bunu aşmamalı. */
export const TOPLAM_BUTCE_MS = 10_000;

export function adresGuvenliMi(ham: string): { ok: true; url: URL } | { ok: false; sebep: string } {
  let url: URL;
  try {
    url = new URL(ham);
  } catch {
    return { ok: false, sebep: 'adres okunamadı' };
  }

  // HTTPS ŞART. http, veri yolunda değiştirilebilir bir görseli müşteriye
  // giden belgeye koymak demek.
  if (url.protocol !== 'https:') return { ok: false, sebep: 'yalnızca https' };

  /*
   * IP LİTERALİ REDDEDİLİYOR. Beyaz liste alan adı soneki üzerinden çalışıyor
   * ve bir IP hiçbir sonekle eşleşmez; yine de açıkça reddetmek, ileride
   * listeye bir sonek eklenirken bu kapının kazara açılmasını engelliyor.
   */
  const host = url.hostname.toLowerCase();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':') || host.startsWith('[')) {
    return { ok: false, sebep: 'IP adresi kabul edilmiyor' };
  }

  if (!IZINLI_SONEKLER.some((sonek) => host.endsWith(sonek))) {
    return { ok: false, sebep: `bilinmeyen sunucu (${host})` };
  }

  return { ok: true, url };
}

/** Gövdenin ilk baytlarından biçimi anlar. Uzantıya ve content-type'a GÜVENİLMİYOR. */
export function turuAnla(bytes: Uint8Array): GorselTuru | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'png';
  }
  return null;
}

type Getirici = typeof fetch;

/**
 * Tek görseli indirir.
 *
 * `fetch` DIŞARIDAN VERİLEBİLİYOR: testte gerçek ağa çıkmak, testi hem yavaş
 * hem de CDN'in o günkü hâline bağımlı yapardı.
 */
export async function gorselIndir(
  ham: string,
  opts: { getir?: Getirici; signal?: AbortSignal } = {},
): Promise<GorselSonucu> {
  const kontrol = adresGuvenliMi(ham);
  if (!kontrol.ok) return kontrol;
  return indir(kontrol.url, opts.getir, opts.signal);
}

/** İndirmenin ORTAK gövdesi — adres kontrolü çağırana ait. */
async function indir(
  url: URL,
  getirici?: Getirici,
  disSignal?: AbortSignal,
): Promise<GorselSonucu> {
  const getir = getirici ?? fetch;
  const kendi = new AbortController();
  const zamanlayici = setTimeout(() => kendi.abort(), GORSEL_SINIRI.zamanAsimiMs);
  const iptal = (): void => kendi.abort();
  disSignal?.addEventListener('abort', iptal);

  try {
    const yanit = await getir(url.toString(), {
      signal: kendi.signal,
      // YÖNLENDİRME İZLENMİYOR. İzlenirse beyaz liste anlamsızlaşır: izinli
      // bir CDN 302 ile başka bir yere gönderebilir ve isteği biz yaparız.
      redirect: 'manual',
    });

    if (yanit.status >= 300 && yanit.status < 400) {
      return { ok: false, sebep: 'yönlendirme izlenmiyor' };
    }
    if (!yanit.ok) return { ok: false, sebep: `sunucu ${yanit.status}` };

    const bytes = await govdeyiOku(yanit);
    if (bytes === null) return { ok: false, sebep: 'görsel çok büyük' };

    const tur = turuAnla(bytes);
    if (tur === null) return { ok: false, sebep: 'desteklenmeyen biçim (yalnızca JPEG/PNG)' };

    return { ok: true, bytes, tur };
  } catch (err) {
    if (kendi.signal.aborted) return { ok: false, sebep: 'zaman aşımı' };
    return { ok: false, sebep: err instanceof Error ? err.message : 'indirilemedi' };
  } finally {
    clearTimeout(zamanlayici);
    disSignal?.removeEventListener('abort', iptal);
  }
}

/**
 * Gövdeyi SINIRA KADAR okur; aşarsa `null`.
 *
 * `content-length`e bakıp geçmek yetmiyor — başlık yanlış ya da hiç yok
 * olabilir. Sınır okuma sırasında uygulanıyor.
 */
async function govdeyiOku(yanit: Response): Promise<Uint8Array | null> {
  const okuyucu = yanit.body?.getReader();
  if (!okuyucu) {
    const tampon = new Uint8Array(await yanit.arrayBuffer());
    return tampon.length > GORSEL_SINIRI.maxBayt ? null : tampon;
  }

  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await okuyucu.read();
    if (done) break;
    if (!value) continue;
    toplam += value.length;
    if (toplam > GORSEL_SINIRI.maxBayt) {
      await okuyucu.cancel();
      return null;
    }
    parcalar.push(value);
  }

  const hepsi = new Uint8Array(toplam);
  let ofset = 0;
  for (const p of parcalar) {
    hepsi.set(p, ofset);
    ofset += p.length;
  }
  return hepsi;
}

/**
 * Aynı anda kaç indirme.
 *
 * Sıralı indirme altı görselde altı gidiş-dönüş demek ve bu kullanıcının
 * beklediği bir istek yolunda. Sınırsız paralellik ise ters uç: liste bir gün
 * büyürse aynı anda onlarca bağlantı açılır. Dört, `topAds` sorgusunun bugünkü
 * LIMIT 6'sına göre değil o sınır büyüse de güvenli olacak şekilde seçildi.
 */
const ES_ZAMANLI = 4;

/**
 * Birden çok görseli TOPLAM BÜTÇE içinde indirir.
 *
 * Bütçe dolduğunda kalanlar denenmiyor ve sebebi yazılıyor: yarısı gelmiş bir
 * bölümde eksik olanların NEDEN eksik olduğu görünmeli. Sıra korunuyor — en
 * çok harcayan reklam ilk sırada ve bütçe biterse en alttakiler düşsün.
 */
export async function gorselleriIndir(
  adresler: Array<string | null>,
  opts: { getir?: Getirici | undefined } = {},
): Promise<Map<string, GorselSonucu>> {
  // Tekilleştirme ÖNCE: aynı kreatif iki reklamda kullanılıyorsa iki kez
  // indirmenin hiçbir faydası yok.
  const benzersiz = [...new Set(adresler.filter((a): a is string => a !== null))];
  const sonuclar = new Map<string, GorselSonucu>();
  const butce = new AbortController();
  const zamanlayici = setTimeout(() => butce.abort(), TOPLAM_BUTCE_MS);

  try {
    for (let i = 0; i < benzersiz.length; i += ES_ZAMANLI) {
      const grup = benzersiz.slice(i, i + ES_ZAMANLI);
      const cikti = await Promise.all(
        grup.map(async (adres) => {
          /*
           * BÜTÇE DOLMUŞSA DENENMİYOR ama SEBEBİ yazılıyor. Sessizce
           * atlamak, yarısı gelmiş bir bölümde eksiklerin NEDEN eksik
           * olduğunu görünmez yapardı.
           */
          if (butce.signal.aborted) {
            return [adres, { ok: false as const, sebep: 'süre doldu' }] as const;
          }
          return [
            adres,
            await gorselIndir(adres, { getir: opts.getir, signal: butce.signal }),
          ] as const;
        }),
      );
      for (const [adres, sonuc] of cikti) sonuclar.set(adres, sonuc);
    }
  } finally {
    clearTimeout(zamanlayici);
  }

  return sonuclar;
}
