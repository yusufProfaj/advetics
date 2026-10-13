import { describe, expect, it } from 'vitest';
import {
  googleGorselBulgulari,
  googleMetinBulgulari,
  googleTeklifi,
  kararTablosu,
  pmaxUzunBaslik,
  rehberdenGoogle,
  type GoogleDerlemeGirdisi,
  type GorselOlcusu,
  type GorselOrani,
  type RehberAlanlari,
  type RehberAmacKodu,
} from '@advetics/shared';
import { derleGoogle, type GoogleDerlemeBaglami } from './derle-google';
import { DEMAND_GEN_GORSEL_KANALLARI, type GoogleGorselKaynagi } from '../../connections/providers/google-demandgen';
import { PMAX_EN_COK_LOGO, PMAX_EN_COK_VIDEO, pmaxHedefIslemleri, pmaxLogoKareMi, pmaxSinirSorunu } from '../../connections/providers/google-pmax';

/**
 * ═══ DALGA 3 — Talep Yaratma GÖRSEL ve Maks. Performans derleyicisi ═══
 *
 * İki soru: (1) gövde v25 referansının istediği ŞEKİLDE mi (alan adları,
 * zorunlu alanlar, geçici kimlik sırası), (2) karar tablosunun SÖZÜNÜ gövde
 * tutuyor mu. Canlıda HİÇ koşmadı; bu dosya yalnız şekli kilitliyor.
 *
 * ERISIM ve SATIS Google satırları `REHBER_ACILIS`te `kapali`: açık küme
 * burada elle veriliyor (açılış tablosu bu dalgada DEĞİŞMİYOR).
 */

const TL = (n: number) => BigInt(n) * 1_000_000n;
const Z = '2026-10-10T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: KIM, zaman: Z });
const ACIK = { meta: false, google: true };
const MUSTERI = '1234567890';

const YATAY = U(11);
const KARE = U(12);
const DIK45 = U(13);
const DIKEY = U(14);
const VIDEO = U(15);
const ORANLAR = new Map<string, GorselOrani | null>([
  [YATAY, 'yatay'],
  [KARE, 'kare'],
  [DIK45, 'dik45'],
  [DIKEY, 'dikey'],
  [VIDEO, null],
]);

