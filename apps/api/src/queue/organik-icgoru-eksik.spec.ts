import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDS, createHarness, seedTenant, type Harness } from '../../test/pglite-harness';
import { MetaProvider, icgoruReddiMi } from '../modules/connections/providers/meta.provider';
import type { DiscoveredOrganicPost } from '../modules/connections/provider.types';
import { OrganicSyncService } from './organic-sync.service';

/**
 * ═══ META İSTATİSTİK ALANINI REDDEDİNCE GÖNDERİ YİNE GELİYOR ═══
 *
 * Canlıda (2026-09-30) Facebook sayfası gönderi çekimi `(#100) The value
 * must be a valid insights metric` ile KALICI düşüyordu: istatistik iç içe
 * alan olarak istendiği için tek geçersiz metrik gönderileri de
 * götürüyordu. Sınanan üç kural:
 *   · Ret doğru tanınıyor, başka bir #100 tanınmıyor.
 *   · Sağlayıcı istatistiksiz TEKRARLIYOR ve diğer iç içe alanlar
 *     (virgül taşıyan `likes.summary(true)`) bozulmadan gidiyor.
 *   · Yazım, ölçülmüş eski sayıların üzerine SIFIR yazmıyor.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

const RED = { error: { message: '(#100) The value must be a valid insights metric', type: 'OAuthException', code: 100, fbtrace_id: 'x' } };

describe('istatistik reddi tanıma', () => {
  it('iki biçim tanınıyor', () => {
    expect(icgoruReddiMi(new Error('(#100) The value must be a valid insights metric'))).toBe(true);
    expect(icgoruReddiMi(new Error('(#100) metric[3] must be one of the following values: impressions'))).toBe(true);
  });
  it('KRİTİK: başka bir #100 tanınmıyor — gerçek arıza istatistiksiz başarıya dönmemeli', () => {
    expect(icgoruReddiMi(new Error('(#100) Tried accessing nonexisting field (foo)'))).toBe(false);
    expect(icgoruReddiMi(new Error('(#100) Invalid parameter'))).toBe(false);
  });
});

describe('sağlayıcı: istatistiksiz tekrar', () => {
  let orijinal: typeof fetch;
  beforeEach(() => {
    orijinal = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = orijinal;
  });
  const meta = () =>
    new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v21.0' } } } as never);

  it('KRİTİK: ret → ikinci istek istatistiksiz, gönderiler geliyor ve işaretli', async () => {
    const f = vi.fn(async (url: string) => {
      const alanlar = new URL(url).searchParams.get('fields') ?? '';
      if (alanlar.includes('insights.')) return YANIT(RED, 400);
      return YANIT({ data: [{ id: 'p1', message: 'merhaba', created_time: '2026-09-29T10:00:00+0000' }] });
    });
    globalThis.fetch = f as unknown as typeof fetch;
    const posts = await meta().fetchOrganicPosts({
      pageAccessToken: 't',
      profileExternalId: 'page1',
      profileType: 'facebook_page',
    });
    expect(f).toHaveBeenCalledTimes(2);
    const ikinci = new URL(f.mock.calls[1]![0]).searchParams.get('fields')!;
    expect(ikinci).not.toContain('insights');
    // Virgül taşıyan iç içe alan bölünmeden gidiyor.
    expect(ikinci).toContain('likes.summary(true).limit(0)');
    expect(ikinci).toContain('attachments{media_type}');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.icgoruEksik).toBe(true);
  });

  it('başka bir hata TEKRARLANMIYOR, fırlatılıyor', async () => {
    const f = vi.fn(async () => YANIT({ error: { message: '(#100) Invalid parameter', code: 100 } }, 400));
    globalThis.fetch = f as unknown as typeof fetch;
    await expect(
      meta().fetchOrganicPosts({ pageAccessToken: 't', profileExternalId: 'page1', profileType: 'facebook_page' }),
    ).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('yazım: ölçülmüş sayılar korunuyor (gerçek veritabanı)', () => {
  let h: Harness;
  const PROFIL = '66666666-6666-4666-8666-666666666666';
  let sonraki: DiscoveredOrganicPost[] = [];

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
    await h.q(
      `INSERT INTO social_profiles
         (id, org_id, client_id, connection_id, profile_type, external_id, name, page_access_token_enc, updated_at)
       VALUES ($1, $2, $3, $4, 'facebook_page', 'page1', 'Sayfa', '\\x01', now())`,
      [PROFIL, IDS.org, IDS.client, IDS.connection],
    );
  });

  const servis = () =>
    new OrganicSyncService(
      h.db as never,
      { get: () => ({ fetchOrganicPosts: async () => sonraki }) } as never,
      { decrypt: () => 'tok' } as never,
      { acquire: async () => ({ allowed: true }), record: async () => undefined } as never,
    );

  const gonderi = (x: Partial<DiscoveredOrganicPost>): DiscoveredOrganicPost => ({
    externalId: 'p1',
    mediaType: 'photo',
    message: 'm',
    publishedAt: new Date('2026-09-29T10:00:00Z'),
    impressions: 0,
    reach: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    videoViews: 0,
    raw: {},
    ...x,
  });

  it('KRİTİK: istatistiksiz ikinci çekim gösterim/erişimi SIFIRLAMIYOR, beğeniyi güncelliyor', async () => {
    sonraki = [gonderi({ impressions: 900, reach: 700, videoViews: 50, likes: 10 })];
    await servis().syncProfile(PROFIL);
    sonraki = [gonderi({ likes: 12, icgoruEksik: true })];
    const r = await servis().syncProfile(PROFIL);

    const [satir] = await h.q<{ impressions: number; reach: number; video_views: number; likes: number; engagements: number }>(
      `SELECT impressions, reach, video_views, likes, engagements FROM organic_posts WHERE external_id = 'p1'`,
    );
    expect(satir).toMatchObject({ impressions: 900, reach: 700, video_views: 50, likes: 12, engagements: 12 });
    // Not sessiz değil.
    expect(r.note).toContain('istatistiği alınamadı');
  });

  it('istatistikli çekim normal şekilde güncelliyor', async () => {
    sonraki = [gonderi({ impressions: 900, reach: 700 })];
    await servis().syncProfile(PROFIL);
    sonraki = [gonderi({ impressions: 1200, reach: 800 })];
    const r = await servis().syncProfile(PROFIL);
    const [satir] = await h.q<{ impressions: number; reach: number }>(
      `SELECT impressions, reach FROM organic_posts WHERE external_id = 'p1'`,
    );
    expect(satir).toMatchObject({ impressions: 1200, reach: 800 });
    expect(r.note).not.toContain('istatistiği alınamadı');
  });
});
