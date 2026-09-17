import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ "HANGİ KREATİF İŞE YARADI" SORGUSU ═══
 *
 * Sıralama kararı saf fonksiyonda ve orada sınanıyor; burada sınanan şey
 * TOPLAMA. Üç hata da bu üründe daha önce görüldü ve üçü de sessiz:
 *
 *   1. Kırılım satırlarını da toplamak (aynı gösterimi tekrar saymak).
 *   2. Pencereyi kaçırmak.
 *   3. Aynı kreatifle yayınlanmış İKİ reklamı ayrı satır sanmak — kreatif
 *      bazında gruplanmazsa liste aynı metni iki kez gösterir.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CONN = '33333333-3333-3333-3333-333333333333';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HESAP = '44444444-4444-4444-4444-444444444444';
const KAMPANYA = '55555555-5555-5555-5555-555555555555';
const GRUP = '66666666-6666-6666-6666-666666666666';
const KREATIF = '77777777-7777-7777-7777-777777777777';
const REKLAM_A = '88888888-8888-8888-8888-888888888888';
const REKLAM_B = '99999999-9999-9999-9999-999999999999';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1,'A','a',now())`, [ORG]);
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1,$2,'a@a.com','A',now())`,
    [USER, ORG],
  );
  await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'W','w',now())`, [CLIENT, ORG]);
  await h.q(
    `INSERT INTO platform_connections
       (id, org_id, client_id, platform, status, external_user_id, account_label,
        access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1,$2,NULL,'meta','active','u1','BM','\\x00','{}',$3,now())`,
    [CONN, ORG, USER],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'meta','act_1','Hesap','TRY','Europe/Istanbul',true,now())`,
    [HESAP, ORG, CLIENT, CONN],
  );
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES ($1,$2,$3,'meta','c-1','K',now())`,
    [KAMPANYA, HESAP, CLIENT],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, updated_at)
     VALUES ($1,$2,$3,$4,'meta','g-1','G',now())`,
    [GRUP, KAMPANYA, HESAP, CLIENT],
  );
  await h.q(
    `INSERT INTO creatives
       (id, ad_account_id, client_id, platform, external_id, headline, primary_text,
        asset_urls, updated_at)
     VALUES ($1,$2,$3,'meta','cr-1','Yaz indirimi','Hemen bak',
             '["https://cdn.example/1.jpg"]'::jsonb, now())`,
    [KREATIF, HESAP, CLIENT],
  );
  // AYNI KREATİFLE İKİ REKLAM: liste tek satır göstermeli.
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id,
                      name, creative_id, updated_at)
     VALUES ($1,$3,$4,$5,'meta','a-1','A',$6,now()),
            ($2,$3,$4,$5,'meta','a-2','B',$6,now())`,
    [REKLAM_A, REKLAM_B, GRUP, HESAP, CLIENT, KREATIF],
  );

  const satir = (ad: string, gun: string, kirilim: string, imp: number, clk: number): string =>
    `('${CLIENT}','${HESAP}','meta','ad','${ad}','x',${gun},'${kirilim}',${imp},${clk},1000,0,0,'TRY')`;

  await h.q(`
    INSERT INTO insights_daily
      (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
       date, breakdown_key, impressions, clicks, spend_micros, conversions,
       conversion_value_micros, currency)
    VALUES
      ${satir(REKLAM_A, 'current_date', '', 600, 30)},
      ${satir(REKLAM_B, 'current_date', '', 600, 30)},
      ${satir(REKLAM_A, 'current_date', 'age:25-34', 600, 30)},
      ${satir(REKLAM_A, "current_date - 200", '', 5000, 500)}
  `);
});

/** Servisin KENDİ sorgusu — kopya değil. */
function servisSorgusu(gun: number): string {
  const kaynak = readFileSync(
    join(__dirname, '..', 'modules', 'draft-tree', 'creative.service.ts'),
    'utf8',
  );
  const bas = kaynak.indexOf('async performans');
  if (bas === -1) throw new Error('performans bulunamadı — tarama boşa düştü');
  const im = 'Prisma.sql`';
  const sqlBas = kaynak.indexOf(im, bas);
  const sqlSon = kaynak.indexOf('`', sqlBas + im.length);
  const sql = kaynak.slice(sqlBas + im.length, sqlSon);
  if (!sql.includes('FROM insights_daily')) throw new Error('yanlış sorgu yakalandı');
  return sql.replace('${clientId}', `'${CLIENT}'`).replace('${gun}', String(gun));
}

describe('kreatif bazında toplama', () => {
  it('KRİTİK: aynı kreatifle iki reklam TEK satır', async () => {
    const rows = await h.q<{ id: string; ad_count: number }>(servisSorgusu(90));
    expect(rows).toHaveLength(1);
    expect(Number(rows[0]!.ad_count)).toBe(2);
  });

  it('KRİTİK: KIRILIM satırları toplama girmiyor', async () => {
    // 600 + 600 = 1200. Kırılım da sayılsaydı 1800 olurdu.
    const rows = await h.q<{ impressions: number }>(servisSorgusu(90));
    expect(Number(rows[0]!.impressions)).toBe(1200);
  });

  it('KRİTİK: pencere DIŞINDAKİ gün sayılmıyor', async () => {
    // 200 gün önceki satır 90 günlük pencerede yok; olsaydı 6200 olurdu.
    const rows = await h.q<{ impressions: number }>(servisSorgusu(90));
    expect(Number(rows[0]!.impressions)).toBe(1200);
  });

  it('pencere GENİŞLETİLİNCE eski gün de giriyor', async () => {
    // Ters yön: pencereyi hiç uygulamayan bir sorgu yukarıdaki testi de
    // geçerdi; bu test parametrenin GERÇEKTEN kullanıldığını gösteriyor.
    const rows = await h.q<{ impressions: number }>(servisSorgusu(365));
    expect(Number(rows[0]!.impressions)).toBe(6200);
  });

  it('metin ve görsel satırda', async () => {
    const rows = await h.q<{ headline: string; asset_urls: unknown }>(servisSorgusu(90));
    expect(rows[0]!.headline).toBe('Yaz indirimi');
    expect(JSON.stringify(rows[0]!.asset_urls)).toContain('cdn.example');
  });
});
