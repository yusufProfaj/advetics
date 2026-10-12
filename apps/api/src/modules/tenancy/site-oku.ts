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
  if (ip.includes(':')) return ozelIpv6(ip);

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

/**
 * IPv6 — METİN DEĞİL BAYT ÜZERİNDEN.
 *
 * İlk sürüm adresi düzenli ifadeyle okuyordu ve yalnız `::ffff:10.0.0.1`
 * yazımını tanıyordu. Aynı iç adres ONALTILIK yazılabiliyor
 * (`::ffff:7f00:1` = 127.0.0.1, `::ffff:a9fe:a9fe` = bulut metadata) ve
 * IPv4'ü gömen başka aileler var: IPv4-uyumlu `::127.0.0.1`, NAT64
 * `64:ff9b::/96` (ağ geçidi gömülü IPv4'e bağlanıyor), 6to4 `2002::/16`.
 * Bir çözücünün hangi biçimi döndüreceği bizim elimizde değil; adres 16
 * bayta açılıp gömülü IPv4 AYNI IPv4 kontrolünden geçiyor (Ajan 4, Paket A).
 * Okunamayan adres İÇ AĞ sayılıyor: tanımadığımızı geçirmek yerine reddet.
 */
function ozelIpv6(ip: string): boolean {
  const b = ipv6Baytlari(ip.toLowerCase().replace(/%.*$/, ''));
  if (!b) return true;
  const sifir = (bas: number, son: number) => b.slice(bas, son).every((x) => x === 0);
  const v4 = (i: number) => `${b[i]}.${b[i + 1]}.${b[i + 2]}.${b[i + 3]}`;
  if (sifir(0, 15) && (b[15] === 0 || b[15] === 1)) return true; // :: ve ::1
  if ((b[0]! & 0xfe) === 0xfc) return true; // fc00::/7 benzersiz yerel
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return true; // fe80::/10 bağ yerel
  if (b[0] === 0xff) return true; // çoklu gönderim
  if (sifir(0, 10) && b[10] === 0xff && b[11] === 0xff) return ozelAdres(v4(12)); // ::ffff:0:0/96 eşlemeli
  if (sifir(0, 12)) return ozelAdres(v4(12)); // ::/96 IPv4-uyumlu (eskimiş ama çözülebiliyor)
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) return ozelAdres(v4(12)); // 64:ff9b::/96 ve /48 NAT64
  if (b[0] === 0x20 && b[1] === 0x02) return ozelAdres(v4(2)); // 2002::/16 6to4
  return false;
}

/** IPv6 metni → 16 bayt; geçersizse `null`. Sondaki noktalı IPv4 yazımı da açılıyor. */
function ipv6Baytlari(ip: string): number[] | null {
  let metin = ip;
  const noktali = /(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(metin);
  if (noktali) {
    const p = noktali.slice(1).map(Number);
    if (p.some((n) => n > 255)) return null;
    metin = `${metin.slice(0, noktali.index)}${((p[0]! << 8) | p[1]!).toString(16)}:${((p[2]! << 8) | p[3]!).toString(16)}`;
  }
  const yarim = metin.split('::');
  if (yarim.length > 2) return null;
  const parca = (s: string) => (s === '' ? [] : s.split(':'));
  const bas = parca(yarim[0]!);
  const son = yarim.length === 2 ? parca(yarim[1]!) : [];
  const eksik = 8 - bas.length - son.length;
  if ((yarim.length === 2 && eksik < 1) || (yarim.length === 1 && eksik !== 0)) return null;
  const gruplar = [...bas, ...Array<string>(yarim.length === 2 ? eksik : 0).fill('0'), ...son];
  const out: number[] = [];
  for (const g of gruplar) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    out.push(n >> 8, n & 0xff);
  }
  return out.length === 16 ? out : null;
}

/**
 * ═══ SAYFANIN HAM HTML'İ — YÖNLENDİRMEYİ HER ADIMDA YENİDEN DOĞRULAYARAK ═══
 *
 * "YouTube kanalını bul" sitenin bağlantılarına bakıyor; metne çevrilmiş
 * hâl (`siteOku`) bağlantıları attığı için ham gövde gerekiyor.
 *
 * YÖNLENDİRME İZLENİYOR ama `siteOku`nun "izlenirse ilk adresin doğrulanmış
 * olması hiçbir şey ifade etmiyor" itirazı burada geçerli değil: her adım
 * İLK İSTEKLE AYNI kontrolden geçiyor (https, IP literali yok, çözülen her
 * adres iç ağ dışında). Kurumsal sitelerin çoğu `site.com`dan
 * `www.site.com`a yönlendiriyor ve izlememek, bağlantı aramasını
 * müşterilerin çoğunda "site yönlendirdi" ile bitirirdi. `siteOku`
 * değişmiyor: o yolun kendi gerekçesi ve testleri var.
 */
