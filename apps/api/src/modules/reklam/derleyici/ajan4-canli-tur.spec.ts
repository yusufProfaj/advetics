import { describe, expect, it } from 'vitest';
import {
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  type DerlemeGirdisi,
  type MetaGovdesi,
} from '@advetics/shared';

/*
 * AJAN 4 · 3. TUR — CANLI TUR 1 NORMALLEŞTİRMELERİNİN DENETİMİ (N-07…N-10).
 *
 * Soru: geri okumaya eklenen dört gevşetme PARA AÇAN KAPIYI deliyor mu?
 *
 * İki tür test var ve adlarından ayrılıyor:
 *
 * - "KORUMA": gevşetmenin sınırının doğru yerde olduğunu kilitliyor. Bunlar
 *   doğru davranış; düşerse gevşetme taşmış demektir.
 * - "BULGU-n": denetimde bulunan bir boşluğun BUGÜNKÜ davranışını
 *   kilitliyor. Doğru davranışı DEĞİL kusuru gösteriyor; düzelten ajan testi
 *   TERS ÇEVİRMEK zorunda. `it.fails` kullanılmadı: kurulum adımı düşse de
 *   "geçti" sayardı ve bulgu sessizce kaybolurdu. Ayrıntı
 *   `docs/advcampaign/devir/ajan4.md` § 3. tur.
 */

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-10',
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
  takvim: { baslangic: '2026-10-10T00:00:00+0300', bitis: '2026-10-20T23:59:00+0300' },
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

type Okuma = Record<string, Record<string, any>>;

function aynaOkuma(gs: MetaGovdesi[]): Okuma {
  const doldur = (v: unknown): unknown =>
    typeof v === 'string' && /^\{.+\}$/.test(v)
      ? '123'
      : Array.isArray(v)
        ? v.map(doldur)
        : v && typeof v === 'object'
          ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, doldur(x)]))
          : v;
  return Object.fromEntries(gs.map((g) => [g.ad, doldur(structuredClone(g.alanlar))])) as Okuma;
}

/** Canlı turun dönüş biçimi: dört normalleşme birden, kalan her şey ayna. */
function canli(gs: MetaGovdesi[]): Okuma {
  const o = aynaOkuma(gs);
  o.reklam_seti!.promoted_object = { ...o.reklam_seti!.promoted_object, smart_pse_enabled: false };
  o.reklam_seti!.targeting.geo_locations = {
    ...o.reklam_seti!.targeting.geo_locations,
    location_types: ['home', 'recent', 'frequently_in'],
  };
  o.reklam_seti!.start_time = '2026-10-10T04:02:17+0300';
  for (const [ad, n] of Object.entries(o)) {
    if (!ad.startsWith('kreatif:')) continue;
    const spec = n.degrees_of_freedom_spec.creative_features_spec as Record<string, unknown>;
    n.degrees_of_freedom_spec.creative_features_spec = Object.fromEntries(
      Object.keys(spec).map((k) => [k.toLowerCase(), { enroll_status: 'OPT_OUT' }]),
    );
  }
  return o;
}

const gs = derle();
const yankilar = beklenenYankilar(gs);
// Geri okuma anı: canlı turun okuması kurulumdan (04:02:17) hemen sonra.
const SIMDI = new Date('2026-10-10T04:03:00+03:00');
const k = (o: Okuma, yasalUyariVar = false) => geriOkumaKarsilastir(yankilar, o, { yasalUyariVar, simdi: SIMDI });
const spec = (o: Okuma) => o['kreatif:1']!.degrees_of_freedom_spec.creative_features_spec as Record<string, unknown>;

describe('ön koşul', () => {
  it('canlı tur dönüşü temiz (bu dosyadaki her senaryo bu temelden tek bir şeyi değiştiriyor)', () => {
    expect(k(canli(gs)).sonuc).toBe('temiz');
  });
});

