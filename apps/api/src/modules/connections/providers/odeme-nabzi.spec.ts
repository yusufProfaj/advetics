import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hesapUyarilari } from '../../alerts/uyari-kurallari';
import { GoogleProvider } from './google.provider';
import { MetaProvider } from './meta.provider';

/**
 * ═══ ÖDEME NABZI — sağlayıcılar yalnızca durumu okuyor ═══
 *
 * EN KRİTİK SÖZLEŞME YAMA ANAHTARLARI. Nabız okuduğunu `ad_accounts.raw`
 * ile birleştiriyor ve ödeme kuralı kararını ham alandan veriyor (Meta
 * `raw.account_status`, Google `raw.status`). Yama farklı bir ad taşısaydı
 * nabız "okudum" der, kural ESKİ değeri okumaya devam eder ve tetik hiç
 * çekilmezdi — hata yok, yalnızca susan bir uyarı. Bu yüzden testler yamayı
 * GERÇEK kurala sokup sonucu ölçüyor.
 *
 * `fetch` global olarak yamanıyor: `platformFetch` içeride onu çağırıyor.
 */

const YANIT = (govde: unknown, status = 200): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => govde,
    text: async () => JSON.stringify(govde),
  }) as unknown as Response;

function meta(): MetaProvider {
  return new MetaProvider({
    platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v21.0' } },
  } as never);
}

function google(): GoogleProvider {
  return new GoogleProvider({
    platforms: {
      google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v20' },
    },
  } as never);
}

/** Yamanın ödeme kuralında ne ürettiği — gerçek kural fonksiyonuyla. */
function odemeSorunuMu(platform: 'meta' | 'google', raw: Record<string, unknown>): boolean {
  return hesapUyarilari(
    {
      id: 'x',
      name: 'x',
      platform,
      status: 'paused',
      syncEnabled: true,
      lastInsightsSyncAt: new Date(),
      lastStructureSyncAt: new Date(),
      updatedAt: new Date(),
      raw,
      clientId: 'ws',
      clientName: 'ws',
      connectionStatus: 'active',
      connectionTokenExpiresAt: null,
    },
    new Date(),
  ).some((u) => u.kod === 'hesap_odeme_sorunu');
}

let orijinalFetch: typeof fetch;
beforeEach(() => {
  orijinalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = orijinalFetch;
  vi.restoreAllMocks();
});

describe('Meta hesapDurumlari', () => {
  it('KRİTİK: yama ödeme kuralını TETİKLİYOR — keşifle aynı alan adı', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({ id: 'act_1', account_status: 3, disable_reason: 0 }),
    ) as unknown as typeof fetch;
    const r = await meta().hesapDurumlari('T', [{ externalId: 'act_1', managerExternalId: null }]);
    expect(r.hatalar).toEqual([]);
    expect(r.durumlar).toHaveLength(1);
    const eski = { name: 'Mia', account_status: 1, currency: 'TRY' };
    expect(odemeSorunuMu('meta', eski)).toBe(false);
    expect(odemeSorunuMu('meta', { ...eski, ...r.durumlar[0]!.rawYama })).toBe(true);
  });

  it('hesap başına DÜĞÜM isteği, yalnızca durum alanları — `?ids=` yok', async () => {
    const f = vi.fn(async (_url: string) => YANIT({ account_status: 1 }));
    globalThis.fetch = f as unknown as typeof fetch;
    await meta().hesapDurumlari('T', [
      { externalId: 'act_1', managerExternalId: null },
      { externalId: 'act_2', managerExternalId: null },
    ]);
    expect(f).toHaveBeenCalledTimes(2);
    const adres = String(f.mock.calls[0]![0]);
    expect(adres).toContain('/act_1?fields=account_status,disable_reason');
    expect(adres).not.toContain('ids=');
  });

  it('KRİTİK: bir hesabın hatası diğerini DURDURMUYOR ve sebebi yazılıyor', async () => {
    globalThis.fetch = vi.fn(async (url: string) =>
      String(url).includes('act_1')
        ? YANIT({ error: { message: 'Unsupported get request', code: 100 } }, 400)
        : YANIT({ account_status: 3 }),
    ) as unknown as typeof fetch;
    const r = await meta().hesapDurumlari('T', [
      { externalId: 'act_1', managerExternalId: null },
      { externalId: 'act_2', managerExternalId: null },
    ]);
    expect(r.durumlar.map((d) => d.externalId)).toEqual(['act_2']);
    expect(r.hatalar).toHaveLength(1);
    expect(r.hatalar[0]).toContain('act_1');
  });

  it('KRİTİK: durum dönmezse YAZILMIYOR — ödeme uyarısını sessizce kapatırdı', async () => {
    globalThis.fetch = vi.fn(async () => YANIT({ id: 'act_1' })) as unknown as typeof fetch;
    const r = await meta().hesapDurumlari('T', [{ externalId: 'act_1', managerExternalId: null }]);
    expect(r.durumlar).toEqual([]);
    expect(r.hatalar[0]).toContain('account_status dönmedi');
  });
});

