import { describe, expect, it } from 'vitest';
import { BUTCE_ADIMI_EN_FAZLA, YORGUNLUK } from '@advetics/shared';
import {
  adimSinirIcinde,
  butceOnerisi,
  gunEkle,
  isoHafta,
  oneriOzeti,
  pencereler,
  yorgunlukOnerisi,
  type ButceBaglami,
  type ButceGirdisi,
  type YorgunlukGirdisi,
} from './oneri-hesap';

/**
 * ÖNERİ ÜRETİCİ — SINIR DEĞERLERİ.
 *
 * Eşik hataları SESSİZ: yanlış bir `>`/`>=` ya her reklamı yorgun ilan eder
 * ya hiçbirini; bütçe adımının %20'yi bir kuruş aşması para harcayan bir
 * değişiklik. Her eşik TAM sınırında ve bir adım ötesinde sınanıyor.
 */

const BUGUN = '2026-10-09';
const P = pencereler(BUGUN);
const M = 1_000_000n;

describe('pencereler ve hafta', () => {
  it('bugün DIŞARIDA, iki bitişik 7 günlük pencere', () => {
    expect(P).toEqual({ buSon: '2026-10-08', buBas: '2026-10-02', gecenSon: '2026-10-01', gecenBas: '2026-09-25' });
  });
  it('ISO hafta: yıl sınırı ve perşembe kuralı', () => {
    expect(isoHafta('2026-10-09')).toBe('2026-W41');
    expect(isoHafta('2026-01-01')).toBe('2026-W01'); // perşembe
    expect(isoHafta('2027-01-01')).toBe('2026-W53'); // cuma, önceki yılın haftası
    expect(isoHafta('2024-12-30')).toBe('2025-W01'); // pazartesi, sonraki yılın haftası
  });
});

// ─── Yorgunluk ────────────────────────────────────────────────────────────

/** Haftalık toplamı yedi güne EŞİT dağıtır (kalan ilk güne). */
function hafta(bas: string, t: { g: number; t: number; e: number }) {
  return Array.from({ length: 7 }, (_, i) => {
    const pay = (x: number) => Math.floor(x / 7) + (i === 0 ? x % 7 : 0);
    return { gun: gunEkle(bas, i), gosterim: pay(t.g), tiklama: pay(t.t), erisim: pay(t.e), harcamaMikros: 10n * M };
  });
}

function reklam(gecen: { g: number; t: number; e: number }, bu: { g: number; t: number; e: number }, ek: Partial<YorgunlukGirdisi> = {}): YorgunlukGirdisi {
  return {
    clientId: 'c',
    clientAdi: 'W',
    adId: '11111111-1111-1111-1111-111111111111',
    adAdi: 'Reklam A',
    setAdi: 'Set',
    platform: 'meta',
    paraBirimi: 'TRY',
    setteYayindaki: 3,
    gunler: [...hafta(P.gecenBas, gecen), ...hafta(P.buBas, bu)],
    ...ek,
  };
}

const GECEN = { g: 7000, t: 700, e: 5600 }; // CTR %10, sıklık 1,25

describe('kreatif yorgunluğu', () => {
  it('KRİTİK: oran TAM 0,7 → öneri (sınır dâhil)', () => {
    const o = yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 4900 }), BUGUN);
    expect(o).not.toBeNull();
    expect(o!.eylem).toEqual({ tur: 'durdur' });
    expect(o!.varlik.seviye).toBe('ad');
    expect(o!.anahtar).toBe('kreatif_yorgunlugu:ad:11111111-1111-1111-1111-111111111111:2026-W41');
  });

  it('KRİTİK: oran 0,71 → öneri YOK', () => {
    expect(yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 497, e: 4900 }), BUGUN)).toBeNull();
  });

  it(`KRİTİK: bir haftada ${YORGUNLUK.enAzGosterim - 1} gösterim → öneri YOK`, () => {
    expect(yorgunlukOnerisi(reklam(GECEN, { g: YORGUNLUK.enAzGosterim - 1, t: 10, e: 500 }), BUGUN)).toBeNull();
    expect(yorgunlukOnerisi(reklam({ g: 999, t: 100, e: 800 }, { g: 7000, t: 100, e: 4900 }), BUGUN)).toBeNull();
  });

  it(`tam ${YORGUNLUK.enAzGosterim} gösterim yetiyor`, () => {
    const gecen = { g: 1000, t: 100, e: 900 };
    expect(yorgunlukOnerisi(reklam(gecen, { g: 1000, t: 70, e: 700 }), BUGUN)).not.toBeNull();
  });

  it('KRİTİK: sıklık ARTMADIYSA (eşit) öneri YOK', () => {
    // CTR düştü ama aynı kişilere daha sık gösterilmiyor: yorgunluk değil.
    expect(yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 5600 }), BUGUN)).toBeNull();
  });

  it('erişim yoksa sıklık bilinmiyor → öneri YOK (tahmin yok)', () => {
    expect(yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 0 }), BUGUN)).toBeNull();
  });

  it('Google ve LinkedIn için yorgunluk üretilmiyor (v1 yalnız Meta)', () => {
    expect(yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 4900 }, { platform: 'google' }), BUGUN)).toBeNull();
  });

  it('settin TEK yayındaki reklamıysa neden uyarıyor', () => {
    const o = yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 4900 }, { setteYayindaki: 1 }), BUGUN)!;
    expect(o.neden).toMatch(/tek yayındaki reklam/);
    expect(o.neden).toMatch(/AdvCampaign/);
    const cok = yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 4900 }), BUGUN)!;
    expect(cok.neden).not.toMatch(/tek yayındaki/);
  });

  it('kart "günlük sıklık" diyor, "haftalık" UYDURMUYOR', () => {
    const o = yorgunlukOnerisi(reklam(GECEN, { g: 7000, t: 490, e: 4900 }), BUGUN)!;
    expect(o.kanitlar.map((k) => k.etiket)).toContain('Günlük sıklık');
    expect(JSON.stringify(o)).not.toMatch(/[Hh]aftalık sıklık/);
    expect(o.seri!.a).toHaveLength(14);
  });
});

