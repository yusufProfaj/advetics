import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { type RehberGuncelle, type TenantContext } from '@advetics/shared';
import { AJANS_UST_HESAP, createHarness, seedAjans, seedTenant, IDS, type Harness } from '../../../../test/pglite-harness';
import type { PrismaService } from '../../../prisma/prisma.service';
import type { AppConfig } from '../../../config/configuration';
import { ReklamHazirlikService } from '../hazirlik.service';
import { ReklamTaslakService } from '../taslak.service';
import { ReklamYayinService } from '../yayin.service';
import type { ReklamKuyrugu } from '../reklam-kuyrugu';
import { RehberService } from './rehber.service';

/**
 * AJAN 4 · YENİDEN DENETİM (0c5e299 düzeltmeleri, 2026-10-10).
 *
 * Düzeltmelerin üzerine yapılan mutasyonlarda üç düzeltme BOŞ çıktı:
 * kod bozulunca hiçbir test düşmüyordu. Bu dosya o üç boşluğu SERVİS
 * seviyesinde kapatıyor:
 *
 * - BULGU-1 kablosu: `rehberdenGoogle(a, acik, …)` saf fonksiyonu test
 *   ediliyordu ama servisin ona HAM seçimi (`a.platformlar`) mi açık kümeyi
 *   mi verdiği ölçülmüyordu (CLAUDE.md mutasyon dersi 1: "fonksiyon test
 *   edilmişti ama ÇAĞRILDIĞI test edilmemişti").
 * - BULGU-4 koruması: istemcinin karşılığı atılırken AYNI konumun sunucu
 *   eşlemesinin korunması. Kaybolsaydı her konum eklemesi eşlemeyi silerdi ve
 *   Google açıkken rehber G-KONUM'da kilitlenirdi.
 * - "Ajans bilinmiyorsa kapalı": rehber kaydının bağlamında.
 *
 * Ayrıca BULGU-5'i (hazırlık ucu hâlâ eski ifade) bugünkü davranışıyla
 * kilitliyor; düzelten ajan iddiayı TERS ÇEVİRİR.
 */
let h: Harness;
let svc: RehberService;
let cagrilar: string[];

const GHESAP = '44444444-0000-4000-8000-0000000000c1';
const KANAL = '55555555-0000-4000-8000-0000000000c1';
const LOGO = '66666666-0000-4000-8000-0000000000c1';

const CTX = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  isOrgAdmin: true,
  managerAccountId: null,
} as TenantContext;
/** Ajans çalışanı: üst hesabın admin üyesi (seedAjans üyeliği yazar). */
const AJANS = { ...CTX, managerAccountId: AJANS_UST_HESAP } as TenantContext;
const MUSTERI_ORG = 'dddddddd-0000-4000-8000-00000000000d';
const MUSTERI_WS = 'dddddddd-0000-4000-8000-0000000000d1';

