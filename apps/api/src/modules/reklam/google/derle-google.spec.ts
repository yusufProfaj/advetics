import { describe, expect, it } from 'vitest';
import {
  GOOGLE_TURKCE,
  TABAN_NEGATIFLER,
  kararTablosu,
  rehberdenGoogle,
  type GoogleDerlemeGirdisi,
  type GoogleTeklif,
  type RehberAlanlari,
  type RehberAmacKodu,
} from '@advetics/shared';
import { derleGoogle, googleYasKovalari, GOOGLE_ATIF, type GoogleDerlemeBaglami } from './derle-google';

/**
 * KARAR TABLOSU SÖZÜNÜ GÖVDE TUTUYOR MU (MIMARI-REHBER § 4, kararlar.ts).
 *
 * Ekran "Görüntülü Reklam Ağı kapalı" deyip gövde `targetContentNetwork:
 * true` gönderirse ekran yalan söyler — bu depoda en pahalı hata türü. Her
 * test kararTablosu'nun BİR satırını derlenmiş gövdedeki alanla eşliyor;
 * tablo yeni bir satır kazanırsa son test düşer (eşlenmemiş söz kalmasın).
 */

const TL = (n: number) => BigInt(n) * 1_000_000n;
const Z = '2026-10-10T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' = 'kullanici') => ({ deger, kaynak, kim: KIM, zaman: Z });

function rehber(amac: RehberAmacKodu): RehberAlanlari {
  return {
    amac: al(amac),
    platformlar: al({ meta: true, google: true }, 'derleyici'),
    googleHesabiId: al(U(2), 'workspace_profili'),
    youtubeKanaliId: al(U(5), 'workspace_profili'),
    konumlar: al(
      [{ tur: 'city' as const, key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }],
      'marka_merkezi',
    ),
    ekKategoriler: al([]),
    hedefAdres: al('https://gardenvillaskusadasi.com/', 'marka_merkezi'),
    youtubeVideo: al({ videoId: 'dQw4w9WgXcQ', baslik: 'Tanıtım' }),
    metin: al({
      anaMetin: 'Denize 5 dakika.',
      basliklar: ['Özel Havuzlu Villalar', 'Kuşadası Garden Villas', 'Denize 5 Dakika Yürüme'],
      aciklamalar: ['3+1 bahçeli villalar, site içinde havuz.', 'Taksit seçenekleriyle teslime hazır villalar.'],
    }),
    anahtarKelimeler: al([
      { metin: 'kuşadası satılık villa', aylikArama: 2900 },
      { metin: 'havuzlu villa kuşadası', aylikArama: 880 },
    ]),
    butce: al({ tip: 'gunluk' as const, micros: TL(500).toString() }),
    metaPayiYuzde: al(50, 'derleyici'),
    takvim: al({ baslangic: '2026-10-11', bitis: '2026-11-09' }),
  };
}

function girdi(amac: RehberAmacKodu, donusumEtkin: boolean | null = false): GoogleDerlemeGirdisi {
  const r = rehberdenGoogle(rehber(amac), {
    musteriId: '123-456-7890',
    paraBirimi: 'TRY',
    saatDilimi: 'Europe/Istanbul',
    donusumEtkin,
    isletmeAdi: 'Garden Villas',
    logoVarlikId: U(9),
    kategoriTabani: [],
  });
  if (r.tur !== 'tamam') throw new Error(`türetme reddetti: ${r.kodlar.join(',')}`);
  return r.deger;
}

const B: GoogleDerlemeBaglami = {
  kimlik: 'abcdef12-0000-4000-8000-000000000000',
  workspaceKisaAdi: 'Ege Birlik',
  amacEkranAdi: 'Siteme gelsinler',
  simdi: new Date('2026-10-10T09:00:00+03:00'),
  validateOnly: true,
  logo: { resource: 'customers/1234567890/assets/77' },
  youtubeVideoBasligi: 'Tanıtım',
};

function derle(amac: RehberAmacKodu, donusum: boolean | null = false, b: Partial<GoogleDerlemeBaglami> = {}) {
  const d = derleGoogle(girdi(amac, donusum), { ...B, ...b });
  if (d.tur !== 'govde') throw new Error(`derleme reddetti: ${JSON.stringify(d.retler)}`);
  return d;
}

