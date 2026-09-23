import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { metneCevir, ozelAdres, siteOku } from './site-oku';

/**
 * ═══ SUNUCUDAN DIŞARI GİDEN İSTEK ═══
 *
 * Bilgi Bankası taslağı işletmenin KENDİ sitesini okuyor ve o adres
 * KULLANICIDAN geliyor. Paylaşımlı bir VPS'te bu, iç ağa ya da bulut
 * metadata ucuna (`169.254.169.254`) yapılmış bir istek olabilir ve o uç
 * makinenin kimlik bilgilerini veriyor.
 *
 * KORUMA ADRESTE DEĞİL ÇÖZÜLEN IP'DE: `evil.com` pekâlâ `169.254.169.254`e
 * çözülebilir ve adres DİZGESİNE bakan hiçbir kontrol bunu göremez. Bu
 * paketin çoğu tam da o çözümlemeyi sınıyor.
 */
const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup }));

const fetchMock = vi.fn();

beforeEach(() => {
  lookup.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Varsayılan: genel bir IP ve düzgün bir HTML.
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  fetchMock.mockResolvedValue(htmlYanit('<h1>Urla Deryası</h1><p>' + 'x'.repeat(200) + '</p>'));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function htmlYanit(html: string, opts: { status?: number; tur?: string } = {}): Response {
  return new Response(html, {
    status: opts.status ?? 200,
    headers: { 'content-type': opts.tur ?? 'text/html; charset=utf-8' },
  });
}

describe('düzenek', () => {
  it('normal bir site okunuyor', async () => {
    const r = await siteOku('https://urladeryasi.com');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.metin).toContain('Urla Deryası');
  });
});

describe('ADRES DOĞRULAMA', () => {
  it('KRİTİK: http REDDEDİLİYOR', async () => {
    /*
     * Araya giren sayfayı değiştirebiliyor ve o sayfanın metni doğrudan
     * modele gidiyor — yani reklam metnini besleyen kayda.
     */
    const r = await siteOku('http://ornek.com');
    expect(r).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KRİTİK: IP LİTERALİ REDDEDİLİYOR', async () => {
    // Bir işletme sitesi alan adıyla anılır; doğrudan IP yazmak iç ağa
    // erişme girişiminin en basit hâli.
    const r = await siteOku('https://169.254.169.254/latest/meta-data/');
    expect(r).toMatchObject({ ok: false });
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('bozuk URL reddediliyor', async () => {
    expect(await siteOku('urladeryasi')).toMatchObject({ ok: false });
  });
});

describe('DNS ÇÖZÜMLEMESİ', () => {
  it('KRİTİK: İÇ AĞA ÇÖZÜLEN ALAN ADI REDDEDİLİYOR', async () => {
    /*
     * ASIL SALDIRI BU: adres kusursuz görünüyor, DNS iç bir adrese
     * çözülüyor. Dizgeye bakan hiçbir kontrol bunu göremez.
     */
    lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }]);
    const r = await siteOku('https://gorunuste-normal.com');
    expect(r).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KRİTİK: BİR ADRESİ İÇ AĞDA OLAN ALAN ADI DA REDDEDİLİYOR', async () => {
    /*
     * Alan adı hem genel hem iç bir adrese çözülüyorsa hangisine
     * bağlanacağımızı SEÇEMİYORUZ: `fetch` kendi seçiyor. Tek bir özel adres
     * yetiyor.
     */
    lookup.mockResolvedValue([
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.5', family: 4 },
    ]);
    const r = await siteOku('https://ornek.com');
    expect(r).toMatchObject({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('çözülemeyen alan adı SEBEBİYLE dönüyor', async () => {
    lookup.mockRejectedValue(new Error('ENOTFOUND'));
    const r = await siteOku('https://olmayan-alan.com');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.sebep).toContain('çözülemedi');
  });
});

describe('YÖNLENDİRME', () => {
  it('KRİTİK: YÖNLENDİRME İZLENMİYOR', async () => {
    /*
     * İzlenirse ilk adresin doğrulanmış olması hiçbir şey ifade etmiyor:
     * hedef iç ağa gidebilir ve o istek artık kontrolümüzde değil.
     */
    fetchMock.mockResolvedValue(new Response('', { status: 302 }));
    const r = await siteOku('https://ornek.com');
    expect(r).toMatchObject({ ok: false });

    const opts = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(opts.redirect).toBe('manual');
  });
});

describe('İÇERİK', () => {
  it('KRİTİK: HTML OLMAYAN YANIT REDDEDİLİYOR', async () => {
    // Bir PDF ya da görselin baytlarını modele vermek, token harcayıp
    // hiçbir şey anlatmamak.
    fetchMock.mockResolvedValue(htmlYanit('%PDF-1.4', { tur: 'application/pdf' }));
    expect(await siteOku('https://ornek.com')).toMatchObject({ ok: false });
  });

  it('KRİTİK: ÇOK KISA METİN BAŞARI SAYILMIYOR', async () => {
    /*
     * Tek satırlık bir "JavaScript gerekiyor" sayfası modele hiçbir şey
     * anlatmıyor ve model onun üstüne UYDURMAYA başlıyor — bu ekranın
     * taşıdığı tek değer doğru bilgi.
     */
    fetchMock.mockResolvedValue(htmlYanit('<body><noscript>JS gerekli</noscript></body>'));
    const r = await siteOku('https://ornek.com');
    expect(r).toMatchObject({ ok: false });
    if (!r.ok) expect(r.sebep).toContain('JavaScript');
  });

  it('hata durumu sebebini söylüyor', async () => {
    fetchMock.mockResolvedValue(htmlYanit('', { status: 503 }));
    const r = await siteOku('https://ornek.com');
    if (!r.ok) expect(r.sebep).toContain('503');
  });
});

describe('metneCevir', () => {
  it('KRİTİK: script ve style GÖVDESİYLE atılıyor', () => {
    // İçlerindeki kod modele gürültü olarak gidiyor ve token harcıyor.
    const html = '<p>merhaba</p><script>var a=1;</script><style>.a{color:red}</style>';
    const metin = metneCevir(html);
    expect(metin).toBe('merhaba');
  });

  it('etiketler ve varlıklar çözülüyor', () => {
    expect(metneCevir('<p>Ev &amp; Bahçe</p>')).toBe('Ev & Bahçe');
  });
});

describe('ozelAdres', () => {
  it('KRİTİK: BULUT METADATA UCU özel sayılıyor', () => {
    // AWS/GCP/Azure'da makinenin kimlik bilgilerini veriyor: bir SSRF'in en
    // değerli hedefi.
    expect(ozelAdres('169.254.169.254')).toBe(true);
  });

  it('KRİTİK: bilinen özel aralıklar', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '100.64.0.1', '0.0.0.0']) {
      expect(ozelAdres(ip), ip).toBe(true);
    }
  });

  it('KRİTİK: IPv6 loopback ve yerel aralıklar', () => {
    for (const ip of ['::1', 'fc00::1', 'fd12::1', 'fe80::1']) {
      expect(ozelAdres(ip), ip).toBe(true);
    }
  });

  it('KRİTİK: IPv4 EŞLEMELİ IPv6 de çözülüyor', () => {
    // `::ffff:10.0.0.1` IPv6 gibi görünüyor ama iç bir IPv4 adresi.
    expect(ozelAdres('::ffff:10.0.0.1')).toBe(true);
  });

  it('genel adresler geçiyor', () => {
    for (const ip of ['93.184.216.34', '1.1.1.1', '2606:4700::1111']) {
      expect(ozelAdres(ip), ip).toBe(false);
    }
  });

  it('172.32 ÖZEL DEĞİL — aralık 172.16-31', () => {
    // Sınırı yanlış yazmak, geçerli bir siteyi reddetmek ya da iç bir
    // adresi geçirmek demek; iki yönü de sınanıyor.
    expect(ozelAdres('172.32.0.1')).toBe(false);
    expect(ozelAdres('172.31.255.255')).toBe(true);
  });
});