// ─── Bütçe ────────────────────────────────────────────────────────────────

const BUTCE = 100n * M; // günlük 100 TRY

function varlik(gunluk: Array<{ s: bigint; v: number }>, ek: Partial<ButceGirdisi> = {}): ButceGirdisi {
  return {
    clientId: 'c',
    clientAdi: 'W',
    seviye: 'campaign',
    id: '22222222-2222-2222-2222-222222222222',
    ad: 'Kampanya',
    ustAd: null,
    platform: 'meta',
    adAccountId: 'h',
    paraBirimi: 'TRY',
    gunlukButceMikros: BUTCE,
    gunler: gunluk.map((g, i) => ({ gun: gunEkle(P.buBas, i), harcamaMikros: g.s, donusum: g.v })),
    ilkVeriGunu: '2026-09-15',
    paylasimliButce: false,
    ...ek,
  };
}

/**
 * Yedi gün aynı harcama; dönüşümlerin TOPLAMI ilk günde (kesirli günlük
 * dönüşümü toplamak 4,999… üretip sınır testini yanıltırdı).
 */
const yedi = (s: bigint, v: number) => Array.from({ length: 7 }, (_, i) => ({ s, v: i === 0 ? v : 0 }));

const BAGLAM = (ek: Partial<ButceBaglami> = {}): ButceBaglami => ({
  bugun: BUGUN,
  ortalamaCpa: new Map([['TRY', 100n * M]]),
  kapilar: [],
  ...ek,
});

describe('bütçe artır', () => {
  // 90 TRY × 7 = 630 → kullanım tam %90; 9 dönüşüm → CPA 70 = ortalamanın tam %70'i.
  const SINIR = () => varlik(yedi(90n * M, 9));

  it('KRİTİK: kullanım %90 VE CPA ortalamanın %70\'i (iki sınır birden) → öneri', () => {
    const o = butceOnerisi(SINIR(), BAGLAM());
    expect(o?.tur).toBe('butce_artir');
    expect(o!.eylem).toEqual({
      tur: 'butce',
      butceSeviyesi: 'campaign',
      butceTipi: 'daily',
      oncekiMikros: (100n * M).toString(),
      yeniMikros: (120n * M).toString(),
    });
  });

  it('KRİTİK: kullanım %90\'ın bir kuruş altı → öneri YOK', () => {
    const g = varlik([...yedi(90n * M, 9).slice(0, 6), { s: 90n * M - 10_000n, v: 0 }]);
    expect(butceOnerisi(g, BAGLAM())?.tur).not.toBe('butce_artir');
  });

  it('KRİTİK: CPA ortalamanın %70\'inin üstünde → öneri YOK', () => {
    expect(butceOnerisi(SINIR(), BAGLAM({ ortalamaCpa: new Map([['TRY', 100n * M - 1n]]) }))).toBeNull();
  });

  it(`en az ${5} dönüşüm şart`, () => {
    // 5 dönüşüm: geçer; 4: geçmez (CPA yine iyi).
    expect(butceOnerisi(varlik(yedi(95n * M, 5)), BAGLAM({ ortalamaCpa: new Map([['TRY', 1000n * M]]) }))?.tur).toBe('butce_artir');
    expect(butceOnerisi(varlik(yedi(95n * M, 4)), BAGLAM({ ortalamaCpa: new Map([['TRY', 1000n * M]]) }))).toBeNull();
  });

  it(`KRİTİK: adım en fazla %${BUTCE_ADIMI_EN_FAZLA * 100} ve tam birime AŞAĞI yuvarlanıyor`, () => {
    // 99,99 × 1,2 = 119,988 → 119 (yukarı yuvarlamak sınırı aşardı).
    const o = butceOnerisi(varlik(yedi(95n * M, 10), { gunlukButceMikros: 99_990_000n }), BAGLAM({ ortalamaCpa: new Map([['TRY', 1000n * M]]) }))!;
    const e = o.eylem as { yeniMikros: string; oncekiMikros: string };
    expect(e.yeniMikros).toBe((119n * M).toString());
    expect(adimSinirIcinde(BigInt(e.oncekiMikros), BigInt(e.yeniMikros))).toBe(true);
  });

  it('KRİTİK: aylık bütçeye TAM sığıyorsa öneri, bir kuruş taşıyorsa YOK', () => {
    // fark 20 TRY/gün × 5 gün = 100 TRY; tahmin 2.900 → 3.000.
    const kapi = { etiket: 'Hesap', projeksiyonMikros: 2900n * M, kalanGun: 5 };
    expect(butceOnerisi(SINIR(), BAGLAM({ kapilar: [{ ...kapi, butceMikros: 3000n * M }] }))?.tur).toBe('butce_artir');
    expect(butceOnerisi(SINIR(), BAGLAM({ kapilar: [{ ...kapi, butceMikros: 3000n * M - 1n }] }))).toBeNull();
  });

  it('KRİTİK: aylık bütçe OKUNAMADIYSA artırma önerisi YOK', () => {
    expect(butceOnerisi(SINIR(), BAGLAM({ kapilar: undefined }))).toBeNull();
  });

  it('3 gündür yayında olan varlık için öneri yok (pencere dolmadı)', () => {
    expect(butceOnerisi(varlik(yedi(95n * M, 10), { ilkVeriGunu: '2026-10-05' }), BAGLAM({ ortalamaCpa: new Map([['TRY', 1000n * M]]) }))).toBeNull();
  });

  it('KRİTİK: paylaşımlı Google bütçesi → yalnız bilgi, EYLEM YOK', () => {
    const o = butceOnerisi(varlik(yedi(90n * M, 9), { platform: 'google', paylasimliButce: true }), BAGLAM());
    expect(o).not.toBeNull();
    expect(o!.eylem).toBeNull();
    expect(o!.kisit).toMatch(/paylaşılıyor/);
  });
});

