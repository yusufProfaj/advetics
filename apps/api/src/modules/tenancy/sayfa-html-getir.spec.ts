import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sayfaHtmlGetir } from './site-oku';

/**
 * ═══ YÖNLENDİRME İZLENİYOR — AMA HER ADIM YENİDEN DOĞRULANIYOR ═══
 *
 * `sayfaHtmlGetir` "YouTube kanalını bul"un site okuması. `siteOku`dan farkı
 * yönlendirmeyi izlemesi (`site.com` → `www.site.com` çok yaygın). İzlemenin
 * bedeli SSRF: ilk adres temiz, hedef iç ağ olabilir. Testler her adımın
 * ilk istekle AYNI kontrolden geçtiğini kilitliyor.
 */
const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup }));
const fetchMock = vi.fn();

function yanit(govde: string, status = 200, ek: Record<string, string> = {}): Response {
  return new Response(status >= 300 && status < 400 ? null : govde, {
    status,
    headers: { 'content-type': 'text/html', ...ek },
  });
}

beforeEach(() => {
  lookup.mockReset().mockImplementation(async (host: string) =>
    host === 'ic.example.com'
      ? [{ address: '169.254.169.254', family: 4 }]
      : [{ address: '93.184.216.34', family: 4 }],
  );
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe('sayfaHtmlGetir', () => {
  it('ham HTML dönüyor (bağlantılar için metne çevrilmiyor)', async () => {
    fetchMock.mockResolvedValue(yanit('<a href="https://youtube.com/@ege">YT</a>'));
    const r = await sayfaHtmlGetir('https://ege.com');
    expect(r).toEqual({ ok: true, html: '<a href="https://youtube.com/@ege">YT</a>', adres: 'https://ege.com/' });
  });

  it('aynı siteye yönlendirmeyi izliyor ve son adresi bildiriyor', async () => {
    fetchMock
      .mockResolvedValueOnce(yanit('', 301, { location: 'https://www.ege.com/' }))
      .mockResolvedValueOnce(yanit('<p>tamam</p>'));
    const r = await sayfaHtmlGetir('https://ege.com');
    expect(r).toMatchObject({ ok: true, adres: 'https://www.ege.com/' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('KRİTİK: iç ağa çözülen bir hosta yönlendirme İZLENMİYOR', async () => {
    fetchMock.mockResolvedValueOnce(yanit('', 302, { location: 'https://ic.example.com/latest/meta-data' }));
    const r = await sayfaHtmlGetir('https://ege.com');
    expect(r).toEqual({ ok: false, sebep: 'Site adresi iç ağa işaret ediyor; okunmadı.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('KRİTİK: http’ye ve IP literaline yönlendirme reddediliyor', async () => {
    fetchMock.mockResolvedValueOnce(yanit('', 302, { location: 'http://ege.com/' }));
    expect(await sayfaHtmlGetir('https://ege.com')).toEqual({ ok: false, sebep: 'Site adresi https ile başlamalı.' });
    fetchMock.mockResolvedValueOnce(yanit('', 302, { location: 'https://169.254.169.254/' }));
    expect(await sayfaHtmlGetir('https://ege.com')).toEqual({ ok: false, sebep: 'Site adresi alan adı olmalı, IP değil.' });
  });

  it('sonsuz yönlendirme sınırda kesiliyor', async () => {
    fetchMock.mockImplementation(async () => yanit('', 302, { location: 'https://ege.com/a' }));
    const r = await sayfaHtmlGetir('https://ege.com', 2);
    expect(r).toEqual({ ok: false, sebep: 'Site 2 kereden fazla yönlendirdi; okunmadı.' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('fetch yönlendirmeyi KENDİSİ izlemiyor (manual)', async () => {
    fetchMock.mockResolvedValue(yanit('<p>x</p>'));
    await sayfaHtmlGetir('https://ege.com');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: 'manual' });
  });
});
