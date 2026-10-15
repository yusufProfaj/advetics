import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { GOOGLE_OLCUM_SCOPES } from '../connections/providers/google.provider';
import { AdsKurulumIstemcisi } from './ads-kurulum';
import { Ga4Istemcisi } from '../connections/providers/ga4';
import { GtmIstemcisi, SURUM_ADI, gtmPlani, konteynerdeYuklu, yolRegex } from './gtm';
import { kurulumAdimlari } from './kurulum-durum';
import { KurulumService, silinecekEtiketler } from './kurulum.service';
import { MetaKurulumIstemcisi } from './meta-kurulum';

/**
 * ═══ KURULUM SERVİSİ — AJAN 4 BULGULARININ KİLİDİ ═══
 *
 * Platform istemcileri PROTOTİP üzerinden taklit ediliyor; servisin gerçek
 * yolları (yayın kapısı, birincil dönüşüm, açılan hesap, okunamayan site,
 * ödeme notu) gerçek veritabanıyla koşuyor. Her iddia bir bulguya bağlı.
 */
const GOOGLE_BAGLANTI = '77777777-7777-4777-8777-777777777777';
const GOOGLE_HESAP = '88888888-8888-4888-8888-888888888888';
const KONTEYNER = 'accounts/6000000001/containers/9000001';

let h: Harness;
let svc: KurulumService;
const olcumDurum = vi.fn();
const ctx = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  activeClientId: IDS.client,
  permissions: ['client.read', 'client.write', 'connection.write', 'connection.manage'],
} as unknown as TenantContext;

const envanter = { oku: vi.fn(), ekle: vi.fn() };

const tarandi = (x: Partial<{ tagManager: string[]; analytics: string[]; metaPiksel: string[]; tagManagerOkunamayan: string[] }> = {}) => ({
  site: { durum: 'tarandi', adres: 'https://ornek.com', hata: null, tagManager: [], analytics: [], metaPiksel: [], altyapi: null, tagManagerOkunamayan: [], ...x },
});

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
  await seedTenant(h, { platform: 'meta' });
  await h.q(`UPDATE clients SET website = 'https://ornek.com' WHERE id = $1`, [IDS.client]);
  await h.q(
    `INSERT INTO platform_connections (id, org_id, client_id, platform, status, external_user_id, account_label, access_token_enc, granted_scopes, connected_by_user_id, updated_at)
     VALUES ($1, $2, $3, 'google', 'active', 'g1', 'G', '\\x00', $4, $5, now())`,
    [GOOGLE_BAGLANTI, IDS.org, IDS.client, ['https://www.googleapis.com/auth/adwords', ...GOOGLE_OLCUM_SCOPES], IDS.user],
  );
  await h.q(
    `INSERT INTO ad_accounts (id, org_id, client_id, connection_id, platform, external_id, name, currency, timezone, sync_enabled, updated_at)
     VALUES ($1, $2, $3, $4, 'google', '1234567890', 'G hesap', 'TRY', 'Europe/Istanbul', true, now())`,
    [GOOGLE_HESAP, IDS.org, IDS.client, GOOGLE_BAGLANTI],
  );
  olcumDurum.mockReset().mockResolvedValue(tarandi());
  envanter.oku.mockReset().mockResolvedValue(new Map());
  envanter.ekle.mockReset();
  const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
  svc = new KurulumService(
    prisma,
    { refreshAccounts: vi.fn(), assignAdAccount: vi.fn() } as never,
    { getAccessToken: vi.fn().mockResolvedValue('tok') } as never,
    { get: vi.fn().mockReturnValue({}) } as never,
    { durum: olcumDurum } as never,
    { record: vi.fn() } as never,
    { platforms: { google: { developerToken: 'dev', apiVersion: 'v25' }, meta: { apiVersion: 'v25.0' } } } as never,
    { kurulumdanBagla: vi.fn().mockResolvedValue(null) } as never,
    envanter as never,
  );
});

