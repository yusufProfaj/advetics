import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GtmIstemcisi } from './gtm';
import {
  GtmEnvanterKuyrugu,
  GTM_ENVANTER_HIZI,
  GTM_ENVANTER_TAZELIK_MS,
  envanterNotu,
  envanterOzeti,
  gtmEnvanterIsle,
  type GtmEnvanterSatiri,
} from './gtm-envanter';

/**
 * ═══ TAG MANAGER ENVANTERİ ═══
 *
 * Konteyner seçici yalnız ilk 30 hesabı okuyordu; ajansta 155 hesap vardı ve
 * kullanıcı "hesaplar eksik gözüküyor" dedi. Tag Manager kotası proje başına
 * saniyede 0,25 istek: hepsini istek anında okumak mümkün değil, envanter
 * arka planda taranıyor (gtm-envanter.ts).
 */
const SIMDI = new Date('2026-10-15T10:00:00Z');

const hesaplar = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ accountId: String(1000 + i), name: `Hesap ${i + 1}` }));

const satir = (hesapAdi: string, ek: Partial<GtmEnvanterSatiri> = {}): GtmEnvanterSatiri => ({
  hesapAdi,
  konteynerler: [{ path: `accounts/x/containers/${hesapAdi}`, name: `${hesapAdi} site`, publicId: `GTM-${hesapAdi.length}` }],
  taranma: SIMDI.toISOString(),
  hata: null,
  ...ek,
});

describe('envanter özeti', () => {
  it('KRİTİK: 30’dan sonraki hesapların konteynerleri de listede (155 hesap)', () => {
    const h = hesaplar(155);
    const m = new Map(h.map((x) => [x.accountId, satir(x.name)]));
    const o = envanterOzeti(h, m, SIMDI);
    expect(o.taranan).toBe(155);
    expect(o.konteynerler).toHaveLength(155);
    expect(o.konteynerler.some((c) => c.hesapAdi === 'Hesap 155')).toBe(true);
    expect(o.kuyruga).toEqual([]);
  });

  it('taranmamış hesap kuyruğa giriyor; taranmışlar listede', () => {
    const h = hesaplar(5);
    const m = new Map([[h[0]!.accountId, satir(h[0]!.name)]]);
    const o = envanterOzeti(h, m, SIMDI);
    expect(o.taranan).toBe(1);
    expect(o.kuyruga.map((k) => k.hesapId)).toEqual(h.slice(1).map((x) => x.accountId));
  });

  it('bayat satır (24 saatten eski) listede KALIYOR ama yeniden kuyruğa giriyor', () => {
    const h = hesaplar(1);
    const eski = new Date(SIMDI.getTime() - GTM_ENVANTER_TAZELIK_MS - 1000).toISOString();
    const o = envanterOzeti(h, new Map([[h[0]!.accountId, satir('a', { taranma: eski })]]), SIMDI);
    expect(o.konteynerler).toHaveLength(1);
    expect(o.kuyruga).toHaveLength(1);
  });

  it('KRİTİK: hatalı hesap sayılıyor ve tazelik süresi dolmadan yeniden denenmiyor (kota yemesin)', () => {
    const h = hesaplar(2);
    const m = new Map([
      [h[0]!.accountId, satir('a', { hata: '403 izin yok', konteynerler: [] })],
      [h[1]!.accountId, satir('b')],
    ]);
    const o = envanterOzeti(h, m, SIMDI);
    expect(o.hatali).toBe(1);
    expect(o.kuyruga).toEqual([]);
  });

  it('erişimi kalkmış hesabın eski satırı listeye girmiyor', () => {
    const h = hesaplar(1);
    const m = new Map([
      [h[0]!.accountId, satir('a')],
      ['eski-hesap', satir('eski')],
    ]);
    expect(envanterOzeti(h, m, SIMDI).konteynerler.map((c) => c.hesapAdi)).toEqual(['Hesap 1']);
  });
});

describe('envanter notu', () => {
  it('KRİTİK: eksikse kaçının tarandığını ve kalan süreyi söylüyor', () => {
    const n = envanterNotu({ toplam: 155, taranan: 40, hatali: 0 })!;
    expect(n).toContain('40 / 155');
    // 115 hesap × 5 sn = 575 sn ≈ 10 dk.
    expect(n).toContain('yaklaşık 10 dk');
  });

  it('tam ve hatasızsa not yok (her açılışta duran uyarı okunmaz hâle gelir)', () => {
    expect(envanterNotu({ toplam: 155, taranan: 155, hatali: 0 })).toBeNull();
  });

  it('hatalı hesapları ayrıca söylüyor', () => {
    expect(envanterNotu({ toplam: 3, taranan: 3, hatali: 2 })).toContain('2 hesabın');
  });

  it('hiç hesap yoksa ne yapılacağını söylüyor', () => {
    expect(envanterNotu({ toplam: 0, taranan: 0, hatali: 0 })).toContain('tagmanager.google.com');
  });
});

