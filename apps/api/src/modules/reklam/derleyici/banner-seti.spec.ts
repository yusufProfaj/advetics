import { describe, expect, it } from 'vitest';
import {
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  oranBul,
  ortakPlan,
  rehberEksikleri,
  rehberYerlesimPlani,
  rehberdenMeta,
  setPlani,
  setlereAyir,
  type DerlemeGirdisi,
  type GorselOrani,
  type Kavram,
  type MetaGovdesi,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';

/**
 * BANNER SETİ (kullanıcı kararı, 2026-10-10): bir tasarımın boyutları TEK
 * reklam; eksik boyutta o boyutun yerleşimi KAPANIR. Meta provası kuralların
 * eksiksizliğini denetlemiyor (`meta-yerlesim-prova` negatif kontrolü geçti),
 * yani bu dosya garantinin TEK yeri.
 */

const H = { dikey: 'h-dikey', dik45: 'h-dik45', kare: 'h-kare', yatay: 'h-yatay' } as const;
const set = (...oranlar: GorselOrani[]) => oranlar.map((oran) => ({ oran, gorselHash: H[oran] }));

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-10',
  workspaceKisaAdi: 'Ege',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'country', key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 250_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-11T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [],
  hedefAdres: 'https://gardenvillaskusadasi.com/',
  formId: null,
  urlEtiketleri: null,
};
const kavram = (k: Partial<Kavram>): Kavram => ({ gorselHash: H.kare, baslik: 'Başlık', metin: 'Metin', ...k });

function derle(g: Partial<DerlemeGirdisi>): MetaGovdesi[] {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(`ret: ${JSON.stringify(r.retler)}`);
  return r.govdeler;
}
function retKodlari(g: Partial<DerlemeGirdisi>): string[] {
  const r = derleMeta({ ...temel, ...g });
  return r.tur === 'ret' ? r.retler.map((x) => x.kod) : [];
}
const bul = (gv: MetaGovdesi[], ad: string) => gv.find((x) => x.ad === ad)!.alanlar as Record<string, any>;
const tumKonumlar = (t: Record<string, any>) => [...(t.facebook_positions ?? []), ...(t.instagram_positions ?? [])];

describe('oranBul', () => {
  it('dört boyut ve %3 pay; tanınmayan oran null', () => {
    expect(oranBul(1080, 1920)).toBe('dikey');
    expect(oranBul(1080, 1350)).toBe('dik45');
    expect(oranBul(1080, 1346)).toBe('dik45');
    expect(oranBul(1200, 1200)).toBe('kare');
    expect(oranBul(1200, 628)).toBe('yatay');
    expect(oranBul(1500, 1000)).toBeNull();
    expect(oranBul(0, 100)).toBeNull();
    expect(oranBul(null, 100)).toBeNull();
  });
});

describe('setlereAyir', () => {
  const o = new Map<string, GorselOrani | null>([
    ['a', 'kare'],
    ['b', 'dikey'],
    ['c', 'kare'],
    ['d', 'dik45'],
    ['x', null],
  ]);
  it('aynı oranın ikinci görseli YENİ sete düşer; tanınmayan ayrı döner', () => {
    const r = setlereAyir([{ varlikId: 'a' }, { varlikId: 'b' }, { varlikId: 'c' }, { varlikId: 'x' }], o);
    expect(r.setler.map((s) => s.map((x) => x.varlikId))).toEqual([['a', 'b'], ['c']]);
    expect(r.taninmayan.map((x) => x.varlikId)).toEqual(['x']);
  });
  it('elle set numarası uyulur; aynı sette aynı oran ÇAKIŞMA, otomatik görsel elle sete karışmaz', () => {
    const r = setlereAyir([{ varlikId: 'a', setNo: 2 }, { varlikId: 'c', setNo: 2 }, { varlikId: 'd' }], o);
    expect(r.cakisan.map((x) => x.varlikId)).toEqual(['c']);
    expect(r.setler.map((s) => s.map((x) => x.varlikId))).toEqual([['a'], ['d']]);
  });
});

