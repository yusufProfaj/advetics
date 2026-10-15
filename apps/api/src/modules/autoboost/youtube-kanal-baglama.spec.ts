import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AJANS_UST_HESAP, createHarness, seedAjans, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { CryptoService } from '../../crypto/crypto.service';
import type { AppConfig } from '../../config/configuration';
import type { TenantContext } from '@advetics/shared';
import { AutoBoostQueueService } from './autoboost-queue.service';
import { YouTubeSubscribeService } from './youtube-subscribe.service';
import type { AssetsService } from '../assets/assets.service';
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

/**
 * VARLIK YÜKLEME TAKLİDİ — gerçek `assets` satırı yazıyor: marka profilinin
 * `logo_asset_id` yabancı anahtarı gerçekten sınansın. Biçim ve boyut
 * doğrulaması `AssetsService`in kendi testlerinde; burada sınanan kanal
 * görselinin o yola GİTTİĞİ ve sonucun logoya yazıldığı.
 */
const varliklar = {
  upload: vi.fn(async (c: TenantContext, p: { clientId: string; kind: string; fileName: string; mimeType: string; bytes: Buffer; name?: string }) => {
    const [r] = await h.q<{ id: string }>(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, 800, 800, 'k', md5(random()::text) || md5(random()::text), now()) RETURNING id::text AS id`,
      [c.orgId, p.clientId, p.kind, p.name ?? p.fileName, p.fileName, p.mimeType, p.bytes.length],
    );
    return { asset: { id: r!.id }, duplicate: false };
  }),
};

/** JPEG sihirli baytları: `turuAnla` biçimi gövdeden okuyor. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const KANAL_GORSELI = 'https://yt3.ggpht.com/kanal-gorseli=s800-c-k-c0x00ffffff-no-rj';

const PROFIL = 'aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa';
const KANAL = 'UCaaaaaaaaaaaaaaaaaaaaaa';
const YENI_KANAL = 'UCbbbbbbbbbbbbbbbbbbbbbb';

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
    getChannel: async () => ({
      durum: 'bulundu',
      kanal: { channelId: YENI_KANAL, title: 'COORDINAT', thumbnailUrl: null },
    }),
  } as unknown as YouTubeApiService;

  svc = new YouTubeSubscribeService(
    config,
    prisma,
    h.db as unknown as PrismaAdminService,
    youtube,
    kuyruk,
    varliklar as unknown as AssetsService,
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

describe('kanal ekleme: Google bağlantısı ATANMIŞ HESAPTAN bulunuyor', () => {
  /*
   * Ajansın Google kimliği ajans şirketinde bir kez bağlanıyor, hesaplar
   * müşteri şirketlerine ATANIYOR. Kanal ekleme bağlantıyı yalnız aktif
   * şirkette arıyordu ve ajans havuzundan hesap almış her müşteride
   * "Önce Google Ads bağlantısı kurulmalı" diyordu; aynı ekrandaki öneri
   * kartı o hesabın videolarını sayarken (canlı, Coordinat Yapı, 2026-10-15).
   */
  const ORG_MUSTERI = 'eeeeeeee-4444-4444-4444-eeeeeeeeeeee';
  const CLIENT_MUSTERI = 'ffffffff-4444-4444-4444-ffffffffffff';
  const GOOGLE_BAGLANTI = '99999999-4444-4444-4444-999999999999';
  const GOOGLE_HESAP = '88888888-4444-4444-4444-888888888888';
  // AJANS KULLANICISI müşteri şirketinde: üst hesabın üyesi.
  const MUSTERI_CTX = {
    ...CTX,
    orgId: ORG_MUSTERI,
    clientIds: [CLIENT_MUSTERI],
    activeClientId: CLIENT_MUSTERI,
    managerAccountId: AJANS_UST_HESAP,
  } as TenantContext;

  async function musteriKur(opts: { hesap: boolean; baglantiDurumu?: string }): Promise<void> {
    await seedAjans(h);
    await h.q(
      `INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Coordinat', 'coordinat', now())`,
      [ORG_MUSTERI],
    );
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ($1, $2, 'Coordinat Yapı', 'coordinat-ws', now())`,
      [CLIENT_MUSTERI, ORG_MUSTERI],
    );
    // AJANSIN Google bağlantısı: ajans şirketinde (IDS.org), müşteride DEĞİL.
    await h.q(
      `INSERT INTO platform_connections
         (id, org_id, platform, status, external_user_id, account_label,
          access_token_enc, granted_scopes, connected_by_user_id, updated_at)
       VALUES ($1, $2, 'google', $3, 'g1', 'Ajans Google', '\\x00', '{}', $4, now())`,
      [GOOGLE_BAGLANTI, IDS.org, opts.baglantiDurumu ?? 'active', IDS.user],
    );
    if (opts.hesap) {
      await h.q(
        `INSERT INTO ad_accounts
           (id, org_id, client_id, connection_id, platform, external_id, name, currency,
            timezone, sync_enabled, updated_at)
         VALUES ($1, $2, $3, $4, 'google', '5161746317', 'Coordinat Ads', 'TRY',
                 'Europe/Istanbul', true, now())`,
        [GOOGLE_HESAP, ORG_MUSTERI, CLIENT_MUSTERI, GOOGLE_BAGLANTI],
      );
    }
  }

  it('KRİTİK: workspace’in şirketinde bağlantı yokken atanmış hesabın bağlantısına iliştiriliyor', async () => {
    await musteriKur({ hesap: true });

    const sonuc = await svc.addChannel(MUSTERI_CTX, {
      clientId: CLIENT_MUSTERI,
      channelInput: '@coordinat.xyz1',
    });

    const [profil] = await h.q<{ connection_id: string; org_id: string; client_id: string }>(
      `SELECT connection_id, org_id, client_id FROM social_profiles WHERE id = $1`,
      [sonuc.socialProfileId],
    );
    expect(profil?.connection_id).toBe(GOOGLE_BAGLANTI);
    // Şirket WORKSPACE'İN şirketi; ev şirketi değil.
    expect(profil?.org_id).toBe(ORG_MUSTERI);
    expect(profil?.client_id).toBe(CLIENT_MUSTERI);
    expect(sonuc.assigned).toBe(true);
  });

  it('KRİTİK: "tüm şirketler" modunda (ctx ev şirketi) profil yine workspace’in şirketine yazılıyor', async () => {
    await musteriKur({ hesap: true });

    // CTX.orgId = ajans (ev şirketi), workspace müşteri şirketinde.
    const sonuc = await svc.addChannel(
      { ...CTX, clientIds: [IDS.client, CLIENT_MUSTERI], managerAccountId: AJANS_UST_HESAP } as TenantContext,
      { clientId: CLIENT_MUSTERI, channelInput: '@coordinat.xyz1' },
    );
    const [profil] = await h.q<{ org_id: string }>(
      `SELECT org_id FROM social_profiles WHERE id = $1`,
      [sonuc.socialProfileId],
    );
    const [abonelik] = await h.q<{ org_id: string }>(
      `SELECT org_id FROM auto_boost_subscriptions WHERE social_profile_id = $1`,
      [sonuc.socialProfileId],
    );
    expect(profil?.org_id).toBe(ORG_MUSTERI);
    expect(abonelik?.org_id).toBe(ORG_MUSTERI);
  });

  it('KRİTİK: PANELİN GERÇEK AKIŞI — havuza eklemede bağlam workspace’i bağlantıyı buluyor, atama yapılmıyor', async () => {
    /*
     * Kanal bulucu önce clientId'siz havuza ekliyor, sonra ayrı istekle
     * atıyor. Yalnız clientId'li yolu düzeltmek kullanıcının bastığı düğmeyi
     * düzeltmiyordu; bağlam alanı olmadan bu çağrı yine reddedilirdi.
     */
    await musteriKur({ hesap: true });

    const sonuc = await svc.addChannel(MUSTERI_CTX, {
      clientId: null,
      baglamClientId: CLIENT_MUSTERI,
      channelInput: '@coordinat.xyz1',
    });

    const [profil] = await h.q<{ connection_id: string; client_id: string | null }>(
      `SELECT connection_id, client_id FROM social_profiles WHERE id = $1`,
      [sonuc.socialProfileId],
    );
    expect(profil?.connection_id).toBe(GOOGLE_BAGLANTI);
    // Bağlam ATAMA DEĞİL: kanal havuzda, abonelik yok.
    expect(profil?.client_id).toBeNull();
    expect(sonuc.assigned).toBe(false);
    const [abonelik] = await h.q<{ n: number }>(
      `SELECT count(*)::int AS n FROM auto_boost_subscriptions WHERE social_profile_id = $1`,
      [sonuc.socialProfileId],
    );
    expect(abonelik?.n).toBe(0);
  });

  it('KRİTİK: üst hesap üyeliği OLMAYAN şirket admini ajansın bağlantısına kanal iliştiremiyor (K4)', async () => {
    await musteriKur({ hesap: true });
    const sirketAdmini = { ...MUSTERI_CTX, managerAccountId: null } as unknown as TenantContext;
    await expect(
      svc.addChannel(sirketAdmini, { clientId: null, baglamClientId: CLIENT_MUSTERI, channelInput: '@coordinat.xyz1' }),
    ).rejects.toThrow(/ajansın bağlantısından geliyor/);
    await expect(
      svc.addChannel(sirketAdmini, { clientId: CLIENT_MUSTERI, channelInput: '@coordinat.xyz1' }),
    ).rejects.toThrow(/ajansın bağlantısından geliyor/);
    const [n] = await h.q<{ n: number }>(`SELECT count(*)::int AS n FROM social_profiles WHERE external_id = $1`, [YENI_KANAL]);
    expect(n?.n).toBe(0);
  });

  it('bağlamsız havuz eklemesi (Ayarlar ekranı) eski kuralla reddediliyor', async () => {
    await musteriKur({ hesap: true });
    await expect(
      svc.addChannel(MUSTERI_CTX, { clientId: null, channelInput: '@coordinat.xyz1' }),
    ).rejects.toThrow(/Önce Google Ads bağlantısı kurulmalı/);
  });

  it('workspace’e Google hesabı atanmamışsa sebep workspace cümlesiyle söyleniyor', async () => {
    await musteriKur({ hesap: false });
    await expect(
      svc.addChannel(MUSTERI_CTX, { clientId: CLIENT_MUSTERI, channelInput: '@coordinat.xyz1' }),
    ).rejects.toThrow(/atanmış etkin bir Google Ads hesabı yok/);
  });

  it('atanmış hesabın bağlantısı kopmuşsa ona iliştirilmiyor', async () => {
    await musteriKur({ hesap: true, baglantiDurumu: 'revoked' });
    await expect(
      svc.addChannel(MUSTERI_CTX, { clientId: CLIENT_MUSTERI, channelInput: '@coordinat.xyz1' }),
    ).rejects.toThrow(/atanmış etkin bir Google Ads hesabı yok/);
  });
});

describe('kanal görseli marka logosu oluyor (2026-10-15)', () => {
  /*
   * Kullanıcı: "youtube kanalını eklediğim halde logoyu çekmedi". Marka
   * logosu yalnız elle yükleniyordu; Google'ın YouTube reklamı logosuz
   * kurulmuyor. Logo boşsa kanalın görseli logo yapılıyor.
   */
  beforeEach(async () => {
    varliklar.upload.mockClear();
    await h.q(`UPDATE social_profiles SET picture_url = $1 WHERE id = $2`, [KANAL_GORSELI, PROFIL]);
    vi.stubGlobal('fetch', async (url: unknown) => {
      fetchCagrilari.push(String(url));
      return String(url).startsWith('https://yt3.ggpht.com/') ? new Response(JPEG, { status: 200 }) : new Response('ok', { status: 202 });
    });
  });

  const logo = async () =>
    (await h.q<{ logo_asset_id: string | null }>(`SELECT logo_asset_id::text FROM client_profiles WHERE client_id = $1`, [IDS.client]))[0]?.logo_asset_id ?? null;

  it('KRİTİK: logo boşsa kanal görseli LOGO türünde yükleniyor ve marka logosu oluyor', async () => {
    const r = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(varliklar.upload).toHaveBeenCalledTimes(1);
    const [, girdi] = varliklar.upload.mock.calls[0]!;
    expect(girdi).toMatchObject({ clientId: IDS.client, kind: 'logo', mimeType: 'image/jpeg' });
    const asset = (await varliklar.upload.mock.results[0]!.value) as { asset: { id: string } };
    expect(await logo()).toBe(asset.asset.id);
    expect(r.note).toContain('Kanal görseli marka logosu yapıldı.');
    // Atama da tam: abonelik kuruldu.
    expect(await abonelikSayisi()).toBe(1);
  });

  it('KRİTİK: VAR OLAN LOGOYA DOKUNULMUYOR (kullanıcının seçtiği ezilmez)', async () => {
    const [eski] = await h.q<{ id: string }>(
      `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'logo', 'Elle', 'elle.png', 'image/png', 1, 512, 512, 'k', md5('a') || md5('b'), now()) RETURNING id::text AS id`,
      [IDS.org, IDS.client],
    );
    await h.q(`INSERT INTO client_profiles (id, org_id, client_id, logo_asset_id, updated_at) VALUES (gen_random_uuid(), $1, $2, $3, now())`, [IDS.org, IDS.client, eski!.id]);
    const r = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(varliklar.upload).not.toHaveBeenCalled();
    expect(await logo()).toBe(eski!.id);
    expect(r.note).not.toContain('logo');
  });

  it('KRİTİK: beyaz liste dışındaki adres İNDİRİLMİYOR; atama yine tamam ve sebep yazılıyor', async () => {
    await h.q(`UPDATE social_profiles SET picture_url = 'https://kotu.example.com/a.jpg' WHERE id = $1`, [PROFIL]);
    const r = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(fetchCagrilari.some((u) => u.includes('kotu.example.com'))).toBe(false);
    expect(varliklar.upload).not.toHaveBeenCalled();
    expect(r.note).toContain('logo olarak alınamadı');
    expect(await abonelikSayisi()).toBe(1);
  });

  it('yükleme reddederse (ör. çok küçük görsel) atama bozulmuyor, sebep nota giriyor', async () => {
    varliklar.upload.mockRejectedValueOnce(new Error('Logo en az 128 piksel olmalı (yüklenen: 88×88).'));
    const r = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(r.note).toContain('128 piksel');
    expect(await logo()).toBeNull();
    expect(await abonelikSayisi()).toBe(1);
  });

  it('videolar çekilemese de logo deneniyor (üç dönüşün hepsinde)', async () => {
    videolar = { durum: 'hata', message: 'kota doldu' };
    const r = await svc.kanaliBagla(CTX, PROFIL, IDS.client);
    expect(r.note).toContain('kota doldu');
    expect(r.note).toContain('marka logosu yapıldı');
  });
});
