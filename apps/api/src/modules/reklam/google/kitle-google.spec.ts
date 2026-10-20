import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { kararTablosu, rehberEksikleri, rehberdenGoogle, type GorselOrani, type RehberAlanlari, type RehberAmacKodu, type RehberGoogleKitlesi } from '@advetics/shared';
import { derleGoogle, googleAralikKovalari, type GoogleBeklenen, type GoogleDerlemeBaglami } from './derle-google';
import { degisiklikleriUygula } from '../rehber/rehber-kayit';
import { googleGeriOkumaKarsilastir, kitleBoyutSayilari, type GoogleOkunan } from './google-yayin';
import { ozelSegmentAdi, ozelSegmentGovdesi, ozelSegmentHazirla, ozelSegmentSorgusu, type OzelSegmentPortu } from './ozel-segment';
import type { GoogleGorselKaynagi } from '../../connections/providers/google-demandgen';

/**
 * ═══ HEDEF KİTLELER 2. PARÇA — Google'a giden kayıtlı kitle ═══
 *
 * Sorular (MIMARI Ç4, § 3): (1) Talep Yaratma reklam grubunun TEK kitlesine
 * cinsiyet + ilgi + özel segment boyutu ekleniyor mu, (2) Maks. Performans
 * kitle SİNYALİ kuruluyor mu, (3) Arama'ya kitle YAZILMIYOR mu, (4) özel
 * segment yeniden kullanılıyor ve provada hesaba yazılmıyor mu, (5) geri
 * okuma boyut sayılarını kıyaslıyor mu. Canlıda HİÇ koşmadı (MIMARI § 5).
 */

const Z = '2026-10-10T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: KIM, zaman: Z });
const MUSTERI = '1234567890';
const YATAY = U(11);
const KARE = U(12);
const ORANLAR = new Map<string, GorselOrani | null>([
  [YATAY, 'yatay'],
  [KARE, 'kare'],
]);

const KITLE: RehberGoogleKitlesi = {
  kitleId: U(50),
  ad: 'Konut arayanlar · Ege',
  cinsiyet: 'kadin',
  ilgiler: [
    { id: '80463', ad: 'Residential Properties (For Sale)', tur: 'in_market' },
    { id: '80101', ad: 'Real Estate', tur: 'affinity' },
  ],
  // Büyük harf ve tekrar: girdi tekil, küçük harfli ve sıralı olmalı.
  kelimeler: ['İzmir satılık daire', 'bornova konut', 'bornova konut'],
};

