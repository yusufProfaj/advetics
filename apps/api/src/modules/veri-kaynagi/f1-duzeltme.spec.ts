import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAYNAK_TANIMI, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { ConnectionsService } from '../connections/connections.service';
import type { TxLike } from '../sinyal/sinyal-hesap';
import { kaynakSaglikBulgulari } from './kaynak-saglik';
import { takipAcigiYaniti } from './takip-hesap';
import { VeriKaynagiService } from './veri-kaynagi.service';

/**
 * ═══ F1 AJAN 4 BULGULARININ DÜZELTMESİ — KİLİTLER (Ö-1, Ö-2, Ö-3, N) ═══
 *
 * `f1-kapi.spec.ts` bulguları kilitliyor; burası düzeltmenin KARAR
 * kısımlarını: tek süzgeç iki uçta aynı sayı, Meta etiket ayarına bağlı
 * koşma, workspace başına tek sahip ve sahip değişince eski sinyalin
 * kapanabilmesi, izin sonrası kendiliğinden kuyruk.
 */
let h: Harness;
const db = () => h.db as unknown as TxLike;
const KAMP = 'efefefef-efef-4fef-8fef-efefefefefef';
const KAMP2 = 'abababab-abab-4bab-8bab-abababababab';
const ESKI = 'c1c1c1c1-c1c1-41c1-81c1-c1c1c1c1c1c1';
const YENI = 'c2c2c2c2-c2c2-42c2-82c2-c2c2c2c2c2c2';
const HESAP2 = '46464646-4646-4646-8646-464646464646';
const SIMDI = new Date('2026-10-14T09:00:00Z');
const GUN = '2026-10-13';

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

async function kaynak(id: string, mulk: string, durum: string, anahtarlar: string[] = ['generate_lead']) {
  await h.q(
    `INSERT INTO veri_kaynaklari (id, org_id, client_id, tur, dis_kimlik, ad, connection_id, durum, yapi, yapi_zamani, son_basarili_cekim)
     VALUES ($1, $2, $3, 'ga4', $4, 'Site', $5, $6, $7::jsonb, $8, $8)`,
    [id, IDS.org, IDS.client, mulk, IDS.connection, durum, JSON.stringify({ anahtarEtkinlikler: anahtarlar }), SIMDI.toISOString()],
  );
}

async function satir(kaynakId: string, n: number, hash: string) {
  await h.q(
    `INSERT INTO ga4_anahtar_etkinlik_gunluk (gun, veri_kaynagi_id, satir_hash, etkinlik, client_id, org_id, kaynak_ortam, kampanya_adi, anahtar_etkinlik)
     VALUES ('2026-10-05', $1, repeat($5, 64), 'generate_lead', $2, $3, 'facebook / paid_social', '120210000001', $4)`,
    [kaynakId, IDS.client, IDS.org, n, hash],
  );
  await h.q(
    `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, kampanya_adi, oturum, anahtar_etkinlik)
     VALUES ('2026-10-05', $1, repeat($5, 64), $2, $3, 'facebook / paid_social', '120210000001', 100, $4)`,
    [kaynakId, IDS.client, IDS.org, n, hash],
  );
}

async function tiklama(hesap: string, kampanya: string, platform: 'meta' | 'google', gun: string, n: number) {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
       impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, $3::"Platform", 'campaign', $4, 'x', $5, '', 1000, $6, 0, 0, 20, 0, 'TRY') ON CONFLICT DO NOTHING`,
    [IDS.client, hesap, platform, kampanya, gun, n],
  );
}

async function ikinciHesap() {
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'Google Hesabı', 'TRY', 'Europe/Istanbul', true, now())`,
    [HESAP2, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id, name, status, updated_at)
     VALUES ($1, $2, $3, 'google', '24337936076', 'Arama', 'active', now())`,
    [KAMP2, IDS.client, HESAP2],
  );
}

const girdi = (hesap: string, platform: 'meta' | 'google' | 'linkedin', metaUtmAcik = false) => ({
  clientId: IDS.client,
  adAccountId: hesap,
  platform,
  hesapAdi: 'H',
  gun: GUN,
  simdi: SIMDI,
  metaUtmAcik,
});

describe('Ö-1 — tek süzgeç: trafik ucu ve takip açığı AYNI sayıyı veriyor', () => {
  it('KRİTİK: kaldırılmış mülkün satırları ikisine de girmiyor', async () => {
    await kaynak(ESKI, '111111111', 'kaldirildi');
    await kaynak(YENI, '222222222', 'etkin');
    await satir(ESKI, 8, 'a');
    await satir(YENI, 10, 'b');
    await tiklama(IDS.adAccount, KAMP, 'meta', '2026-10-05', 200);
    const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    const svc = new VeriKaynagiService(prisma, h.db as never, {} as never, {} as never, {} as never, { record: vi.fn() } as never);
    const ctx = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, permissions: [] } as unknown as TenantContext;
    const q = { clientId: IDS.client, from: '2026-10-01', to: '2026-10-08' };
    const trafik = await svc.trafik(ctx, q);
    const takip = await takipAcigiYaniti(db(), q, SIMDI);
    expect(trafik.toplam.anahtarEtkinlik).toBe(10);
    expect(takip.satirlar.reduce((a, s) => a + s.siteDonusum, 0)).toBe(10);
    expect(trafik.toplam.oturum).toBe(100);
  });

  it('süzgeç tek yerde: kaynak bulan her okuyucu etkinGa4Kaynagi kullanıyor', () => {
    for (const f of ['takip-hesap.ts', 'kaynak-saglik.ts', 'veri-kaynagi.service.ts']) {
      const src = readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      if (f !== 'takip-hesap.ts') expect(src, f).toMatch(/etkinGa4Kaynagi[<(]/);
      // GA4 tablolarını client_id İLE TEK BAŞINA süzen sorgu kalmadı.
      for (const m of src.matchAll(/FROM ga4_(?:gunluk|anahtar_etkinlik_gunluk)\s+WHERE([^`]*)/g)) expect(m[1], f).toMatch(/veri_kaynagi_id/);
    }
  });
});