describe('setPlani / ortakPlan', () => {
  it('dört boyut → otomatik, hiçbir yer kapalı değil', () => {
    expect(setPlani(['dikey', 'dik45', 'kare', 'yatay'])).toEqual({ otomatik: true, gruplar: { akis: 'dik45', yan: 'yatay', pazar: 'kare', hikaye: 'dikey' }, kapanan: [] });
  });
  it('9:16 yok → Hikâye ve Reels kapalı; kare akışa ve sağ sütuna YEDEK (kırpılmadan oturur)', () => {
    expect(setPlani(['kare'])).toEqual({ otomatik: false, gruplar: { akis: 'kare', yan: 'kare', pazar: 'kare' }, kapanan: ['hikaye'] });
  });
  it('kare yoksa 4:5 akışa, 1.91:1 sağ sütuna; Marketplace ve Hikâye yedeksiz kapanır', () => {
    expect(setPlani(['dik45', 'yatay'])).toEqual({ otomatik: false, gruplar: { akis: 'dik45', yan: 'yatay' }, kapanan: ['pazar', 'hikaye'] });
  });
  it('ORTAK: bir sette 9:16 yoksa reklam setinde Hikâye kapalı, otomatik değil', () => {
    const p = ortakPlan([['dikey', 'dik45', 'kare', 'yatay'], ['kare', 'dik45']]);
    expect(p.otomatik).toBe(false);
    expect(p.kapanan).toEqual(['hikaye']);
  });
});

