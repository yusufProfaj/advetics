import { describe, expect, it } from 'vitest';
import {
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  okumaAlanlari,
  type DerlemeGirdisi,
  type MetaGovdesi,
} from '@advetics/shared';

/** Yasal uyarısız workspace; uyarılı hâl ayrı testte. */
const karsilastir = (y: Parameters<typeof geriOkumaKarsilastir>[0], o: Parameters<typeof geriOkumaKarsilastir>[1]) =>
  geriOkumaKarsilastir(y, o, { yasalUyariVar: false });

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-07',
  workspaceKisaAdi: 'Örnek',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: {
    konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }],
    enDusukYas: 18,
    ipucuYas: { min: 25, max: 45 },
    ipucuCinsiyet: null,
  },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h1', baslik: 'B1', metin: 'M1' }],
  hedefAdres: 'https://ornek.com.tr',
  formId: null,
  urlEtiketleri: null,
};

function derle(g: Partial<DerlemeGirdisi> = {}): MetaGovdesi[] {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error('ret');
  return r.govdeler;
}

/** Meta'nın "kusursuz" yankısı: gönderileni geri döndürür, kimlikleri doldurur. */
function aynaOkuma(gs: MetaGovdesi[]): Record<string, Record<string, unknown>> {
  const doldur = (v: unknown): unknown =>
    typeof v === 'string' && /^\{.+\}$/.test(v)
      ? '123'
      : Array.isArray(v)
        ? v.map(doldur)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, doldur(x)]))
          : v;
  return Object.fromEntries(gs.map((g) => [g.ad, doldur(structuredClone(g.alanlar)) as Record<string, unknown>]));
}

function kopya(o: Record<string, Record<string, any>>) {
  return structuredClone(o) as Record<string, Record<string, any>>;
}

describe('beklenen yankı', () => {
  it('her gönderilen yaprak alan için bir yankı; yer tutucular meta_turetir', () => {
    const y = beklenenYankilar(derle());
    expect(y.find((x) => x.govde === 'reklam_seti' && x.alanYolu === 'campaign_id')?.karsilastirma).toBe('meta_turetir');
    expect(y.find((x) => x.alanYolu === 'targeting.geo_locations')).toMatchObject({
      karsilastirma: 'alt_kume', altKumeYonu: 'gonderilen_icinde_donen', kabulEdilemez: true, ekranEtiketi: 'Konum',
    });
    expect(y.find((x) => x.alanYolu === 'daily_budget')).toMatchObject({ kabulEdilemez: true, ekranEtiketi: 'Bütçe' });
    expect(y.find((x) => x.alanYolu === 'object_story_spec.link_data.message')?.kabulEdilemez).toBe(false);
  });

  it('okuma alanları üst düzey adlardan', () => {
    expect(okumaAlanlari(beklenenYankilar(derle()), 'reklam_seti')).toContain('targeting');
  });
});

