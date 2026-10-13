import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import { degerlendir } from './sinyal-hesap.service';
import { ON_KOSUL_NOTU, donusumPencereleri, gunEkle, type TxLike } from './sinyal-hesap';

/**
 * SİNYAL HESAPLAMA İŞİ — gerçek Postgres (PGlite), servisin GERÇEK sorgusu.
 *
 * KRİTİK İDDİALAR:
 *   · ön koşul yoksa iş SORGUDAN ÖNCE biter (sorgu sayısı sayılıyor),
 *   · sinyal yazılıyor, aynı gün tekrar koşunca ikinci satır açılmıyor,
 *   · kullanıcının kapattığı sinyal aynı şiddette kapalı kalıyor,
 *     kötüleşince yeniden açılıyor,
 *   · görülmeyen anomali 7 gün sonra kendiliğinden kapanıyor.
 */

let h: Harness;
const GUN = '2026-10-11';
const SIMDI = new Date('2026-10-12T06:00:00Z');
const KAMPANYA = '99999999-9999-9999-9999-999999999999';
const ANAHTAR = `anomali:harcama:artis:campaign:${KAMPANYA}`;

async function gunluk(gun: string, harcamaTl: number, gosterim = 10_000) {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
       impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, 'meta', 'campaign', $3, 'c-1', $4, '', $5, 200, 0, $6, 20, 0, 'TRY')
     ON CONFLICT DO NOTHING`,
    [IDS.client, IDS.adAccount, KAMPANYA, gun, gosterim, (BigInt(harcamaTl) * 1_000_000n).toString()],
  );
}

async function metrikIsi(gun: string) {
  await h.q(
    `INSERT INTO sync_jobs (client_id, ad_account_id, job_type, status, date_from, date_to)
     VALUES ($1, $2, 'insights_daily', 'succeeded', $3, $3)`,
    [IDS.client, IDS.adAccount, gun],
  );
}

/** Sorgu sayan sarmalayıcı: ön koşul kontrolünün ÇAĞRIDAN ÖNCE olduğunu sayıyla kanıtlar. */
function sayan(db: TxLike) {
  const sayac = { sorgu: 0, yazma: 0 };
  const sarili: TxLike = {
    $queryRaw: <T>(sql: Prisma.Sql) => {
      sayac.sorgu++;
      return db.$queryRaw<T>(sql);
    },
    $executeRaw: (sql: Prisma.Sql) => {
      sayac.yazma++;
      return db.$executeRaw(sql);
    },
  };
  return { sarili, sayac };
}

const db = () => h.db as unknown as TxLike;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(`UPDATE ad_accounts SET last_insights_sync_at = $1 WHERE id = $2`, [SIMDI.toISOString(), IDS.adAccount]);
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at, created_at)
     VALUES ($1, $2, $3, 'meta', 'c-1', 'Kampanya', 'active', 'none', now(), '2026-08-01')`,
    [KAMPANYA, IDS.adAccount, IDS.client],
  );
  for (let k = 1; k <= 6; k++) await gunluk(gunEkle(GUN, -7 * k), 100);
});

describe('ön koşul', () => {
  it('KRİTİK: günlük metrik yoksa iş sorgulardan ÖNCE biter ve notu "hesaplanmadı:" ile başlıyor', async () => {
    await gunluk(GUN, 400);
    const { sarili, sayac } = sayan(db());
    const r = await degerlendir(sarili, IDS.adAccount, GUN, SIMDI);
    expect(r.rows).toBe(0);
    expect(r.note.startsWith(ON_KOSUL_NOTU)).toBe(true);
    // Hesap + ön koşul: iki okuma, sıfır yazma. Ön koşul kontrolü silinirse
    // metrik/kampanya/reklam sorguları da koşar ve bu sayı büyür.
    expect(sayac).toEqual({ sorgu: 2, yazma: 0 });
    expect(await h.q(`SELECT 1 FROM sinyaller`)).toHaveLength(0);
  });

  it('atanmamış hesap: not yazılı, sinyal yok', async () => {
    await h.q(`UPDATE ad_accounts SET client_id = NULL WHERE id = $1`, [IDS.adAccount]);
    const r = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r.note).toContain('atanmamış');
  });
});

