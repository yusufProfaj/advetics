import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { McpBoostService } from './mcp-boost.service';

/**
 * ═══ MCP BOOST SERVİSİNİN SQL'İ GERÇEK ŞEMADA ═══
 *
 * Servisin ham sorguları (`$queryRaw`) derleyicinin göremediği yerde:
 * olmayan bir kolon (ilk yazımda `ad_accounts.deleted_at`) ancak canlıda,
 * araç çağrıldığında "column does not exist" olarak çıkardı. Bu dosya her
 * sorguyu PGlite'ta (üretim migration'larıyla kurulu şema) bir kez koşturuyor.
 */

let h: Harness;
let svc: McpBoostService;
const CTX = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], isOrgAdmin: true, activeClientId: IDS.client } as TenantContext;
const SAYFA = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const GONDERI = 'cccccccc-3333-4333-8333-cccccccccccc';
const BOOST = 'dddddddd-4444-4444-8444-dddddddddddd';
const searchGeoLocations = vi.fn(async () => [{ key: '2343687', type: 'city', name: 'İzmir', label: 'İzmir, Türkiye', countryCode: 'TR' }]);

// Özel metotlar sorgu başına çağrılıyor: iddia "sorgu bu şemada koşuyor ve doğru satırı okuyor".
const ozel = () =>
  svc as unknown as {
    onAyar(c: TenantContext, w: string, s: string): Promise<unknown>;
    hesapSatiri(c: TenantContext, w: string, hesap: string): Promise<{ currency: string; ozel_kategoriler: string[] }>;
    boostAl(c: TenantContext, w: string, id: string): Promise<{ hedef: string; duraklatilmis_kur: boolean; sayfa: string; currency: string }>;
  };

beforeAll(async () => {
  h = await createHarness();
  const prisma = { withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) };
  svc = new McpBoostService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    { searchGeoLocations } as never,
    {} as never,
    { platforms: { meta: { apiVersion: 'v25.0' } } } as never,
  );
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  searchGeoLocations.mockClear();
  await h.q(
    `INSERT INTO social_profiles (id, org_id, client_id, connection_id, profile_type, external_id, name, linked_ad_account_id, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Ornek Sayfa', $5, true, now())`,
    [SAYFA, IDS.org, IDS.client, IDS.connection, IDS.adAccount],
  );
  await h.q(
    `INSERT INTO organic_posts (id, org_id, client_id, social_profile_id, external_id, media_type, message, published_at, updated_at)
     VALUES ($1, $2, $3, $4, 'post-1', 'photo', 'Yeni sezon', now(), now())`,
    [GONDERI, IDS.org, IDS.client, SAYFA],
  );
});

async function boostEkle(over: { duraklatilmis?: boolean; baslangic?: boolean } = {}): Promise<void> {
  await h.q(
    `INSERT INTO boosts (id, org_id, client_id, organic_post_id, ad_account_id, status, budget_mode, total_budget_micros,
       duration_days, objective, reason, created_on_platform_at, external_campaign_id, external_ad_set_id, external_ad_id,
       approved_at, updated_at, hedef, duraklatilmis_kur, yayin_baslangici)
     VALUES ($1, $2, $3, $4, $5, 'active', 'lifetime', 300000000, 5, 'OUTCOME_ENGAGEMENT', 'test', now(), 'c-1', 'as-1', 'ad-1',
       now(), now(), 'erisim', $6, CASE WHEN $7 THEN now() ELSE NULL END)`,
    [BOOST, IDS.org, IDS.client, GONDERI, IDS.adAccount, over.duraklatilmis ?? true, over.baslangic ?? false],
  );
}

describe('sorgular gerçek şemada koşuyor', () => {
  it('boostlar: duraklatılmış ve hiç başlatılmamış boost bunu SÖYLÜYOR, toplam yazılı', async () => {
    await boostEkle();
    const r = (await svc.liste(CTX, IDS.client, 30)) as { boostlar: Array<{ platformda: string; hedef: string; butce: string }>; toplam: number; gosterilen: number };
    expect(r.toplam).toBe(1);
    expect(r.gosterilen).toBe(1);
    expect(r.boostlar[0]!.hedef).toBe('erisim');
    expect(r.boostlar[0]!.platformda).toMatch(/hiç başlatılmadı/);
    expect(r.boostlar[0]!.butce).toMatch(/300,00.*toplam/);
  });

  it('boost satırı hesap, bağlantı ve sayfayla okunuyor; başka workspace\'te yok', async () => {
    await boostEkle({ baslangic: true });
    const b = await ozel().boostAl(CTX, IDS.client, BOOST);
    expect(b).toMatchObject({ hedef: 'erisim', duraklatilmis_kur: true, sayfa: 'Ornek Sayfa', currency: 'TRY' });
    await expect(ozel().boostAl(CTX, IDS.org, BOOST)).rejects.toThrow(/bu workspace'te yok/);
  });

  it('hesap satırı workspace\'in özel kategorisini taşıyor', async () => {
    await h.q(`UPDATE clients SET special_ad_categories = ARRAY['HOUSING'] WHERE id = $1`, [IDS.client]);
    const r = await ozel().hesapSatiri(CTX, IDS.client, IDS.adAccount);
    expect(r.ozel_kategoriler).toEqual(['HOUSING']);
  });

  it('KRİTİK: tek Meta hesabı varsa konum araması onunla; başka workspace\'in hesabı reddediliyor', async () => {
    const r = (await svc.konumAra(CTX, IDS.client, null, 'İzmir')) as { sonuclar: Array<{ key: string }> };
    expect(r.sonuclar[0]!.key).toBe('2343687');
    expect(searchGeoLocations).toHaveBeenCalledWith(CTX, IDS.adAccount, 'İzmir');
    await expect(svc.konumAra(CTX, IDS.client, 'eeeeeeee-5555-4555-8555-eeeeeeeeeeee', 'İzmir')).rejects.toThrow(/atanmış değil/);
  });

  it('ön ayar: sayfaya özel olan workspace varsayılanını eziyor; kapalı ve bozuk ön ayar YOK sayılıyor', async () => {
    const ekle = (profil: string | null, goal: string, enabled = true, settings?: string) =>
      h.q(
        `INSERT INTO auto_boost_presets (id, org_id, client_id, platform, social_profile_id, enabled, budget_mode, daily_budget_micros, duration_days, settings, updated_at)
         VALUES (gen_random_uuid(), $1, $2, 'meta', $3, $4, 'daily', 50000000, 4, $5::jsonb, now())`,
        [IDS.org, IDS.client, profil, enabled, settings ?? JSON.stringify({ platform: 'meta', goal })],
      );
    expect(await ozel().onAyar(CTX, IDS.client, SAYFA)).toBeNull();
    await ekle(null, 'reach');
    expect(await ozel().onAyar(CTX, IDS.client, SAYFA)).toMatchObject({ goal: 'reach', butce: { kip: 'daily', micros: 50_000_000n }, sureGun: 4 });
    await ekle(SAYFA, 'profile_visits');
    expect(await ozel().onAyar(CTX, IDS.client, SAYFA)).toMatchObject({ goal: 'profile_visits' });
    await h.q(`UPDATE auto_boost_presets SET enabled = false WHERE social_profile_id = $1`, [SAYFA]);
    expect(await ozel().onAyar(CTX, IDS.client, SAYFA)).toMatchObject({ goal: 'reach' });
    await h.q(`UPDATE auto_boost_presets SET settings = '{}'::jsonb WHERE social_profile_id IS NULL`);
    expect(await ozel().onAyar(CTX, IDS.client, SAYFA)).toBeNull();
  });
});