type Op = Record<string, { create?: Record<string, unknown> } | undefined>;
const islemler = (ops: Array<Record<string, unknown>>, tur: string) =>
  (ops as Op[]).map((o) => o[tur]?.create).filter((c): c is Record<string, unknown> => !!c);
const kampanya = (ops: Array<Record<string, unknown>>) => islemler(ops, 'campaignOperation')[0]!;
const google = (amac: RehberAmacKodu, teklif: GoogleTeklif) =>
  Object.fromEntries(kararTablosu(amac, { meta: false, google: true }, teklif).map((s) => [s.kod, s.google]));

describe('ARAMA (Siteme gelsinler) — karar tablosu ile gövde', () => {
  it('TUR: "Arama kampanyası" ↔ advertisingChannelType SEARCH', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').TUR?.deger).toMatch(/Arama kampanyası/);
    expect(kampanya(derle('SITE').govde.mutateOperations).advertisingChannelType).toBe('SEARCH');
  });

  it('TEKLIF: ölçüm yokken "En çok tıklama" ↔ targetSpend, başka strateji YOK', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').TEKLIF?.deger).toBe('En çok tıklama');
    const d = derle('SITE', false);
    const k = kampanya(d.govde.mutateOperations);
    expect(k.targetSpend).toEqual({});
    expect(k.maximizeConversions).toBeUndefined();
    expect(k.manualCpc).toBeUndefined();
    // Otomatik teklifte grup teklifi gönderilmiyor (hesap varsayılanına bırakılmıyor, yok sayılıyor).
    expect(islemler(d.govde.mutateOperations, 'adGroupOperation')[0]!.cpcBidMicros).toBeUndefined();
  });

  it('TEKLIF: ölçüm etkinken "En çok dönüşüm" ↔ maximizeConversions', () => {
    expect(google('SITE', 'MAKS_DONUSUM').TEKLIF?.deger).toBe('En çok dönüşüm');
    const k = kampanya(derle('SITE', true).govde.mutateOperations);
    expect(k.maximizeConversions).toEqual({});
    expect(k.targetSpend).toBeUndefined();
  });

  it('TEKLIF: ölçüm BİLİNMİYORSA (null) tıklama — dönüşüm teklifi öğrenemez', () => {
    expect(kampanya(derle('SITE', null).govde.mutateOperations).targetSpend).toEqual({});
  });

  it('NEREDE: "Yalnız Google Arama" ↔ dört ağ bayrağı açıkça', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').NEREDE?.deger).toBe('Yalnız Google Arama');
    expect(kampanya(derle('SITE').govde.mutateOperations).networkSettings).toEqual({
      targetGoogleSearch: true,
      targetSearchNetwork: false,
      targetContentNetwork: false,
      targetPartnerSearchNetwork: false,
    });
  });

  it('KONUM: "Yalnız bu bölgede bulunanlar" ↔ PRESENCE + kampanya konum ölçütü', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').KONUM?.deger).toBe('Yalnız bu bölgede bulunanlar');
    const d = derle('SITE');
    expect(kampanya(d.govde.mutateOperations).geoTargetTypeSetting).toEqual({ positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' });
    const konumlar = islemler(d.govde.mutateOperations, 'campaignCriterionOperation').filter((c) => c.location);
    expect(konumlar.map((c) => (c.location as { geoTargetConstant: string }).geoTargetConstant)).toEqual(['geoTargetConstants/1012782']);
  });

  it('OTOMATIK_METIN: "AI Max ve otomatik metin kapalı" ↔ AI Max + metin özelleştirme + URL genişletme kapalı', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').OTOMATIK_METIN?.deger).toBe('AI Max ve otomatik metin kapalı');
    const k = kampanya(derle('SITE').govde.mutateOperations);
    expect(k.aiMaxSetting).toEqual({ enableAiMax: false });
    expect(k.assetAutomationSettings).toEqual([
      { assetAutomationType: 'TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
      { assetAutomationType: 'FINAL_URL_EXPANSION_TEXT_ASSET_AUTOMATION', assetAutomationStatus: 'OPTED_OUT' },
    ]);
  });

  it('SAYFA: Google hücresi yok (Facebook sayfası Meta’ya ait)', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').SAYFA).toBeNull();
  });

  it('OLCUM: "Google’ın saydığı" ↔ yayının atıf standardı platform', () => {
    expect(google('SITE', 'MAKS_TIKLAMA').OLCUM?.deger).toBe("Google'ın saydığı");
    expect(derle('SITE').atif).toBe(GOOGLE_ATIF);
    expect(GOOGLE_ATIF).toBe('platform');
  });

  it('karar tablosunun BÜTÜN Google satırları yukarıda eşlendi', () => {
    const eslenen = ['TUR', 'TEKLIF', 'NEREDE', 'KONUM', 'OTOMATIK_METIN', 'SAYFA', 'OLCUM'];
    expect(kararTablosu('SITE', { meta: true, google: true }, 'MAKS_TIKLAMA').map((s) => s.kod)).toEqual(eslenen);
  });
});

