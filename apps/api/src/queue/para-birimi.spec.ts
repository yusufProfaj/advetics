import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';
import { paraBirimi } from './insights-sync.service';

/**
 * ═══ METRİK SATIRININ PARA BİRİMİ BOŞ YAZILAMAZ ═══
 *
 * LinkedIn satırları boş birimle yazılıyordu; Genel Bakış "(TRY, )" ve
 * sembolsüz tutar gösterdi (canlı tur, 2026-10-05).
 */
describe('paraBirimi', () => {
  it('boş ya da boşluklu birim hesabın birimine düşüyor', () => {
    expect(paraBirimi('', 'TRY')).toBe('TRY');
    expect(paraBirimi('   ', 'TRY')).toBe('TRY');
    expect(paraBirimi(null, 'USD')).toBe('USD');
  });
  it('dolu birim korunuyor', () => {
    expect(paraBirimi('usd', 'TRY')).toBe('USD');
  });
});

describe('yazma noktası', () => {
  it('KRİTİK: upsert değeri paraBirimi’nden geçiyor, ham r.currency değil', () => {
    const kaynak = readFileSync(resolve(__dirname, 'insights-sync.service.ts'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const bas = kaynak.indexOf('private async writeRows(');
    expect(bas, 'writeRows bulunamadı').toBeGreaterThan(0);
    const govde = kaynak.slice(bas, kaynak.indexOf('\n  }\n', bas));
    expect(govde).toContain('${paraBirimi(r.currency, account.currency)}');
    expect(govde).not.toContain('${r.currency},');
  });
});

describe('migration: geçmişteki boş birimler', () => {
  let h: Harness;
  const SQL = readFileSync(
    resolve(__dirname, '../../prisma/migrations/20261005120000_metrik_bos_para_birimi/migration.sql'),
    'utf8',
  );

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => h.close());
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h);
  });

  async function satir(currency: string, tarih: string): Promise<void> {
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach)
       VALUES ($1,$2,'meta','campaign',gen_random_uuid(),'c',$3::date,'',1,1,1,0,0,$4,0)`,
      [IDS.client, IDS.adAccount, tarih, currency],
    );
  }

  it('boş birim hesabın birimine dönüyor, dolu birime dokunulmuyor', async () => {
    await satir('', '2026-09-01');
    await satir('USD', '2026-09-02');
    await h.q(SQL);
    const r = (await h.q(
      `SELECT date::text AS d, currency FROM insights_daily ORDER BY date`,
    )) as unknown as { rows: Array<{ d: string; currency: string }> } | Array<{ d: string; currency: string }>;
    const satirlar = Array.isArray(r) ? r : r.rows;
    expect(satirlar.map((x) => x.currency)).toEqual(['TRY', 'USD']);
  });
});
