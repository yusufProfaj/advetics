import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConflictException } from '@nestjs/common';
import { KURULUM_BEYAN_OGELERI, KURULUM_HATA_KODLARI, PANEL_KAPILARI, siteYokKurulumKodlari, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { GOOGLE_OLCUM_SCOPES } from '../connections/providers/google.provider';
import { beyanCevir } from './kurulum-beyan';
import { KurulumBeyanService } from './kurulum-beyan.service';
import { KurulumService } from './kurulum.service';

/**
 * ═══ KURULUM BEYANLARI (docs/kurulum-sihirbazi/MIMARI.md § 5, § 7) ═══
 *
 * Dört kilit:
 *   1. Veritabanı son savunma hattı: CHECK listesi shared listesinin
 *      AYNISI, düzey (şirket/workspace) öğeden geliyor, iki kısmi tekil
 *      indeks şirket düzeyi beyanı ÇOĞALTMIYOR.
 *   2. Servis: yaz / yeniden beyan / geri al; kim-ne zaman-gerekçe; denetim
 *      kaydı; kapılar (aktif workspace, client.write, şirket yöneticisi).
 *   3. Şirket okuması: kullanılan platformlar workspace beyanlarından,
 *      workspace yoksa ikisi; iki adımlı doğrulama okunamazsa `null`.
 *   4. "Eksikleri tamamla": `kodlar` süzgeci, hesap açan kodun adıyla
 *      reddi, "site yok" beyanında (ve beyan OKUNAMADIĞINDA) site işlerine
 *      dokunulmaması.
 * RLS SET ROLE + RETURNING ile ayrı dosyada (`src/prisma/kurulum-beyan-rls.spec.ts`).
 */
const B_WS = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ORG2 = '66666666-6666-4666-8666-666666666666';

let h: Harness;
const kayit = vi.fn();
const ctx = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  permissions: ['client.read', 'client.write', 'connection.write', 'connection.manage'],
} as unknown as TenantContext;

const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
const svc = () => new KurulumBeyanService(prisma, { record: kayit } as never);

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h, { platform: 'meta' });
  kayit.mockReset();
});

const satirlar = () => h.q<{ oge: string; client_id: string | null; gerekce: string | null }>(`SELECT oge, client_id, gerekce FROM kurulum_beyanlari ORDER BY oge`);