describe('N-10 · özellik anahtarında harf duyarsızlık', () => {
  it('KORUMA: harf duyarsızlık YALNIZ creative_features_spec altında — bütçe anahtarı büyük harfle dönerse bulunamaz, açılmaz', () => {
    const o = canli(gs);
    o.kampanya!.DAILY_BUDGET = o.kampanya!.daily_budget;
    delete o.kampanya!.daily_budget;
    const r = k(o);
    expect(r.sonuc).toBe('dogrulanamadi');
    if (r.sonuc === 'temiz') return;
    expect(r.satirlar).toEqual([expect.objectContaining({ alanYolu: 'daily_budget', tur: 'donmedi', kabulEdilemez: true })]);
  });

  it('KORUMA: kapattığımız özellik küçük harfle OPT_IN dönerse FARK ve kabul edilemez', () => {
    const o = canli(gs);
    spec(o).image_animation = { enroll_status: 'OPT_IN' };
    const r = k(o);
    expect(r.sonuc).toBe('fark');
    if (r.sonuc === 'temiz') return;
    expect(r.satirlar).toEqual([
      expect.objectContaining({ alanYolu: 'degrees_of_freedom_spec.creative_features_spec.IMAGE_ANIMATION.enroll_status', tur: 'fark', kabulEdilemez: true }),
    ]);
  });

  it('KORUMA: kapattığımız özellik HİÇ dönmezse (ne büyük ne küçük) doğrulanamadı', () => {
    const o = canli(gs);
    delete spec(o).image_animation;
    expect(k(o).sonuc).toBe('dogrulanamadi');
  });

  it('KORUMA: tanımsız (üretken) özellik küçük ya da büyük harfle OPT_IN dönerse tanimsiz_ozellik ile DURUR', () => {
    for (const ad of ['music', 'MUSIC']) {
      const o = canli(gs);
      spec(o)[ad] = { enroll_status: 'OPT_IN' };
      const r = k(o);
      expect(r.sonuc).toBe('fark');
      if (r.sonuc === 'temiz') return;
      expect(r.satirlar).toEqual([expect.objectContaining({ tur: 'tanimsiz_ozellik', kabulEdilemez: true })]);
    }
  });

  it('KORUMA: yasal uyarılı workspace’te TEXT_OPTIMIZATIONS büyük harfle OPT_IN dönse de durur', () => {
    const o = canli(gs);
    spec(o).TEXT_OPTIMIZATIONS = { enroll_status: 'OPT_IN' };
    expect(k(o, true).sonuc).toBe('fark');
    expect(k(o, false).sonuc).toBe('temiz');
  });

  /*
   * BULGU-6: ikinci döngü (tanımsız özellik) DEĞERİ harf duyarlı okuyor:
   * `enroll_status !== 'OPT_IN'`. Canlı tur Meta'nın bu yanıtta ANAHTAR
   * harfini değiştirdiğini gösterdi; değer `opt_in` gelirse üretken bir
   * özellik (müzik, metin üretimi…) açık olduğu hâlde yayın TEMİZ açılıyor.
   * Öneri: üretken/tanımsız sınıfta "OPT_OUT değilse durdur" (harf duyarsız)
   * — tahmin etmektense kısıtla.
   */
  it('BULGU-6 (DÜZELDİ): tanımsız özellik değeri küçük harfle (opt_in) dönerse DURUR', () => {
    const o = canli(gs);
    spec(o).music = { enroll_status: 'opt_in' };
    expect(k(o).sonuc).toBe('fark');
  });

  /*
   * BULGU-7: aynı özellik iki harf biçimiyle dönerse ilk döngü tam eşleşeni
   * (büyük harfli OPT_OUT) alıyor, ikinci döngü `kapatildi` sınıfını harf
   * duyarsız ATLIYOR — küçük harfli OPT_IN hiç kimseye görünmüyor. Bugün
   * gözlenmedi (düşük), ama N-10 tam bu belirsizliği açtı. Öneri: iki biçim
   * birlikte dönerse ya da ikinci döngüde `kapatildi` OPT_IN dönerse durdur.
   */
  it('BULGU-7 (DÜZELDİ): IMAGE_ANIMATION OPT_OUT + image_animation OPT_IN birlikte dönerse DURUR', () => {
    const o = canli(gs);
    spec(o).IMAGE_ANIMATION = { enroll_status: 'OPT_OUT' };
    spec(o).image_animation = { enroll_status: 'OPT_IN' };
    expect(k(o).sonuc).toBe('fark');
  });
});