describe('işçinin işi', () => {
  const is = { connectionId: 'c1', hesapId: '1000', hesapAdi: 'Hesap 1' };

  it('konteynerleri yazıyor', async () => {
    const yaz = vi.fn();
    const r = await gtmEnvanterIsle(
      {
        tokenAl: async () => 'tok',
        konteynerler: async () => [{ path: 'accounts/1000/containers/1', containerId: '1', name: 'site.com', publicId: 'GTM-AAA' }],
        yaz,
        simdi: () => SIMDI,
      },
      is,
    );
    expect(r).toBe('tamam');
    expect(yaz.mock.calls[0]![1]).toMatchObject({ hata: null, konteynerler: [{ publicId: 'GTM-AAA' }] });
  });

  it('KRİTİK: hata FIRLAMIYOR, satıra yazılıyor (yoksa hesap sonsuza kadar "taranmadı" kalırdı)', async () => {
    const yaz = vi.fn();
    const r = await gtmEnvanterIsle(
      {
        tokenAl: async () => 'tok',
        konteynerler: async () => {
          throw new Error('Quota exceeded');
        },
        yaz,
        simdi: () => SIMDI,
      },
      is,
    );
    expect(r).toBe('hata');
    expect(yaz.mock.calls[0]![1]).toMatchObject({ hata: 'Quota exceeded', konteynerler: [] });
  });
});

describe('Tag Manager istemcisi', () => {
  afterEach(() => vi.unstubAllGlobals());

  const yanit = (status: number, govde: unknown) =>
    new Response(JSON.stringify(govde), { status, headers: { 'content-type': 'application/json' } });

  it('KRİTİK: hesap listesi sayfalar SONUNA KADAR okunuyor', async () => {
    const adresler: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      adresler.push(url);
      return url.includes('pageToken=')
        ? yanit(200, { account: [{ accountId: '2', name: 'B' }] })
        : yanit(200, { account: [{ accountId: '1', name: 'A' }], nextPageToken: 'p2' });
    });
    expect((await new GtmIstemcisi('t').hesaplar()).map((h) => h.accountId)).toEqual(['1', '2']);
    expect(adresler).toHaveLength(2);
  });

  it('KRİTİK: kimlikle arama tek çağrıda; bulunamadı / erişim yok = null', async () => {
    vi.stubGlobal('fetch', async (url: string) =>
      url.includes('GTM-VAR')
        ? yanit(200, { path: 'accounts/9/containers/8', accountId: '9', containerId: '8', name: 'x', publicId: 'GTM-VAR' })
        : url.includes('GTM-YOK')
          ? yanit(404, { error: { code: 404, message: 'Not found' } })
          : yanit(403, { error: { code: 403, message: 'The caller does not have permission' } }),
    );
    const gtm = new GtmIstemcisi('t');
    expect(await gtm.ara('GTM-VAR')).toMatchObject({ accountId: '9', path: 'accounts/9/containers/8' });
    expect(await gtm.ara('GTM-YOK')).toBeNull();
    expect(await gtm.ara('GTM-IZINSIZ')).toBeNull();
  });

  it('KRİTİK: kota 403’ü "yok" sayılmıyor, FIRLIYOR (yoksa sitede kod varken yeni konteyner açılabilirdi)', async () => {
    vi.stubGlobal('fetch', async () =>
      yanit(403, { error: { code: 403, message: 'Quota exceeded for quota metric', status: 'RESOURCE_EXHAUSTED' } }),
    );
    await expect(new GtmIstemcisi('t').ara('GTM-X')).rejects.toThrow(/Quota/);
  });
});

