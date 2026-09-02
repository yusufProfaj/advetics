import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  adresGuvenliMi,
  gorselIndir,
  gorselleriIndir,
  GORSEL_SINIRI,
  IZINLI_SONEKLER,
  turuAnla,
} from './kreatif-gorseli';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function yanit(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, { status });
}

const IZINLI = 'https://scontent.xx.fbcdn.net/v/t45/gorsel.jpg';

/*
 * BEYAZ LİSTENİN HER GİRDİSİ İÇİN GERÇEK BİR ÖRNEK ADRES.
 *
 * Liste ELLE yazılıyor, `IZINLI_SONEKLER` üzerinde döngü kurulmuyor: döngü
 * kuran bir test bir soneki SİLDİĞİNDE de geçer (döngü kısalır, iddia tutmaya
 * devam eder). Nitekim öyleydi — `.gstatic.com` ve `.ggpht.com` silinse
 * hiçbir test düşmüyordu, yani üç girdi kilitsizdi.
 *
 * Aşağıdaki "liste birebir aynı" iddiası bunun ikinci yarısı: yeni bir sonek
 * eklenip buraya örnek yazılmazsa test düşüyor. Beyaz liste bir SSRF
 * savunması ve her girdisi bilinçli bir karar olmalı.
 */
const ORNEK_ADRESLER: Record<(typeof IZINLI_SONEKLER)[number], string> = {
  '.fbcdn.net': 'https://scontent.xx.fbcdn.net/v/t45/a.jpg',
  '.cdninstagram.com': 'https://scontent-lhr8-1.cdninstagram.com/v/t51/b.jpg',
  '.googleusercontent.com': 'https://lh3.googleusercontent.com/x',
  '.gstatic.com': 'https://encrypted-tbn0.gstatic.com/images?q=x',
  '.ggpht.com': 'https://yt3.ggpht.com/a/kanal.jpg',
  // Google Ads görsel varlığının canlıda beklenen biçimi — görüntülü
  // reklamın PDF'e girebilmesi bu girdiye bağlı.
  'tpc.googlesyndication.com': 'https://tpc.googlesyndication.com/simgad/1234567890',
};

describe('kreatif görseli — adres kontrolü', () => {
  it('KRİTİK: izinli CDN kabul ediliyor', () => {
    expect(adresGuvenliMi(IZINLI).ok).toBe(true);
    expect(adresGuvenliMi('https://lh3.googleusercontent.com/x').ok).toBe(true);
  });

  it('KRİTİK: beyaz listenin HER girdisi pozitif sınanıyor', () => {
    for (const sonek of IZINLI_SONEKLER) {
      const ornek = ORNEK_ADRESLER[sonek];
      expect(ornek, `${sonek} için örnek adres yok — girdiyi kilitle`).toBeDefined();
      const r = adresGuvenliMi(ornek);
      expect(r.ok, `${sonek} reddedildi: ${r.ok === false ? r.sebep : ''}`).toBe(true);
    }
  });

  it('KRİTİK: örnek listesi beyaz listeyle BİREBİR aynı', () => {
    // Sonek eklenip örneği yazılmazsa yukarıdaki döngü onu hiç görmez.
    expect(Object.keys(ORNEK_ADRESLER).sort()).toEqual([...IZINLI_SONEKLER].sort());
  });

  it('KRİTİK: Google Ads görsel varlığı yalnızca `tpc` alt alanından', () => {
    /*
     * Sonek TAM ANA MAKİNE (`tpc.googlesyndication.com`), `.googlesyndication.
     * com` DEĞİL: o sonek `pagead2`/`googleads` gibi reklam sunucusu alt
     * alanlarını da açardı ve görsel oralardan gelmiyor.
     */
    expect(adresGuvenliMi('https://pagead2.googlesyndication.com/x.jpg').ok).toBe(false);
    expect(adresGuvenliMi('https://tpc.googlesyndication.com.evil.com/x.jpg').ok).toBe(false);
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
