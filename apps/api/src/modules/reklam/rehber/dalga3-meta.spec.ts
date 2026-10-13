import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  REHBER_ACILIS,
  adresAlani,
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  kararTablosu,
  ADVANTAGE_SATIS_YERLESIM_CUMLESI,
  SATISSIZ_PIKSEL_ONAY_METNI,
  metaSatisOlcumNotu,
  rehberAlanlariSchema,
  rehberEksikleri,
  rehberdenMeta,
  taslakAlanlariSchema,
  type DerlemeGirdisi,
  type RehberAlanlari,
  type RehberEksikBaglami,
  type SeciliPikselHali,
  kopyalanacakAlanlar,
} from '@advetics/shared';
import { MetaProvider, mapAdPixel, pikselSatinAlmaCoz } from '../../connections/providers/meta.provider';
import { hazirlikSatisOlcumu, seciliPikselHali, type PikselSatiri } from './platform-okuma';
import { platformaGiderken } from './rehber.service';

/*
 * DALGA 3 · META: video izlenme, erişim, satış (piksel) ve WhatsApp
 * numarası. Rehber tarafı (eksik listesi, türetme, karar tablosu), geri
 * okuma ve piksel okuyucusu. VIDEO/ERISIM/SATIS Meta satırları açılış
 * tablosunda bugün `kapali`; kapalı platform eksik listesine hiç girmediği
 * için tablo test süresince `deneme` (banner-seti.spec ile aynı desen).
 * Tablo GERÇEKTE değişmiyor (kullanıcı canlı turdan sonra çeviriyor).
 */
const Z = '2026-10-11T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: KIM, zaman: Z });
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const PIKSEL = '424242424242';

const IYI_PIKSEL: SeciliPikselHali = { ad: 'Mağaza', hesaptaVar: true, kullanilamaz: false, hicCalismadi: false, son7GundeCalisti: true, satinAlma7Gun: true };

function baglam(ek: Partial<RehberEksikBaglami['onKosullar'] & object> = {}): RehberEksikBaglami {
  return {
    ajansYoneticisi: true,
    onKosullar: {
      metaFormKosullari: true,
      metaWhatsapp: null,
      metaSatisOlcumu: true,
      googleSatisOlcumu: null,
      googleDonusumEtkin: null,
      googleLogoVeAd: true,
      seciliForm: null,
      seciliPiksel: IYI_PIKSEL,
      ...ek,
    },
    yasalUyari: null,
    asgariGunluk: { meta: 1n, googleTalepYaratma: null },
    paraBirimi: 'TRY',
    paraBirimleriAyni: true,
  };
}