function rehber(amac: RehberAmacKodu, kitle: RehberGoogleKitlesi | null = KITLE): RehberAlanlari {
  return {
    amac: al(amac),
    platformlar: al({ meta: false, google: true }),
    googleHesabiId: al(U(2)),
    konumlar: al([{ tur: 'city' as const, key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }]),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr/urun'),
    medya: al([{ varlikId: YATAY }, { varlikId: KARE }]),
    youtubeVideo: al({ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım' }),
    metin: al({
      anaMetin: 'Kuşadası’nda denize yürüme mesafesinde bahçeli villalar.',
      basliklar: ['Özel Havuzlu Villalar', 'Kuşadası Garden Villas', 'Denize 5 Dakika Yürüme'],
      aciklamalar: ['3+1 bahçeli villalar, site içinde havuz.', 'Taksit seçenekleriyle teslime hazır villalar, hemen bilgi alın.'],
    }),
    anahtarKelimeler: al([{ metin: 'kuşadası villa', aylikArama: 100 }]),
    butce: al({ tip: 'gunluk' as const, micros: (500n * 1_000_000n).toString() }),
    takvim: al({ baslangic: '2026-10-11', bitis: null }),
    ...(kitle ? { googleKitlesi: al(kitle) } : {}),
  };
}

function girdi(amac: RehberAmacKodu, kitle: RehberGoogleKitlesi | null = KITLE, ek: Partial<RehberAlanlari> = {}) {
  const r = rehberdenGoogle({ ...rehber(amac, kitle), ...ek }, { meta: false, google: true }, {
    musteriId: '123-456-7890',
    paraBirimi: 'TRY',
    saatDilimi: 'Europe/Istanbul',
    donusumEtkin: true,
    son30GunDonusum: 50,
    uzantilar: null,
    satisOlcumu: true,
    donusumHedefleri: [{ kategori: 'PURCHASE', kaynak: 'WEBSITE' }],
    medyaOranlari: ORANLAR,
    isletmeAdi: 'Garden Villas',
    logoVarlikId: U(9),
    kategoriTabani: [],
  });
  if (r.tur !== 'tamam') throw new Error(`türetme reddetti: ${r.kodlar.join(',')}`);
  return r.deger;
}

const olcu = (genislik: number, yukseklik: number) => ({ genislik, yukseklik, bayt: 300_000 });
const KAYNAKLAR = new Map<string, { kaynak: GoogleGorselKaynagi; olcu: ReturnType<typeof olcu> }>([
  [YATAY, { kaynak: { resource: `customers/${MUSTERI}/assets/111` }, olcu: olcu(1200, 628) }],
  [KARE, { kaynak: { resource: `customers/${MUSTERI}/assets/112` }, olcu: olcu(1200, 1200) }],
]);
const SEGMENT = `customers/${MUSTERI}/customAudiences/555`;
const B: GoogleDerlemeBaglami = {
  kimlik: 'abcdef12-0000-4000-8000-000000000000',
  workspaceKisaAdi: 'Ege Birlik',
  amacEkranAdi: 'Bölgemde çok kişi görsün',
  simdi: new Date('2026-10-10T09:00:00+03:00'),
  validateOnly: true,
  logo: { resource: `customers/${MUSTERI}/assets/77` },
  logoOlcusu: { genislik: 512, yukseklik: 512 },
  youtubeVideoBasligi: 'Tanıtım',
  gorselKaynaklari: KAYNAKLAR,
  ozelSegment: { kaynak: SEGMENT },
};

type Op = Record<string, { create?: Record<string, unknown> } | undefined>;
const islemler = (ops: Array<Record<string, unknown>>, tur: string) => (ops as Op[]).map((o) => o[tur]?.create).filter((c): c is Record<string, unknown> => !!c);

function derle(amac: RehberAmacKodu, b: Partial<GoogleDerlemeBaglami> = {}, kitle: RehberGoogleKitlesi | null = KITLE) {
  const d = derleGoogle(girdi(amac, kitle), { ...B, ...b });
  if (d.tur !== 'govde') throw new Error(`derleme reddetti: ${JSON.stringify(d.retler)}`);
  return d;
}

describe('türetme: kitle hangi kurguda girdiye yazılır', () => {
  it('Talep Yaratma: kitle girdide, kelimeler tekil + küçük harf + sıralı, ilgiler kimlikle', () => {
    expect(girdi('ERISIM').kitle).toEqual({
      kitleId: U(50),
      ad: 'Konut arayanlar · Ege',
      cinsiyet: 'kadin',
      ilgiler: ['80101', '80463'],
      kelimeler: ['bornova konut', 'izmir satılık daire'],
    });
  });

  it("ARAMA'da kitle YAZILMAZ (Ç4) ve kitle kelimeleri anahtar kelimelere KARIŞMAZ", () => {
    const g = girdi('SITE');
    expect(g.kurgu).toBe('ARAMA');
    expect('kitle' in g).toBe(false);
    expect(g.anahtarKelimeler).toEqual(['kuşadası villa']);
  });

  it('kitle seçilmediyse anahtar hiç yok (kayıtlı girdilerin içerik özeti değişmez)', () => {
    expect('kitle' in girdi('ERISIM', null)).toBe(false);
  });
});

describe('TALEP YARATMA: reklam grubunun tek kitlesine boyutlar', () => {
  const d = derle('ERISIM');
  const kitleler = islemler(d.govde.mutateOperations, 'audienceOperation');
  const baglar = islemler(d.govde.mutateOperations, 'adGroupCriterionOperation').filter((c) => 'audience' in c);

  it('TEK kitle, TEK bağ (Demand Gen grubu tek kitle alıyor) ve grup kitle gruplamalı', () => {
    expect(kitleler).toHaveLength(1);
    expect(baglar).toHaveLength(1);
    const grup = islemler(d.govde.mutateOperations, 'adGroupOperation')[0]!;
    expect(grup.audienceSetting).toEqual({ useAudienceGrouped: true });
  });

  it('cinsiyet + ilgi (userInterest kaynağı) + özel segment; bilinmeyen cinsiyet dahil DEĞİL', () => {
    expect(kitleler[0]!.dimensions).toEqual([
      { gender: { genders: ['FEMALE'], includeUndetermined: false } },
      {
        audienceSegments: {
          segments: [
            { userInterest: { userInterestCategory: `customers/${MUSTERI}/userInterests/80101` } },
            { userInterest: { userInterestCategory: `customers/${MUSTERI}/userInterests/80463` } },
            { customAudience: { customAudience: SEGMENT } },
          ],
        },
      },
    ]);
    expect(String(kitleler[0]!.name)).toContain('— kitle ');
  });

  it('beklenen boyut sayıları geri okumaya yazıldı', () => {
    expect(d.beklenen.kitleBoyutlari).toEqual({ ilgiSayisi: 2, ozelSegmentSayisi: 1, cinsiyetler: ['FEMALE'], digerSegmentSayisi: 0 });
  });

  it('kitlesiz derlemede kitle işlemi ve beklenti YOK (eski gövde)', () => {
    const k = derle('ERISIM', {}, null);
    expect(islemler(k.govde.mutateOperations, 'audienceOperation')).toHaveLength(0);
    expect('kitleBoyutlari' in k.beklenen).toBe(false);
  });

  it('kelimeler var ama segment kaynağı yok: RET (yarım kitle sessizce kurulmaz)', () => {
    const r = derleGoogle(girdi('ERISIM'), { ...B, ozelSegment: null });
    expect(r.tur).toBe('ret');
    if (r.tur === 'ret') expect(r.retler.map((x) => x.kod)).toContain('G-OZEL-SEGMENT');
  });

  it('provada segment yok: segmentsiz kurulur ve NOT söyler; beklenen segment 0', () => {
    const p = derle('ERISIM', { ozelSegment: { provada: true } });
    const seg = (islemler(p.govde.mutateOperations, 'audienceOperation')[0]!.dimensions as Array<Record<string, { segments?: unknown[] }>>).find((x) => x.audienceSegments)!;
    expect(JSON.stringify(seg)).not.toContain('customAudience');
    expect(p.notlar.join(' ')).toContain('yayında Google\'da özel segment olarak kurulacak');
    expect(p.beklenen.kitleBoyutlari?.ozelSegmentSayisi).toBe(0);
  });
});

describe('TALEP YARATMA VIDEO: aynı boyutlar video grubunda da', () => {
  it('video grubunun kitlesinde cinsiyet ve segment var', () => {
    const d = derle('VIDEO');
    const k = islemler(d.govde.mutateOperations, 'audienceOperation');
    expect(k).toHaveLength(1);
    expect(JSON.stringify(k[0]!.dimensions)).toContain('"FEMALE"');
    expect(JSON.stringify(k[0]!.dimensions)).toContain(SEGMENT);
    expect(d.beklenen.kitleBoyutlari?.ilgiSayisi).toBe(2);
  });
});

describe('MAKS. PERFORMANS: kitle SİNYALİ', () => {
  const d = derle('SATIS');
  const ops = d.govde.mutateOperations;

  it('kitle + varlık grubuna sinyal bağı; sinyal kitlesinde YAŞ YOK', () => {
    const kitle = islemler(ops, 'audienceOperation');
    const sinyal = islemler(ops, 'assetGroupSignalOperation');
    expect(kitle).toHaveLength(1);
    expect(sinyal).toEqual([{ assetGroup: `customers/${MUSTERI}/assetGroups/-3`, audience: { audience: kitle[0]!.resourceName } }]);
    expect(JSON.stringify(kitle[0]!.dimensions)).not.toContain('age');
    // Sinyal kitleyi kuran işlemden SONRA (geçici kimlik ancak öyle çözülür).
    const turler = ops.map((o) => Object.keys(o)[0]);
    expect(turler.indexOf('audienceOperation')).toBeLessThan(turler.indexOf('assetGroupSignalOperation'));
  });

  it('"sinyal, sınır değil" notu ve beklenti', () => {
    expect(d.notlar.join(' ')).toContain('sinyal olarak kullanır');
    expect(d.beklenen.kitleBoyutlari).toEqual({ ilgiSayisi: 2, ozelSegmentSayisi: 1, cinsiyetler: ['FEMALE'], digerSegmentSayisi: 0 });
  });

  it('kitlesiz Maks. Performans gövdesinde sinyal yok', () => {
    const k = derle('SATIS', {}, null);
    expect(islemler(k.govde.mutateOperations, 'assetGroupSignalOperation')).toHaveLength(0);
    expect(islemler(k.govde.mutateOperations, 'audienceOperation')).toHaveLength(0);
  });
});

describe('ARAMA: kitle hiçbir işleme girmez', () => {
  it('Arama gövdesinde kitle ya da segment yok', () => {
    const d = derle('SITE');
    expect(JSON.stringify(d.govde)).not.toContain('userInterest');
    expect(JSON.stringify(d.govde)).not.toContain('customAudience');
    expect('kitleBoyutlari' in d.beklenen).toBe(false);
  });
});

describe('özel segment: yeniden kullanılır, çoğalmaz, provada yazılmaz', () => {
  it('ad içerikten: sıra ve tekrar adı değiştirmez, farklı kelime değiştirir', () => {
    expect(ozelSegmentAdi(['b', 'a', 'a'])).toBe(ozelSegmentAdi(['a', 'b']));
    expect(ozelSegmentAdi(['a', 'b'])).not.toBe(ozelSegmentAdi(['a', 'c']));
    expect(ozelSegmentAdi(['a'])).toMatch(/^ADV arama kelimeleri [0-9a-f]{16}$/);
  });

  it("gövde: tür AÇIKÇA SEARCH, her kelime KEYWORD üyesi", () => {
    const g = ozelSegmentGovdesi(['b', 'a'], false);
    expect(g.operations[0]!.create).toMatchObject({ type: 'SEARCH', members: [{ memberType: 'KEYWORD', keyword: 'a' }, { memberType: 'KEYWORD', keyword: 'b' }] });
    expect(g.validateOnly).toBe(false);
  });

  it('sorgu yalnız beklenen biçimdeki adı kabul eder (dışarıdan dize girmez)', () => {
    expect(() => ozelSegmentSorgusu("x' OR 1=1")).toThrow();
    expect(ozelSegmentSorgusu(ozelSegmentAdi(['a']))).toContain("custom_audience.status = 'ENABLED'");
  });

  const port = (bulunan: Array<Record<string, unknown>>, yanit: Array<{ resourceName?: string }> = []) => {
    const mutate = vi.fn(async () => yanit);
    const p: OzelSegmentPortu = { rehberAra: async <T,>() => bulunan as T[], ozelSegmentMutate: mutate };
    return { p, mutate };
  };

  it('var olan segment bulunursa YENİDEN KULLANILIR, kurulmaz', async () => {
    const ad = ozelSegmentAdi(['a']);
    const { p, mutate } = port([{ customAudience: { resourceName: SEGMENT, name: ad, status: 'ENABLED' } }]);
    expect(await ozelSegmentHazirla(p, {}, ['a'], false)).toEqual({ kaynak: SEGMENT });
    expect(mutate).not.toHaveBeenCalled();
  });

  it('provada yoksa yalnız validateOnly ile denetlenir', async () => {
    const { p, mutate } = port([]);
    expect(await ozelSegmentHazirla(p, {}, ['a'], true)).toEqual({ provada: true });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect((mutate.mock.calls[0] as unknown as [unknown, { validateOnly: boolean }])[1].validateOnly).toBe(true);
  });

  it('yayında kurulur; kaynak adı dönmezse HATA ("200 döndü" doğrulama değil)', async () => {
    expect(await ozelSegmentHazirla(port([], [{ resourceName: SEGMENT }]).p, {}, ['a'], false)).toEqual({ kaynak: SEGMENT });
    await expect(ozelSegmentHazirla(port([], [{}]).p, {}, ['a'], false)).rejects.toThrow('kaynak adını döndürmedi');
  });
});

describe('geri okuma: kitle boyut sayıları', () => {
  it('boyut sayıları; tanınmayan segment ayrı sayılır', () => {
    expect(
      kitleBoyutSayilari([
        { age: { ageRanges: [{ minAge: 25 }] } },
        { gender: { genders: ['FEMALE'] } },
        { audienceSegments: { segments: [{ userInterest: {} }, { customAudience: {} }, { userList: {} }] } },
      ]),
    ).toEqual({ ilgiSayisi: 1, ozelSegmentSayisi: 1, cinsiyetler: ['FEMALE'], digerSegmentSayisi: 1 });
  });

  it('aynı türden iki boyut okunamadı sayılır', () => {
    expect(() => kitleBoyutSayilari([{ gender: { genders: ['MALE'] } }, { gender: { genders: ['FEMALE'] } }])).toThrow();
  });

  const beklenen = derle('ERISIM').beklenen;
  const okunanTemel = (kitleBoyutlari: GoogleOkunan['kitleBoyutlari']): GoogleOkunan => ({
    kampanyaAdi: beklenen.kampanyaAdi,
    durum: 'PAUSED',
    kanal: beklenen.kanal,
    gunlukButceMicros: beklenen.gunlukButceMicros,
    aglar: null,
    konumTuru: 'PRESENCE',
    konumSayisi: beklenen.konumSayisi,
    anahtarKelimeSayisi: 0,
    negatifSayisi: 0,
    aramaOgeleri: [],
    teklif: beklenen.teklif ?? null,
    kitleBoyutlari,
  });
  const yalnizKitle = (b: GoogleBeklenen): GoogleBeklenen => ({ ...b, gorselReklam: undefined, konumKimlikleri: undefined, yakinlik: undefined, yasKitlesi: undefined });

  it('Google bir ilgi boyutunu DÜŞÜRDÜYSE fark (alan alan)', () => {
    const r = googleGeriOkumaKarsilastir(yalnizKitle(beklenen), okunanTemel({ ...beklenen.kitleBoyutlari!, ilgiSayisi: 1 }));
    expect(r.sonuc).toBe('fark');
    expect(r.satirlar.map((x) => x.alan)).toEqual(['kitle.ilgiSayisi']);
  });

  it('aynı sayılar temiz; okunamadıysa "doğrulanamadı" (açılmaz)', () => {
    expect(googleGeriOkumaKarsilastir(yalnizKitle(beklenen), okunanTemel({ ...beklenen.kitleBoyutlari! })).sonuc).toBe('temiz');
    expect(googleGeriOkumaKarsilastir(yalnizKitle(beklenen), okunanTemel('okunamadi')).sonuc).toBe('dogrulanamadi');
  });
});

/*
 * BAĞLANTI TARAMASI: derleyiciler doğru ama ÇAĞIRAN kitleyi geçirmezse
 * (yayın kapısı ilgileri `derleMeta`ya vermez, servis segmenti hazırlamaz)
 * hiçbir birim testi bunu görmez. Yorumsuz kaynakta, dilim GERÇEK sınırla
 * (çağrının kendi parantezi) çıkarılıyor ve bulunamazsa HATA (test.md).
 */
const yorumsuz = (yol: string) =>
  readFileSync(join(__dirname, yol), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/** `bas`tan başlayan çağrının parantez içi; süslü/normal parantez sayılarak. */
function cagriGovdesi(kaynak: string, bas: string, kacinci = 0): string {
  let i = -1;
  for (let n = 0; n <= kacinci; n++) {
    i = kaynak.indexOf(bas, i + 1);
    if (i < 0) throw new Error(`"${bas}" (${kacinci + 1}. kez) kaynakta yok: tarama boşa düşerdi`);
  }
  let derinlik = 0;
  for (let j = kaynak.indexOf('(', i); j < kaynak.length; j++) {
    if (kaynak[j] === '(') derinlik++;
    else if (kaynak[j] === ')' && --derinlik === 0) return kaynak.slice(i, j + 1);
  }
  throw new Error('çağrı kapanmadı');
}

describe('bağlantılar: kitle çağırandan derleyiciye gidiyor', () => {
  it("yayın kapısı taslağın kitlesini derleMeta'nın hedeflemesine veriyor", () => {
    const g = cagriGovdesi(yorumsuz('../yayin-baslat.ts'), 'derleMeta(');
    expect(g).toContain('ilgiler: alanlar.kitle.deger.ilgiler');
    expect(g).toContain('ozelKitleler: alanlar.kitle.deger.ozelKitleler');
  });

  it('servis: provada segment validateOnly ile, yayında gerçekten; ikisi de derleGoogle\'a geçiyor', () => {
    const k = yorumsuz('../rehber/rehber.service.ts');
    expect(k).toContain('ozelSegmentHazirla(this.google, fctx, t.deger.kitle.kelimeler, true)');
    expect(k).toContain('ozelSegmentHazirla(this.google, fctx, girdi.kitle.kelimeler, false)');
    const prova = cagriGovdesi(k, 'derleGoogle(t.deger');
    const yayin = cagriGovdesi(k, 'derleGoogle(girdi');
    for (const g of [prova, yayin]) expect(g).toMatch(/\bozelSegment,/);
    expect(prova).toContain('validateOnly: true');
    expect(yayin).toContain('validateOnly: false');
  });
});

// ===========================================================================
// Ç9 — PLATFORM BAZLI GOOGLE YAŞI VE KONUMU (kullanıcı kararı "B")
// ===========================================================================

const MANISA = { tur: 'region' as const, key: '2349', etiket: 'Manisa', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012790', ad: 'Manisa' } };

describe('Ç9: Google konumu ve yaşı ayrı', () => {
  it('Google konum listesi varsa Google ORAYA gider; ortak (Meta) konum gitmez', () => {
    const g = girdi('ERISIM', KITLE, { googleKonumlari: al([MANISA]) });
    expect(g.konumlar).toEqual(['geoTargetConstants/1012790']);
  });

  it('alan yoksa eski davranış: ortak konum, yaş aralığı anahtarı YOK', () => {
    const g = girdi('ERISIM', null);
    expect(g.konumlar).toEqual(['geoTargetConstants/1012782']);
    expect('yasAraligi' in g).toBe(false);
  });

  it('Google yaşı YALNIZ Talep Yaratma girdisine yazılır (Arama ve Maks. Performans yaş taşımıyor)', () => {
    const yas = { googleYasAraligi: al({ min: 30, max: 55 }) };
    expect(girdi('ERISIM', KITLE, yas).yasAraligi).toEqual({ min: 30, max: 55 });
    expect(girdi('VIDEO', KITLE, yas).yasAraligi).toEqual({ min: 30, max: 55 });
    expect('yasAraligi' in girdi('SATIS', KITLE, yas)).toBe(false);
    expect('yasAraligi' in girdi('SITE', KITLE, yas)).toBe(false);
  });

  it('eşlenmemiş Google konumu türetmeyi durdurur (G-KONUM), ortak konum eşli olsa da', () => {
    const r = rehberdenGoogle({ ...rehber('ERISIM'), googleKonumlari: al([{ ...MANISA, google: null }]) }, { meta: false, google: true }, {
      musteriId: '1', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', donusumEtkin: true, son30GunDonusum: 50, uzantilar: null, satisOlcumu: true,
      medyaOranlari: ORANLAR, isletmeAdi: 'X', logoVarlikId: U(9), kategoriTabani: [],
    });
    expect(r.tur === 'ret' && r.kodlar).toContain('G-KONUM');
  });
});

describe('Ç9: yaş aralığı Google kovalarına (kısıtla, taşma)', () => {
  it('30-55 → 35-44, 45-54 ve kırpma notu', () => {
    const r = googleAralikKovalari(18, { min: 30, max: 55 })!;
    expect(r.kovalar).toEqual(['AGE_RANGE_35_44', 'AGE_RANGE_45_54']);
    expect(r.not).toContain("35-54");
  });
  it('25-65 → 25 ve üstü, not yok', () => {
    expect(googleAralikKovalari(18, { min: 25, max: 65 })).toEqual({ kovalar: ['AGE_RANGE_25_34', 'AGE_RANGE_35_44', 'AGE_RANGE_45_54', 'AGE_RANGE_55_64', 'AGE_RANGE_65_UP'], not: null });
  });
  it('en düşük yaş (kesin taban) alt ucu yükseltir', () => {
    expect(googleAralikKovalari(25, { min: 18, max: 44 })!.kovalar).toEqual(['AGE_RANGE_25_34', 'AGE_RANGE_35_44']);
  });
  it('hiçbir kova sığmazsa null (boş liste "yaş kısıtı yok" olurdu)', () => {
    expect(googleAralikKovalari(18, { min: 30, max: 33 })).toBeNull();
  });
  it('derleyici: aralık kitlenin yaş boyutuna gider; sığmayan aralık RET', () => {
    const d = derleGoogle(girdi('ERISIM', KITLE, { googleYasAraligi: al({ min: 30, max: 55 }) }), B);
    if (d.tur !== 'govde') throw new Error('ret');
    const k = islemler(d.govde.mutateOperations, 'audienceOperation')[0]!;
    expect((k.dimensions as Array<Record<string, unknown>>)[0]).toEqual({ age: { ageRanges: [{ minAge: 35, maxAge: 54 }], includeUndetermined: false } });
    expect(d.beklenen.yasKitlesi).toEqual({ segmentler: [{ minAge: 35, maxAge: 54 }], belirsizDahil: false });
    const r = derleGoogle(girdi('ERISIM', KITLE, { googleYasAraligi: al({ min: 30, max: 33 }) }), B);
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toContain('G-YAS-ARALIK');
  });
});

const BAGLAM = { ajansYoneticisi: true, onKosullar: null, yasalUyari: null, asgariGunluk: { meta: null, googleTalepYaratma: null }, paraBirimi: 'TRY', paraBirimleriAyni: true };
const kod = (a: RehberAlanlari) => rehberEksikleri(a, BAGLAM).map((e) => `${e.kod}:${e.alan}:${e.seviye}`);

describe('Ç9: eksikler', () => {
  it('yalnız Google açık ve Google listesi doluysa ortak konum ŞART DEĞİL', () => {
    const a = { ...rehber('ERISIM'), konumlar: al([]), googleKonumlari: al([MANISA]) };
    expect(kod(a).some((x) => x.startsWith('KNM-01'))).toBe(false);
  });
  it('Google listesi boşsa G-KNM-01 engel', () => {
    expect(kod({ ...rehber('ERISIM'), googleKonumlari: al([]) })).toContain('G-KNM-01:googleKonumlari:engel');
  });
  it('Google listesinde eşlenmemiş konum: G-KONUM o alanda', () => {
    expect(kod({ ...rehber('ERISIM'), googleKonumlari: al([{ ...MANISA, google: null }]) })).toContain('G-KONUM:googleKonumlari:engel');
  });
  it('Google yaşı: geçersiz KTL-02, Maks. Performans\'ta gitmediği UYARI', () => {
    expect(kod({ ...rehber('ERISIM'), googleYasAraligi: al({ min: 50, max: 30 }) })).toContain('KTL-02:googleYasAraligi:engel');
    expect(kod({ ...rehber('SATIS'), googleYasAraligi: al({ min: 30, max: 55 }) })).toContain('KITLE-YAS-GITMEZ:googleYasAraligi:uyari');
    expect(kod({ ...rehber('ERISIM'), googleYasAraligi: al({ min: 30, max: 55 }) }).some((x) => x.includes('googleYasAraligi'))).toBe(false);
  });
  it('kısıtlı kategoride Google yaşı daraltılamaz', () => {
    expect(kod({ ...rehber('ERISIM'), ekKategoriler: al(['HOUSING' as const]), googleYasAraligi: al({ min: 30, max: 55 }) })).toContain('KTL-KISITLI:googleYasAraligi:engel');
  });
});

describe('Ç9: Google konumunun karşılığını istemci yazamaz (BULGU-4 aynı kural)', () => {
  it('istemcinin gönderdiği google alanı atılır, sunucu eşlemesi korunur', () => {
    const r = degisiklikleriUygula({}, [{ alan: 'googleKonumlari', deger: [{ ...MANISA, google: { kaynak: 'geoTargetConstants/2840', ad: 'ABD' } }], kaynak: 'kullanici' }], KIM, Z);
    if (r.tur !== 'tamam') throw new Error(r.mesaj);
    expect(r.alanlar.googleKonumlari?.deger[0]?.google ?? null).toBeNull();
    const sunucu = degisiklikleriUygula({}, [{ alan: 'googleKonumlari', deger: [MANISA], kaynak: 'kullanici' }], KIM, Z, { sunucuKonumEslemesi: true });
    if (sunucu.tur !== 'tamam') throw new Error(sunucu.mesaj);
    expect(sunucu.alanlar.googleKonumlari?.deger[0]?.google).toEqual(MANISA.google);
  });
});

describe('Ç9 + kitle: Kontrol karar tablosu', () => {
  const tablo = (amac: RehberAmacKodu, kitle: NonNullable<Parameters<typeof kararTablosu>[5]>['kitle']) =>
    kararTablosu(amac, { meta: true, google: true }, 'MAKS_TIKLAMA', true, null, { kitle });
  const KITLE_EKI = { meta: { ad: 'M', kisitli: false }, google: { ad: 'G' }, googleKonumlari: ['Manisa'], googleYasi: { min: 25, max: 65 } };

  it('KITLE satırı iki platformu ayrı söyler; Google konumu KONUM hücresinde', () => {
    const t = tablo('ERISIM', KITLE_EKI);
    const k = t.find((x) => x.kod === 'KITLE')!;
    expect(k.meta?.not).toContain('öneri');
    expect(k.google?.deger).toBe('"G" kitlesi');
    expect(t.find((x) => x.kod === 'KONUM')!.google?.deger).toBe('Google kitlesinin konumu: Manisa');
  });
  it('Arama: "yalnız konum"; kısıtlı Meta: "yalnız konum"', () => {
    const t = tablo('SITE', { ...KITLE_EKI, meta: { ad: 'M', kisitli: true } });
    const k = t.find((x) => x.kod === 'KITLE')!;
    expect(k.google?.deger).toContain('yalnız konum');
    expect(k.meta?.deger).toContain('yalnız konum');
  });
  it('kitle yoksa satır YOK, KONUM hücresi eskisi gibi', () => {
    const t = kararTablosu('ERISIM', { meta: true, google: true }, 'MAKS_TIKLAMA', true);
    expect(t.some((x) => x.kod === 'KITLE')).toBe(false);
    expect(t.find((x) => x.kod === 'KONUM')!.google?.deger).toBe('Yalnız bu bölgede bulunanlar');
  });
});

describe('Ç9: konum eşleme Google listesini de eşliyor (servis taraması)', () => {
  it("konumlariEsle iki listeyi TEK yazmada eşliyor; anahtar kelime önerisi etkin Google konumunu okuyor", () => {
    const k = yorumsuz('../rehber/rehber.service.ts');
    const i = k.indexOf('async konumlariEsle(');
    const j = k.indexOf('async anahtarKelimeOner(');
    if (i < 0 || j < 0) throw new Error('konumlariEsle gövdesi bulunamadı');
    const g = k.slice(i, j);
    expect(g).toContain("(['konumlar', 'googleKonumlari'] as const)");
    expect(g).toContain('this.yaz(ctx, id, { surum: s.surum, degisiklikler }, true)');
    expect(k.slice(j, j + 1500)).toContain('googleEtkinKonumlar(a)');
  });
});