describe('Ö-2 — utm_eksik yalnız etiket bizim kontrolümüzdeyken koşar', () => {
  beforeEach(async () => {
    await kaynak(YENI, '222222222', 'etkin');
  });

  it('KRİTİK: Meta etiketi KAPALIYKEN Meta tarafı koşmaz (kosan dışı, bulgu yok)', async () => {
    const r = await kaynakSaglikBulgulari(db(), girdi(IDS.adAccount, 'meta', false));
    expect(r.kosan.has('utm_eksik')).toBe(false);
    expect(r.bulgular.some((b) => b.kod === 'utm_eksik')).toBe(false);
  });

  it('Meta etiketi AÇIKKEN koşar; Google her zaman koşar; LinkedIn hiç koşmaz', async () => {
    expect((await kaynakSaglikBulgulari(db(), girdi(IDS.adAccount, 'meta', true))).kosan.has('utm_eksik')).toBe(true);
    expect((await kaynakSaglikBulgulari(db(), girdi(IDS.adAccount, 'google', false))).kosan.has('utm_eksik')).toBe(true);
    expect((await kaynakSaglikBulgulari(db(), girdi(IDS.adAccount, 'linkedin', true))).kosan.has('utm_eksik')).toBe(false);
  });
});

describe('Ö-3 — workspace düzeyindeki kontrolün TEK sahibi', () => {
  beforeEach(async () => {
    await ikinciHesap();
    await kaynak(YENI, '222222222', 'etkin', []);
  });

  const say = async () => {
    const r1 = await kaynakSaglikBulgulari(db(), girdi(IDS.adAccount, 'meta'));
    const r2 = await kaynakSaglikBulgulari(db(), girdi(HESAP2, 'google'));
    return { r1, r2 };
  };

  it('KRİTİK: sahip en çok tıklayan hesap; öbürü bulgu basmaz ama KOŞMUŞ sayar', async () => {
    await tiklama(IDS.adAccount, KAMP, 'meta', '2026-10-12', 5);
    await tiklama(HESAP2, KAMP2, 'google', '2026-10-12', 50);
    const { r1, r2 } = await say();
    expect(r1.bulgular.filter((b) => b.kod === 'ga4_anahtar_etkinlik_yok')).toHaveLength(0);
    expect(r2.bulgular.filter((b) => b.kod === 'ga4_anahtar_etkinlik_yok')).toHaveLength(1);
    // Sahip olmayan hesapta koştu sayılıyor: eski açık sinyali `sureDolduMu` ile kendiliğinden kapanır.
    expect(r1.kosan.has('ga4_anahtar_etkinlik_yok')).toBe(true);
  });

  it('sahip değişirse sinyal yeni sahibe geçer (eşitlikte kimliğe göre sabit)', async () => {
    await tiklama(IDS.adAccount, KAMP, 'meta', '2026-10-12', 5);
    await tiklama(HESAP2, KAMP2, 'google', '2026-10-12', 5);
    let { r1, r2 } = await say();
    // Eşitlik: '4444…' < '4646…' → seed hesabı sahip.
    expect(r1.bulgular.some((b) => b.kod === 'ga4_anahtar_etkinlik_yok')).toBe(true);
    expect(r2.bulgular.some((b) => b.kod === 'ga4_anahtar_etkinlik_yok')).toBe(false);
    await h.q(`UPDATE insights_daily SET clicks = 90 WHERE ad_account_id = $1`, [HESAP2]);
    ({ r1, r2 } = await say());
    expect(r1.bulgular.some((b) => b.kod === 'ga4_anahtar_etkinlik_yok')).toBe(false);
    expect(r2.bulgular.some((b) => b.kod === 'ga4_anahtar_etkinlik_yok')).toBe(true);
  });
});

describe('N — izin verilince izin yüzünden duran kaynaklar kendiliğinden kuyruğa', () => {
  it('KRİTİK: yalnız o bağlantının izin_eksik/erisim_yok kaynakları, etkileşimli yapı işiyle', async () => {
    await kaynak(ESKI, '111111111', 'izin_eksik');
    await kaynak(YENI, '222222222', 'etkin');
    const enqueue = vi.fn(async () => ({ enqueued: true }));
    const svc = Object.assign(Object.create(ConnectionsService.prototype), { admin: h.db, queue: { enqueue }, logger: { error: vi.fn() } }) as unknown as {
      izinBekleyenKaynaklariKuyrukla(id: string): Promise<number>;
    };
    expect(await svc.izinBekleyenKaynaklariKuyrukla(IDS.connection)).toBe(1);
    expect(enqueue).toHaveBeenCalledWith(expect.objectContaining({ jobType: 'kaynak_yapi', veriKaynagiId: ESKI, interactive: true }));
  });

  it('izin akışının sonunda çağrılıyor (callback, denetim kaydından önce)', () => {
    const src = readFileSync(join(__dirname, '../connections/connections.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const bas = src.indexOf('async handleCallback(');
    if (bas < 0) throw new Error('handleCallback bulunamadı');
    const govde = src.slice(bas, src.indexOf("action: 'connection.created'", bas));
    expect(govde).toContain('await this.izinBekleyenKaynaklariKuyrukla(connectionId);');
  });
});