describe('Google hesapDurumlari', () => {
  it('KRİTİK: yönetici başına TEK sorgu ve yama ödeme kuralını tetikliyor', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      YANIT({
        results: [
          { customerClient: { clientCustomer: 'customers/111', status: 'SUSPENDED' } },
          { customerClient: { clientCustomer: 'customers/222', status: 'ENABLED' } },
        ],
      }),
    );
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await google().hesapDurumlari('T', [
      { externalId: '111', managerExternalId: '999' },
      { externalId: '222', managerExternalId: '999' },
    ]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]![0])).toContain('/customers/999/googleAds:search');
    const govde = String(f.mock.calls[0]![1]?.body ?? '');
    expect(govde).toContain("'customers/111', 'customers/222'");

    const askida = r.durumlar.find((d) => d.externalId === '111')!;
    expect(askida.status).toBe('disabled');
    expect(odemeSorunuMu('google', { descriptiveName: 'x', status: 'ENABLED', ...askida.rawYama })).toBe(true);
    expect(r.hatalar).toEqual([]);
  });

  it('yöneticinin altında artık GÖRÜNMEYEN hesap sessiz geçilmiyor', async () => {
    globalThis.fetch = vi.fn(async () =>
      YANIT({ results: [{ customerClient: { clientCustomer: 'customers/111', status: 'ENABLED' } }] }),
    ) as unknown as typeof fetch;
    const r = await google().hesapDurumlari('T', [
      { externalId: '111', managerExternalId: '999' },
      { externalId: '333', managerExternalId: '999' },
    ]);
    expect(r.hatalar.join(' ')).toContain('333');
  });

  it('yöneticisi olmayan hesap kendi `customer` kaynağından', async () => {
    const f = vi.fn(async (_url: string, _init?: RequestInit) =>
      YANIT({ results: [{ customer: { status: 'SUSPENDED' } }] }),
    );
    globalThis.fetch = f as unknown as typeof fetch;
    const r = await google().hesapDurumlari('T', [{ externalId: '555', managerExternalId: null }]);
    expect(String(f.mock.calls[0]![0])).toContain('/customers/555/googleAds:search');
    expect(r.durumlar[0]!.rawYama).toEqual({ status: 'SUSPENDED' });
  });
});

describe('KRİTİK: Google keşfi ASKIYA ALINMIŞ alt hesabı düşürmüyor', () => {
  it('customer_client süzgeci SUSPENDED’ı kapsıyor', () => {
    /*
     * Süzgeç yalnızca 'ENABLED' iken Google'ın ödeme yüzünden askıya aldığı
     * alt hesap listeden düşüyor, satırı son görülen 'ENABLED' ile kalıyor
     * ve ödeme uyarısı HİÇ çıkmıyordu.
     */
    const kaynak = readFileSync(resolve(__dirname, 'google.provider.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const i = kaynak.indexOf('async listAdAccounts(');
    expect(i).toBeGreaterThan(-1);
    const dilim = kaynak.slice(i, kaynak.indexOf('\n  }\n', i));
    expect(dilim).toContain("WHERE customer_client.status IN ('ENABLED', 'SUSPENDED')");
    expect(dilim).not.toContain("customer_client.status = 'ENABLED'");
  });
});
