import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { middleware } from './middleware';

/**
 * Middleware testleri.
 *
 * NEDEN BU TEST VAR: tanıtım sayfası eklenirken kök `/` herkese açık hâle
 * getirildi. Bu, panelin oturum kontrolünü taşıyan tek satıra dokunmak
 * demekti ve yanlış yapılırsa sonuç SESSİZ olurdu: sayfalar açılmaya devam
 * eder, hata çıkmaz, sadece giriş yapmamış herkes paneli görür.
 *
 * Somut tuzak: PUBLIC_PATHS eşleşmesi bugün `pathname.startsWith(`${p}/`)`.
 * Listeye `'/'` eklenseydi ve eşleşme bir gün `startsWith(p)` olarak
 * sadeleştirilseydi HER yol herkese açık olurdu. Aşağıdaki "panel korunuyor"
 * testleri tam olarak bunu yakalar.
 *
 * Testler kök domain olarak `localhost:3000` kullanıyor: ROOT_DOMAIN'in
 * varsayılanı bu ve başka bir host verildiğinde middleware isteği white-label
 * müşteri alan adı sayıp rapor sayfasına yönlendiriyor.
 */
const ROOT = 'localhost:3000';

function request(path: string, opts: { cookie?: string; host?: string } = {}) {
  const host = opts.host ?? ROOT;
  const headers = new Headers({ host });
  if (opts.cookie) headers.set('cookie', opts.cookie);
  return new NextRequest(new URL(`http://${host}${path}`), { headers });
}

/** Yönlendirme yoksa `null`, varsa hedefin yolu. */
function redirectPath(res: { status: number; headers: Headers }): string | null {
  const location = res.headers.get('location');
  if (!location) return null;
  return new URL(location).pathname;
}

describe('middleware — oturumsuz erişim', () => {
  it('kök / tanıtım sayfasını oturumsuz servis eder', () => {
    const res = middleware(request('/'));
    expect(redirectPath(res)).toBeNull();
    expect(res.status).toBe(200);
  });

  it.each([
    '/gizlilik',
    '/kosullar',
    '/veri-silme',
    '/cerez-politikasi',
    '/login',
    '/r/abc123',
  ])('%s oturumsuz açılır', (path) => {
    expect(redirectPath(middleware(request(path)))).toBeNull();
  });
});

describe('middleware — panel korunuyor', () => {
  /**
   * Kök herkese açıldıktan SONRA bu listenin hâlâ /login'e gitmesi şart.
   * Biri düşerse tanıtım sayfası değişikliği paneli açmış demektir.
   */
  it.each([
    '/dashboard',
    '/ads-explorer',
    '/kurallar',
    '/butce',
    '/raporlar',
    '/reklam-olustur',
    '/toplu-olustur',
    '/potansiyel-musteriler',
    '/auto-boost',
    '/ayarlar/baglantilar',
    '/kutuphane/gorseller',
    '/kutuphane/formlar',
  ])('%s oturumsuz erişimde /login e yönlenir', (path) => {
    expect(redirectPath(middleware(request(path)))).toBe('/login');
  });

  it('yönlendirmede next parametresi ile geri dönüş yolu taşınıyor', () => {
    const res = middleware(request('/kurallar'));
    const url = new URL(res.headers.get('location')!);
    expect(url.searchParams.get('next')).toBe('/kurallar');
  });

  it('kökten gelen yönlendirme olmadığı için next parametresi de üretilmiyor', () => {
    // Kök artık yönlenmiyor; yönlenseydi `next=/` gibi anlamsız bir dönüş
    // yolu üretirdi.
    expect(middleware(request('/')).headers.get('location')).toBeNull();
  });
});

describe('middleware — oturumlu davranış', () => {
  const SESSION = 'adv_at=deneme-token';

  it('oturumlu kullanıcı /login yerine panele gönderiliyor', () => {
    const res = middleware(request('/login', { cookie: SESSION }));
    expect(redirectPath(res)).toBe('/dashboard');
  });

  it('tanıtım sayfası oturumlu kullanıcıya da açılıyor', () => {
    // "Giriş Yap" düğmesi /login e gidiyor ve oturumlu kullanıcı oradan
    // /dashboard a düşüyor; kökün kendisi kimseyi zorla yönlendirmiyor.
    expect(redirectPath(middleware(request('/', { cookie: SESSION })))).toBeNull();
  });

  it('oturumlu kullanıcı panele girebiliyor', () => {
    expect(redirectPath(middleware(request('/dashboard', { cookie: SESSION })))).toBeNull();
  });
});

describe('middleware — white-label workspace alan adı', () => {
  const HOST = 'musteri-alan-adi.com';

  it('workspace alan adında kök tanıtım sayfası SERVİS EDİLMİYOR', () => {
    // Ajansın tanıtım sayfası müşterinin alan adından çıkmamalı: müşteri o
    // alan adını kendi raporu için bağladı, ajansın satış sayfası için değil.
    expect(redirectPath(middleware(request('/', { host: HOST })))).toBe('/r/bulunamadi');
  });

  it('workspace alan adı yalnızca rapor sayfalarını servis ediyor', () => {
    expect(redirectPath(middleware(request('/r/abc123', { host: HOST })))).toBeNull();
    expect(redirectPath(middleware(request('/dashboard', { host: HOST })))).toBe(
      '/r/bulunamadi',
    );
  });
});

