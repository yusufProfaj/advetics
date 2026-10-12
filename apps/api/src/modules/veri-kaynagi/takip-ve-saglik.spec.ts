import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { KAYNAK_TANIMI } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { TxLike } from '../sinyal/sinyal-hesap';
import { kaynakSaglikBulgulari } from './kaynak-saglik';
import { kiyasBitisi, siteSatirlari, takipHesapla, type PlatformKampanyasi, type SiteKampanyaSatiri } from './takip-hesap';

/**
 * ═══ TAKİP AÇIĞI HESABI + F1 SAĞLIK KONTROLLERİ ═══
 *
 * Eşleme ve takip açığı ÇALIŞTIRILARAK sınanıyor (kaynak taraması değil):
 * bir eşleme hatası yanlış kampanyaya dönüşüm yazar ve hiçbir hata düşmez.
 */

const k = (id: string, platform: 'google' | 'meta', externalId: string, ad: string, donusum: number, tiklama: number): PlatformKampanyasi => ({
  id,
  adAccountId: IDS.adAccount,
  platform,
  externalId,
  ad,
  donusum,
  tiklama,
});
const s = (kaynakOrtam: string, kampanyaAdi: string | null, kampanyaKimligi: string | null, ads: string | null, anahtarEtkinlik: number, oturum = 0): SiteKampanyaSatiri => ({
  kaynakOrtam,
  kampanyaAdi,
  kampanyaKimligi,
  adsKampanyaKimligi: ads,
  anahtarEtkinlik,
  oturum,
});

describe('takipHesapla', () => {
  const kampanyalar = [
    k('g1', 'google', '24337936076', 'Konut Arama', 96, 2910),
    k('m1', 'meta', '120210000001', 'Bornova Lansman Form', 142, 3388),
    k('m2', 'meta', '120210000002', 'Yeniden Pazarlama', 74, 1017),
    k('m3', 'meta', '120210000003', 'Aynı Ad', 5, 50),
    k('m4', 'meta', '120210000004', 'Aynı Ad', 5, 50),
  ];

  it('KRİTİK: Google kimlikle, Meta utm kimliğiyle ve adla eşlenir; etiketler doğru', () => {
    const r = takipHesapla(kampanyalar, [
      s('google / cpc', 'Konut Arama', '(not set)', '24337936076', 88, 2500),
      s('facebook / paid_social', '120210000001', '(not set)', null, 61, 3000),
      s('ig / paid_social', 'yeniden pazarlama', null, null, 0, 800),
    ]);
    const bul = (id: string) => r.satirlar.find((x) => x.kampanyaId === id)!;
    expect(bul('g1')).toMatchObject({ siteDonusum: 88, siteOturum: 2500, etiket: 'uyumlu' });
    expect(bul('m1')).toMatchObject({ siteDonusum: 61, etiket: 'platform_fazla' });
    // Ad eşlemesi Türkçe küçük harfle; site 0 gördü.
    expect(bul('m2')).toMatchObject({ siteDonusum: 0, siteOturum: 800, etiket: 'site_hic_gormuyor' });
  });

  it('KRİTİK: aynı adlı iki kampanyada biri SEÇİLMEZ, "ad_belirsiz" sayılır ve pay ücretli trafikten', () => {
    const r = takipHesapla(kampanyalar, [
      s('facebook / cpc', 'Aynı Ad', null, null, 6),
      s('google / organic', 'x', null, null, 100),
      s('google / cpc', 'Konut Arama', null, '24337936076', 4),
    ]);
    expect(r.satirlar.find((x) => x.kampanyaId === 'm3')!.siteDonusum).toBe(0);
    expect(r.eslenemeyen.nedenler).toEqual({ ad_belirsiz: 6 });
    // Organik 100 etkinlik paydaya GİRMEZ: 6 / (6 + 4).
    expect(r.eslenemeyen.pay).toBeCloseTo(0.6);
  });

  it('düşük hacim "veri_yetersiz"; ne tıklama ne site verisi olan kampanya tabloya girmez', () => {
    const r = takipHesapla([k('a', 'meta', '1', 'A', 3, 40), k('b', 'meta', '2', 'B', 0, 0)], [s('fb / cpc', '1', null, null, 1)]);
    expect(r.satirlar.map((x) => [x.kampanyaId, x.etiket])).toEqual([['a', 'veri_yetersiz']]);
  });

  it('kıyas bitişi: bugün ve son 2 gün dışarıda', () => {
    expect(kiyasBitisi('2026-10-14', '2026-10-14')).toBe('2026-10-11');
    expect(kiyasBitisi('2026-10-01', '2026-10-14')).toBe('2026-10-01');
  });
});

