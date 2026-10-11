import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyticsBagliMi,
  enUygunOneri,
  googleHucresi,
  metaHucresi,
  olcumSatirlari,
  siteKimlikleri,
  type GoogleDonusumIslemi,
  type MetaPikselOlcumu,
  type OlcumGirdisi,
  type SiteTaramasi,
} from '@advetics/shared';
import { siteTara } from './olcum.service';

/**
 * ÖLÇÜM KARARLARI — canlıda ölçülen verilerle (Ege Birlik Yapı,
 * 2026-10-11, docs/olcum/MIMARI.md). Uydurma fixture yerine gerçek liste:
 * `cta_click` (CONTACT, 15.756) gibi tuzaklar ancak gerçek veride görünüyor.
 */
const EGE: GoogleDonusumIslemi[] = [
  { id: '7733494504', ad: 'Ege Birlik Garden Villas (web) close_convert_lead', durum: 'HIDDEN', kategori: 'CONVERTED_LEAD', tur: 'GOOGLE_ANALYTICS_4_CLOSE_CONVERT_LEAD', birincil: false, sayim30Gun: 0 },
  { id: '7733494507', ad: 'Ege Birlik Garden Villas (web) qualify_lead', durum: 'HIDDEN', kategori: 'QUALIFIED_LEAD', tur: 'GOOGLE_ANALYTICS_4_QUALIFY_LEAD', birincil: false, sayim30Gun: 0 },
  { id: '7733494510', ad: 'Ege Birlik Garden Villas (web) purchase', durum: 'HIDDEN', kategori: 'PURCHASE', tur: 'GOOGLE_ANALYTICS_4_PURCHASE', birincil: false, sayim30Gun: 0 },
  { id: '7733494513', ad: 'Ege Birlik Garden Villas (web) click_to_call', durum: 'ENABLED', kategori: 'PHONE_CALL_LEAD', tur: 'GOOGLE_ANALYTICS_4_CUSTOM', birincil: true, sayim30Gun: 68.999628 },
  { id: '7733494516', ad: 'Ege Birlik Garden Villas (web) generate_lead', durum: 'ENABLED', kategori: 'SUBMIT_LEAD_FORM', tur: 'GOOGLE_ANALYTICS_4_GENERATE_LEAD', birincil: true, sayim30Gun: 3.99226 },
  { id: '7733494519', ad: 'Ege Birlik Garden Villas (web) cta_click', durum: 'ENABLED', kategori: 'CONTACT', tur: 'GOOGLE_ANALYTICS_4_CUSTOM', birincil: false, sayim30Gun: 15756.116306 },
  { id: '1', ad: 'Android installs (all other apps)', durum: 'ENABLED', kategori: 'DOWNLOAD', tur: 'ANDROID_INSTALLS_ALL_OTHER_APPS', birincil: false, sayim30Gun: 0 },
];
const PIKSEL: MetaPikselOlcumu[] = [
  { id: '1781886293257274', ad: 'Egebirlik Seasight', sonCalisma: '2026-10-10T15:47:26.000Z', kullanilamaz: false, olaylar: { PageView: 412, Lead: 2, 'Click to Chat by HoliThemes': 2 } },
  { id: '2', ad: 'Ege Birlik Pixel', sonCalisma: null, kullanilamaz: false, olaylar: {} },
];
const SITE: SiteTaramasi = {
  durum: 'tarandi',
  adres: 'https://egebirlikseasight.com/',
  hata: null,
  tagManager: ['GTM-WMBBT9JQ'],
  analytics: ['G-YWXPLS3GT2'],
  googleAds: [],
  metaPiksel: ['1781886293257274'],
  altyapi: null,
  tagManagerOkunamayan: [],
};
const girdi = (o: Partial<OlcumGirdisi> = {}): OlcumGirdisi => ({
  googleHesapVar: true,
  metaHesapVar: true,
  googleIslemleri: EGE,
  googleHata: null,
  metaPikselleri: PIKSEL,
  metaHata: null,
  site: SITE,
  ...o,
});

