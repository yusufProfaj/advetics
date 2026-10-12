import { describe, expect, it } from 'vitest';
import {
  BANNER_SETI_NIYETLERI,
  META_GERI_ARAMA_CUMLESI,
  META_SAAT_CUMLESI,
  GOOGLE_ARAMA_OLCUM_CUMLESI,
  TELEFON_BANNER_CUMLESI,
  TELEFON_CIHAZLARI,
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  kararTablosu,
  niyetYerlesimKisiti,
  rehberEksikleri,
  rehberYerlesimPlani,
  setlereAyir,
  telefonUlkesiDisindakiKonumlar,
  type DerlemeGirdisi,
  type GorselOrani,
  type Kavram,
  type MetaGovdesi,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';

/**
 * ═══ "BENİ TELEFONLA ARASINLAR" — META TARAFI (yönetici kararları, 2026-10-12) ═══
 *
 * Bu dosya dört sözü gövdeyle eşliyor:
 * 1. Arama reklamı YALNIZ telefonda (`device_platforms: ['mobile']`) ve DAR
 *    elle yerleşimde: dört boyut tamken ve video fikrinde de. Masaüstüne
 *    arama reklamı = kimseyi aratmayan gösterim, hata yok.
 * 2. Banner seti yok (ölçülene kadar her görsel ayrı reklam).
 * 3. Geri arama isteğini kapatan alan belgede yok: gövdede uydurulmuş bir
 *    alan GİTMİYOR ve karar tablosu bunu söylüyor.
 * 4. +90 numarada Türkiye dışı konum: giriş anında engel, derleyicide ret.
 */

const H = { dikey: 'h-dikey', dik45: 'h-dik45', kare: 'h-kare', yatay: 'h-yatay' } as const;
const TEL = '+905323456789';

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-12',
  workspaceKisaAdi: 'Ege',
  niyet: 'TELEFON',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'country', key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 250_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-13T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [],
  hedefAdres: null,
  formId: null,
  telefon: TEL,
  urlEtiketleri: null,
};
const kavram = (k: Partial<Kavram>): Kavram => ({ gorselHash: H.kare, baslik: 'Başlık', metin: 'Metin', ...k });
const DORT_AYRI = (['dikey', 'dik45', 'kare', 'yatay'] as GorselOrani[]).map((o) => kavram({ gorselHash: H[o], oran: o }));

function derle(g: Partial<DerlemeGirdisi>): { govdeler: MetaGovdesi[]; kapattiklarimiz: string[] } {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(`ret: ${JSON.stringify(r.retler)}`);
  return r;
}
function retler(g: Partial<DerlemeGirdisi>): string[] {
  const r = derleMeta({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
}
const bul = (gv: MetaGovdesi[], ad: string) => gv.find((x) => x.ad === ad)!.alanlar as Record<string, any>;
const hedef = (gv: MetaGovdesi[]) => bul(gv, 'reklam_seti').targeting as Record<string, string[]>;

/** Kararın TAM listesi — tek yerde ve elle: kural koddan okunsaydı test kendini doğrulardı. */
const ACIK_FB = ['facebook_reels', 'feed', 'marketplace', 'story'];
const ACIK_IG = ['story', 'stream'];

describe('cihaz ve yerleşim', () => {
  it('KRİTİK: device_platforms AÇIKÇA yalnız mobile', () => {
    const t = hedef(derle({ kavramlar: [kavram({ oran: 'kare' })] }).govdeler);
    expect(t.device_platforms).toEqual(['mobile']);
    expect([...TELEFON_CIHAZLARI]).toEqual(['mobile']);
  });

  it('KRİTİK: dört boyut TAMKEN de elle yerleşim — karardaki liste, fazlası yok', () => {
    const r = derle({ kavramlar: DORT_AYRI });
    const t = hedef(r.govdeler);
    expect(t.publisher_platforms).toEqual(['facebook', 'instagram']);
    expect([...t.facebook_positions!].sort()).toEqual(ACIK_FB);
    expect([...t.instagram_positions!].sort()).toEqual(ACIK_IG);
    for (const yok of ['right_hand_column', 'search']) expect(t.facebook_positions).not.toContain(yok);
    for (const yok of ['explore', 'reels']) expect(t.instagram_positions).not.toContain(yok);
    expect(t).not.toHaveProperty('audience_network_positions');
    expect(t).not.toHaveProperty('messenger_positions');
    expect(r.kapattiklarimiz).toContain(niyetYerlesimKisiti('TELEFON')!.aciklama);
  });

  it('KRİTİK: VİDEO fikrinde de (oran bilinmiyor) elle yerleşim — Advantage+ yerleşim kalmıyor', () => {
    const t = hedef(derle({ kavramlar: [kavram({ videoId: 'v1' })] }).govdeler);
    expect([...t.facebook_positions!].sort()).toEqual(ACIK_FB);
    expect([...t.instagram_positions!].sort()).toEqual(ACIK_IG);
    expect(t.device_platforms).toEqual(['mobile']);
  });

  it('Instagram hesabı yoksa Instagram konumları da yazılmaz', () => {
    const t = hedef(derle({ instagramPlatformId: null, kavramlar: [kavram({ oran: 'kare' })] }).govdeler);
    expect(t.publisher_platforms).toEqual(['facebook']);
    expect(t).not.toHaveProperty('instagram_positions');
  });

  it('yalnız 1.91:1 görsel: dar listede yeri yok → ret, sebebi arama reklamının yerleri', () => {
    const r = derleMeta({ ...temel, kavramlar: [kavram({ gorselHash: H.yatay, oran: 'yatay' })] });
    expect(r.tur).toBe('ret');
    if (r.tur === 'ret') expect(r.retler[0]!.mesaj).toContain('Arama reklamı');
  });

  it('SITE ve FORM etkilenmez: cihaz yazılmaz, SITE dört boyutta Advantage+ yerleşimde kalır', () => {
    const site = hedef(derle({ niyet: 'SITE', telefon: null, hedefAdres: 'https://ege.com.tr', kavramlar: DORT_AYRI }).govdeler);
    expect(site).not.toHaveProperty('device_platforms');
    expect(site).not.toHaveProperty('publisher_platforms');
  });

  it('rehberin yerleşim planı derleyiciyle AYNI: video olsa da elle (tablo "otomatik" demesin)', () => {
    const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: 'z' });
    const plan = rehberYerlesimPlani(
      { amac: al('TELEFON' as const), medya: al([{ varlikId: 'v', kapakVarlikId: 'k' }]) } as unknown as RehberAlanlari,
      new Map(),
    );
    expect(plan?.otomatik).toBe(false);
    expect(plan?.niyetKapanan).toEqual(['yan']);
  });
});