describe('ARAMA — tablonun söylemediği ama gövdenin tutması gereken kurallar', () => {
  const d = derle('SITE');
  const ops = d.govde.mutateOperations;

  it('kısmi başarı KAPALI, prova validateOnly, kampanya DURAKLATILMIŞ, reklam AÇIK (karar kampanyada)', () => {
    expect(d.govde.partialFailure).toBe(false);
    expect(d.govde.validateOnly).toBe(true);
    expect(derle('SITE', false, { validateOnly: false }).govde.validateOnly).toBe(false);
    expect(kampanya(ops).status).toBe('PAUSED');
    expect(islemler(ops, 'adGroupAdOperation')[0]!.status).toBe('ENABLED');
  });

  it('dil Türkçe (1037) ve TABAN NEGATİFLER kampanya düzeyinde', () => {
    const kriter = islemler(ops, 'campaignCriterionOperation');
    expect(kriter.filter((c) => c.language).map((c) => (c.language as { languageConstant: string }).languageConstant)).toEqual([GOOGLE_TURKCE]);
    expect(GOOGLE_TURKCE).toBe('languageConstants/1037');
    const neg = kriter.filter((c) => c.negative === true).map((c) => (c.keyword as { text: string }).text);
    expect(neg).toEqual([...TABAN_NEGATIFLER]);
  });

  it('anahtar kelimeler ÖBEK eşleme; reklam RSA, başlık/açıklama metni değişmeden', () => {
    const kw = islemler(ops, 'adGroupCriterionOperation').map((c) => c.keyword);
    expect(kw).toEqual([
      { text: 'kuşadası satılık villa', matchType: 'PHRASE' },
      { text: 'havuzlu villa kuşadası', matchType: 'PHRASE' },
    ]);
    const rsa = (islemler(ops, 'adGroupAdOperation')[0]!.ad as { responsiveSearchAd: { headlines: Array<{ text: string }> }; finalUrls: string[] });
    expect(rsa.responsiveSearchAd.headlines.map((h) => h.text)).toEqual(['Özel Havuzlu Villalar', 'Kuşadası Garden Villas', 'Denize 5 Dakika Yürüme']);
    expect(rsa.finalUrls).toEqual(['https://gardenvillaskusadasi.com/']);
  });

  it('bütçe Google payı (500 ₺ × %50 = 250 ₺), açık paylaşımsız; geçici kimlik sırası çözülebilir', () => {
    const butce = islemler(ops, 'campaignBudgetOperation')[0]!;
    expect(butce.amountMicros).toBe(TL(250).toString());
    expect(butce.explicitlyShared).toBe(false);
    // Kampanya bütçeden, grup kampanyadan SONRA gelmeli (geçici kimlik).
    expect(d.sira.kampanya).toBeGreaterThan(0);
    expect(d.sira.reklamGrubu).toBeGreaterThan(d.sira.kampanya);
    expect(d.sira.reklam).toBe(ops.length - 1);
  });

  it('bugün başlayan rehberde tarih GÖNDERİLMİYOR, ileri tarihte gönderiliyor; geçmiş tarih ret', () => {
    expect(kampanya(ops).startDateTime).toBe('2026-10-11 00:00:00');
    expect(kampanya(ops).endDateTime).toBe('2026-11-09 23:59:59');
    const bugun = derle('SITE', false, { simdi: new Date('2026-10-11T08:00:00+03:00') });
    expect(kampanya(bugun.govde.mutateOperations).startDateTime).toBeUndefined();
    const gec = derleGoogle(girdi('SITE'), { ...B, simdi: new Date('2026-10-12T08:00:00+03:00') });
    expect(gec.tur === 'ret' && gec.retler.map((r) => r.kod)).toContain('TKV-GECMIS');
  });

  it('beklenen geri okuma derlenmiş gövdeden: ad, bütçe, kelime/negatif/konum sayısı', () => {
    expect(d.beklenen).toMatchObject({
      kanal: 'SEARCH',
      durum: 'PAUSED',
      gunlukButceMicros: TL(250).toString(),
      konumSayisi: 1,
      anahtarKelimeSayisi: 2,
      negatifSayisi: TABAN_NEGATIFLER.length,
    });
    expect(d.beklenen.kampanyaAdi).toBe(kampanya(ops).name);
    expect(d.beklenen.kampanyaAdi).toContain('adv-abcdef12');
  });

  it('FORM (form uzantısı) Dalga 2: sessizce site reklamı KURULMAZ, açık ret', () => {
    const r = derleGoogle({ ...girdi('SITE'), ulasma: 'form' }, B);
    expect(r.tur).toBe('ret');
    expect(r.tur === 'ret' && r.retler[0]!.kod).toBe('G-KURGU-KAPALI');
  });
});

