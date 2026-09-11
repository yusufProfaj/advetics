import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';
import {
  raporSorgulari,
  SUZGEC_ALT,
  SUZGEC_DIZI,
  SEVIYE,
  TOP_ADS_LIMIT,
} from '../../prisma/olcum-rapor-sorgular';

/**
 * ═══ RAPOR ÖLÇÜM ARACI ═══
 *
 * Araç `reports.service.ts` içindeki `trackedAccounts()` alt sorgusunu
 * diziye çevirmenin kazandırıp kazandırmadığını ÜRETİMDE ölçüyor. Metrik
 * tarafında aynı düzeltme 1,6 saniye kazandırdı (f6972fe); rapor TEK
 * workspace kapsamında koştuğu için oradan otomatik olarak devralınamıyor.
 *
 * BU TESTİN İKİ İŞİ VAR:
 *
 *  1. ARAÇ ÜRETİMDE KOŞABİLİYOR MU. Bir teşhis aracı ancak arıza anında
 *     koşuluyor; SQL hatasını o an keşfetmek, aracı hiç yazmamış olmakla
 *     aynı şey. Sorgular bu yüzden `olcum-rapor-sorgular.ts` içinde ayrı
 *     duruyor ve burada GERÇEKTEN çalıştırılıyorlar.
 *
 *  2. İKİ VARYANT AYNI SONUCU VERİYOR MU. Ölçüm iki sorgunun süresini
 *     karşılaştırıyor; farklı satır kümesi döndüren iki sorgunun süresini
 *     karşılaştırmak hiçbir şey anlatmaz ve "düzeltme hızlandırdı" sonucunu
 *     uydurur.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const CLIENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER = '22222222-2222-2222-2222-222222222222';
const CONN = '33333333-3333-3333-3333-333333333333';
/** İzlemesi AÇIK hesap — satırları rapora girmeli. */
const ACC_ON = '44444444-4444-4444-4444-444444444444';
/** İzlemesi KAPALI hesap — satırları rapordan DÜŞMELİ. Süzgecin konusu bu. */
const ACC_OFF = '55555555-5555-5555-5555-555555555555';
const CAMPAIGN_ON = '66666666-6666-6666-6666-666666666666';
const CAMPAIGN_OFF = '6f6f6f6f-6f6f-6f6f-6f6f-6f6f6f6f6f6f';
const GROUP_ON = '77777777-7777-7777-7777-777777777777';
const AD_ON = '88888888-8888-8888-8888-888888888888';
const CREATIVE = '99999999-9999-9999-9999-999999999999';

const FROM = '2026-08-01';
const TO = '2026-08-31';
const GUN = '2026-08-10';