export type HtmlSonucu = { ok: true; html: string; adres: string } | { ok: false; sebep: string };

/**
 * `javascript: true`: Tag Manager dosyası (`gtm.js`) `application/javascript`
 * dönüyor (ölçüldü, 2026-10-11) ve HTML süzgeci onu reddediyordu; Ölçüm
 * taraması bu yüzden üretimde hiçbir kapsayıcıyı okuyamıyordu (Ajan 4, B1).
 * Varsayılan değişmiyor: diğer çağıranlar yalnız HTML/metin bekliyor.
 */
/*
 * `xml: true`: site haritası (`sitemap.xml`) `application/xml` dönüyor ve
 * HTML süzgeci onu reddederdi; site bağlantısının ikinci kaynağı (tek sayfa
 * ya da menüsü JavaScript'le çizilen site) hiç okunamazdı. Güvenlik
 * kontrolleri (https, port, IP, iç ağ, boyut, zaman aşımı) AYNI.
 */
export async function sayfaHtmlGetir(rawUrl: string, maxYonlendirme = 3, secenek: { javascript?: boolean; xml?: boolean } = {}): Promise<HtmlSonucu> {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return { ok: false, sebep: 'Site adresi geçerli bir URL değil.' };
  }

  for (let adim = 0; adim <= maxYonlendirme; adim++) {
    const engel = await adresEngeli(url);
    if (engel) return { ok: false, sebep: engel };

    const kontrol = new AbortController();
    const zamanlayici = setTimeout(() => kontrol.abort(), ZAMAN_ASIMI_MS);
    try {
      const res = await fetch(url.toString(), {
        redirect: 'manual',
        signal: kontrol.signal,
        headers: {
          'User-Agent': 'Advetics/1.0 (+youtube-kanal-bul)',
          Accept: secenek.javascript
            ? 'application/javascript,text/javascript,*/*;q=0.5'
            : secenek.xml
              ? 'application/xml,text/xml;q=0.9'
              : 'text/html,application/xhtml+xml',
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const konum = res.headers.get('location');
        if (!konum) return { ok: false, sebep: `Site ${res.status} döndürdü ama hedef adres yok.` };
        url = new URL(konum, url);
        continue;
      }
      if (!res.ok) return { ok: false, sebep: `Site ${res.status} döndürdü.` };
      const tur = res.headers.get('content-type') ?? '';
      const jsKabul = (secenek.javascript === true && /javascript|ecmascript/i.test(tur)) || (secenek.xml === true && /xml/i.test(tur));
      if (!jsKabul && !tur.includes('html') && !tur.includes('text')) {
        return { ok: false, sebep: `Site HTML döndürmedi (${tur || 'tür bilinmiyor'}).` };
      }
      return { ok: true, html: await govdeyiOku(res), adres: url.toString() };
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
  return { ok: false, sebep: `Site ${maxYonlendirme} kereden fazla yönlendirdi; okunmadı.` };
}

/** Bir adımın güvenlik kontrolü — `siteOku`yla AYNI kurallar. Engel yoksa null. */
async function adresEngeli(url: URL): Promise<string | null> {
  if (url.protocol !== 'https:') return 'Site adresi https ile başlamalı.';
  // AÇIK PORT YOK (Ajan 4, Ö-1): her adımda, yönlendirmede de. Paylaşımlı
  // VPS'te müşteri sitesi sunucunun kendi genel IP'sine çözülebilir ve
  // `:8443`/`:6379` o makinenin yönetim ya da veri portu olur; iç ağ
  // kontrolü genel IP'yi görmez. `URL` varsayılan portu (443) boş yazar.
  if (url.port !== '') return 'Site adresi varsayılan port dışında; okunmadı.';
  if (ipLiterali(url.hostname)) return 'Site adresi alan adı olmalı, IP değil.';
  let adresler: Array<{ address: string; family: number }>;
  try {
    adresler = await lookup(url.hostname, { all: true });
  } catch {
    return `Site adresi çözülemedi: ${url.hostname}`;
  }
  if (adresler.length === 0 || adresler.some((a) => ozelAdres(a.address))) {
    return 'Site adresi iç ağa işaret ediyor; okunmadı.';
  }
  return null;
}