function rehber(amac: 'VIDEO' | 'ERISIM' | 'SATIS' | 'WHATSAPP', ek: Partial<RehberAlanlari> = {}): RehberAlanlari {
  return {
    amac: al(amac),
    platformlar: al({ meta: true, google: false }, 'derleyici'),
    metaHesabiId: al(U(1), 'workspace_profili'),
    sayfaId: al(U(3), 'workspace_profili'),
    instagramId: al(U(4), 'workspace_profili'),
    konumlar: al([{ tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], 'marka_merkezi'),
    ekKategoriler: al([]),
    medya: al(amac === 'VIDEO' ? [{ varlikId: U(10), kapakVarlikId: U(11) }] : [{ varlikId: U(12) }]),
    metin: al({ anaMetin: 'Ana metin', basliklar: ['Başlık'], aciklamalar: [] }),
    butce: al({ tip: 'gunluk' as const, micros: '500000000' }),
    takvim: al({ baslangic: '2026-10-12', bitis: null }),
    ...ek,
  };
}

const ORAN = new Map([[U(12), 'kare' as const]]);
// Tek kare görselin diğer yerleşimleri kapatması (M-YERLESIM-KAPALI) banner-seti.spec'in konusu.
const eksikler = (a: RehberAlanlari, b = baglam()) => rehberEksikleri(a, { ...b, medyaOranlari: ORAN }).filter((e) => e.kod !== 'M-YERLESIM-KAPALI');
const kodlar = (a: RehberAlanlari, b = baglam()) => eksikler(a, b).map((e) => e.kod);

const AMACLAR = ['VIDEO', 'ERISIM', 'SATIS'] as const;
let eskiAcilis: string[] = [];
beforeEach(() => {
  eskiAcilis = AMACLAR.map((a) => REHBER_ACILIS[a].meta);
  for (const a of AMACLAR) REHBER_ACILIS[a].meta = 'deneme';
});
afterEach(() => {
  AMACLAR.forEach((a, i) => (REHBER_ACILIS[a].meta = eskiAcilis[i] as 'kapali'));
});

describe('adres alanı — TEK kural (panel ve eksik listesi)', () => {
  it('KRİTİK: Meta video/erişimde isteğe bağlı, site/satışta zorunlu, Google açıkken zorunlu', () => {
    const m = { meta: true, google: false };
    expect(adresAlani('VIDEO', m)).toBe('istege_bagli');
    expect(adresAlani('ERISIM', m)).toBe('istege_bagli');
    expect(adresAlani('SITE', m)).toBe('zorunlu');
    expect(adresAlani('SATIS', m)).toBe('zorunlu');
    expect(adresAlani('FORM', m)).toBeNull();
    expect(adresAlani('WHATSAPP', m)).toBeNull();
    expect(adresAlani('VIDEO', { meta: true, google: true })).toBe('zorunlu');
  });

  it('KRİTİK: panel adres listesini ELLE yazmıyor, shared kuralı okuyor', () => {
    const kaynak = readFileSync(join(__dirname, '../../../../../web/src/components/rehber/adim-reklam.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(kaynak).toContain('adresAlani(amac, b.acik)');
    expect(kaynak).not.toMatch(/\['SITE', 'SATIS', 'VIDEO', 'ERISIM'\]/);
  });

  it('video/erişimde adres boşsa eksik yok; yazılmışsa geçerli olmalı', () => {
    expect(kodlar(rehber('VIDEO'))).not.toContain('SITE-ADRES');
    expect(kodlar(rehber('ERISIM'))).not.toContain('SITE-ADRES');
    expect(kodlar(rehber('ERISIM', { hedefAdres: al('http://x.com') }))).toContain('SITE-ADRES');
    expect(kodlar(rehber('SATIS', { pikselId: al(PIKSEL) }))).toContain('SITE-ADRES');
  });
});

describe('VIDEO · Meta', () => {
  it('KRİTİK: yalnız video; görsel bırakılınca engel, sayısıyla', () => {
    expect(kodlar(rehber('VIDEO'))).toEqual([]);
    const e = eksikler(rehber('VIDEO', { medya: al([{ varlikId: U(10), kapakVarlikId: U(11) }, { varlikId: U(12) }]) }));
    const v = e.find((x) => x.kod === 'M-VIDEO-YALNIZ');
    expect(v).toMatchObject({ seviye: 'engel', adim: 4 });
    expect(v?.metin).toContain('1 görseli kaldır');
  });

  it('türetme: video fikri kapakla, niyet VIDEO_IZLENME', () => {
    const r = rehberdenMeta(rehber('VIDEO'), { meta: true, google: false }, 'TRY', Z, new Map(), 'aktif');
    if (r.tur !== 'tamam') throw new Error(r.kodlar.join());
    expect(r.deger.niyet?.deger).toBe('VIDEO_IZLENME');
    expect(r.deger.kavramlar?.deger).toEqual([{ varlikId: U(10), kapakVarlikId: U(11), baslik: 'Başlık', metin: 'Ana metin' }]);
  });
});

describe('ERISIM · Meta', () => {
  it('KRİTİK: karar tablosu sıklık sözünü veriyor (derleyicinin sınırıyla aynı)', () => {
    const t = kararTablosu('ERISIM', { meta: true, google: false }, 'MAKS_TIKLAMA', true);
    expect(t.find((x) => x.kod === 'SIKLIK')?.meta?.deger).toBe('Bir kişiye haftada en çok 2 kez');
    expect(kararTablosu('SITE', { meta: true, google: false }, 'MAKS_TIKLAMA', true).some((x) => x.kod === 'SIKLIK')).toBe(false);
    expect(kararTablosu('ERISIM', { meta: false, google: true }, 'MAKS_TIKLAMA', true).some((x) => x.kod === 'SIKLIK')).toBe(false);
  });
});

describe('SATIS · Meta piksel', () => {
  const satis = (ek: Partial<RehberAlanlari> = {}) => rehber('SATIS', { hedefAdres: al('https://magaza.com'), pikselId: al(PIKSEL), ...ek });

  it('KRİTİK: piksel seçilmeden engel; seçili ve sağlamsa eksik yok', () => {
    expect(eksikler(rehber('SATIS', { hedefAdres: al('https://magaza.com') })).find((x) => x.kod === 'M-PIKSEL-SEC')).toMatchObject({ seviye: 'engel', adim: 2 });
    expect(kodlar(satis())).toEqual([]);
  });

  it('KRİTİK: kesin bilgide engel — hesapta yok, kullanılamaz, hiç çalışmamış', () => {
    const e = (p: Partial<SeciliPikselHali>) => eksikler(satis(), baglam({ seciliPiksel: { ...IYI_PIKSEL, ...p } })).filter((x) => x.seviye === 'engel').map((x) => x.kod);
    expect(e({ hesaptaVar: false })).toEqual(['M-PIKSEL-HESAP']);
    expect(e({ kullanilamaz: true })).toEqual(['M-PIKSEL-KULLANILAMAZ']);
    expect(e({ hicCalismadi: true, son7GundeCalisti: false, satinAlma7Gun: false })).toEqual(['M-PIKSEL-CALISMADI']);
  });

  /*
   * YÖNETİCİ KARARI (2026-10-13): okunabilen SIFIR satın alma artık ENGEL ve
   * yalnız kullanıcının açık onayıyla kalkıyor; okunamayan hâl uyarı kalıyor.
   */
  it('KRİTİK: satın alma okunabilen SIFIR ise onaysız ENGEL; onayla uyarıya iner; okunamadıysa uyarı', () => {
    const u = (p: Partial<SeciliPikselHali>, ek: Partial<RehberAlanlari> = {}) => eksikler(satis(ek), baglam({ seciliPiksel: { ...IYI_PIKSEL, ...p } }));
    expect(u({ satinAlma7Gun: false }).map((x) => [x.kod, x.seviye, x.alan])).toEqual([['M-PIKSEL', 'engel', 'satissizPikselOnayi']]);
    expect(u({ satinAlma7Gun: false }, { satissizPikselOnayi: al({ pikselId: PIKSEL }) }).map((x) => [x.kod, x.seviye])).toEqual([['M-PIKSEL-ONAYLI', 'uyari']]);
    expect(u({ satinAlma7Gun: null }).map((x) => [x.kod, x.seviye])).toEqual([['M-PIKSEL-SATIS-BILINMIYOR', 'uyari']]);
    expect(u({ satinAlma7Gun: true })).toEqual([]);
    expect(u({ son7GundeCalisti: false }).map((x) => [x.kod, x.seviye])).toEqual([['M-PIKSEL-SESSIZ', 'uyari']]);
  });

  it('KRİTİK: onay PİKSELE bağlı — başka piksel için verilen onay geçmez; onayı yalnız kullanıcı verebilir', () => {
    const p = { seciliPiksel: { ...IYI_PIKSEL, satinAlma7Gun: false as const } };
    const baskaPiksel = eksikler(satis({ satissizPikselOnayi: al({ pikselId: '999' }) }), baglam(p));
    expect(baskaPiksel.find((x) => x.kod === 'M-PIKSEL')?.seviye).toBe('engel');
    const onerilen = eksikler(satis({ satissizPikselOnayi: al({ pikselId: PIKSEL }, 'derleyici') }), baglam(p));
    expect(onerilen.some((x) => x.kod === 'KAYNAK' && x.alan === 'satissizPikselOnayi' && x.seviye === 'engel')).toBe(true);
    expect(rehberAlanlariSchema.safeParse({ satissizPikselOnayi: al({ pikselId: 'abc' }) }).success).toBe(false);
    // Ajan 4: "aynı içerikle yeniden kur" onayı TAŞIMAZ (eski kişinin para sözü).
    const kopya = kopyalanacakAlanlar(satis({ satissizPikselOnayi: al({ pikselId: PIKSEL }) }));
    expect(kopya.satissizPikselOnayi).toBeUndefined();
    expect(kopya.pikselId?.deger).toBe(PIKSEL);
    expect(eksikler(kopya, baglam(p)).find((x) => x.kod === 'M-PIKSEL')?.seviye).toBe('engel');
    expect(SATISSIZ_PIKSEL_ONAY_METNI).toBe('Pikselim satış olayı göndermiyor; reklam satış yerine rastgele kişilere optimize olabilir. Yine de kur');
  });

  it('karar tablosu haftalık satın alma sayısını söyler; 1-49 öğrenme bilgisi; 0 ve okunamadı ayrı', () => {
    const not = (n: number | null | undefined) => kararTablosu('SATIS', { meta: true, google: false }, 'MAKS_TIKLAMA', true, null, n === undefined ? {} : { metaSatinAlma7Gun: n }).find((x) => x.kod === 'OLCUM')?.meta?.not;
    expect(not(undefined)).toBe('Reklam satın alma için optimize edilir');
    expect(not(0)).toMatch(/satın alma saymadı; reklam satış yerine rastgele kişilere/);
    expect(not(1)).toMatch(/Son 7 günde 1 satın alma; haftada 50'nin altında öğrenme aşaması bitmeyebilir/);
    expect(not(49)).toMatch(/öğrenme aşaması bitmeyebilir/);
    expect(not(50)).toBe('Reklam satın alma için optimize edilir · Son 7 günde 50 satın alma');
    expect(not(null)).toMatch(/okunamadı/);
    expect(metaSatisOlcumNotu(12.7)).toMatch(/Son 7 günde 12 satın alma/);
  });

  it('KRİTİK: bilinmeyen piksel düzenlemede uyarı, PLATFORMA GİDERKEN engel', () => {
    const e = eksikler(satis(), baglam({ seciliPiksel: null }));
    expect(e.map((x) => [x.kod, x.seviye])).toEqual([['M-PIKSEL-BILINMIYOR', 'uyari']]);
    expect(platformaGiderken(e).map((x) => x.seviye)).toEqual(['engel']);
  });

  it('türetme: piksel yalnız satış taslağına taşınır; şema kabul ediyor', () => {
    const r = rehberdenMeta(satis(), { meta: true, google: false }, 'TRY', Z, ORAN, 'aktif');
    if (r.tur !== 'tamam') throw new Error(r.kodlar.join());
    expect(r.deger.pikselId?.deger).toBe(PIKSEL);
    expect(taslakAlanlariSchema.safeParse(r.deger).success).toBe(true);
    const site = rehberdenMeta({ ...satis(), amac: al('SITE' as const) }, { meta: true, google: false }, 'TRY', Z, ORAN, 'aktif');
    if (site.tur !== 'tamam') throw new Error(site.kodlar.join());
    expect(site.deger).not.toHaveProperty('pikselId');
  });

  it('karar tablosu satışta hangi olayın sayıldığını söylüyor', () => {
    expect(kararTablosu('SATIS', { meta: true, google: false }, 'MAKS_TIKLAMA', true).find((x) => x.kod === 'OLCUM')?.meta?.deger).toBe(
      'Seçtiğin pikselin saydığı satın almalar',
    );
  });
});

describe('WHATSAPP numarası', () => {
  const wa = (ek: Partial<RehberAlanlari> = {}) => rehber('WHATSAPP', ek);

  it('KRİTİK: numara yoksa engel; sayfa okunamadıysa KENDİ cümlesiyle uyarı', () => {
    const e = eksikler(wa());
    expect(e.find((x) => x.kod === 'WHATSAPP-NUMARA')).toMatchObject({ seviye: 'engel', adim: 4 });
    const u = e.find((x) => x.kod === 'M-WHATSAPP-BILINMIYOR');
    expect(u?.seviye).toBe('uyari');
    expect(u?.metin).not.toMatch(/^Kontrol edilemedi:/);
  });

  it('KRİTİK: numara yazıldıysa sayfa okunamasa da uyarı GÖSTERİLMEZ', () => {
    expect(kodlar(wa({ whatsappNumarasi: al('+905559876543') }))).toEqual([]);
    expect(kodlar(wa({ whatsappNumarasi: al('05559876543') }))).toContain('WHATSAPP-NUMARA');
  });

  it('KRİTİK (F5): Marka Merkezi numarası ONAYLANMADAN yayına gitmez; onaylanınca yalnız WhatsApp taslağına taşınır', () => {
    const oneri = wa({ whatsappNumarasi: al('+905559876543', 'marka_merkezi') });
    expect(rehberAlanlariSchema.safeParse(oneri).success).toBe(true);
    expect(kodlar(oneri)).toEqual(['WHATSAPP-ONAY']);
    const a = wa({ whatsappNumarasi: al('+905559876543') });
    expect(kodlar(a)).toEqual([]);
    const r = rehberdenMeta(a, { meta: true, google: false }, 'TRY', Z, ORAN, 'aktif');
    if (r.tur !== 'tamam') throw new Error(r.kodlar.join());
    expect(r.deger.whatsappNumarasi?.deger).toBe('+905559876543');
    const site = rehberdenMeta({ ...a, amac: al('SITE' as const), hedefAdres: al('https://x.com') }, { meta: true, google: false }, 'TRY', Z, ORAN, 'aktif');
    if (site.tur !== 'tamam') throw new Error(site.kodlar.join());
    expect(site.deger).not.toHaveProperty('whatsappNumarasi');
  });

  it('form koşulunun bilinmeyen hâli de kendi cümlesiyle', () => {
    const f = rehberEksikleri(
      { ...wa(), amac: al('FORM' as const), formSablonuId: al('123') },
      { ...baglam({ metaFormKosullari: null, seciliForm: { ad: 'F', sayfadaYayinda: true, gizlilikAdresi: true } }) },
    ).find((x) => x.kod === 'M-FORM-KOSUL-BILINMIYOR');
    expect(f?.metin).toBe('Sayfanın potansiyel müşteri koşulları kontrol edilemedi');
  });
});

describe('geri okuma (yankı)', () => {
  const temel: DerlemeGirdisi = {
    apiSurumu: 'v25.0',
    yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
    tarih: '2026-10-07',
    workspaceKisaAdi: 'Örnek',
    niyet: 'WHATSAPP',
    hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
    sayfaPlatformId: '111',
    instagramPlatformId: null,
    hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
    kategoriler: { taban: [], ek: [] },
    butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
    takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
    atif: 'tik7',
    kavramlar: [{ gorselHash: 'h1', baslik: 'B', metin: 'M' }],
    hedefAdres: null,
    formId: null,
    telefon: null,
    whatsappNumarasi: '+905559876543',
    urlEtiketleri: null,
  };
  const yankilar = (g: Partial<DerlemeGirdisi>) => {
    const d = derleMeta({ ...temel, ...g });
    if (d.tur !== 'govde') throw new Error(JSON.stringify(d.retler));
    return beklenenYankilar(d.govdeler);
  };
  const setOku = (y: ReturnType<typeof yankilar>, promoted: unknown, ek: Record<string, unknown> = {}) => {
    const sadece = y.filter((x) => x.govde === 'reklam_seti');
    const nesne: Record<string, unknown> = {};
    for (const x of sadece) {
      const yol = x.alanYolu.split('.');
      let o = nesne;
      yol.slice(0, -1).forEach((k) => (o = (o[k] ??= {}) as Record<string, unknown>));
      o[yol[yol.length - 1]!] = x.gonderilen;
    }
    nesne.promoted_object = promoted;
    return geriOkumaKarsilastir(sadece, { reklam_seti: { ...nesne, ...ek } }, { yasalUyariVar: false });
  };

  it('KRİTİK N-17: numara + işaretsiz dönerse aynı numara; başka numara FARK', () => {
    const y = yankilar({});
    expect(setOku(y, { page_id: '111', whatsapp_phone_number: '905559876543' }).sonuc).toBe('temiz');
    const f = setOku(y, { page_id: '111', whatsapp_phone_number: '905551111111' });
    expect(f.sonuc).toBe('fark');
    if (f.sonuc === 'fark') expect(f.satirlar[0]).toMatchObject({ alanYolu: 'promoted_object', kabulEdilemez: true });
  });

  it('KRİTİK: sıklık sınırı kabul edilemez sınıfta; farklı dönerse yayın durur', () => {
    const y = yankilar({ niyet: 'ERISIM', whatsappNumarasi: null });
    const s = y.find((x) => x.alanYolu === 'frequency_control_specs');
    expect(s).toMatchObject({ kabulEdilemez: true, ekranEtiketi: 'Sıklık sınırı' });
    const f = setOku(y, { page_id: '111' }, { frequency_control_specs: [{ event: 'IMPRESSIONS', interval_days: 7, max_frequency: 5 }] });
    expect(f.sonuc).toBe('fark');
    expect(setOku(y, { page_id: '111' }).sonuc).toBe('temiz');
  });

  it('piksel farkı ekranda doğru adla', () => {
    const y = yankilar({ niyet: 'SATIS', pikselId: PIKSEL, hedefAdres: 'https://x.com', whatsappNumarasi: null });
    expect(y.find((x) => x.alanYolu === 'promoted_object')?.ekranEtiketi).toBe('Reklamın bağlandığı sayfa, piksel ya da WhatsApp hattı');
  });
});

describe('piksel okuması — saf çözümleyiciler', () => {
  const simdi = new Date('2026-10-11T12:00:00Z');
  const satir = (p: Partial<PikselSatiri>): PikselSatiri => ({ id: PIKSEL, ad: 'P', sonCalisma: '2026-10-10T09:00:00.000Z', kullanilamaz: false, satinAlma7Gun: true, ...p });

  it('mapAdPixel: Meta tarih biçimi ISO olur; is_unavailable yalnız true ise', () => {
    expect(mapAdPixel({ id: PIKSEL, name: ' Mağaza ', last_fired_time: '2026-10-10T09:12:44+0000' })).toEqual({
      id: PIKSEL, ad: 'Mağaza', sonCalisma: '2026-10-10T09:12:44.000Z', kullanilamaz: false, satinAlma7Gun: null, satinAlma7GunSayisi: null,
    });
    expect(mapAdPixel({ id: PIKSEL, is_unavailable: true })?.kullanilamaz).toBe(true);
    expect(mapAdPixel({ id: PIKSEL })?.sonCalisma).toBeNull();
    expect(mapAdPixel({ id: 'x1' })).toBeNull();
  });

  it('KRİTİK pikselSatinAlmaCoz: SAYI toplanır; yok = 0; biçim tanınmadı ya da sayı bozuk = null', () => {
    expect(pikselSatinAlmaCoz({ data: [{ start_time: 't', data: [{ value: 'Purchase', count: 3 }] }, { start_time: 't2', data: [{ value: 'purchase', count: '4' }] }] })).toEqual({ bulundu: true, sayi: 7, sonraki: null });
    expect(pikselSatinAlmaCoz({ data: [{ start_time: 't', data: [{ value: 'PageView', count: 90 }] }] })).toEqual({ bulundu: false, sayi: 0, sonraki: null });
    expect(pikselSatinAlmaCoz({ data: [{ data: [{ value: 'Purchase', count: 0 }] }], paging: { next: 'https://n' } })).toEqual({ bulundu: false, sayi: 0, sonraki: 'https://n' });
    expect(pikselSatinAlmaCoz({ error: {} })).toEqual({ bulundu: null, sayi: null, sonraki: null });
    expect(pikselSatinAlmaCoz({ data: [{ data: 'x' }] })).toEqual({ bulundu: null, sayi: null, sonraki: null });
    // SAVUNMALI: bozuk sayı "0" değil bilinmiyor (sıfır yayını onaya bağlıyor).
    expect(pikselSatinAlmaCoz({ data: [{ data: [{ value: 'Purchase', count: 'abc' }] }] }).sayi).toBeNull();
    expect(pikselSatinAlmaCoz({ data: [{ data: [{ value: 'Purchase', count: -1 }] }] }).sayi).toBeNull();
    expect(pikselSatinAlmaCoz({ data: [{ data: [{ value: 'Purchase' }] }] }).sayi).toBeNull();
    // Ajan 4: olay adı taşımayan satır "satın alma değil" DEĞİL, tanınmayan biçim.
    expect(pikselSatinAlmaCoz({ data: [{ data: [{ event: 'Purchase', count: 3 }] }] }).sayi).toBeNull();
  });

  it('KRİTİK seciliPikselHali: listede yok / hiç çalışmadı / son 7 gün', () => {
    expect(seciliPikselHali(null, [satir({})], simdi)).toBeNull();
    expect(seciliPikselHali(PIKSEL, null, simdi)).toBeNull();
    expect(seciliPikselHali('999', [satir({})], simdi)?.hesaptaVar).toBe(false);
    // F6: liste kesildiyse bulunamayan piksel BİLİNMİYOR, "hesapta yok" değil.
    expect(seciliPikselHali('999', [satir({})], simdi, true)).toBeNull();
    expect(seciliPikselHali(PIKSEL, [satir({ sonCalisma: null })], simdi)).toMatchObject({ hicCalismadi: true, son7GundeCalisti: false });
    expect(seciliPikselHali(PIKSEL, [satir({ sonCalisma: '2026-09-01T00:00:00.000Z' })], simdi)).toMatchObject({ hicCalismadi: false, son7GundeCalisti: false });
    expect(seciliPikselHali(PIKSEL, [satir({})], simdi)).toMatchObject({ hesaptaVar: true, son7GundeCalisti: true, satinAlma7Gun: true });
  });

  it('hazirlikSatisOlcumu: piksel yok false, tek piksel onun sinyali, çok piksel bilinmiyor', () => {
    expect(hazirlikSatisOlcumu(null)).toBeNull();
    expect(hazirlikSatisOlcumu([])).toBe(false);
    expect(hazirlikSatisOlcumu([satir({ kullanilamaz: true })])).toBe(false);
    expect(hazirlikSatisOlcumu([satir({ satinAlma7Gun: false })])).toBe(false);
    expect(hazirlikSatisOlcumu([satir({}), satir({ id: '2' })])).toBeNull();
  });
});

describe('MetaProvider.fetchAdPixels', () => {
  let orijinal: typeof fetch;
  beforeEach(() => {
    orijinal = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = orijinal;
  });
  const yanit = (govde: unknown, status = 200) =>
    ({ ok: status < 300, status, headers: new Headers(), json: async () => govde, text: async () => JSON.stringify(govde) }) as unknown as Response;
  const provider = () => new MetaProvider({ platforms: { meta: { appId: 'a', appSecret: 's', apiVersion: 'v25.0' } } } as never);

  it('KRİTİK: liste + piksel başına satın alma; hiç çalışmamış pikselde istatistik sorulmaz', async () => {
    const adresler: string[] = [];
    globalThis.fetch = vi.fn(async (u: string) => {
      adresler.push(u);
      if (u.includes('/adspixels')) {
        return yanit({ data: [{ id: '1', name: 'A', last_fired_time: '2026-10-10T09:00:00+0000' }, { id: '2', name: 'B' }] });
      }
      return yanit({ data: [{ start_time: 't', data: [{ value: 'Purchase', count: 2 }] }] });
    }) as unknown as typeof fetch;
    const r = await provider().fetchAdPixels({ adAccountPath: 'act_9', accessToken: 'T', simdi: new Date('2026-10-11T00:00:00Z') });
    expect(r.kesildi).toBe(false);
    expect(r.satirlar.map((p) => [p.id, p.satinAlma7Gun, p.satinAlma7GunSayisi])).toEqual([['1', true, 2], ['2', false, 0]]);
    expect(adresler[0]).toContain('/act_9/adspixels?fields=id%2Cname%2Clast_fired_time%2Cis_unavailable');
    expect(adresler.filter((u) => u.includes('/stats'))).toHaveLength(1);
    expect(adresler[1]).toContain('/1/stats?aggregation=event&event=Purchase&start_time=');
    // Token adreste değil başlıkta.
    expect(adresler.join(' ')).not.toContain('access_token');
  });

  it('KRİTİK: istatistik düşerse null (bilinmiyor), liste düşerse HATA', async () => {
    globalThis.fetch = vi.fn(async (u: string) =>
      u.includes('/adspixels') ? yanit({ data: [{ id: '1', name: 'A', last_fired_time: '2026-10-10T09:00:00+0000' }] }) : yanit({ error: { message: 'x', code: 100 } }, 400),
    ) as unknown as typeof fetch;
    const r = await provider().fetchAdPixels({ adAccountPath: 'act_9', accessToken: 'T' });
    expect(r.satirlar[0]?.satinAlma7Gun).toBeNull();

    globalThis.fetch = vi.fn(async () => yanit({ error: { message: 'izin yok', code: 200 } }, 403)) as unknown as typeof fetch;
    await expect(provider().fetchAdPixels({ adAccountPath: 'act_9', accessToken: 'T' })).rejects.toBeTruthy();
  });

  it('KRİTİK (Ajan 4): satın alma sayımı İSTATİSTİK sayfa sınırıyla gezer — 7 dolu sayfa okunur, sayı kaybolmaz', async () => {
    // 168 saatlik kova ~50/sayfa: yoğun sitede 5 sayfayı aşabilir. Liste
    // sınırıyla (5) gezilseydi sonuç null ("okunamadı") olurdu.
    let n = 0;
    globalThis.fetch = vi.fn(async (u: string) => {
      if (u.includes('/adspixels')) return yanit({ data: [{ id: '1', name: 'A', last_fired_time: '2026-10-10T09:00:00+0000' }] });
      n++;
      return yanit({ data: [{ start_time: 't', data: [{ value: 'Purchase', count: 1 }] }], ...(n < 7 ? { paging: { next: `https://graph.facebook.com/v25.0/1/stats?sayfa=${n}` } } : {}) });
    }) as unknown as typeof fetch;
    const r = await provider().fetchAdPixels({ adAccountPath: 'act_9', accessToken: 'T', simdi: new Date('2026-10-11T00:00:00Z') });
    expect(n).toBe(7);
    expect(r.satirlar[0]?.satinAlma7GunSayisi).toBe(7);
  });

  it('act_ öneksiz hesap reddedilir', async () => {
    await expect(provider().fetchAdPixels({ adAccountPath: '9', accessToken: 'T' })).rejects.toBeTruthy();
  });
});

describe('uç kaydı (kaynak taraması)', () => {
  const yorumsuz = (f: string) => readFileSync(join(__dirname, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

  it('KRİTİK: GET reklam/rehber/pikseller bulk.read ile servise bağlı', () => {
    const k = yorumsuz('rehber.controller.ts');
    const i = k.indexOf("@Get('rehber/pikseller')");
    expect(i).toBeGreaterThan(-1);
    const govde = k.slice(i, k.indexOf('}', k.indexOf('pikseller(', i)) + 1);
    expect(govde).toContain("@RequirePermissions('bulk.read')");
    expect(govde).toContain("@Query('adAccountId', ParseUUIDPipe)");
    expect(govde).toContain('this.rehber.pikseller(ctx, clientId, adAccountId)');
  });

  it('KRİTİK: prova/yayın öncesi tazeleme satışta pikseli okuyor; bağlam SEÇİLİ hesabın listesini kullanıyor', () => {
    const s = yorumsuz('rehber.service.ts');
    const t = s.slice(s.indexOf('private async sayfaTazele('), s.indexOf('private platformOkuyucu('));
    expect(t.length).toBeGreaterThan(100);
    expect(t).toContain("amac === 'SATIS'");
    expect(t).toContain('this.pikselOku(ctx, clientId, hesapId)');
    // Kesilmiş liste bayrağı da geçiyor (Ajan 4 F6): kesik listede bulunamamak "hesapta yok" değil.
    expect(s).toContain('const pk = this.pikselKaydi(clientId, meta?.id);');
    expect(s).toContain('seciliPikselHali(a.pikselId?.deger ?? null, pk?.satirlar ?? null, new Date(), pk?.kesildi ?? false)');
  });

  it('KRİTİK: yayın derlemesi hattı ve pikseli taslaktan geçiriyor', () => {
    const y = readFileSync(join(__dirname, '../yayin-baslat.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(y).toContain('whatsappNumarasi: alanlar.whatsappNumarasi?.deger ?? null');
    expect(y).toContain('pikselId: alanlar.pikselId?.deger ?? null');
  });
});
