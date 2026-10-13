import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ADRES_CEVRESI_KARISIK_MESAJI,
  ERISIM_HAFTALIK_GOSTERIM,
  ERISIM_SIKLIK_SINIRI,
  GOOGLE_ERISIM_TEKLIF_CUMLESI,
  GOOGLE_YARICAP_OLCULMEDI_CUMLESI,
  ISLETME_ADRESI_KONUM_ANAHTARI,
  META_ERISIM_OLCUM,
  META_ERISIM_TEKLIF,
  REHBER_ACILIS,
  REHBER_AMACLARI,
  beklenenYankilar,
  bolgeAdi,
  derleMeta,
  doygunlukDurumCumlesi,
  doygunlukTavani,
  doygunlukUyarisi,
  geriOkumaKarsilastir,
  isletmeAdresiKonumu,
  kararTablosu,
  koordinatCoz,
  rehberEksikleri,
  rehberdenGoogle,
  updateClientSchema,
  type DerlemeGirdisi,
  type ErisimDoygunlugu,
  type GorselOrani,
  type MetaGovdesi,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';
import { derleGoogle, type GoogleDerlemeBaglami } from '../google/derle-google';
import { googleGeriOkumaKarsilastir, type GoogleOkunan } from '../google/google-yayin';
import { demandGenKonumBody, yakinlikOlcutu } from '../../connections/providers/google-demandgen';
import { erisimTahminiCoz } from './platform-okuma';
import { erisimHedeflemesi } from './rehber.service';
import { adresKonumuKolonlari } from '../../tenancy/clients.service';

/*
 * ═══ ERİŞİM TURU (2026-10-13, Ajan 2+3) — "Bölgemde çok kişi görsün" ═══
 *
 * Denetim bulguları B5-B14 ve yönetici kararları K1-K7. Her blok bir sözü
 * gövdeyle eşliyor: ekran bir şey deyip gövde başkasını kurarsa bu depoda
 * en pahalı hata türü (kararlar.ts başlığı). Canlıda HİÇ koşmadı; ölçülmeyen
 * her şey DEVAM.md "ERİŞİM turu" bloğunda.
 */