const yorumsuz = (yol: string) =>
  readFileSync(resolve(__dirname, yol), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

const OLCUM = yorumsuz('../../prisma/olcum-rapor.ts');
const SORGULAR = yorumsuz('../../prisma/olcum-rapor-sorgular.ts');
const PRISMA = yorumsuz('prisma.service.ts');
const RAPOR = yorumsuz('../modules/reports/reports.service.ts');

/** `set_config('app.X'` geçen her yerden X'i toplar. */
function gucAdlari(kaynak: string): string[] {
  const bulunan = [...kaynak.matchAll(/set_config\(\s*'(app\.[a-z_]+)'/g)].map((m) => m[1]!);
  return [...new Set(bulunan)].sort();
}

beforeAll(async () => {
  h = await createHarness();

  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Ajans', 'ajans', now())`, [ORG]);
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'A', 'a', now())`, [CLIENT, ORG]);
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1, $2, 'a@advetics.com', 'A', now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, NULL, 'meta', 'active', 'u1', 'BM', '\\x00', '{}', $3, now())`,
    [CONN, ORG, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1, $3, $5, $4, 'meta', 'act_on',  'Açık',  'TRY', 'Europe/Istanbul', true,  now()),
            ($2, $3, $5, $4, 'meta', 'act_off', 'Kapalı','TRY', 'Europe/Istanbul', false, now())`,
    [ACC_ON, ACC_OFF, ORG, CONN, CLIENT],
  );
  await h.q(
    `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $3, $4, 'meta', 'cmp_on',  'Açık kampanya',  'active', now()),
            ($2, $3, $5, 'meta', 'cmp_off', 'Kapalı kampanya','active', now())`,
    [CAMPAIGN_ON, CAMPAIGN_OFF, CLIENT, ACC_ON, ACC_OFF],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'ag1', 'Grup', 'active', now())`,
    [GROUP_ON, CAMPAIGN_ON, ACC_ON, CLIENT],
  );
  await h.q(
    `INSERT INTO creatives (id, ad_account_id, client_id, platform, external_id, headline, description, display_url, asset_urls, updated_at)
     VALUES ($1, $2, $3, 'meta', 'cr1', 'Başlık', 'Açıklama', 'ornek.com', '[]'::jsonb, now())`,
    [CREATIVE, ACC_ON, CLIENT],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, creative_id, updated_at)
     VALUES ($1, $2, $3, $4, 'meta', 'ad1', 'Reklam', 'active', $5, now())`,
    [AD_ON, GROUP_ON, ACC_ON, CLIENT, CREATIVE],
  );

  /*
   * HER TABLOYA İKİ SATIR: biri izlemesi AÇIK hesaptan, biri KAPALI.
   *
   * Tek satır yazsaydım "iki varyant aynı sonucu verdi" iddiası BOŞ olurdu:
   * süzgeci tamamen silsem de aynı sonucu verirdi. Kapalı hesabın satırı,
   * süzgecin GERÇEKTEN bir şey elediğini kanıtlıyor.
   */
  const insight = (acc: string, level: string, entity: string, spend: number) =>
    h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, impressions, clicks, spend_micros, conversions, conversion_value_micros,
          reach, currency, raw_metrics)
       VALUES ($1, $2, 'meta', $3::"EntityLevel", $4, 'x', $5::date, 100, 10, $6, 1, 1000,
               90, 'TRY', '{"actions":[{"action_type":"lead","value":"2"}]}'::jsonb)`,
      [CLIENT, acc, level, entity, GUN, spend],
    );
  await insight(ACC_ON, SEVIYE, CAMPAIGN_ON, 1_000_000);
  await insight(ACC_OFF, SEVIYE, CAMPAIGN_OFF, 9_000_000);
  await insight(ACC_ON, 'ad', AD_ON, 500_000);

  await h.q(
    `INSERT INTO insight_breakdowns
       (client_id, ad_account_id, platform, dimension, value, date, impressions, clicks,
        spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, 'meta', 'age', '25-34', $4::date, 100, 10, 1000000, 1, 0, 'TRY'),
            ($1, $3, 'meta', 'age', '35-44', $4::date, 100, 10, 9000000, 1, 0, 'TRY')`,
    [CLIENT, ACC_ON, ACC_OFF, GUN],
  );
  await h.q(
    `INSERT INTO keyword_insights
       (client_id, ad_account_id, external_criterion_id, keyword, match_type, date,
        impressions, clicks, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, 'k1', 'açık kelime',  'EXACT', $4::date, 100, 10, 1000000, 1, 0, 'TRY'),
            ($1, $3, 'k2', 'kapalı kelime','EXACT', $4::date, 100, 10, 9000000, 1, 0, 'TRY')`,
    [CLIENT, ACC_ON, ACC_OFF, GUN],
  );
  await h.q(
    `INSERT INTO search_term_insights
       (client_id, ad_account_id, term_hash, search_term, keyword_text, status, date,
        impressions, clicks, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, repeat('a', 64), 'açık terim',  'açık kelime',  'ADDED', $4::date, 100, 10, 1000000, 1, 0, 'TRY'),
            ($1, $3, repeat('b', 64), 'kapalı terim','kapalı kelime','ADDED', $4::date, 100, 10, 9000000, 1, 0, 'TRY')`,
    [CLIENT, ACC_ON, ACC_OFF, GUN],
  );
});

afterAll(async () => {
  await h.close();
});

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu ve beklenen yapıyı taşıyor', () => {
    expect(gucAdlari(PRISMA).length).toBeGreaterThan(5);
    expect(gucAdlari(OLCUM).length).toBeGreaterThan(5);
    expect(raporSorgulari({ clientId: CLIENT, from: FROM, to: TO }).length).toBeGreaterThan(5);
  });
});

