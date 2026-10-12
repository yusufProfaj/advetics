import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { ayarAc, lead, olay } from '../../../test/geri-besleme-tohum';
import type { PrismaAdminService } from '../../prisma/prisma-admin.service';
import type { QuotaGuardService } from '../../queue/quota-guard.service';
import type { ProviderRegistry } from '../connections/provider.registry';
import type { TokenVaultService } from '../connections/token-vault.service';
import { GeriBeslemeGonderimService } from './geri-besleme-gonderim.service';

/**
 * ═══ AJAN 4 · PAKET E YENİDEN KAPI (8dc93c1 sonrası) ═══
 *
 * Ö-4 (BİLEREK KIRMIZI): `ayniHata` iki yarının aynı kod/alt kodla düşmesini
 * "biçim hatası" sayıyor. Kod 100 Meta'nın GENEL "Invalid parameter" kodu:
 * partide farklı yarılara düşmüş İKİ kötü olay (silinmiş/eski lead) aynı
 * kodu taşır. Sonuç: AyarHatasi, satırların hepsi `bekliyor`a geri bırakılıyor,
 * deneme artmıyor ve her 5 dakikalık turda aynı 3 istek tekrarlanıyor —
 * workspace'in BÜTÜN geri beslemesi 7 gün dolana kadar duruyor ve kötü
 * olaylar hiç ayıklanmıyor. Beklenen: iyi olaylar iletilir, yalnız iki kötü
 * olay reddedilir (ya da sistematik karar en az bir yarının TEK olaya inmiş
 * hâliyle doğrulanır).
 */
let h: Harness;
const SIMDI = new Date('2026-10-12T10:00:00Z');
const ikiSaatOnce = new Date(SIMDI.getTime() - 2 * 3_600_000);
let cagrilar: string[] = [];
const KOTU = new Set<string>();

function kur(): GeriBeslemeGonderimService {
  return new GeriBeslemeGonderimService(
    h.db as unknown as PrismaAdminService,
    { getAccessToken: vi.fn(async () => 'T') } as unknown as TokenVaultService,
    { get: () => ({}) } as unknown as ProviderRegistry,
    { acquire: vi.fn(async () => ({ allowed: true })), record: vi.fn(async () => undefined) } as unknown as QuotaGuardService,
  );
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  cagrilar = [];
  KOTU.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init: RequestInit) => {
      const govde = String(init.body ?? '');
      cagrilar.push(govde);
      const idler = [...govde.matchAll(/"lead_id":(\d+)/g)].map((m) => m[1]!);
      if (idler.some((i) => KOTU.has(i))) {
        return new Response(JSON.stringify({ error: { code: 100, error_subcode: 2804003, message: 'Invalid parameter' } }), { status: 400 });
      }
      return new Response(JSON.stringify({ events_received: idler.length, fbtrace_id: 'x' }), { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Ö-4 · farklı yarılardaki iki kötü olay bütün workspace’i kilitliyor', () => {
  it('KIRMIZI: 50 olayda biri ilk, biri ikinci yarıda iki kötü olay → 48 iletildi, 2 reddedildi', async () => {
    await ayarAc(h);
    for (let i = 0; i < 50; i++) {
      const id = `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const ext = `4${String(i).padStart(14, '0')}`;
      if (i === 0 || i === 49) KOTU.add(ext);
      await lead(h, { id, externalId: ext, submittedAt: ikiSaatOnce });
      await olay(h, { leadId: id, asama: 'ham_lead', olayZamani: ikiSaatOnce });
    }
    await kur().calistir(IDS.client, SIMDI);
    const d = await h.q<{ durum: string; n: number }>(`SELECT durum, count(*)::int AS n FROM geri_besleme_olaylari GROUP BY durum ORDER BY durum`);
    expect(cagrilar.length).toBeGreaterThan(0); // bekçi
    expect(d).toEqual([
      { durum: 'iletildi', n: 48 },
      { durum: 'reddedildi', n: 2 },
    ]);
  });
});
