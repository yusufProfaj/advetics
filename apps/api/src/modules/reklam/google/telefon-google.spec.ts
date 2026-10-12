import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_DONUSUM_TEKLIF_ESIGI,
  TABAN_NEGATIFLER,
  calismaSaatleriSchema,
  googleAramaSaatleri,
  googleTeklifKarari,
  googleTelefonDonusumuMu,
  rehberdenGoogle,
  type RehberAlanlari,
  type CalismaSaatleri,
  type GoogleDerlemeGirdisi,
} from '@advetics/shared';
import { aramaAtomikIstek } from '../../connections/providers/google-write';
import { GoogleProvider, aramaTiklamaSorgusu } from '../../connections/providers/google.provider';
import { derleGoogle } from './derle-google';
import { googleGeriOkumaKarsilastir, type GoogleOkunan } from './google-yayin';
import { GOOGLE_TELEFON_DONUSUM_SORGUSU, GOOGLE_TELEFON_ISLEMLERI_SORGUSU, telefonDonusumToplami } from '../rehber/rehber.service';

/**
 * ═══ "BENİ TELEFONLA ARASINLAR" — GOOGLE TARAFI (yönetici kararları, 2026-10-12) ═══
 *
 * 1. Dönüşüm teklifi YALNIZ reklamdan arama (AD_CALL) dönüşümüyle; sitedeki
 *    tel: tıklaması (WEBPAGE, Advetics'in kendi kurduğu işlem) sayılmaz.
 * 2. Arama düğmesi tıklaması AYRI sorguda; ana metrik sorgusuna segment
 *    girmiyor; sorgu düşerse ana çekim sürüyor ve hata ham gövdede.
 * 3. Çalışma saatleri arama öğesinin `adScheduleTargets`i; boşsa gönderilmez.
 * Canlı çağrı YOK.
 */

const SAATLER: CalismaSaatleri = [
  { gun: 'MONDAY', acilis: '09:00', kapanis: '18:00' },
  { gun: 'SATURDAY', acilis: '10:30', kapanis: '14:00' },
];

const GIRDI: GoogleDerlemeGirdisi = {
  kurgu: 'ARAMA',
  ulasma: 'telefon',
  teklif: 'MAKS_TIKLAMA',
  musteriId: '1234567890',
  paraBirimi: 'TRY',
  saatDilimi: 'Europe/Istanbul',
  konumlar: ['geoTargetConstants/1012782'],
  dil: 'languageConstants/1037',
  enDusukYas: 18,
  butce: { tip: 'gunluk', micros: 250_000_000n },
  takvim: { baslangic: '2026-10-13', bitis: null },
  hedefAdres: 'https://ornek.com.tr/',
  telefon: '+902325551234',
  basliklar: ['Bir', 'İki', 'Üç'],
  aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'],
  anahtarKelimeler: ['kuşadası villa'],
  negatifler: [...TABAN_NEGATIFLER],
  gorselVarlikIdleri: [],
  youtubeVideoId: null,
  isletmeAdi: 'Ornek',
  logoVarlikId: null,
  kategoriler: [],
};
const BAGLAM = { kimlik: 'abcdef12-0000-4000-8000-000000000000', workspaceKisaAdi: 'WS', amacEkranAdi: 'Beni arasınlar', simdi: new Date('2026-10-12T09:00:00+03:00'), validateOnly: true, logo: null, youtubeVideoBasligi: null };

function derle(g: Partial<GoogleDerlemeGirdisi>) {
  const d = derleGoogle({ ...GIRDI, ...g }, BAGLAM);
  if (d.tur !== 'govde') throw new Error(JSON.stringify(d.retler));
  return d;
}
const cagriOgesi = (ops: Array<Record<string, unknown>>) =>
  ops.map((o) => (o.assetOperation as { create?: Record<string, any> } | undefined)?.create).find((c) => c?.callAsset)?.callAsset as Record<string, any>;