function rehber(amac: RehberAmacKodu, ek: Partial<RehberAlanlari> = {}): RehberAlanlari {
  return {
    amac: al(amac),
    platformlar: al({ meta: false, google: true }),
    googleHesabiId: al(U(2), 'workspace_profili'),
    konumlar: al([{ tur: 'city' as const, key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }], 'marka_merkezi'),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr/urun', 'marka_merkezi'),
    medya: al([{ varlikId: YATAY }, { varlikId: KARE }, { varlikId: DIK45 }, { varlikId: DIKEY }, { varlikId: VIDEO, kapakVarlikId: U(16) }]),
    youtubeVideo: al({ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım' }),
    metin: al({
      anaMetin: 'Kuşadası’nda denize yürüme mesafesinde bahçeli villalar.',
      basliklar: ['Özel Havuzlu Villalar', 'Kuşadası Garden Villas', 'Denize 5 Dakika Yürüme'],
      aciklamalar: ['3+1 bahçeli villalar, site içinde havuz.', 'Taksit seçenekleriyle teslime hazır villalar, hemen bilgi alın.'],
    }),
    butce: al({ tip: 'gunluk' as const, micros: TL(500).toString() }),
    takvim: al({ baslangic: '2026-10-11', bitis: null }),
    ...ek,
  };
}

/**
 * Hesabın müşteri düzeyi hedefleri: Advetics kurulumunun açtıkları (form,
 * telefon, WhatsApp/iletişim) ve satın alma. Yalnız PURCHASE~WEBSITE
 * teklife girmeli.
 */
const HEDEFLER = [
  { kategori: 'SUBMIT_LEAD_FORM', kaynak: 'WEBSITE' },
  { kategori: 'PURCHASE', kaynak: 'WEBSITE' },
  { kategori: 'PHONE_CALL_LEAD', kaynak: 'CALL_FROM_ADS' },
  { kategori: 'CONTACT', kaynak: 'WEBSITE' },
  { kategori: 'PURCHASE', kaynak: 'GOOGLE_HOSTED' },
];

function turet(amac: RehberAmacKodu, o: { donusum?: boolean | null; satis?: boolean | null; a?: RehberAlanlari; hedefler?: typeof HEDEFLER | null } = {}) {
  return rehberdenGoogle(o.a ?? rehber(amac), ACIK, {
    musteriId: '123-456-7890',
    paraBirimi: 'TRY',
    saatDilimi: 'Europe/Istanbul',
    donusumEtkin: o.donusum ?? false,
    son30GunDonusum: 20,
    uzantilar: null,
    satisOlcumu: o.satis === undefined ? true : o.satis,
    donusumHedefleri: o.hedefler === undefined ? HEDEFLER : o.hedefler,
    medyaOranlari: ORANLAR,
    isletmeAdi: 'Garden Villas',
    logoVarlikId: U(9),
    kategoriTabani: [],
  });
}
function girdi(amac: RehberAmacKodu, o: Parameters<typeof turet>[1] = {}): GoogleDerlemeGirdisi {
  const r = turet(amac, o);
  if (r.tur !== 'tamam') throw new Error(`türetme reddetti: ${r.kodlar.join(',')}`);
  return r.deger;
}

const olcu = (genislik: number, yukseklik: number, bayt = 300_000): GorselOlcusu => ({ genislik, yukseklik, bayt });
const yeni = (ad: string): GoogleGorselKaynagi => ({ yeniGorsel: { name: ad, bytes: Buffer.from(ad) } });
const KAYNAKLAR = new Map<string, { kaynak: GoogleGorselKaynagi; olcu: GorselOlcusu }>([
  // Yatay hesapta zaten kayıtlı (önbellek): yeniden YÜKLENMEZ.
  [YATAY, { kaynak: { resource: `customers/${MUSTERI}/assets/111` }, olcu: olcu(1200, 628) }],
  [KARE, { kaynak: yeni('kare'), olcu: olcu(1200, 1200) }],
  [DIK45, { kaynak: yeni('dik45'), olcu: olcu(960, 1200) }],
]);

const B: GoogleDerlemeBaglami = {
  kimlik: 'abcdef12-0000-4000-8000-000000000000',
  workspaceKisaAdi: 'Ege Birlik',
  amacEkranAdi: 'Bölgemde çok kişi görsün',
  simdi: new Date('2026-10-10T09:00:00+03:00'),
  validateOnly: true,
  logo: { resource: `customers/${MUSTERI}/assets/77` },
  youtubeVideoBasligi: 'Tanıtım',
  gorselKaynaklari: KAYNAKLAR,
};

function derle(amac: RehberAmacKodu, b: Partial<GoogleDerlemeBaglami> = {}, o: Parameters<typeof turet>[1] = {}) {
  const d = derleGoogle(girdi(amac, o), { ...B, ...b });
  if (d.tur !== 'govde') throw new Error(`derleme reddetti: ${JSON.stringify(d.retler)}`);
  return d;
}

type Op = Record<string, { create?: Record<string, unknown> } | undefined>;
const islemler = (ops: Array<Record<string, unknown>>, tur: string) =>
  (ops as Op[]).map((o) => o[tur]?.create).filter((c): c is Record<string, unknown> => !!c);
const kampanya = (ops: Array<Record<string, unknown>>) => islemler(ops, 'campaignOperation')[0]!;
const turler = (ops: Array<Record<string, unknown>>) => ops.map((o) => Object.keys(o)[0]);
const tablo = (amac: RehberAmacKodu, kurgu: Parameters<typeof googleTeklifi>[0], donusum: boolean | null) =>
  Object.fromEntries(kararTablosu(amac, ACIK, googleTeklifi(kurgu, donusum, 20), false).map((s) => [s.kod, s.google]));

/**
 * Geçici kimlik ancak onu KURAN işlem sırada önce geliyorsa çözülür. Her
 * `customers/X/<koleksiyon>/-N` başvurusu, `resourceName`i o olan bir
 * önceki işleme denk gelmeli.
 */
function geciciKimliklerCozuluyor(ops: Array<Record<string, unknown>>): string[] {
  const kurulan = new Set<string>();
  const hatalar: string[] = [];
  ops.forEach((op, i) => {
    const c = Object.values(op)[0] as { create?: Record<string, unknown> };
    const govde = JSON.stringify(c.create ?? {});
    const kendi = c.create?.resourceName as string | undefined;
    for (const m of govde.matchAll(/customers\/\d+\/[a-zA-Z]+\/-\d+/g)) {
      if (m[0] !== kendi && !kurulan.has(m[0])) hatalar.push(`işlem ${i}: ${m[0]} henüz kurulmadı`);
    }
    if (kendi) kurulan.add(kendi);
  });
  return hatalar;
}

// ===========================================================================
// TALEP YARATMA GÖRSEL ("Bölgemde çok kişi görsün")
// ===========================================================================

describe('TALEP YARATMA GÖRSEL — altın gövde', () => {
  const d = derle('ERISIM');
  const ops = d.govde.mutateOperations;
  const reklam = islemler(ops, 'adGroupAdOperation')[0]!;
  const bilgi = (reklam.ad as { demandGenMultiAssetAd: Record<string, unknown> }).demandGenMultiAssetAd;

  it('sıra: bütçe → kampanya → grup → konum → görseller (yalnız YENİLER) → reklam; geçici kimlikler çözülüyor', () => {
    expect(turler(ops)).toEqual([
      'campaignBudgetOperation',
      'campaignOperation',
      'adGroupOperation',
      'adGroupCriterionOperation',
      'assetOperation',
      'assetOperation',
      'adGroupAdOperation',
    ]);
    expect(geciciKimliklerCozuluyor(ops)).toEqual([]);
    expect(d.govde.partialFailure).toBe(false);
    expect(d.govde.validateOnly).toBe(true);
  });

  it('kampanya DEMAND_GEN, alt tipsiz, DURAKLATILMIŞ, PRESENCE, upgradedTargeting', () => {
    const k = kampanya(ops);
    expect(k.advertisingChannelType).toBe('DEMAND_GEN');
    expect(k.advertisingChannelSubType).toBeUndefined();
    expect(k.status).toBe('PAUSED');
    expect(k.geoTargetTypeSetting).toEqual({ positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' });
    expect(k.demandGenCampaignSettings).toEqual({ upgradedTargeting: true });
    expect(islemler(ops, 'campaignCriterionOperation')).toHaveLength(0);
  });

  it('reklam: çoklu varlık, işletme adı DÜZ DİZGE, görseller oranına göre ÜÇ alanda, 9:16 YOK, eylem çağrısı YOK', () => {
    expect(reklam.status).toBe('ENABLED');
    expect((reklam.ad as { finalUrls: string[] }).finalUrls).toEqual(['https://ornek.com.tr/urun']);
    expect((reklam.ad as { name?: string }).name).toMatch(/reklam/);
    expect(bilgi.businessName).toBe('Garden Villas');
    expect(bilgi.logoImages).toEqual([{ asset: `customers/${MUSTERI}/assets/77` }]);
    expect(bilgi.marketingImages).toEqual([{ asset: `customers/${MUSTERI}/assets/111` }]);
    expect(bilgi.squareMarketingImages).toEqual([{ asset: `customers/${MUSTERI}/assets/-5` }]);
    expect(bilgi.portraitMarketingImages).toEqual([{ asset: `customers/${MUSTERI}/assets/-6` }]);
    expect(bilgi.tallPortraitMarketingImages).toBeUndefined();
    expect(bilgi.callToActionText).toBeUndefined();
    expect(bilgi.headlines).toEqual([{ text: 'Özel Havuzlu Villalar' }, { text: 'Kuşadası Garden Villas' }, { text: 'Denize 5 Dakika Yürüme' }]);
    expect((bilgi.descriptions as unknown[]).length).toBe(2);
    expect(bilgi.longHeadlines).toBeUndefined();
  });

  it('yeni görseller AYNI istekte yükleniyor ve sırası önbellek için kaydediliyor; kayıtlı görsel yeniden yüklenmiyor', () => {
    expect(d.sira.gorseller).toEqual([
      { varlikId: KARE, sira: 4 },
      { varlikId: DIK45, sira: 5 },
    ]);
    const varliklar = islemler(ops, 'assetOperation');
    expect(varliklar.map((v) => (v.imageAsset as { data: string }).data)).toEqual([Buffer.from('kare').toString('base64'), Buffer.from('dik45').toString('base64')]);
    // Ad tekil: varlık kimliği + zaman damgası (DUPLICATE_ASSET_NAME).
    expect(String(varliklar[0]!.name)).toContain(KARE.slice(-8));
  });

  it('NEREDE: "YouTube akışı ve Shorts, Gmail, Keşfet" ↔ yedi kanal AÇIKÇA; video arası, Görüntülü, Haritalar kapalı', () => {
    expect(tablo('ERISIM', 'TALEP_YARATMA_GORSEL', false).NEREDE).toEqual({
      deger: 'YouTube akışı ve Shorts, Gmail, Keşfet',
      not: 'YouTube video arası, Haritalar ve Görüntülü Reklam Ağı kapalı',
    });
    const grup = islemler(ops, 'adGroupOperation')[0]!;
    expect((grup.demandGenAdGroupSettings as { channelControls: { selectedChannels: unknown } }).channelControls.selectedChannels).toEqual({
      youtubeInStream: false,
      youtubeInFeed: true,
      youtubeShorts: true,
      discover: true,
      gmail: true,
      display: false,
      maps: false,
    });
    expect(grup.type).toBeUndefined();
  });

  it('OTOMATIK_METIN: "Görsellerinden video ve yeni tasarım üretme kapalı" ↔ üç otomasyon reklamda OPTED_OUT', () => {
    expect(tablo('ERISIM', 'TALEP_YARATMA_GORSEL', false).OTOMATIK_METIN?.deger).toBe('Görsellerinden video ve yeni tasarım üretme kapalı');
    expect(reklam.adGroupAdAssetAutomationSettings).toEqual([
      { assetAutomationType: 'GENERATE_VIDEOS_FROM_OTHER_ASSETS', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'GENERATE_DESIGN_VERSIONS_FOR_IMAGES', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS', assetAutomationStatus: 'OPTED_OUT' },
    ]);
  });

  it('TEKLIF: dönüşüm ölçümü ETKİN olsa bile tıklama — tablo da gövde de (önceden tablo "En çok dönüşüm" diyordu)', () => {
    const g = girdi('ERISIM', { donusum: true });
    expect(g.teklif).toBe('MAKS_TIKLAMA');
    expect(tablo('ERISIM', 'TALEP_YARATMA_GORSEL', true).TEKLIF?.deger).toBe('En çok tıklama');
    const k = kampanya(derle('ERISIM', {}, { donusum: true }).govde.mutateOperations);
    expect(k.targetSpend).toEqual({});
    expect(k.maximizeConversions).toBeUndefined();
  });

  it('VİDEO kurgusunda da aynı: ölçüm etkinken tablo "En çok tıklama" (gövde hep targetSpend)', () => {
    expect(googleTeklifi('TALEP_YARATMA_VIDEO', true, 20)).toBe('MAKS_TIKLAMA');
    expect(tablo('VIDEO', 'TALEP_YARATMA_VIDEO', true).TEKLIF?.deger).toBe('En çok tıklama');
  });

  it('9:16 görsel Google’a GİTMİYOR ve NOTLA söyleniyor; video da türetmede yok', () => {
    expect(d.notlar.some((n) => /9:16/.test(n))).toBe(true);
    expect(girdi('ERISIM').gorseller?.map((x) => x.varlikId)).toEqual([YATAY, KARE, DIK45, DIKEY]);
    expect(JSON.stringify(ops)).not.toContain(DIKEY.slice(-8));
    expect(islemler(ops, 'assetOperation')).toHaveLength(2);
  });

  it('beklenen geri okuma gövdeden: görsel sayıları, kanallar, otomasyon, teklif', () => {
    expect(d.beklenen.kanal).toBe('DEMAND_GEN');
    expect(d.beklenen.teklif).toBe('TARGET_SPEND');
    expect(d.beklenen.gorselReklam).toEqual({
      reklamSayisi: 1,
      yatay: (bilgi.marketingImages as unknown[]).length,
      kare: (bilgi.squareMarketingImages as unknown[]).length,
      dik45: (bilgi.portraitMarketingImages as unknown[]).length,
      logo: 1,
      kanallar: { ...DEMAND_GEN_GORSEL_KANALLARI },
      otomasyon: {
        GENERATE_VIDEOS_FROM_OTHER_ASSETS: 'OPTED_OUT',
        GENERATE_DESIGN_VERSIONS_FOR_IMAGES: 'OPTED_OUT',
        GENERATE_ANIMATED_IMAGES_FROM_OTHER_ASSETS: 'OPTED_OUT',
      },
    });
  });
});

describe('TALEP YARATMA GÖRSEL — sesli retler', () => {
  const kodlar = (b: Partial<GoogleDerlemeBaglami>, o: Parameters<typeof turet>[1] = {}) => {
    const r = derleGoogle(girdi('ERISIM', o), { ...B, ...b });
    return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
  };

  it('KRİTİK: Google ±%1 — 1200×640 (Meta’nın %3’ünde "yatay") Google’da RET, sebebiyle', () => {
    const k = new Map(KAYNAKLAR);
    k.set(YATAY, { kaynak: { resource: 'customers/1/assets/1' }, olcu: olcu(1200, 640) });
    const r = derleGoogle(girdi('ERISIM'), { ...B, gorselKaynaklari: k });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['G-GORSEL-OLCU']);
    expect(r.tur === 'ret' && r.retler[0]!.mesaj).toMatch(/1\.91:1/);
  });

  it('en az boyutun altı ve 5 MB üstü RET', () => {
    const kucuk = new Map(KAYNAKLAR);
    kucuk.set(KARE, { kaynak: yeni('k'), olcu: olcu(200, 200) });
    expect(kodlar({ gorselKaynaklari: kucuk })).toEqual(['G-GORSEL-OLCU']);
    const buyuk = new Map(KAYNAKLAR);
    buyuk.set(KARE, { kaynak: yeni('k'), olcu: olcu(1200, 1200, 6_000_000) });
    expect(kodlar({ gorselKaynaklari: buyuk })).toEqual(['G-GORSEL-OLCU']);
  });

  it('arşivde olmayan görsel RET (sessizce eksik görselle kurulmaz)', () => {
    const k = new Map(KAYNAKLAR);
    k.delete(DIK45);
    expect(kodlar({ gorselKaynaklari: k })).toEqual(['G-GORSEL-KAYNAK']);
  });

  it('yalnız 4:5 ve 9:16 varsa RET (yatay ya da kare zorunlu)', () => {
    const a = rehber('ERISIM', { medya: al([{ varlikId: DIK45 }, { varlikId: DIKEY }]) });
    expect(kodlar({}, { a })).toEqual(['G-GORSEL-YOK']);
  });

  it('logo yok, işletme adı 25’i aşıyor → RET (kırpılmaz)', () => {
    expect(kodlar({ logo: null })).toContain('G-LOGO');
    const r = derleGoogle({ ...girdi('ERISIM'), isletmeAdi: 'Garden Villas Kuşadası Emlak' }, B);
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['G-ISLETME-ADI']);
  });

  it('oranı bilinmeyen görsel TÜRETMEYİ durdurur (G-GORSEL-ORAN)', () => {
    const a = rehber('ERISIM', { medya: al([{ varlikId: YATAY }, { varlikId: U(99) }]) });
    expect(turet('ERISIM', { a })).toEqual({ tur: 'ret', kodlar: ['G-GORSEL-ORAN'] });
  });
});

// ===========================================================================
// MAKS. PERFORMANS ("Sitemden satış gelsin")
// ===========================================================================

describe('MAKS. PERFORMANS — türetme', () => {
  it('KRİTİK: satın alma ölçümü yoksa YA DA bilinmiyorsa kurulmaz (G-DONUSUM)', () => {
    expect(turet('SATIS', { satis: false })).toEqual({ tur: 'ret', kodlar: ['G-DONUSUM'] });
    expect(turet('SATIS', { satis: null })).toEqual({ tur: 'ret', kodlar: ['G-DONUSUM'] });
    expect(girdi('SATIS').teklif).toBe('MAKS_DONUSUM');
  });

  it('uzun başlık: ana metin ≤ 90 ise ODUR; değilse ve 3+ açıklama varsa sonuncusu (açıklamalardan çıkar)', () => {
    const g = girdi('SATIS');
    expect(g.uzunBasliklar).toEqual(['Kuşadası’nda denize yürüme mesafesinde bahçeli villalar.']);
    expect(g.aciklamalar).toHaveLength(2);
    const uzun = 'x'.repeat(91);
    const a3 = rehber('SATIS', {
      metin: al({ anaMetin: uzun, basliklar: ['A', 'B', 'C'], aciklamalar: ['Bir.', 'İki.', 'Üç uzun başlık olur.'] }),
    });
    const g3 = girdi('SATIS', { a: a3 });
    expect(g3.uzunBasliklar).toEqual(['Üç uzun başlık olur.']);
    expect(g3.aciklamalar).toEqual(['Bir.', 'İki.']);
    const a2 = rehber('SATIS', { metin: al({ anaMetin: uzun, basliklar: ['A', 'B', 'C'], aciklamalar: ['Bir.', 'İki.'] }) });
    expect(turet('SATIS', { a: a2 })).toEqual({ tur: 'ret', kodlar: ['G-UZUN-BASLIK'] });
  });
});

describe('MAKS. PERFORMANS — altın gövde', () => {
  const d = derle('SATIS', { amacEkranAdi: 'Sitemden satış gelsin' });
  const ops = d.govde.mutateOperations;
  const k = kampanya(ops);
  const varliklar = islemler(ops, 'assetOperation');
  const baglar = islemler(ops, 'assetGroupAssetOperation');
  const markaBaglari = islemler(ops, 'campaignAssetOperation');
  const metinOf = (asset: unknown) => (varliklar.find((v) => v.resourceName === asset)?.textAsset as { text?: string } | undefined)?.text;

  it('kampanya PERFORMANCE_MAX, alt tipsiz, maximizeConversions TEK strateji, marka kuralları AÇIK, PAUSED, AB beyanı', () => {
    expect(k.advertisingChannelType).toBe('PERFORMANCE_MAX');
    expect(k.advertisingChannelSubType).toBeUndefined();
    expect(k.maximizeConversions).toEqual({});
    expect(k.targetSpend).toBeUndefined();
    expect(k.maximizeConversionValue).toBeUndefined();
    expect(k.brandGuidelinesEnabled).toBe(true);
    expect(k.status).toBe('PAUSED');
    expect(k.containsEuPoliticalAdvertising).toBe('DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING');
    expect(k.urlExpansionOptOut).toBeUndefined();
    expect(d.govde.partialFailure).toBe(false);
  });

  it('sıra: bütçe → kampanya → ölçütler → VARLIK GRUBU → varlık/bağ → marka; geçici kimlikler çözülüyor; reklam işlemi YOK', () => {
    const t = turler(ops);
    expect(t.slice(0, 5)).toEqual(['campaignBudgetOperation', 'campaignOperation', 'campaignCriterionOperation', 'campaignCriterionOperation', 'assetGroupOperation']);
    expect(t).not.toContain('adGroupOperation');
    expect(t).not.toContain('adGroupAdOperation');
    // Marka bağları varlıklardan sonra, kampanya hedefleri EN SONDA (resmî örnek).
    const ilkHedef = t.indexOf('campaignConversionGoalOperation');
    expect(t[ilkHedef - 1]).toBe('campaignAssetOperation');
    expect(t.slice(ilkHedef).every((x) => x === 'campaignConversionGoalOperation')).toBe(true);
    expect(geciciKimliklerCozuluyor(ops)).toEqual([]);
    expect(d.sira.reklam).toBeNull();
    expect(turler(ops)[d.sira.reklamGrubu]).toBe('assetGroupOperation');
  });

  it('bütçe paylaşımsız; konum PRESENCE + kampanya ölçütü; dil Türkçe', () => {
    expect(islemler(ops, 'campaignBudgetOperation')[0]!.explicitlyShared).toBe(false);
    expect(k.geoTargetTypeSetting).toEqual({ positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' });
    const olcutler = islemler(ops, 'campaignCriterionOperation');
    expect(olcutler.map((c) => c.location ?? c.language)).toEqual([{ geoTargetConstant: 'geoTargetConstants/1012782' }, { languageConstant: 'languageConstants/1037' }]);
  });

  it('varlık grubu: verilen adres, AÇIK (kampanya açılınca yayınlansın)', () => {
    const grup = islemler(ops, 'assetGroupOperation')[0]!;
    expect(grup.finalUrls).toEqual(['https://ornek.com.tr/urun']);
    expect(grup.status).toBe('ENABLED');
    expect(grup.campaign).toBe(k.resourceName);
  });

  it('metin ve görsel bağları: 3 başlık, 1 uzun başlık (ana metin), 2 açıklama, yatay/kare/4:5, YouTube videosu', () => {
    const say = (t: string) => baglar.filter((b) => b.fieldType === t).length;
    expect({
      HEADLINE: say('HEADLINE'),
      LONG_HEADLINE: say('LONG_HEADLINE'),
      DESCRIPTION: say('DESCRIPTION'),
      MARKETING_IMAGE: say('MARKETING_IMAGE'),
      SQUARE_MARKETING_IMAGE: say('SQUARE_MARKETING_IMAGE'),
      PORTRAIT_MARKETING_IMAGE: say('PORTRAIT_MARKETING_IMAGE'),
      YOUTUBE_VIDEO: say('YOUTUBE_VIDEO'),
    }).toEqual(d.beklenen.varlikGrubu!.alanlar);
    expect(d.beklenen.varlikGrubu!.alanlar).toEqual({
      HEADLINE: 3,
      LONG_HEADLINE: 1,
      DESCRIPTION: 2,
      MARKETING_IMAGE: 1,
      SQUARE_MARKETING_IMAGE: 1,
      PORTRAIT_MARKETING_IMAGE: 1,
      YOUTUBE_VIDEO: 1,
    });
    expect(baglar.filter((b) => b.fieldType === 'LONG_HEADLINE').map((b) => metinOf(b.asset))).toEqual(['Kuşadası’nda denize yürüme mesafesinde bahçeli villalar.']);
    expect(baglar.find((b) => b.fieldType === 'MARKETING_IMAGE')!.asset).toBe(`customers/${MUSTERI}/assets/111`);
    const video = varliklar.find((v) => v.youtubeVideoAsset) as { youtubeVideoAsset: { youtubeVideoId: string } };
    expect(video.youtubeVideoAsset.youtubeVideoId).toBe('dQw4w9WgXcQ');
  });

  it('KRİTİK: işletme adı ve logo KAMPANYAYA bağlı (marka kuralları açık), varlık grubuna DEĞİL', () => {
    expect(markaBaglari.map((b) => b.fieldType)).toEqual(['BUSINESS_NAME', 'LOGO']);
    expect(markaBaglari.every((b) => b.campaign === k.resourceName)).toBe(true);
    expect(metinOf(markaBaglari[0]!.asset)).toBe('Garden Villas');
    expect(markaBaglari[1]!.asset).toBe(`customers/${MUSTERI}/assets/77`);
    expect(baglar.some((b) => b.fieldType === 'BUSINESS_NAME' || b.fieldType === 'LOGO')).toBe(false);
  });

  it('aynı metin TEK varlık: bir başlık iki kez yazılsa bile ikinci bağ ve ikinci varlık kurulmaz', () => {
    const g = girdi('SATIS');
    const r = derleGoogle({ ...g, basliklar: [...g.basliklar, g.basliklar[0]!] }, B);
    if (r.tur !== 'govde') throw new Error('derleme');
    const metinler = islemler(r.govde.mutateOperations, 'assetOperation').flatMap((v) => ((v.textAsset as { text?: string })?.text ? [(v.textAsset as { text: string }).text] : []));
    expect(new Set(metinler).size).toBe(metinler.length);
    expect(islemler(r.govde.mutateOperations, 'assetGroupAssetOperation').filter((b) => b.fieldType === 'HEADLINE')).toHaveLength(3);
  });

  it('OTOMATIK_METIN: "Otomatik metin ve sayfa genişletme kapalı" ↔ dört otomasyon açıkça', () => {
    const t = tablo('SATIS', 'MAKS_PERFORMANS', null);
    expect(t.OTOMATIK_METIN?.deger).toBe('Otomatik metin ve sayfa genişletme kapalı');
    expect(t.OTOMATIK_METIN?.not).toMatch(/video üretebilir/);
    expect(k.assetAutomationSettings).toEqual([
      { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'GENERATE_IMAGE_EXTRACTION', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'GENERATE_IMAGE_ENHANCEMENT', assetAutomationStatus: 'OPTED_IN' },
    ]);
  });

  it('TEKLIF/NEREDE/TUR: tablo "En çok dönüşüm", "Bütün Google", Maks. Performans', () => {
    const t = tablo('SATIS', 'MAKS_PERFORMANS', null);
    expect(t.TEKLIF?.deger).toBe('En çok dönüşüm');
    expect(t.NEREDE?.deger).toMatch(/^Bütün Google/);
    expect(t.TUR?.deger).toMatch(/Maks\. Performans/);
  });

  it('beklenen geri okuma: kanal, teklif, varlık grubu, marka, otomasyon', () => {
    expect(d.beklenen).toMatchObject({
      kanal: 'PERFORMANCE_MAX',
      teklif: 'MAXIMIZE_CONVERSIONS',
      anahtarKelimeSayisi: null,
      negatifSayisi: null,
      konumSayisi: 1,
      varlikGrubu: {
        grupSayisi: 1,
        adresler: ['https://ornek.com.tr/urun'],
        marka: { BUSINESS_NAME: 1, LOGO: 1 },
        markaKurallari: true,
        otomasyon: {
          FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION: 'OPTED_OUT',
          TEXT_ASSET_AUTOMATION: 'OPTED_OUT',
          GENERATE_IMAGE_EXTRACTION: 'OPTED_OUT',
          GENERATE_IMAGE_ENHANCEMENT: 'OPTED_IN',
        },
      },
    });
  });

  it('YouTube videosu yoksa NOT (Google kendi videosunu üretebilir)', () => {
    const r = derleGoogle({ ...girdi('SATIS'), youtubeVideoId: null }, B);
    expect(r.tur === 'govde' && r.notlar.some((n) => /video/.test(n))).toBe(true);
    expect(r.tur === 'govde' && r.beklenen.varlikGrubu!.alanlar.YOUTUBE_VIDEO).toBe(0);
  });
});

describe('MAKS. PERFORMANS — yalnız satın almaya bağlı (g-1.4.0)', () => {
  const d = derle('SATIS');
  const ops = d.govde.mutateOperations;
  type Hedef = { update: { resourceName: string; biddable: boolean }; updateMask: string };
  const hedefOps = ops.filter((o) => o.campaignConversionGoalOperation).map((o) => o.campaignConversionGoalOperation as Hedef);

  it('KRİTİK: hesabın BÜTÜN hedefleri açıkça yazılır; yalnız PURCHASE~WEBSITE biddable', () => {
    expect(hedefOps.map((h) => [h.update.resourceName, h.update.biddable])).toEqual([
      [`customers/${MUSTERI}/campaignConversionGoals/-2~SUBMIT_LEAD_FORM~WEBSITE`, false],
      [`customers/${MUSTERI}/campaignConversionGoals/-2~PURCHASE~WEBSITE`, true],
      [`customers/${MUSTERI}/campaignConversionGoals/-2~PHONE_CALL_LEAD~CALL_FROM_ADS`, false],
      [`customers/${MUSTERI}/campaignConversionGoals/-2~CONTACT~WEBSITE`, false],
      [`customers/${MUSTERI}/campaignConversionGoals/-2~PURCHASE~GOOGLE_HOSTED`, false],
    ]);
  });

  it('KRİTİK: güncelleme (create DEĞİL), maskede "biddable"; kaynak adındaki kimlik bu istekteki KAMPANYANIN geçici kimliği', () => {
    expect(hedefOps.every((h) => h.updateMask === 'biddable' && !(h as unknown as { create?: unknown }).create)).toBe(true);
    const kampanyaKaynagi = kampanya(ops).resourceName as string;
    const kimlik = kampanyaKaynagi.slice(kampanyaKaynagi.lastIndexOf('/') + 1);
    expect(kimlik).toBe('-2');
    expect(hedefOps.every((h) => h.update.resourceName.split('/').at(-1)!.split('~')[0] === kimlik)).toBe(true);
    // Hedef işlemleri kampanyayı kuran işlemden SONRA (geçici kimlik çözülsün).
    const kIdx = ops.findIndex((o) => o.campaignOperation);
    expect(ops.findIndex((o) => o.campaignConversionGoalOperation)).toBeGreaterThan(kIdx);
  });

  it('beklenen geri okuma: teklife giren küme yalnız PURCHASE~WEBSITE', () => {
    expect(d.beklenen.teklifHedefleri).toEqual(['PURCHASE~WEBSITE']);
  });

  it('karar tablosu ve derleyici notu "yalnız satın almayı hedefler" diyor (eski "bütün birincil dönüşümler" sözü yok)', () => {
    const t = tablo('SATIS', 'MAKS_PERFORMANS', null);
    expect(t.TEKLIF?.not).toMatch(/^Google bu kampanyada yalnız satın almayı hedefler/);
    expect(d.notlar.join(' ')).toMatch(/yalnız satın almayı hedefler/);
    expect(d.notlar.join(' ')).not.toMatch(/bütün birincil/);
  });

  it('aynı hedef iki kez gelirse tek işlem; tanınmayan değer FIRLATIR; satın alma yoksa FIRLATIR', () => {
    expect(pmaxHedefIslemleri('1', '-2', [{ kategori: 'PURCHASE', kaynak: 'WEBSITE' }, { kategori: 'PURCHASE', kaynak: 'WEBSITE' }])).toHaveLength(1);
    expect(() => pmaxHedefIslemleri('1', '-2', [{ kategori: 'PURCHASE', kaynak: 'WEBSITE' }, { kategori: 'X~Y', kaynak: 'WEBSITE' }])).toThrow(/Tanınmayan/);
    expect(() => pmaxHedefIslemleri('1', '-2', [{ kategori: 'SUBMIT_LEAD_FORM', kaynak: 'WEBSITE' }])).toThrow(/satın alma hedefi yok/);
  });

  it('KRİTİK: hedefler okunamadıysa, satın alma hedefi yoksa ya da tanınmayan değer geldiyse RET (Google\'a gitmez)', () => {
    const kod = (hedefler: typeof HEDEFLER | null) => {
      const r = derleGoogle(girdi('SATIS', { hedefler }), B);
      return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
    };
    expect(kod(null)).toEqual(['G-HEDEF-OKUNAMADI']);
    expect(kod([{ kategori: 'SUBMIT_LEAD_FORM', kaynak: 'WEBSITE' }, { kategori: 'PURCHASE', kaynak: 'GOOGLE_HOSTED' }])).toEqual(['G-HEDEF-SATIS']);
    expect(kod([{ kategori: 'PURCHASE', kaynak: 'WEBSITE' }, { kategori: "PURCHASE' OR 1", kaynak: 'WEBSITE' }])).toEqual(['G-HEDEF-TANINMIYOR']);
    // Eski girdi (alan hiç yok) de okunamadı sayılır.
    const { donusumHedefleri: _yok, ...eski } = girdi('SATIS');
    const r = derleGoogle(eski, B);
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toEqual(['G-HEDEF-OKUNAMADI']);
  });

  it('türetme: hedefler yalnız Maks. Performans girdisine yazılır (diğer kurguların özeti değişmez)', () => {
    expect(girdi('SATIS').donusumHedefleri).toEqual(HEDEFLER);
    expect(girdi('ERISIM')).not.toHaveProperty('donusumHedefleri');
  });
});

describe('MAKS. PERFORMANS — logo ve video sınırları (Google belgesi)', () => {
  it('KRİTİK: logo kare değilse ya da 128 pikselden küçükse RET; ölçü bilinmiyorsa geçer (prova söyler)', () => {
    const kod = (logoOlcusu: GoogleDerlemeBaglami['logoOlcusu']) => {
      const r = derleGoogle(girdi('SATIS'), { ...B, logoOlcusu });
      return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
    };
    expect(kod({ genislik: 1200, yukseklik: 300 })).toEqual(['G-LOGO-KARE']);
    expect(kod({ genislik: 100, yukseklik: 100 })).toEqual(['G-LOGO-KARE']);
    expect(kod({ genislik: 128, yukseklik: 128 })).toEqual([]);
    expect(kod({ genislik: 1200, yukseklik: 1210 })).toEqual([]);
    expect(kod(null)).toEqual([]);
    expect(pmaxLogoKareMi({ genislik: null, yukseklik: 500 })).toBeNull();
  });

  it('KRİTİK: gövdede en çok 5 logo ve 15 YouTube videosu (fazlası Google\'a gitmez)', () => {
    expect([PMAX_EN_COK_LOGO, PMAX_EN_COK_VIDEO]).toEqual([5, 15]);
    const logo = { campaignAssetOperation: { create: { fieldType: 'LOGO' } } };
    const video = { assetGroupAssetOperation: { create: { fieldType: 'YOUTUBE_VIDEO' } } };
    expect(pmaxSinirSorunu(Array(5).fill(logo))).toBeNull();
    expect(pmaxSinirSorunu(Array(6).fill(logo))).toMatch(/en çok 5 logo/);
    expect(pmaxSinirSorunu(Array(15).fill(video))).toBeNull();
    expect(pmaxSinirSorunu(Array(16).fill(video))).toMatch(/en çok 15 YouTube/);
    expect(pmaxSinirSorunu(derle('SATIS').govde.mutateOperations)).toBeNull();
  });
});

describe('MAKS. PERFORMANS — sesli retler', () => {
  const kodlar = (g: GoogleDerlemeGirdisi, b: Partial<GoogleDerlemeBaglami> = {}) => {
    const r = derleGoogle(g, { ...B, ...b });
    return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
  };
  it('kare ya da yatay eksikse RET (ikisi de zorunlu)', () => {
    const a = rehber('SATIS', { medya: al([{ varlikId: YATAY }, { varlikId: DIK45 }]) });
    expect(kodlar(girdi('SATIS', { a }))).toEqual(['G-GORSEL-KARE']);
  });
  it('60 karakteri geçmeyen açıklama yoksa RET (SHORT_DESCRIPTION_REQUIRED)', () => {
    const g = girdi('SATIS');
    expect(kodlar({ ...g, aciklamalar: ['a'.repeat(70), 'b'.repeat(80)] })).toEqual(['G-KISA-ACIKLAMA']);
  });
  it('tıklama teklifiyle gelen girdi RET (Google kabul etmez), yaş > 18 RET', () => {
    expect(kodlar({ ...girdi('SATIS'), teklif: 'MAKS_TIKLAMA' })).toEqual(['G-DONUSUM']);
    expect(kodlar({ ...girdi('SATIS'), enDusukYas: 21 })).toEqual(['G-PMAX-YAS']);
  });
  it('2’den az başlık / açıklama RET', () => {
    const g = girdi('SATIS');
    expect(kodlar({ ...g, basliklar: ['A', 'B'] })).toEqual(['G-BASLIK-SAYI']);
    expect(kodlar({ ...g, aciklamalar: ['Kısa.'] })).toEqual(['G-ACIKLAMA-SAYI']);
  });
});

// ===========================================================================
// Eksik listesinin Google bulguları (giriş anında, saf)
// ===========================================================================

describe('googleGorselBulgulari / googleMetinBulgulari', () => {
  const medya = [{ varlikId: YATAY }, { varlikId: KARE }, { varlikId: DIKEY }, { varlikId: VIDEO, kapakVarlikId: U(16) }];
  const olculer = new Map<string, GorselOlcusu | null>([
    [YATAY, olcu(1200, 628)],
    [KARE, olcu(1200, 1200)],
  ]);

  it('9:16 ve video UYARI (engel değil; Meta için gerekli olabilirler), sorunsuz set engelsiz', () => {
    const b = googleGorselBulgulari('MAKS_PERFORMANS', medya, ORANLAR, olculer);
    expect(b.filter((x) => x.seviye === 'engel')).toEqual([]);
    expect(b.map((x) => x.kod).sort()).toEqual(['G-GORSEL-DIKEY', 'G-VIDEO-GITMEZ']);
  });

  it('ölçü verilirse Google’ın ±%1’i GİRİŞ ANINDA engel; verilmezse ölçü kontrolü koşmaz', () => {
    const kotu = new Map(olculer);
    kotu.set(YATAY, olcu(1200, 640));
    expect(googleGorselBulgulari('TALEP_YARATMA_GORSEL', medya, ORANLAR, kotu).map((x) => x.kod)).toContain('G-GORSEL-OLCU');
    expect(googleGorselBulgulari('TALEP_YARATMA_GORSEL', medya, ORANLAR, null).map((x) => x.kod)).not.toContain('G-GORSEL-OLCU');
  });

  it('Maks. Performans yatay ve kare ister; Talep Yaratma ikisinden birini', () => {
    const yalnizKare = [{ varlikId: KARE }];
    expect(googleGorselBulgulari('MAKS_PERFORMANS', yalnizKare, ORANLAR, null).map((x) => x.kod)).toEqual(['G-GORSEL-YATAY']);
    expect(googleGorselBulgulari('TALEP_YARATMA_GORSEL', yalnizKare, ORANLAR, null)).toEqual([]);
  });

  it('metin: Maks. Performans 3 başlık, uzun başlık, 2 açıklama ve bir kısa açıklama ister', () => {
    expect(googleMetinBulgulari('MAKS_PERFORMANS', { anaMetin: 'Kısa ana metin.', basliklar: ['A', 'B', 'C'], aciklamalar: ['Kısa bir.', 'Kısa iki.'] })).toEqual([]);
    expect(googleMetinBulgulari('MAKS_PERFORMANS', { anaMetin: 'x'.repeat(95), basliklar: ['A'], aciklamalar: ['a', 'b'] }).map((x) => x.kod)).toEqual(['G-BASLIK-SAYI', 'G-UZUN-BASLIK']);
    expect(googleMetinBulgulari('MAKS_PERFORMANS', { anaMetin: 'Ana.', basliklar: ['A', 'B', 'C'], aciklamalar: ['a'.repeat(70), 'b'.repeat(70)] }).map((x) => x.kod)).toEqual(['G-KISA-ACIKLAMA']);
    expect(googleMetinBulgulari('TALEP_YARATMA_GORSEL', { anaMetin: '', basliklar: ['A'], aciklamalar: [] }).map((x) => x.kod)).toEqual(['G-ACIKLAMA-SAYI']);
  });

  it('pmaxUzunBaslik: ana metin açıklamayla aynıysa ana metin seçilmez (aynı metin iki alana bağlanmasın)', () => {
    expect(pmaxUzunBaslik('Aynı.', ['Aynı.', 'İki.'])).toBeNull();
  });
});
