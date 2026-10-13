import { describe, expect, it } from 'vitest';
import { BAGLANTI_HALI_METNI, type KalemTahmini, type Permission, type StratejiKalemi } from '@advetics/shared';
import { kaynakRozeti } from '@/components/rehber/kaynak-rozeti';
import {
  HALKA_CEVRE,
  asamaDagilimi,
  beklenenKutulari,
  belgeMetni,
  bolumKayitGovdesi,
  bolumNumarasi,
  dagitilmamis,
  gorunurBolumler,
  halkaYaylari,
  kalemGirdisi,
  monteGorunumler,
  onayCumlesi,
  onaySayfasiHali,
  platformDegisti,
  tahminMetni,
  takvimCubugu,
  tokenSorulmaliMi,
  kalemKelimeDurumu,
  kelimeAramaHali,
  seciliKelimeGruplari,
} from './hesap';
import type { KelimeSatiri } from '@advetics/shared';

/**
 * ═══ AdvStrategy v2 ekran kararları — ÇALIŞTIRILARAK ═══
 * Kaynak taramaları `strateji-v2-sayfa.spec.ts`te; burada davranış.
 */

const YOK: KalemTahmini = { tur: 'yok', neden: 'gecmis_yok' };
const KAPALI: KalemTahmini = { tur: 'yok', neden: 'platform_kapali' };

function kalem(x: Partial<StratejiKalemi>): StratejiKalemi {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    sira: 1,
    amac: 'FORM',
    asama: 'donusum',
    meta: true,
    google: false,
    metaPayi: null,
    butceMicros: '72000000000',
    baslangic: '2026-11-01',
    bitis: '2027-01-31',
    konumlar: [{ tur: 'region', key: '2223', etiket: 'İzmir', ulkeKodu: 'TR' }],
    yasMin: null,
    yasMax: null,
    kelimeGrubu: null,
    varliklar: [],
    metin: null,
    kreatifYonergesi: null,
    kitleTarifi: null,
    tahmin: { meta: YOK, google: KAPALI },
    kaynaklar: {},
    durum: { tur: 'aktarilmadi' },
    not: null,
    ...x,
  };
}

describe('monte edilen görünümler', () => {
  it('KRİTİK: müşteri hesabında (read + approve) YALNIZ belge monte — düzenleyici DOM\'a hiç girmez', () => {
    const musteri: Permission[] = ['strategy.read', 'strategy.approve'];
    expect(monteGorunumler(musteri)).toEqual(['belge']);
  });

  it('ajans: yazma + reklam kurma izni üçünü de monte eder; reklam kurma izni yoksa aktarım yok', () => {
    expect(monteGorunumler(['strategy.read', 'strategy.write', 'bulk.write'])).toEqual(['duzenle', 'belge', 'aktar']);
    expect(monteGorunumler(['strategy.read', 'strategy.write'])).toEqual(['duzenle', 'belge']);
  });
});

describe('para: aşama ve platform', () => {
  const k1 = kalem({ amac: 'FORM', butceMicros: '72000000000' });
  const k2 = kalem({ id: 'b', amac: 'SITE', meta: true, google: true, metaPayi: 40, butceMicros: '54000000000' });
  const k3 = kalem({ id: 'c', amac: 'ERISIM', meta: true, google: true, metaPayi: 52, butceMicros: '24000000000' });

  it('KRİTİK: aşama amaçtan türer, iki platformlu kalem pay ile bölünür', () => {
    const a = asamaDagilimi([k1, k2, k3], 'TRY');
    const bul = (x: string) => a.find((s) => s.asama === x)!;
    expect(bul('donusum')).toMatchObject({ meta: 72_000_000_000n, google: 0n });
    expect(bul('ilgi')).toMatchObject({ meta: 21_600_000_000n, google: 32_400_000_000n });
    expect(bul('tanitim')).toMatchObject({ meta: 12_480_000_000n, google: 11_520_000_000n });
    expect(a.reduce((t, s) => t + s.toplam, 0n)).toBe(150_000_000_000n);
  });

  it('dağıtılmamış ve aşım işaretli', () => {
    expect(dagitilmamis('180000000000', [k1, k2])).toBe(54_000_000_000n);
    expect(dagitilmamis('100000000000', [k1, k2])).toBe(-26_000_000_000n);
  });

  it('halka iki yayı çevreyi tam doldurur, boş planda sıfır', () => {
    const y = halkaYaylari(2n, 1n);
    expect(y.meta + y.google).toBeCloseTo(HALKA_CEVRE, 6);
    expect(y.meta).toBeGreaterThan(y.google);
    expect(halkaYaylari(0n, 0n)).toEqual({ meta: 0, google: 0 });
  });
});