describe('teklif: yalnız reklamdan arama dönüşümü', () => {
  it('KRİTİK: sitedeki tel: tıklaması (WEBPAGE) sayılmaz; AD_CALL, birincil ve etkinse sayılır', () => {
    const t = { kategori: 'PHONE_CALL_LEAD', tur: 'AD_CALL', birincil: true, durum: 'ENABLED' };
    expect(googleTelefonDonusumuMu(t)).toBe(true);
    expect(googleTelefonDonusumuMu({ ...t, tur: 'WEBPAGE' })).toBe(false);
    expect(googleTelefonDonusumuMu({ ...t, tur: 'WEBSITE_CALL' })).toBe(false);
    expect(googleTelefonDonusumuMu({ ...t, birincil: false })).toBe(false);
    expect(googleTelefonDonusumuMu({ ...t, durum: 'PAUSED' })).toBe(false);
    expect(googleTelefonDonusumuMu({ ...t, kategori: 'SUBMIT_LEAD_FORM' })).toBe(false);
  });

  it('KRİTİK: eşik 15; altı ve bilinmeyen tıklama; cümleler arama dönüşümünü anlatıyor', () => {
    expect(googleTeklifKarari('ARAMA', true, GOOGLE_DONUSUM_TEKLIF_ESIGI, 'telefon').teklif).toBe('MAKS_DONUSUM');
    expect(googleTeklifKarari('ARAMA', true, 14, 'telefon')).toEqual({ teklif: 'MAKS_TIKLAMA', sebep: 'Son 30 günde reklamdan 14 arama dönüşümü var; dönüşüm teklifi için en az 15 gerekiyor' });
    expect(googleTeklifKarari('ARAMA', false, null, 'telefon').sebep).toContain('sitedeki telefon tıklaması sayılmaz');
    expect(googleTeklifKarari('ARAMA', null, null, 'telefon').teklif).toBe('MAKS_TIKLAMA');
    expect(googleTeklifKarari('ARAMA', true, null, 'telefon').teklif).toBe('MAKS_TIKLAMA');
    // Site ulaşmasında eski cümleler aynen.
    expect(googleTeklifKarari('ARAMA', true, 15, 'site').sebep).toBe('Dönüşüm ölçümü etkin ve son 30 günde 15 dönüşüm var');
  });

  it('KRİTİK: toplam yalnız sayılan işlemlerden (WEBPAGE işleminin 40 dönüşümü girmez)', () => {
    const sayilan = new Set(['customers/1/conversionActions/7']);
    const satirlar = [
      { segments: { conversionAction: 'customers/1/conversionActions/7' }, metrics: { conversions: 9 } },
      { segments: { conversionAction: 'customers/1/conversionActions/7' }, metrics: { conversions: '3' } },
      { segments: { conversionAction: 'customers/1/conversionActions/8' }, metrics: { conversions: 40 } },
      { segments: { conversionAction: 'customers/1/conversionActions/7' }, metrics: {} },
    ];
    expect(telefonDonusumToplami(satirlar, sayilan)).toBe(12);
    expect(() => telefonDonusumToplami([{ segments: { conversionAction: 'customers/1/conversionActions/7' }, metrics: { conversions: 'x' } }], sayilan)).toThrow();
  });

  it('sorgular: tür SEÇİMDE (süzgeç saf fonksiyonda); segmentli sayımda yalnız dönüşüm, WHERE alanı SELECT\'te', () => {
    expect(GOOGLE_TELEFON_ISLEMLERI_SORGUSU).toContain('conversion_action.type');
    expect(GOOGLE_TELEFON_ISLEMLERI_SORGUSU).not.toMatch(/WHERE[\s\S]*conversion_action\.type/);
    expect(GOOGLE_TELEFON_DONUSUM_SORGUSU).toMatch(/SELECT segments\.conversion_action, segments\.conversion_action_category, metrics\.conversions\s+FROM/);
    expect(GOOGLE_TELEFON_DONUSUM_SORGUSU).not.toMatch(/metrics\.(clicks|impressions|cost_micros)/);
  });

  it('KRİTİK: servis TELEFON\'da GENEL ölçüyü kullanmıyor (önbellekte ölçü türü ayrı)', () => {
    const k = readFileSync(join(__dirname, '../rehber/rehber.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const bas = k.indexOf('private async googleDonusumTazele(');
    const son = k.indexOf('private async googleTelefonDonusumu(');
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    const govde = k.slice(bas, son);
    expect(govde).toContain('this.googleTelefonDonusumu(ctx, hesap)');
    expect(govde).toContain("googleDonusumOlcusu: telefon ? 'telefon' : 'genel'");
    expect(k).toContain('(taze.googleDonusumOlcusu ?? \'genel\') === istenenOlcu');
  });
});

describe('arama düğmesi tıklaması (segments.click_type = CALLS)', () => {
  const KAYNAK = readFileSync(join(__dirname, '../../connections/providers/google.provider.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  it('KRİTİK: ana metrik sorgusu click_type TAŞIMIYOR; ayrı sorgu YALNIZ tıklama seçiyor', () => {
    const bas = KAYNAK.indexOf('async fetchInsights(');
    const son = KAYNAK.indexOf('private async donusumDetaylari(');
    expect(bas).toBeGreaterThan(-1);
    expect(son).toBeGreaterThan(bas);
    const ana = KAYNAK.slice(bas, son);
    expect(ana).toContain('metrics.cost_micros');
    expect(ana).not.toContain('click_type');
    expect(ana).toContain('this.aramaDugmesiTiklamalari(');
    const q = aramaTiklamaSorgusu({ idField: 'campaign.id', resource: 'campaign' }, '2026-10-01', '2026-10-02');
    expect(q).toMatch(/SELECT campaign\.id, segments\.date, segments\.click_type, metrics\.clicks\s+FROM campaign/);
    expect(q).toContain("segments.click_type = 'CALLS'");
    expect(q).not.toMatch(/impressions|cost_micros|conversions/);
  });

  afterEach(() => vi.restoreAllMocks());
  const saglayici = () =>
    new GoogleProvider({ platforms: { google: { clientId: 'c', clientSecret: 's', developerToken: 'd', apiVersion: 'v25' } } } as never);
  const ANA = [{ campaign: { id: '55' }, segments: { date: '2026-10-01' }, customer: { currencyCode: 'TRY' }, metrics: { impressions: 100, clicks: 10, costMicros: '5000000' } }];

  it('KRİTİK: tıklama sorgusu DÜŞERSE ana çekim sürer, hata ham gövdede (0 yazılmaz)', async () => {
    const p = saglayici();
    vi.spyOn(p as never, 'searchGaqlPaged').mockImplementation((async (_t: string, _c: string, q: string) => {
      if (q.includes('click_type')) throw new Error('UNRECOGNIZED_FIELD click_type');
      if (q.includes('conversion_action_name')) return [];
      return ANA;
    }) as never);
    const r = await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, { level: 'campaign', dateFrom: '2026-10-01', dateTo: '2026-10-01' } as never);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.spendMicros).toBe(5_000_000n);
    expect(r.rows[0]!.raw).toMatchObject({ callClicksError: expect.stringContaining('click_type') });
    expect(r.rows[0]!.raw).not.toHaveProperty('callClicks');
  });

  it('KRİTİK: başarıda kampanya-gün başına sayı; ana satırın gösterim/harcaması DEĞİŞMEZ', async () => {
    const p = saglayici();
    vi.spyOn(p as never, 'searchGaqlPaged').mockImplementation((async (_t: string, _c: string, q: string) => {
      if (q.includes('click_type'))
        return [
          { campaign: { id: '55' }, segments: { date: '2026-10-01', clickType: 'CALLS' }, metrics: { clicks: 4 } },
          { campaign: { id: '55' }, segments: { date: '2026-10-01', clickType: 'URL_CLICKS' }, metrics: { clicks: 90 } },
        ];
      if (q.includes('conversion_action_name')) return [];
      return ANA;
    }) as never);
    const r = await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, { level: 'campaign', dateFrom: '2026-10-01', dateTo: '2026-10-01' } as never);
    expect(r.rows[0]!.raw).toMatchObject({ callClicks: 4 });
    expect(r.rows[0]!.impressions).toBe(100);
    expect(r.rows[0]!.clicks).toBe(10);
  });

  it('reklam seviyesinde sorulmuyor (segmentin kabulü ölçülmedi): ham gövdede alan yok', async () => {
    const p = saglayici();
    const sorgular: string[] = [];
    vi.spyOn(p as never, 'searchGaqlPaged').mockImplementation((async (_t: string, _c: string, q: string) => {
      sorgular.push(q);
      return [];
    }) as never);
    await p.fetchInsights({ accessToken: 't', accountExternalId: '1234567890' } as never, { level: 'ad', dateFrom: '2026-10-01', dateTo: '2026-10-01' } as never);
    expect(sorgular.some((q) => q.includes('click_type'))).toBe(false);
  });
});

