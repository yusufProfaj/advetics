import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  enUygunOneri,
  olcumSatirlari,
  type GoogleDonusumIslemi,
  type MetaPikselOlcumu,
  type OlcumGirdisi,
  type SiteTaramasi,
  type TenantContext,
} from '@advetics/shared';
import { OlcumService, siteTara } from './olcum.service';
import { sayfaHtmlGetir } from '../tenancy/site-oku';

/**
 * ═══ AJAN 4 · ÖLÇÜM DENETİMİ (2026-10-11) ═══
 *
 * Servis GERÇEK kodla koşuyor; yalnız sınırlar taklit: Prisma (`withTenant`
 * sorgu metnine göre satır veriyor), sağlayıcılar, token kasası, DNS ve
 * `fetch`. Site taraması servisin İÇİNDEKİ okuyucuyla, yani gerçek
 * `sayfaHtmlGetir` üzerinden gidiyor: SSRF iddiaları kopyalanmış bir okuyucuya
 * değil üretimdeki yola çapalı.
 *
 * `it.fails` = BULGU. Test, doğru davranışı iddia ediyor ve bugün düşüyor;
 * düzeltme gelince `it.fails` yeşil olmaktan çıkar ve `it`e çevrilmeli.
 */
const lookup = vi.hoisted(() => vi.fn());
vi.mock('node:dns/promises', () => ({ lookup }));
const fetchMock = vi.fn();

const CLIENT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const ctx = (o: Partial<TenantContext> = {}): TenantContext =>
  ({
    userId: 'u1',
    orgId: 'o1',
    clientIds: [CLIENT_A],
    activeClientId: CLIENT_A,
    isOrgAdmin: false,
    permissions: ['client.read', 'client.write'],
    role: 'ad_manager',
    ...o,
  }) as unknown as TenantContext;

const ISLEM = (o: Partial<GoogleDonusumIslemi>): GoogleDonusumIslemi => ({
  id: '100',
  ad: 'generate_lead',
  durum: 'ENABLED',
  kategori: 'SUBMIT_LEAD_FORM',
  tur: 'WEBPAGE',
  birincil: false,
  sayim30Gun: 12,
  ...o,
});

interface Kurulum {
  website?: string | null;
  hesaplar?: Array<{ id: string; ad: string; platform: string; external_id: string; connection_id: string; manager_external_id: string | null }>;
  islemler?: GoogleDonusumIslemi[];
  birincilMi?: boolean | null;
  pikseller?: { satirlar: Array<{ id: string; ad: string; sonCalisma: string | null; kullanilamaz: boolean }>; kesildi: boolean };
  olaylar?: Record<string, number> | null;
  kota?: { isEnabled: boolean; allowed?: boolean };
}

const GOOGLE_HESABI = { id: 'g-1', ad: 'Ege Google', platform: 'google', external_id: '516-174-6317', connection_id: 'c-g', manager_external_id: null };
const META_HESABI = { id: 'm-1', ad: 'Ege Meta', platform: 'meta', external_id: 'act_123', connection_id: 'c-m', manager_external_id: null };