describe('tahmin: yalnız veri, platformlar toplanmaz', () => {
  it('KRİTİK: veri yoksa "Tahmin yok" ve NEDENİ; varsayım aralığı yok', () => {
    const t = tahminMetni({ tur: 'yok', neden: 'olcum_yok' }, 'TELEFON');
    expect(t).toMatchObject({ ana: 'Tahmin yok', veri: false });
    expect(t.alt).toBe('bu sonuç ölçülmüyor.');
  });

  it('aralık birimle yazılır; tek ay verisi söylenir', () => {
    expect(tahminMetni({ tur: 'aralik', olcut: 'form', altSonuc: 160, ustSonuc: 240, aySayisi: 3, kaynak: 'veri' }, 'FORM')).toMatchObject({
      ana: '160-240 form',
      alt: 'Hesabınızın verisi · son 3 ay',
      veri: true,
    });
    expect(tahminMetni({ tur: 'aralik', olcut: 'form', altSonuc: 90, ustSonuc: 90, aySayisi: 1, kaynak: 'veri' }, 'FORM').alt).toContain('tek ay');
  });

  it('KRİTİK: aynı ölçüt Meta ve Google\'da İKİ ayrı kutu; aynı platformda toplanır', () => {
    const ar = (alt: number, ust: number): KalemTahmini => ({ tur: 'aralik', olcut: 'ziyaret', altSonuc: alt, ustSonuc: ust, aySayisi: 3, kaynak: 'veri' });
    const kutular = beklenenKutulari([
      kalem({ amac: 'SITE', tahmin: { meta: ar(100, 200), google: ar(1000, 2000) } }),
      kalem({ id: 'x', amac: 'SITE', tahmin: { meta: ar(10, 20), google: YOK } }),
    ]);
    expect(kutular).toHaveLength(2);
    expect(kutular.find((k) => k.platform === 'meta')).toMatchObject({ alt: 110, ust: 220 });
    expect(kutular.find((k) => k.platform === 'google')).toMatchObject({ alt: 1000, ust: 2000 });
  });
});

describe('belge', () => {
  it('KRİTİK: "Plan ve gerçekleşen" yalnız onaydan sonra', () => {
    expect(gorunurBolumler('taslak').map((b) => b.kod)).not.toContain('gerceklesen');
    expect(gorunurBolumler('onayda').map((b) => b.kod)).not.toContain('gerceklesen');
    expect(gorunurBolumler('onaylandi').map((b) => b.kod)).toContain('gerceklesen');
    expect(gorunurBolumler('kapandi').map((b) => b.kod)).toContain('gerceklesen');
  });

  it('bölüm numarası kapak hariç sıralı', () => {
    expect(bolumNumarasi('kapak', 'taslak')).toBeNull();
    expect(bolumNumarasi('ozet', 'taslak')).toBe('01');
    expect(bolumNumarasi('onay', 'taslak')).toBe('12');
    expect(bolumNumarasi('gerceklesen', 'taslak')).toBeNull();
    expect(bolumNumarasi('gerceklesen', 'onaylandi')).toBe('13');
  });

  it('KRİTİK: yapay zekâ önerisi ("Kullan" denmemiş) belgeye girmez', () => {
    const zaman = '2026-10-13T10:00:00+03:00';
    expect(belgeMetni({ metin: 'Öneri', kaynak: 'ai', kim: null, zaman })).toBeNull();
    expect(belgeMetni({ metin: 'Ajansın cümlesi', kaynak: 'ajans', kim: null, zaman })).toBe('Ajansın cümlesi');
    expect(belgeMetni(null)).toBeNull();
  });

  it('onay cümlesi: bağlantı onayı beyan edilen ad ve e-postayı yazar, müşteri hesabı ayrı cümle', () => {
    const b = onayCumlesi({ rol: 'baglanti', zaman: '2026-10-14T09:00:00Z', kim: null, ad: 'Mehmet Kaya', eposta: 'm@firma.com', surum: 3 });
    expect(b).toContain('Onay bağlantısıyla onaylandı');
    expect(b).toContain('Mehmet Kaya (m@firma.com)');
    expect(b).toContain('sürüm 3');
    expect(onayCumlesi({ rol: 'musteri', zaman: '2026-10-14T09:00:00Z', kim: 'Ayşe', ad: null, eposta: null, surum: 2 })).toContain('Müşteri hesabı onayladı · Ayşe');
    expect(onayCumlesi(null)).toBeNull();
  });

  it('takvim çubuğu dönem içinde orantılı, dışı kırpılır', () => {
    const plan = { baslangic: '2026-11-01', bitis: '2026-11-30' };
    expect(takvimCubugu({ baslangic: '2026-11-16', bitis: '2026-11-30' }, plan)).toEqual({ sol: 50, genislik: 50 });
    expect(takvimCubugu({ baslangic: '2026-10-01', bitis: '2026-12-31' }, plan)).toEqual({ sol: 0, genislik: 100 });
  });
});