describe('veritabanı son savunma hattı', () => {
  it('KRİTİK: CHECK listesi shared KURULUM_BEYAN_OGELERI ile AYNI; uydurma öğe reddediliyor', async () => {
    const [r] = await h.q<{ d: string }>(`SELECT pg_get_constraintdef(oid) AS d FROM pg_constraint WHERE conname = 'kurulum_beyanlari_oge_chk'`);
    const listede = [...r!.d.matchAll(/'(\w+)'/g)].map((m) => m[1]).sort();
    expect(listede).toEqual([...KURULUM_BEYAN_OGELERI].sort());
    await expect(h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'odeme')`, [IDS.org, IDS.client])).rejects.toThrow(/kurulum_beyanlari_oge_chk/);
  });

  it('KRİTİK: düzey öğeden — iki adımlı doğrulama workspace\'e, site yok şirkete yazılamıyor', async () => {
    await expect(h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'iki_adim')`, [IDS.org, IDS.client])).rejects.toThrow(/duzey_chk/);
    await expect(h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, NULL, 'site_yok')`, [IDS.org])).rejects.toThrow(/duzey_chk/);
  });

  it('KRİTİK: şirket düzeyi beyan ÇOĞALMIYOR (NULL client_id tekil indekste farklı sayılırdı)', async () => {
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, NULL, 'iki_adim')`, [IDS.org]);
    await expect(h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, NULL, 'iki_adim')`, [IDS.org])).rejects.toThrow(/kurulum_beyanlari_sirket_uniq/);
  });

  it('KRİTİK: workspace başına öğe başına tek satır; başka workspace etkilenmiyor', async () => {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [B_WS, IDS.org]);
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'adres')`, [IDS.org, IDS.client]);
    await expect(h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'adres')`, [IDS.org, IDS.client])).rejects.toThrow(/kurulum_beyanlari_workspace_uniq/);
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'adres')`, [IDS.org, B_WS]);
  });

  it('KRİTİK: workspace başka şirkete taşınınca beyanı Postgres taşıyor, ŞİRKET beyanı eski şirkette kalıyor', async () => {
    await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'İkinci', 'ikinci', now())`, [ORG2]);
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'site_yok'), ($1, NULL, 'iki_adim')`, [IDS.org, IDS.client]);
    await h.q(`UPDATE clients SET org_id = $1 WHERE id = $2`, [ORG2, IDS.client]);
    const r = await h.q<{ oge: string; org_id: string }>(`SELECT oge, org_id FROM kurulum_beyanlari ORDER BY oge`);
    expect(r).toEqual([
      { oge: 'iki_adim', org_id: IDS.org },
      { oge: 'site_yok', org_id: ORG2 },
    ]);
  });

  it('kullanıcı silinince beyan KALIYOR, beyan eden boşalıyor', async () => {
    const KISI = '99999999-9999-4999-8999-999999999999';
    await h.q(`INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'k@x.com', 'K', now())`, [KISI, IDS.org]);
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge, beyan_eden) VALUES ($1, $2, 'adres', $3)`, [IDS.org, IDS.client, KISI]);
    await h.q(`DELETE FROM users WHERE id = $1`, [KISI]);
    expect(await h.q(`SELECT oge, beyan_eden FROM kurulum_beyanlari`)).toEqual([{ oge: 'adres', beyan_eden: null }]);
  });
});

describe('workspace beyanı — servis', () => {
  it('KRİTİK: yazar, kim/ne zaman/gerekçe döner (LEFT JOIN users ile ad), denetim kaydı düşer', async () => {
    const l = await svc().workspaceBeyanYaz(ctx, IDS.client, { oge: 'adres', kapsamDisi: true, gerekce: '  E-ticaret, mağaza yok ' }, {});
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ oge: 'adres', clientId: IDS.client, gerekce: 'E-ticaret, mağaza yok', beyanEden: { id: IDS.user } });
    expect(l[0]!.beyanEden!.ad.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(l[0]!.tarih))).toBe(false);
    expect(kayit).toHaveBeenCalledWith(
      expect.anything(),
      ctx,
      expect.objectContaining({ action: 'kurulum.beyan', clientId: IDS.client, after: { oge: 'adres', kapsamDisi: true, gerekce: 'E-ticaret, mağaza yok' } }),
    );
  });

  it('KRİTİK: yeniden beyan İKİNCİ SATIR açmıyor, gerekçeyi tazeliyor; boş gerekçe NULL', async () => {
    await svc().workspaceBeyanYaz(ctx, IDS.client, { oge: 'bildirim', kapsamDisi: true, gerekce: 'eski' }, {});
    const l = await svc().workspaceBeyanYaz(ctx, IDS.client, { oge: 'bildirim', kapsamDisi: true, gerekce: '   ' }, {});
    expect(l).toHaveLength(1);
    expect(await satirlar()).toEqual([{ oge: 'bildirim', client_id: IDS.client, gerekce: null }]);
  });

  it('KRİTİK: geri al satırı siler (iz denetimde); zaten yoksa sessiz başarı — ama satır duruyorsa yetki reddi', async () => {
    await svc().workspaceBeyanYaz(ctx, IDS.client, { oge: 'site_yok', kapsamDisi: true }, {});
    expect(await svc().workspaceBeyanYaz(ctx, IDS.client, { oge: 'site_yok', kapsamDisi: false }, {})).toEqual([]);
    expect(await satirlar()).toEqual([]);
    expect(kayit).toHaveBeenLastCalledWith(expect.anything(), ctx, expect.objectContaining({ action: 'kurulum.beyan_geri_alindi' }));
    // İkinci geri al: satır yok, hata değil.
    expect(await svc().workspaceBeyanYaz(ctx, IDS.client, { oge: 'site_yok', kapsamDisi: false }, {})).toEqual([]);
  });

  it('KRİTİK: SİLİNEMEYEN ama görünen satır "geri alındı" DEĞİL (politikanın sıfır satırı sessiz başarıya dönmüyor)', async () => {
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'adres')`, [IDS.org, IDS.client]);
    // RLS'in DELETE'i sıfır satıra indirdiği hâli taklit: DELETE hiçbir şey döndürmüyor, SELECT satırı görüyor.
    const sahte = {
      withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
        fn({ $queryRaw: (sql: { text?: string; sql?: string }) => (/DELETE/.test(sql.text ?? sql.sql ?? '') ? Promise.resolve([]) : h.db.$queryRaw(sql as never)) }),
    } as unknown as PrismaService;
    const s = new KurulumBeyanService(sahte, { record: kayit } as never);
    await expect(s.workspaceBeyanYaz(ctx, IDS.client, { oge: 'adres', kapsamDisi: false }, {})).rejects.toThrow(/geri alınamadı/);
  });

  it('kapılar: aktif workspace şart, client.write şart, erişim şart', async () => {
    await expect(svc().workspaceBeyanYaz({ ...ctx, activeClientId: null } as TenantContext, IDS.client, { oge: 'adres', kapsamDisi: true }, {})).rejects.toThrow(/önce üstten/);
    await expect(svc().workspaceBeyanYaz({ ...ctx, permissions: ['client.read'] } as unknown as TenantContext, IDS.client, { oge: 'adres', kapsamDisi: true }, {})).rejects.toThrow(/yetkin yok/);
    await expect(svc().workspaceBeyanlari({ ...ctx, clientIds: [] } as unknown as TenantContext, IDS.client)).rejects.toThrow(/erişimin yok/);
    expect(await satirlar()).toEqual([]);
  });

  it('okuma yalnız BU workspace\'in satırları (şirket beyanı ve başka workspace karışmıyor)', async () => {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [B_WS, IDS.org]);
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'adres'), ($1, $3, 'site_yok'), ($1, NULL, 'iki_adim')`, [IDS.org, IDS.client, B_WS]);
    expect((await svc().workspaceBeyanlari(ctx, IDS.client)).map((b) => b.oge)).toEqual(['adres']);
  });

  it('tanınmayan öğe ekrana uydurma beyan çizdirmiyor', () => {
    expect(beyanCevir({ oge: 'odeme', client_id: null, gerekce: null, beyan_eden: null, ad: null, created_at: new Date() })).toBeNull();
    expect(beyanCevir({ oge: 'adres', client_id: 'x', gerekce: null, beyan_eden: 'u', ad: null, created_at: '2026-10-13T00:00:00Z' })).toMatchObject({ beyanEden: null, tarih: '2026-10-13T00:00:00.000Z' });
  });
});

describe('şirket kurulumu — servis', () => {
  it('KRİTİK: hiç workspace yoksa İKİ platform da kullanılıyor sayılır (yeni şirkette bağlantı adımı gizlenmesin)', async () => {
    // Arşivlenmiş workspace sayılmıyor.
    await h.q(`UPDATE clients SET status = 'archived'`);
    const r = await svc().sirketDurumu(ctx);
    expect(r.workspaceler).toEqual([]);
    expect(r.kullanilanPlatformlar).toEqual(['meta', 'google']);
  });

  it('KRİTİK: bir platform yalnız HER workspace onu kullanmıyorsa düşer', async () => {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [B_WS, IDS.org]);
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, kullanilmayan_platformlar) VALUES ($1, $2, ARRAY['google'])`, [IDS.client, IDS.org]);
    expect((await svc().sirketDurumu(ctx)).kullanilanPlatformlar).toEqual(['meta', 'google']);
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, kullanilmayan_platformlar) VALUES ($1, $2, ARRAY['google'])`, [B_WS, IDS.org]);
    const r = await svc().sirketDurumu(ctx);
    expect(r.kullanilanPlatformlar).toEqual(['meta']);
    expect(r.workspaceler.map((w) => w.kullanilmayanPlatformlar)).toEqual([['google'], ['google']]);
  });

  it('KRİTİK: iki adımlı doğrulama okunur; şirket satırı görünmüyorsa NULL ("zorunlu değil" DEĞİL)', async () => {
    await h.q(`UPDATE organizations SET iki_adim_zorunlu = true WHERE id = $1`, [IDS.org]);
    expect((await svc().sirketDurumu(ctx)).ikiAdimZorunlu).toBe(true);
    expect((await svc().sirketDurumu({ ...ctx, orgId: ORG2 } as TenantContext)).ikiAdimZorunlu).toBeNull();
  });

  it('KRİTİK: şirket beyanı yalnız yönetici; yazılır, döner, geri alınır', async () => {
    await expect(svc().sirketBeyanYaz({ ...ctx, isOrgAdmin: false } as TenantContext, { oge: 'iki_adim', kapsamDisi: true }, {})).rejects.toThrow(/yönetici/);
    expect(await satirlar()).toEqual([]);
    const r = await svc().sirketBeyanYaz(ctx, { oge: 'iki_adim', kapsamDisi: true, gerekce: 'Ekip girişi kilitlenmesin' }, {});
    expect(r.beyanlar).toMatchObject([{ oge: 'iki_adim', clientId: null, gerekce: 'Ekip girişi kilitlenmesin' }]);
    expect(kayit).toHaveBeenCalledWith(expect.anything(), ctx, expect.objectContaining({ action: 'kurulum.sirket_beyan', targetType: 'organization', targetId: IDS.org }));
    // Yeniden beyan çoğaltmıyor.
    await svc().sirketBeyanYaz(ctx, { oge: 'iki_adim', kapsamDisi: true }, {});
    expect(await satirlar()).toHaveLength(1);
    expect((await svc().sirketBeyanYaz(ctx, { oge: 'iki_adim', kapsamDisi: false }, {})).beyanlar).toEqual([]);
  });

  it('KRİTİK: "tüm şirketler" görünümünde şirket beyanı YAZILMAZ — ctx.orgId ev şirketi, karar yanlış şirkete giderdi', async () => {
    const tum = { ...ctx, tumSirketler: true } as TenantContext;
    const hata = await svc()
      .sirketBeyanYaz(tum, { oge: 'iki_adim', kapsamDisi: true }, {})
      .then(() => null, (e: unknown) => e);
    expect(hata).toBeInstanceOf(ConflictException);
    expect((hata as ConflictException).getResponse()).toMatchObject({ code: KURULUM_HATA_KODLARI.sirketSecilmeli });
    expect(await satirlar()).toEqual([]);
    expect(kayit).not.toHaveBeenCalled();
    // Geri alma da aynı kapıdan.
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, NULL, 'iki_adim')`, [IDS.org]);
    await expect(svc().sirketBeyanYaz(tum, { oge: 'iki_adim', kapsamDisi: false }, {})).rejects.toBeInstanceOf(ConflictException);
    expect(await satirlar()).toHaveLength(1);
  });

  it('workspace beyanında seçim yoksa 409 KURULUM_WORKSPACE_SECILMELI (panel koda bakıyor)', async () => {
    const hata = await svc()
      .workspaceBeyanYaz({ ...ctx, activeClientId: null } as TenantContext, IDS.client, { oge: 'adres', kapsamDisi: true }, {})
      .then(() => null, (e: unknown) => e);
    expect((hata as ConflictException).getResponse()).toMatchObject({ code: KURULUM_HATA_KODLARI.workspaceSecilmeli });
  });
});