function kur(k: Kurulum = {}) {
  const sorgular: string[] = [];
  const t = {
    $queryRaw: vi.fn(async (q: { sql: string; values: unknown[] }) => {
      sorgular.push(q.sql);
      if (q.sql.includes('FROM clients')) return [{ website: k.website === undefined ? 'egebirlik.com' : k.website }];
      if (q.sql.includes('FROM ad_accounts\n') || q.sql.includes('platform IN')) return k.hesaplar ?? [GOOGLE_HESABI, META_HESABI];
      if (q.sql.includes('platform_connections')) return [{ token: Buffer.from('x'), durum: 'active' }];
      throw new Error(`beklenmeyen sorgu: ${q.sql}`);
    }),
  };
  const prisma = { withTenant: vi.fn(async (_c: unknown, fn: (tx: unknown) => Promise<unknown>) => fn(t)) };
  const google = {
    donusumIslemleriOku: vi.fn(async () => ({ islemler: k.islemler ?? [ISLEM({})], donusumKimligi: 'AW-1' })),
    donusumBirincilYap: vi.fn(async (_c: { accountExternalId: string }, _id: string) => undefined),
    donusumBirincilMi: vi.fn(async () => (k.birincilMi === undefined ? true : k.birincilMi)),
  };
  const meta = {
    fetchAdPixels: vi.fn(async () => k.pikseller ?? { satirlar: [{ id: '1781886293257274', ad: 'P', sonCalisma: '2026-10-10T00:00:00Z', kullanilamaz: false }], kesildi: false }),
    fetchPixelEventCounts: vi.fn(async () => (k.olaylar === undefined ? { PageView: 10, Lead: 2 } : k.olaylar)),
  };
  const saglayicilar = { get: (p: string) => (p === 'google' ? google : meta) };
  const kasa = { getAccessToken: vi.fn(async () => 'g-token') };
  const kota = {
    isEnabled: k.kota?.isEnabled ?? false,
    acquire: vi.fn(async () => ({ allowed: k.kota?.allowed ?? true, retryAfterMs: 120_000 })),
  };
  const crypto = { decrypt: vi.fn(() => 'm-token') };
  const audit = { record: vi.fn(async (_t: unknown, _c: unknown, _e: Record<string, unknown>) => undefined) };
  const servis = new OlcumService(prisma as never, kasa as never, saglayicilar as never, kota as never, crypto as never, audit as never);
  return { servis, prisma, google, meta, audit, kota, sorgular };
}

function yanit(govde: string, tur: string, status = 200, ek: Record<string, string> = {}): Response {
  return new Response(govde, { status, headers: { 'content-type': tur, ...ek } });
}