describe('site kimlikleri (gerçek gtm.js biçimi)', () => {
  it('KRİTİK: gtm.js içindeki KAÇIŞLI Meta pikseli ve Analytics kimliği bulunur', () => {
    // Ege Birlik gtm.js'den (özel HTML etiketi, kaçışlı tırnak).
    const gtm = '"vtp_measurementIdOverride":"G-YWXPLS3GT2",... fbq(\\"init\\",\\"1781886293257274\\");fbq(\\"set\\"';
    expect(siteKimlikleri(gtm)).toEqual({ tagManager: [], analytics: ['G-YWXPLS3GT2'], googleAds: [], metaPiksel: ['1781886293257274'] });
    const sayfa = `<script>(function(w,d,s,l,i){})(window,document,'script','dataLayer','GTM-WMBBT9JQ');</script>
      <script>gtag('config','AW-18409398361');fbq('init', '123456789012');</script><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-WMBBT9JQ">`;
    expect(siteKimlikleri(sayfa)).toEqual({ tagManager: ['GTM-WMBBT9JQ'], analytics: [], googleAds: ['AW-18409398361'], metaPiksel: ['123456789012'] });
  });
});

describe('Google hücresi', () => {
  it('KRİTİK: CONTACT kategorili tıklama (15.756) FORM sayılmaz; form = generate_lead', () => {
    const h = googleHucresi('site_formu', EGE, null, true);
    expect(h.durum).toBe('kaydediliyor');
    expect(h.neden).toContain('generate_lead');
    expect(h.sayim).toBeCloseTo(3.99, 1);
    // generate_lead yokken 15.756'lık tıklama formu "kaydediliyor" ya da "ikincil" yapmamalı.
    expect(googleHucresi('site_formu', EGE.filter((i) => i.kategori !== 'SUBMIT_LEAD_FORM'), null, true).durum).toBe('tanim_yok');
  });
  it('gizli satın alma "tanım yok" ve nedenini söylüyor; arama birincil 69', () => {
    expect(googleHucresi('satin_alma', EGE, null, true)).toMatchObject({ durum: 'tanim_yok', neden: expect.stringMatching(/Analytics'te tanımı var/) });
    expect(googleHucresi('arama', EGE, null, true).durum).toBe('kaydediliyor');
  });
  it('KRİTİK: sayım alan ama birincil olmayan işlem "ikincil"; okunamadı ≠ tanım yok', () => {
    const ikincil = EGE.map((i) => (i.id === '7733494516' ? { ...i, birincil: false } : i));
    expect(googleHucresi('site_formu', ikincil, null, true).durum).toBe('ikincil');
    expect(googleHucresi('site_formu', null, 'PERMISSION_DENIED', true)).toMatchObject({ durum: 'bilinmiyor', neden: 'PERMISSION_DENIED' });
    expect(googleHucresi('site_formu', [], null, false).durum).toBe('hesap_yok');
    expect(googleHucresi('mesaj_ve_form', EGE, null, true).durum).toBe('platformda_yok');
  });
});

describe('Meta hücresi', () => {
  it('KRİTİK: site formu Lead olayından; eklenti olayı sayılmaz; çalışmayan piksel sorulmaz', () => {
    expect(metaHucresi('site_formu', PIKSEL, null, true)).toMatchObject({ durum: 'kaydediliyor', sayim: 2 });
    expect(metaHucresi('satin_alma', PIKSEL, null, true).durum).toBe('sinyal_yok');
    expect(metaHucresi('mesaj_ve_form', PIKSEL, null, true).durum).toBe('platform_sayiyor');
  });
  it('istatistik okunamadıysa "olay yok" denmez', () => {
    const okunamadi = PIKSEL.map((p) => ({ ...p, olaylar: p.sonCalisma ? null : {} }));
    expect(metaHucresi('site_formu', okunamadi, null, true).durum).toBe('bilinmiyor');
  });
});

describe('en uygun öneri', () => {
  it('KRİTİK (Ege Birlik gerçek hâli): emlak sitesine satış kurulumu ÖNERİLMEZ; hepsi hazır', () => {
    const g = girdi();
    const o = enUygunOneri(g, olcumSatirlari(g));
    expect(o.kod).toBe('HEPSI_HAZIR');
    expect(o.metin).toMatch(/satış akışı bulunmadı/);
  });
  it('KRİTİK: sayım alan ikincil işlem → tek tıklık "birincil yap", eylem işlemin kimliğini taşır', () => {
    const g = girdi({ googleIslemleri: EGE.map((i) => (i.id === '7733494516' ? { ...i, birincil: false } : i)) });
    const o = enUygunOneri(g, olcumSatirlari(g));
    expect(o).toMatchObject({ kod: 'BIRINCIL_YAP', eylem: { tur: 'birincil_yap', donusumId: '7733494516' } });
  });
  it('form Google\'da yoksa kurulum önerisi Tag Manager kimliğiyle ve izin kısıtıyla gelir', () => {
    const g = girdi({ googleIslemleri: EGE.filter((i) => i.kategori !== 'SUBMIT_LEAD_FORM') });
    const o = enUygunOneri(g, olcumSatirlari(g));
    expect(o.kod).toBe('GOOGLE_KURULUM');
    expect(o.adimlar.map((a) => a.yer)).toEqual(['google_ads', 'tag_manager', 'site']);
    expect(o.adimlar[1]!.metin).toContain('GTM-WMBBT9JQ');
    expect(o.kisit).toMatch(/izni/);
    expect(o.eylem).toBeNull();
  });
  it('e-ticaret imzası varsa satış eksiği önerilir; hesap yoksa önce hesap', () => {
    const g = girdi({ site: { ...SITE, altyapi: 'Shopify' } });
    expect(enUygunOneri(g, olcumSatirlari(g)).kod).toBe('GOOGLE_KURULUM');
    const yok = girdi({ googleHesapVar: false, metaHesapVar: false });
    expect(enUygunOneri(yok, olcumSatirlari(yok)).kod).toBe('HESAP_ATA');
  });
  it('Analytics bağlılığı içe aktarılmış işlemden çıkarılır', () => {
    expect(analyticsBagliMi(EGE)).toBe(true);
    expect(analyticsBagliMi(EGE.filter((i) => !i.tur.startsWith('GOOGLE_ANALYTICS_4')))).toBe(false);
    expect(analyticsBagliMi(null)).toBeNull();
  });
});

describe('site taraması', () => {
  it('KRİTİK: piksel ve Analytics YALNIZ gtm.js içindeyse de bulunur; okunamayan kapsayıcı söylenir', async () => {
    const okunan: string[] = [];
    const r = await siteTara('egebirlikseasight.com', async (adres) => {
      okunan.push(adres);
      if (adres.includes('gtm.js?id=GTM-AAAA1111')) return { ok: true, html: '"G-YWXPLS3GT2" fbq(\\"init\\",\\"1781886293257274\\")' };
      if (adres.includes('gtm.js')) return { ok: false, sebep: 'zaman aşımı' };
      return { ok: true, html: "<script>'GTM-AAAA1111'</script><script>'GTM-BBBB2222'</script>" };
    });
    expect(okunan[0]).toBe('https://egebirlikseasight.com');
    expect(r).toMatchObject({ durum: 'tarandi', analytics: ['G-YWXPLS3GT2'], metaPiksel: ['1781886293257274'], tagManagerOkunamayan: ['GTM-BBBB2222'] });
  });
  it('adres yoksa ve ulaşılamazsa durum ayrı', async () => {
    expect((await siteTara(null, async () => ({ ok: true, html: '' }))).durum).toBe('adres_yok');
    expect(await siteTara('https://x.com', async () => ({ ok: false, sebep: 'Sunucu 503' }))).toMatchObject({ durum: 'ulasilamadi', hata: 'Sunucu 503' });
  });
});

describe('kayıt ve yetki (kaynak taraması)', () => {
  const yorumsuz = (p: string) => readFileSync(join(__dirname, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  it('KRİTİK: modül uygulamaya kayıtlı, servis sağlayıcıda, ConnectionsModule içe aktarılıyor', () => {
    expect(yorumsuz('../../app.module.ts')).toMatch(/\n\s+OlcumModule,/);
    const m = yorumsuz('olcum.module.ts');
    expect(m).toContain('imports: [ConnectionsModule]');
    expect(m).toContain('providers: [OlcumService]');
  });
  it('KRİTİK: platforma yazan uç client.write, okuma client.read; yazma geri okumayla', () => {
    const c = yorumsuz('olcum.controller.ts');
    expect(c.slice(c.indexOf("@Post('birincil-yap')"), c.indexOf("@Post('birincil-yap')") + 80)).toContain("@RequirePermissions('client.write')");
    expect(c.slice(c.indexOf('@Get()'), c.indexOf('@Get()') + 60)).toContain("@RequirePermissions('client.read')");
    const s = yorumsuz('olcum.service.ts');
    const g = s.slice(s.indexOf('async birincilYap('));
    expect(g.indexOf('donusumBirincilYap(fctx')).toBeGreaterThan(0);
    expect(g.indexOf('donusumBirincilMi(fctx')).toBeGreaterThan(g.indexOf('donusumBirincilYap(fctx'));
    expect(g).toContain('i.sayim30Gun <= 0');
  });
});

describe('platform okuma ve yazma biçimleri', () => {
  it('KRİTİK: Meta piksel istatistiği saatlik kovalardan olay başına toplanır (gerçek yanıt biçimi)', async () => {
    const { pikselOlayToplamlariCoz } = await import('../connections/providers/meta.provider');
    const yanit = {
      data: [
        { start_time: '2026-10-04T22:00:00+0300', aggregation: 'event', data: [{ value: 'PageView', count: 6 }, { value: 'Lead', count: 2 }] },
        { start_time: '2026-10-06T14:00:00+0300', aggregation: 'event', data: [{ value: 'PageView', count: 35 }, { value: 'Click to Chat by HoliThemes', count: 2 }] },
      ],
      paging: { next: 'https://graph.facebook.com/x?after=1' },
    };
    expect(pikselOlayToplamlariCoz(yanit)).toEqual({ toplamlar: { PageView: 41, Lead: 2, 'Click to Chat by HoliThemes': 2 }, sonraki: 'https://graph.facebook.com/x?after=1' });
    expect(pikselOlayToplamlariCoz({ hata: 1 })).toBeNull();
    expect(pikselOlayToplamlariCoz({ data: [{ data: 'bozuk' }] })).toBeNull();
  });

  it('KRİTİK: "birincil yap" YALNIZ primary_for_goal maskesiyle ve kısmi başarı kapalı gider', async () => {
    const { GoogleProvider } = await import('../connections/providers/google.provider');
    let govde: unknown = null;
    let adres = '';
    const sahte = Object.create(GoogleProvider.prototype) as InstanceType<typeof GoogleProvider>;
    (sahte as unknown as { guncelle: (c: unknown, k: string, g: unknown) => Promise<void> }).guncelle = async (_c, k, g) => {
      adres = k;
      govde = g;
    };
    await sahte.donusumBirincilYap({ accessToken: 't', accountExternalId: '5161746317' }, '7733494516');
    expect(adres).toBe('conversionActions');
    expect(govde).toEqual({
      operations: [{ update: { resourceName: 'customers/5161746317/conversionActions/7733494516', primaryForGoal: true }, updateMask: 'primary_for_goal' }],
      partialFailure: false,
    });
    await expect(sahte.donusumBirincilYap({ accessToken: 't', accountExternalId: '1' }, '1; DROP')).rejects.toThrow(/sayısal/);
  });
});
