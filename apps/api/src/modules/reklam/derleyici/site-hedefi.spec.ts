import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  NIYET_KATALOGU,
  SITE_PIKSEL_HALLERI,
  beklenenYankilar,
  derleMeta,
  kararTablosu,
  metaOptimizasyonHedefi,
  rehberdenMeta,
  siteHedefCumlesi,
  sitePikselHali,
  taslakEksikleri,
  type DerlemeGirdisi,
  type RehberAlanlari,
  type SitePikselHali,
} from '@advetics/shared';

/**
 * "SİTEME GELSİNLER" META HEDEFİ PİKSELE BAĞLI (yönetici kararı, 2026-10-12).
 *
 * LANDING_PAGE_VIEWS sayfanın yüklendiğini pikselden görüyor; pikselsiz ya
 * da susmuş sitede öğrenecek sinyal yok ve hata da yok: yalnız pahalı ve az
 * ziyaretçi. Burada kilitlenenler: hâlin hesaplanması (saf), derleyicinin
 * gövdesi, geri okuma beklentisi ve ekran cümlesi AYNI karardan.
 */

const TL = (n: number) => BigInt(n) * 1_000_000n;
const SIMDI = new Date('2026-10-12T12:00:00Z');
const gunOnce = (g: number) => new Date(SIMDI.getTime() - g * 86_400_000).toISOString();
const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-12',
  workspaceKisaAdi: 'Örnek Yapı',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [{ tur: 'region', key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: TL(500), seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-13T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h1', baslik: 'B1', metin: 'M1' }],
  hedefAdres: 'https://ornek.com.tr/',
  formId: null,
  telefon: null,
  urlEtiketleri: null,
};

function set(g: Partial<DerlemeGirdisi>) {
  const r = derleMeta({ ...temel, ...g });
  if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
  return { set: r.govdeler.find((x) => x.nesne === 'reklam_seti')!.alanlar, yanki: beklenenYankilar(r.govdeler) };
}

describe('sitePikselHali — hesabın piksel listesinden', () => {
  const p = (sonCalisma: string | null, kullanilamaz = false) => ({ sonCalisma, kullanilamaz });
  it('okunmadı (null) → bilinmiyor; boş liste → yok', () => {
    expect(sitePikselHali(null, SIMDI, false)).toBe('bilinmiyor');
    expect(sitePikselHali([], SIMDI, false)).toBe('yok');
  });
  it('son 7 günde çalışan kullanılabilir piksel → aktif; tam 7. gün dahil', () => {
    expect(sitePikselHali([p(gunOnce(1))], SIMDI, false)).toBe('aktif');
    expect(sitePikselHali([p(gunOnce(7))], SIMDI, false)).toBe('aktif');
  });
  it('7 günden eski ya da hiç çalışmamış → sessiz; çözülemeyen tarih aktif SAYILMAZ', () => {
    expect(sitePikselHali([p(gunOnce(8))], SIMDI, false)).toBe('sessiz');
    expect(sitePikselHali([p(null)], SIMDI, false)).toBe('sessiz');
    expect(sitePikselHali([p('dün')], SIMDI, false)).toBe('sessiz');
  });
  it('KULLANILAMAZ piksel yeni olay almış olsa da sayılmaz (yalnız o varsa → yok)', () => {
    expect(sitePikselHali([p(gunOnce(1), true)], SIMDI, false)).toBe('yok');
    expect(sitePikselHali([p(gunOnce(1), true), p(gunOnce(2))], SIMDI, false)).toBe('aktif');
  });
  it('KESİLMİŞ listede aktif yoksa bilinmiyor ("yok" yalan olurdu); aktif varsa aktif', () => {
    expect(sitePikselHali([], SIMDI, true)).toBe('bilinmiyor');
    expect(sitePikselHali([p(gunOnce(9))], SIMDI, true)).toBe('bilinmiyor');
    expect(sitePikselHali([p(gunOnce(1))], SIMDI, true)).toBe('aktif');
  });
});

describe('metaOptimizasyonHedefi — TEK karar', () => {
  it('SITE: yalnız aktif → LANDING_PAGE_VIEWS; yok/sessiz/bilinmiyor/verilmemiş → LINK_CLICKS', () => {
    const beklenen: Record<SitePikselHali, string> = { aktif: 'LANDING_PAGE_VIEWS', yok: 'LINK_CLICKS', sessiz: 'LINK_CLICKS', bilinmiyor: 'LINK_CLICKS' };
    for (const h of SITE_PIKSEL_HALLERI) expect(metaOptimizasyonHedefi('SITE', h), h).toBe(beklenen[h]);
    expect(metaOptimizasyonHedefi('SITE', null)).toBe('LINK_CLICKS');
    expect(metaOptimizasyonHedefi('SITE', undefined)).toBe('LINK_CLICKS');
  });
  it('diğer niyetlerde piksel hâli YOK SAYILIR: kataloğun değeri', () => {
    for (const n of ['FORM', 'WHATSAPP', 'TELEFON', 'ERISIM', 'VIDEO_IZLENME', 'SATIS'] as const) {
      expect(metaOptimizasyonHedefi(n, 'yok')).toBe(NIYET_KATALOGU[n].meta!.optimizationGoal);
      expect(metaOptimizasyonHedefi(n, 'aktif')).toBe(NIYET_KATALOGU[n].meta!.optimizationGoal);
    }
  });
});

describe('derleMeta — SITE gövdesi ve geri okuma beklentisi', () => {
  const hedefYankisi = (y: ReturnType<typeof beklenenYankilar>) => y.find((x) => x.govde === 'reklam_seti' && x.alanYolu === 'optimization_goal');

  it('aktif → LANDING_PAGE_VIEWS; beklenen yankı aynı değeri EŞİT kıyaslar', () => {
    const r = set({ sitePikseli: 'aktif' });
    expect(r.set.optimization_goal).toBe('LANDING_PAGE_VIEWS');
    expect(hedefYankisi(r.yanki)).toMatchObject({ gonderilen: 'LANDING_PAGE_VIEWS', karsilastirma: 'esit' });
  });

  for (const h of ['yok', 'sessiz', 'bilinmiyor'] as const) {
    it(`${h} → LINK_CLICKS gövdede ve beklenen yankıda; destination WEBSITE kalır`, () => {
      const r = set({ sitePikseli: h });
      expect(r.set.optimization_goal).toBe('LINK_CLICKS');
      expect(r.set.destination_type).toBe('WEBSITE');
      expect(hedefYankisi(r.yanki)).toMatchObject({ gonderilen: 'LINK_CLICKS', karsilastirma: 'esit' });
    });
  }

  it('piksel hâli VERİLMEMİŞ (eski taslak yolu) → LINK_CLICKS (güvenli taraf)', () => {
    expect(set({}).set.optimization_goal).toBe('LINK_CLICKS');
  });

  it('atıf iki dalda da 1 gün tıklama (ajans standardı tik7_gor1 olsa da)', () => {
    for (const h of ['aktif', 'yok'] as const) expect(set({ sitePikseli: h }).set.attribution_spec).toEqual([{ event_type: 'CLICK_THROUGH', window_days: 1 }]);
  });

  it('SITE dışı niyet piksel hâlinden ETKİLENMEZ (erişim REACH kalır)', () => {
    const r = derleMeta({ ...temel, niyet: 'ERISIM', hedefAdres: null, sitePikseli: 'yok' });
    if (r.tur !== 'govde') throw new Error(JSON.stringify(r.retler));
    expect(r.govdeler.find((x) => x.nesne === 'reklam_seti')!.alanlar.optimization_goal).toBe('REACH');
  });
});

describe('rehberdenMeta — piksel hâli yalnız site amacında taslağa', () => {
  const Z = '2026-10-12T09:00:00.000Z';
  const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: null, zaman: Z });
  const rehber = (amac: 'SITE' | 'FORM'): RehberAlanlari => ({
    amac: al(amac),
    platformlar: al({ meta: true, google: false }),
    metin: al({ anaMetin: 'Metin', basliklar: ['Başlık'], aciklamalar: [] }),
    butce: al({ tip: 'gunluk' as const, micros: '500000000' }),
    hedefAdres: al('https://ornek.com.tr/'),
  });
  it('SITE: değer derleyici kaynağıyla yazılır; FORM: alan HİÇ yok (provası bayatlamasın)', () => {
    const s = rehberdenMeta(rehber('SITE'), { meta: true, google: false }, 'TRY', Z, new Map(), 'yok');
    expect(s.tur === 'tamam' && s.deger.sitePikseli).toMatchObject({ deger: 'yok', kaynak: 'derleyici' });
    const f = rehberdenMeta(rehber('FORM'), { meta: true, google: false }, 'TRY', Z, new Map(), 'aktif');
    expect(f.tur === 'tamam' && 'sitePikseli' in f.deger).toBe(false);
  });
  it('KRİTİK: istemci "aktif" yazamaz — kaynak derleyici değilse eksik (KAYNAK)', () => {
    const e = taslakEksikleri({ sitePikseli: { deger: 'aktif', kaynak: 'kullanici', kim: null, zaman: Z } }, { yasalUyari: null });
    expect(e.some((x) => x.alan === 'sitePikseli' && x.kod === 'KAYNAK')).toBe(true);
  });
});