beforeEach(() => {
  lookup.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);
  fetchMock.mockResolvedValue(yanit('<html>bos</html>', 'text/html; charset=utf-8'));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ─────────────────────────────────────────────────────────────────────────────
// 1. YETKİ / İZOLASYON
// ─────────────────────────────────────────────────────────────────────────────

describe('izolasyon: erişim listesi dışındaki workspace', () => {
  it('KRİTİK: GET — başka workspace için veritabanına ve platforma HİÇ gidilmez', async () => {
    const { servis, prisma, google, meta } = kur();
    await expect(servis.durum(ctx(), CLIENT_B, false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.withTenant).not.toHaveBeenCalled();
    expect(google.donusumIslemleriOku).not.toHaveBeenCalled();
    expect(meta.fetchAdPixels).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KRİTİK: POST — başka workspace için yazma yok', async () => {
    const { servis, google } = kur();
    await expect(servis.birincilYap(ctx(), CLIENT_B, '100')).rejects.toBeInstanceOf(ForbiddenException);
    expect(google.donusumBirincilYap).not.toHaveBeenCalled();
  });

  it('KRİTİK: önbellek erişim kontrolünü atlatmıyor (A için dolu önbellek, B kullanıcısına dönmüyor)', async () => {
    const { servis } = kur();
    await servis.durum(ctx({ clientIds: [CLIENT_A, CLIENT_B] }), CLIENT_A, false);
    await expect(servis.durum(ctx({ clientIds: [CLIENT_B] }), CLIENT_A, false)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('hesap sorgusu atanmış satırla süzülüyor: client_id eşitliği, havuz (NULL) yolu yok', async () => {
    const { servis, sorgular } = kur();
    await servis.durum(ctx(), CLIENT_A, false);
    const q = sorgular.find((s) => s.includes('FROM ad_accounts'))!;
    expect(q).toMatch(/WHERE client_id = \?::uuid/);
    expect(q).not.toMatch(/client_id IS NULL/);
  });

  /*
   * BULGU (önemli, DEPO GENELİ DESEN): yetki, aktif workspace SEÇİLİ
   * DEĞİLKEN kullanıcının EN GENİŞ rolünden hesaplanıyor
   * (`tenant-context.service.ts` ~702), uç ise gövdedeki `clientId`ye yazıyor.
   * A'da ad_manager, B'de client_viewer olan kullanıcı seçim yokken B'nin
   * Google hesabında "birincil yap" çalıştırabilir: servis yalnız erişim
   * listesine bakıyor, B'deki ROLE bakmıyor; RLS de aktif seçim yokken B'yi
   * açıyor (`olcum-rls.spec.ts` KANIT testi). Aktif A iken RLS B'yi gizlediği
   * için o hâl korunuyor. Aynı desen rehber/yayın uçlarında da var.
   */
  it('DÜZELDİ (Ajan 4): aktif seçim yokken (en geniş rol yazabilir) B workspace\'inde platforma yazılmamalı — B\'deki rol client_viewer', async () => {
    const { servis, google } = kur();
    const c = ctx({ clientIds: [CLIENT_A, CLIENT_B], activeClientId: null, permissions: ['client.read', 'client.write'] as never });
    await servis.birincilYap(c, CLIENT_B, '100').catch(() => undefined);
    expect(google.donusumBirincilYap).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. SSRF — servisin gerçek okuyucusu (sayfaHtmlGetir) üzerinden
// ─────────────────────────────────────────────────────────────────────────────

describe('SSRF: site adresi kullanıcı girdisi', () => {
  it('KRİTİK: http:// girdisi https\'e yükseltilmiyor, REDDEDİLİYOR ve istek gitmiyor', async () => {
    const { servis } = kur({ website: 'http://ornek.com' });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.site).toMatchObject({ durum: 'ulasilamadi', hata: expect.stringMatching(/https/) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(r.okumaHatalari).toContainEqual({ kaynak: 'site', mesaj: expect.stringMatching(/https/) });
  });

  it('KRİTİK: IP literali (metadata ucu) DNS\'e bile gitmeden reddediliyor', async () => {
    const { servis } = kur({ website: '169.254.169.254/latest/meta-data' });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.site.durum).toBe('ulasilamadi');
    expect(r.site.hata).toMatch(/IP/);
    expect(lookup).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KRİTİK: iç ağa çözülen alan adı reddediliyor (koruma çözülen IP\'de)', async () => {
    lookup.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);
    const { servis } = kur({ website: 'kotu.example' });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.site).toMatchObject({ durum: 'ulasilamadi', hata: expect.stringMatching(/iç ağ/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('KRİTİK: iç ağa YÖNLENDİRME izlenmiyor — ikinci adım da aynı kontrolden geçiyor', async () => {
    lookup.mockImplementation(async (host: string) => (host === 'ic.example' ? [{ address: '127.0.0.1', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]));
    fetchMock.mockResolvedValueOnce(yanit('', 'text/html', 302, { location: 'https://ic.example/admin' }));
    const { servis } = kur({ website: 'disari.example' });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.site).toMatchObject({ durum: 'ulasilamadi', hata: expect.stringMatching(/iç ağ/) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('GTM kimliği gtm.js adresine yalnız [A-Z0-9] ile giriyor (sorgu enjeksiyonu yok)', async () => {
    const okunan: string[] = [];
    await siteTara('x.com', async (a) => {
      okunan.push(a);
      return { ok: true, html: a.includes('gtm.js') ? '' : "'GTM-ABCD1234&id=GTM-X' 'GTM-AB/../../x'" };
    });
    const gtm = okunan.filter((a) => a.includes('gtm.js'));
    expect(gtm).toEqual(['https://www.googletagmanager.com/gtm.js?id=GTM-ABCD1234']);
  });

  /*
   * BULGU (önemli): `sayfaHtmlGetir` yalnız `html`/`text` içerik türünü kabul
   * ediyor; `gtm.js` `application/javascript; charset=UTF-8` dönüyor (canlı,
   * curl -I, 2026-10-11). Yani Tag Manager kapsayıcısı ÜRETİMDE HİÇ
   * OKUNAMIYOR: modülün dayandığı ölçüm ("Analytics ve Meta pikseli YALNIZ
   * gtm.js içinde") hiçbir sitede çalışmıyor, kapsayıcı `tagManagerOkunamayan`a
   * düşüyor ve panel "Sitede piksel kodu görülmedi" diyor. Mevcut test bunu
   * göremedi çünkü okuyucuyu taklit ediyordu.
   */
  it('DÜZELDİ (Ajan 4): gtm.js (application/javascript) okunuyor; içindeki Analytics ve piksel bulunuyor', async () => {
    fetchMock.mockImplementation(async (adres: string) =>
      adres.includes('gtm.js')
        ? yanit('"vtp_measurementIdOverride":"G-YWXPLS3GT2" fbq(\\"init\\",\\"1781886293257274\\")', 'application/javascript; charset=UTF-8')
        : yanit("<script>'GTM-WMBBT9JQ'</script>", 'text/html; charset=utf-8'),
    );
    const { servis } = kur({ website: 'egebirlikseasight.com' });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.site.analytics).toEqual(['G-YWXPLS3GT2']);
    expect(r.site.metaPiksel).toEqual(['1781886293257274']);
  });

  it('okunamayan kapsayıcı SESSİZ DEĞİL: listede (gtm.js ikili dosya dönerse)', async () => {
    fetchMock.mockImplementation(async (adres: string) =>
      adres.includes('gtm.js') ? yanit('G-YWXPLS3GT2', 'image/png') : yanit("'GTM-WMBBT9JQ'", 'text/html'),
    );
    const { servis } = kur({ website: 'egebirlikseasight.com' });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.site.tagManagerOkunamayan).toEqual(['GTM-WMBBT9JQ']);
  });

  /*
   * BULGU (önemli): `clients.website` serbest dizge (`bosDizgeNull(255)`).
   * "ege birlik.com" girilirse tarama `adres: 'https://ege birlik.com'` dönüyor
   * ve panel `new URL(s.adres).hostname` (olcum-bolumu.tsx:134) ile
   * TypeError fırlatıp bölümün tamamını düşürüyor.
   */
  it('DÜZELDİ (Ajan 4): dönen `site.adres` her zaman URL olarak ayrıştırılabilir (panel buna güveniyor)', async () => {
    for (const w of ['ege birlik.com', 'http://', 'https://']) {
      const r = await siteTara(w, async (a) => {
        const x = await sayfaHtmlGetir(a);
        return x.ok ? { ok: true, html: x.html } : { ok: false, sebep: x.sebep };
      });
      if (r.adres !== null) expect(() => new URL(r.adres!), w).not.toThrow();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. SESSİZ HATA
// ─────────────────────────────────────────────────────────────────────────────

describe('sessiz hata', () => {
  it('KRİTİK: Google okuması düşerse hücre "bilinmiyor", platformun mesajı hem hücrede hem okumaHatalari\'nda', async () => {
    const k = kur();
    k.google.donusumIslemleriOku.mockRejectedValueOnce(new Error('PERMISSION_DENIED: kullanıcı erişemiyor'));
    const r = await k.servis.durum(ctx(), CLIENT_A, true);
    expect(r.satirlar.find((s) => s.tur === 'site_formu')!.google).toMatchObject({ durum: 'bilinmiyor', neden: expect.stringContaining('PERMISSION_DENIED') });
    expect(r.okumaHatalari).toContainEqual({ kaynak: 'google', mesaj: expect.stringContaining('PERMISSION_DENIED') });
    expect(r.analyticsBagli).toBeNull();
  });

  it('KRİTİK: Meta istatistiği null → "bilinmiyor", "olay yok" DEĞİL', async () => {
    const { servis } = kur({ olaylar: null });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(r.satirlar.find((s) => s.tur === 'site_formu')!.meta.durum).toBe('bilinmiyor');
  });

  it('Google kotası doluysa istek GİTMİYOR ve sebep ekranda', async () => {
    const k = kur({ kota: { isEnabled: true, allowed: false } });
    const r = await k.servis.durum(ctx(), CLIENT_A, true);
    expect(k.google.donusumIslemleriOku).not.toHaveBeenCalled();
    expect(r.okumaHatalari).toContainEqual({ kaynak: 'google', mesaj: expect.stringMatching(/kota/) });
  });

  /*
   * BULGU (önemli): piksel listesi kesildiğinde (`kesildi: true`) hata
   * `okumaHatalari`na yazılıyor ama hücre KESİN konuşuyor: listenin dışında
   * kalan pikselde Lead olabilirken "Piksel çalışıyor ama son 7 günde Lead
   * olayı gelmedi" diyor ve META_OLAY önerisi çıkıyor. `metaHata` yalnız
   * `pikseller === null` iken okunuyor (`metaHucresi`).
   */
  it('DÜZELDİ (Ajan 4): kesilmiş piksel listesinde site formu hücresi "sayım yok" diye kesin konuşmuyor', async () => {
    const { servis } = kur({ olaylar: { PageView: 50 }, pikseller: { satirlar: [{ id: '1', ad: 'P', sonCalisma: '2026-10-10T00:00:00Z', kullanilamaz: false }], kesildi: true } });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    const h = r.satirlar.find((s) => s.tur === 'site_formu')!.meta;
    expect(h.durum === 'sinyal_yok' && !/kesil/.test(h.neden)).toBe(false);
  });

  /*
   * BULGU (önemli): Google ya da Meta OKUNAMADIĞINDA öneri "Kullanılabilir
   * bütün ölçümler hazır" ve "Form ve aramalar platformlara ulaşıyor" diyor.
   * Bilinmeyen veri üstüne olumlu hüküm — bu projenin tanımıyla sessiz hata.
   */
  it('DÜZELDİ (Ajan 4): Google okunamadıysa öneri HEPSI_HAZIR olmamalı', () => {
    const site: SiteTaramasi = { durum: 'tarandi', adres: 'https://x.com', hata: null, tagManager: [], analytics: [], googleAds: [], metaPiksel: [], altyapi: null, tagManagerOkunamayan: [] };
    const piksel: MetaPikselOlcumu[] = [{ id: '1', ad: 'P', sonCalisma: '2026-10-10', kullanilamaz: false, olaylar: { Lead: 3 } }];
    const g: OlcumGirdisi = { googleHesapVar: true, metaHesapVar: true, googleIslemleri: null, googleHata: 'PERMISSION_DENIED', metaPikselleri: piksel, metaHata: null, site };
    expect(enUygunOneri(g, olcumSatirlari(g)).kod).not.toBe('HEPSI_HAZIR');
  });

  /*
   * BULGU (küçük): birden çok Google/Meta hesabı atanmış workspace'te yalnız
   * İLKİ (ada göre) okunuyor ve yanıtta diğerlerinin varlığına dair tek iz
   * yok — sessiz kesme. "Birincil yap" da yalnız ilk hesapta çalışıyor.
   */
  it('DÜZELDİ (Ajan 4): ikinci Google hesabı yanıtta söyleniyor (sessiz kesme yok)', async () => {
    const ikinci = { ...GOOGLE_HESABI, id: 'g-2', ad: 'Zeytin Google', external_id: '111-222-3333' };
    const { servis } = kur({ hesaplar: [GOOGLE_HESABI, ikinci, META_HESABI] });
    const r = await servis.durum(ctx(), CLIENT_A, true);
    expect(JSON.stringify(r)).toContain('Zeytin Google');
  });

  it('önbellek: 10 dk içinde platforma yeniden gidilmiyor, yenile=1 atlıyor', async () => {
    const k = kur();
    const t0 = new Date('2026-10-11T10:00:00Z');
    await k.servis.durum(ctx(), CLIENT_A, false, t0);
    await k.servis.durum(ctx(), CLIENT_A, false, new Date(t0.getTime() + 9 * 60_000));
    expect(k.google.donusumIslemleriOku).toHaveBeenCalledTimes(1);
    await k.servis.durum(ctx(), CLIENT_A, true, new Date(t0.getTime() + 9 * 60_000));
    expect(k.google.donusumIslemleriOku).toHaveBeenCalledTimes(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. YAZMA GÜVENLİĞİ — "birincil yap"
// ─────────────────────────────────────────────────────────────────────────────

describe('birincil yap', () => {
  it('KRİTİK: başarı yolu — tek yazma, geri okuma, denetim kaydı, önbellek düşer', async () => {
    const k = kur();
    await k.servis.durum(ctx(), CLIENT_A, false);
    await k.servis.birincilYap(ctx(), CLIENT_A, '100');
    expect(k.google.donusumBirincilYap).toHaveBeenCalledTimes(1);
    expect(k.google.donusumBirincilYap.mock.calls[0]![1]).toBe('100');
    expect(k.google.donusumBirincilMi).toHaveBeenCalledTimes(1);
    expect(k.audit.record).toHaveBeenCalledTimes(1);
    expect(k.audit.record.mock.calls[0]![2]).toMatchObject({ clientId: CLIENT_A, action: 'olcum.birincil_yap', targetType: 'google_conversion_action', targetId: '100' });
    // Önbellek düştü: yazmadan sonra platform YENİDEN okundu (ilk durum + yazma öncesi + yazma sonrası).
    expect(k.google.donusumIslemleriOku).toHaveBeenCalledTimes(3);
  });

  it('KRİTİK: Google Ads hesap numarası tiresiz gidiyor (resourceName)', async () => {
    const k = kur();
    await k.servis.birincilYap(ctx(), CLIENT_A, '100');
    expect(k.google.donusumBirincilYap.mock.calls[0]![0]).toMatchObject({ accountExternalId: '5161746317' });
  });

  it.each([
    ['gizli (HIDDEN)', ISLEM({ durum: 'HIDDEN' }), ConflictException],
    ['kaldırılmış', ISLEM({ durum: 'REMOVED' }), ConflictException],
    ['sayımsız', ISLEM({ sayim30Gun: 0 }), ConflictException],
    ['hesapta yok', ISLEM({ id: '999' }), BadRequestException],
  ])('KRİTİK: %s işlem birincil YAPILMIYOR, platforma yazma yok', async (_ad, islem, hata) => {
    const k = kur({ islemler: [islem] });
    await expect(k.servis.birincilYap(ctx(), CLIENT_A, '100')).rejects.toBeInstanceOf(hata);
    expect(k.google.donusumBirincilYap).not.toHaveBeenCalled();
    expect(k.audit.record).not.toHaveBeenCalled();
  });

  it('zaten birincilse yazma ve denetim kaydı yok', async () => {
    const k = kur({ islemler: [ISLEM({ birincil: true })] });
    await k.servis.birincilYap(ctx(), CLIENT_A, '100');
    expect(k.google.donusumBirincilYap).not.toHaveBeenCalled();
    expect(k.audit.record).not.toHaveBeenCalled();
  });

  it('hesap atanmamışsa ve kota doluysa yazma yok', async () => {
    const yok = kur({ hesaplar: [META_HESABI] });
    await expect(yok.servis.birincilYap(ctx(), CLIENT_A, '100')).rejects.toBeInstanceOf(BadRequestException);
    const dolu = kur({ kota: { isEnabled: true, allowed: false } });
    await expect(dolu.servis.birincilYap(ctx(), CLIENT_A, '100')).rejects.toBeInstanceOf(ConflictException);
    expect(dolu.google.donusumBirincilYap).not.toHaveBeenCalled();
  });

  it('geri okuma null dönerse kullanıcıya açık hata (200 doğrulama değil)', async () => {
    const k = kur({ birincilMi: null });
    await expect(k.servis.birincilYap(ctx(), CLIENT_A, '100')).rejects.toThrow(/geri okumada/);
  });

  /*
   * BULGU (önemli): Google yazmayı KABUL ETTİ ama geri okuma doğrulamadıysa
   * denetim kaydı HİÇ yazılmıyor. Platformda bir değişiklik olmuş olabilir ve
   * "kim, ne zaman" izi yok. Kayıt geri okumadan bağımsız yazılmalı (sonuç
   * `after` içinde: doğrulandı / doğrulanamadı).
   */
  it('DÜZELDİ (Ajan 4): yazma gittiyse geri okuma doğrulamasa bile denetim kaydı var', async () => {
    const k = kur({ birincilMi: null });
    await k.servis.birincilYap(ctx(), CLIENT_A, '100').catch(() => undefined);
    expect(k.google.donusumBirincilYap).toHaveBeenCalledTimes(1);
    expect(k.audit.record).toHaveBeenCalledTimes(1);
  });

  /*
   * BULGU (önemli): servis "önerinin koşuluyla aynı" diyor ama KATEGORİYE
   * bakmıyor. Doğrudan istekle CONTACT kategorili `cta_click` (Ege Birlik'te
   * 30 günde 15.756 tıklama — modülün kendi ölçtüğü tuzak) birincil
   * yapılabiliyor; Google teklifi tıklamaya göre optimize olur ve para harcar.
   */
  it('DÜZELDİ (Ajan 4): ölçüm türü olmayan kategori (CONTACT) birincil yapılmıyor', async () => {
    const k = kur({ islemler: [ISLEM({ kategori: 'CONTACT', ad: 'cta_click', sayim30Gun: 15756 })] });
    await k.servis.birincilYap(ctx(), CLIENT_A, '100').catch(() => undefined);
    expect(k.google.donusumBirincilYap).not.toHaveBeenCalled();
  });
});