describe('"Eksikleri tamamla": kodlar ve "site yok"', () => {
  const kurulum = (p: PrismaService = prisma) =>
    new KurulumService(
      p,
      { refreshAccounts: vi.fn(), assignAdAccount: vi.fn() } as never,
      { getAccessToken: vi.fn().mockResolvedValue('tok') } as never,
      { get: vi.fn().mockReturnValue({}) } as never,
      // Site OKUNAMIYOR: konteyner adımı platforma çıkmadan "seç" diye atlanır (ağ yok).
      { durum: vi.fn().mockResolvedValue({ site: { durum: 'ulasilamadi', adres: 'https://ornek.com', hata: 'x', tagManager: [], analytics: [], metaPiksel: [], altyapi: null, tagManagerOkunamayan: [] } }) } as never,
      { record: kayit } as never,
      { platforms: { google: { developerToken: 'dev', apiVersion: 'v25' }, meta: { apiVersion: 'v25.0' } } } as never,
      { kurulumdanBagla: vi.fn().mockResolvedValue(null) } as never,
      { oku: vi.fn().mockResolvedValue(new Map()), ekle: vi.fn() } as never,
    );
  const GOOGLE_BAGLANTI = '77777777-7777-4777-8777-777777777777';

  beforeEach(async () => {
    await h.q(`UPDATE clients SET website = 'https://ornek.com' WHERE id = $1`, [IDS.client]);
    // Ölçüm izinli Google bağlantısı: konteyner ve mülk adımları OTOMATİK olur.
    await h.q(
      `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
       VALUES ($1, $2, $3, 'google', 'active', 'g1', 'G', '\\x00', $4, $5, now())`,
      [
        GOOGLE_BAGLANTI,
        IDS.org,
        IDS.client,
        ['https://www.googleapis.com/auth/adwords', ...GOOGLE_OLCUM_SCOPES],
        IDS.user,
      ],
    );
  });

  const siteKodlari = [...siteYokKurulumKodlari()];

  it('KRİTİK: "site yok" beyanında site işlerine (konteyner, mülk, piksel…) DOKUNULMUYOR — karşı örnekle', async () => {
    const beyansiz = await kurulum().tamamla(ctx, IDS.client, {});
    // KARŞI ÖRNEK: beyan yokken en az bir site işi denendi (iddia boşa düşmüyor).
    expect(beyansiz.sonuclar.map((s) => s.kod).filter((k) => siteKodlari.includes(k)).length).toBeGreaterThan(0);

    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'site_yok')`, [IDS.org, IDS.client]);
    const beyanli = await kurulum().tamamla(ctx, IDS.client, {});
    expect(beyanli.sonuclar.map((s) => s.kod).filter((k) => siteKodlari.includes(k))).toEqual([]);
  });

  it('KRİTİK: beyan OKUNAMADIYSA site işleri yapılmıyor ve bu SÖYLENİYOR', async () => {
    const bozuk = {
      withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) =>
        fn({
          ...h.db,
          $queryRaw: (sql: { text?: string; sql?: string }) =>
            /kurulum_beyanlari/.test(sql.text ?? sql.sql ?? '') ? Promise.reject(new Error('bağlantı koptu')) : h.db.$queryRaw(sql as never),
          $executeRaw: (sql: never) => h.db.$executeRaw(sql),
        }),
    } as unknown as PrismaService;
    const r = await kurulum(bozuk).tamamla(ctx, IDS.client, {});
    const site = r.sonuclar.filter((s) => siteKodlari.includes(s.kod));
    expect(site.length).toBeGreaterThan(0);
    for (const s of site) {
      expect(s.durum).toBe('atlandi');
      expect(s.mesaj).toContain('okunamadı');
    }
  });

  it('KRİTİK: kodlar verilirse YALNIZ o adımlar; hesap açan kod adıyla reddediliyor; istenen site adımı nedeniyle dönüyor', async () => {
    await h.q(`INSERT INTO kurulum_beyanlari (org_id, client_id, oge) VALUES ($1, $2, 'site_yok')`, [IDS.org, IDS.client]);
    const r = await kurulum().tamamla(ctx, IDS.client, {}, ['meta_hesap', 'gtm_konteyner']);
    expect(r.sonuclar.map((s) => s.kod).sort()).toEqual(['gtm_konteyner', 'meta_hesap']);
    expect(r.sonuclar.find((s) => s.kod === 'meta_hesap')).toMatchObject({ durum: 'atlandi', mesaj: expect.stringContaining('Gerçek bir reklam hesabı açar') });
    expect(r.sonuclar.find((s) => s.kod === 'gtm_konteyner')).toMatchObject({ durum: 'atlandi', mesaj: expect.stringContaining('web sitemiz yok') });
  });

  it('KRİTİK: kodlar süzgeci başka adımı KOŞMUYOR (beyansız, yalnız konteyner)', async () => {
    const r = await kurulum().tamamla(ctx, IDS.client, {}, ['gtm_konteyner']);
    expect(r.sonuclar.map((s) => s.kod)).toEqual(['gtm_konteyner']);
  });
});

describe('sayfa adımı boost hesabını bağlıyor (sihirbaz Ç-7)', () => {
  const SAYFA = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
  const IG = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2';
  const bagla = vi.fn();
  const servis = () =>
    new KurulumService(
      prisma,
      {
        assignSocialProfile: vi.fn(async (_c: unknown, id: string, clientId: string) => {
          await h.q(`UPDATE social_profiles SET client_id = $1 WHERE id = $2`, [clientId, id]);
          return { profileType: 'facebook_page' };
        }),
        setProfileAdAccount: bagla,
      } as never,
      { getAccessToken: vi.fn() } as never,
      { get: vi.fn().mockReturnValue({}) } as never,
      { durum: vi.fn() } as never,
      { record: kayit } as never,
      { platforms: { google: {}, meta: {} } } as never,
      { kurulumdanBagla: vi.fn() } as never,
      { oku: vi.fn().mockResolvedValue(new Map()), ekle: vi.fn() } as never,
    );

  beforeEach(async () => {
    bagla.mockReset();
    await h.q(`UPDATE ad_accounts SET client_id = $1 WHERE id = $2`, [IDS.client, IDS.adAccount]);
    await h.q(
      `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
       VALUES ($1, $3, NULL, $4, 'facebook_page', 'p1', 'Sayfa', now()),
              ($2, $3, $5, $4, 'instagram_business', 'i1', 'Elle bağlı IG', now())`,
      [SAYFA, IG, IDS.org, IDS.connection, IDS.client],
    );
    // Kullanıcının ELLE bağladığı hesap ezilmemeli.
    await h.q(`UPDATE social_profiles SET linked_ad_account_id = $1 WHERE id = $2`, [IDS.adAccount, IG]);
  });

  it('KRİTİK: sayfa atanınca workspace\'in Meta hesabı BOŞ boost bağına yazılıyor, dolu bağa dokunulmuyor', async () => {
    bagla.mockResolvedValue({});
    const r = await servis().adim(ctx, IDS.client, { kod: 'sayfa', sayfaId: SAYFA }, {});
    expect(bagla).toHaveBeenCalledTimes(1);
    expect(bagla).toHaveBeenCalledWith(ctx, SAYFA, IDS.adAccount, {});
    expect(r.sonuc?.mesaj).toContain('Boost hesabı 1 profile bağlandı');
  });

  it('KRİTİK: bağ düşerse adım düşmüyor ama sebep sonuç cümlesinde (sessiz değil)', async () => {
    bagla.mockRejectedValue(new Error('Reklam hesabı bu sayfanın workspace’ine atanmamış'));
    const r = await servis().adim(ctx, IDS.client, { kod: 'sayfa', sayfaId: SAYFA }, {});
    expect(r.sonuc?.durum).toBe('yapildi');
    expect(r.sonuc?.mesaj).toContain('Boost hesabı bağlanamadı: Sayfa (Reklam hesabı bu sayfanın workspace’ine atanmamış)');
  });

  it('workspace\'in Meta hesabı yoksa bağ denenmiyor', async () => {
    await h.q(`UPDATE ad_accounts SET client_id = NULL, sync_enabled = false WHERE id = $1`, [IDS.adAccount]);
    await servis().adim(ctx, IDS.client, { kod: 'sayfa', sayfaId: SAYFA }, {});
    expect(bagla).not.toHaveBeenCalled();
  });
});

describe('uçlar ve kayıt', () => {
  const yorumsuz = (ad: string) => readFileSync(join(__dirname, ad), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const govde = (kaynak: string, bas: string): string => {
    const i = kaynak.indexOf(bas);
    if (i < 0) throw new Error(`uç bulunamadı: ${bas}`);
    // Dekoratörden metodun KAPANIŞINA kadar (iki boşluk girintili "}"):
    // sabit uzunluklu dilim komşu ucu yakalardı (CLAUDE.md).
    const son = kaynak.indexOf('\n  }\n', i);
    if (son < 0) throw new Error(`uç gövdesi bulunamadı: ${bas}`);
    return kaynak.slice(i, son);
  };

  it('KRİTİK: workspace beyan uçları doğru kapı ve şemayla', () => {
    const k = yorumsuz('kurulum.controller.ts');
    const oku = govde(k, "@Get('beyanlar')");
    expect(oku).toContain("@RequirePermissions('client.read')");
    const yaz = govde(k, "@Put('beyan')");
    expect(yaz).toContain("@RequirePermissions('client.write')");
    expect(yaz).toContain('zodBody(kurulumBeyaniSchema)');
    const tamamla = govde(k, "@Post('tamamla')");
    expect(tamamla).toContain('zodBody(kurulumTamamlaSchema)');
    expect(tamamla).toContain('dto?.kodlar');
  });

  it('KRİTİK: API kapıları panel kapılarının AYNASI (düğme görünüp 403 almasın)', () => {
    expect(PANEL_KAPILARI['kurulum.beyan'].izinler).toEqual(['client.write']);
    expect(PANEL_KAPILARI['sirketKurulum.beyan']).toMatchObject({ izinler: [], orgYoneticisi: true });
  });

  it('KRİTİK: şirket beyanı yalnız şirket yöneticisi, şirket kimliği adresten ALINMIYOR', () => {
    const k = yorumsuz('kurulum-sirket.controller.ts');
    expect(k).toContain("@Controller('kurulum/sirket')");
    const yaz = govde(k, "@Put('beyan')");
    expect(yaz).toContain('@RequireOrgAdmin()');
    expect(yaz).toContain('zodBody(sirketKurulumBeyaniSchema)');
    expect(k).not.toMatch(/@Param\(/);
  });

  it('KRİTİK: servis ve denetleyici modülde kayıtlı (Nest kaydı açılışta patlar)', () => {
    const m = yorumsuz('kurulum.module.ts');
    const p = m.slice(m.indexOf('providers: ['), m.indexOf(']', m.indexOf('providers: [')));
    const c = m.slice(m.indexOf('controllers: ['), m.indexOf(']', m.indexOf('controllers: [')));
    expect(p).toContain('KurulumBeyanService');
    expect(c).toContain('KurulumSirketController');
  });
});