describe('karar tablosu — Meta TUR satırı hedefi SEBEBİYLE söyler', () => {
  const tur = (h: SitePikselHali | undefined) => kararTablosu('SITE', { meta: true, google: false }, 'MAKS_TIKLAMA', true, null, h ? { sitePikseli: h } : {}).find((x) => x.kod === 'TUR')!.meta!;
  it('aktif → "sayfa görüntüleme"', () => {
    expect(tur('aktif').deger).toBe('Trafik kampanyası · sayfa görüntüleme');
  });
  it('yok/sessiz → yöneticinin cümlesi AYNEN (uzun tire yok)', () => {
    for (const h of ['yok', 'sessiz'] as const) {
      expect(tur(h)).toEqual({
        deger: 'Trafik kampanyası · bağlantı tıklaması',
        not: 'Sitende Meta pikseli görülmediği için reklam tıklamaya göre optimize edilecek; piksel kurulunca sayfa görüntülemeye geçer',
      });
    }
  });
  it('bilinmiyor ya da verilmemiş → okunamadığını söyler, "görülmedi" demez', () => {
    expect(tur('bilinmiyor').not).toMatch(/^Meta pikseli okunamadığı için/);
    expect(tur(undefined).not).toBe(siteHedefCumlesi('bilinmiyor'));
  });
  it('ekran cümlelerinde uzun tire yok', () => {
    for (const h of SITE_PIKSEL_HALLERI) expect(siteHedefCumlesi(h)).not.toMatch(/[—–]/);
  });
});

describe('kaynak taraması — derleyici hedefi kataloğdan DEĞİL karardan okuyor', () => {
  const kaynak = readFileSync(join(__dirname, '../../../../../../packages/shared/src/reklam/meta/derle.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  it('optimization_goal ve attribution_spec aynı değişkenden; m.optimizationGoal gövdeye GİTMİYOR', () => {
    expect(kaynak).toContain('const optimizasyon = metaOptimizasyonHedefi(g.niyet, g.sitePikseli);');
    expect(kaynak).toContain('optimization_goal: optimizasyon,');
    expect(kaynak).toContain('attribution_spec: atifSpec(optimizasyon, g.atif!)');
    expect(kaynak).not.toContain('m.optimizationGoal');
  });
  it('yayın derlemesi taslaktaki piksel hâlini geçiriyor', () => {
    const y = readFileSync(join(__dirname, '../yayin-baslat.ts'), 'utf8');
    expect(y).toContain('sitePikseli: alanlar.sitePikseli?.deger ?? null,');
  });
});
