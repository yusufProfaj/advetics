import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { CryptoService } from '../../crypto/crypto.service';
import type { SyncQueueService } from '../../queue/sync-queue.service';
import type { TenantContext } from '@advetics/shared';
import { AutoBoostQueueService } from './autoboost-queue.service';
import { GecmisIcerikService } from './gecmis-icerik.service';
import type { YouTubeApiService, YouTubeSonVideolarSonucu } from './youtube-api.service';

/**
 * ═══ GEÇMİŞ İÇERİK DÜĞMESİ ═══
 *
 * Kart üretiminin iki otomatik yolu da TEK SEFERLİKTİ: Instagram'da ön
 * ayarın tohum damgası, YouTube'da kanalın atanma anı. Koşullardan biri o an
 * yerinde değilse fırsat harcanıyor ve kullanıcının elinde hiçbir düğme
 * kalmıyordu. Üretimde bildirilen hâl birebir buydu: bir workspace'te
 * YouTube kartları geldi, Instagram kartları gelmedi.
 */
let h: Harness;
let svc: GecmisIcerikService;
let videolar: YouTubeSonVideolarSonucu;
let kuyrukIsleri: Array<Record<string, unknown>>;

const SAYFA = 'aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa';
const KANAL_PROFIL = 'bbbbbbbb-4444-4444-4444-bbbbbbbbbbbb';
const KANAL_ID = 'UCbbbbbbbbbbbbbbbbbbbbbb';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

beforeAll(async () => {
  h = await createHarness();

  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;

  const kuyruk = new AutoBoostQueueService(
    h.db as unknown as PrismaAdminService,
    { decrypt: () => Buffer.from('x') } as unknown as CryptoService,
  );

  const youtube = { listRecentVideos: async () => videolar } as unknown as YouTubeApiService;

  const sync = {
    enqueue: (p: Record<string, unknown>) => {
      kuyrukIsleri.push(p);
      return Promise.resolve({ enqueued: true });
    },
  } as unknown as SyncQueueService;

  svc = new GecmisIcerikService(prisma, kuyruk, youtube, sync);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  kuyrukIsleri = [];
  videolar = {
    durum: 'bulundu',
    videolar: [
      {
        id: 'v1',
        channelId: KANAL_ID,
        title: 'Video',
        publishedAt: new Date('2026-08-01'),
        thumbnailUrl: null,
      },
    ],
  };
});

async function sayfaEkle(): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'instagram_business','ig-1','Sayfa',true,now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection],
  );
}

async function kanalEkle(): Promise<void> {
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'youtube_channel',$5,'Kanal',false,now())`,
    [KANAL_PROFIL, IDS.org, IDS.client, IDS.connection, KANAL_ID],
  );
}

async function onAyar(platform: 'meta' | 'google'): Promise<void> {
  const ayar =
    platform === 'meta'
      ? { platform: 'meta', objective: 'engagement', ageMin: 18, ageMax: 65, genders: 'all', locations: [], interests: [] }
      : { platform: 'google', objective: 'views', locations: [], keywords: [] };
  await h.q(
    `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, enabled, budget_mode,
       daily_budget_micros, duration_days, settings, created_at, seed_at, updated_at)
     VALUES (gen_random_uuid(),$1,$2,$3,true,'daily',50000000,3,$4,
             '2026-09-01T00:00:00Z', now(), now())`,
    [IDS.org, IDS.client, platform, JSON.stringify(ayar)],
  );
}

async function gonderi(externalId: string, gun: string): Promise<void> {
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id,
       media_type, published_at, updated_at)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,'photo',$5,now())`,
    [IDS.org, IDS.client, SAYFA, externalId, gun],
  );
}

async function kartlar(): Promise<string[]> {
  const r = await h.q<{ external_id: string }>(
    `SELECT external_id FROM auto_boost_queue_items ORDER BY external_id`,
  );
  return r.map((x) => x.external_id);
}