describe('yazma ve durum makinesi', () => {
  beforeEach(async () => {
    await gunluk(GUN, 400);
    await metrikIsi(GUN);
  });

  it('KRİTİK: harcama sıçraması sinyal olarak AÇIK yazılıyor; tekrar koşmak ikinci satır açmıyor', async () => {
    const r1 = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r1.yeni).toBeGreaterThan(0);
    expect(r1.note).toMatch(/bulgu \(yeni \d+/);
    const [s] = await h.q<{ durum: string; acilma_sayisi: number; org_id: string; varlik_adi: string; gun: string }>(
      `SELECT durum, acilma_sayisi, org_id::text AS org_id, varlik_adi, gun::text AS gun FROM sinyaller WHERE anahtar = $1`,
      [ANAHTAR],
    );
    expect(s).toEqual({ durum: 'acik', acilma_sayisi: 1, org_id: IDS.org, varlik_adi: 'Kampanya', gun: GUN });

    const once = (await h.q(`SELECT count(*)::int AS n FROM sinyaller`))[0];
    const r2 = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r2.yeni).toBe(0);
    expect((await h.q(`SELECT count(*)::int AS n FROM sinyaller`))[0]).toEqual(once);
  });

  it('hesap seviyesi satırı yoksa kampanya toplamından değerlendiriliyor ve notta yazıyor', async () => {
    const r = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r.note).toContain('kampanya toplamından');
    const [s] = await h.q(`SELECT seviye::text AS seviye FROM sinyaller WHERE anahtar = $1`, [
      `anomali:harcama:artis:account:${IDS.adAccount}`,
    ]);
    expect(s).toEqual({ seviye: 'account' });
  });

  it('KRİTİK: kapatılan sinyal aynı şiddette KAPALI kalıyor; kötüleşince yeniden açılıyor', async () => {
    await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    await h.q(
      `UPDATE sinyaller SET durum = 'kapatildi', kapatma_nedeni = 'kullanici', kapatma_z = z, kapatma_zamani = now() WHERE anahtar = $1`,
      [ANAHTAR],
    );
    const r = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r.yenidenAcilan).toBe(0);
    expect((await h.q(`SELECT durum FROM sinyaller WHERE anahtar = $1`, [ANAHTAR]))[0]).toEqual({ durum: 'kapatildi' });

    // Aynı gün çok daha büyük sıçrama (geri düzeltme işi yeniden yazdı).
    await h.q(`UPDATE insights_daily SET spend_micros = 2000000000 WHERE date = $1`, [GUN]);
    const r2 = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r2.yenidenAcilan).toBeGreaterThan(0);
    const [s] = await h.q<{ durum: string; acilma_sayisi: number; kapatma_nedeni: string | null }>(
      `SELECT durum, acilma_sayisi, kapatma_nedeni FROM sinyaller WHERE anahtar = $1`,
      [ANAHTAR],
    );
    expect(s).toEqual({ durum: 'acik', acilma_sayisi: 2, kapatma_nedeni: null });
  });

  it('KRİTİK: görülmeyen anomali 7 gün sonra KENDİLİĞİNDEN kapanıyor', async () => {
    await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    const gun2 = gunEkle(GUN, 7);
    await gunluk(gun2, 100);
    await metrikIsi(gun2);
    const sonra = new Date(SIMDI.getTime() + 8 * 86_400_000);
    await h.q(`UPDATE ad_accounts SET last_insights_sync_at = $1`, [sonra.toISOString()]);
    const r = await degerlendir(db(), IDS.adAccount, gun2, sonra);
    expect(r.kapanan).toBeGreaterThan(0);
    expect((await h.q(`SELECT durum, kapatma_nedeni FROM sinyaller WHERE anahtar = $1`, [ANAHTAR]))[0]).toEqual({
      durum: 'kendiliginden_kapandi',
      kapatma_nedeni: 'sure_doldu',
    });
  });

  it('sağlık: Meta reddedilmiş reklamı (sağlayıcı durumunu paused yapıyor) BULUNUYOR, düzelince kapanıyor', async () => {
    const SET = '88888888-8888-8888-8888-888888888888';
    const REKLAM = '77777777-7777-7777-7777-777777777777';
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'g-1', 'Set', 'active', 'none', now())`,
      [SET, KAMPANYA, IDS.adAccount, IDS.client],
    );
    await h.q(
      `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, effective_status, review_status, updated_at)
       VALUES ($1, $2, $3, $4, 'meta', 'a-1', 'Reklam', 'paused', 'DISAPPROVED', 'DISAPPROVED', now())`,
      [REKLAM, SET, IDS.adAccount, IDS.client],
    );
    await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    const anahtar = `saglik:reklam_onaysiz:-:ad:${REKLAM}`;
    expect((await h.q(`SELECT durum, onem FROM sinyaller WHERE anahtar = $1`, [anahtar]))[0]).toEqual({ durum: 'acik', onem: 'yuksek' });

    await h.q(`UPDATE ads SET review_status = 'APPROVED', effective_status = 'ACTIVE', status = 'active' WHERE id = $1`, [REKLAM]);
    await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect((await h.q(`SELECT durum FROM sinyaller WHERE anahtar = $1`, [anahtar]))[0]).toEqual({ durum: 'kendiliginden_kapandi' });
  });

  it('veri bayatsa gösterim/dönüşüm kontrolleri atlanıyor ve notta yazıyor', async () => {
    await h.q(`UPDATE ad_accounts SET last_insights_sync_at = '2026-10-01T00:00:00Z'`);
    const r = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(r.note).toContain('veri bayat');
  });
});

/**
 * ARAMA KAMPANYASI (Ö-4, 2026-10-13): aramalar `conversions`a yazılmıyor.
 * Form kampanyasından arama kampanyasına geçen hesapta "dönüşüm kesildi"
 * her sabah yanlış alarm olurdu; arama kampanyasının satırları sayıma girmiyor.
 */
describe('arama kampanyası ve dönüşüm sinyalleri', () => {
  async function gunD(gun: string, donusum: number) {
    await h.q(
      `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
         impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
       VALUES ($1, $2, 'meta', 'campaign', $3, 'c-1', $4, '', 10000, 200, 0, 100000000, $5, 0, 'TRY')
       ON CONFLICT (date, entity_level, entity_id, breakdown_key) DO UPDATE SET conversions = EXCLUDED.conversions`,
      [IDS.client, IDS.adAccount, KAMPANYA, gun, donusum],
    );
  }
  async function kur(hedef: string) {
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, optimization_goal, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'meta', 'set-1', 'Set', 'active', 'none', $4, now())`,
      [KAMPANYA, IDS.adAccount, IDS.client, hedef],
    );
    const p = donusumPencereleri(GUN);
    for (let d = p.onceki.bas; d <= p.onceki.son; d = gunEkle(d, 1)) await gunD(d, 20);
    for (let d = p.pencere.bas; d <= p.pencere.son; d = gunEkle(d, 1)) await gunD(d, 0);
    for (let d = gunEkle(p.pencere.son, 1); d <= GUN; d = gunEkle(d, 1)) await gunD(d, 0);
    await metrikIsi(GUN);
  }
  const kesildi = async () => (await h.q(`SELECT 1 FROM sinyaller WHERE kod = 'donusum_kesildi'`)).length;
  const donusumAnomalisi = async () => (await h.q(`SELECT 1 FROM sinyaller WHERE kod IN ('donusum', 'donusum_basi_maliyet')`)).length;

  it('KRİTİK: form kampanyasında dönüşüm kesilince sinyal VAR (kıyas)', async () => {
    await kur('LEAD_GENERATION');
    await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(await kesildi()).toBe(1);
  });

  it('KRİTİK: arama kampanyasında "dönüşüm kesildi" ve dönüşüm anomalisi YOK; sebep sayılıyor', async () => {
    await kur('QUALITY_CALL');
    const r = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    expect(await kesildi()).toBe(0);
    expect(await donusumAnomalisi()).toBe(0);
    expect(r.note).toContain('donusum_sayilmiyor');
  });

  /*
   * ESKİ BİR DÖNÜŞÜMSÜZ KAMPANYA HESABIN DÖNÜŞÜM ANOMALİSİNİ KAPATMAMALI
   * (Ajan 4, VIDEO kapısı). Liste QUALITY_CALL'dan POST_ENGAGEMENT, REACH ve
   * THRUPLAY'e genişleyince hesap satırı kuralı "hesapta BİR TANE bile
   * dönüşümsüz kampanya varsa" diyordu: Akıllı Boost'un aylar önce bitmiş tek
   * bir gönderi kampanyası, o hesabın hesap seviyesi dönüşüm anomalisini
   * SÜRESİZ kapatıyordu ve not dışında iz yoktu. Karar yalnız değerlendirme
   * penceresinde METRİĞİ olan kampanyalara bakmalı.
   */
  it('KRİTİK: penceresinde metriği olmayan eski boost kampanyası hesap dönüşüm anomalisini kapatmıyor', async () => {
    await kur('LEAD_GENERATION');
    const ESKI = '88888888-8888-8888-8888-888888888888';
    await h.q(
      `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at, created_at)
       VALUES ($1, $2, $3, 'meta', 'c-eski', 'Eski boost', 'paused', 'none', now(), '2025-01-01')`,
      [ESKI, IDS.adAccount, IDS.client],
    );
    await h.q(
      `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, optimization_goal, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, 'meta', 'set-eski', 'Set', 'paused', 'none', 'POST_ENGAGEMENT', now())`,
      [ESKI, IDS.adAccount, IDS.client],
    );
    const r = await degerlendir(db(), IDS.adAccount, GUN, SIMDI);
    const hesapDonusum = await h.q(
      `SELECT 1 FROM sinyaller WHERE seviye = 'account' AND kod IN ('donusum', 'donusum_basi_maliyet')`,
    );
    expect(hesapDonusum.length).toBeGreaterThan(0);
    expect(r.note).not.toContain('donusum_sayilmiyor');
  });
});