describe('kalem düzenleyici', () => {
  it('platform kapanınca pay düşer, açılınca 50 ile başlar (sözleşme: pay yalnız iki platformda)', () => {
    const g = kalemGirdisi(kalem({ meta: true, google: true, metaPayi: 40 }), 'TRY');
    expect(platformDegisti(g, 'google', false)).toMatchObject({ google: false, metaPayi: null });
    const tek = kalemGirdisi(kalem({}), 'TRY');
    expect(platformDegisti(tek, 'google', true)).toMatchObject({ google: true, metaPayi: 50 });
  });

  it('bütçe micros\'tan geri okunabilir metne: dokunmadan kaydetmek aynı tutar', () => {
    expect(kalemGirdisi(kalem({ butceMicros: '72000500000' }), 'TRY').butce).toBe('72.000,50');
  });
});

describe('girişsiz onay sayfası', () => {
  it('KRİTİK: biçimsiz token sunucuya hiç sorulmaz', () => {
    expect(tokenSorulmaliMi('abc')).toBe(false);
    expect(tokenSorulmaliMi('../../etc')).toBe(false);
    expect(tokenSorulmaliMi('A'.repeat(43))).toBe(true);
  });

  it('KRİTİK: bulunamadı / iptal / süresi doldu / yetkisiz AYNI cümle (var olanı tahmin ettirmez)', () => {
    const basliklar = [400, 403, 404, 410].map((s) => {
      const h = onaySayfasiHali(s, null);
      return h.tur === 'mesaj' ? h.baslik : null;
    });
    const govdeli = (['iptal', 'suresi_doldu'] as const).map((hal) => {
      const h = onaySayfasiHali(200, { hal, okunabilir: false, karar: false, belge: null });
      return h.tur === 'mesaj' ? h.baslik : null;
    });
    expect(new Set([...basliklar, ...govdeli])).toEqual(new Set([BAGLANTI_HALI_METNI.iptal]));
  });

  it('deneme sınırı ve sunucu hatası "geçersiz" denmeden ayrı yazılır', () => {
    const s429 = onaySayfasiHali(429, null);
    const s500 = onaySayfasiHali(503, null);
    const ag = onaySayfasiHali(null, null);
    for (const h of [s429, s500, ag]) expect(h.tur === 'mesaj' && h.baslik).not.toBe(BAGLANTI_HALI_METNI.iptal);
  });

  it('kullanılmış bağlantı belgeyi gösterir ama karar açmaz ve nedenini yazar', () => {
    const h = onaySayfasiHali(200, { hal: 'kullanildi', okunabilir: true, karar: false, belge: {} });
    expect(h).toEqual({ tur: 'belge', kararAcik: false, not: BAGLANTI_HALI_METNI.kullanildi });
    expect(onaySayfasiHali(200, { hal: 'gecerli', okunabilir: true, karar: true, belge: {} })).toEqual({ tur: 'belge', kararAcik: true, not: null });
  });
});

describe('rehber kaynak rozeti', () => {
  it('KRİTİK: stratejiden gelen değer "Stratejiden", "Önerilen" DEĞİL', () => {
    expect(kaynakRozeti('strateji', 'Önerilen')).toBe('Stratejiden');
    expect(kaynakRozeti('derleyici', 'Önerilen')).toBe('Önerilen');
    expect(kaynakRozeti('kullanici', 'Önerilen')).toBeNull();
    expect(kaynakRozeti(undefined, 'Önerilen')).toBeNull();
    expect(kaynakRozeti('strateji', null)).toBe('Stratejiden');
  });
});


