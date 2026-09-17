import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from '../../test/pglite-harness';

/**
 * ═══ "YAYINDA OLANLAR" LİSTESİNİN TOPLAMASI ═══
 *
 * Bu sorgu bir EKRANI besliyor ve ekrandaki sayı yanlışsa kimse fark etmez:
 * harcama toplamı sessizce şişer ya da eksilir. Üç toplama hatası bu üründe
 * daha önce görüldü ve üçü de burada sınanıyor:
 *
 *   1. KIRILIM SATIRLARINI DA TOPLAMAK. `insights_daily` yaş/cinsiyet/şehir
 *      kırılımlarını AYNI tabloda tutuyor (`breakdown_key <> ''`); onları da
 *      toplamak aynı harcamayı kırılım sayısı kadar tekrar saymak demek.
 *   2. PENCEREYİ KAÇIRMAK. "Son 7 gün" dışındaki satırları toplamak.
 *   3. VERİSİ OLMAYAN KAMPANYAYI SIFIR GÖSTERMEK. "Hiç harcamadı" ile
 *      "veri gelmedi" aynı şey değil; sorgu NULL döndürüyor, ekran ayırıyor.
 *
 * Sorgu teste KOPYALANMIYOR, servisin kaynağından ÇIKARILIYOR: kopya
 * düzeltilmiş hâli taşır ve servis bozulsa bile test yeşil kalırdı.
 */
let h: Harness;

const ORG = '11111111-1111-1111-1111-111111111111';
const USER = '22222222-2222-2222-2222-222222222222';
const CONN = '33333333-3333-3333-3333-333333333333';
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HESAP = '44444444-4444-4444-4444-444444444444';
const KAMPANYA = '55555555-5555-5555-5555-555555555555';
const VERISIZ = '66666666-6666-6666-6666-666666666666';

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1,'Ajans','ajans',now())`, [ORG]);
  await h.q(
    `INSERT INTO users (id, org_id, email, full_name, updated_at) VALUES ($1,$2,'a@a.com','A',now())`,
    [USER, ORG],
  );
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1,$2,'W','w',now())`,
    [CLIENT, ORG],
  );
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
     VALUES ($1,$2,$3,$4,'meta','act_1','Ana Hesap','TRY','Europe/Istanbul',true,now())`,
    [HESAP, ORG, CLIENT, CONN],
  );
  await h.q(
    `INSERT INTO campaigns
       (id, ad_account_id, client_id, platform, external_id, name, status,
        effective_status, budget_mode, budget_amount_micros, updated_at)
     VALUES ($1,$3,$4,'meta','c-1','Yaz kampanyası','active','ACTIVE','daily',50000000,now()),
            ($2,$3,$4,'meta','c-2','Veri gelmeyen','active','ACTIVE','daily',10000000,now())`,
    [KAMPANYA, VERISIZ, HESAP, CLIENT],
  );

  const satir = (gun: string, kirilim: string, spend: number, imp: number, clk: number): string =>
    `('${CLIENT}','${HESAP}','meta','campaign','${KAMPANYA}','c-1',${gun},'${kirilim}',${imp},${clk},${spend},1,0,'TRY')`;

  await h.q(`
    INSERT INTO insights_daily
      (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
       date, breakdown_key, impressions, clicks, spend_micros, conversions,
       conversion_value_micros, currency)
    VALUES
      -- SON 7 GÜN, KIRILIMSIZ: sayılacak olanlar
      ${satir('current_date', '', 1_000_000, 100, 10)},
      ${satir("current_date - 3", '', 2_000_000, 200, 20)},
      -- AYNI GÜNÜN KIRILIMI: sayılmamalı, yoksa harcama iki katı görünür
      ${satir('current_date', 'age:25-34', 1_000_000, 100, 10)},
      -- PENCERE DIŞI: sayılmamalı
      ${satir("current_date - 30", '', 9_000_000, 900, 90)}
  `);
});

/** Servisin KENDİ sorgusu — kopya değil. */
function servisSorgusu(): string {
  const kaynak = readFileSync(
    join(__dirname, '..', 'modules', 'campaign-actions', 'campaign-actions.service.ts'),
    'utf8',
  );
  const bas = kaynak.indexOf('async canliListe');
  if (bas === -1) throw new Error('canliListe bulunamadı — tarama boşa düştü');

  /*
   * METOTTAKİ İLK ŞABLON ARANAN SORGU DEĞİL.
   *
   * `canliListe` içinde birden çok `Prisma.sql` var: biri platform
   * süzgecinin kendisi, biri ana sorgu, biri sayım. İlkini almak — ilk
   * yazımda öyleydi — süzgeç parçasını yakalayıp "yanlış sorgu" ile
   * düşürüyordu. Doğrusu: şablonları sırayla gez, ARADIĞIN tabloyu
   * içereni al.
   */
  const im = 'Prisma.sql`';
  let sql: string | null = null;
  for (let i = kaynak.indexOf(im, bas); i !== -1; i = kaynak.indexOf(im, i + im.length)) {
    const aday = kaynak.slice(i + im.length, kaynak.indexOf('`', i + im.length));
    if (aday.includes('FROM campaigns c')) {
      sql = aday;
      break;
    }
  }
  if (sql === null) throw new Error('ana sorgu bulunamadı — tarama boşa düştü');
  /*
   * Şablondaki bağlı parametrelerin testteki karşılıkları. `platformSuzgeci`
   * bir Prisma parçası: testte platform süzgeci yok, boş dizeyle karşılığı
   * "bütün platformlar" oluyor — servisin `Prisma.empty` dalıyla aynı.
   */
  return sql
    .replace('${clientId}', `'${CLIENT}'`)
    .replaceAll('${gun}', '7')
    .replaceAll('${platformSuzgeci}', '')
    .replace('${CANLI_LISTE_SINIRI}', '50');
}