let h: Harness;
const KAYNAK = 'cdcdcdcd-cdcd-4dcd-8dcd-cdcdcdcdcdcd';
const KAMP = 'efefefef-efef-4fef-8fef-efefefefefef';
const SIMDI = new Date('2026-10-14T09:00:00Z');
const GUN = '2026-10-13';
const db = () => h.db as unknown as TxLike;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.reset();
  await seedTenant(h, { platform: 'meta', externalId: 'act_1' });
  await h.q(`UPDATE platform_connections SET granted_scopes = $1`, [[KAYNAK_TANIMI.ga4.scope!]]);
  await h.q(
    `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $2, $3, 'meta', '120210000001', 'Bornova', 'active', now())`,
    [KAMP, IDS.client, IDS.adAccount],
  );
});

async function kaynakKur(p: { yapi?: string; yapiZamani?: Date | null; cekim?: Date | null } = {}) {
  await h.q(
    `INSERT INTO veri_kaynaklari (id, org_id, client_id, tur, dis_kimlik, ad, connection_id, durum, yapi, yapi_zamani, son_basarili_cekim)
     VALUES ($1, $2, $3, 'ga4', '312845771', 'Site', $4, 'etkin', $5::jsonb, $6, $7)`,
    [
      KAYNAK,
      IDS.org,
      IDS.client,
      IDS.connection,
      p.yapi ?? '{"anahtarEtkinlikler": ["generate_lead"]}',
      p.yapiZamani === undefined ? SIMDI.toISOString() : p.yapiZamani?.toISOString() ?? null,
      p.cekim === undefined ? SIMDI.toISOString() : p.cekim?.toISOString() ?? null,
    ],
  );
}

