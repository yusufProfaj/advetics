import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KAYNAK_TANIMI, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { Ga4Istemcisi } from '../connections/providers/ga4';
import type { TxLike } from '../sinyal/sinyal-hesap';
import { kaynakSaglikBulgulari } from './kaynak-saglik';
import { takipAcigiYaniti } from './takip-hesap';
import { VeriKaynagiService } from './veri-kaynagi.service';

/**
 * ═══ PAKET F1 — AJAN 4 KAPI TESTLERİ ═══
 *
 * Ö-1, Ö-2, Ö-3, Ö-4 BİLEREK KIRMIZI: bulguyu kilitliyorlar, düzeltmeyi
 * bulguyu üreten ajan (Ajan 2) yapacak. Yeşil olanlar bulgu DEĞİL, sınırın
 * bugün tuttuğunun kanıtı (şirket sınırı).
 */

let h: Harness;
const db = () => h.db as unknown as TxLike;
const KAMP = 'efefefef-efef-4fef-8fef-efefefefefef';
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
afterEach(() => {
  vi.restoreAllMocks();
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

async function etkinlik(kaynakId: string, gun: string, n: number) {
  await h.q(
    `INSERT INTO ga4_anahtar_etkinlik_gunluk (gun, veri_kaynagi_id, satir_hash, etkinlik, client_id, org_id, kaynak_ortam, kampanya_adi, anahtar_etkinlik)
     VALUES ($1, $2, repeat('a', 64), 'generate_lead', $3, $4, 'facebook / paid_social', '120210000001', $5)`,
    [gun, kaynakId, IDS.client, IDS.org, n],
  );
}

async function tiklama(hesap: string, kampanya: string, platform: 'meta' | 'google', gun: string, n: number, donusum = 0) {
  await h.q(
    `INSERT INTO insights_daily (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id, date, breakdown_key,
       impressions, clicks, reach, spend_micros, conversions, conversion_value_micros, currency)
     VALUES ($1, $2, $3::"Platform", 'campaign', $4, 'x', $5, '', 1000, $6, 0, 0, $7, 0, 'TRY') ON CONFLICT DO NOTHING`,
    [IDS.client, hesap, platform, kampanya, gun, n, donusum],
  );
}

describe('Ö-1 — kaldırılmış eski mülkün verisi yeni mülkün verisine EKLENİYOR (çift sayım)', () => {
  /*
   * Workspace önce P1'i okuyordu, P1 kaldırıldı (satır ve verisi kalıyor,
   * "geçmiş veri raporda kalır"), sonra P2 bağlandı ve P2'nin 90 günlük
   * geçmişi AYNI günleri yazdı. `trafik()` `veri_kaynagi_id = k.id` ile
   * süzüyor; `siteSatirlari` (takip açığı ekranı, rapor PDF'i, takip_acigi
   * ve utm_eksik sinyali) yalnız `client_id` ile süzüyor ve iki mülkü
   * TOPLUYOR. Aynı ekranda trafik tablosu 10, takip açığı 18 der; müşteriye
   * giden PDF de 18. Hata yok.
   */
  it('BULGU Ö-1: takip açığı yalnız ETKİN kaynağın satırlarını saymalı', async () => {
    await kaynak(ESKI, '111111111', 'kaldirildi');
    await kaynak(YENI, '222222222', 'etkin');
    await etkinlik(ESKI, '2026-10-05', 8);
    await etkinlik(YENI, '2026-10-05', 10);
    await tiklama(IDS.adAccount, KAMP, 'meta', '2026-10-05', 200, 20);
    const r = await takipAcigiYaniti(db(), { clientId: IDS.client, from: '2026-10-01', to: '2026-10-08' }, SIMDI);
    expect(r.emptyReason).toBeNull();
    expect(r.satirlar.find((s) => s.kampanyaId === KAMP)!.siteDonusum).toBe(10);
  });
});

describe('Ö-2 — utm_eksik, etiketin HİÇ olmadığı (asıl) durumda susuyor ve "koştu" sayılıyor', () => {
  /*
   * META_UTM_ETIKETI varsayılan kapalı (e1909b2): AdvCampaign Meta reklamı
   * bugün etiketsiz gidiyor. Etiketsiz Meta tıklaması GA4'te
   * "m.facebook.com / referral" görünür; `trafikKaynagi` onu (doğru olarak)
   * ücretli SAYMIYOR, yani `utm_eksik`in paydası 0, bulgu yok — ve kontrol
   * `kosan`a giriyor: varsa eski sinyal "düzeldi" diye kapanır. Kontrolün
   * adı "Reklam bağlantılarında kampanya etiketi yok" ve tam bu durumu
   * hiçbir zaman görmüyor; yalnız utm_source/medium yazılıp utm_campaign
   * unutulan nadir durumu görüyor.
   * Kabul: ya bulgu üretilir (tıklama var, ücretli Meta oturumu yok) ya da
   * kontrol koşmamış sayılır (bilinmeyen = yok değil).
   */
  it('BULGU Ö-2: 500 Meta tıklaması, sıfır ücretli Meta oturumu, 300 facebook/referral → sessiz "temiz" olmamalı', async () => {
    await kaynak(YENI, '222222222', 'etkin');
    for (const g of ['2026-10-03', '2026-10-05', '2026-10-07', '2026-10-09', '2026-10-11']) await tiklama(IDS.adAccount, KAMP, 'meta', g, 100);
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, kampanya_adi, oturum)
       VALUES ('2026-10-05', $1, repeat('b', 64), $2, $3, 'm.facebook.com / referral', '(referral)', 300)`,
      [YENI, IDS.client, IDS.org],
    );
    const r = await kaynakSaglikBulgulari(db(), { clientId: IDS.client, adAccountId: IDS.adAccount, platform: 'meta', hesapAdi: 'Hesap', gun: GUN, simdi: SIMDI });
    const uyardi = r.bulgular.some((b) => b.kod === 'utm_eksik');
    const susup_kostu = !uyardi && r.kosan.has('utm_eksik');
    expect(susup_kostu, 'utm_eksik etiketsiz trafiği görmeden "koştu, sorun yok" diyor').toBe(false);
  });
});

describe('Ö-3 — workspace düzeyindeki kontrol hesap sayısı kadar çoğalıyor', () => {
  /*
   * `ga4_anahtar_etkinlik_yok` bir MÜLK gerçeği (veri_kaynaklari.yapi), ama
   * sinyal işi hesap başına koşuyor ve tıklama alan HER hesap aynı bulguyu
   * kendi adına basıyor. Meta + Google iki hesaplı tipik workspace'te
   * kullanıcı aynı uyarıyı iki kez görür; birini kapatınca öbürü açık kalır
   * ("kapattım, hâlâ duruyor"). Aynı çoğalma `ga4_veri_gelmiyor` ve iki Meta
   * hesaplı workspace'te `utm_eksik` için de geçerli (site verisi workspace
   * geneli). Kabul: workspace başına TEK bulgu (ör. en çok tıklayan hesap).
   */
  it('BULGU Ö-3: iki tıklayan hesapta "Analytics\'te anahtar etkinlik yok" bir kez üretilmeli', async () => {
    await h.q(
      `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
       VALUES ($1, $2, $3, $4, 'google', '1234567890', 'Google Hesabı', 'TRY', 'Europe/Istanbul', true, now())`,
      [HESAP2, IDS.org, IDS.client, IDS.connection],
    );
    const KAMP2 = 'abababab-abab-4bab-8bab-abababababab';
    await h.q(
      `INSERT INTO campaigns (id, client_id, ad_account_id, platform, external_id, name, status, updated_at)
       VALUES ($1, $2, $3, 'google', '24337936076', 'Arama', 'active', now())`,
      [KAMP2, IDS.client, HESAP2],
    );
    await kaynak(YENI, '222222222', 'etkin', []);
    await tiklama(IDS.adAccount, KAMP, 'meta', '2026-10-12', 5);
    await tiklama(HESAP2, KAMP2, 'google', '2026-10-12', 5);
    let toplam = 0;
    for (const [hesap, platform] of [
      [IDS.adAccount, 'meta'],
      [HESAP2, 'google'],
    ] as const) {
      const r = await kaynakSaglikBulgulari(db(), { clientId: IDS.client, adAccountId: hesap, platform, hesapAdi: 'H', gun: GUN, simdi: SIMDI });
      toplam += r.bulgular.filter((b) => b.kod === 'ga4_anahtar_etkinlik_yok').length;
    }
    expect(toplam).toBe(1);
  });
});

describe('Ö-4 — sayfalama boş sayfayla biterse yarım rapor "tamam" sayılıyor', () => {
  /*
   * `raporTamami` sözleşmesi: "kısmi sonuç YAZILMAZ" (yarım pencere tam
   * pencereyi silip eksik veriyle değiştirir). Ama `gelen.length === 0`
   * dalı `satirlar.length < satirSayisi` iken de `durdu: null` döndürüyor.
   * Günlük pencere SON 3 GÜNÜ çekiyor ve GA4 o günleri hâlâ işliyor:
   * sayfalar arasında rowCount küçülüp offset sona taşabilir. Sonuç: iş
   * pencereyi siler, eksik yazar, `succeeded` olur; tek iz notta
   * "x/y satır okundu".
   */
  it('BULGU Ö-4: okunan < bildirilen iken boş sayfa geldiyse durdu dolu olmalı', async () => {
    const ist = new Ga4Istemcisi('tok');
    const sayfa = vi.spyOn(ist, 'raporSayfasi');
    sayfa.mockResolvedValueOnce({
      rowCount: 5,
      rows: [
        { dimensionValues: [{ value: '20261010' }], metricValues: [{ value: '1' }] },
        { dimensionValues: [{ value: '20261011' }], metricValues: [{ value: '1' }] },
      ],
    });
    sayfa.mockResolvedValueOnce({ rowCount: 5, rows: [] });
    const r = await ist.raporTamami('312845771', 'trafik', { from: '2026-10-10', to: '2026-10-12' }, () => null, 2);
    expect(r.satirlar).toHaveLength(2);
    expect(r.durdu).not.toBeNull();
  });
});

describe('ŞİRKET SINIRI — "verisiyle taşınıyor" yolu admin istemcisiyle ama hedefin şirketinde kalıyor', () => {
  const ORG2 = '77777777-7777-4777-8777-777777777777';
  const C2 = '78787878-7878-4878-8878-787878787878';
  const B = '99999999-9999-4999-8999-999999999999';

  it('KRİTİK: başka ŞİRKETTE kaldırılmış aynı mülk TAŞINMAZ; hedef şirkette yeni satır açılır, eski veri yerinde kalır', async () => {
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Öbür', 'obur', now())`, [B, IDS.org]);
    await h.q(`INSERT INTO organizations (id, name, slug, updated_at) VALUES ($1, 'Kardeş', 'kardes', now())`, [ORG2]);
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'Kardeş WS', 'kardes-ws', now())`, [C2, ORG2]);
    await h.q(
      `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
       VALUES (gen_random_uuid(), $1, $2, 'google', 'active', 'u9', 'K', '\\x00', $3, $4, now())`,
      [ORG2, C2, ['https://www.googleapis.com/auth/adwords', KAYNAK_TANIMI.ga4.scope!], IDS.user],
    );
    // Şirket 1'in B workspace'inde kaldırılmış mülk + verisi.
    await h.q(
      `INSERT INTO veri_kaynaklari (id, org_id, client_id, tur, dis_kimlik, ad, durum) VALUES ($1, $2, $3, 'ga4', '312845771', 'Site', 'kaldirildi')`,
      [ESKI, IDS.org, B],
    );
    await h.q(
      `INSERT INTO ga4_gunluk (gun, veri_kaynagi_id, satir_hash, client_id, org_id, kaynak_ortam, oturum) VALUES ('2026-10-01', $1, repeat('a', 64), $2, $3, 'a / b', 3)`,
      [ESKI, B, IDS.org],
    );
    vi.spyOn(Ga4Istemcisi.prototype, 'mulkAyari').mockResolvedValue({ ad: 'Site', saatDilimi: 'Europe/Istanbul', paraBirimi: 'TRY' });
    const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    const svc = new VeriKaynagiService(
      prisma,
      h.db as never,
      { getAccessToken: vi.fn().mockResolvedValue('tok') } as never,
      { get: vi.fn().mockReturnValue({}) } as never,
      { enqueue: vi.fn().mockResolvedValue({ enqueued: true, syncJobId: '1' }) } as never,
      { record: vi.fn() } as never,
    );
    // "Tüm şirketler" modu: ctx.orgId EV şirketi, hedef workspace KARDEŞ şirkette.
    const ctx = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client, B, C2], activeClientId: C2, permissions: ['connection.manage'] } as unknown as TenantContext;
    const o = await svc.bagla(ctx, { clientId: C2, tur: 'ga4', disKimlik: '312845771' }, {});
    expect(o.id).not.toBe(ESKI);
    expect(await h.q(`SELECT id::text, org_id::text, client_id::text, durum FROM veri_kaynaklari ORDER BY org_id`)).toEqual([
      { id: ESKI, org_id: IDS.org, client_id: B, durum: 'kaldirildi' },
      { id: o.id, org_id: ORG2, client_id: C2, durum: 'etkin' },
    ]);
    expect(await h.q(`SELECT client_id::text FROM ga4_gunluk`)).toEqual([{ client_id: B }]);
  });
});