describe('geri okuma: cihaz', () => {
  it('KRİTİK: device_platforms küme olarak beklenir; Meta masaüstü eklerse FARK', () => {
    const gv = derle({ kavramlar: [kavram({ oran: 'kare' })] }).govdeler;
    const y = beklenenYankilar(gv).find((x) => x.alanYolu === 'targeting.device_platforms')!;
    expect(y).toMatchObject({ karsilastirma: 'esit_kume', kabulEdilemez: true });
    const o: Record<string, Record<string, any>> = JSON.parse(JSON.stringify(Object.fromEntries(gv.map((g) => [g.ad, g.alanlar]))));
    for (const v of Object.values(o)) for (const [k, x] of Object.entries(v)) if (typeof x === 'string' && /^\{.+\}$/.test(x)) v[k] = '1';
    expect(geriOkumaKarsilastir(beklenenYankilar(gv), o, { yasalUyariVar: false }).sonuc).toBe('temiz');
    o.reklam_seti!.targeting.device_platforms = ['mobile', 'desktop'];
    expect(geriOkumaKarsilastir(beklenenYankilar(gv), o, { yasalUyariVar: false }).sonuc).toBe('fark');
  });
});

describe('banner seti yok', () => {
  it('KRİTİK: TELEFON set listesinde değil; set fikri RET, rehber görselleri gruplamaz', () => {
    expect(BANNER_SETI_NIYETLERI).not.toContain('TELEFON');
    const set = (['kare', 'dik45'] as GorselOrani[]).map((oran) => ({ oran, gorselHash: H[oran] }));
    expect(retler({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set })] })).toContain('KRT-SET');
    const ayrim = setlereAyir([{ varlikId: 'a' }, { varlikId: 'b' }], new Map<string, GorselOrani>([['a', 'kare'], ['b', 'dik45']]), 'TELEFON');
    expect(ayrim.setler).toHaveLength(2);
  });
});