describe('bütçe azalt', () => {
  it('KRİTİK: kullanım %30 (sınır) → öneri YOK; altı → öneri', () => {
    expect(butceOnerisi(varlik(yedi(30n * M, 0)), BAGLAM())).toBeNull();
    expect(butceOnerisi(varlik(yedi(30n * M - 10_000n, 0)), BAGLAM())?.tur).toBe('butce_azalt');
  });

  it('KRİTİK: düşüş en fazla %20 — en yüksek gün ×1,2 daha düşükse taban %80', () => {
    const o = butceOnerisi(varlik(yedi(10n * M, 0)), BAGLAM())!;
    expect((o.eylem as { yeniMikros: string }).yeniMikros).toBe((80n * M).toString());
  });

  it('en yüksek gün ×1,2 tabandan yüksekse o, tam birime YUKARI yuvarlanmış', () => {
    // en yüksek 70,5 → 84,6 → 85; toplam 70,5 + 6×1 = 76,5 → kullanım %10,9.
    const o = butceOnerisi(varlik([{ s: 70_500_000n, v: 0 }, ...Array.from({ length: 6 }, () => ({ s: M, v: 0 }))]), BAGLAM())!;
    expect((o.eylem as { yeniMikros: string }).yeniMikros).toBe((85n * M).toString());
  });

  it('hiç harcamayan varlıkta bütçe kısılmıyor (teslim sorunu, bütçe değil)', () => {
    expect(butceOnerisi(varlik(yedi(0n, 0)), BAGLAM())).toBeNull();
  });
});

describe('adım sınırı ve özet', () => {
  it('KRİTİK: %20 dâhil, bir mikro fazlası değil — iki yönde', () => {
    expect(adimSinirIcinde(100n * M, 120n * M)).toBe(true);
    expect(adimSinirIcinde(100n * M, 120n * M + 1n)).toBe(false);
    expect(adimSinirIcinde(100n * M, 80n * M)).toBe(true);
    expect(adimSinirIcinde(100n * M, 80n * M - 1n)).toBe(false);
    expect(adimSinirIcinde(0n, 1n)).toBe(false);
  });

  it('KRİTİK: önceki bütçe değişince özet DEĞİŞİYOR (bayat kart uygulanmasın)', () => {
    const hedef = { platform: 'meta' as const, seviye: 'campaign' as const, id: 'x' };
    const a = oneriOzeti({ tur: 'butce', butceSeviyesi: 'campaign', butceTipi: 'daily', oncekiMikros: '100', yeniMikros: '120' }, hedef);
    const b = oneriOzeti({ tur: 'butce', butceSeviyesi: 'campaign', butceTipi: 'daily', oncekiMikros: '101', yeniMikros: '120' }, hedef);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(oneriOzeti({ tur: 'durdur' }, hedef)).toBe(oneriOzeti({ tur: 'durdur' }, { ...hedef }));
  });
});
