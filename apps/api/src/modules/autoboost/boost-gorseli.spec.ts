import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { CryptoService } from '../../crypto/crypto.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { QuotaGuardService } from '../../queue/quota-guard.service';
import type { ProviderRegistry } from '../connections/provider.registry';
import { AutoBoostReadService } from './autoboost-read.service';
import { BoostGorseliService } from './boost-gorseli.service';

/**
 * ═══ AKILLI BOOST KART GÖRSELİ (2026-10-14) ═══
 *
 * Canlıda yayınlanıp eskiyen Instagram kartlarının görseli "görsel yok"
 * diyordu: kart, gönderinin imzalı CDN adresini oluşturulduğu an
 * kopyalıyor ve o adres birkaç günde ölüyor. İki katman sınanıyor:
 * okuma organik senkronun TAZE adresini tercih ediyor; o da yoksa görsel
 * ucu adresi kullanım anında Meta'dan alıp akıtıyor.
 */
let h: Harness;
const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';
const KART = 'bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb';
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, isOrgAdmin: true } as TenantContext;
const prisma = () => ({ withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) }) as unknown as PrismaService;
// Geçerli en küçük PNG imzası + IHDR başı: `goruBicimi` sihirli baytlara bakıyor.
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
afterEach(() => {
  vi.unstubAllGlobals();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

async function profil(tur: 'instagram_business' | 'youtube_channel') {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, sync_enabled, page_access_token_enc, updated_at)
     VALUES ($1,$2,$3,$4,$5,'ig-1','Sayfa',true,'\\x00',now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection, tur],
  );
}

async function kart(platform: 'meta' | 'google', adres: string | null) {
  await h.q(
    `INSERT INTO auto_boost_queue_items (id, org_id, client_id, platform, social_profile_id, external_id, title, thumbnail_url, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'m1','Başlık',$6,'pending',now(),now())`,
    [KART, IDS.org, IDS.client, platform, PROFIL, adres],
  );
}

function servis(organik: ReturnType<typeof vi.fn>) {
  const providers = { get: () => ({ organikGorselAdresi: organik }) } as unknown as ProviderRegistry;
  const crypto = { decrypt: () => 'sayfa-tokeni' } as unknown as CryptoService;
  const quota = { record: vi.fn() } as unknown as QuotaGuardService;
  return new BoostGorseliService(prisma(), providers, crypto, quota);
}

describe('okuma: organik senkronun taze adresi', () => {
  it('KRİTİK: organik gönderinin adresi kartın eski kopyasının ÖNÜNDE', async () => {
    await profil('instagram_business');
    await kart('meta', 'https://scontent.cdninstagram.com/eski.jpg?oe=OLDU');
    await h.q(
      `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id, media_type, message, thumbnail_url, published_at,
         impressions, reach, likes, comments, shares, saves, video_views, engagements, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,'m1','photo','x','https://scontent.cdninstagram.com/taze.jpg',now(),1,1,0,0,0,0,0,0,now())`,
      [IDS.org, IDS.client, PROFIL],
    );
    const l = await new AutoBoostReadService(prisma()).listQueue(CTX, IDS.client);
    expect(l.items.map((i) => i.thumbnailUrl)).toEqual(['https://scontent.cdninstagram.com/taze.jpg']);
  });

  it('organik satır yoksa kartın kendi adresi (boşa düşmez)', async () => {
    await profil('instagram_business');
    await kart('meta', 'https://scontent.cdninstagram.com/kart.jpg');
    const l = await new AutoBoostReadService(prisma()).listQueue(CTX, IDS.client);
    expect(l.items.map((i) => i.thumbnailUrl)).toEqual(['https://scontent.cdninstagram.com/kart.jpg']);
  });
});

describe('görsel ucu: kullanım anında tazele', () => {
  it('KRİTİK: Instagram kartında taze adresi Meta’dan alıp görseli akıtıyor; ikinci istek önbellekten', async () => {
    await profil('instagram_business');
    await kart('meta', null);
    const organik = vi.fn(async () => 'https://scontent.cdninstagram.com/yeni.png');
    const getir = vi.fn(async () => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } }));
    vi.stubGlobal('fetch', getir);
    const s = servis(organik);
    const g = await s.akit(CTX, KART);
    expect(g.mime).toBe('image/png');
    expect(organik).toHaveBeenCalledWith(expect.objectContaining({ externalId: 'm1', profileType: 'instagram_business', pageAccessToken: 'sayfa-tokeni' }));
    await s.akit(CTX, KART);
    expect(organik).toHaveBeenCalledTimes(1);
  });

  it('Meta düşerse 502 ve Meta’nın cümlesi (boş görsel değil)', async () => {
    await profil('instagram_business');
    await kart('meta', null);
    await expect(servis(vi.fn(async () => { throw new Error('(#100) media yok'); })).akit(CTX, KART)).rejects.toThrow('Görsel alınamadı: (#100) media yok');
  });

  it('YouTube kartı Meta’ya hiç sorulmuyor (adres kalıcı)', async () => {
    await profil('youtube_channel');
    await kart('google', 'https://i.ytimg.com/vi/x/hqdefault.jpg');
    const organik = vi.fn();
    await expect(servis(organik).akit(CTX, KART)).rejects.toThrow('kalıcı adreste');
    expect(organik).not.toHaveBeenCalled();
  });

  it('başka workspace’in kartı bulunamadı; platforma gidilmiyor', async () => {
    await profil('instagram_business');
    await kart('meta', null);
    const organik = vi.fn();
    await expect(servis(organik).akit({ ...CTX, clientIds: ['99999999-0000-4000-8000-000000000000'] } as TenantContext, KART)).rejects.toThrow('Kart bulunamadı');
    expect(organik).not.toHaveBeenCalled();
  });
});