describe('son 7 gün toplamı', () => {
  it('KRİTİK: KIRILIM satırları toplama GİRMİYOR', async () => {
    const rows = await h.q<{ id: string; spend_micros: string | null }>(servisSorgusu());
    const kampanya = rows.find((r) => r.id === KAMPANYA);
    // 1.000.000 + 2.000.000 = 3.000.000. Kırılım satırı da sayılsaydı
    // 4.000.000, pencere dışı da sayılsaydı 13.000.000 olurdu.
    expect(kampanya?.spend_micros).toBe('3000000');
  });

  it('KRİTİK: verisi olmayan kampanya SIFIR değil BOŞ', async () => {
    /*
     * "Hiç harcamadı" ile "veri gelmedi" aynı şey değil: birincisinde
     * kampanyaya bakılır, ikincisinde senkronizasyona. Sıfır göstermek
     * kullanıcıyı yanlış yere gönderir.
     */
    const rows = await h.q<{ id: string; spend_micros: string | null }>(servisSorgusu());
    expect(rows.find((r) => r.id === VERISIZ)?.spend_micros).toBeNull();
  });

  it('tıklama ve gösterim de aynı pencereden', async () => {
    const rows = await h.q<{ id: string; clicks: number; impressions: number }>(servisSorgusu());
    const k = rows.find((r) => r.id === KAMPANYA);
    expect(Number(k?.clicks)).toBe(30);
    expect(Number(k?.impressions)).toBe(300);
  });

  it('hesap adı ve para birimi satırda', async () => {
    const rows = await h.q<{ ad_account_name: string; currency: string }>(servisSorgusu());
    expect(rows[0]?.ad_account_name).toBe('Ana Hesap');
    expect(rows[0]?.currency).toBe('TRY');
  });

  it('KRİTİK: harcaması olan kampanya ÜSTTE', async () => {
    // Sıralama ekranın işini belirliyor: para harcayan kampanya önce
    // görünmeli, alfabetik sıra o kararı gizler.
    const rows = await h.q<{ id: string }>(servisSorgusu());
    expect(rows[0]?.id).toBe(KAMPANYA);
  });
});
