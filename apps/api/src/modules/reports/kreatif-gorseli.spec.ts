import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  adresGuvenliMi,
  gorselIndir,
  gorselleriIndir,
  logoIndir,
  GORSEL_SINIRI,
  turuAnla,
} from './kreatif-gorseli';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function yanit(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status });
}

const IZINLI = 'https://scontent.xx.fbcdn.net/v/t45/gorsel.jpg';

describe('kreatif görseli — adres kontrolü', () => {
  it('KRİTİK: izinli CDN kabul ediliyor', () => {
    expect(adresGuvenliMi(IZINLI).ok).toBe(true);
    expect(adresGuvenliMi('https://lh3.googleusercontent.com/x').ok).toBe(true);
  });

  it('KRİTİK: bilinmeyen sunucu REDDEDİLİYOR', () => {
    /*
     * SSRF. Adres veritabanından geliyor; "platformdan geldi" güvenli demek
     * değil. Paylaşımlı VPS'te iç ağa yapılan bir istek, yanındaki 11 siteyi
     * de ilgilendiriyor.
     */
    const r = adresGuvenliMi('https://evil.example.com/a.jpg');
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.sebep).toContain('bilinmeyen sunucu');
  });

  it('KRİTİK: soneke BENZEYEN alan adı reddediliyor', () => {
    /*
     * ÜÇ AYRI ATLATMA BİÇİMİ, ÜÇÜ DE AYRI BİR KONTROLE BAKIYOR:
     *
     *   · `evil-fbcdn.net`        — önek eklenmiş, tire ile
     *   · `fbcdn.net.evil.com`    — sonek başa alınmış
     *   · `x.fbcdn.net.evil.com`  — İZİNLİ SONEK DİZGENİN İÇİNDE GEÇİYOR
     *
     * Üçüncüsü kritik ve ilk yazımda YOKTU: `endsWith` yerine `includes`
     * kullanmak yalnızca onu geçiriyor. Mutasyon testi tam da bu yüzden var —
     * ilk iki örnek `includes` mutasyonunu yakalamıyordu ve tarama
     * "SSRF korumalı" diyordu.
     */
    expect(adresGuvenliMi('https://evil-fbcdn.net/a.jpg').ok).toBe(false);
    expect(adresGuvenliMi('https://fbcdn.net.evil.com/a.jpg').ok).toBe(false);
    expect(adresGuvenliMi('https://x.fbcdn.net.evil.com/a.jpg').ok).toBe(false);
  });

  it('KRİTİK: IP adresi ve http REDDEDİLİYOR', () => {
    /*
     * İDDİA SEBEBE ÇAPALI, yalnızca "reddedildi"ye değil.
     *
     * Beyaz liste zaten bir IP'yi hiçbir sonekle eşleştirmiyor, yani IP
     * kontrolü ikinci savunma hattı. Sadece `ok === false` demek, o kontrolü
     * silen bir mutasyonu KAÇIRIYORDU (sonek kontrolü yine reddediyor ve
     * test yeşil kalıyor) — hattın kendisi kilitli olmuyordu.
     *
     * 169.254.169.254 rastgele seçilmedi: bulut metadata ucu.
     */
    const metadata = adresGuvenliMi('https://169.254.169.254/latest/meta-data/');
    expect(metadata.ok).toBe(false);
    expect(metadata.ok === false && metadata.sebep).toContain('IP adresi');

    const yerel = adresGuvenliMi('https://127.0.0.1/a.jpg');
    expect(yerel.ok === false && yerel.sebep).toContain('IP adresi');

    const ipv6 = adresGuvenliMi('https://[::1]/a.jpg');
    expect(ipv6.ok === false && ipv6.sebep).toContain('IP adresi');

    const duz = adresGuvenliMi('http://scontent.xx.fbcdn.net/a.jpg');
    expect(duz.ok === false && duz.sebep).toContain('https');
  });

  it('bozuk adres patlatmıyor, sebep dönüyor', () => {
    const r = adresGuvenliMi('şey değil');
    expect(r.ok).toBe(false);
  });
});