describe('N-08 · konum türleri', () => {
  it('KORUMA: location_types ayıklanırken ÜLKE kovası eklenmesi (genişleme) yine FARK', () => {
    const o = canli(gs);
    o.reklam_seti!.targeting.geo_locations.countries = ['TR'];
    const r = k(o);
    expect(r.sonuc).toBe('fark');
    if (r.sonuc === 'temiz') return;
    expect(r.satirlar).toEqual([expect.objectContaining({ alanYolu: 'targeting.geo_locations', kabulEdilemez: true })]);
  });

  it('KORUMA: location_types ayıklanırken komşu BÖLGE eklenmesi yine FARK', () => {
    const o = canli(gs);
    o.reklam_seti!.targeting.geo_locations.regions = [{ key: '2347' }, { key: '2348' }];
    expect(k(o).sonuc).toBe('fark');
  });

  it('KORUMA: location_types dizi değilse ya da travel_in taşırsa FARK', () => {
    for (const t of ['home', ['home', 'travel_in'], [{ tur: 'home' }]]) {
      const o = canli(gs);
      o.reklam_seti!.targeting.geo_locations.location_types = t;
      expect(k(o).sonuc).toBe('fark');
    }
  });

  it('KORUMA: konum hiç dönmezse doğrulanamadı (location_types kuralı donmedi dalını değiştirmiyor)', () => {
    const o = canli(gs);
    delete o.reklam_seti!.targeting.geo_locations;
    expect(k(o).sonuc).toBe('dogrulanamadi');
  });
});

describe('N-07 · promoted_object ek anahtarı', () => {
  it('KORUMA: sayfa değişirse, sayfa düşerse ya da ek anahtar 0 / "false" (dizge) ise FARK', () => {
    const durumlar: Record<string, unknown>[] = [
      { page_id: '999', smart_pse_enabled: false },
      { smart_pse_enabled: false },
      { page_id: '111', smart_pse_enabled: 0 },
      { page_id: '111', smart_pse_enabled: 'false' },
      { page_id: '111', smart_pse_enabled: true },
    ];
    for (const p of durumlar) {
      const o = canli(gs);
      o.reklam_seti!.promoted_object = p;
      expect(k(o).sonuc).toBe('fark');
    }
  });

  /*
   * BULGU-8: ek anahtarlarda `false` ve `null` GENEL olarak kabul. Canlıda
   * yalnız `smart_pse_enabled: false` görüldü. `null` "Meta'nın kararı /
   * hesabın varsayılanı" demek olabilir (CLAUDE.md: platformun varsayılanına
   * güvenme) ve gelecekte gelecek `xxx_only: false` gibi bir anahtar DARALTMAYI
   * kapatıp genişletebilir. Öneri: yalnız ölçülen anahtar (`smart_pse_enabled`)
   * ve yalnız `false` kabul; gerisi fark.
   */
  it('BULGU-8 (DÜZELDİ): tanımadığımız ek anahtar ya da null değer FARK; yalnız smart_pse_enabled: false kabul', () => {
    for (const ek of [{ smart_pse_enabled: null }, { yeni_kisit_only: false }]) {
      const o = canli(gs);
      o.reklam_seti!.promoted_object = { page_id: '111', ...ek };
      expect(k(o).sonuc).toBe('fark');
    }
  });
});

