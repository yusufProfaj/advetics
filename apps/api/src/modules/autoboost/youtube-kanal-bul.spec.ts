import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { SAATLIK_ARAMA_SINIRI, YoutubeKanalBulService } from './youtube-kanal-bul.service';

/**
 * ═══ YOUTUBE KANALINI BUL — ÖNERİLER, KANITLAR, MALİYET ═══
 *
 * Sınanan: (1) kanıtlar doğru kaynaktan ve sırayla geliyor (site > Google
 * Ads > arama), (2) kanal panelde zaten varsa kart bunu söylüyor ve başka
 * workspace'tekini EKLETMİYOR, (3) her boşluğun nedeni notta yazıyor,
 * (4) pahalı arama önbellekli ve sınırlı.
 *
 * GERÇEK SORGU (PGlite): workspace sitesi, Google hesapları ve var olan
 * kanallar veritabanından okunuyor. YouTube ve Google Ads taklit.
 */
const sayfaHtmlGetir = vi.hoisted(() => vi.fn());
vi.mock('../tenancy/site-oku', () => ({ sayfaHtmlGetir }));

let h: Harness;
let svc: YoutubeKanalBulService;

const KANAL_SITE = 'UCsitesitesitesitesitesi'; // 24 karakter: UC + 22
const KANAL_ADS = 'UCadsadsadsadsadsadsadsa';
const KANAL_ARAMA = 'UCaramaaramaaramaaramaar';
const BASKA_WS = '99999999-2222-2222-2222-999999999999';

const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;

const youtube = {
  getChannel: vi.fn(),
  kanalKullaniciAdiyla: vi.fn(),
  videoKanallari: vi.fn(),
  kanalDetaylari: vi.fn(),
  kanalAra: vi.fn(),
};
const reklamVideoKimlikleri = vi.fn();
const getAccessToken = vi.fn();

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new YoutubeKanalBulService(
    prisma,
    youtube as never,
    { get: () => ({ platform: 'google', reklamVideoKimlikleri }) } as never,
    { getAccessToken } as never,
  );
});
afterAll(async () => h.close());

beforeEach(async () => {
  for (const f of Object.values(youtube)) f.mockReset();
  reklamVideoKimlikleri.mockReset().mockResolvedValue(['vidAds00001', 'vidAds00002']);
  getAccessToken.mockReset().mockResolvedValue('tok');
  sayfaHtmlGetir.mockReset().mockResolvedValue({
    ok: true,
    adres: 'https://www.egebirlik.com/',
    html: '<a href="https://youtube.com/@egebirlik">YT</a><iframe src="https://www.youtube.com/embed/vidSite0001"></iframe>',
  });
  youtube.getChannel.mockResolvedValue({ durum: 'bulundu', kanal: { channelId: KANAL_SITE, title: 'Ege Birlik', thumbnailUrl: null } });
  youtube.videoKanallari.mockImplementation(async (ids: string[]) => ({
    durum: 'bulundu',
    kanallar: new Map(ids.map((v) => [v, v.startsWith('vidAds') ? KANAL_ADS : KANAL_SITE])),
  }));
  /*
   * TERS SIRA KASITLI: YouTube `channels.list` sonucu istenen sırayla
   * döndürmeyi garanti etmiyor. Taklit sırayı koruyunca sıralama kodu
   * silinse de testler geçiyordu (mutasyonda yakalandı).
   */
  youtube.kanalDetaylari.mockImplementation(async (ids: string[]) => ({
    durum: 'bulundu',
    kanallar: [...ids].reverse().map((id) => ({
      channelId: id,
      title: `Kanal ${id.slice(2, 6)}`,
      handle: null,
      thumbnailUrl: null,
      aboneSayisi: id === KANAL_ARAMA ? null : 1200,
      videoSayisi: 40,
    })),
  }));
  youtube.kanalAra.mockResolvedValue({ durum: 'bulundu', ids: [KANAL_ARAMA, KANAL_SITE] });

  await h.reset();
  await seedTenant(h, { platform: 'google', externalId: '1234567890' });
  await h.q(`UPDATE clients SET website = 'egebirlik.com', name = 'Ege Birlik Yapı' WHERE id = $1`, [IDS.client]);
});

const kanitTurleri = (r: Awaited<ReturnType<YoutubeKanalBulService['oneriler']>>, id: string) =>
  r.oneriler.find((o) => o.channelId === id)?.kaynaklar.map((k) => k.tur);

