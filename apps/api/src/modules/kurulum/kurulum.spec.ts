import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { KURULUM_ADIM_KODLARI, gtmKodu, kurulumIstegiSchema, tesekkurYoluSchema, type TenantContext } from '@advetics/shared';
import { createHarness, IDS, seedTenant, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { GOOGLE_OLCUM_SCOPES } from '../connections/providers/google.provider';
import { gonderAdresi } from './ads-kurulum';
import { TUM_SAYFALAR_TETIGI, gtmPlani, konteynerdeYuklu, metaPikselKodu } from './gtm';
import { CEREZ_ONAYI_NOTU, dogrulamaBeklenenleri, dogrulamaSonucu, etiketImzasi, kurulumAdimlari, type KurulumAnlik, type KurulumSatiri } from './kurulum-durum';
import { KurulumService, satirOku } from './kurulum.service';
import { istanbulSaatKimligi, odemeHazirMi } from './meta-kurulum';

/**
 * ═══ KURULUM REHBERİ (docs/kurulum/MIMARI.md) ═══
 *
 * Kilitlenenler: çift sayım kararları (aynı G-/piksel iki kez yüklenmez),
 * tetik regex'i (teşekkür sayfası TAM yol), gerçek hesap açan adımların
 * "Eksikleri tamamla"ya girmemesi, saat dilimi kimliğinin tahmin edilmemesi,
 * izin yokken ölçüm adımlarının otomatik sayılmaması, modül kaydı.
 */
const yorumsuz = (k: string) => k.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('Tag Manager planı', () => {
  const temel = {
    ga4OlcumKimligi: 'G-ABC1234',
    metaPikselId: '123456789',
    ads: { form: { conversionId: '111', conversionLabel: 'LBL' } },
    tetik: { formYolu: '/tesekkurler', telefon: true, whatsapp: false },
    mevcut: { ga4Yuklu: false, pikselYuklu: false },
  };

  it('KRİTİK: temel etiketler tüm sayfalarda; form olayı teşekkür sayfasının TAM yolunda (içerir değil)', () => {
    const p = gtmPlani(temel);
    const ad = p.etiketler.map((e) => e.name);
    expect(ad).toContain('Advetics · Google etiketi');
    expect(ad).toContain('Advetics · Meta pikseli');
    expect(ad).toContain('Advetics · Dönüşüm bağlayıcı');
    expect(ad).toContain('Advetics · Google Ads form');
    expect(p.etiketler.find((e) => e.type === 'googtag')!.tetik).toBe(TUM_SAYFALAR_TETIGI);
    const form = p.tetikler.find((t) => t.type === 'pageview')!;
    const regex = new RegExp(form.filter[0]!.parameter[1]!.value!);
    expect(regex.test('/tesekkurler')).toBe(true);
    expect(regex.test('/tesekkurler/')).toBe(true);
    expect(regex.test('/tesekkurler-blog')).toBe(false);
    expect(p.degiskenler.sort()).toEqual(['clickUrl', 'pagePath']);
  });

  it('KRİTİK: sitede/konteynerde zaten yüklü GA4 ve piksel TEKRAR eklenmez; olaylar yine eklenir ve neden yazılır', () => {
    const p = gtmPlani({ ...temel, mevcut: { ga4Yuklu: true, pikselYuklu: true } });
    expect(p.etiketler.some((e) => e.type === 'googtag')).toBe(false);
    expect(p.etiketler.some((e) => e.name === 'Advetics · Meta pikseli')).toBe(false);
    expect(p.etiketler.some((e) => e.name === 'Advetics · GA4 form')).toBe(true);
    expect(p.etiketler.find((e) => e.name === 'Advetics · Meta form')!.onceki).toBeUndefined();
    expect(p.atlananlar.join(' ')).toContain('zaten yüklü');
  });

  it('Meta olayı piksel başlatıldıktan SONRA (sıralı); teşekkür sayfası yoksa form kurulmaz ve söylenir', () => {
    expect(gtmPlani(temel).etiketler.find((e) => e.name === 'Advetics · Meta form')!.onceki).toBe('Advetics · Meta pikseli');
    const p = gtmPlani({ ...temel, tetik: { formYolu: null, telefon: false, whatsapp: true } });
    expect(p.etiketler.some((e) => e.name.includes('form'))).toBe(false);
    expect(p.atlananlar.join(' ')).toContain('teşekkür sayfası seçilmedi');
    const wa = p.tetikler.find((t) => t.name.includes('WhatsApp'))!;
    const r = new RegExp(wa.filter[0]!.parameter[1]!.value!);
    expect(r.test('https://wa.me/905551112233')).toBe(true);
    expect(r.test('https://example.com/wa.me')).toBe(false);
  });

  it('teşekkür yolundaki nokta her karakteri eşlemez (regex kaçışı)', () => {
    const p = gtmPlani({ ...temel, tetik: { formYolu: '/tesekkur.html', telefon: false, whatsapp: false } });
    const r = new RegExp(p.tetikler[0]!.filter[0]!.parameter[1]!.value!);
    expect(r.test('/tesekkur.html')).toBe(true);
    expect(r.test('/tesekkurXhtml')).toBe(false);
  });

  it('konteynerde BAŞKASININ etiketi aynı kimliği yüklüyorsa "yüklü"; bizim etiketimiz sayılmaz', () => {
    const yabanci = [
      { name: 'GA4 config', type: 'googtag', parameter: [{ type: 'template' as const, key: 'tagId', value: 'G-ABC1234' }] },
      { name: 'Piksel', type: 'html', parameter: [{ type: 'template' as const, key: 'html', value: "fbq('init', '123456789');" }] },
    ];
    expect(konteynerdeYuklu(yabanci, 'G-ABC1234', '123456789')).toMatchObject({ ga4Yuklu: true, pikselYuklu: true });
    const bizim = yabanci.map((e) => ({ ...e, name: `Advetics · ${e.name}` }));
    expect(konteynerdeYuklu(bizim, 'G-ABC1234', '123456789')).toMatchObject({ ga4Yuklu: false, pikselYuklu: false });
  });

  it('piksel kodu yalnız sayısal kimlik kabul eder (HTML enjeksiyonu yok)', () => {
    expect(metaPikselKodu('123456789')).toContain("fbq('init', '123456789')");
    expect(() => metaPikselKodu("1'); alert(1); ('")).toThrow();
  });
});

describe('saf platform kararları', () => {
  it('KRİTİK: Meta saat dilimi kimliği TAHMİN EDİLMEZ; İstanbul saatli hesap yoksa null', () => {
    expect(istanbulSaatKimligi([{ timezone_id: 999, timezone_name: 'America/New_York' }, { timezone_id: 160, timezone_name: 'Europe/Istanbul' }])).toBe(160);
    expect(istanbulSaatKimligi([{ timezone_id: 1, timezone_name: 'America/Los_Angeles' }])).toBeNull();
    expect(istanbulSaatKimligi([])).toBeNull();
  });

  it('Meta ödeme: hesap aktif değilse ya da ödeme kaynağı boşsa hazır değil', () => {
    expect(odemeHazirMi({ account_status: 1, funding_source_details: { id: '1', type: 1 } }).hazir).toBe(true);
    expect(odemeHazirMi({ account_status: 1 }).hazir).toBe(false);
    expect(odemeHazirMi({ account_status: 1, funding_source_details: {} }).hazir).toBe(false);
    expect(odemeHazirMi({ account_status: 3, funding_source_details: { id: '1' } }).hazir).toBe(false);
  });

  it('Google Ads etiket parçasından send_to; yoksa null (tahmin yok)', () => {
    expect(gonderAdresi([{ eventSnippet: "gtag('event', 'conversion', {'send_to': 'AW-123456789/AbC-dEf_1'});" }])).toEqual({ conversionId: '123456789', conversionLabel: 'AbC-dEf_1' });
    expect(gonderAdresi([{ eventSnippet: 'boş' }])).toBeNull();
  });

  it('teşekkür yolu: tam adres yola indirgenir, ana sayfa reddedilir', () => {
    expect(tesekkurYoluSchema.parse('https://ornek.com/tesekkurler/?a=1#x')).toBe('/tesekkurler');
    expect(tesekkurYoluSchema.safeParse('/').success).toBe(false);
    expect(tesekkurYoluSchema.safeParse('https://ornek.com/').success).toBe(false);
  });

  it('GTM kodu yalnız geçerli kimlikle', () => {
    expect(gtmKodu('GTM-ABC123').head).toContain("'GTM-ABC123'");
    expect(() => gtmKodu('GTM-<x>')).toThrow();
  });

  it('istek şeması bilinen adımları kabul eder, bilinmeyeni reddeder', () => {
    expect(kurulumIstegiSchema.safeParse({ kod: 'gtm_etiket', tetik: { formYolu: '/t', telefon: true, whatsapp: false } }).success).toBe(true);
    expect(kurulumIstegiSchema.safeParse({ kod: 'bilinmeyen' }).success).toBe(false);
  });
});

describe('adım durumları', () => {
  const satir = (x: Partial<KurulumSatiri> = {}): KurulumSatiri => ({
    hesapSahibi: 'ajans',
    metaAcilanHesap: null,
    googleAcilanHesap: null,
    gtmKonteynerYolu: null,
    gtmKimligi: null,
    gtmYayin: null,
    ga4MulkId: null,
    ga4OlcumKimligi: null,
    ga4AdsBagli: false,
    adsDonusumleri: {},
    donusumTetigi: null,
    adimNotlari: {},
    sonDogrulama: null,
    siteKodu: null,
    ...x,
  });
  const anlik = (x: Partial<KurulumAnlik> = {}): KurulumAnlik => ({
    meta: { externalId: 'act_1', ad: 'M', accountStatus: 1 },
    google: { externalId: '1234567890', ad: 'G' },
    sayfa: { ad: 'S', instagram: 'I' },
    havuzSayfaSayisi: 0,
    googleBaglanti: { id: 'g', olcumIzni: true },
    metaBaglanti: { id: 'm' },
    site: 'https://ornek.com',
    pikselId: '123456789',
    satir: satir(),
    hazirlama: { durum: 'hazir', soruSayisi: 0 },
    ...x,
  });
  const bul = (a: KurulumAnlik, k: string) => kurulumAdimlari(a).find((x) => x.kod === k)!;

  /*
   * TAMAMLANMIŞ ÖLÇÜM SEÇİMİ DEĞİŞTİRİLEBİLİR (2026-10-14): konteyner, mülk
   * ve piksel "tamam" olunca eylem null dönüyordu ve yanlış seçimi düzeltmenin
   * panelde yolu yoktu. Hesap ve sayfa BİLEREK değiştirilemez (atama ekranı).
   */
  it('KRİTİK: tamam konteyner, mülk ve piksel "Değiştir" taşır; hesap ve sayfa taşımaz', () => {
    const a = anlik({ satir: satir({ gtmKimligi: 'GTM-ABC', gtmKonteynerYolu: 'accounts/1/containers/2', ga4MulkId: '41', ga4OlcumKimligi: 'G-XYZ' }) });
    for (const k of ['gtm_konteyner', 'ga4_mulk', 'meta_piksel']) {
      expect(bul(a, k).durum, k).toBe('tamam');
      expect(bul(a, k).eylem, k).toEqual({ tur: 'secim', etiket: 'Değiştir' });
      expect(bul(a, k).otomatik, k).toBe(false);
    }
    for (const k of ['meta_hesap', 'google_hesap', 'sayfa']) {
      expect(bul(a, k).durum, k).toBe('tamam');
      expect(bul(a, k).eylem, k).toBeNull();
    }
  });

  it('ölçüm izni yoksa konteyner/mülk "Değiştir" çıkmaz (liste okunamazdı); site yoksa mülk de çıkmaz', () => {
    const s = satir({ gtmKimligi: 'GTM-ABC', gtmKonteynerYolu: 'accounts/1/containers/2', ga4MulkId: '41', ga4OlcumKimligi: 'G-XYZ' });
    const izinsiz = anlik({ satir: s, googleBaglanti: { id: 'g', olcumIzni: false } });
    expect(bul(izinsiz, 'gtm_konteyner').eylem).toBeNull();
    expect(bul(izinsiz, 'ga4_mulk').eylem).toBeNull();
    expect(bul(anlik({ satir: s, site: null }), 'ga4_mulk').eylem).toBeNull();
  });

  it('her kod tam bir kez, sabitteki sırayla; nedeni boş adım yok', () => {
    for (const a of [anlik(), anlik({ meta: null, google: null, googleBaglanti: null, metaBaglanti: null, satir: null, hazirlama: null, site: null, pikselId: null })]) {
      const l = kurulumAdimlari(a);
      expect(l.map((x) => x.kod)).toEqual([...KURULUM_ADIM_KODLARI]);
      for (const x of l) expect(x.neden.length, x.kod).toBeGreaterThan(5);
    }
  });

  it('KRİTİK: site kodu adımı çerez onayını söylüyor (bekliyor da, görüldü de)', () => {
    const s = satir({ gtmKimligi: 'GTM-ABC', gtmKonteynerYolu: 'accounts/1/containers/2' });
    expect(bul(anlik({ satir: s }), 'site_kodu').neden).toContain(CEREZ_ONAYI_NOTU);
    const goruldu = satir({ gtmKimligi: 'GTM-ABC', gtmKonteynerYolu: 'accounts/1/containers/2', siteKodu: { zaman: '2026-10-15T00:00:00Z', gorundu: true, hata: null } });
    expect(bul(anlik({ satir: goruldu }), 'site_kodu').neden).toContain(CEREZ_ONAYI_NOTU);
    expect(CEREZ_ONAYI_NOTU).toContain('Consent Mode v2');
    expect(CEREZ_ONAYI_NOTU).not.toContain('—');
  });

  it('KRİTİK: gerçek hesap açan adımlar ve kullanıcı işleri ASLA otomatik değil', () => {
    const l = kurulumAdimlari(anlik({ meta: null, google: null }));
    for (const k of ['meta_hesap', 'google_hesap', 'meta_odeme', 'google_odeme', 'google_izin', 'site_kodu', 'dogrulama']) expect(l.find((x) => x.kod === k)!.otomatik, k).toBe(false);
  });

  it('KRİTİK: izin yokken ölçüm adımları otomatik sayılmaz, izin adımı izin eylemi taşır', () => {
    const a = anlik({ googleBaglanti: { id: 'g', olcumIzni: false } });
    expect(bul(a, 'google_izin').eylem).toEqual({ tur: 'izin', etiket: 'Ölçüm izinlerini ver', baglantiId: 'g' });
    for (const k of ['gtm_konteyner', 'ga4_mulk']) {
      expect(bul(a, k).otomatik, k).toBe(false);
      expect(bul(a, k).durum, k).toBe('atlandi');
    }
    expect(bul(anlik(), 'gtm_konteyner').otomatik).toBe(true);
  });

  it('ödeme: kontrol edilmemiş = kullanıcıda + platform sayfası; hesap sorunu kodla söylenir', () => {
    expect(bul(anlik(), 'meta_odeme')).toMatchObject({ durum: 'kullanicida', eylem: { tur: 'dis' } });
    expect(bul(anlik({ meta: { externalId: 'act_1', ad: 'M', accountStatus: 3 } }), 'meta_odeme').neden).toContain('3');
    const t = anlik({ satir: satir({ adimNotlari: { meta_odeme: { durum: 'tamam', mesaj: 'ok', zaman: '2026-10-12T10:00:00Z' } } }) });
    expect(bul(t, 'meta_odeme').durum).toBe('tamam');
  });

  it('KRİTİK: etiketler yayınlandıktan sonra piksel ya da tetik değişirse "güncellenmeli" (eski yayın tamam sayılmaz)', () => {
    const tetik = { formYolu: '/t', telefon: false, whatsapp: false };
    const s = satir({ gtmKonteynerYolu: 'accounts/1/containers/2', gtmKimligi: 'GTM-ABCD', donusumTetigi: tetik });
    const imza = etiketImzasi({ ga4: null, piksel: '123456789', tetik, ads: {} });
    const yayinli = anlik({ satir: { ...s, gtmYayin: { surumId: '5', zaman: 'z', etiketler: ['x'], atlananlar: [], imza } } });
    expect(bul(yayinli, 'gtm_etiket').durum).toBe('tamam');
    expect(bul({ ...yayinli, pikselId: '999999999' }, 'gtm_etiket')).toMatchObject({ durum: 'eksik', baslik: 'Güncellenmeli', otomatik: true });
  });

  it('doğrulama: beklenen her olay görülmeden "tamam" değil; görülmeyen adıyla yazılır', () => {
    const tetik = { formYolu: '/t', telefon: false, whatsapp: false };
    const b = dogrulamaBeklenenleri({ ga4: true, piksel: true, tetik });
    expect(b.map((x) => x.olay)).toEqual(['page_view', 'PageView', 'generate_lead', 'Lead']);
    const r = dogrulamaSonucu(b, { zaman: 'z', ga4: { page_view: 3, generate_lead: 1 }, ga4Hata: null, meta: { PageView: 2 }, metaHata: null });
    expect(r.eksik).toEqual(['Meta Lead']);
  });
});

describe('modül kaydı ve izinler', () => {
  it('KRİTİK: modül bağlantı ve ölçüm modüllerini içe alıyor, uygulamaya kayıtlı', () => {
    const mod = yorumsuz(readFileSync(join(__dirname, 'kurulum.module.ts'), 'utf8'));
    expect(mod).toMatch(/imports:\s*\[\s*ConnectionsModule,\s*OlcumModule,\s*VeriKaynagiModule\s*\]/);
    expect(yorumsuz(readFileSync(join(__dirname, '../../app.module.ts'), 'utf8'))).toMatch(/^\s*KurulumModule,/m);
    expect(yorumsuz(readFileSync(join(__dirname, '../connections/connections.module.ts'), 'utf8'))).toMatch(/exports:\s*\[[^\]]*ConnectionsService[^\]]*TokenVaultService[^\]]*ProviderRegistry/);
  });

  it('Google ölçüm izinleri yalnız istenince ekleniyor; zorunlu liste değişmedi', () => {
    const k = yorumsuz(readFileSync(join(__dirname, '../connections/providers/google.provider.ts'), 'utf8'));
    expect(k).toContain("readonly requiredScopes = ['https://www.googleapis.com/auth/adwords']");
    expect(k).toContain('[...this.requiredScopes, ...(ekScopes ?? [])]');
    expect(GOOGLE_OLCUM_SCOPES).toContain('https://www.googleapis.com/auth/tagmanager.publish');
  });
});