describe('KRİTİK: ölçülen SQL GERÇEKTEN KOŞUYOR', () => {
  const sorgular = raporSorgulari({ clientId: CLIENT, from: FROM, to: TO });

  for (const s of sorgular) {
    it(`${s.ad} — iki varyant da koşuyor ve BİREBİR aynı satırları veriyor`, async () => {
      /*
       * Dizi varyantı `$1::uuid[]` bekliyor; üretimde o liste
       * `SELECT id FROM ad_accounts WHERE sync_enabled = true` ile
       * dolduruluyor. Burada da AYNI sorgudan doldurulmalı, elle yazılmış
       * bir listeden değil — elle yazmak, süzgecin ne süzdüğünü testin
       * kendisinin varsayması olurdu.
       */
      const izlenen = (
        await h.q<{ id: string }>('SELECT id FROM ad_accounts WHERE sync_enabled = true')
      ).map((r) => r.id);

      const alt = await h.q(s.sql(SUZGEC_ALT));
      const dizi = await h.q(s.sql(SUZGEC_DIZI), [izlenen]);
      expect(dizi).toEqual(alt);
    });
  }

  it('KRİTİK: süzgeç GERÇEKTEN eliyor — izlemesi kapalı hesap dışarıda', async () => {
    /*
     * Yukarıdaki "iki varyant aynı" iddiası süzgeç SİLİNDİĞİNDE de geçer:
     * ikisi de her şeyi döndürür. Elemenin olduğunu ayrıca kanıtlamak
     * gerekiyor ve kanıt TUTARDA: kapalı hesabın harcaması 9.000.000,
     * açığınki 1.000.000. Toplam 1.000.000 çıkıyorsa eleme çalışmış.
     */
    const sorgu = raporSorgulari({ clientId: CLIENT, from: FROM, to: TO }).find(
      (x) => x.ad === 'platformBlocks',
    );
    expect(sorgu, 'platformBlocks sorgusu bulunamadı — tarama boşa düştü').toBeDefined();

    const izlenen = (
      await h.q<{ id: string }>('SELECT id FROM ad_accounts WHERE sync_enabled = true')
    ).map((r) => r.id);

    const [satir] = await h.q<{ spend_micros: string }>(sorgu!.sql(SUZGEC_ALT));
    expect(String(satir?.spend_micros)).toBe('1000000');

    const [satirDizi] = await h.q<{ spend_micros: string }>(sorgu!.sql(SUZGEC_DIZI), [izlenen]);
    expect(String(satirDizi?.spend_micros)).toBe('1000000');
  });

  it('KRİTİK: `EXPLAIN ANALYZE` ile de koşuyor — araç onu kullanıyor', async () => {
    /*
     * Düz `SELECT` çalışıp `EXPLAIN`in düşmesi mümkün: parametre tipi
     * çıkarımı iki yolda aynı değil. Araç yalnızca `EXPLAIN` koşuyor, yani
     * sınanması gereken yol bu.
     */
    const izlenen = (
      await h.q<{ id: string }>('SELECT id FROM ad_accounts WHERE sync_enabled = true')
    ).map((r) => r.id);
    for (const s of raporSorgulari({ clientId: CLIENT, from: FROM, to: TO })) {
      const plan = await h.q(`EXPLAIN (ANALYZE, BUFFERS, TIMING) ${s.sql(SUZGEC_DIZI)}`, [izlenen]);
      expect(plan.length, `${s.ad} için plan boş döndü`).toBeGreaterThan(0);
    }
  });
});

