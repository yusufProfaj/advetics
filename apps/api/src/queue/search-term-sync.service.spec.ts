import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import type { ProviderRegistry } from '../modules/connections/provider.registry';
import type { TokenVaultService } from '../modules/connections/token-vault.service';
import type { QuotaGuardService } from './quota-guard.service';
import type { DiscoveredSearchTermRow } from '../modules/connections/provider.types';
import { SearchTermSyncService } from './search-term-sync.service';

/**
 * ARAMA TERİMİ SENKRONİZASYONU — GERÇEK Postgres'e karşı.
 *
 * En kritik davranış AYNI GÜN + AYNI TERİMİN İKİ KEZ GELEBİLMESİ. Google
 * raporu reklam grubu kırılımıyla veriyor; tekil anahtarımız ad group
 * taşımıyor. Birleştirme olmadan Postgres "ON CONFLICT DO UPDATE command
 * cannot affect row a second time" ile TÜM İFADEYİ düşürüyor — tek bir
 * mükerrer satır yüzünden o günün tamamı yazılamıyor.
 */
let h: Harness;
let svc: SearchTermSyncService;
let saglayici: { rows: DiscoveredSearchTermRow[]; platform: string };

function satir(over: Partial<DiscoveredSearchTermRow> = {}): DiscoveredSearchTermRow {
  return {
    searchTerm: 'urla satılık villa',
    keywordText: 'urla villa',
    matchType: 'BROAD',
    status: 'NONE',
    adGroupExternalId: undefined,
    date: '2026-08-05',
    impressions: 100,
    clicks: 10,
    spendMicros: 5_000_000n,
    conversions: 1,
    conversionValueMicros: 0n,
    currency: 'TRY',
    ...over,
  };
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
  // seedTenant Meta hesabı açıyor; arama terimi yalnızca Google'da.
  await h.q("UPDATE ad_accounts SET platform = 'google' WHERE id = $1", [IDS.adAccount]);

  saglayici = { rows: [], platform: 'google' };
  svc = new SearchTermSyncService(
    h.db as unknown as PrismaAdminService,
    {
      get: () => ({
        platform: 'google',
        fetchSearchTerms: async () => ({ rows: saglayici.rows, apiCalls: 1 }),
      }),
    } as unknown as ProviderRegistry,
    { getAccessToken: async () => 'token' } as unknown as TokenVaultService,
    { acquire: async () => ({ allowed: true }), record: async () => undefined } as unknown as QuotaGuardService,
  );
});

const ARALIK = { adAccountId: IDS.adAccount, dateFrom: '2026-08-01', dateTo: '2026-08-07' };

const oku = () =>
  h.q<Record<string, string>>(
    `SELECT search_term, status, impressions, clicks, spend_micros, keyword_text
       FROM search_term_insights ORDER BY search_term`,
  );

describe('yazma', () => {
  it('arama terimi yazılıyor', async () => {
    saglayici.rows = [satir()];
    const r = await svc.syncAccount(ARALIK);
    expect(r.rows).toBe(1);
    const rows = await oku();
    expect(rows[0]!.search_term).toBe('urla satılık villa');
    expect(rows[0]!.keyword_text).toBe('urla villa');
  });

  it('KRİTİK: aynı gün aynı terim İKİ KEZ gelirse metrikler TOPLANIYOR', async () => {
    /*
     * Birleştirme olmadan Postgres tüm INSERT'i düşürüyor ve o günün
     * TAMAMI yazılamıyor — belirtisi "arama terimi hiç gelmiyor" olurdu.
     */
    saglayici.rows = [
      satir({ adGroupExternalId: 'g1', impressions: 100, clicks: 10, spendMicros: 5_000_000n }),
      satir({ adGroupExternalId: 'g2', impressions: 40, clicks: 4, spendMicros: 2_000_000n }),
    ];
    const r = await svc.syncAccount(ARALIK);
    const rows = await oku();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.impressions)).toBe(140);
    expect(Number(rows[0]!.clicks)).toBe(14);
    // PGlite BIGINT'i sayı olarak veriyor; string karşılaştırması yapmıyoruz.
    expect(Number(rows[0]!.spend_micros)).toBe(7_000_000);
    expect(r.note).toContain('birleştirildi');
  });

  it('KRİTİK: birleştirmede TANIMLI durum korunuyor', async () => {
    // Aynı terim bir grupta eklenmiş, diğerinde tanımsız olabiliyor. "NONE"
    // göstermek kullanıcıyı zaten eklediği bir kelimeyi tekrar eklemeye
    // iterdi.
    saglayici.rows = [
      satir({ adGroupExternalId: 'g1', status: 'NONE' }),
      satir({ adGroupExternalId: 'g2', status: 'ADDED' }),
    ];
    await svc.syncAccount(ARALIK);
    expect((await oku())[0]!.status).toBe('ADDED');
  });

  it('farklı terimler ayrı satır', async () => {
    saglayici.rows = [satir(), satir({ searchTerm: 'urla deryası' })];
    await svc.syncAccount(ARALIK);
    expect(await oku()).toHaveLength(2);
  });

  it('farklı GÜNLER ayrı satır — tekil anahtar tarih taşıyor', async () => {
    saglayici.rows = [satir({ date: '2026-08-05' }), satir({ date: '2026-08-06' })];
    await svc.syncAccount(ARALIK);
    expect(await oku()).toHaveLength(2);
  });

  it('idempotan: aynı tur iki kez koşarsa MÜKERRER satır oluşmuyor', async () => {
    saglayici.rows = [satir()];
    await svc.syncAccount(ARALIK);
    await svc.syncAccount(ARALIK);
    const rows = await oku();
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.impressions)).toBe(100);
  });

  it('KRİTİK: DURUM güncelleniyor — bitmiş bir iş listede kalmamalı', async () => {
    // Kullanıcı terimi anahtar kelime olarak ekleyince eski durumu
    // göstermek, yapılacak iş listesinde bitmiş bir işi göstermek olurdu.
    saglayici.rows = [satir({ status: 'NONE' })];
    await svc.syncAccount(ARALIK);
    saglayici.rows = [satir({ status: 'ADDED' })];
    await svc.syncAccount(ARALIK);
    expect((await oku())[0]!.status).toBe('ADDED');
  });

  it('çok uzun terim PATLAMIYOR — tekillik hash üzerinden', async () => {
    // Metni birincil anahtara koymak btree sınırına yaklaşıyordu.
    const uzun = 'a'.repeat(480);
    saglayici.rows = [satir({ searchTerm: uzun }), satir({ searchTerm: `${uzun}b` })];
    await svc.syncAccount(ARALIK);
    expect(await oku()).toHaveLength(2);
  });
});

describe('platform', () => {
  it('META hesabında ERKEN ÇIKIYOR — kota harcamıyor', async () => {
    await h.q("UPDATE ad_accounts SET platform = 'meta' WHERE id = $1", [IDS.adAccount]);
    const r = await svc.syncAccount(ARALIK);
    expect(r.rows).toBe(0);
    expect(r.apiCalls).toBe(0);
    expect(r.note).toContain("yalnızca Google'da");
  });

  it('terim yoksa SEBEBİ notta — boş liste sessiz kalmıyor', async () => {
    saglayici.rows = [];
    const r = await svc.syncAccount(ARALIK);
    expect(r.note).toContain('gösterim alan arama terimi yok');
  });
});
