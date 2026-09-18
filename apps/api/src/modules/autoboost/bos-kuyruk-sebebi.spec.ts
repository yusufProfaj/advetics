import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { TenantContext } from '@advetics/shared';
import { AutoBoostReadService } from './autoboost-read.service';

/**
 * ═══ BOŞ KUYRUK NEDEN BOŞ ═══
 *
 * Ekran tek bir cümle yazıyordu: "yeni bir gönderi yayınlandığında kart
 * burada belirir". O cümle dört ayrı hâli aynı kefeye koyuyor ve üçünde
 * YANLIŞ; kullanıcının bildirdiği belirti de buydu: *"bazı şirketlerin
 * workspace'lerinde autoboost gelmiyor"*. Sebep ekranda yazmadığı için
 * teşhis kodda aranıyordu.
 */
let h: Harness;
let svc: AutoBoostReadService;

const PROFIL = 'aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();
  /*
   * `h.db` HARNESS'İN KENDİ PRISMA TAKLİDİ: `$queryRaw` gerçek PGlite'a
   * gidiyor. Sahte bir sorgu katmanı yazmak, sınanan şeyin SQL olduğu bir
   * testte sorguyu hiç koşturmamak olurdu.
   */
  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;
  svc = new AutoBoostReadService(prisma);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
});

async function sebep(): Promise<string | null> {
  const liste = await svc.listQueue(CTX, IDS.client);
  return liste.emptyReason;
}

describe('boş listenin sebebi', () => {
  it('KRİTİK: sayfa atanmamışsa BUNU söylüyor', async () => {
    expect(await sebep()).toContain('atanmamış');
  });

  it('KRİTİK: sayfa var ön ayar yoksa BUNU söylüyor', async () => {
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
         external_id, name, sync_enabled, updated_at)
       VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,now())`,
      [PROFIL, IDS.org, IDS.client, IDS.connection],
    );
    expect(await sebep()).toContain('ön ayar');
  });

  it('KRİTİK: ön ayar var gönderi çekilmemişse BUNU söylüyor', async () => {
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
         external_id, name, sync_enabled, updated_at)
       VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,now())`,
      [PROFIL, IDS.org, IDS.client, IDS.connection],
    );
    await h.q(
      `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id,
         enabled, budget_mode, daily_budget_micros, settings, updated_at)
       VALUES (gen_random_uuid(),$1,$2,'meta',NULL,true,'daily',50000000,'{}'::jsonb,now())`,
      [IDS.org, IDS.client],
    );
    expect(await sebep()).toContain('hiç gönderi çekilmemiş');
  });

  it('KRİTİK: her şey yerindeyse GENEL cümle', async () => {
    /*
     * Ters yön: her boş listeye "kurulum eksik" diyen bir kısayol, çalışan
     * bir kurulumda kullanıcıyı olmayan bir arızayı aramaya gönderirdi.
     */
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
         external_id, name, sync_enabled, updated_at)
       VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,now())`,
      [PROFIL, IDS.org, IDS.client, IDS.connection],
    );
    await h.q(
      `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id,
         enabled, budget_mode, daily_budget_micros, settings, updated_at)
       VALUES (gen_random_uuid(),$1,$2,'meta',NULL,true,'daily',50000000,'{}'::jsonb,now())`,
      [IDS.org, IDS.client],
    );
    await h.q(
      `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
         media_type, message, published_at, impressions, reach, likes, comments,
         shares, saves, video_views, engagements, updated_at)
       VALUES (gen_random_uuid(),$1,$2,$3,'p1','photo','x',now(),1,1,0,0,0,0,0,0,now())`,
      [IDS.org, IDS.client, PROFIL],
    );
    const s = await sebep();
    expect(s).toContain('Onay bekleyen içerik yok');
    expect(s).not.toContain('atanmamış');
  });
});