describe('KRİTİK: ölçüm ÜRETİMDEKİ bağlamı taklit ediyor', () => {
  it('`withTenant` ile AYNI oturum değişkenlerini kuruyor', () => {
    /*
     * Eksik bir GUC hiçbir şeyi patlatmıyor: script koşuyor, plan üretiyor
     * ve o plan ÜRETİMDEKİNDEN BAŞKA oluyor, çünkü politikalar başka bir
     * dala düşüyor. Sonuç: yanlış yeri optimize etmek.
     */
    expect(gucAdlari(OLCUM)).toEqual(gucAdlari(PRISMA));
  });

  it('plan UYGULAMANIN rolüyle alınıyor, migrator ile DEĞİL', () => {
    expect(OLCUM).toContain(
      "const uygulama = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL })",
    );
    const bas = OLCUM.indexOf('async function olc(');
    const dilim = OLCUM.slice(bas, OLCUM.indexOf('\n}', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(100);
    expect(dilim).toContain('EXPLAIN (ANALYZE, BUFFERS, TIMING)');
  });

  it('KRİTİK: hiçbir şey KALICI olmuyor ve ŞEMA DEĞİŞMİYOR', () => {
    /*
     * `olcum-metrik.ts`in `--aday` bayrağı üretimde `must be owner of table`
     * ile düştü: uygulama rolü tablo sahibi değil ve OLMAMALI. Ayrıcalık
     * isteyen bir teşhis aracı, tam ihtiyaç duyulduğu anda koşamıyor.
     */
    expect(OLCUM).toContain('throw new GeriAl();');
    expect(OLCUM).not.toContain('CREATE INDEX');
    expect(OLCUM).not.toContain('ALTER TABLE');
    expect(OLCUM).not.toMatch(/\$queryRawUnsafe\(\s*`?\s*(INSERT|UPDATE|DELETE)/i);
  });
});

describe('KRİTİK: ölçülen sorgular SERVİSTEKİ sabitleri taşıyor', () => {
  /*
   * Sorgular `reports.service.ts`ten KOPYA ve bu bir borç: ayrışırlarsa
   * ölçüm başka bir sorgunun planını gösterir ve okuyan bunu göremez.
   * Ayrışmanın en sessiz biçimi bir SABİTİN değişmesi — `TOP_ADS_LIMIT`
   * 12'den 6'ya inse sorgu yine çalışır, plan yine üretilir ve yalnızca
   * ölçülen iş yarıya iner.
   */
  it('`TOP_ADS_LIMIT` ve toplam seviyesi servisle aynı', () => {
    const limit = RAPOR.match(/const TOP_ADS_LIMIT = (\d+);/)?.[1];
    expect(limit, 'TOP_ADS_LIMIT servis kaynağında bulunamadı').toBeDefined();
    expect(Number(limit)).toBe(TOP_ADS_LIMIT);

    expect(RAPOR).toContain(`const LEVEL = Prisma.sql\`'${SEVIYE}'::"EntityLevel"\``);
  });

  it('KRİTİK: ölçülen varyant servisin BUGÜNKÜ süzgecini taşıyor', () => {
    /*
     * `SUZGEC_ALT` ölçümün "bugünkü hâl" tarafı. Servis bir gün diziye
     * geçerse bu varyant artık bugünkü hâl olmaz ve ölçüm iki KURGU
     * karşılaştırır. Servisin kaynağı alt sorguyu taşıdığı sürece
     * karşılaştırma anlamlı.
     */
    expect(RAPOR).toMatch(/IN \(\s*\n?\s*SELECT id FROM ad_accounts WHERE sync_enabled = true/);
    expect(SORGULAR).toContain('SELECT id FROM ad_accounts WHERE sync_enabled = true');
  });

  it('KRİTİK: JOIN taşıyan sorgularda ALIAS düşmüyor', () => {
    /*
     * Alias'ı düşürmek `ad_accounts`/`clients` JOIN'li sorgularda
     * `client_id`yi belirsiz yapıyor; metrik düzeltmesinde tam olarak bu
     * yapıldı. Burada süzgeç `@A@` yer tutucusuyla yazılıyor, yani her
     * çağrının bir alias VERMESİ zorunlu — ama `@A@`nın yerine hiçbir şey
     * konmadan sorguya girmesi de mümkün.
     */
    for (const s of raporSorgulari({ clientId: CLIENT, from: FROM, to: TO })) {
      for (const varyant of [SUZGEC_ALT, SUZGEC_DIZI]) {
        expect(s.sql(varyant), `${s.ad} yer tutucuyu çözmemiş`).not.toContain('@A@');
        expect(s.sql(varyant), `${s.ad} alias'sız süzgeç kurmuş`).not.toContain(' .ad_account_id');
      }
    }
  });
});