describe('geri arama isteği', () => {
  it('KRİTİK: gövdede uydurulmuş geri arama alanı yok; tablo Meta Business Suite\'e yönlendiriyor', () => {
    const json = JSON.stringify(derle({ kavramlar: [kavram({ oran: 'kare' })] }).govdeler).toLowerCase();
    expect(json).not.toContain('callback');
    const satirlar = kararTablosu('TELEFON', { meta: true, google: true }, 'MAKS_TIKLAMA', true, null, {});
    expect(satirlar.find((s) => s.kod === 'GERI_ARAMA')?.meta?.not).toBe(META_GERI_ARAMA_CUMLESI);
    expect(satirlar.find((s) => s.kod === 'SAAT')?.meta?.not).toBe(META_SAAT_CUMLESI);
    expect(satirlar.find((s) => s.kod === 'GORSEL')?.meta?.not).toBe(TELEFON_BANNER_CUMLESI);
    expect(satirlar.find((s) => s.kod === 'OLCUM')?.google?.not).toBe(GOOGLE_ARAMA_OLCUM_CUMLESI);
    // Başka amaçta bu satırlar yok (gereksiz soru doğurmasın).
    expect(kararTablosu('SITE', { meta: true, google: true }, 'MAKS_TIKLAMA', true).some((s) => s.kod === 'GERI_ARAMA' || s.kod === 'SAAT')).toBe(false);
  });

  it('tablo "yalnız telefonda" diyor (gövde device_platforms yazıyor)', () => {
    const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: 'z' });
    const plan = rehberYerlesimPlani({ amac: al('TELEFON' as const), medya: al([{ varlikId: 'v', kapakVarlikId: 'k' }]) } as unknown as RehberAlanlari, new Map());
    const nerede = kararTablosu('TELEFON', { meta: true, google: false }, 'MAKS_TIKLAMA', true, plan).find((s) => s.kod === 'NEREDE')!;
    expect(nerede.meta!.deger).toContain('yalnız telefonda');
  });
});

describe('ülke kuralı (+90)', () => {
  const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: '2026-10-12T09:00:00.000Z' });
  const B: RehberEksikBaglami = {
    ajansYoneticisi: true,
    onKosullar: null,
    yasalUyari: null,
    asgariGunluk: { meta: null, googleTalepYaratma: null },
    paraBirimi: 'TRY',
    paraBirimleriAyni: true,
  };
  const rehber = (konumlar: Array<{ tur: 'country' | 'region' | 'city' | 'custom'; key: string; etiket: string; ulkeKodu: string | null }>, telefon = TEL): RehberAlanlari =>
    ({
      amac: al('TELEFON' as const),
      platformlar: al({ meta: true, google: false }),
      konumlar: al(konumlar),
      telefon: al(telefon),
    }) as unknown as RehberAlanlari;
  const kod = (r: RehberAlanlari) => rehberEksikleri(r, B).filter((e) => e.kod.startsWith('TEL-ULKE'));

  it('KRİTİK: Türkiye dışı ülke ya da şehir GİRİŞTE engel', () => {
    expect(kod(rehber([{ tur: 'country', key: 'DE', etiket: 'Almanya', ulkeKodu: 'DE' }]))).toMatchObject([{ kod: 'TEL-ULKE', seviye: 'engel' }]);
    expect(kod(rehber([{ tur: 'city', key: '1', etiket: 'Atina', ulkeKodu: 'GR' }, { tur: 'city', key: '2', etiket: 'İzmir', ulkeKodu: 'TR' }]))[0]!.metin).toContain('Atina');
  });

  it('Türkiye içi konum geçer; ülkesi bilinmeyen nokta UYARI', () => {
    expect(kod(rehber([{ tur: 'city', key: '2', etiket: 'İzmir', ulkeKodu: 'TR' }]))).toEqual([]);
    expect(kod(rehber([{ tur: 'custom', key: '', etiket: 'Nokta', ulkeKodu: null }]))).toMatchObject([{ kod: 'TEL-ULKE-BILINMIYOR', seviye: 'uyari' }]);
  });

  it('KRİTİK: derleyici ikinci kapı (TEL-ULKE ret)', () => {
    expect(retler({ hedefleme: { ...temel.hedefleme, konumlar: [{ tur: 'country', key: 'DE', etiket: 'Almanya', ulkeKodu: 'DE' }] }, kavramlar: [kavram({ oran: 'kare' })] })).toContain('TEL-ULKE');
    expect(retler({ kavramlar: [kavram({ oran: 'kare' })] })).toEqual([]);
  });

  it('ülke kodu konumun KENDİSİNDEN: ülke türünde key, diğerlerinde ulkeKodu', () => {
    expect(telefonUlkesiDisindakiKonumlar(TEL, [{ tur: 'country', key: 'tr', etiket: 'T', ulkeKodu: null }])).toEqual([]);
    expect(telefonUlkesiDisindakiKonumlar('+4915112345678', [{ tur: 'country', key: 'TR', etiket: 'T', ulkeKodu: 'TR' }])).toEqual([]);
  });
});
