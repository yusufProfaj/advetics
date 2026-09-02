import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { MetaProvider } from './meta.provider';

/**
 * ═══ META: KREATİF GÖRSELİNİN TAZE ADRESİ ═══
 *
 * Saklanan Meta CDN adresi imzalı ve süresi doluyor — rapor üretilirken 403
 * dönüyordu. Bu metot adresi rapor anında yeniliyor.
 *
 * EN KRİTİK DAVRANIŞ YARILAMA. `?ids=` çoklu sorgusunda TEK BİR kötü kimlik
 * İSTEĞİN TAMAMINI düşürüyor: silinmiş bir kreatif, kalan 23 reklamın da
 * görselini götürürdü. Liste ikiye bölünüp tekrar deneniyor ve tek kimliğe
 * inildiğinde hata O kimliğe yazılıyor.
 *
 * `fetch` global olarak yamanıyor: `platformFetch` içeride onu çağırıyor ve
 * sağlayıcıya dışarıdan bir getirici verilemiyor.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

function provider(): MetaProvider {
  const config = {
    platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v21.0' } },
  };
  return new MetaProvider(config as never);
}

const ctx = { accessToken: 'T', accountExternalId: 'act_1' };

let orijinalFetch: typeof fetch;

beforeEach(() => {
  orijinalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = orijinalFetch;
  vi.restoreAllMocks();
});

describe('fetchCreativeImageUrls', () => {
  it('TEK istekte hepsini alıyor — kreatif başına çağrı yapmıyor', async () => {
    // PARAMETRE YAZILI: parametresiz bir `vi.fn`de `mock.calls` boş
    // demet tipi oluyor ve aşağıdaki `calls[0][0]` DERLENMİYOR (TS2493).
    // Vitest tip denetimi yapmadığı için hata yalnızca `pnpm typecheck`
    // ile görünüyordu.
    const f = vi.fn(async (_url: string) =>
      YANIT({
        '1': { id: '1', image_url: 'https://scontent.xx.fbcdn.net/a.jpg' },
        '2': { id: '2', image_url: 'https://scontent.xx.fbcdn.net/b.jpg' },
        '3': { id: '3', image_url: 'https://scontent.xx.fbcdn.net/c.jpg' },
      }),
    );
    globalThis.fetch = f as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1', '2', '3']);

    expect(f).toHaveBeenCalledTimes(1);
    expect(out.get('2')).toEqual({ url: 'https://scontent.xx.fbcdn.net/b.jpg' });
    // Boyut AÇIKÇA isteniyor: varsayılan ~64px ve PDF'te bulanık çıkıyordu.
    const adres = String(f.mock.calls[0]![0]);
    expect(adres).toContain('thumbnail_width=1080');
    expect(adres).toContain('ids=1%2C2%2C3');
  });

  it('KRİTİK: `image_url` YOKSA `thumbnail_url`e düşülüyor', async () => {
    /*
     * Gönderi ve video boost'larında Meta `image_url` DÖNDÜRMÜYOR; elimizdeki
     * tek görsel thumbnail oluyor. Ekran görüntüsündeki "ÇİFTÇİ GRUP BOOST"
     * kartlarının hepsi tam olarak bu tür.
     */
    // TEK kimlik -> DÜĞÜM yolu, yani yanıt kreatifin KENDİSİ (kimliğe göre
    // anahtarlanmış harita değil). İki biçimi karıştırmak, tekli yolda her
    // seferinde "döndürmedi" demek olurdu.
    globalThis.fetch = vi.fn(async () =>
      YANIT({ id: '1', thumbnail_url: 'https://scontent.xx.fbcdn.net/t.jpg' }),
    ) as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1']);
    expect(out.get('1')).toEqual({ url: 'https://scontent.xx.fbcdn.net/t.jpg' });
  });

  it('ikisi de varsa `image_url` KAZANIYOR — thumbnail daha küçük', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({
        id: '1',
        image_url: 'https://scontent.xx.fbcdn.net/buyuk.jpg',
        thumbnail_url: 'https://scontent.xx.fbcdn.net/kucuk.jpg',
      }),
    ) as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1']);
    expect(out.get('1')).toEqual({ url: 'https://scontent.xx.fbcdn.net/buyuk.jpg' });
  });

  it('KRİTİK: TEK bozuk kimlik diğerlerini GÖTÜRMÜYOR — liste yarılanıyor', async () => {
    /*
     * Bu iddia olmadan silinmiş tek bir kreatif, raporun BÜTÜN görsellerini
     * götürürdü ve belirti "hiçbir görsel gelmiyor" olurdu — yani düzeltmeye
     * çalıştığımız hatanın aynısı, başka bir sebeple.
     */
    const bozuk = '2';
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      const u = String(url);
      // Bozuk kimliği İÇEREN her istek düşüyor — çoklu ya da tekli fark etmez.
      const idler = decodeURIComponent(u).match(/ids=([^&]+)/)?.[1]?.split(',') ?? [
        u.split('?')[0]!.split('/').pop()!,
      ];
      if (idler.includes(bozuk)) return YANIT({ error: { message: 'yok' } }, 400);
      return YANIT(
        idler.length === 1
          ? { id: idler[0], image_url: `https://scontent.xx.fbcdn.net/${idler[0]}.jpg` }
          : Object.fromEntries(
              idler.map((i) => [i, { id: i, image_url: `https://scontent.xx.fbcdn.net/${i}.jpg` }]),
            ),
      );
    }) as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1', '2', '3', '4']);

    expect(out.get('1')).toEqual({ url: 'https://scontent.xx.fbcdn.net/1.jpg' });
    expect(out.get('3')).toEqual({ url: 'https://scontent.xx.fbcdn.net/3.jpg' });
    expect(out.get('4')).toEqual({ url: 'https://scontent.xx.fbcdn.net/4.jpg' });
    // Suçlu kimliğe SEBEP yazılıyor — sessizce eksik kalmıyor.
    expect(out.get('2')).toBeDefined();
    expect(out.get('2')).not.toHaveProperty('url');
  });

  it('KRİTİK: tek kimliğe inilince DÜĞÜM yoluna geçiliyor', async () => {
    /*
     * `?ids=` bir kolaylık; düğüm yolu (`/{creative-id}`) Graph API'nin en
     * temel ve en kesin biçimi. Yarılama en sonunda hep bilinen yola düşüyor,
     * böylece "hata kreatifte miydi istek biçiminde mi" sorusu ortada
     * kalmıyor.
     */
    const adresler: string[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL) => {
      adresler.push(String(url));
      if (adresler.length === 1) return YANIT({ error: { message: 'patla' } }, 400);
      const id = String(url).split('?')[0]!.split('/').pop()!;
      return YANIT({ id, image_url: `https://scontent.xx.fbcdn.net/${id}.jpg` });
    }) as unknown as typeof fetch;

    await provider().fetchCreativeImageUrls(ctx, ['7', '8']);

    expect(adresler[0]).toContain('ids=');
    // Sonraki iki istek düğüm yolu: kimlik YOLDA, sorgu dizesinde değil.
    expect(adresler[1]).toContain('/v21.0/7?');
    expect(adresler[1]).not.toContain('ids=');
    expect(adresler[2]).toContain('/v21.0/8?');
  });

  it('görseli olmayan kreatif SEBEPLE dönüyor — sessizce düşmüyor', async () => {
    globalThis.fetch = vi.fn(async () => YANIT({ id: '1' })) as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1']);
    expect(out.get('1')).toEqual({ hata: 'kreatifin görseli yok' });
  });

  it('KRİTİK: süre bütçesi dolunca platforma HİÇ çıkılmıyor', async () => {
    /*
     * Yarılama en kötü hâlde 2N-1 istek üretiyor ve bu adım SENKRON bir PDF
     * isteğinin içinde koşuyor. Durma koşulu olmasa kullanıcı dakikalarca
     * bekler, sonunda yine görselsiz bir rapor alırdı.
     */
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1', '2'], {
      butceBitisi: Date.now() - 1,
    });

    expect(f).not.toHaveBeenCalled();
    expect(out.get('1')).toEqual({ hata: 'tazeleme süresi doldu' });
    expect(out.get('2')).toEqual({ hata: 'tazeleme süresi doldu' });
  });

  it('KRİTİK: HER istek düşse bile özyineleme DURUYOR — sonsuz döngü yok', async () => {
    /*
     * Bu iddia bir mutasyon testinde SÜRECİ DÜŞÜRDÜ (bellek taşması) ve o
     * yüzden burada: yarılamanın durma koşulu listenin UZUNLUĞUNA bağlı
     * olmalı, URL biçimini seçen `tekli` değişkenine değil.
     * `Math.floor(1 / 2) = 0` olduğu için `slice(0)` aynı tek elemanlı
     * listeyi veriyor; durma koşulu kayarsa fonksiyon kendini sonsuza
     * çağırıyor ve belirtisi testte değil ÜRETİMDE görünürdü.
     *
     * İSTEK SAYISI DA SINIRLI: N eleman için en fazla 2N-1. Sınırsız olsaydı
     * "durdu ama kotayı bitirdi" başka bir arıza olurdu.
     */
    const f = vi.fn(async () => YANIT({ error: { message: 'hep düşüyor' } }, 500));
    globalThis.fetch = f as unknown as typeof fetch;

    const idler = ['1', '2', '3', '4'];
    const out = await provider().fetchCreativeImageUrls(ctx, idler);

    expect(out.size).toBe(idler.length);
    for (const id of idler) expect(out.get(id)).not.toHaveProperty('url');
    expect(f.mock.calls.length).toBeLessThanOrEqual(2 * idler.length - 1);
  });

  it('boş liste çağrı yapmıyor', async () => {
    const f = vi.fn();
    globalThis.fetch = f as unknown as typeof fetch;
    const out = await provider().fetchCreativeImageUrls(ctx, []);
    expect(f).not.toHaveBeenCalled();
    expect(out.size).toBe(0);
  });

  it('aynı kreatif iki reklamda ise BİR KEZ sorulyor', async () => {
    /*
     * Tekilleştirme ÖNCE: üç kez geçen kimlik bire iniyor ve bir kimlik kalan
     * istek DÜĞÜM yoluna gidiyor. Aynı kreatifi iki kez indirmenin faydası
     * yok, kotası ise var.
     */
    // PARAMETRE YAZILI: parametresiz bir `vi.fn`de `mock.calls` boş
    // demet tipi oluyor ve aşağıdaki `calls[0][0]` DERLENMİYOR (TS2493).
    // Vitest tip denetimi yapmadığı için hata yalnızca `pnpm typecheck`
    // ile görünüyordu.
    const f = vi.fn(async (_url: string) =>
      YANIT({ id: '1', image_url: 'https://x.fbcdn.net/a.jpg' }),
    );
    globalThis.fetch = f as unknown as typeof fetch;

    const out = await provider().fetchCreativeImageUrls(ctx, ['1', '1', '1']);

    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]![0])).toContain('/v21.0/1?');
    expect(out.get('1')).toEqual({ url: 'https://x.fbcdn.net/a.jpg' });
  });
});
