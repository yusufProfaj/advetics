import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { CryptoService } from '../../crypto/crypto.service';
import type { AppConfig } from '../../config/configuration';
import type { TenantContext } from '@advetics/shared';
import { AutoBoostQueueService } from './autoboost-queue.service';
import { YouTubeSubscribeService } from './youtube-subscribe.service';
import type { YouTubeApiService, YouTubeSonVideolarSonucu } from './youtube-api.service';

/**
 * ═══ YOUTUBE KANALI WORKSPACE'E BAĞLANIYOR ═══
 *
 * Kullanıcının isteği: "nasıl instagram hesabı listelenebiliyorsa bunda da
 * youtube hesabı listelensin". Kanal artık havuza giriyor ve workspace'e
 * atanınca ÜÇ iş birden oluyor: sahiplik, hub aboneliği ve kanalın son
 * videolarının kuyruğa düşmesi.
 *
 * Üçüncüsü olmadan ilk kart, kanalın BİR SONRAKİ videosunu bekliyor: haftada
 * bir video yükleyen bir kanalda panel bir hafta boş duruyor ve kullanıcı
 * bunu "çalışmıyor" diye okuyor. Instagram tarafında bildirilen belirti
 * birebir buydu.
 */
let h: Harness;
let svc: YouTubeSubscribeService;
let videolar: YouTubeSonVideolarSonucu;
let fetchCagrilari: string[];

const PROFIL = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
const KANAL = 'UCaaaaaaaaaaaaaaaaaaaaaa';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

function video(id: string, gun: string) {
  return {
    id,
    channelId: KANAL,
    title: `Video ${id}`,
    publishedAt: new Date(gun),
    thumbnailUrl: `https://i.ytimg.com/${id}.jpg`,
  };
}