describe('derleMeta — banner seti', () => {
  it('KRİTİK: dört boyut → TEK kreatif, yerleşim alanı YOK (Advantage+), her grup bir kural ve SONDA kare varsayılan', () => {
    const gv = derle({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dikey', 'dik45', 'kare', 'yatay') })] });
    expect(gv.filter((x) => x.nesne === 'kreatif')).toHaveLength(1);
    expect(gv.filter((x) => x.nesne === 'reklam')).toHaveLength(1);
    const t = bul(gv, 'reklam_seti').targeting;
    expect(t.publisher_platforms).toBeUndefined();
    const k = bul(gv, 'kreatif:1');
    expect(k.object_story_spec).toEqual({ page_id: '111', instagram_user_id: '222' });
    const afs = k.asset_feed_spec;
    expect(afs.images.map((i: any) => [i.hash, i.adlabels[0].name])).toEqual([
      ['h-dikey', 'adv_dikey'],
      ['h-dik45', 'adv_dik45'],
      ['h-kare', 'adv_kare'],
      ['h-yatay', 'adv_yatay'],
    ]);
    const kurallar = afs.asset_customization_rules as any[];
    expect(kurallar.map((r) => [r.image_label.name, r.priority])).toEqual([
      ['adv_dik45', 1],
      ['adv_yatay', 2],
      ['adv_kare', 3],
      ['adv_dikey', 4],
      ['adv_kare', 5],
    ]);
    expect(kurallar[3].customization_spec.instagram_positions).toEqual(['story', 'reels']);
    // MARKETPLACE YALNIZ KARE (gözle görüldü: 4:5 orada kareye kırpılıyor).
    const pazar = kurallar.filter((r) => r.customization_spec.facebook_positions?.includes('marketplace'));
    expect(pazar.map((r) => r.image_label.name)).toEqual(['adv_kare']);
    // Meta varsayılanı BOŞ tanımla ve en sonda istiyor (gerçek prova reddetti, 2026-10-10).
    expect(kurallar[4].customization_spec).toEqual({});
    expect(kurallar.slice(0, 4).every((r) => Object.keys(r.customization_spec).length > 0)).toBe(true);
    // Yerleşim özelleştirmesi AÇIKÇA; yoksa Meta kuralları segment kuralı sayıp
    // konum istiyor, konum yazınca "v22'den beri kaldırıldı" diyor (üç gerçek prova).
    expect(afs.optimization_type).toBe('PLACEMENT');
    for (const r of kurallar) expect(r.customization_spec.geo_locations).toBeUndefined();
    // Her kural metni de açıkça seçer.
    for (const r of kurallar) expect([r.body_label?.name, r.title_label?.name, r.link_url_label?.name]).toEqual(['adv_metin', 'adv_baslik', 'adv_baglanti']);
    expect(afs.link_urls[0].website_url).toBe('https://gardenvillaskusadasi.com/');
  });

  it('KRİTİK: 9:16 yok → elle yerleşim, story/reels HİÇBİR yerde yok; Hikâye kuralı da yok', () => {
    const gv = derle({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dik45', 'kare', 'yatay') })] });
    const t = bul(gv, 'reklam_seti').targeting;
    expect(t.publisher_platforms).toEqual(['facebook', 'instagram']);
    expect(tumKonumlar(t)).toEqual(expect.arrayContaining(['feed', 'right_hand_column', 'stream']));
    for (const yasak of ['story', 'reels', 'facebook_reels']) expect(tumKonumlar(t)).not.toContain(yasak);
    const kurallar = bul(gv, 'kreatif:1').asset_feed_spec.asset_customization_rules as any[];
    expect(kurallar.map((r) => r.image_label.name)).toEqual(['adv_dik45', 'adv_yatay', 'adv_kare', 'adv_dik45']);
    expect(kurallar[3].customization_spec).toEqual({});
    expect(JSON.stringify(kurallar)).not.toContain('story');
  });

  it('Instagram hesabı yoksa elle yerleşim ve kurallar Instagram yazmaz', () => {
    const gv = derle({ instagramPlatformId: null, kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dik45', 'kare') })] });
    const t = bul(gv, 'reklam_seti').targeting;
    expect(t.publisher_platforms).toEqual(['facebook']);
    expect(t.instagram_positions).toBeUndefined();
    expect(JSON.stringify(bul(gv, 'kreatif:1').asset_feed_spec)).not.toContain('instagram');
  });

  it('tek kare görsel: object_story_spec kalır ama Hikâye kapanır (aynı karar)', () => {
    const gv = derle({ kavramlar: [kavram({ oran: 'kare' })] });
    expect(bul(gv, 'kreatif:1').asset_feed_spec).toBeUndefined();
    expect(bul(gv, 'kreatif:1').object_story_spec.link_data.image_hash).toBe('h-kare');
    expect(tumKonumlar(bul(gv, 'reklam_seti').targeting)).not.toContain('story');
  });

  it('oranı bilinmeyen fikir → eski davranış: yerleşim alanı yazılmaz', () => {
    const gv = derle({ kavramlar: [kavram({})] });
    expect(bul(gv, 'reklam_seti').targeting.publisher_platforms).toBeUndefined();
  });

  it('iki set: ortak plan reklam setinde, her kreatif KENDİ oranıyla', () => {
    const gv = derle({
      kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dikey', 'dik45', 'kare', 'yatay') }), kavram({ oran: 'kare', setGorselleri: set('kare', 'yatay') })],
    });
    expect(tumKonumlar(bul(gv, 'reklam_seti').targeting)).not.toContain('story');
    const k2 = bul(gv, 'kreatif:2').asset_feed_spec.asset_customization_rules as any[];
    expect(k2.map((r) => r.image_label.name)).toEqual(['adv_kare', 'adv_yatay', 'adv_kare', 'adv_kare']);
    const k1 = bul(gv, 'kreatif:1').asset_feed_spec.asset_customization_rules as any[];
    // Ortak planda Hikâye kapalı: 9:16'lı sette de Hikâye kuralı YOK.
    expect(k1.map((r) => r.image_label.name)).toEqual(['adv_dik45', 'adv_yatay', 'adv_kare', 'adv_dik45']);
  });

  it('retler: set + video, set + form, aynı oran iki kez', () => {
    expect(retKodlari({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set('kare', 'dik45') }), kavram({ videoId: '{video:x}' })] })).toContain('KRT-SET');
    expect(retKodlari({ niyet: 'FORM', formId: 'f', kavramlar: [kavram({ oran: 'kare', setGorselleri: set('kare', 'dik45') })] })).toContain('KRT-SET');
    expect(
      retKodlari({ kavramlar: [kavram({ oran: 'kare', setGorselleri: [{ oran: 'kare', gorselHash: 'a' }, { oran: 'kare', gorselHash: 'b' }] })] }),
    ).toContain('KRT-SET');
  });
});

describe('geri okuma — yerleşime göre görsel (N-13) ve elle yerleşim', () => {
  const gv = derle({ kavramlar: [kavram({ oran: 'kare', setGorselleri: set('dik45', 'kare', 'yatay') })] });
  const yankilar = beklenenYankilar(gv);
  /** Meta'nın dönüşünü taklit: etiketler {id, name}, diziler ters, kurallar ters dizide ama öncelik aynı. */
  const meta = () => {
    const o: Record<string, Record<string, any>> = JSON.parse(JSON.stringify(Object.fromEntries(gv.map((g) => [g.ad, g.alanlar]))));
    for (const n of Object.values(o)) {
      if (n.adlabels) n.adlabels = n.adlabels.map((x: any, i: number) => ({ id: String(900 + i), ...x }));
    }
    const t = o.reklam_seti!.targeting;
    t.facebook_positions = [...t.facebook_positions].reverse();
    const afs = o['kreatif:1']!.asset_feed_spec;
    afs.images = afs.images.map((i: any) => ({ ...i, adlabels: i.adlabels.map((l: any) => ({ id: '77', ...l })) })).reverse();
    // Meta her kurala 13–65 yaşı ekliyor ve adı damgalıyor (N-14, N-15; canlı kurulum 3efebf54).
    afs.asset_customization_rules = [...afs.asset_customization_rules]
      .reverse()
      .map((r: any) => ({ ...r, image_label: { id: '5', ...r.image_label }, customization_spec: { age_max: 65, age_min: 13, ...r.customization_spec } }));
    o['kreatif:1']!.name = `${o['kreatif:1']!.name} 2026-10-10-e86a70db2137ac86666cc59e45200ee1`;
    return o;
  };
  const karsilastir = (o: Record<string, Record<string, unknown>>) => geriOkumaKarsilastir(yankilar, o, { yasalUyariVar: false });

  it('KRİTİK: kimlik eklenmiş, sırası değişmiş ama anlamca aynı dönüş TEMİZ', () => {
    const r = karsilastir(meta());
    expect(r.sonuc === 'temiz' ? [] : r.satirlar.map((s) => `${s.govde}|${s.alanYolu}`)).toEqual([]);
  });
  it('N-14: kuralda DAR bir yaş dönerse DURUR', () => {
    const o = meta();
    o['kreatif:1']!.asset_feed_spec.asset_customization_rules[0].customization_spec.age_min = 25;
    expect(karsilastir(o).sonuc).toBe('fark');
  });
  it('N-15: damga dışında ad değişirse DURUR', () => {
    const o = meta();
    o['kreatif:1']!.name = `Başka ad 2026-10-10-e86a70db2137ac86666cc59e45200ee1`;
    expect(karsilastir(o).sonuc).toBe('fark');
  });
  it('görsel hash farklı dönerse DURUR', () => {
    const o = meta();
    o['kreatif:1']!.asset_feed_spec.images[0].hash = 'baska';
    expect(karsilastir(o).sonuc).toBe('fark');
  });
  it('özelleştirme türü PLACEMENT dışında dönerse DURUR', () => {
    const o = meta();
    o['kreatif:1']!.asset_feed_spec.optimization_type = 'REGULAR';
    expect(karsilastir(o).sonuc).toBe('fark');
  });
  it('kuralların ÖNCELİĞİ değişirse DURUR (ilk eşleşen kazanıyor)', () => {
    const o = meta();
    const k = o['kreatif:1']!.asset_feed_spec.asset_customization_rules as any[];
    const p0 = k[0].priority;
    k[0].priority = k[1].priority;
    k[1].priority = p0;
    expect(karsilastir(o).sonuc).toBe('fark');
  });
  it('kapalı yerleşim (story) açık dönerse DURUR', () => {
    const o = meta();
    o.reklam_seti!.targeting.instagram_positions = [...o.reklam_seti!.targeting.instagram_positions, 'story'];
    expect(karsilastir(o).sonuc).toBe('fark');
  });
});

describe('rehber → banner seti', () => {
  const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: '2026-10-10T09:00:00.000Z' });
  const rehber = (medya: Array<{ varlikId: string; setNo?: number }>): RehberAlanlari => ({
    amac: al('SITE' as const),
    platformlar: al({ meta: true, google: false }),
    metaHesabiId: al(U(1)),
    sayfaId: al(U(3)),
    konumlar: al([{ tur: 'country' as const, key: 'TR', etiket: 'Türkiye', ulkeKodu: 'TR' }]),
    ekKategoriler: al([]),
    hedefAdres: al('https://gardenvillaskusadasi.com/'),
    medya: al(medya),
    metin: al({ anaMetin: 'Metin', basliklar: ['B1', 'B2', 'B3'], aciklamalar: ['A1', 'A2'] }),
    butce: al({ tip: 'gunluk' as const, micros: '250000000' }),
    takvim: al({ baslangic: '2026-10-11', bitis: null }),
  });
  const ORAN = new Map<string, GorselOrani | null>([
    [U(10), 'dik45'],
    [U(11), 'dikey'],
    [U(12), 'yatay'],
    [U(13), 'kare'],
    [U(14), null],
  ]);
  const DORT = [{ varlikId: U(10) }, { varlikId: U(11) }, { varlikId: U(12) }, { varlikId: U(13) }];

  it('KRİTİK: Garden Villas’ın dört boyutu → TEK fikir, varsayılan görsel kare', () => {
    const r = rehberdenMeta(rehber(DORT), { meta: true, google: false }, 'TRY', '2026-10-10T09:00:00.000Z', ORAN);
    if (r.tur !== 'tamam') throw new Error(r.kodlar.join());
    const k = r.deger.kavramlar!.deger;
    expect(k).toHaveLength(1);
    expect(k[0]!.varlikId).toBe(U(13));
    expect(k[0]!.setGorselleri!.map((x) => x.oran).sort()).toEqual(['dik45', 'dikey', 'kare', 'yatay']);
  });

  it('oranı tanınmayan görsel → ret, sessizce atılmıyor', () => {
    const r = rehberdenMeta(rehber([...DORT, { varlikId: U(14) }]), { meta: true, google: false }, 'TRY', 'z', ORAN);
    expect(r).toEqual({ tur: 'ret', kodlar: ['GORSEL-ORAN'] });
  });

  const B: RehberEksikBaglami = {
    ajansYoneticisi: true,
    onKosullar: null,
    yasalUyari: null,
    asgariGunluk: { meta: null, googleTalepYaratma: null },
    paraBirimi: 'TRY',
    paraBirimleriAyni: true,
  };
  it('eksik listesi: 9:16 yoksa "Hikâye ve Reels kapalı kalacak" UYARISI; tanınmayan oran ENGEL', () => {
    const uc = rehberEksikleri(rehber(DORT.filter((x) => x.varlikId !== U(11))), { ...B, medyaOranlari: ORAN });
    expect(uc.find((e) => e.kod === 'M-YERLESIM-KAPALI')).toMatchObject({ seviye: 'uyari', metin: expect.stringContaining('Hikâye ve Reels kapalı kalacak') });
    const bozuk = rehberEksikleri(rehber([...DORT, { varlikId: U(14) }]), { ...B, medyaOranlari: ORAN });
    expect(bozuk.find((e) => e.kod === 'M-GORSEL-ORAN')).toMatchObject({ seviye: 'engel' });
    expect(rehberEksikleri(rehber(DORT), { ...B, medyaOranlari: ORAN }).some((e) => e.kod === 'M-YERLESIM-KAPALI')).toBe(false);
  });

  it('karar tablosunun planı derleyicinin planıyla aynı kaynaktan (rehberYerlesimPlani)', () => {
    expect(rehberYerlesimPlani(rehber(DORT), ORAN)?.otomatik).toBe(true);
    expect(rehberYerlesimPlani(rehber([{ varlikId: U(13) }]), ORAN)?.kapanan).toEqual(['hikaye']);
  });
});
