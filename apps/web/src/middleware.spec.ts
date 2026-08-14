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

describe('middleware — white-label müşteri alan adı', () => {
  const HOST = 'musteri-alan-adi.com';

  it('müşteri alan adında kök tanıtım sayfası SERVİS EDİLMİYOR', () => {
    // Ajansın tanıtım sayfası müşterinin alan adından çıkmamalı: müşteri o
    // alan adını kendi raporu için bağladı, ajansın satış sayfası için değil.
    expect(redirectPath(middleware(request('/', { host: HOST })))).toBe('/r/bulunamadi');
  });

  it('müşteri alan adı yalnızca rapor sayfalarını servis ediyor', () => {
    expect(redirectPath(middleware(request('/r/abc123', { host: HOST })))).toBeNull();
    expect(redirectPath(middleware(request('/dashboard', { host: HOST })))).toBe(
      '/r/bulunamadi',
    );
  });
});