const TL = (n: number) => BigInt(n) * 1_000_000n;
const IZMIR = { enlem: 38.4237, boylam: 27.1428 };
const ADRES_CEVRESI = isletmeAdresiKonumu(IZMIR, 10, 'Alsancak, İzmir');

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-13',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'ERISIM',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-14T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h1', baslik: 'B1', metin: 'M1' }],
  hedefAdres: null,
  formId: null,
  telefon: null,
  urlEtiketleri: null,
};
function govde(g: Partial<DerlemeGirdisi> = {}) {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return r;
}
const retKodlari = (g: Partial<DerlemeGirdisi>) => {
  const r = derleMeta({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
};
const bul = (gs: MetaGovdesi[], ad: string) => gs.find((x) => x.ad === ad)!.alanlar as Record<string, any>;

/** Meta'nın gönderdiğimizi AYNEN döndürdüğü okuma (ayna), sonra bozulur. */
function ayna(gs: MetaGovdesi[]): Record<string, Record<string, unknown>> {
  return Object.fromEntries(gs.map((g) => [g.ad, structuredClone(g.alanlar)]));
}
const SIMDI = new Date('2026-10-13T09:00:00+03:00');

describe('B14 — satın alma türü AÇIKÇA AUCTION (bütün amaçlar)', () => {
  it('KRİTİK: kampanya gövdesi buying_type AUCTION taşıyor; erişim ve site ikisinde de', () => {
    expect(bul(govde().govdeler, 'kampanya').buying_type).toBe('AUCTION');
    expect(bul(govde({ niyet: 'SITE', hedefAdres: 'https://ornek.com.tr' }).govdeler, 'kampanya').buying_type).toBe('AUCTION');
  });
  it('KRİTİK: geri okumada RESERVED dönerse KABUL EDİLEMEZ fark', () => {
    const r = govde();
    const okunan = ayna(r.govdeler);
    okunan.kampanya!.buying_type = 'RESERVED';
    const s = geriOkumaKarsilastir(beklenenYankilar(r.govdeler), okunan, { yasalUyariVar: false, simdi: SIMDI });
    expect(s.sonuc).toBe('fark');
    const satir = (s as { satirlar: Array<{ alanYolu: string; kabulEdilemez: boolean }> }).satirlar.find((x) => x.alanYolu === 'buying_type');
    expect(satir?.kabulEdilemez).toBe(true);
  });
});

describe('B8 — N-01 kaldırıldı: REACH yerine IMPRESSIONS dönmesi FARK', () => {
  it('KRİTİK: REACH gönderildi, IMPRESSIONS döndü → fark (normalleşme yok)', () => {
    const r = govde();
    const okunan = ayna(r.govdeler);
    expect(okunan.reklam_seti!.optimization_goal).toBe('REACH');
    okunan.reklam_seti!.optimization_goal = 'IMPRESSIONS';
    const s = geriOkumaKarsilastir(beklenenYankilar(r.govdeler), okunan, { yasalUyariVar: false, simdi: SIMDI });
    expect(s.sonuc).toBe('fark');
    expect(s.bilgiler.some((b) => b.alanYolu === 'optimization_goal')).toBe(false);
  });
  it('ayna okuma temiz (kontrol: farkı yaratan yalnız hedef)', () => {
    const r = govde();
    expect(geriOkumaKarsilastir(beklenenYankilar(r.govdeler), ayna(r.govdeler), { yasalUyariVar: false, simdi: SIMDI }).sonuc).toBe('temiz');
  });
});

describe('B11 — erişimde atıf seçilmemiş olsa da kurulur (1 gün tıklama)', () => {
  it('KRİTİK: ERISIM + atif null → gövde, attribution_spec 1 gün tıklama', () => {
    const r = govde({ atif: null });
    expect(bul(r.govdeler, 'reklam_seti').attribution_spec).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }]);
  });
  it('KRİTİK: diğer amaçlarda OK-16 politikası aynı (site + atif null → ret)', () => {
    expect(retKodlari({ niyet: 'SITE', hedefAdres: 'https://ornek.com.tr', atif: null })).toContain('OK-16');
  });
  it('yayın derlemesi de erişimde OK-16 istemiyor ve yayın satırına tik1 yazıyor (kaynak)', () => {
    const k = readFileSync(join(__dirname, '../yayin-baslat.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(k).toContain("if (!a?.atif && !erisim) retler.push({ kod: 'OK-16'");
    expect(k).toContain("atif: a?.atif ?? 'tik1',");
  });
});

describe('K4 — işletme adresinin çevresi (Meta)', () => {
  it('KRİTİK: yalnız custom_locations; enlem/boylam/yarıçap/km açıkça, ülke ya da il kovası YOK', () => {
    const r = govde({ hedefleme: { ...temel.hedefleme, konumlar: [ADRES_CEVRESI] } });
    expect(bul(r.govdeler, 'reklam_seti').targeting.geo_locations).toEqual({
      custom_locations: [{ latitude: 38.4237, longitude: 27.1428, radius: 10, distance_unit: 'kilometer' }],
    });
  });
  it('KRİTİK: adres çevresi + il birlikte → KNM-ADRES ret (birleşim = il geneli)', () => {
    expect(retKodlari({ hedefleme: { ...temel.hedefleme, konumlar: [ADRES_CEVRESI, ...temel.hedefleme.konumlar] } })).toContain('KNM-ADRES');
  });
  it('N-23: Meta etiket ekler ve sayıyı kayan noktadan yazarsa temiz; yarıçap ya da birim değişirse FARK', () => {
    const r = govde({ hedefleme: { ...temel.hedefleme, konumlar: [ADRES_CEVRESI] } });
    const yanki = beklenenYankilar(r.govdeler);
    const oku = (n: Record<string, unknown>) => {
      const o = ayna(r.govdeler);
      (o.reklam_seti!.targeting as Record<string, unknown>).geo_locations = { custom_locations: [n], location_types: ['home', 'recent'] };
      return geriOkumaKarsilastir(yanki, o, { yasalUyariVar: false, simdi: SIMDI }).sonuc;
    };
    const etiketli = { latitude: 38.42370000001, longitude: '27.1428', radius: 10, distance_unit: 'kilometer', name: '38.42, 27.14', country: 'TR', primary_city_id: 1, region_id: 2 };
    expect(oku(etiketli)).toBe('temiz');
    expect(oku({ ...etiketli, radius: 25 })).toBe('fark');
    expect(oku({ ...etiketli, distance_unit: 'mile' })).toBe('fark');
    expect(oku({ ...etiketli, latitude: 38.5 })).toBe('fark');
  });
});

describe('K4 — rehber eksikleri ve Google türetmesi', () => {
  const Z = '2026-10-13T09:00:00.000+03:00';
  const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: '11111111-1111-4111-8111-111111111111', zaman: Z });
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const rehber = (ek: Partial<RehberAlanlari> = {}): RehberAlanlari => ({
    amac: al('ERISIM' as const),
    platformlar: al({ meta: true, google: true }, 'derleyici'),
    metaHesabiId: al(U(1), 'workspace_profili'),
    googleHesabiId: al(U(2), 'workspace_profili'),
    sayfaId: al(U(3), 'workspace_profili'),
    instagramId: al(U(4), 'workspace_profili'),
    konumlar: al([ADRES_CEVRESI]),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr', 'marka_merkezi'),
    medya: al([{ varlikId: U(12) }]),
    metin: al({ anaMetin: 'Ana metin', basliklar: ['Başlık'], aciklamalar: ['Açıklama metni'] }),
    butce: al({ tip: 'gunluk' as const, micros: TL(500).toString() }),
    takvim: al({ baslangic: '2026-10-14', bitis: null }),
    ...ek,
  });
  const baglam = (doy?: ErisimDoygunlugu | null): RehberEksikBaglami => ({
    ajansYoneticisi: true,
    onKosullar: {
      metaFormKosullari: null,
      metaWhatsapp: null,
      metaSatisOlcumu: null,
      googleSatisOlcumu: null,
      googleDonusumEtkin: null,
      googleLogoVeAd: true,
      seciliForm: null,
      ...(doy !== undefined ? { erisimDoygunlugu: doy } : {}),
    },
    yasalUyari: null,
    asgariGunluk: { meta: 1n, googleTalepYaratma: 1n },
    paraBirimi: 'TRY',
    paraBirimleriAyni: true,
    medyaOranlari: new Map<string, GorselOrani | null>([[U(12), 'kare']]),
  });
  const kodlar = (a: RehberAlanlari, b = baglam()) => rehberEksikleri(a, b).map((e) => e.kod);

  let eski: typeof REHBER_ACILIS.ERISIM;
  beforeEach(() => {
    eski = { ...REHBER_ACILIS.ERISIM };
    REHBER_ACILIS.ERISIM.meta = 'deneme';
    REHBER_ACILIS.ERISIM.google = 'deneme';
  });
  afterEach(() => {
    REHBER_ACILIS.ERISIM.meta = eski.meta;
    REHBER_ACILIS.ERISIM.google = eski.google;
  });

  it('KRİTİK: adres çevresi Google eşlemesi İSTEMİYOR (G-KONUM yok), türetme yakınlık yazıyor ve konum listesi boş', () => {
    expect(kodlar(rehber())).not.toContain('G-KONUM');
    const t = rehberdenGoogle(rehber(), { meta: true, google: true }, {
      musteriId: '123-456-7890', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', donusumEtkin: false, son30GunDonusum: 0,
      uzantilar: null, satisOlcumu: null, medyaOranlari: new Map([[U(12), 'kare' as const]]), isletmeAdi: 'X', logoVarlikId: U(9), kategoriTabani: [],
    });
    if (t.tur !== 'tamam') throw new Error(t.kodlar.join(','));
    expect(t.deger.konumlar).toEqual([]);
    expect(t.deger.yakinlik).toEqual({ enlem: 38.4237, boylam: 27.1428, yaricapKm: 10 });
  });
  it('KRİTİK: giriş anında — karışık konum, aralık dışı yarıçap ve özel kategori ENGEL', () => {
    expect(kodlar(rehber({ konumlar: al([ADRES_CEVRESI, { tur: 'country' as const, key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/2792', ad: 'Türkiye' } }]) }))).toContain('KNM-ADRES');
    expect(kodlar(rehber({ konumlar: al([{ ...ADRES_CEVRESI, yaricapKm: 0.5 }]) }))).toContain('KNM-YARICAP');
    expect(kodlar(rehber({ ekKategoriler: al(['HOUSING' as const]) }))).toContain('OZK-04');
    expect(kodlar(rehber())).not.toEqual(expect.arrayContaining(['KNM-ADRES', 'KNM-YARICAP', 'OZK-04']));
  });
  it('Google Arama kurgusunda adres çevresi engel (yalnız Talep Yaratma yarıçap alıyor)', () => {
    expect(kodlar(rehber({ amac: al('SITE' as const) }))).toContain('G-YARICAP-KURGU');
  });

  describe('K5 — bütçe-kitle doygunluğu', () => {
    const hesaplandi = (tavanTl: number): ErisimDoygunlugu => ({
      tur: 'hesaplandi', kitleAlt: 40_000, kitleUst: 50_000, bgmMicros: TL(30).toString(), bgmKaynagi: 'erisim', tavanGunlukMicros: TL(tavanTl).toString(),
    });
    it('formül: günlük tavan = 2 × kitle / 7 × BGM / 1000 (üst sınır)', () => {
      // 2 × 70.000 / 7 = 20.000 gösterim/gün × 30 TL / 1000 = 600 TL
      expect(doygunlukTavani(70_000, TL(30))).toBe(TL(600));
      expect(ERISIM_HAFTALIK_GOSTERIM).toBe(ERISIM_SIKLIK_SINIRI[0].max_frequency);
      expect(ERISIM_SIKLIK_SINIRI[0].interval_days).toBe(7);
    });
    it('KRİTİK: Meta payı tavanın üstündeyse UYARI (engel değil); altındaysa yok', () => {
      // 500 TL bütçe, iki platform %50 → Meta'ya 250 TL/gün.
      const ust = rehberEksikleri(rehber(), baglam(hesaplandi(100))).find((e) => e.kod === 'M-ERISIM-DOYGUN');
      expect(ust?.seviye).toBe('uyari');
      expect(ust?.metin).toContain('tam harcanamayabilir');
      expect(kodlar(rehber(), baglam(hesaplandi(300)))).not.toContain('M-ERISIM-DOYGUN');
    });
    it('KRİTİK: okunamadı ve hesaplanamadı uyarı ÜRETMEZ ve "0" yazmaz; karar hücresi sebebini söyler', () => {
      for (const d of [{ tur: 'okunamadi', sebep: 'Meta 500' } as const, { tur: 'hesaplanamadi', sebep: 'gösterim yok', kitleAlt: 1000, kitleUst: 2000 } as const]) {
        expect(kodlar(rehber(), baglam(d))).not.toContain('M-ERISIM-DOYGUN');
        const c = doygunlukDurumCumlesi(d, 'TRY');
        expect(c).not.toMatch(/\b0 kişi\b/);
      }
      expect(doygunlukDurumCumlesi({ tur: 'okunamadi', sebep: 'Meta 500' }, 'TRY')).toContain('okunamadı: Meta 500');
      expect(doygunlukDurumCumlesi(null, 'TRY')).toContain('henüz okunmadı');
    });
    it('doygunlukUyarisi eşiği: eşit = uyarı yok, bir kuruş üstü = uyarı', () => {
      const d = hesaplandi(100) as Extract<ErisimDoygunlugu, { tur: 'hesaplandi' }>;
      expect(doygunlukUyarisi(d, TL(100), 'TRY')).toBeNull();
      expect(doygunlukUyarisi(d, TL(100) + 10_000n, 'TRY')).not.toBeNull();
    });
  });
});

describe('B5/B9 — Kontrol sözleri', () => {
  const tablo = (ek: Parameters<typeof kararTablosu>[5] = {}) =>
    Object.fromEntries(kararTablosu('ERISIM', { meta: true, google: true }, 'MAKS_TIKLAMA', true, null, ek).map((s) => [s.kod, s]));
  it('KRİTİK: Google TEKLİF "erişime göre teklif vermiyor"; Meta TEKLİF en çok tekil kişi; ÖLÇÜM erişilen tekil kişi', () => {
    const t = tablo();
    expect(t.TEKLIF!.google).toEqual({ deger: 'En çok tıklama', not: GOOGLE_ERISIM_TEKLIF_CUMLESI });
    expect(t.TEKLIF!.meta!.deger).toBe(META_ERISIM_TEKLIF);
    expect(t.OLCUM!.meta!.deger).toBe(META_ERISIM_OLCUM);
    expect(REHBER_AMACLARI.ERISIM.google.kurgu !== null && REHBER_AMACLARI.ERISIM.google.kurulacak).toContain('tıklamaya göre');
  });
  it('KRİTİK: DÜĞME satırı — site yoksa Facebook sayfası, varsa site (derleyiciyle aynı adres)', () => {
    expect(tablo().DUGME!.meta!.not).toContain('Facebook sayfana');
    expect(tablo({ siteAdresi: 'https://ornek.com.tr' }).DUGME!.meta!.not).toContain('sitene');
    const g = govde();
    expect(bul(g.govdeler, 'kreatif:1').object_story_spec.link_data.link).toBe('https://facebook.com/111');
    expect(bul(g.govdeler, 'kreatif:1').object_story_spec.link_data.call_to_action.type).toBe('LEARN_MORE');
  });
  it('KONUM hücresi adres çevresini ve Google ölçülmedi notunu söylüyor', () => {
    const t = tablo({ konumlar: [ADRES_CEVRESI] });
    expect(t.KONUM!.meta!.deger).toBe('İşletme adresinin 10 km çevresi');
    expect(t.KONUM!.google!.not).toBe(GOOGLE_YARICAP_OLCULMEDI_CUMLESI);
  });
  it('DOYGUNLUK satırı yalnız erişimde; dört hâl ayrı değer', () => {
    expect(tablo().DOYGUNLUK!.meta!.deger).toBe('Henüz okunmadı');
    expect(tablo({ erisimDoygunlugu: { tur: 'okunamadi', sebep: 'x' } }).DOYGUNLUK!.meta!.deger).toBe('Okunamadı');
    expect(kararTablosu('SITE', { meta: true, google: false }, 'MAKS_TIKLAMA', true).some((s) => s.kod === 'DOYGUNLUK')).toBe(false);
  });
});

describe('K4 — Google yakınlık ölçütü (Talep Yaratma)', () => {
  it('KRİTİK: mikro-derece TAMSAYI ve KILOMETERS açıkça', () => {
    expect(yakinlikOlcutu({ enlem: 38.4237, boylam: 27.1428, yaricapKm: 10 })).toEqual({
      geoPoint: { latitudeInMicroDegrees: 38423700, longitudeInMicroDegrees: 27142800 },
      radius: 10,
      radiusUnits: 'KILOMETERS',
    });
    const ops = demandGenKonumBody({ adGroupResource: 'customers/1/adGroups/-3', konumlar: [], yakinlik: { enlem: 38.4237, boylam: 27.1428, yaricapKm: 10 } }).operations;
    expect(ops).toHaveLength(1);
    expect((ops[0] as { create: Record<string, unknown> }).create.location).toBeUndefined();
    expect(() => demandGenKonumBody({ adGroupResource: 'x', konumlar: [] })).toThrow(/bütün ülkelere/);
  });
});

describe('B12 — Google geri okuma konumu ve yaşı KİMLİKLE kıyaslıyor', () => {
  const MUSTERI = '1234567890';
  const B: GoogleDerlemeBaglami = {
    kimlik: 'abcdef12-0000-4000-8000-000000000000',
    workspaceKisaAdi: 'WS',
    amacEkranAdi: 'Bölgemde çok kişi görsün',
    simdi: new Date('2026-10-13T09:00:00+03:00'),
    validateOnly: false,
    logo: { resource: `customers/${MUSTERI}/assets/77` },
    youtubeVideoBasligi: null,
    gorselKaynaklari: new Map([['00000000-0000-4000-8000-000000000012', { kaynak: { resource: `customers/${MUSTERI}/assets/111` }, olcu: { genislik: 1200, yukseklik: 1200, bayt: 1 } }]]),
  };
  const girdi = {
    kurgu: 'TALEP_YARATMA_GORSEL' as const, ulasma: null, teklif: 'MAKS_TIKLAMA' as const, musteriId: MUSTERI, paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul',
    konumlar: ['geoTargetConstants/1012782'], dil: 'languageConstants/1037' as const, enDusukYas: 25, butce: { tip: 'gunluk' as const, micros: TL(500) },
    takvim: { baslangic: '2026-10-14', bitis: null }, hedefAdres: 'https://ornek.com.tr', telefon: null, basliklar: ['B1'], aciklamalar: ['A1'],
    anahtarKelimeler: [], negatifler: [], gorselVarlikIdleri: [], gorseller: [{ varlikId: '00000000-0000-4000-8000-000000000012', oran: 'kare' as const }],
    youtubeVideoId: null, isletmeAdi: 'X', logoVarlikId: 'L', kategoriler: [],
  };
  const d = derleGoogle(girdi, B);
  if (d.tur !== 'govde') throw new Error(JSON.stringify(d.retler));
  const temiz: GoogleOkunan = {
    kampanyaAdi: d.beklenen.kampanyaAdi, durum: 'PAUSED', kanal: 'DEMAND_GEN', gunlukButceMicros: d.beklenen.gunlukButceMicros, aglar: null,
    konumTuru: 'PRESENCE', konumSayisi: 1, anahtarKelimeSayisi: 0, negatifSayisi: 0, aramaOgeleri: [], teklif: 'TARGET_SPEND',
    gorselReklam: d.beklenen.gorselReklam!,
    konumKimlikleri: ['geoTargetConstants/1012782'], yakinlik: null, yasKitlesi: d.beklenen.yasKitlesi!,
  };
  const alanlar = (o: Partial<GoogleOkunan>) => googleGeriOkumaKarsilastir(d.beklenen, { ...temiz, ...o }).satirlar.map((s) => s.alan);

  it('beklenen yaş kitlesi 25+ ve yakınlık yok; temiz okuma temiz', () => {
    expect(d.beklenen.yasKitlesi).toEqual({ segmentler: [{ minAge: 25 }], belirsizDahil: false });
    expect(d.beklenen.yakinlik).toBeNull();
    expect(googleGeriOkumaKarsilastir(d.beklenen, temiz).sonuc).toBe('temiz');
  });
  it('KRİTİK: aynı SAYIDA ama BAŞKA konum → fark (konum.kimlikler); okunamadı da fark', () => {
    expect(alanlar({ konumKimlikleri: ['geoTargetConstants/1012783'] })).toEqual(['konum.kimlikler']);
    expect(alanlar({ konumKimlikleri: null })).toEqual(['konum.kimlikler']);
  });
  it('KRİTİK: yaş kitlesi farklı, yok ya da okunamadı → fark (yas.kitle)', () => {
    expect(alanlar({ yasKitlesi: { segmentler: [{ minAge: 18 }], belirsizDahil: false } })).toEqual(['yas.kitle']);
    expect(alanlar({ yasKitlesi: null })).toEqual(['yas.kitle']);
    expect(alanlar({ yasKitlesi: 'okunamadi' })).toEqual(['yas.kitle']);
    expect(alanlar({ yasKitlesi: { segmentler: [{ minAge: 25 }], belirsizDahil: true as false } })).toEqual(['yas.kitle']);
  });
  it('KRİTİK: söz verilmemiş bir daire (yakınlık) dönerse fark', () => {
    expect(alanlar({ yakinlik: { enlemMikro: 1, boylamMikro: 1, yaricap: 5, birim: 'KILOMETERS' } })).toEqual(['konum.adresCevresi']);
  });
  it('KRİTİK: adres çevresi beklenirken yarıçap ya da birim farklı dönerse fark', () => {
    const y = derleGoogle({ ...girdi, konumlar: [], yakinlik: { enlem: 38.4237, boylam: 27.1428, yaricapKm: 10 } }, B);
    if (y.tur !== 'govde') throw new Error(JSON.stringify(y.retler));
    const tam = { ...temiz, kampanyaAdi: y.beklenen.kampanyaAdi, konumSayisi: 0, konumKimlikleri: [], yakinlik: y.beklenen.yakinlik! };
    expect(googleGeriOkumaKarsilastir(y.beklenen, tam).sonuc).toBe('temiz');
    const f = (o: Partial<GoogleOkunan>) => googleGeriOkumaKarsilastir(y.beklenen, { ...tam, ...o }).satirlar.map((s) => s.alan);
    expect(f({ yakinlik: { ...y.beklenen.yakinlik!, yaricap: 20 } })).toEqual(['konum.adresCevresi']);
    expect(f({ yakinlik: { ...y.beklenen.yakinlik!, birim: 'MILES' as 'KILOMETERS' } })).toEqual(['konum.adresCevresi']);
    expect(f({ yakinlik: 'okunamadi' })).toEqual(['konum.adresCevresi']);
  });
  it('KRİTİK: Arama kurgusunda yakınlık → ret (konum kampanyada; daire yazılmadı)', () => {
    const r = derleGoogle({ ...girdi, kurgu: 'ARAMA', ulasma: 'site', konumlar: [], yakinlik: { enlem: 38.4, boylam: 27.1, yaricapKm: 10 } }, B);
    expect(r.tur === 'ret' ? r.retler.map((x) => x.kod) : []).toContain('G-YARICAP-KURGU');
  });
});

describe('K5 — kitle tahmini okuyucusu ve hedeflemesi', () => {
  it('KRİTİK: sınırlar okunur; estimate_ready false ya da sayı yoksa FIRLATIR ("0 kişi" uydurulmaz)', () => {
    expect(erisimTahminiCoz({ data: { users_lower_bound: 41000, users_upper_bound: 48200, estimate_ready: true } })).toEqual({ alt: 41000, ust: 48200 });
    expect(erisimTahminiCoz({ data: [{ users_lower_bound: '10', users_upper_bound: '20' }] })).toEqual({ alt: 10, ust: 20 });
    expect(() => erisimTahminiCoz({ data: { users_lower_bound: 1, users_upper_bound: 2, estimate_ready: false } })).toThrow(/hazır değil/);
    expect(() => erisimTahminiCoz({ data: {} })).toThrow(/okunamadı/);
    expect(() => erisimTahminiCoz(null)).toThrow();
  });
  it('tahminin hedeflemesi derleyicinin üreticisinden (adres çevresi aynı daire)', () => {
    const a = { amac: { deger: 'ERISIM' as const, kaynak: 'kullanici' as const, kim: null, zaman: '2026-10-13T09:00:00.000+03:00' }, konumlar: { deger: [ADRES_CEVRESI], kaynak: 'kullanici' as const, kim: null, zaman: '2026-10-13T09:00:00.000+03:00' } };
    expect(erisimHedeflemesi(a)!.geo_locations).toEqual(bul(govde({ hedefleme: { ...temel.hedefleme, konumlar: [ADRES_CEVRESI] } }).govdeler, 'reklam_seti').targeting.geo_locations);
    expect(erisimHedeflemesi({ ...a, amac: { ...a.amac, deger: 'SITE' as never } })).toBeNull();
  });
  it('kaynak: okuma kota bekçisinden geçiyor ve platform çağrısı transaction DIŞINDA', () => {
    const k = readFileSync(join(__dirname, 'rehber.service.ts'), 'utf8');
    const bas = k.indexOf('private async erisimDoygunlukTazele(');
    expect(bas, 'erisimDoygunlukTazele bulunamadı').toBeGreaterThan(-1);
    const govdesi = k.slice(bas, k.indexOf('\n  }\n', bas));
    const kota = govdesi.indexOf("this.kota.acquire({ platform: 'meta'");
    const cagri = govdesi.indexOf('metaErisimTahminiOku(');
    expect(kota).toBeGreaterThan(-1);
    expect(cagri).toBeGreaterThan(kota);
    expect(govdesi.slice(cagri - 200, cagri)).not.toContain('this.tx(ctx)((t) =>');
  });
});

describe('B13 — metin önerisi bölgeyi biliyor', () => {
  it('bölge adı: adres çevresi km ile, il/ilçe adlarıyla', () => {
    expect(bolgeAdi([ADRES_CEVRESI])).toBe('işletme adresinin 10 km çevresi');
    expect(bolgeAdi([{ tur: 'region', key: '1', etiket: 'İzmir', yaricapKm: undefined }, { tur: 'city', key: '2', etiket: 'Manisa', yaricapKm: 20 }])).toBe('İzmir, Manisa (+20 km)');
    expect(bolgeAdi([])).toBeNull();
  });
  it('KRİTİK (kaynak): istem ve önbellek anahtarı AYNI bölgeyi taşıyor, yalnız erişimde', () => {
    const k = readFileSync(join(__dirname, 'rehber.service.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(k).toContain("const bolge = amacKodu === 'ERISIM' ? bolgeAdi(a.konumlar?.deger ?? []) : null;");
    expect(k).toContain('bolge ? `Reklamın gösterileceği bölge: ${bolge}.');
    expect(k).toContain('update(`${gorselOzeti}|${bolge}`)');
  });
});

describe('Marka Merkezi harita konumu', () => {
  it('koordinat ayrıştırıcı: Google Haritalar biçimi kabul; virgüllü ondalık, aralık dışı ve 0,0 ret; boş = temizle', () => {
    expect(koordinatCoz('38.4237, 27.1428')).toEqual(IZMIR);
    expect(koordinatCoz(' 38.4237 27.1428 ')).toEqual(IZMIR);
    expect(koordinatCoz('38,4237, 27,1428')).toBe('gecersiz');
    expect(koordinatCoz('95, 27')).toBe('gecersiz');
    expect(koordinatCoz('0, 0')).toBe('gecersiz');
    expect(koordinatCoz('')).toBeNull();
  });
  it('KRİTİK: şema bozuk konumu GİRİŞTE reddediyor; servis iki kolonu BİRLİKTE yazıyor', () => {
    expect(updateClientSchema.safeParse({ addressCoordinates: '38,4 27,1' }).success).toBe(false);
    const p = updateClientSchema.parse({ addressCoordinates: '38.4237,27.1428' });
    expect(p.addressCoordinates).toBe('38.4237, 27.1428');
    expect(adresKonumuKolonlari(p.addressCoordinates!)).toEqual({ addressLatitude: 38.4237, addressLongitude: 27.1428 });
    expect(adresKonumuKolonlari(null)).toEqual({ addressLatitude: null, addressLongitude: null });
    expect(updateClientSchema.parse({}).addressCoordinates).toBeUndefined();
  });
  it('adres çevresi konumu sabit anahtarla ve ülkesiz (koordinattan ülke tahmini yok)', () => {
    expect(ADRES_CEVRESI.key).toBe(ISLETME_ADRESI_KONUM_ANAHTARI);
    expect(ADRES_CEVRESI.ulkeKodu).toBeNull();
    expect(ADRES_CEVRESI_KARISIK_MESAJI).toContain('birlikte seçilemez');
  });
});