describe('kreatif görseli — biçim', () => {
  it('JPEG ve PNG tanınıyor', () => {
    expect(turuAnla(JPEG)).toBe('jpg');
    expect(turuAnla(PNG)).toBe('png');
  });

  it('KRİTİK: WebP tanınmıyor — pdf-lib gömemiyor', () => {
    /*
     * Meta thumbnail'ları sık sık WebP dönüyor. `embedJpg`e vermek
     * anlaşılmaz bir hata fırlatıyor ve o hata PDF üretiminin TAMAMINI
     * düşürüyordu.
     */
    expect(turuAnla(WEBP)).toBeNull();
  });
});

describe('kreatif görseli — indirme', () => {
  it('izinli adresten JPEG geliyor', async () => {
    const getir = vi.fn(async () => yanit(JPEG));
    const r = await gorselIndir(IZINLI, { getir: getir as never });
    expect(r.ok).toBe(true);
    expect(r.ok === true && r.tur).toBe('jpg');
  });

  it('KRİTİK: yönlendirme İZLENMİYOR', async () => {
    /*
     * İzlenirse beyaz liste anlamsızlaşıyor: izinli bir CDN 302 ile başka
     * bir yere gönderebilir ve isteği BİZ yaparız.
     */
    const getir = vi.fn(async () => new Response(null, { status: 302 }));
    const r = await gorselIndir(IZINLI, { getir: getir as never });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.sebep).toContain('yönlendirme');
  });

  it('KRİTİK: `redirect: manual` GERÇEKTEN geçiliyor', () => {
    // Yukarıdaki test yalnızca 302 yanıtını kontrol ediyor; seçenek
    // verilmezse `fetch` yönlendirmeyi kendisi izler ve 302 hiç görünmez.
    const kaynak = readFileSync(join(__dirname, 'kreatif-gorseli.ts'), 'utf8');
    const i = kaynak.indexOf('await getir(');
    expect(i, 'fetch çağrısı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    expect(kaynak.slice(i, kaynak.indexOf('});', i))).toContain("redirect: 'manual'");
  });

  it('KRİTİK: sınırı aşan gövde okunmuyor', async () => {
    const dev = new Uint8Array(GORSEL_SINIRI.maxBayt + 10);
    dev.set(JPEG, 0);
    const getir = vi.fn(async () => yanit(dev));
    const r = await gorselIndir(IZINLI, { getir: getir as never });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.sebep).toContain('çok büyük');
  });

  it('sunucu hatası SEBEPLE dönüyor', async () => {
    const getir = vi.fn(async () => yanit(JPEG, 404));
    const r = await gorselIndir(IZINLI, { getir: getir as never });
    expect(r.ok === false && r.sebep).toContain('404');
  });

  it('KRİTİK: bilinmeyen sunucuya İSTEK HİÇ YAPILMIYOR', async () => {
    // Kontrolün isteği ATTIKTAN sonra yapılması, SSRF'i engellemez.
    const getir = vi.fn(async () => yanit(JPEG));
    await gorselIndir('https://evil.example.com/a.jpg', { getir: getir as never });
    expect(getir).not.toHaveBeenCalled();
  });

  it('aynı adres iki kez indirilmiyor', async () => {
    const getir = vi.fn(async () => yanit(JPEG));
    await gorselleriIndir([IZINLI, IZINLI, null], { getir: getir as never });
    expect(getir).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: eş zamanlılık SINIRLI — hepsi birden açılmıyor', async () => {
    /*
     * Sıralı indirme altı gidiş-dönüş demek ve bu kullanıcının beklediği bir
     * istek yolunda. Sınırsız paralellik ise ters uç: liste büyürse aynı anda
     * onlarca bağlantı açılır ve paylaşımlı sunucuda bu yalnızca bizi
     * ilgilendirmiyor.
     */
    let acik = 0;
    let enYuksek = 0;
    const getir = (async () => {
      acik++;
      enYuksek = Math.max(enYuksek, acik);
      await new Promise((r) => setTimeout(r, 5));
      acik--;
      return yanit(JPEG);
    }) as unknown as typeof fetch;

    const adresler = Array.from({ length: 10 }, (_, i) => `https://a${i}.fbcdn.net/x.jpg`);
    const m = await gorselleriIndir(adresler, { getir });

    expect(m.size).toBe(10);
    expect(enYuksek).toBeLessThanOrEqual(4);
    expect(enYuksek).toBeGreaterThan(1);
  });

  it('bir görselin düşmesi diğerlerini düşürmüyor', async () => {
    const ikinci = 'https://scontent.yy.fbcdn.net/b.png';
    const getir = vi.fn(async (u: string) =>
      u === IZINLI ? yanit(WEBP) : yanit(PNG),
    );
    const m = await gorselleriIndir([IZINLI, ikinci], { getir: getir as never });
    expect(m.get(IZINLI)?.ok).toBe(false);
    expect(m.get(ikinci)?.ok).toBe(true);
  });
});