describe('N-09 · başlangıç kurulum anına', () => {
  it('KORUMA: +03:00 biçimiyle aynı gün sonraki saat kabul (normallesti)', () => {
    const o = canli(gs);
    o.reklam_seti!.start_time = '2026-10-10T04:02:17+03:00';
    const r = k(o);
    expect(r.sonuc).toBe('temiz');
    expect(r.bilgiler.some((b) => b.alanYolu === 'start_time' && b.tur === 'normallesti')).toBe(true);
  });

  it('KORUMA: ERKENE kayma, ertesi gün ve okunamayan biçim FARK; start_time kabul edilemez', () => {
    for (const s of ['2026-10-09T23:59:00+0300', '2026-10-11T00:00:00+0300', 'yarın', '']) {
      const o = canli(gs);
      o.reklam_seti!.start_time = s;
      const r = k(o);
      expect(r.sonuc).toBe('fark');
      if (r.sonuc === 'temiz') return;
      expect(r.satirlar).toEqual([expect.objectContaining({ alanYolu: 'start_time', kabulEdilemez: true })]);
    }
  });

  it('KORUMA: metin olarak aynı gün ama an olarak ERKEN (başka ofset) FARK — d >= g şartı', () => {
    // 2026-10-10T01:00+0500 = 2026-10-09T23:00+0300: gönderilenden önce.
    const o = canli(gs);
    o.reklam_seti!.start_time = '2026-10-10T01:00:00+0500';
    expect(k(o).sonuc).toBe('fark');
  });

  it('KORUMA: bitiş N-09’dan etkilenmiyor — aynı gün daha geç bitiş de FARK', () => {
    const o = canli(gs);
    o.reklam_seti!.end_time = '2026-10-20T23:59:30+0300';
    expect(k(o).sonuc).toBe('fark');
  });

  it('KORUMA: başlangıç dönmezse doğrulanamadı', () => {
    const o = canli(gs);
    delete o.reklam_seti!.start_time;
    expect(k(o).sonuc).toBe('dogrulanamadi');
  });

  /*
   * BULGU-9 (ORTA): kabul koşulu "aynı gün ve dönen ≥ gönderilen" — ne
   * gönderilenin GEÇMİŞTE olduğuna ne de dönenin KURULUM ANI olduğuna
   * bakıyor. Rehberde başlangıç ileri bir gün seçilebiliyor; Meta onu aynı
   * günün akşamına kaydırırsa yayın TEMİZ açılıyor ve kullanıcıya
   * "Başlangıç saati geçmişte kalmıştı" diye YANLIŞ bir sebep yazılıyor.
   * Öneri: karşılaştırıcıya kurulum/okuma anı (`simdi`) geçir; kabul için
   * gönderilen < simdi VE dönen ≤ simdi (+ birkaç dakika pay) şart.
   */
  it('BULGU-9 (DÜZELDİ): GELECEK bir başlangıç aynı günün ilerisine kayarsa FARK', () => {
    const ileri = derle({ takvim: { baslangic: '2026-10-15T00:00:00+0300', bitis: null } });
    const o = aynaOkuma(ileri);
    o.reklam_seti!.start_time = '2026-10-15T21:00:00+0300';
    const r = geriOkumaKarsilastir(beklenenYankilar(ileri), o, { yasalUyariVar: false, simdi: SIMDI });
    expect(r.sonuc).toBe('fark');
    expect(r.bilgiler.some((b) => b.alanYolu === 'start_time')).toBe(false);
  });

  /*
   * BULGU-10 (DÜŞÜK): "aynı gün" METİN olarak (`slice(0, 10)`) ve her
   * dizgenin KENDİ ofsetinde karşılaştırılıyor. Dönen başka bir ofsetle
   * gelirse hesabın saatiyle ERTESİ GÜN olan bir an "aynı gün" sayılıyor.
   * Meta bugün hesabın ofsetini döndürüyor, o yüzden düşük. Öneri: günü
   * gönderilenin ofsetinde hesapla ya da ofset farklıysa kabul etme.
   */
  it('BULGU-10 (DÜZELDİ): başka ofsetle dönen ve hesap saatiyle ertesi güne düşen an FARK', () => {
    const o = canli(gs);
    // 2026-10-10T22:00-0300 = 2026-10-11T04:00+0300 (hesabın ertesi günü)
    o.reklam_seti!.start_time = '2026-10-10T22:00:00-0300';
    expect(k(o).sonuc).toBe('fark');
  });
});
