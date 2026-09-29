import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../test/pglite-harness';
import {
  SORGULAR,
  turTahminleri,
  type IsTuruSatiri,
} from '../../prisma/olcum-google-kota-sorgular';

/**
 * ═══ GOOGLE KOTA ÖLÇÜM ARACI ═══
 *
 * Araç üretimde bir kez koşacak ve bir SQL hatası orada, arızanın ortasında
 * görülürdü. Her sorgu gerçek şemaya karşı koşuyor; tahmin fonksiyonu elle
 * hesaplanmış bir sonuçla karşılaştırılıyor — yanlış bir pay, yanlış
 * düzeltmeyi seçtirir.
 */
let h: Harness;
const META_HESAP = '66666666-6666-6666-6666-666666666666';

async function is(p: {
  hesap?: string;
  tur: string;
  durum: string;
  deneme: number;
  cagri?: number;
  kod?: string;
  mesaj?: string;
  gunOnce?: number;
}): Promise<void> {
  await h.q(
    `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, attempts, api_calls_used,
                            error_code, error_message, created_at, started_at)
     VALUES ($1, $2, $3::"SyncJobType", $4::"SyncJobStatus", $5, $6, $7, $8,
             now() - make_interval(days => $9::int), now() - make_interval(days => $9::int))`,
    [
      IDS.client,
      p.hesap ?? IDS.adAccount,
      p.tur,
      p.durum,
      p.deneme,
      p.cagri ?? 0,
      p.kod ?? null,
      p.mesaj ?? null,
      p.gunOnce ?? 0,
    ],
  );
}

beforeAll(async () => {
  h = await createHarness();
  await seedTenant(h);
  await h.q(`UPDATE ad_accounts SET platform = 'google' WHERE id = $1`, [IDS.adAccount]);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name,
                              currency, timezone, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'act_m', 'Meta', 'TRY', 'Europe/Istanbul', now())`,
    [META_HESAP, IDS.org, IDS.client, IDS.connection],
  );

  await is({ tur: 'insights_daily', durum: 'succeeded', deneme: 1, cagri: 4 });
  await is({ tur: 'insights_daily', durum: 'succeeded', deneme: 3, cagri: 4 });
  await is({
    tur: 'insights_daily',
    durum: 'throttled',
    deneme: 5,
    kod: 'rate_limited',
    mesaj: 'Resource has been exhausted · quotaError=RESOURCE_EXHAUSTED · Retry in 812 seconds.',
  });
  await is({ tur: 'keyword_insights', durum: 'failed', deneme: 5, kod: 'rate_limited', mesaj: 'Resource has been exhausted · Retry in 90 seconds.' });
  // Pencere dışı ve başka platform: ikisi de SAYILMAMALI.
  await is({ tur: 'insights_daily', durum: 'failed', deneme: 5, kod: 'rate_limited', gunOnce: 30 });
  await is({ hesap: META_HESAP, tur: 'insights_daily', durum: 'failed', deneme: 5, kod: 'rate_limited' });
});

afterAll(async () => {
  await h.close();
});

describe('ölçüm sorguları gerçek şemada koşuyor', () => {
  for (const [anahtar, s] of Object.entries(SORGULAR)) {
    it(`${anahtar}: ${s.ad}`, async () => {
      await expect(h.q(s.sql, s.sql.includes('$1') ? [7] : [])).resolves.toBeDefined();
    });
  }

  it('iş türü tablosu yalnızca son 7 günün GOOGLE işlerini sayıyor', async () => {
    const satirlar = await h.q<IsTuruSatiri>(SORGULAR.isTuru.sql, [7]);
    const gunluk = satirlar.filter((s) => s.tur === 'insights_daily');
    expect(gunluk.reduce((t, s) => t + s.adet, 0)).toBe(3);
    expect(gunluk.find((s) => s.durum === 'throttled')?.kota_hatasi).toBe(1);
  });

  it('mesajlar rakamdan bağımsız gruplanıyor', async () => {
    const m = await h.q<{ mesaj: string; adet: number }>(SORGULAR.mesajlar.sql, [7]);
    expect(m.map((x) => x.mesaj).join('\n')).toContain('Retry in # seconds');
    expect(m.reduce((t, x) => t + x.adet, 0)).toBe(2);
  });
});

describe('turTahminleri', () => {
  it('kayıtsız denemeleri başarılı işin ortalamasıyla fiyatlıyor', async () => {
    const t = turTahminleri(await h.q<IsTuruSatiri>(SORGULAR.isTuru.sql, [7]));
    // insights_daily: ölçülen 4+4, ortalama 4; kayıtsız deneme = başarılının
    // ek 2 denemesi + düşen işin 5 denemesi = 7 → ~28 çağrı.
    expect(t.find((x) => x.tur === 'insights_daily')).toEqual({
      tur: 'insights_daily',
      olculen: 8,
      ortalama: 4,
      kayitsiz: 28,
      kayitsizDeneme: 7,
    });
    // Başarılı işi olmayan tür tahmin edilemiyor — sıfır SAYILMIYOR.
    expect(t.find((x) => x.tur === 'keyword_insights')).toMatchObject({
      ortalama: null,
      kayitsiz: null,
      kayitsizDeneme: 5,
    });
  });
});

describe('araç yazmıyor', () => {
  const kaynak = readFileSync(resolve(__dirname, '../../prisma/olcum-google-kota.ts'), 'utf8').replace(
    /\/\*[\s\S]*?\*\//g,
    '',
  );
  it('transaction salt okunur ve sorgu başına süre sınırı var', () => {
    expect(kaynak).toContain("tx.$queryRawUnsafe('SET TRANSACTION READ ONLY')");
    expect(kaynak).toMatch(/SET LOCAL statement_timeout/);
  });
  it('sorgularda yazma deyimi yok', () => {
    for (const s of Object.values(SORGULAR)) {
      expect(s.sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\b/i);
    }
  });
});