describe('öneriler — kanıtlı kaynaklar', () => {
  it('KRİTİK: site kanalı ÖNCE, kanıtlar birleşiyor (bağlantı + gömülü video tek kanıt türü)', async () => {
    const r = await svc.oneriler(CTX, IDS.client);
    expect(r.oneriler.map((o) => o.channelId)).toEqual([KANAL_SITE, KANAL_ADS]);
    expect(kanitTurleri(r, KANAL_SITE)).toEqual(['site']);
    expect(kanitTurleri(r, KANAL_ADS)).toEqual(['google_ads']);
    expect(r.oneriler[0]?.kaynaklar[0]?.aciklama).toContain('www.egebirlik.com');
  });

  it('aynı kanıt türünde ÇOK kanıtlı kanal önce', async () => {
    // Site iki kanal gösteriyor: tanıtıcı (KANAL_SITE) ve gömülü video (KANAL_ADS).
    // KANAL_ADS ayrıca Google Ads'te — iki kanıtla öne geçmeli.
    youtube.videoKanallari.mockImplementation(async (ids: string[]) => ({
      durum: 'bulundu',
      kanallar: new Map(ids.map((v) => [v, KANAL_ADS])),
    }));
    const r = await svc.oneriler(CTX, IDS.client);
    expect(r.oneriler.map((o) => o.channelId)).toEqual([KANAL_ADS, KANAL_SITE]);
    expect(kanitTurleri(r, KANAL_ADS)).toEqual(['site', 'google_ads']);
  });

  it('site adresi https ile soruluyor (şemasız girilmiş site)', async () => {
    await svc.oneriler(CTX, IDS.client);
    expect(sayfaHtmlGetir).toHaveBeenCalledWith('https://egebirlik.com');
  });

  it('Google Ads hesabı yönetici kimliğiyle sorgulanıyor', async () => {
    await h.q(`UPDATE ad_accounts SET manager_external_id = '5550001111' WHERE id = $1`, [IDS.adAccount]);
    await svc.oneriler(CTX, IDS.client);
    expect(reklamVideoKimlikleri).toHaveBeenCalledWith('tok', '1234567890', '5550001111');
  });

  it('KRİTİK: her boşluğun NEDENİ notta — site yok, Google hesabı yok', async () => {
    await h.q(`UPDATE clients SET website = NULL WHERE id = $1`, [IDS.client]);
    await h.q(`UPDATE ad_accounts SET client_id = NULL WHERE id = $1`, [IDS.adAccount]);
    const r = await svc.oneriler(CTX, IDS.client);
    expect(r.oneriler).toEqual([]);
    expect(r.notlar.join(' | ')).toMatch(/web sitesi girilmemiş/);
    expect(r.notlar.join(' | ')).toMatch(/Google Ads hesabı yok/);
    expect(r.notlar.join(' | ')).toMatch(/adıyla YouTube'da arayabilirsin/);
  });

  it('site okunamazsa ve Google sorgusu düşerse platformun cümlesi notta', async () => {
    sayfaHtmlGetir.mockResolvedValue({ ok: false, sebep: 'Site 503 döndürdü.' });
    reklamVideoKimlikleri.mockRejectedValue(new Error('PERMISSION_DENIED'));
    const r = await svc.oneriler(CTX, IDS.client);
    expect(r.notlar).toContain('Site okunamadı: Site 503 döndürdü.');
    expect(r.notlar.some((n) => n.includes('PERMISSION_DENIED'))).toBe(true);
  });

  it('sitede iz yoksa bunu söylüyor', async () => {
    sayfaHtmlGetir.mockResolvedValue({ ok: true, adres: 'https://egebirlik.com/', html: '<p>merhaba</p>' });
    reklamVideoKimlikleri.mockResolvedValue([]);
    const r = await svc.oneriler(CTX, IDS.client);
    expect(r.notlar.some((n) => n.includes('YouTube bağlantısı ya da videosu yok'))).toBe(true);
    expect(r.notlar.some((n) => n.includes('reklamı yapılmış YouTube videosu yok'))).toBe(true);
  });
});

describe('KRİTİK: kanal panelde zaten varsa kart bunu söylüyor', () => {
  async function profil(channelId: string, clientId: string | null) {
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, sync_enabled, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'youtube_channel', $4, 'Kanal', false, now())`,
      [IDS.org, clientId, IDS.connection, channelId],
    );
  }

  it('havuzda / bu workspace’te / başka workspace’te (adıyla)', async () => {
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Başka Marka', 'baska', now())`,
      [BASKA_WS, IDS.org],
    );
    await profil(KANAL_SITE, IDS.client);
    await profil(KANAL_ADS, BASKA_WS);
    youtube.kanalAra.mockResolvedValue({ durum: 'bulundu', ids: [KANAL_ARAMA] });
    await profil(KANAL_ARAMA, null);

    const r = await svc.oneriler(CTX, IDS.client);
    expect(r.oneriler.find((o) => o.channelId === KANAL_SITE)?.mevcut).toMatchObject({ durum: 'bu_workspacete' });
    expect(r.oneriler.find((o) => o.channelId === KANAL_ADS)?.mevcut).toMatchObject({
      durum: 'baska_workspacete',
      workspaceAdi: 'Başka Marka',
    });
    const a = await svc.ara(CTX, 'ege', IDS.client);
    expect(a.oneriler[0]?.mevcut).toMatchObject({ durum: 'havuzda' });
  });
});