describe('bölüm kaydı gövdesi (kayıtlı hâlden fark)', () => {
  const K = ['ozet', 'isletme'] as const;
  it('KRİTİK: "Strateji öner" uygulanınca ai bölümleri GÖNDERİLİR (gövde boş kalıp 400 almaz)', () => {
    const g = bolumKayitGovdesi({}, { ozet: { metin: 'Öneri', kaynak: 'ai' } }, K);
    expect(g).toEqual({ ozet: { metin: 'Öneri', kaynak: 'ai' } });
  });
  it('KRİTİK: silinen bölüm null gider; değişmeyen gönderilmez; ajans kaynağı korunur', () => {
    const kayitli = { ozet: { metin: 'Eski', kaynak: 'ajans' as const }, isletme: { metin: 'Aynı', kaynak: 'ajans' as const } };
    expect(bolumKayitGovdesi(kayitli, { isletme: { metin: 'Aynı', kaynak: 'ajans' } }, K)).toEqual({ ozet: null });
    expect(bolumKayitGovdesi(kayitli, { ...kayitli, ozet: { metin: 'Yeni', kaynak: 'ajans' } }, K)).toEqual({ ozet: { metin: 'Yeni', kaynak: 'ajans' } });
    expect(bolumKayitGovdesi(kayitli, kayitli, K)).toEqual({});
  });
});

describe('Google kelime araması (Ajan 4 AÇIK-1)', () => {
  const satir = (x: Partial<KelimeSatiri>): KelimeSatiri => ({
    id: x.id ?? 'k',
    kelime: 'satılık daire',
    aylikArama: 1000,
    rekabet: null,
    teklifAltMicros: null,
    teklifUstMicros: null,
    varyantlar: [],
    grup: 'Daire',
    grupElle: false,
    secili: true,
    cekimZamani: '2026-10-13T10:00:00Z',
    ...x,
  });
  const kv = (x: Partial<{ erisim: 'olculmedi' | 'var' | 'yok'; aramaSuruyor: boolean; sonHata: string | null; satirlar: KelimeSatiri[] }>) => ({
    erisim: 'var' as const,
    aramaSuruyor: false,
    sonHata: null,
    satirlar: [],
    ...x,
  });

  it('KRİTİK: hâller ayrı — sürüyor, düştü, bitti, aranmadı, erişim yok aynı boş tabloya dönmez', () => {
    expect(kelimeAramaHali(kv({ aramaSuruyor: true }))).toBe('suruyor');
    expect(kelimeAramaHali(kv({ sonHata: 'Google: kota doldu' }))).toBe('dustu');
    expect(kelimeAramaHali(kv({ satirlar: [satir({})] }))).toBe('bitti');
    expect(kelimeAramaHali(kv({}))).toBe('aranmadi');
    expect(kelimeAramaHali(kv({ erisim: 'yok', sonHata: 'izin yok' }))).toBe('erisim_yok');
    // Ölçülmemiş erişim aramayı KAPATMAZ: erişim ilk aramada ölçülüyor.
    expect(kelimeAramaHali(kv({ erisim: 'olculmedi' }))).toBe('aranmadi');
    // Eski sonuçlar dururken düşen arama "bitti" sayılmaz.
    expect(kelimeAramaHali(kv({ sonHata: 'düştü', satirlar: [satir({})] }))).toBe('dustu');
  });

  it('KRİTİK: kaleme yalnız SEÇİLİ kelimesi olan grup bağlanır; hacim varyantla ikiye katlanmaz', () => {
    const g = seciliKelimeGruplari([
      satir({ id: 'a', grup: 'Daire', aylikArama: 2900, varyantlar: ['satilik daire'] }),
      satir({ id: 'b', grup: 'Daire', aylikArama: null }),
      satir({ id: 'c', grup: 'Manzara', secili: false, aylikArama: 99999 }),
      satir({ id: 'd', grup: null, aylikArama: 500 }),
    ]);
    expect(g).toEqual([{ grup: 'Daire', kelime: 2, aylikArama: 2900 }]);
  });

  it('KRİTİK: Google payı olan Arama kalemi kelimesizse eksik; seçimi boşalan grup ayrı hâl', () => {
    const gruplar = [{ grup: 'Daire' }];
    expect(kalemKelimeDurumu({ amac: 'SITE', google: true, kelimeGrubu: null }, gruplar)).toBe('eksik');
    expect(kalemKelimeDurumu({ amac: 'SITE', google: true, kelimeGrubu: 'Manzara' }, gruplar)).toBe('bos_grup');
    expect(kalemKelimeDurumu({ amac: 'SITE', google: true, kelimeGrubu: 'Daire' }, gruplar)).toBe('tamam');
    expect(kalemKelimeDurumu({ amac: 'SITE', google: false, kelimeGrubu: null }, gruplar)).toBe('gerekmez');
    // Google kurgusu Arama olmayan amaç (Talep Yaratma) kelime istemez.
    expect(kalemKelimeDurumu({ amac: 'ERISIM', google: true, kelimeGrubu: null }, gruplar)).toBe('gerekmez');
  });
});