async function tiklama(gun: string, n: number, donusum = 0) {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
       impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, 'meta', 'campaign', $3, '120210000001', $4, '', 1000, $5, 0, 0, $6, 0, 'TRY') ON CONFLICT DO NOTHING`,
    [IDS.client, IDS.adAccount, KAMP, gun, n, donusum],
  );
}

async function oturum(gun: string, n: number, kampanya: string | null = '120210000001', ortam = 'facebook / paid_social', hash = 'a') {
  await h.q(
    `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, kampanya_adi, oturum)
     VALUES ($1, $2, repeat($7, 64), $3, $4, $5, $6, $8)`,
    [gun, KAYNAK, IDS.client, IDS.org, ortam, kampanya, hash, n],
  );
}

const girdi = () => ({ clientId: IDS.client, adAccountId: IDS.adAccount, platform: 'meta' as const, hesapAdi: 'Hesap', gun: GUN, simdi: SIMDI });

describe('siteSatirlari', () => {
  it('KRİTİK: oturum etkinlik sayısı kadar KATLANMAZ (iki ayrı sorgu, JOIN yok)', async () => {
    await kaynakKur();
    await oturum('2026-10-10', 100);
    for (const e of ['generate_lead', 'click_to_call', 'purchase']) {
      await h.q(
        `INSERT INTO ga4_anahtar_etkinlik_gunluk (gun, veri_kaynagi_id, satir_hash, etkinlik, client_id, org_id, kaynak_ortam, kampanya_adi, anahtar_etkinlik)
         VALUES ('2026-10-10', $1, repeat('a', 64), $2, $3, $4, 'facebook / paid_social', '120210000001', 2)`,
        [KAYNAK, e, IDS.client, IDS.org],
      );
    }
    const r = await siteSatirlari(db(), IDS.client, '2026-10-01', '2026-10-13');
    expect(r).toEqual([{ kaynakOrtam: 'facebook / paid_social', kampanyaAdi: '120210000001', kampanyaKimligi: null, adsKampanyaKimligi: null, anahtarEtkinlik: 6, oturum: 100 }]);
  });
});

describe('F1 sağlık kontrolleri (sinyal işi)', () => {
  it('KRİTİK: GA4 kaynağı yoksa dört kontrol KOŞMUŞ sayılır ve bulgu üretmez (eski sinyal kapanabilsin)', async () => {
    const r = await kaynakSaglikBulgulari(db(), girdi());
    expect(r.bulgular).toEqual([]);
    expect([...r.kosan].sort()).toEqual(['ga4_anahtar_etkinlik_yok', 'ga4_veri_gelmiyor', 'takip_acigi', 'utm_eksik']);
  });

  it('KRİTİK: tıklama ≥ 100, oturum 0 ve çekim tazeyse "Analytics veri almıyor"', async () => {
    await kaynakKur();
    for (const g of ['2026-10-09', '2026-10-10', '2026-10-11']) await tiklama(g, 40);
    const r = await kaynakSaglikBulgulari(db(), girdi());
    const b = r.bulgular.find((x) => x.kod === 'ga4_veri_gelmiyor');
    expect(b).toMatchObject({ seviye: 'account', varlikId: IDS.adAccount, kanit: { tiklama: 120 } });
  });

  it('KRİTİK (mutasyon M6): çekim bayatsa kontrol SUSAR ve koşmamış sayılır (bilinmeyen = yok değil)', async () => {
    await kaynakKur({ cekim: new Date('2026-10-10T00:00:00Z') });
    for (const g of ['2026-10-09', '2026-10-10', '2026-10-11']) await tiklama(g, 40);
    const r = await kaynakSaglikBulgulari(db(), girdi());
    expect(r.bulgular.find((x) => x.kod === 'ga4_veri_gelmiyor')).toBeUndefined();
    expect(r.kosan.has('ga4_veri_gelmiyor')).toBe(false);
    expect(r.not).toMatch(/36 saatte/);
  });

  it('anahtar etkinlik listesi boşsa ve hesap tıklama aldıysa bulgu; yapı bayatsa susar', async () => {
    await kaynakKur({ yapi: '{"anahtarEtkinlikler": []}' });
    await tiklama('2026-10-12', 5);
    expect((await kaynakSaglikBulgulari(db(), girdi())).bulgular.map((x) => x.kod)).toContain('ga4_anahtar_etkinlik_yok');
    await h.q(`UPDATE veri_kaynaklari SET yapi_zamani = '2026-10-01T00:00:00Z'`);
    const r = await kaynakSaglikBulgulari(db(), girdi());
    expect(r.bulgular.map((x) => x.kod)).not.toContain('ga4_anahtar_etkinlik_yok');
    expect(r.kosan.has('ga4_anahtar_etkinlik_yok')).toBe(false);
  });

  it('utm_eksik: Meta ücretli oturumların %30\'undan fazlası etiketsizse; Google hesabında üretilmez', async () => {
    await kaynakKur();
    await oturum('2026-10-05', 40, '120210000001', 'facebook / paid_social', 'a');
    await oturum('2026-10-05', 60, '(not set)', 'facebook / paid_social', 'b');
    const r = await kaynakSaglikBulgulari(db(), girdi());
    expect(r.bulgular.find((x) => x.kod === 'utm_eksik')).toMatchObject({ kanit: { pay: 0.6, ucretliOturum: 100 } });
    const g = await kaynakSaglikBulgulari(db(), { ...girdi(), platform: 'google' });
    expect(g.bulgular.find((x) => x.kod === 'utm_eksik')).toBeUndefined();
  });

  it('takip_acigi: yeterli hacimde site dönüşümü platformdan çok azsa kampanya bulgusu', async () => {
    await kaynakKur();
    for (const g of ['2026-10-05', '2026-10-06']) await tiklama(g, 100, 20);
    await oturum('2026-10-05', 500);
    await h.q(
      `INSERT INTO ga4_anahtar_etkinlik_gunluk (gun, veri_kaynagi_id, satir_hash, etkinlik, client_id, org_id, kaynak_ortam, kampanya_adi, anahtar_etkinlik)
       VALUES ('2026-10-05', $1, repeat('a', 64), 'generate_lead', $2, $3, 'facebook / paid_social', '120210000001', 5)`,
      [KAYNAK, IDS.client, IDS.org],
    );
    const r = await kaynakSaglikBulgulari(db(), girdi());
    expect(r.bulgular.find((x) => x.kod === 'takip_acigi')).toMatchObject({
      seviye: 'campaign',
      varlikId: KAMP,
      kanit: { etiket: 'platform_fazla', platformDonusum: 40, siteDonusum: 5 },
    });
  });
});
