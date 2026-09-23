import { lookup } from 'node:dns/promises';

/**
 * ═══ MÜŞTERİNİN KENDİ SİTESİNİ OKUMA ═══
 *
 * Bilgi Bankası'nı yapay zekâyla doldurmanın tek dürüst yolu: modele
 * uydurtmak değil, işletmenin KENDİ sitesini okuyup ona vermek. Model
 * bilmediği bir markayı "araştırdığında" ortaya makul görünen ama yanlış
 * cümleler çıkıyor ve o cümleler buradan reklam metnine geçiyor.
 *
 * ═══ SUNUCUDAN DIŞARI GİDEN HER İSTEK KAPATILIYOR ═══
 *
 * Adres KULLANICIDAN geliyor (workspace kartındaki site alanı) ve paylaşımlı
 * bir VPS'te bu, iç ağa ya da bulut metadata ucuna (`169.254.169.254`)
 * yapılmış bir istek olabilir. Kreatif görselinde beyaz liste işe yarıyordu
 * çünkü adres bilinen CDN'lerden geliyor; burada liste tutmak her yeni
 * müşteride kod değişikliği demek.
 *
 * KORUMA ADRESTE DEĞİL ÇÖZÜLEN IP'DE: `evil.com` pekâlâ `169.254.169.254`e
 * çözülebilir ve adres DİZGESİNE bakan hiçbir kontrol bunu göremez.
 *
 * YÖNLENDİRME İZLENMİYOR (`redirect: 'manual'`): izlenirse ilk adresin
 * doğrulanmış olması hiçbir şey ifade etmiyor — hedef iç ağa gidebilir.
 *
 * Kalan risk DNS rebinding (doğrulama ile bağlantı arasında kaydın
 * değişmesi); kısa zaman aşımıyla kabul edilen kalıntı.
 */

/** Gövde okunurken uygulanan üst sınır. */
const MAX_BAYT = 512 * 1024;

/** Tek bir sayfa için zaman aşımı. */
const ZAMAN_ASIMI_MS = 8_000;

export type SiteSonucu =
  | { ok: true; metin: string; adres: string }
  | { ok: false; sebep: string };