describe('TALEP YARATMA (Videom izlensin)', () => {
  const d = derle('VIDEO');
  const ops = d.govde.mutateOperations;

  it('TUR ↔ DEMAND_GEN; DURAKLATILMIŞ kurulur (aç kararı geri okumadan sonra)', () => {
    expect(google('VIDEO', 'MAKS_TIKLAMA').TUR?.deger).toMatch(/Talep Yaratma/);
    expect(kampanya(ops).advertisingChannelType).toBe('DEMAND_GEN');
    expect(kampanya(ops).status).toBe('PAUSED');
    expect(d.govde.partialFailure).toBe(false);
  });

  it('NEREDE: "YouTube" ↔ yalnız YouTube kanalları; Discover, Gmail, Görüntülü KAPALI', () => {
    expect(google('VIDEO', 'MAKS_TIKLAMA').NEREDE?.deger).toBe('YouTube');
    const grup = islemler(ops, 'adGroupOperation')[0]!;
    expect((grup.demandGenAdGroupSettings as { channelControls: { selectedChannels: unknown } }).channelControls.selectedChannels).toEqual({
      youtubeInStream: true,
      youtubeInFeed: true,
      youtubeShorts: true,
      discover: false,
      gmail: false,
      display: false,
    });
  });

  it('KONUM ↔ PRESENCE açıkça + konum REKLAM GRUBUNDA (upgradedTargeting)', () => {
    expect(google('VIDEO', 'MAKS_TIKLAMA').KONUM?.deger).toBe('Yalnız bu bölgede bulunanlar');
    expect(kampanya(ops).geoTargetTypeSetting).toEqual({ positiveGeoTargetType: 'PRESENCE', negativeGeoTargetType: 'PRESENCE' });
    expect(kampanya(ops).demandGenCampaignSettings).toEqual({ upgradedTargeting: true });
    expect(islemler(ops, 'adGroupCriterionOperation').filter((c) => c.location)).toHaveLength(1);
    expect(islemler(ops, 'campaignCriterionOperation')).toHaveLength(0);
  });

  it('TEKLIF ölçümsüz: targetSpend', () => {
    expect(kampanya(ops).targetSpend).toEqual({});
  });

  it('logo yoksa ret (Google zorunlu tutuyor) — sessizce logosuz kurulmaz', () => {
    const r = derleGoogle(girdi('VIDEO'), { ...B, logo: null });
    expect(r.tur === 'ret' && r.retler.map((x) => x.kod)).toContain('G-LOGO');
  });
});

describe('yaş kovaları — tahmin etmektense kısıtla', () => {
  it('18: kısıt yok; 21: 25’ten başlar ve NOT düşer; 25: not yok', () => {
    expect(googleYasKovalari(18)).toEqual({ kovalar: [], not: null });
    const y21 = googleYasKovalari(21);
    expect(y21.kovalar[0]).toBe('AGE_RANGE_25_34');
    expect(y21.not).toMatch(/25/);
    expect(googleYasKovalari(25).not).toBeNull();
  });
});