const sahteGoogle = {
  rehberMutate: async (_c: unknown, g: { validateOnly: boolean }) => {
    cagrilar.push(`mutate:${g.validateOnly}`);
    return [];
  },
  rehberAra: async () => [],
  searchGeoLocations: async (_c: unknown, q: string) => {
    cagrilar.push(`geo:${q}`);
    return q === 'İzmir'
      ? [{ key: 'geoTargetConstants/1012782', type: 'city', name: 'İzmir', label: 'İzmir, Turkey', countryCode: 'TR' }]
      : [{ key: 'geoTargetConstants/1012783', type: 'city', name: 'Ankara', label: 'Ankara, Turkey', countryCode: 'TR' }];
  },
};

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  const config = {
    platforms: { meta: { apiVersion: 'v25.0' }, google: { apiVersion: 'v25' } },
    uploads: { dir: '/tmp' },
    redis: {},
  } as unknown as AppConfig;
  const kuyruk = { ekle: async () => undefined, ekleProva: async () => undefined, ekleGoogle: async () => undefined } as unknown as ReklamKuyrugu;
  svc = new RehberService(
    prisma,
    new ReklamHazirlikService(prisma),
    new ReklamTaslakService(prisma),
    new ReklamYayinService(prisma, kuyruk, config),
    kuyruk,
    { getAccessToken: async () => 'TOKEN' } as never,
    { get: () => sahteGoogle } as never,
    { isEnabled: false } as never,
    { decrypt: () => 'T' } as never,
    config,
    null,
    {} as never,
  );
});
afterAll(async () => h.close());
beforeEach(async () => {
  cagrilar = [];
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G', 'TRY', 'Europe/Istanbul', now())`,
    [GHESAP, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'youtube_channel', 'UC1', 'Kanal', now())`,
    [KANAL, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO assets (id, org_id, client_id, kind, name, file_name, mime_type, byte_size, width, height, storage_key, content_hash, updated_at)
     VALUES ($1, $2, $3, 'image', 'logo', 'l.png', 'image/png', 3, 512, 512, 'l.png', $4, now())`,
    [LOGO, IDS.org, IDS.client, '2'.repeat(64)],
  );
  await h.q(`INSERT INTO client_profiles (id, org_id, client_id, marka_adi, logo_asset_id, updated_at) VALUES (gen_random_uuid(), $1, $2, 'Marka', $3, now())`, [
    IDS.org,
    IDS.client,
    LOGO,
  ]);
  // Logo bu Google hesabına daha önce yüklenmiş: derleyici dosya okumadan kaynak adını kullanır.
  await h.q(
    `INSERT INTO asset_platform_refs (id, org_id, asset_id, platform, ad_account_id, external_ref)
     VALUES (gen_random_uuid(), $1, $2, 'google', $3, 'customers/1234567890/assets/77')`,
    [IDS.org, LOGO, GHESAP],
  );
});

const g = (alan: string, deger: unknown, kaynak: RehberGuncelle['degisiklikler'][number]['kaynak'] = 'kullanici') => ({ alan, deger, kaynak });

