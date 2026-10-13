import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import { GoogleProvider } from '../connections/providers/google.provider';

/**
 * ═══ GOOGLE ERİŞİMİ: NULL, 0 DEĞİL (2026-10-13) ═══
 *
 * Google tekil erişim vermiyor ve senkron her satıra 0 yazıyordu; raporun
 * Google tablosu "Erişim 0" basıyordu ("kimseye ulaşmadı"). Senkron artık
 * NULL yazıyor, geçmiş 0'lar migration'la NULL'a çevriliyor. Meta'nın 0'ı
 * okunmuş bir değer olabilir: dokunulmuyor.
 */

const MIGRATION = readFileSync(
  join(__dirname, '../../../prisma/migrations/20261016200000_google_erisim_bos/migration.sql'),
  'utf8',
);

describe('Google senkronu erişimi NULL yazıyor', () => {
  afterEach(() => vi.restoreAllMocks());

  it('KRİTİK: Google satırının erişimi null (0 değil)', async () => {
    const p = new GoogleProvider({
      platforms: { google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v25' } },
    } as never);
    vi.spyOn(p as never, 'searchGaqlPaged').mockImplementation((async (_t: string, _c: string, q: string) =>
      q.includes('FROM campaign') && q.includes('cost_micros')
        ? [
            {
              campaign: { id: '66', advertisingChannelType: 'SEARCH' },
              segments: { date: '2026-10-01' },
              customer: { currencyCode: 'TRY' },
              metrics: { impressions: 200, clicks: 20, costMicros: '3000000' },
            },
          ]
        : []) as never);
    const r = await p.fetchInsights(
      { accessToken: 't', accountExternalId: '1234567890' } as never,
      { level: 'campaign', dateFrom: '2026-10-01', dateTo: '2026-10-01', timezone: 'Europe/Istanbul' } as never,
    );
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.reach).toBeNull();
  });
});

describe('migration: Google satırlarının 0 erişimi NULL', () => {
  let h: Harness;
  const META_HESAP = '14141414-1414-4414-8414-141414141414';
  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    // Tohum hesabı GOOGLE; ikinci bir META hesabı ekleniyor.
    await seedTenant(h, { platform: "google" });
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'act_777', 'Meta', 'TRY', 'Europe/Istanbul', true, now())`,
      [META_HESAP, IDS.org, IDS.client, IDS.connection],
    );
  });

  async function satir(hesap: string, platform: 'meta' | 'google', entity: string, reach: number): Promise<void> {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, spend_micros, conversions, conversion_value_micros, currency, reach)
       VALUES ($1, $2, $3::"Platform", 'campaign', $4, 'x', '2026-10-01', '', 100, 1, 1000000, 0, 0, 'TRY', $5)`,
      [IDS.client, hesap, platform, entity, reach],
    );
  }

  it('KRİTİK: yalnız Google hesabının 0 erişimi NULL oluyor; Meta 0 ve Meta değeri korunuyor', async () => {
    await satir(IDS.adAccount, 'google', '15151515-1515-4515-8515-151515151515', 0);
    await satir(META_HESAP, 'meta', '16161616-1616-4616-8616-161616161616', 0);
    await satir(META_HESAP, 'meta', '17171717-1717-4717-8717-171717171717', 900);
    // Harness migration'ları zaten uyguladı; veriyle tekrar koşmak idempotent.
    await h.pg.exec(MIGRATION);
    const rows = await h.q<{ platform: string; reach: number | null }>(
      `SELECT platform::text AS platform, reach FROM insights_daily ORDER BY platform, reach NULLS FIRST`,
    );
    expect(rows).toEqual([
      { platform: 'google', reach: null },
      { platform: 'meta', reach: 0 },
      { platform: 'meta', reach: 900 },
    ]);
  });

  it('kolon NULL kabul ediyor (senkron Google için NULL yazabilsin)', async () => {
    const [r] = await h.q<{ is_nullable: string }>(
      `SELECT is_nullable FROM information_schema.columns WHERE table_name = 'insights_daily' AND column_name = 'reach'`,
    );
    expect(r?.is_nullable).toBe('YES');
  });
});
