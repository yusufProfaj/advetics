import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { AJANS_UST_HESAP, createHarness, IDS, seedAjans, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { KurulumService } from '../kurulum/kurulum.service';
import { ConnectionsService } from './connections.service';
import { eksikKokler, kimlikKarari } from './baglanti-kimligi';
import type { OAuthTokens } from './provider.types';
import { GOOGLE_OLCUM_SCOPES } from './providers/google.provider';

/**
 * ═══ "ÖLÇÜM İZİNLERİNİ VER" HEDEF BAĞLANTIYI TAZELER — 2026-10-13 ÜRETİMİ ═══
 *
 * Belirti (kullanıcı): "analytics için bağlantı kuruyorum fakat olmuyor".
 * Ölçülen: ajansın Google bağlantısı ajans şirketinde ve yalnız `adwords`
 * taşıyor; kurulum workspace'in atanmış hesabının bağlantısını, yani onu
 * seçiyor. Kullanıcı müşteri şirketinden izin verince dönüş `başlatanın
 * şirketi + kimlik` ile upsert etti: tekil anahtar şirket başına olduğu ve
 * ajansın kimliği müşteri uzayında (`9608136521`), yeninin sub uzayında
 * (`1033…`) yazıldığı için eşleşmedi, müşteri şirketinde YENİ bağlantı
 * açıldı ve keşif ajans havuzunu oraya kopyaladı. İzin o kopyada kaldı,
 * kurulum hâlâ ajansın satırını okudu: sonsuz döngü.
 *
 * Gerçek veritabanı (PGlite): sınanan şey hangi SATIRIN yazıldığı.
 */
const MUSTERI_ORG = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const MUSTERI_WS = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const AJANS_KIMLIK = '9608136521';
const ADWORDS = 'https://www.googleapis.com/auth/adwords';
const META = { ip: null, userAgent: null, requestId: 'test' };

let h: Harness;
let svc: ConnectionsService;
let tokenlar: OAuthTokens;
const audit = { recordUnauthenticated: vi.fn().mockResolvedValue(undefined), record: vi.fn() };

const ajansKisisi = (ek: Partial<OAuthTokens> = {}): OAuthTokens => ({
  accessToken: 'yeni-erisim',
  refreshToken: 'yeni-yenileme',
  expiresAt: new Date(Date.now() + 3_600_000),
  grantedScopes: [ADWORDS, ...GOOGLE_OLCUM_SCOPES],
  // ÜRETİMDEKİ HÂL: yeni token sub uzayında, kayıt müşteri uzayında.
  externalUserId: '103389823382444834376',
  kisiKimligi: '103389823382444834376',
  erisilebilirHesaplar: ['1112223333', AJANS_KIMLIK],
  accountLabel: 'Google Ads',
  ...ek,
});

const sayi = async (sql: string, p: unknown[] = []) => Number((await h.q<{ n: number }>(sql, p))[0]!.n);
const ajansKapsamlari = async () =>
  (await h.q<{ granted_scopes: string[] }>(`SELECT granted_scopes FROM platform_connections WHERE id = $1`, [IDS.connection]))[0]!.granted_scopes;

/** Panelin yazdığı state satırının aynısı; ham değeri döndürür. */
async function state(o: { hedef: string | null; olcum: boolean }): Promise<string> {
  const ham = `ham-${Math.random()}`;
  await h.q(
    `INSERT INTO oauth_states (id, org_id, client_id, platform, token_hash, redirect_to, requested_scopes,
                               target_connection_id, created_by_user_id, expires_at)
     VALUES (gen_random_uuid(), $1, NULL, 'google', $2, '/marka-merkezi?musteri=x&bolum=kurulum', $3, $4, $5, now() + interval '10 minutes')`,
    [MUSTERI_ORG, createHash('sha256').update(ham).digest('hex'), o.olcum ? [ADWORDS, ...GOOGLE_OLCUM_SCOPES] : [ADWORDS], o.hedef, IDS.user],
  );
  return ham;
}

const sorgu = (yol: string) => new URL(yol, 'https://x.test').searchParams;

/**
 * ═══ YÖNETİM İSTEMCİSİNİN (BYPASSRLS) BU YOLDA KULLANDIĞI METOTLAR ═══
 *
 * Koşum ortamı tam bir Prisma taklidi taşımıyor ve taşımamalı. Dönüş yolu
 * altı metot kullanıyor; her biri GERÇEK SQL ile ve servisin istediği
 * alanlarla yazıldı — dizi taklidi olsaydı "hangi satır yazıldı" sorusu
 * taklidin kendisini sınardı. Bilinmeyen bir `where` biçimi FIRLATIYOR:
 * servis başka bir sorgu kurmaya başlarsa test sessizce yanlış satırı
 * okumasın.
 */
function yonetimIstemcisi(hh: Harness) {
  const q = hh.q;
  const baglanti = (r: Record<string, unknown>) => ({
    id: r.id,
    orgId: r.org_id,
    clientId: r.client_id,
    platform: r.platform,
    externalUserId: r.external_user_id,
  });
  return {
    $queryRaw: hh.db.$queryRaw,
    $executeRaw: hh.db.$executeRaw,
    oAuthState: {
      findUnique: async ({ where }: { where: { tokenHash: string } }) => {
        const [r] = await q<Record<string, unknown>>(`SELECT * FROM oauth_states WHERE token_hash = $1`, [where.tokenHash]);
        return r
          ? {
              id: r.id,
              orgId: r.org_id,
              clientId: r.client_id,
              platform: r.platform,
              redirectTo: r.redirect_to,
              requestedScopes: r.requested_scopes,
              targetConnectionId: r.target_connection_id,
              createdByUserId: r.created_by_user_id,
              expiresAt: new Date(r.expires_at as string),
              consumedAt: r.consumed_at,
            }
          : null;
      },
      update: async ({ where }: { where: { id: string } }) => {
        await q(`UPDATE oauth_states SET consumed_at = now() WHERE id = $1`, [where.id]);
        return {};
      },
    },
    platformConnection: {
      findUnique: async ({ where }: { where: { id?: string; orgId_platform_externalUserId?: { orgId: string; platform: string; externalUserId: string } } }) => {
        if (where.id) {
          const [r] = await q<Record<string, unknown>>(
            `SELECT c.*, o.name AS org_name, u.full_name, u.email
               FROM platform_connections c JOIN organizations o ON o.id = c.org_id JOIN users u ON u.id = c.connected_by_user_id
              WHERE c.id = $1`,
            [where.id],
          );
          return r ? { ...baglanti(r), organization: { name: r.org_name }, connectedBy: { fullName: r.full_name, email: r.email } } : null;
        }
        const k = where.orgId_platform_externalUserId;
        if (!k) throw new Error('beklenmeyen platformConnection.findUnique biçimi');
        const [r] = await q<Record<string, unknown>>(
          `SELECT client_id FROM platform_connections WHERE org_id = $1 AND platform = $2::"Platform" AND external_user_id = $3`,
          [k.orgId, k.platform, k.externalUserId],
        );
        return r ? { clientId: r.client_id, client: null } : null;
      },
      findUniqueOrThrow: async ({ where }: { where: { id: string } }) => {
        const [r] = await q<Record<string, unknown>>(`SELECT * FROM platform_connections WHERE id = $1`, [where.id]);
        if (!r) throw new Error('bağlantı yok');
        return baglanti(r);
      },
      findMany: async ({ where }: { where: { orgId: { in: string[] }; platform: string } }) => {
        if (!where.orgId?.in) throw new Error('beklenmeyen platformConnection.findMany biçimi');
        const rows = await q<Record<string, unknown>>(
          `SELECT c.*, o.name AS org_name FROM platform_connections c JOIN organizations o ON o.id = c.org_id
            WHERE c.org_id = ANY($1::uuid[]) AND c.platform = $2::"Platform" AND c.revoked_at IS NULL AND c.status <> 'revoked'`,
          [where.orgId.in, where.platform],
        );
        return rows.map((r) => ({ ...baglanti(r), organization: { name: r.org_name } }));
      },
      update: async ({ where, data }: { where: { id: string }; data: { grantedScopes: string[] } }) => {
        await q(`UPDATE platform_connections SET granted_scopes = $2, status = 'active', revoked_at = NULL, updated_at = now() WHERE id = $1`, [
          where.id,
          data.grantedScopes,
        ]);
        return {};
      },
      upsert: async ({ create }: { create: { orgId: string; clientId: string | null; platform: string; externalUserId: string; accountLabel: string; grantedScopes: string[]; connectedByUserId: string } }) => {
        const [r] = await q<{ id: string }>(
          `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3::"Platform", 'active', $4, $5, '\\x00', $6, $7, now())
           ON CONFLICT (org_id, platform, external_user_id) DO UPDATE SET granted_scopes = EXCLUDED.granted_scopes
           RETURNING id::text AS id`,
          [create.orgId, create.clientId, create.platform, create.externalUserId, create.accountLabel, create.grantedScopes, create.connectedByUserId],
        );
        return { id: r!.id };
      },
    },
  };
}

const envanter = { izinleBaslat: vi.fn() };

beforeAll(async () => {
  h = await createHarness();
  const saglayici = {
    requiredScopes: [ADWORDS],
    optionalScopes: GOOGLE_OLCUM_SCOPES,
    exchangeCode: () => Promise.resolve(tokenlar),
    /*
     * KEŞİF BİLEREK DÜŞÜYOR: dönüş onu yutup loglar (bağlantı kurulmuş
     * sayılır). Burada sınanan hangi BAĞLANTI satırının yazıldığı; keşif
     * yazımı (havuz kopyası) ayrı ve aynı bağlantı kimliğine bağlı —
     * kopya bağlantı açılmıyorsa kopya havuz da açılamaz.
     */
    listAdAccounts: () => Promise.reject(new Error('keşif bu testte koşmuyor')),
  };
  svc = new ConnectionsService(
    { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService,
    yonetimIstemcisi(h) as never,
    { encrypt: (s: string) => ({ data: Buffer.from(s), keyVersion: 1 }) } as never,
    audit as never,
    { get: () => saglayici } as never,
    { platforms: { oauthRedirectBaseUrl: 'https://x.test' } } as never,
    { enqueue: () => Promise.resolve({ enqueued: true }) } as never,
    {} as never,
    { degerlendir: () => Promise.resolve() } as never,
    { gonder: async () => ({ alici: 'test' }) } as never,
    envanter as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  tokenlar = ajansKisisi();
  envanter.izinleBaslat.mockReset().mockResolvedValue(155);
  await seedTenant(h, { platform: 'google', externalId: '5550000001' });
  await seedAjans(h);
  // AJANSIN BAĞLANTISI: havuz, ajans şirketinde, yalnız adwords, kimlik müşteri uzayında.
  await h.q(`UPDATE platform_connections SET client_id = NULL, external_user_id = $2, granted_scopes = $3 WHERE id = $1`, [
    IDS.connection,
    AJANS_KIMLIK,
    [ADWORDS],
  ]);
  // MÜŞTERİ ŞİRKETİ ve ajansın ona ATADIĞI hesap (org_id ödünç: müşteri şirketi).
  await h.q(`INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES ($1, 'Metropol', 'metropol', $2, now())`, [
    MUSTERI_ORG,
    AJANS_UST_HESAP,
  ]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Metropol WS', 'metropol-ws', now())`, [MUSTERI_WS, MUSTERI_ORG]);
  // Hesap ajansın MCC'sinin (kayıtlı kimlik) altında: kökü AJANS_KIMLIK.
  await h.q(`UPDATE ad_accounts SET org_id = $2, client_id = $3, manager_external_id = $4 WHERE id = $1`, [
    IDS.adAccount,
    MUSTERI_ORG,
    MUSTERI_WS,
    AJANS_KIMLIK,
  ]);
});

describe('Tag Manager envanteri izin anında başlıyor (2026-10-15)', () => {
  it('KRİTİK: ölçüm izni gelince tam tarama ajansın bağlantısı için başlıyor', async () => {
    await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    expect(envanter.izinleBaslat).toHaveBeenCalledTimes(1);
    const [baglanti, , kapsamlar] = envanter.izinleBaslat.mock.calls[0]!;
    expect(baglanti).toBe(IDS.connection);
    expect(kapsamlar).toEqual(expect.arrayContaining([...GOOGLE_OLCUM_SCOPES]));
  });

  it('KRİTİK: tarama düşerse bağlantı BOZULMUYOR (envanter yalnız önbellek)', async () => {
    envanter.izinleBaslat.mockRejectedValue(new Error('Quota exceeded'));
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    expect(sorgu(redirectPath).get('connection')).toBe('basarili');
  });
});

describe('KRİTİK: hedefli dönüş (Ölçüm izinlerini ver)', () => {
  it('ajansın bağlantısını tazeler, başka şirkette YENİ satır açmaz', async () => {
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);

    expect(await sayi(`SELECT count(*)::int AS n FROM platform_connections`)).toBe(1);
    expect(await ajansKapsamlari()).toEqual(expect.arrayContaining([ADWORDS, ...GOOGLE_OLCUM_SCOPES]));
    // Kimlik ve sahiplik değişmedi: bu bir token tazelemesi, taşıma değil.
    const [satir] = await h.q<{ org_id: string; client_id: string | null; external_user_id: string }>(
      `SELECT org_id::text, client_id::text, external_user_id FROM platform_connections WHERE id = $1`,
      [IDS.connection],
    );
    expect(satir).toEqual({ org_id: IDS.org, client_id: null, external_user_id: AJANS_KIMLIK });

    const q = sorgu(redirectPath);
    expect(q.get('connection')).toBe('basarili');
    expect(q.get('izin')).toBe('olcum');
  });

  it('KRİTİK: başka bir Google kullanıcısı reddedilir, satır EZİLMEZ', async () => {
    tokenlar = ajansKisisi({ externalUserId: '111111111111111111111', kisiKimligi: '111111111111111111111', erisilebilirHesaplar: ['7778889999'] });
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);

    expect(await ajansKapsamlari()).toEqual([ADWORDS]);
    expect(await sayi(`SELECT count(*)::int AS n FROM platform_connections`)).toBe(1);
    const q = sorgu(redirectPath);
    expect(q.get('connection')).toBe('hata');
    expect(q.get('izin')).toBe('olcum');
    expect(q.get('mesaj')).toContain('başka bir Google hesabı seçildi');
    expect(q.get('mesaj')).toContain('960-813-6521');
    // E-posta dönüş ADRESİNDE taşınmaz (geçmiş, erişim kaydı); ad yeterli.
    expect(redirectPath).not.toContain('advetics.com');
    expect(q.get('mesaj')).not.toContain('@');
  });

  it('KRİTİK: uzun ajans adında da cümle KIRPILMAZ (kendi metnimiz 300 sınırına tabi değil)', async () => {
    await h.q(`UPDATE organizations SET name = $2 WHERE id = $1`, [IDS.org, 'Profaj Dijital Reklam Medya Yazılım Danışmanlık Organizasyon ve Pazarlama Hizmetleri Sanayi ve Ticaret Anonim Şirketi']);
    tokenlar = ajansKisisi({ externalUserId: '111111111111111111111', kisiKimligi: '111111111111111111111', erisilebilirHesaplar: ['7778889999'] });
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    const mesaj = sorgu(redirectPath).get('mesaj')!;
    expect(mesaj.length).toBeGreaterThan(300);
    expect(mesaj).toMatch(/Bağlantıyı kuran: [^.]+\.$/);
  });

  it('KRİTİK: aynı MCC’yi gören AMA atanmış başka bir hesap ağacını görmeyen hesap ajansın token’ını EZEMEZ', async () => {
    // İkinci atanmış hesap, ajansın görebildiği BAŞKA bir kökün altında.
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, status, manager_external_id, updated_at)
       SELECT gen_random_uuid(), org_id, client_id, connection_id, platform, '6660000002', 'Diğer ağaç', currency, timezone, status, '4440000000', now()
         FROM ad_accounts WHERE id = $1`,
      [IDS.adAccount],
    );
    // Meslektaş: ajansın MCC'sine (kayıtlı kimlik) erişiyor, 444-000-0000'a erişmiyor.
    tokenlar = ajansKisisi({ externalUserId: '555555555555555555555', kisiKimligi: '555555555555555555555', erisilebilirHesaplar: [AJANS_KIMLIK] });
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);

    expect(await ajansKapsamlari()).toEqual([ADWORDS]);
    const q = sorgu(redirectPath);
    expect(q.get('connection')).toBe('hata');
    expect(q.get('mesaj')).toContain('444-000-0000');

    // Kontrol: iki ağacı da gören (asıl kişi) geçiyor.
    tokenlar = ajansKisisi({ erisilebilirHesaplar: [AJANS_KIMLIK, '4440000000'] });
    const ikinci = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    expect(sorgu(ikinci.redirectPath).get('connection')).toBe('basarili');
  });

  it('KRİTİK: Google Ads kutusu kaldırılmış token ajansın satırına yazılmaz', async () => {
    tokenlar = ajansKisisi({ grantedScopes: [...GOOGLE_OLCUM_SCOPES] });
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    expect(await ajansKapsamlari()).toEqual([ADWORDS]);
    expect(sorgu(redirectPath).get('connection')).toBe('hata');
  });

  it('ölçüm kutuları işaretsiz: tazelenir ama sonuç "eksik_izin" (sessiz "başarılı" değil)', async () => {
    tokenlar = ajansKisisi({ grantedScopes: [ADWORDS] });
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    expect(sorgu(redirectPath).get('connection')).toBe('eksik_izin');
  });

  it('iptal edilen izin ekranı ölçüm bandıyla döner', async () => {
    const { redirectPath } = await svc.handleCallback(
      'google',
      { error: 'access_denied', state: await state({ hedef: IDS.connection, olcum: true }) },
      META,
    );
    const q = sorgu(redirectPath);
    expect(q.get('connection')).toBe('iptal');
    expect(q.get('izin')).toBe('olcum');
  });
});

describe('KRİTİK: ajansın kimliği başka şirkette ikinci bağlantı olamaz', () => {
  it('hedefsiz yeni bağlantı, ajans kimliğiyle (Ads hesap uzayı eşleşmesi) reddedilir', async () => {
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: null, olcum: false }) }, META);
    expect(await sayi(`SELECT count(*)::int AS n FROM platform_connections`)).toBe(1);
    const q = sorgu(redirectPath);
    expect(q.get('connection')).toBe('hata');
    expect(q.get('mesaj')).toContain('zaten ajansın bağlantısı');
  });

  it('kontrol: şirketin KENDİ Google kimliği hâlâ bağlanabiliyor', async () => {
    tokenlar = ajansKisisi({ externalUserId: '222222222222222222222', kisiKimligi: '222222222222222222222', erisilebilirHesaplar: ['7778889999'] });
    const { redirectPath } = await svc.handleCallback('google', { code: 'k', state: await state({ hedef: null, olcum: false }) }, META);
    expect(sorgu(redirectPath).get('connection')).toBe('basarili');
    expect(await sayi(`SELECT count(*)::int AS n FROM platform_connections WHERE org_id = $1`, [MUSTERI_ORG])).toBe(1);
  });
});

describe('KRİTİK: kurulum izin sonrası "İzin verildi" der', () => {
  it('önce ajansın bağlantısına izin ister, dönüşten sonra adım tamam', async () => {
    const kurulum = new KurulumService(
      { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      { durum: vi.fn() } as never,
      { record: vi.fn() } as never,
      { platforms: { google: { developerToken: 'dev', apiVersion: 'v25' }, meta: { apiVersion: 'v25.0' } } } as never,
      { kurulumdanBagla: vi.fn() } as never,
      { oku: vi.fn().mockResolvedValue(new Map()), ekle: vi.fn(), konteynerEkle: vi.fn().mockResolvedValue(undefined) } as never,
    );
    const ctx = {
      orgId: MUSTERI_ORG,
      userId: IDS.user,
      clientIds: [MUSTERI_WS],
      activeClientId: MUSTERI_WS,
      permissions: ['client.read', 'client.write', 'connection.write', 'connection.manage'],
    } as unknown as TenantContext;
    const izin = async () => (await kurulum.oku(ctx, MUSTERI_WS)).adimlar.find((a) => a.kod === 'google_izin')!;

    const once = await izin();
    expect(once.durum).toBe('eksik');
    // Düğmenin hedefi ajansın bağlantısı — dönüş BU satırı tazelemeli.
    expect(once.eylem).toMatchObject({ tur: 'izin', baglantiId: IDS.connection });

    await svc.handleCallback('google', { code: 'k', state: await state({ hedef: IDS.connection, olcum: true }) }, META);
    expect((await izin()).durum).toBe('tamam');
  });
});

describe('kimlik kıyası', () => {
  const yeni = { externalUserId: '103389823382444834376', kisiKimligi: '103389823382444834376', erisilebilirHesaplar: [AJANS_KIMLIK] };
  it('Ads hesap uzayındaki kayıt kök erişimle eşleşir', () => {
    expect(kimlikKarari(AJANS_KIMLIK, yeni)).toEqual({ ayni: true, kanit: 'hesap_erisimi' });
  });
  it('sub uzayındaki kayıt yalnız sub ile eşleşir; erişim listesi onu kurtarmaz', () => {
    expect(kimlikKarari('999999999999999999999', { ...yeni, erisilebilirHesaplar: ['999999999999999999999'] }).ayni).toBe(false);
  });
  it('eksik kökler: tiresiz kıyas, tekrar yok, boş gerekli = kapsıyor', () => {
    expect(eksikKokler(['444-000-0000', '4440000000', AJANS_KIMLIK], [AJANS_KIMLIK])).toEqual(['4440000000']);
    expect(eksikKokler([], undefined)).toEqual([]);
    expect(eksikKokler([AJANS_KIMLIK], undefined)).toEqual([AJANS_KIMLIK]);
  });
  it('tek uzaylı platform (Meta) yalnız birebir eşitlik', () => {
    expect(kimlikKarari('123', { externalUserId: '123' }).ayni).toBe(true);
    expect(kimlikKarari('123', { externalUserId: '124' }).ayni).toBe(false);
  });
});