describe('BULGU-1 kablosu: servis türetmeye AÇIK kümeyi veriyor', () => {
  it('KRİTİK: VIDEO (Meta kapalı) + ham seçim iki platform → Google çocuk sürümüne ve provaya TAM tutar (500 ₺) gidiyor', async () => {
    await seedAjans(h);
    const r = await svc.olustur(AJANS, IDS.client);
    await svc.guncelle(AJANS, r.id, {
      surum: r.surum,
      degisiklikler: [
        g('amac', 'VIDEO'),
        // Ham seçim iki platform: Meta VIDEO'da kapalı ama tercih kayıtta kalıyor.
        g('platformlar', { meta: true, google: true }),
        g('googleHesabiId', GHESAP, 'workspace_profili'),
        g('youtubeKanaliId', KANAL, 'workspace_profili'),
        g('youtubeVideo', { videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım' }),
        g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
        g('ekKategoriler', []),
        g('hedefAdres', 'https://ornek.com.tr/'),
        g('metin', { anaMetin: '', basliklar: ['Özel Villalar'], aciklamalar: ['Bahçeli villalar, havuzlu.'] }),
        g('butce', { tip: 'gunluk', micros: '500000000' }),
        g('takvim', { baslangic: '2030-01-01', bitis: null }),
      ],
    });
    const k = await svc.konumlariEsle(AJANS, r.id);
    expect(k.eksikler.filter((e) => e.seviye === 'engel')).toEqual([]);
    const p = await svc.prova(AJANS, r.id);
    expect(p.meta).toBeNull();
    expect(p.google).toMatchObject({ tur: 'gecti' });
    expect(cagrilar.filter((c) => c.startsWith('mutate'))).toEqual(['mutate:true']);
    const [v] = await h.q<{ alanlar: { butce: { micros: string } } }>(
      `SELECT v.alanlar FROM taslak_surumu v JOIN reklam_taslagi t ON t.id = v.taslak_id AND v.surum_no = t.aktif_surum_no WHERE t.platform = 'google'`,
    );
    expect(v!.alanlar.butce.micros).toBe('500000000');
  });
});

describe('BULGU-4 koruması: sunucunun eşlemesi istemcinin sonraki PUT’unda kaybolmuyor', () => {
  it('KRİTİK: eşlenmiş İzmir’e Ankara eklenince İzmir’in karşılığı KALIR, Ankara’nınki istemciden gelse de atılır', async () => {
    await seedAjans(h);
    const r = await svc.olustur(AJANS, IDS.client);
    await svc.guncelle(AJANS, r.id, {
      surum: r.surum,
      degisiklikler: [
        g('amac', 'SITE'),
        g('platformlar', { meta: false, google: true }),
        g('googleHesabiId', GHESAP, 'workspace_profili'),
        g('konumlar', [{ tur: 'city', key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR' }]),
      ],
    });
    const e = await svc.konumlariEsle(AJANS, r.id);
    const izmir = e.alanlar.konumlar!.deger[0]!;
    expect(izmir.google?.kaynak).toBe('geoTargetConstants/1012782');
    // Panel konum listesini BÜTÜNÜYLE yeniden yazıyor (sunucunun döndürdüğü İzmir dahil).
    const s = await svc.guncelle(AJANS, r.id, {
      surum: e.surum,
      degisiklikler: [
        g('konumlar', [izmir, { tur: 'city', key: '2343732', etiket: 'Ankara', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/2840', ad: 'Ankara' } }]),
      ],
    });
    const [i, a] = s.alanlar.konumlar!.deger;
    expect(i!.google?.kaynak).toBe('geoTargetConstants/1012782');
    expect(a!.google).toBeUndefined();
    expect(s.eksikler.some((x) => x.kod === 'G-KONUM')).toBe(true);
  });
});

describe('AJANS BİLİNMİYORSA KAPALI', () => {
  it('KRİTİK: üst hesabı olmayan şirketin admini için rehberde deneme platformu AÇIK SAYILMAZ (PLT-YOK)', async () => {
    // seedAjans YOK: organizations.manager_account_id NULL.
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: [g('amac', 'SITE'), g('platformlar', { meta: false, google: true })] });
    expect(k.eksikler.map((x) => x.kod)).toContain('PLT-YOK');
  });

  it('KRİTİK: üst hesabın admin OLMAYAN üyesi (ad_manager) deneme platformunu açık görmez', async () => {
    await seedAjans(h);
    await h.q(`UPDATE manager_memberships SET role = 'ad_manager' WHERE user_id = $1`, [IDS.user]);
    const r = await svc.olustur(AJANS, IDS.client);
    const k = await svc.guncelle(AJANS, r.id, { surum: r.surum, degisiklikler: [g('amac', 'SITE'), g('platformlar', { meta: false, google: true })] });
    expect(k.eksikler.map((x) => x.kod)).toContain('PLT-YOK');
  });

  it('BULGU-5a (DÜZELDİ): ajans çalışanı KARDEŞ şirketteyken sunucu da hazırlık ucu da deneme platformunu AÇIK sayıyor', async () => {
    await seedAjans(h);
    await h.q(`INSERT INTO organizations (id, name, slug, manager_account_id, updated_at) VALUES ($1, 'Kardeş Şirket', 'ksirket', $2, now())`, [MUSTERI_ORG, AJANS_UST_HESAP]);
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Kardeş WS', 'kws', now())`, [MUSTERI_WS, MUSTERI_ORG]);
    const ctx = { ...AJANS, orgId: MUSTERI_ORG, clientIds: [MUSTERI_WS], activeClientId: MUSTERI_WS } as TenantContext;
    const r = await svc.olustur(ctx, MUSTERI_WS);
    const k = await svc.guncelle(ctx, r.id, { surum: r.surum, degisiklikler: [g('amac', 'SITE'), g('platformlar', { meta: false, google: true })] });
    // Sunucu (rehber.service baglam): üst hesap admin üyesi → deneme açık.
    expect(k.eksikler.map((x) => x.kod)).not.toContain('PLT-YOK');
    // Hazırlık ucu aynı yardımcıyı (ajansYoneticisiMi) kullanıyor: panel de görür.
    const hz = await svc.hazirlik(ctx, MUSTERI_WS);
    expect(hz.ajansYoneticisi).toBe(true);
  });

  it('BULGU-5b (DÜZELDİ): üst hesabı olmayan şirketin admini — sunucu da hazırlık da KAPALI', async () => {
    const r = await svc.olustur(CTX, IDS.client);
    const k = await svc.guncelle(CTX, r.id, { surum: r.surum, degisiklikler: [g('amac', 'SITE'), g('platformlar', { meta: false, google: true })] });
    expect(k.eksikler.map((x) => x.kod)).toContain('PLT-YOK');
    expect((await svc.hazirlik(CTX, IDS.client)).ajansYoneticisi).toBe(false);
  });
});
