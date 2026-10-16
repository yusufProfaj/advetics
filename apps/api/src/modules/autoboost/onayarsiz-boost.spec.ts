import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AutoBoostLaunchService } from './autoboost-launch.service';
import { AutoBoostReadService } from './autoboost-read.service';

/**
 * ═══ ÖN AYARSIZ INSTAGRAM BOOST'U (kullanıcı, 2026-10-16) ═══
 *
 * "Boostları çekmek için ön ayar gerekmesin. Ön ayar yapılmamışsa boost
 * düğmesine basınca ayarlar manuel açılsın." Eskiden ön ayarsız kart hiç
 * yayınlanamıyordu (kart da hiç üretilmiyordu). Artık:
 *   - kartın engeli yok (`blockedReason` null), panel ayar penceresini açıyor;
 *   - bütçe + süre + kitle kartta girilmeden yayın REDDEDİLİYOR ve neden
 *     yazıyor (ön ayarın yerine değer TAHMİN edilmiyor);
 *   - girilince boost satırı TAM O değerlerle açılıyor.
 * GERÇEK SORGU (PGlite); Meta tarafı yürütücü taklidi.
 */
let h: Harness;
let svc: AutoBoostLaunchService;
let oku: AutoBoostReadService;
let createOneApproved: ReturnType<typeof vi.fn>;

const PROFIL = 'aaaaaaaa-3333-4333-8333-aaaaaaaaaaaa';
const GONDERI = 'bbbbbbbb-3333-4333-8333-bbbbbbbbbbbb';
const KART = 'cccccccc-3333-4333-8333-cccccccccccc';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const ELLE = {
  budget: { mode: 'lifetime' as const, amount: '300', durationDays: 5 },
  targeting: { savedAudienceId: null, locations: [{ key: 'TR', type: 'country' as const }], ageMin: 25, ageMax: 45, genders: 'female' as const },
};

beforeAll(async () => {
  h = await createHarness();
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  createOneApproved = vi.fn();
  svc = new AutoBoostLaunchService(
    prisma,
    { createOneApproved } as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    null as never,
    { isEnabled: true, acquire: async () => ({ allowed: true }) } as never,
  );
  oku = new AutoBoostReadService(prisma);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  createOneApproved.mockReset().mockResolvedValue({ ok: true });
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, linked_ad_account_id, updated_at)
     VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Eren Altay',true,$5,now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, message, published_at, impressions, reach, likes, comments,
       shares, saves, video_views, engagements, updated_at)
     VALUES ($1,$2,$3,$4,'m-1','photo','Yeni sezon','2026-10-10T10:00:00Z',100,90,5,1,0,0,0,6,now())`,
    [GONDERI, IDS.org, IDS.client, PROFIL],
  );
  await h.q(
    `INSERT INTO auto_boost_queue_items (id, org_id, client_id, platform, social_profile_id,
       external_id, title, media_type, published_at, updated_at)
     VALUES ($1,$2,$3,'meta',$4,'m-1','Yeni sezon','photo','2026-10-10T10:00:00Z',now())`,
    [KART, IDS.org, IDS.client, PROFIL],
  );
});

describe('ön ayarsız Instagram kartı', () => {
  it('KRİTİK: kartın engeli yok, ön ayarı yok (panel ayar penceresini açar)', async () => {
    const liste = await oku.listQueue(CTX, IDS.client);
    const kart = liste.items.find((k) => k.id === KART)!;
    expect(kart.preset).toBeNull();
    expect(kart.blockedReason).toBeNull();
  });

  it('KRİTİK: ayarlar girilmeden yayın reddedilir, neden yazar, kart beklemede kalır', async () => {
    await expect(svc.decide(CTX, KART, true)).rejects.toThrow(/bütçe, süre ve kitleyi/);
    await expect(svc.decide(CTX, KART, true, { budget: ELLE.budget })).rejects.toThrow(/bütçe, süre ve kitleyi/);
    const [k] = await h.q<{ status: string }>(`SELECT status FROM auto_boost_queue_items WHERE id = $1`, [KART]);
    expect(k!.status).toBe('pending');
    expect(createOneApproved).not.toHaveBeenCalled();
  });

  it('KRİTİK: girilen bütçe, süre ve kitleyle boost açılır', async () => {
    const r = await svc.decide(CTX, KART, true, ELLE);
    expect(r.status).toBe('launched');
    const [b] = await h.q<{ budget_mode: string; total_budget_micros: string; duration_days: number; targeting: { age_min: number; age_max: number; genders: number[]; geo_locations: { countries: string[] } } }>(
      `SELECT budget_mode, total_budget_micros::text, duration_days, targeting FROM boosts WHERE organic_post_id = $1`,
      [GONDERI],
    );
    expect(b).toMatchObject({ budget_mode: 'lifetime', total_budget_micros: '300000000', duration_days: 5 });
    expect(b!.targeting.age_min).toBe(25);
    expect(b!.targeting.age_max).toBe(45);
    expect(b!.targeting.genders).toEqual([2]);
    expect(b!.targeting.geo_locations.countries).toEqual(['TR']);
  });
});