describe('çalışma saatleri → arama öğesi', () => {
  it('KRİTİK: dolu saat CallAsset.adScheduleTargets olur (gün ve dakika enum\'u)', () => {
    const d = derle({ aramaSaatleri: SAATLER });
    expect(cagriOgesi(d.govde.mutateOperations).adScheduleTargets).toEqual([
      { dayOfWeek: 'MONDAY', startHour: 9, startMinute: 'ZERO', endHour: 18, endMinute: 'ZERO' },
      { dayOfWeek: 'SATURDAY', startHour: 10, startMinute: 'THIRTY', endHour: 14, endMinute: 'ZERO' },
    ]);
    expect(d.beklenen.aramaSaatleri).toHaveLength(2);
    expect(d.notlar.join(' ')).toContain('yalnız çalışma saatlerinde');
  });

  it('KRİTİK: saat yoksa alan GÖNDERİLMEZ ve not söyler; beklenende de yok', () => {
    const d = derle({});
    expect(cagriOgesi(d.govde.mutateOperations)).not.toHaveProperty('adScheduleTargets');
    expect(d.beklenen).not.toHaveProperty('aramaSaatleri');
    expect(d.notlar.join(' ')).toContain('çalışma saatleri girilmedi');
  });

  it('site ulaşmasında (isteğe bağlı arama öğesi) saat gitmez', () => {
    const op = aramaAtomikIstek({
      customerId: '1', name: 'n', stamp: 's', gunlukButceMicros: 1n, endDate: null, teklif: 'targetSpend', konumlar: ['geoTargetConstants/1'], dil: 'languageConstants/1037',
      negatifler: [], anahtarKelimeler: ['a'], finalUrl: 'https://a.com', basliklar: ['a', 'b', 'c'], aciklamalar: ['a', 'b'], telefon: '+902325551234', aramaSaatleri: null, validateOnly: true,
    });
    expect(cagriOgesi(op.govde.mutateOperations)).not.toHaveProperty('adScheduleTargets');
  });

  it('girişte doğrulama: 15 dakikanın katı olmayan saat, ters aralık, çakışan iki aralık RED', () => {
    expect(calismaSaatleriSchema.safeParse([{ gun: 'MONDAY', acilis: '09:10', kapanis: '18:00' }]).success).toBe(false);
    expect(calismaSaatleriSchema.safeParse([{ gun: 'MONDAY', acilis: '18:00', kapanis: '09:00' }]).success).toBe(false);
    expect(
      calismaSaatleriSchema.safeParse([
        { gun: 'MONDAY', acilis: '09:00', kapanis: '13:00' },
        { gun: 'MONDAY', acilis: '12:00', kapanis: '18:00' },
      ]).success,
    ).toBe(false);
    expect(calismaSaatleriSchema.safeParse([{ gun: 'MONDAY', acilis: '00:00', kapanis: '24:00' }]).success).toBe(true);
    expect(googleAramaSaatleri([])).toBeNull();
    expect(googleAramaSaatleri(null)).toBeNull();
    // Bozuk kayıt derleyicide ret (sessizce "her saat" değil).
    const d = derleGoogle({ ...GIRDI, aramaSaatleri: [{ gun: 'MONDAY', acilis: '09:10', kapanis: '18:00' }] }, BAGLAM);
    expect(d.tur === 'ret' && d.retler.map((r) => r.kod)).toEqual(['G-SAAT']);
  });

  it('KRİTİK: geri okumada saat planı küme olarak kıyaslanır; farklı ya da okunamayan plan FARK', () => {
    const d = derle({ aramaSaatleri: SAATLER });
    const temiz: GoogleOkunan = {
      kampanyaAdi: d.beklenen.kampanyaAdi,
      durum: 'PAUSED',
      kanal: 'SEARCH',
      gunlukButceMicros: d.beklenen.gunlukButceMicros,
      aglar: { googleSearch: true, searchNetwork: false, contentNetwork: false, partnerSearchNetwork: false },
      konumTuru: 'PRESENCE',
      konumSayisi: 1,
      anahtarKelimeSayisi: 1,
      negatifSayisi: TABAN_NEGATIFLER.length,
      aramaOgeleri: [{ countryCode: 'TR', phoneNumber: '2325551234' }],
      teklif: 'TARGET_SPEND',
      aramaSaatleri: [...d.beklenen.aramaSaatleri!].reverse(),
    };
    expect(googleGeriOkumaKarsilastir(d.beklenen, temiz).sonuc).toBe('temiz');
    expect(googleGeriOkumaKarsilastir(d.beklenen, { ...temiz, aramaSaatleri: [] }).satirlar.map((s) => s.alan)).toEqual(['aramaOgesi.saatler']);
    expect(googleGeriOkumaKarsilastir(d.beklenen, { ...temiz, aramaSaatleri: null }).sonuc).toBe('fark');
  });
});