describe('arama — pahalı, önbellekli, sınırlı', () => {
  it('YouTube sırası korunuyor, kanıt "arama" ve maliyet notu yazıyor', async () => {
    const r = await svc.ara(CTX, 'Ege Birlik', IDS.client);
    expect(r.oneriler.map((o) => o.channelId)).toEqual([KANAL_ARAMA, KANAL_SITE]);
    expect(r.oneriler[0]?.kaynaklar[0]?.tur).toBe('arama');
    expect(r.oneriler[0]?.aboneSayisi).toBeNull();
    expect(r.notlar.some((n) => n.includes('100 birim'))).toBe(true);
  });

  it('KRİTİK: aynı arama (büyük/küçük harf farkıyla) ikinci kez YouTube’a gitmiyor', async () => {
    await svc.ara(CTX, 'Önbellek Testi', null);
    const r = await svc.ara(CTX, '  önbellek testi ', null);
    expect(youtube.kanalAra).toHaveBeenCalledTimes(1);
    expect(r.notlar.some((n) => n.includes('önbellekten'))).toBe(true);
  });

  it('KRİTİK: kişi başına saatlik sınır — önbellek isabeti sayılmıyor', async () => {
    const kisi = { ...CTX, userId: '77777777-7777-7777-7777-777777777777' } as TenantContext;
    for (let i = 0; i < SAATLIK_ARAMA_SINIRI; i++) await svc.ara(kisi, `sinir ${i}`, null);
    await expect(svc.ara(kisi, 'bir fazlası', null)).rejects.toThrow(/Saatte en çok/);
    // Önbellekteki arama sınıra rağmen dönüyor (kota harcamıyor).
    await expect(svc.ara(kisi, 'sinir 0', null)).resolves.toBeDefined();
  });

  it('YouTube hatası kullanıcıya platformun cümlesiyle', async () => {
    youtube.kanalAra.mockResolvedValue({ durum: 'hata', message: 'YouTube API: quotaExceeded' });
    await expect(svc.ara(CTX, 'kota testi', null)).rejects.toThrow('YouTube API: quotaExceeded');
  });

  it('sonuç yoksa bunu söylüyor', async () => {
    youtube.kanalAra.mockResolvedValue({ durum: 'bulundu', ids: [] });
    const r = await svc.ara(CTX, 'olmayan firma', null);
    expect(r.oneriler).toEqual([]);
    expect(r.notlar.some((n) => n.includes('kanal bulunamadı'))).toBe(true);
  });
});

describe('kaynak kilitleri', () => {
  const kaynak = readFileSync(join(__dirname, 'youtube-kanal-bul.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('KRİTİK: servis HİÇBİR ŞEY yazmıyor — ekleme mevcut uçlardan', () => {
    expect(kaynak.length).toBeGreaterThan(2000);
    for (const yasak of ['INSERT', 'UPDATE ', 'DELETE', '$executeRaw']) expect(kaynak, yasak).not.toContain(yasak);
  });

  it('NEST: servis modülde kayıtlı', () => {
    const mod = readFileSync(join(__dirname, 'autoboost.module.ts'), 'utf8');
    expect(mod).toMatch(/providers:\s*\[[^\]]*YoutubeKanalBulService/);
  });
});