describe('geçmiş içerik çekimi', () => {
  it('KRİTİK: ön ayardan ÖNCEKİ Instagram gönderileri karta dönüyor', async () => {
    await sayfaEkle();
    await onAyar('meta');
    await gonderi('g-1', '2026-08-01T10:00:00Z');
    await gonderi('g-2', '2026-08-02T10:00:00Z');

    const sonuc = await svc.cek(CTX, IDS.client);

    expect(sonuc.kartlar).toBe(2);
    expect(await kartlar()).toEqual(['g-1', 'g-2']);
  });

  it('KRİTİK: arşiv tazelensin diye süpürme de kuyruğa giriyor', async () => {
    /*
     * Arşiv penceresi 45 gün ve süpürme saatte dört kez koşuyor; kullanıcı
     * düğmeye bastığında arşiv bayat olabilir. İşin sonunda kart üretimi
     * yeniden koşuyor, yani yeni gelen gönderiler kendiliğinden karta
     * dönüyor.
     */
    await sayfaEkle();
    await onAyar('meta');

    await svc.cek(CTX, IDS.client);

    expect(kuyrukIsleri).toHaveLength(1);
    expect(kuyrukIsleri[0]).toMatchObject({
      jobType: 'organic_posts',
      socialProfileId: SAYFA,
      interactive: true,
    });
  });

  it('KRİTİK: YouTube kanalının son videoları da geliyor', async () => {
    await kanalEkle();
    await onAyar('google');

    const sonuc = await svc.cek(CTX, IDS.client);

    expect(sonuc.kartlar).toBe(1);
    expect(await kartlar()).toEqual(['v1']);
  });

  it('KRİTİK: KANAL İÇİN SÜPÜRME KUYRUĞA GİRMİYOR', async () => {
    /*
     * Organik süpürme Meta uçlarını çağırıyor; kanal oraya düştüğünde iş
     * KALICI olarak düşüyor ve panelde sebebi yazmayan başarısız bir iş
     * kalıyor.
     */
    await kanalEkle();
    await onAyar('google');

    await svc.cek(CTX, IDS.client);

    expect(kuyrukIsleri).toEqual([]);
  });

  it('iki mecra birlikte çalışıyor', async () => {
    await sayfaEkle();
    await kanalEkle();
    await onAyar('meta');
    await onAyar('google');
    await gonderi('g-1', '2026-08-01T10:00:00Z');

    const sonuc = await svc.cek(CTX, IDS.client);

    expect(sonuc.kartlar).toBe(2);
    expect(await kartlar()).toEqual(['g-1', 'v1']);
  });

  it('KRİTİK: hiç hesap atanmamışsa SEBEBİ söyleniyor', async () => {
    const sonuc = await svc.cek(CTX, IDS.client);

    expect(sonuc.kartlar).toBe(0);
    expect(sonuc.notlar.join(' ')).toContain('atanmamış');
  });

  it('KRİTİK: ön ayar yoksa SEBEBİ söyleniyor', async () => {
    // Bütçesi bilinmeyen kart onaylanamaz; "0 kart" demek kullanıcıyı sebebi
    // kendi kurulumunda aramaya gönderirdi.
    await sayfaEkle();
    await gonderi('g-1', '2026-08-01T10:00:00Z');

    const sonuc = await svc.cek(CTX, IDS.client);

    expect(sonuc.notlar.join(' ')).toContain('ön ayarı yok');
  });

  it('KRİTİK: video çekimi düşerse SEBEBİ taşınıyor', async () => {
    await kanalEkle();
    await onAyar('google');
    videolar = { durum: 'hata', message: 'YouTube API: kota doldu' };

    const sonuc = await svc.cek(CTX, IDS.client);

    expect(sonuc.notlar.join(' ')).toContain('kota doldu');
  });

  it('ikinci basış mükerrer kart açmıyor', async () => {
    await sayfaEkle();
    await onAyar('meta');
    await gonderi('g-1', '2026-08-01T10:00:00Z');

    await svc.cek(CTX, IDS.client);
    const ikinci = await svc.cek(CTX, IDS.client);

    expect(ikinci.kartlar).toBe(0);
    expect(await kartlar()).toEqual(['g-1']);
  });
});

describe('modül kaydı', () => {
  /*
   * NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR: `nest build`
   * başarılı olur, bağımlılık grafiği çözülemez ve hata deploy'un ortasında
   * görünür. Depoda grafiği ayağa kaldıran bir test yok, o yüzden kayıt
   * kaynak taramasıyla kilitleniyor.
   */
  const MODUL = readFileSync(join(__dirname, 'autoboost.module.ts'), 'utf8');

  it('tarama boşa düşmüyor', () => {
    expect(MODUL).toContain('providers:');
  });

  it('KRİTİK: servis sağlayıcı listesinde ve import ediliyor', () => {
    expect(MODUL).toContain("import { GecmisIcerikService } from './gecmis-icerik.service';");
    const dizi = /providers:\s*\[([^\]]*)\]/.exec(MODUL)?.[1] ?? '';
    expect(dizi).toContain('GecmisIcerikService');
  });
});