describe('türetme: saat yalnız Arama + telefonda', () => {
  const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: '2026-10-12T09:00:00.000Z' });
  const rehber = (amac: 'TELEFON' | 'SITE'): RehberAlanlari =>
    ({
      amac: al(amac),
      platformlar: al({ meta: false, google: true }),
      googleHesabiId: al('00000000-0000-4000-8000-000000000002'),
      konumlar: al([{ tur: 'city' as const, key: '1', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }]),
      ekKategoriler: al([]),
      hedefAdres: al('https://ornek.com.tr/'),
      telefon: al('+902325551234'),
      metin: al({ anaMetin: 'M', basliklar: ['Bir', 'İki', 'Üç'], aciklamalar: ['Birinci açıklama.', 'İkinci açıklama.'] }),
      anahtarKelimeler: al([{ metin: 'kuşadası villa', aylikArama: 10 }]),
      butce: al({ tip: 'gunluk' as const, micros: '250000000' }),
      takvim: al({ baslangic: '2026-10-13', bitis: null }),
    }) as unknown as RehberAlanlari;
  const baglam = { musteriId: '123-456-7890', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', donusumEtkin: true, son30GunDonusum: 20, uzantilar: null, satisOlcumu: null, isletmeAdi: 'O', logoVarlikId: null, kategoriTabani: [], calismaSaatleri: SAATLER };
  it('KRİTİK: TELEFON girdisi saati taşır; SITE taşımaz (içerik özeti değişmez)', () => {
    const t = rehberdenGoogle(rehber('TELEFON'), { meta: false, google: true }, baglam);
    const s = rehberdenGoogle(rehber('SITE'), { meta: false, google: true }, baglam);
    if (t.tur !== 'tamam' || s.tur !== 'tamam') throw new Error('türetme');
    expect(t.deger.aramaSaatleri).toEqual(SAATLER);
    expect(s.deger).not.toHaveProperty('aramaSaatleri');
    // Teklif de telefon kuralından: 20 arama dönüşümü ≥ 15.
    expect(t.deger.teklif).toBe('MAKS_DONUSUM');
    const bos = rehberdenGoogle(rehber('TELEFON'), { meta: false, google: true }, { ...baglam, calismaSaatleri: null });
    if (bos.tur !== 'tamam') throw new Error('türetme');
    expect(bos.deger).not.toHaveProperty('aramaSaatleri');
  });
});