describe('geri okuma', () => {
  const gs = derle();
  const yankilar = beklenenYankilar(gs);

  it('Meta gönderileni aynen döndürürse temiz (sayı↔dizge farkı fark değil)', () => {
    const o = kopya(aynaOkuma(gs));
    o.kampanya!.daily_budget = 50000; // Graph sayı döndürse bile
    expect(karsilastir(yankilar, o).sonuc).toBe('temiz');
  });

  it('KRİTİK: bütçe farkı durdurur ve kabul edilemez', () => {
    const o = kopya(aynaOkuma(gs));
    o.kampanya!.daily_budget = '5000000';
    const r = karsilastir(yankilar, o);
    expect(r.sonuc).toBe('fark');
    if (r.sonuc !== 'fark') return;
    expect(r.satirlar).toEqual([expect.objectContaining({ ekranEtiketi: 'Bütçe', kabulEdilemez: true, tur: 'fark' })]);
  });

  it('KRİTİK: Meta konuma EKLERSE (genişleme) fark; DARALTIRSA geçer', () => {
    const genis = kopya(aynaOkuma(gs));
    genis.reklam_seti!.targeting.geo_locations = { regions: [{ key: '2347' }], countries: ['TR'] };
    expect(karsilastir(yankilar, genis).sonuc).toBe('fark');

    const iki = derle({ hedefleme: { ...temel.hedefleme, konumlar: [
      { tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' },
      { tur: 'region', key: '2348', etiket: 'Manisa', ulkeKodu: 'TR' },
    ] } });
    const dar = kopya(aynaOkuma(iki));
    dar.reklam_seti!.targeting.geo_locations = { regions: [{ key: '2347' }] };
    expect(karsilastir(beklenenYankilar(iki), dar).sonuc).toBe('temiz');
  });

  it('kabul edilemez alan DÖNMEZSE doğrulanamadı (bilinmiyor = kaldı); metin dönmezse yalnız kayıt', () => {
    const o = kopya(aynaOkuma(gs));
    delete o.reklam_seti!.attribution_spec;
    expect(karsilastir(yankilar, o).sonuc).toBe('dogrulanamadi');

    const m = kopya(aynaOkuma(gs));
    delete m['kreatif:1']!.url_tags;
    delete m['kreatif:1']!.object_story_spec.link_data.message;
    const r = karsilastir(yankilar, m);
    expect(r.sonuc).toBe('temiz');
    expect(r.bilgiler.map((b) => b.tur)).toEqual(['donmedi']);
  });

  it('düşük riskli fark da durdurur (kabul et seçeneği yok, ama kabul edilemez işaretsiz)', () => {
    const o = kopya(aynaOkuma(gs));
    o['kreatif:1']!.object_story_spec.link_data.message = 'Başka metin';
    const r = karsilastir(yankilar, o);
    expect(r.sonuc).toBe('fark');
    if (r.sonuc === 'fark') expect(r.satirlar[0]!.kabulEdilemez).toBe(false);
  });

  it('ek adlabel kabul, eksik adlabel fark', () => {
    const o = kopya(aynaOkuma(gs));
    o.kampanya!.adlabels = [...o.kampanya!.adlabels, { name: 'baska' }];
    expect(karsilastir(yankilar, o).sonuc).toBe('temiz');
    o.kampanya!.adlabels = [{ name: 'advetics' }];
    expect(karsilastir(yankilar, o).sonuc).toBe('fark');
  });

  it('kategori ülkesi küme: sıra farkı fark değil', () => {
    const k = derle({
      kategoriler: { taban: ['HOUSING'], ek: [] },
      hedefleme: { ...temel.hedefleme, ipucuYas: null, konumlar: [
        { tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' },
        { tur: 'country', key: 'DE', etiket: 'Almanya', ulkeKodu: 'DE' },
      ] },
    });
    const o = kopya(aynaOkuma(k));
    o.kampanya!.special_ad_category_country = ['TR', 'DE'];
    expect(karsilastir(beklenenYankilar(k), o).sonuc).toBe('temiz');
  });

  it('N-06: konutta advantage_audience 0 dönerse fark değil, bilgi satırı', () => {
    const k = derle({ kategoriler: { taban: ['HOUSING'], ek: [] }, hedefleme: { ...temel.hedefleme, ipucuYas: null } });
    const o = kopya(aynaOkuma(k));
    o.reklam_seti!.targeting.targeting_automation.advantage_audience = 0;
    const r = karsilastir(beklenenYankilar(k), o);
    expect(r.sonuc).toBe('temiz');
    expect(r.bilgiler.map((b) => b.tur)).toEqual(['normallesti']);
    // Kategorisiz reklamda 0 dönmesi FARK.
    const n = kopya(aynaOkuma(gs));
    n.reklam_seti!.targeting.targeting_automation.advantage_audience = 0;
    expect(karsilastir(yankilar, n).sonuc).toBe('fark');
  });

  it('kreatif özelliği: tanınan OPT_IN fark; tanınmayan VAR olması sorun değil, OPT_IN dönmesi durdurur', () => {
    const o = kopya(aynaOkuma(gs));
    o['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.IMAGE_ANIMATION = { enroll_status: 'OPT_IN' };
    expect(karsilastir(yankilar, o).sonuc).toBe('fark');

    const t = kopya(aynaOkuma(gs));
    t['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.yeni_ozellik = { enroll_status: 'OPT_OUT' };
    expect(karsilastir(yankilar, t).sonuc).toBe('temiz');
    t['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.yeni_ozellik = { enroll_status: 'OPT_IN' };
    const r = karsilastir(yankilar, t);
    expect(r.sonuc).toBe('fark');
    if (r.sonuc === 'fark') expect(r.satirlar[0]!.tur).toBe('tanimsiz_ozellik');
  });

  it('KRİTİK: kapatamadığımız bilinen uyarlama açık dönerse yayın DURMAZ, bilgi olarak yazılır (S-42)', () => {
    const o = kopya(aynaOkuma(gs));
    // Meta aynı özelliği büyük harfle de döndürebilir.
    o['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.ADAPT_TO_PLACEMENT = { enroll_status: 'OPT_IN' };
    o['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.text_optimizations = { enroll_status: 'OPT_IN' };
    const r = karsilastir(yankilar, o);
    expect(r.sonuc).toBe('temiz');
    expect(r.bilgiler.filter((b) => b.tur === 'meta_otomatik').map((b) => b.ekranEtiketi)).toEqual([
      'Meta görseli yerleşime göre kırpabilir',
      'Meta metnin farklı varyasyonlarını gösterebilir',
    ]);
  });

  it('KRİTİK: zorunlu yasal uyarılı workspace\'te metin varyasyonu DURDURUR', () => {
    const o = kopya(aynaOkuma(gs));
    o['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.text_optimizations = { enroll_status: 'OPT_IN' };
    const r = geriOkumaKarsilastir(yankilar, o, { yasalUyariVar: true });
    expect(r.sonuc).toBe('fark');
    if (r.sonuc === 'fark') expect(r.satirlar[0]!.ekranEtiketi).toMatch(/yasal uyarı/);
    // Diğer bilinen uyarlama uyarılı workspace'te de durdurmaz.
    const k = kopya(aynaOkuma(gs));
    k['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec.image_touchups = { enroll_status: 'OPT_IN' };
    expect(geriOkumaKarsilastir(yankilar, k, { yasalUyariVar: true }).sonuc).toBe('temiz');
  });

  it('nesne hiç okunamadıysa bütün kritik alanları dönmedi', () => {
    const o = kopya(aynaOkuma(gs));
    delete o.reklam_seti;
    expect(karsilastir(yankilar, o).sonuc).toBe('dogrulanamadi');
  });
});