export async function siteOku(rawUrl: string): Promise<SiteSonucu> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, sebep: 'Site adresi geçerli bir URL değil.' };
  }

  /*
   * YALNIZCA HTTPS. `http:` üzerinden okumak, araya girenin sayfayı
   * değiştirebilmesi demek ve o sayfanın metni doğrudan modele gidiyor.
   */
  if (url.protocol !== 'https:') {
    return { ok: false, sebep: 'Site adresi https ile başlamalı.' };
  }

  /*
   * IP LİTERALİ REDDEDİLİYOR. Bir işletme sitesi alan adıyla anılır;
   * doğrudan IP yazılması, iç ağa erişme girişiminin en basit hâli.
   */
  if (ipLiterali(url.hostname)) {
    return { ok: false, sebep: 'Site adresi alan adı olmalı, IP değil.' };
  }

  let adresler: Array<{ address: string; family: number }>;
  try {
    adresler = await lookup(url.hostname, { all: true });
  } catch {
    return { ok: false, sebep: `Site adresi çözülemedi: ${url.hostname}` };
  }

  // TEK BİR ÖZEL ADRES YETİYOR. Bir alan adı hem genel hem iç bir adrese
  // çözülüyorsa, hangisine bağlanacağımızı seçemiyoruz — tamamı reddediliyor.
  if (adresler.length === 0 || adresler.some((a) => ozelAdres(a.address))) {
    return { ok: false, sebep: 'Site adresi iç ağa işaret ediyor; okunmadı.' };
  }

  const kontrol = new AbortController();
  const zamanlayici = setTimeout(() => kontrol.abort(), ZAMAN_ASIMI_MS);

  try {
    const res = await fetch(url.toString(), {
      // YÖNLENDİRME İZLENMİYOR — gerekçesi dosya başında.
      redirect: 'manual',
      signal: kontrol.signal,
      headers: {
        // Sunucuların bir kısmı UA'sız isteği reddediyor; kendimizi
        // olduğumuz gibi tanıtıyoruz.
        'User-Agent': 'Advetics/1.0 (+bilgi-bankasi)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });

    if (res.status >= 300 && res.status < 400) {
      return {
        ok: false,
        sebep:
          'Site yönlendirme döndürdü ve yönlendirmeler güvenlik gereği izlenmiyor. ' +
          'Workspace kartındaki adresi son hâline güncelle.',
      };
    }
    if (!res.ok) {
      return { ok: false, sebep: `Site ${res.status} döndürdü.` };
    }

    const tur = res.headers.get('content-type') ?? '';
    if (!tur.includes('html') && !tur.includes('text')) {
      return { ok: false, sebep: `Site HTML döndürmedi (${tur || 'tür bilinmiyor'}).` };
    }

    /*
     * BOYUT SINIRI GÖVDE OKUNURKEN. `content-length` yalan söyleyebiliyor ve
     * sınırsız bir gövde okumak paylaşımlı sunucuda süreci düşürür.
     */
    const ham = await govdeyiOku(res);
    const metin = metneCevir(ham);

    if (metin.length < 80) {
      /*
       * ÇOK KISA METİN BAŞARI SAYILMIYOR. Tek satırlık bir "JavaScript
       * gerekiyor" sayfası modele hiçbir şey anlatmıyor ve model onun
       * üstüne uydurmaya başlıyor.
       */
      return {
        ok: false,
        sebep:
          'Siteden okunabilir metin çıkmadı. Sayfa büyük ihtimalle JavaScript ile ' +
          'çiziliyor; bilgileri elle yazman gerekiyor.',
      };
    }

    return { ok: true, metin, adres: url.toString() };
  } catch (err) {
    const abort = err instanceof Error && err.name === 'AbortError';
    return {
      ok: false,
      sebep: abort
        ? 'Site zamanında yanıt vermedi.'
        : `Site okunamadı: ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    clearTimeout(zamanlayici);
  }
}

/** Gövdeyi sınıra kadar okur — `content-length`e güvenmeden. */
async function govdeyiOku(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';

  const parcalar: Uint8Array[] = [];
  let toplam = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    parcalar.push(value);
    toplam += value.byteLength;
    if (toplam >= MAX_BAYT) {
      // SESSİZ KESME DEĞİL: sınıra ulaşıldığında okuma bırakılıyor ve elde
      // olan metin kullanılıyor — bir işletme sitesinin ilk 512 KB'ı
      // "ne yapıyorlar" sorusunu fazlasıyla cevaplıyor.
      await reader.cancel().catch(() => undefined);
      break;
    }
  }

  return new TextDecoder('utf-8', { fatal: false }).decode(concat(parcalar));
}

function concat(parcalar: Uint8Array[]): Uint8Array {
  const toplam = parcalar.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(toplam);
  let i = 0;
  for (const p of parcalar) {
    out.set(p, i);
    i += p.byteLength;
  }
  return out;
}

/**
 * HTML → düz metin.
 *
 * KÜTÜPHANE KULLANILMIYOR: tek ihtiyacımız modele verilecek okunabilir
 * metin ve bir HTML çözümleyicisi paylaşımlı sunucuya yeni bir bağımlılık
 * demek. `script`/`style` GÖVDESİYLE atılıyor — içlerindeki kod modele
 * gürültü olarak gidiyor ve token harcıyor.
 */
export function metneCevir(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Nokta ya da iki nokta taşıyan çıplak adres — alan adı değil. */
function ipLiterali(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return true;
  // IPv6 URL'de köşeli parantez içinde geliyor ve `hostname` onları atıyor.
  return host.includes(':');
}

/**
 * İÇ AĞ ARALIKLARI — bulut metadata ucu dahil.
 *
 * `169.254.169.254` AWS/GCP/Azure'da makinenin kimlik bilgilerini veriyor ve
 * bir SSRF'in en değerli hedefi. `100.64/10` (CGNAT) da ekli: paylaşımlı
 * barındırmada iç trafiğin bir kısmı orada.
 */
export function ozelAdres(ip: string): boolean {
  if (ip.includes(':')) {
    const alt = ip.toLowerCase();
    // ::1 (loopback), fc00::/7 (benzersiz yerel), fe80::/10 (bağ yerel)
    if (alt === '::1' || alt === '::') return true;
    if (/^f[cd]/.test(alt)) return true;
    if (/^fe[89ab]/.test(alt)) return true;
    // IPv4 eşlemeli adres: ::ffff:10.0.0.1
    const eslem = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(alt);
    if (eslem) return ozelAdres(eslem[1]!);
    return false;
  }

  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p as [number, number, number, number];

  if (a === 0 || a === 127) return true; // bu ağ · loopback
  if (a === 10) return true; // özel
  if (a === 172 && b >= 16 && b <= 31) return true; // özel
  if (a === 192 && b === 168) return true; // özel
  if (a === 169 && b === 254) return true; // bağ yerel + bulut metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // çoklu gönderim ve ayrılmış
  return false;
}