describe('logo indirme — beyaz liste yok, IP kontrolü var', () => {
  const cozumle = (ip: string) => async () => [ip];

  it('KRİTİK: ajansın kendi alan adı KABUL ediliyor', async () => {
    // Beyaz liste burada uygulanamıyor: logo her müşteride başka bir alan
    // adında ve liste tutmak her yeni müşteride kod değişikliği demek.
    const getir = vi.fn(async () => yanit(PNG));
    const r = await logoIndir('https://profaj.com/logo.png', {
      getir: getir as never,
      cozumle: cozumle('93.184.216.34'),
    });
    expect(r.ok).toBe(true);
  });

  it('KRİTİK: İÇ AĞA çözülen alan adı reddediliyor — istek HİÇ yapılmıyor', async () => {
    /*
     * Korumayı adres yerine ÇÖZÜLEN IP'ye taşımanın sebebi bu: `evil.com`
     * pekâlâ `169.254.169.254`e (bulut metadata ucu) çözülebilir ve adres
     * dizgesine bakan hiçbir kontrol bunu göremez.
     */
    const getir = vi.fn(async () => yanit(PNG));
    for (const ip of ['169.254.169.254', '127.0.0.1', '10.1.2.3', '192.168.1.5', '172.20.0.1', '::1']) {
      const r = await logoIndir('https://evil.example.com/logo.png', {
        getir: getir as never,
        cozumle: cozumle(ip),
      });
      expect(r.ok, `${ip} kabul edildi`).toBe(false);
      expect(r.ok === false && r.sebep).toContain('iç ağ');
    }
    expect(getir, 'iç ağ adresine istek yapılmış').not.toHaveBeenCalled();
  });

  it('KRİTİK: http REDDEDİLİYOR', async () => {
    const r = await logoIndir('http://profaj.com/logo.png', { cozumle: cozumle('93.184.216.34') });
    expect(r.ok === false && r.sebep).toContain('https');
  });

  it('çözülemeyen alan adı SEBEPLE dönüyor', async () => {
    const r = await logoIndir('https://yok.example/logo.png', {
      cozumle: async () => {
        throw new Error('ENOTFOUND');
      },
    });
    expect(r.ok === false && r.sebep).toContain('çözülemedi');
  });

  it('logo da JPEG/PNG dışını almıyor', async () => {
    const getir = vi.fn(async () => yanit(WEBP));
    const r = await logoIndir('https://profaj.com/logo.webp', {
      getir: getir as never,
      cozumle: cozumle('93.184.216.34'),
    });
    expect(r.ok === false && r.sebep).toContain('desteklenmeyen');
  });
});