const kurulum = async () => (await h.q<Record<string, unknown>>(`SELECT * FROM workspace_kurulum WHERE client_id = $1`, [IDS.client]))[0];
const yaz = async (alanlar: string) => {
  await h.q(`INSERT INTO workspace_kurulum (client_id, org_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [IDS.client, IDS.org]);
  await h.q(`UPDATE workspace_kurulum SET ${alanlar} WHERE client_id = $1`, [IDS.client]);
};

describe('B1 — ödeme kontrolünün sonucu kalıcı', () => {
  it('KRİTİK: "Kontrol et" ödeme hazır derse adım tamam olur (not başarıda silinmez)', async () => {
    vi.spyOn(MetaKurulumIstemcisi.prototype, 'odemeDurumu').mockResolvedValue({ hazir: true, neden: 'Ödeme yöntemi tanımlı.' });
    const y = await svc.adim(ctx, IDS.client, { kod: 'meta_odeme' }, {});
    expect(y.adimlar.find((a) => a.kod === 'meta_odeme')!.durum).toBe('tamam');
  });
});

describe('B2 — hata adımı kilitlemez', () => {
  it('KRİTİK: platform hatasından sonra eylem ve otomatiklik korunur, mesaj nedende', async () => {
    await yaz(`adim_notlari = '{"gtm_konteyner": {"durum": "hata", "mesaj": "503 backend", "zaman": "2026-10-12T10:00:00Z"}}'`);
    const a = (await svc.oku(ctx, IDS.client)).adimlar.find((x) => x.kod === 'gtm_konteyner')!;
    expect(a.durum).toBe('hata');
    expect(a.otomatik).toBe(true);
    expect(a.eylem).not.toBeNull();
    expect(a.neden).toContain('503 backend');
  });
});

describe('B3 — gerçek hesap açma tekrarlanmaz', () => {
  it('KRİTİK: açılan hesap kimliği kayıtlıysa yeniden denemede hesap AÇILMAZ, yalnız bulunup atanır', async () => {
    await h.q(`UPDATE ad_accounts SET client_id = NULL WHERE id = $1`, [GOOGLE_HESAP]);
    await yaz(`google_acilan_hesap = '5550001111'`);
    const ac = vi.spyOn(AdsKurulumIstemcisi.prototype, 'hesapAc');
    const sonuc = await svc.adim(ctx, IDS.client, { kod: 'google_hesap', secim: { tur: 'yeni', mccId: '1112223333', ad: 'Proje' } }, {}).catch((e: Error) => e);
    expect(ac).not.toHaveBeenCalled();
    // Keşif taklidi hesabı bulmadı: hata mesajı "elle ata" diyor, ikinci hesap yok.
    expect(String(sonuc)).toContain('5550001111');
  });

  it('KRİTİK: hesap açılır açılmaz kimlik yazılır (atama düşse bile)', async () => {
    await h.q(`UPDATE ad_accounts SET client_id = NULL WHERE id = $1`, [GOOGLE_HESAP]);
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'hesapAc').mockResolvedValue('5550002222');
    await svc.adim(ctx, IDS.client, { kod: 'google_hesap', secim: { tur: 'yeni', mccId: '1112223333', ad: 'Proje' } }, {}).catch(() => undefined);
    expect((await kurulum())!.google_acilan_hesap).toBe('5550002222');
  });

  it('aynı workspace’te iki işlem aynı anda koşamaz', async () => {
    let bitir: () => void = () => undefined;
    vi.spyOn(MetaKurulumIstemcisi.prototype, 'odemeDurumu').mockImplementation(() => new Promise((ok) => (bitir = () => ok({ hazir: true, neden: 'x' }))));
    const ilk = svc.adim(ctx, IDS.client, { kod: 'meta_odeme' }, {});
    await new Promise((r) => setTimeout(r, 20));
    await expect(svc.adim(ctx, IDS.client, { kod: 'meta_odeme' }, {})).rejects.toThrow(/sürüyor/);
    bitir();
    await ilk;
  });
});

describe('B4 — bir konteyner tek workspace', () => {
  it('KRİTİK: başka workspace’in konteyneri bağlanamaz; neden söylenir', async () => {
    const B = '99999999-9999-4999-8999-999999999999';
    await h.q(`INSERT INTO clients (id, org_id, name, slug, updated_at) VALUES ($1, $2, 'B', 'b', now())`, [B, IDS.org]);
    await h.q(`INSERT INTO workspace_kurulum (client_id, org_id, gtm_konteyner_yolu, gtm_kimligi) VALUES ($1, $2, $3, 'GTM-AAAA11')`, [B, IDS.org, KONTEYNER]);
    vi.spyOn(GtmIstemcisi.prototype, 'konteyner').mockResolvedValue({ path: KONTEYNER, containerId: '9000001', name: 'B', publicId: 'GTM-AAAA11' });
    await expect(svc.adim(ctx, IDS.client, { kod: 'gtm_konteyner', secim: { tur: 'mevcut', konteynerYolu: KONTEYNER } }, {})).rejects.toThrow(/başka bir workspace/);
  });
});

describe('B5 — okunamayan site "kod yok" değil', () => {
  it('KRİTİK: site okunamadıysa otomatik konteyner AÇILMAZ', async () => {
    olcumDurum.mockResolvedValue({ site: { durum: 'ulasilamadi', hata: 'Cloudflare 403', tagManager: [], analytics: [], metaPiksel: [], tagManagerOkunamayan: [] } });
    const ac = vi.spyOn(GtmIstemcisi.prototype, 'konteynerAc');
    vi.spyOn(GtmIstemcisi.prototype, 'hesaplar').mockResolvedValue([{ accountId: '6000000001', name: 'Ajans' }]);
    const r = await svc.tamamla(ctx, IDS.client, {});
    expect(ac).not.toHaveBeenCalled();
    expect(r.sonuclar.find((x) => x.kod === 'gtm_konteyner')).toMatchObject({ durum: 'atlandi' });
    expect(r.sonuclar.find((x) => x.kod === 'gtm_konteyner')!.mesaj).toContain('Cloudflare 403');
  });
});

describe('Tag Manager yayın kapısı', () => {
  const kur = async () => {
    await yaz(
      `gtm_konteyner_yolu = '${KONTEYNER}', gtm_kimligi = 'GTM-ABCD12', ga4_olcum_kimligi = 'G-ABC1234', ga4_mulk_id = '1', donusum_tetigi = '{"formYolu": null, "telefon": true, "whatsapp": false}', ads_donusumleri = '{"telefon": {"kaynak": "customers/1234567890/conversionActions/5", "gonder": {"conversionId": "111", "conversionLabel": "LBL"}, "not": "ok"}}'`,
    );
    vi.spyOn(GtmIstemcisi.prototype, 'calismaAlani').mockResolvedValue(`${KONTEYNER}/workspaces/7`);
    vi.spyOn(GtmIstemcisi.prototype, 'etiketler').mockResolvedValue([]);
    vi.spyOn(GtmIstemcisi.prototype, 'tetikler').mockResolvedValue([]);
    vi.spyOn(GtmIstemcisi.prototype, 'yerlesikDegiskenleriAc').mockResolvedValue();
    vi.spyOn(GtmIstemcisi.prototype, 'tetikYaz').mockResolvedValue('31');
    vi.spyOn(GtmIstemcisi.prototype, 'etiketYaz').mockResolvedValue();
    vi.spyOn(GtmIstemcisi.prototype, 'etiketSil').mockResolvedValue();
    return vi.spyOn(GtmIstemcisi.prototype, 'surumOlusturVeYayinla').mockResolvedValue({ surumYolu: `${KONTEYNER}/versions/9`, surumId: '9' });
  };

  it('KRİTİK: başkasının yayınlanmamış sürümü varsa YAYINLANMAZ', async () => {
    const yayinla = await kur();
    vi.spyOn(GtmIstemcisi.prototype, 'sonSurum').mockResolvedValue({ id: '8', ad: 'Ayşe’nin değişikliği', silinmis: false });
    vi.spyOn(GtmIstemcisi.prototype, 'canliSurum').mockResolvedValue('7');
    await expect(svc.adim(ctx, IDS.client, { kod: 'gtm_etiket', tetik: { formYolu: null, telefon: true, whatsapp: false } }, {})).rejects.toThrow(/yayınlanmamış/);
    expect(yayinla).not.toHaveBeenCalled();
  });

  it('KRİTİK: yarım kalmış BİZİM sürümümüz engel değil; yayın olur ve piksel/Google etiketi sayfa başına bir kez', async () => {
    const yayinla = await kur();
    vi.spyOn(GtmIstemcisi.prototype, 'sonSurum').mockResolvedValue({ id: '8', ad: SURUM_ADI, silinmis: false });
    vi.spyOn(GtmIstemcisi.prototype, 'canliSurum').mockResolvedValue('7');
    await svc.adim(ctx, IDS.client, { kod: 'gtm_etiket', tetik: { formYolu: null, telefon: true, whatsapp: false } }, {});
    expect(yayinla).toHaveBeenCalledTimes(1);
    const govdeler = vi.mocked(GtmIstemcisi.prototype.etiketYaz).mock.calls.map((c) => c[1] as { type: string; tagFiringOption?: string });
    expect(govdeler.find((g) => g.type === 'googtag')!.tagFiringOption).toBe('oncePerLoad');
  });

  it('KRİTİK: yazarken yeni sürüm oluşursa yayınlanmaz', async () => {
    const yayinla = await kur();
    vi.spyOn(GtmIstemcisi.prototype, 'sonSurum')
      .mockResolvedValueOnce({ id: '7', ad: 'x', silinmis: false })
      .mockResolvedValueOnce({ id: '8', ad: 'başkası', silinmis: false });
    vi.spyOn(GtmIstemcisi.prototype, 'canliSurum').mockResolvedValue('7');
    await expect(svc.adim(ctx, IDS.client, { kod: 'gtm_etiket', tetik: { formYolu: null, telefon: true, whatsapp: false } }, {})).rejects.toThrow(/yeni bir sürüm/);
    expect(yayinla).not.toHaveBeenCalled();
  });

  it('KRİTİK: site okunamadıysa ve kodumuz sitede değilse yayınlanmaz (çift sayım riski)', async () => {
    const yayinla = await kur();
    vi.spyOn(GtmIstemcisi.prototype, 'sonSurum').mockResolvedValue({ id: '7', ad: 'x', silinmis: false });
    vi.spyOn(GtmIstemcisi.prototype, 'canliSurum').mockResolvedValue('7');
    olcumDurum.mockResolvedValue({ site: { durum: 'ulasilamadi', hata: 'zaman aşımı', tagManager: [], analytics: [], metaPiksel: [], tagManagerOkunamayan: [] } });
    await expect(svc.adim(ctx, IDS.client, { kod: 'gtm_etiket', tetik: { formYolu: null, telefon: true, whatsapp: false } }, {})).rejects.toThrow(/okunamadı/);
    expect(yayinla).not.toHaveBeenCalled();
  });

  it('KRİTİK: yalnız bizim ön ekli etiketlerimiz silinir', () => {
    const v = [{ name: 'Advetics · Eski' }, { name: 'Kullanıcının etiketi' }, { name: 'Advetics · Google etiketi' }];
    expect(silinecekEtiketler(v, new Set(['Advetics · Google etiketi'])).map((x) => x.name)).toEqual(['Advetics · Eski']);
  });
});

describe('Google Ads dönüşümleri', () => {
  beforeEach(async () => {
    await yaz(`donusum_tetigi = '{"formYolu": "/tesekkurler", "telefon": false, "whatsapp": false}'`);
  });

  it('KRİTİK: aynı kategoride başkasının birincil işlemi varsa YENİSİ AÇILMAZ ve neden kaydedilir', async () => {
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumIslemleri').mockResolvedValue([
      { resourceName: 'customers/1234567890/conversionActions/1', ad: 'GA4 generate_lead', kategori: 'SUBMIT_LEAD_FORM', birincil: true, durum: 'ENABLED' },
    ]);
    const ac = vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumAc');
    await svc.adim(ctx, IDS.client, { kod: 'ads_donusum' }, {});
    expect(ac).not.toHaveBeenCalled();
    expect(JSON.stringify((await kurulum())!.ads_donusumleri)).toContain('çift sayılmasın');
  });

  it('KRİTİK: "Eksikleri tamamla" harcaması olan hesapta birincil dönüşüm AÇMAZ', async () => {
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumIslemleri').mockResolvedValue([]);
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'harcamaVar').mockResolvedValue(true);
    const ac = vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumAc');
    const r = await svc.tamamla(ctx, IDS.client, {});
    expect(ac).not.toHaveBeenCalled();
    expect(r.sonuclar.find((x) => x.kod === 'ads_donusum')).toMatchObject({ durum: 'atlandi' });
  });

  it('düğmeyle (onaylı) harcamalı hesapta da kurulur; kimlik okunamazsa adım tamam DEĞİL', async () => {
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumIslemleri').mockResolvedValue([]);
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'harcamaVar').mockResolvedValue(true);
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'donusumAc').mockResolvedValue('customers/1234567890/conversionActions/9');
    vi.spyOn(AdsKurulumIstemcisi.prototype, 'gonderAdresiOku').mockResolvedValue(null);
    const y = await svc.adim(ctx, IDS.client, { kod: 'ads_donusum' }, {});
    expect(y.adimlar.find((a) => a.kod === 'ads_donusum')!.durum).toBe('eksik');
  });
});

describe('küçük kilitler', () => {
  it('Türkçe karakterli teşekkür yolu yüzde kodlu biçimde de eşleşir', () => {
    const r = new RegExp(yolRegex('/teşekkür'));
    expect(r.test('/te%C5%9Fekk%C3%BCr')).toBe(true);
    expect(r.test('/teşekkür/')).toBe(true);
    expect(r.test('/teşekkürler')).toBe(false);
  });

  it('konteynerde başkasının Lead etiketi varsa form olayı ikinci kez eklenmez', () => {
    const m = konteynerdeYuklu([{ name: 'Lead', type: 'html', parameter: [{ type: 'template', key: 'html', value: "<script>fbq('track', 'Lead')</script>" }] }], null, '123456789');
    expect(m.metaFormYuklu).toBe(true);
    const p = gtmPlani({ ga4OlcumKimligi: null, metaPikselId: '123456789', ads: {}, tetik: { formYolu: '/t', telefon: false, whatsapp: false }, mevcut: m });
    expect(p.etiketler.some((e) => e.name === 'Advetics · Meta form')).toBe(false);
  });

  it('havuzdaki tek sayfa otomatik atanmaz (başka markanın sayfası olabilir)', () => {
    const a = kurulumAdimlari({
      meta: null,
      google: null,
      sayfa: null,
      havuzSayfaSayisi: 1,
      googleBaglanti: null,
      metaBaglanti: null,
      site: null,
      pikselId: null,
      satir: null,
      hazirlama: null,
    }).find((x) => x.kod === 'sayfa')!;
    expect(a.otomatik).toBe(false);
  });

  it('KRİTİK: izin dönüş adresi açık yönlendirmeye izin vermez', () => {
    const k = readFileSync(join(__dirname, '../connections/connections.controller.ts'), 'utf8');
    const m = /const redirectTo = donus && (\/.+\/)\.test\(donus\)/.exec(k);
    if (!m) throw new Error('dönüş denetimi bulunamadı');
    const regex = eval(m[1]!) as RegExp;
    expect(regex.test('/marka-merkezi?bolum=kurulum')).toBe(true);
    expect(regex.test('//evil.com')).toBe(false);
    expect(regex.test('https://evil.com')).toBe(false);
    expect(regex.test('/\\evil.com')).toBe(false);
  });
});

describe('Tag Manager: 30 hesap sınırı kalktı (2026-10-15)', () => {
  const hesaplar = Array.from({ length: 155 }, (_, i) => ({ accountId: String(6000000001 + i), name: `Hesap ${i + 1}` }));

  it('KRİTİK: sitedeki konteyner 31. hesaptan sonra olsa da KİMLİKLE bulunuyor', async () => {
    olcumDurum.mockResolvedValue(tarandi({ tagManager: ['GTM-UZAK1'] }));
    vi.spyOn(GtmIstemcisi.prototype, 'hesaplar').mockResolvedValue(hesaplar);
    const liste = vi.spyOn(GtmIstemcisi.prototype, 'konteynerler');
    const ara = vi.spyOn(GtmIstemcisi.prototype, 'ara').mockResolvedValue({
      path: 'accounts/6000000120/containers/77', accountId: '6000000120', containerId: '77', name: 'Uzak', publicId: 'GTM-UZAK1',
    });
    vi.spyOn(GtmIstemcisi.prototype, 'konteyner').mockResolvedValue({ path: 'accounts/6000000120/containers/77', containerId: '77', name: 'Uzak', publicId: 'GTM-UZAK1' });
    await svc.tamamla(ctx, IDS.client, {});
    expect(ara).toHaveBeenCalledWith('GTM-UZAK1');
    // Hesap hesap gezilmiyor: kota başına 0,25 istekte 155 çağrı dakikalar sürerdi.
    expect(liste).not.toHaveBeenCalled();
    expect((await kurulum())?.gtm_kimligi).toBe('GTM-UZAK1');
  });

  it('KRİTİK: seçici envanterdeki BÜTÜN hesapların konteynerlerini veriyor, eksikleri kuyruğa atıyor', async () => {
    vi.spyOn(GtmIstemcisi.prototype, 'hesaplar').mockResolvedValue(hesaplar);
    const liste = vi.spyOn(GtmIstemcisi.prototype, 'konteynerler');
    // 100 hesap taranmış (ilk 30'un çok ötesi), 55'i henüz değil.
    envanter.oku.mockResolvedValue(
      new Map(
        hesaplar.slice(0, 100).map((h) => [
          h.accountId,
          { hesapAdi: h.name, konteynerler: [{ path: `accounts/${h.accountId}/containers/1`, name: h.name, publicId: `GTM-${h.accountId}` }], taranma: new Date().toISOString(), hata: null },
        ]),
      ),
    );
    const s = await svc.secenekler(ctx, IDS.client, 'gtm_konteyner');
    expect(s.mevcut).toHaveLength(100);
    expect(s.mevcut.some((m) => m.not === 'Hesap 100')).toBe(true);
    expect(s.not).toContain('100 / 155');
    expect(liste).not.toHaveBeenCalled();
    const [baglanti, kuyruga] = envanter.ekle.mock.calls[0]!;
    expect(baglanti).toBe(GOOGLE_BAGLANTI);
    expect((kuyruga as unknown[]).length).toBe(55);
  });
});