describe('kaynak bekçileri', () => {
  const yorumsuz = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const SERVIS = yorumsuz(readFileSync(join(__dirname, 'kurulum.service.ts'), 'utf8'));
  const ISCI = yorumsuz(readFileSync(join(__dirname, '..', '..', 'worker.ts'), 'utf8'));

  it('KRİTİK: servis Tag Manager hesaplarını 30 ile KESMİYOR', () => {
    expect(SERVIS).toContain('envanterOzeti(');
    expect(SERVIS).not.toMatch(/hesaplar\.slice\(0,\s*30\)/);
  });

  it('KRİTİK: işçi envanter kuyruğunu Tag Manager kotasının ALTINDA tüketiyor', () => {
    const bas = ISCI.indexOf('GTM_ENVANTER_KUYRUGU,');
    expect(bas, 'envanter işçisi bulunamadı').toBeGreaterThan(-1);
    expect(ISCI.slice(bas, ISCI.indexOf('gtmWorker.on(', bas))).toContain('limiter: { ...GTM_ENVANTER_HIZI }');
    // 0,25 istek/sn proje sınırı; kurulum çağrılarına pay kalsın.
    expect(GTM_ENVANTER_HIZI.max / (GTM_ENVANTER_HIZI.duration / 1000)).toBeLessThan(0.25);
  });
});

describe('bir kez tara, hep göster (2026-10-15)', () => {
  afterEach(() => vi.restoreAllMocks());

  /** Redis ve kuyruk bellek içi; sınıfın kendi bağlantı kurucusu atlanıyor. */
  function kuyruk() {
    const hash = new Map<string, string>();
    const addBulk = vi.fn();
    const k = Object.create(GtmEnvanterKuyrugu.prototype) as GtmEnvanterKuyrugu;
    Object.assign(k, {
      onEk: 'advetics',
      baglanti: {
        hget: async (_a: string, f: string) => hash.get(f) ?? null,
        hset: async (_a: string, f: string, v: string) => void hash.set(f, v),
        hgetall: async () => Object.fromEntries(hash),
      },
      kuyruk: { addBulk },
    });
    return { k, hash, addBulk };
  }

  it('KRİTİK: izin anında BÜTÜN hesaplar kuyruğa giriyor', async () => {
    const { k, addBulk } = kuyruk();
    vi.spyOn(GtmIstemcisi.prototype, 'hesaplar').mockResolvedValue(hesaplar(155));
    const n = await k.izinleBaslat('c1', 'tok', ['https://www.googleapis.com/auth/tagmanager.edit.containers'], SIMDI);
    expect(n).toBe(155);
    expect(addBulk.mock.calls[0]![0]).toHaveLength(155);
  });

  it('Tag Manager izni yoksa hiçbir çağrı yapmıyor', async () => {
    const { k, addBulk } = kuyruk();
    const h = vi.spyOn(GtmIstemcisi.prototype, 'hesaplar');
    expect(await k.izinleBaslat('c1', 'tok', ['https://www.googleapis.com/auth/adwords'], SIMDI)).toBe(0);
    expect(h).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });

  it('KRİTİK: açılan konteyner hemen listede; satırı yoksa BAYAT açılıyor (hesabın öbür konteynerleri düşmesin)', async () => {
    const { k } = kuyruk();
    await k.konteynerEkle('c1', '1000', '', { path: 'accounts/1000/containers/5', name: 'Yeni', publicId: 'GTM-YENI' });
    const m = (await k.oku('c1'))!;
    const o = envanterOzeti(hesaplar(1), m, SIMDI);
    expect(o.konteynerler.map((c) => c.publicId)).toEqual(['GTM-YENI']);
    // Bayat: hesap yine taranacak.
    expect(o.kuyruga).toHaveLength(1);
  });

  it('var olan satıra ekliyor, aynı konteyneri iki kez yazmıyor', async () => {
    const { k, hash } = kuyruk();
    hash.set('1000', JSON.stringify(satir('a')));
    const yeni = { path: 'accounts/1000/containers/5', name: 'Yeni', publicId: 'GTM-YENI' };
    await k.konteynerEkle('c1', '1000', '', yeni);
    await k.konteynerEkle('c1', '1000', '', yeni);
    const s = JSON.parse(hash.get('1000')!) as GtmEnvanterSatiri;
    expect(s.konteynerler.map((c) => c.publicId)).toEqual(['GTM-1', 'GTM-YENI']);
    expect(s.taranma).toBe(SIMDI.toISOString());
  });

  it('KRİTİK: envanter anahtarının ÖMRÜ YOK (bir hafta açılmayan seçici baştan taratmasın)', () => {
    const kod = readFileSync(join(__dirname, 'gtm-envanter.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(kod).toContain('envanterAnahtari(onEk, is.connectionId)');
    expect(kod).not.toMatch(/\.expire\(|EX'|'PX'/);
  });
});
