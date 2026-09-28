import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, IDS, seedTenant, type Harness } from '../../test/pglite-harness';
import { senkronSorgulari, SON_IS_LIMITI } from '../../prisma/olcum-senkron-sorgular';

/**
 * ═══ SENKRONİZASYON ÖLÇÜM ARACI ═══
 *
 * Araç üretimde koşuyor ve orada bir SQL hatası, arızanın ortasında ilk kez
 * görülürdü. Burada her sorgu gerçek şemaya karşı koşuyor ve iki şey daha
 * kanıtlanıyor: anlamı değişmeyen her aday bugünkü sorguyla BİREBİR aynı
 * sonucu veriyor (yoksa sürelerini karşılaştırmak anlamsız) ve araç
 * üretimdeki RLS bağlamını taklit ediyor.
 */
let h: Harness;

const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const OLCUM = yorumsuz('../../prisma/olcum-senkron.ts');
const PRISMA = yorumsuz('prisma.service.ts');
const DENETLEYICI = yorumsuz('../modules/sync/sync.controller.ts');

function gucAdlari(kaynak: string): string[] {
  const bulunan = [...kaynak.matchAll(/set_config\(\s*'(app\.[a-z_]+)'/g)].map((m) => m[1]!);
  return [...new Set(bulunan)].sort();
}

const ACC_2 = '66666666-6666-6666-6666-666666666666';
const ACC_HAVUZ = '77777777-7777-7777-7777-777777777777';

beforeAll(async () => {
  h = await createHarness();
  await seedTenant(h);
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name,
                              currency, timezone, updated_at)
     VALUES ($1, $3, $4, $5, 'meta', 'act_2', 'İkinci', 'TRY', 'Europe/Istanbul', now()),
            ($2, $3, NULL, $5, 'meta', 'act_h', 'Havuz', 'TRY', 'Europe/Istanbul', now())`,
    [ACC_2, ACC_HAVUZ, IDS.org, IDS.client, IDS.connection],
  );
  /*
   * DAĞINIK İŞ GEÇMİŞİ: aynı hesap ve türde birden çok iş (en yenisi
   * seçilmeli), her durumdan en az bir tane (sayaçların her dalı dolsun) ve
   * havuz hesabının işi (atanmamış hesap, adayın bilerek dışarıda bıraktığı).
   */
  const isler: Array<[string, string, string, number, string]> = [
    [IDS.adAccount, 'structure', 'succeeded', 10, '3 days'],
    [IDS.adAccount, 'structure', 'failed', 0, '1 day'],
    [IDS.adAccount, 'insights_daily', 'succeeded', 0, '2 days'],
    [IDS.adAccount, 'insights_daily', 'succeeded', 40, '1 hour'],
    [ACC_2, 'insights_backfill', 'running', 0, '5 minutes'],
    [ACC_2, 'insights_realtime', 'succeeded', 0, '10 days'],
    [ACC_2, 'organic_posts', 'succeeded', 0, '1 day'],
    [ACC_HAVUZ, 'structure', 'queued', 0, '1 minute'],
  ];
  for (const [acc, tur, durum, satir, once] of isler) {
    await h.q(
      `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, rows_upserted, created_at)
       VALUES ($1, $2, $3::"SyncJobType", $4::"SyncJobStatus", $5, now() - $6::interval)`,
      [acc === ACC_HAVUZ ? IDS.client : IDS.client, acc, tur, durum, satir, once],
    );
  }
});

afterAll(async () => {
  await h.close();
});

const sorgu = (ad: string) => {
  const s = senkronSorgulari().find((x) => x.ad === ad);
  if (!s) throw new Error(`"${ad}" bulunamadı — tarama boşa düştü`);
  return s;
};

describe('tarama boşa düşmüyor', () => {
  it('beş parça ve sekiz iş kaydı', async () => {
    expect(senkronSorgulari()).toHaveLength(5);
    const [n] = await h.q<{ n: string }>('SELECT count(*) AS n FROM sync_jobs');
    expect(Number(n?.n)).toBe(8);
  });
});

describe('KRİTİK: her sorgu gerçek şemada KOŞUYOR', () => {
  for (const s of senkronSorgulari()) {
    it(`${s.ad}`, async () => {
      for (const sql of [...s.bugun, ...(s.aday ?? [])]) {
        await expect(h.q(sql)).resolves.toBeDefined();
        await expect(h.q(`EXPLAIN (ANALYZE, TIMING) ${sql}`)).resolves.toBeDefined();
      }
    });
  }
});

describe('KRİTİK: aday AYNI soruyu soruyor', () => {
  it('sayaçlar: dört sorgu ile tek FILTER sorgusu aynı sayıları veriyor', async () => {
    const s = sorgu('iş sayaçları');
    const bugun: number[] = [];
    for (const sql of s.bugun) bugun.push((await h.q<{ n: number }>(sql))[0]!.n);
    const [a] = await h.q<{ toplam: number; dusen: number; bos: number; kosan: number }>(s.aday![0]!);
    expect([a!.toplam, a!.dusen, a!.bos, a!.kosan]).toEqual(bugun);
    // Fixture her dalı dolduruyor: sıfır = sıfır bir karşılaştırma değil.
    expect(bugun).toEqual([8, 1, 2, 2]);
  });

  it('son iş: atanmış hesaplar için DISTINCT ON ile LATERAL aynı satırları veriyor', async () => {
    /*
     * Aday bilerek yalnızca ATANMIŞ hesapları geziyor; uç da yalnızca
     * onların son işini kullanıyor (`sonIsler.get(a.id)`, `a` atanmış
     * hesaplar). Havuz hesabının işi bugünkü sorguda var, adayda yok ve bu
     * doğru.
     */
    const s = sorgu('hesap başına son iş');
    const atanmis = new Set([IDS.adAccount, ACC_2]);
    const anahtar = (r: { ad_account_id: string; job_type: string; id: string | number }) =>
      `${r.ad_account_id}|${r.job_type}|${r.id}`;
    const bugun = (await h.q<{ ad_account_id: string; job_type: string; id: string }>(s.bugun[0]!))
      .filter((r) => atanmis.has(r.ad_account_id))
      .map(anahtar)
      .sort();
    const aday = (await h.q<{ ad_account_id: string; job_type: string; id: string }>(s.aday![0]!))
      .map(anahtar)
      .sort();
    expect(aday).toEqual(bugun);
    expect(aday).toHaveLength(5);
  });

  it('son 7 gün adayı AÇIKÇA anlam değiştiren olarak işaretli', () => {
    expect(sorgu('iş sayaçları (son 7 gün)').anlamDegisiyor).toBe(true);
    for (const s of senkronSorgulari().filter((x) => x.ad !== 'iş sayaçları (son 7 gün)')) {
      expect(s.anlamDegisiyor, s.ad).toBeUndefined();
    }
  });
});

describe('KRİTİK: ölçüm üretimdeki bağlamı ve ucun sabitlerini taşıyor', () => {
  it('`withTenant` ile AYNI oturum değişkenleri', () => {
    // Eksik bir GUC politikaları başka bir dala düşürür ve plan yanıltır.
    expect(gucAdlari(OLCUM)).toEqual(gucAdlari(PRISMA));
  });

  it('plan UYGULAMANIN rolüyle alınıyor', () => {
    expect(OLCUM).toContain(
      'const uygulama = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })',
    );
    expect(OLCUM).toContain('await uygulama');
  });

  it('hiçbir şey kalıcı olmuyor, şema değişmiyor', () => {
    expect(OLCUM).toContain('throw new GeriAl();');
    expect(OLCUM).not.toMatch(/CREATE INDEX|ALTER TABLE/);
    expect(OLCUM).not.toMatch(/\$queryRawUnsafe\(\s*`?\s*(INSERT|UPDATE|DELETE)/i);
  });

  it('son işler limiti uçtakiyle aynı', () => {
    const limit = DENETLEYICI.match(/const RECENT_JOB_LIMIT = (\d+);/)?.[1];
    expect(limit, 'sabit bulunamadı — tarama boşa düştü').toBeDefined();
    expect(Number(limit)).toBe(SON_IS_LIMITI);
  });

  it('metrik iş listesi uçla AYNI dosyadan', () => {
    const SORGULAR = yorumsuz('../../prisma/olcum-senkron-sorgular.ts');
    expect(SORGULAR).toContain("from '../src/modules/sync/metrik-isleri'");
    expect(DENETLEYICI).toContain("from './metrik-isleri'");
  });
});