describe('servis (PGlite)', () => {
  let h: Harness;
  let svc: KurulumService;
  const ctx = { orgId: IDS.org, userId: IDS.user, clientIds: [IDS.client], activeClientId: IDS.client, permissions: ['client.read', 'client.write', 'connection.write'] } as unknown as TenantContext;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(async () => {
    await h.close();
  });
  beforeEach(async () => {
    await h.reset();
    await seedTenant(h, { platform: 'meta' });
    const prisma = { withTenant: <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db) } as unknown as PrismaService;
    svc = new KurulumService(prisma, {} as never, { getAccessToken: vi.fn() } as never, { get: vi.fn() } as never, { durum: vi.fn() } as never, { record: vi.fn() } as never, { platforms: { google: {}, meta: {} } } as never, { kurulumdanBagla: vi.fn().mockResolvedValue(null) } as never, { oku: vi.fn().mockResolvedValue(new Map()), ekle: vi.fn(), konteynerEkle: vi.fn().mockResolvedValue(undefined) } as never);
  });

  it('kurulum satırı yokken okuma çalışır; Meta hesabı atanmış, Google bağlantısı yok', async () => {
    const y = await svc.oku(ctx, IDS.client);
    expect(y.adimlar.find((a) => a.kod === 'meta_hesap')!.durum).toBe('tamam');
    expect(y.adimlar.find((a) => a.kod === 'google_izin')!.baslik).toBe('Google bağlantısı yok');
    expect(y.siteKodu).toBeNull();
  });

  it('KRİTİK: hesap sahibi kararı yazılır; seçili olmayan workspace’e yazma reddedilir', async () => {
    await svc.adim(ctx, IDS.client, { kod: 'hesap_sahibi', deger: 'sirket' }, {});
    expect((await svc.oku(ctx, IDS.client)).hesapSahibi).toBe('sirket');
    await expect(svc.adim({ ...ctx, activeClientId: null } as TenantContext, IDS.client, { kod: 'hesap_sahibi', deger: 'ajans' }, {})).rejects.toThrow(/seç/);
    await expect(svc.adim({ ...ctx, permissions: ['client.read'] } as unknown as TenantContext, IDS.client, { kod: 'hesap_sahibi', deger: 'ajans' }, {})).rejects.toThrow(/yetki/);
  });

  it('KRİTİK: hesap açma bağlantı yetkisi ister', async () => {
    await expect(
      svc.adim({ ...ctx, permissions: ['client.read', 'client.write'] } as unknown as TenantContext, IDS.client, { kod: 'sayfa', sayfaId: '66666666-6666-4666-8666-666666666666' }, {}),
    ).rejects.toThrow(/bağlantı yönetme/);
  });

  it('KRİTİK: "Eksikleri tamamla" izin yokken ölçüm adımlarına GİTMEZ, platform çağrısı yapmaz', async () => {
    const r = await svc.tamamla(ctx, IDS.client, {});
    expect(r.sonuclar.map((x) => x.kod)).not.toContain('gtm_konteyner');
    expect(r.sonuclar.map((x) => x.kod)).not.toContain('ga4_mulk');
  });

  it('satır okuyucu bozuk JSON alanlarda boş döner', () => {
    expect(satirOku({ hesap_sahibi: 'x', ads_donusumleri: null, adim_notlari: 'bozuk' })).toMatchObject({ hesapSahibi: null, adsDonusumleri: {}, adimNotlari: {} });
  });
});