beforeAll(async () => {
  h = await createHarness();

  const prisma = {
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService;

  const kuyruk = new AutoBoostQueueService(
    h.db as unknown as PrismaAdminService,
    { decrypt: () => Buffer.from('x') } as unknown as CryptoService,
  );

  const config = {
    globalPrefix: 'api',
    platforms: {
      oauthRedirectBaseUrl: 'https://panel.example.com',
      youtube: { apiKey: 'test-key' },
    },
    encryption: { activeVersion: 1, keys: { 1: Buffer.alloc(32).toString('base64') } },
  } as unknown as AppConfig;

  const youtube = {
    listRecentVideos: async () => videolar,
  } as unknown as YouTubeApiService;

  svc = new YouTubeSubscribeService(
    config,
    prisma,
    h.db as unknown as PrismaAdminService,
    youtube,
    kuyruk,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  videolar = { durum: 'bulundu', videolar: [video('v1', '2026-09-10'), video('v2', '2026-09-12')] };

  /*
   * HUB ÇAĞRISI SAHTE. Gerçek fetch, testi ağa bağımlı yapardı; ayrıca
   * hub'a test aboneliği göndermek DIŞ BİR SİSTEME YAZMAK olurdu.
   */
  fetchCagrilari = [];
  vi.stubGlobal('fetch', async (url: unknown) => {
    fetchCagrilari.push(String(url));
    return new Response('ok', { status: 202 });
  });

  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type,
       external_id, name, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'youtube_channel',$5,'Kanal',false,now())`,
    [PROFIL, IDS.org, IDS.client, IDS.connection, KANAL],
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function abonelikSayisi(): Promise<number> {
  const r = await h.q<{ n: number }>(
    `SELECT count(*)::int AS n FROM auto_boost_subscriptions WHERE social_profile_id = $1`,
    [PROFIL],
  );
  return r[0]?.n ?? 0;
}

async function kartlar(): Promise<string[]> {
  const r = await h.q<{ external_id: string }>(
    `SELECT external_id FROM auto_boost_queue_items WHERE social_profile_id = $1
     ORDER BY external_id`,
    [PROFIL],
  );
  return r.map((x) => x.external_id);
}

describe('kanal workspace’e bağlanıyor', () => {
  it('KRİTİK: abonelik satırı açılıyor', async () => {
    await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(await abonelikSayisi()).toBe(1);
  });

  it('KRİTİK: son videolar kart olarak düşüyor — ilk kart bir sonraki videoyu BEKLEMİYOR', async () => {
    const sonuc = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(sonuc.kartlar).toBe(2);
    expect(await kartlar()).toEqual(['v1', 'v2']);
  });

  it('KRİTİK: hub’a abonelik isteği gidiyor', async () => {
    await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(fetchCagrilari.some((u) => u.includes('pubsubhubbub'))).toBe(true);
  });

  it('aynı video iki kez kart açmıyor', async () => {
    await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    const ikinci = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(ikinci.kartlar).toBe(0);
    expect(await kartlar()).toEqual(['v1', 'v2']);
  });

  it('KRİTİK: videolar çekilemezse abonelik YİNE kuruluyor ve sebep söyleniyor', async () => {
    /*
     * Tohumlama düşerse atamayı geri almak yanlış olurdu: abonelik kuruldu
     * ve bundan sonraki videolar gelecek. Sessizce yutmak ise kullanıcıya
     * boş bir panel ve hiçbir açıklama bırakırdı.
     */
    videolar = { durum: 'hata', message: 'YouTube API: kota doldu' };
    const sonuc = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(await abonelikSayisi()).toBe(1);
    expect(sonuc.kartlar).toBe(0);
    expect(sonuc.note).toContain('kota doldu');
  });

  it('kanalda hiç video yoksa bu AYRI bir cümle', async () => {
    // "Çekemedim" ile "hiç yok" farklı iş: birincisi arıza, ikincisi normal.
    videolar = { durum: 'bulunamadi' };
    const sonuc = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(sonuc.note).toContain('henüz yüklenmiş video yok');
  });

  it('KRİTİK: Meta sayfası bu yola giremiyor', async () => {
    /*
     * Meta sayfası için hub aboneliği kurmak, hiçbir zaman bildirim
     * gelmeyecek bir kayıt üretir ve panel onu "kurulu" gösterirdi.
     */
    await h.q(`UPDATE social_profiles SET profile_type = 'instagram_business' WHERE id = $1`, [
      PROFIL,
    ]);
    await expect(svc.kanaliBagla(CTX, PROFIL, IDS.client)).rejects.toThrow(
      /YouTube kanalı değil/,
    );
  });
});

describe('kanal workspace’ten çıkarılıyor', () => {
  it('KRİTİK: abonelik satırı siliniyor', async () => {
    await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    await svc.kanaliCoz(CTX, PROFIL);
    expect(await abonelikSayisi()).toBe(0);
  });

  it('KRİTİK: hub’a iptal isteği gidiyor', async () => {
    await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    fetchCagrilari = [];
    await svc.kanaliCoz(CTX, PROFIL);
    expect(fetchCagrilari.length).toBe(1);
  });

  it('aboneliği olmayan profilde sessizce geçiyor', async () => {
    await expect(svc.kanaliCoz(CTX, PROFIL)).resolves.toBeUndefined();
  });
});

describe('şirketler arası atama', () => {
  /*
   * "Tüm şirketler" modunda `ctx.orgId` EV ŞİRKETİ olarak kalıyor ama kanal,
   * atandığı workspace'in şirketine taşınıyor. Abonelik ve kartlar `ctx`ten
   * okunsaydı yabancı anahtar TUTARDI (ikisi de tek başına geçerli) ama RLS
   * o satırları workspace'in kullanıcısına HİÇ göstermezdi: kart gelir,
   * kimse göremez — bu projenin en sevmediği hata türü.
   */
  const ORG_KARDES = 'cccccccc-3333-3333-3333-cccccccccccc';
  const CLIENT_KARDES = 'dddddddd-3333-3333-3333-dddddddddddd';

  it('KRİTİK: abonelik ve kartlar PROFİLİN şirketine yazılıyor', async () => {
    await h.q(
      `INSERT INTO organizations (id, name, slug, updated_at)
       VALUES ($1, 'Kardeş', 'kardes', now())`,
      [ORG_KARDES],
    );
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Kardeş Workspace', 'kardes-ws', now())`,
      [CLIENT_KARDES, ORG_KARDES],
    );
    /*
     * ATAMA BU İKİSİNİ BİRLİKTE YAZIYOR (`assignSocialProfile` →
     * `musteriOrgId`); burada o sonuç kurulu kabul ediliyor. Tek başına
     * `org_id` yazmak kompozit anahtarı ihlal ediyor — kuralın ta kendisi.
     */
    await h.q(`UPDATE social_profiles SET org_id = $1, client_id = $2 WHERE id = $3`, [
      ORG_KARDES,
      CLIENT_KARDES,
      PROFIL,
    ]);

    await svc.kanaliBagla(CTX, PROFIL, CLIENT_KARDES);

    const [abonelik] = await h.q<{ org_id: string }>(
      `SELECT org_id FROM auto_boost_subscriptions WHERE social_profile_id = $1`,
      [PROFIL],
    );
    const [kart] = await h.q<{ org_id: string }>(
      `SELECT org_id FROM auto_boost_queue_items WHERE social_profile_id = $1 LIMIT 1`,
      [PROFIL],
    );
    expect(abonelik?.org_id).toBe(ORG_KARDES);
    expect(kart?.org_id).toBe(ORG_KARDES);
  });
});