describe('middleware — paylaşılabilir dil bağlantısı (?dil=)', () => {
  it('?dil=en çerezi yazar ve AYNI adrese parametresiz döner (diğer parametreler kalır)', () => {
    const res = middleware(request('/gizlilik?dil=en&x=1'));
    const yer = new URL(res.headers.get('location')!);
    expect(yer.pathname).toBe('/gizlilik');
    expect(yer.searchParams.get('dil')).toBeNull();
    expect(yer.searchParams.get('x')).toBe('1');
    expect(res.cookies.get('adv_dil')?.value).toBe('en');
  });

  it('oturumsuz panel adresinde de önce dil: giriş ekranı İngilizce açılsın', () => {
    const res = middleware(request('/dashboard?dil=en'));
    expect(redirectPath(res)).toBe('/dashboard');
    expect(res.cookies.get('adv_dil')?.value).toBe('en');
  });

  it('bilinmeyen dil çerez YAZMAZ ama parametreyi yine temizler', () => {
    const res = middleware(request('/?dil=de'));
    expect(redirectPath(res)).toBe('/');
    expect(res.cookies.get('adv_dil')).toBeUndefined();
  });

  it('Edge sabitleri shared ile aynı (middleware shared içe aktaramıyor)', async () => {
    const shared = await import('@advetics/shared');
    const kaynak = (await import('node:fs')).readFileSync(require.resolve('./middleware.ts'), 'utf8');
    expect(kaynak).toContain(`const DIL_CEREZI_EDGE = '${shared.DIL_CEREZI}'`);
    expect(kaynak).toContain(`const DIL_SORGU_ANAHTARI = '${shared.DIL_SORGU_ANAHTARI}'`);
    expect(kaynak).toContain(`const DILLER_EDGE: string[] = [${shared.DILLER.map((d) => `'${d}'`).join(', ')}]`);
  });
});

describe('middleware — /en öneki (Ç2)', () => {
  it('/en/privacy Türkçe sayfaya YENİDEN YAZILIR, dil başlığı ve çerezi en', () => {
    const res = middleware(request('/en/privacy'));
    expect(new URL(res.headers.get('x-middleware-rewrite')!).pathname).toBe('/gizlilik');
    expect(res.headers.get('x-middleware-request-x-advetics-onek')).toBe('en');
    expect(res.cookies.get('adv_dil')?.value).toBe('en');
    expect(res.headers.get('Link')).toMatch(/\/en\/privacy>; rel="alternate"; hreflang="en"/);
  });

  it('KRİTİK: istemcinin gönderdiği önek başlığı silinir (Türkçe adres İngilizce çizilmez)', () => {
    const req = request('/gizlilik');
    req.headers.set('x-advetics-onek', 'en');
    const res = middleware(req);
    expect(res.headers.get('x-middleware-request-x-advetics-onek')).toBeNull();
    expect(res.headers.get('x-middleware-override-headers') ?? '').not.toContain('x-advetics-onek');
  });

  it('öneksiz site sayfası + en çerezi → /en karşılığına yönlenir; çerezsiz ziyaret çerez yazmaz', () => {
    expect(redirectPath(middleware(request('/kosullar', { cookie: 'adv_dil=en' })))).toBe('/en/terms');
    const res = middleware(request('/kosullar'));
    expect(redirectPath(res)).toBeNull();
    expect(res.cookies.get('adv_dil')).toBeUndefined();
  });

  /*
   * CANLIDA ÖLÇÜLEN DÖNGÜ (2026-10-16): sunucu 127.0.0.1'de, `nextUrl`
   * localhost diyor; yeniden yazım dış adres sayılıp Next kendine vekil
   * istek atıyor ve istek middleware'den İKİNCİ KEZ geçiyor (Host =
   * `localhost:3598`). `curl -H 'Cookie: adv_dil=en' advetics.com/en` →
   * 307 → `/en` sonsuz; çerezsiz `/en` ise Türkçe çiziliyordu.
   */
  it('KRİTİK: Next\'in vekil isteği (ikinci geçiş) en çereziyle /en\'e GERİ YÖNLENMEZ ve İngilizce çizilir', () => {
    const ilk = middleware(request('/en/privacy', { cookie: 'adv_dil=en' }));
    expect(ilk.headers.get('x-middleware-request-x-advetics-onek')).toBe('en');
    // Next'in vekil isteği: ilk geçişin yazdığı başlıkla, hedefin Host'uyla.
    const vekil = request('/gizlilik', { cookie: 'adv_dil=en', host: 'localhost:3598' });
    vekil.headers.set('x-advetics-onek', 'en');
    const res = middleware(vekil);
    expect(redirectPath(res)).toBeNull();
    expect(res.headers.get('x-middleware-request-x-advetics-onek')).toBe('en');
  });

  it('vekil Host\'u tek başına yetmez: önek başlığı yoksa en çerezi yine yönlendirir', () => {
    const res = middleware(request('/gizlilik', { cookie: 'adv_dil=en', host: 'localhost:3598' }));
    expect(redirectPath(res)).toBe('/en/privacy');
    expect(res.headers.get('x-middleware-request-x-advetics-onek')).toBeNull();
  });

  it('KRİTİK: kök alan adından gelen sahte önek başlığına yine güvenilmez', () => {
    const req = request('/gizlilik', { cookie: 'adv_dil=en' });
    req.headers.set('x-advetics-onek', 'en');
    const res = middleware(req);
    expect(redirectPath(res)).toBe('/en/privacy');
    expect(res.headers.get('x-middleware-request-x-advetics-onek')).toBeNull();
  });

  it('eşlemesi olmayan /en adresi Türkçe sayfaya düşmez (404 kalır)', () => {
    const res = middleware(request('/en/dashboard'));
    expect(res.headers.get('x-middleware-rewrite')).toBeNull();
    expect(redirectPath(res)).toBeNull();
  });
});
