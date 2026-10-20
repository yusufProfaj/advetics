import { describe, expect, it } from 'vitest';
import {
  beklenenYankilar,
  derleMeta,
  geriOkumaKarsilastir,
  googleKitlesiKopyasi,
  hedeflemeUret,
  kitleKimlikleri,
  kitleKonumlari,
  kitleYasAraligi,
  metaKitlesiKopyasi,
  rehberAlanlariSchema,
  rehberdenMeta,
  rehberEksikleri,
  taslakEksikleri,
  type DerlemeGirdisi,
  type KitleSablonuRecord,
  type MetaGovdesi,
  type RehberAlanlari,
  type RehberEksikBaglami,
  type RehberMetaKitlesi,
  type TaslakAlanlari,
} from '@advetics/shared';

/**
 * ═══ HEDEF KİTLELER 2. PARÇA — Meta'ya giden kayıtlı kitle ═══
 *
 * Sorular (MIMARI Ç3, Ç6, Ç8): (1) ilgi alanları TEK `flexible_spec`
 * öğesinde (birleşim), dahil/hariç özel kitle ayrı anahtarlarda ve
 * Advantage+ kitle açık mı, (2) kısıtlı kategoride hiçbiri gitmiyor ve
 * adıyla söyleniyor mu, (3) rehber → taslak kopyası kitlesiz rehberde
 * hiçbir anahtar yazmıyor mu, (4) başka hesabın özel kitlesi iki kapıda
 * da duruyor mu, (5) geri okuma kitleyi kimlik kümesiyle kıyaslıyor mu.
 * Canlıda HİÇ koşmadı (MIMARI § 5 ölçüm 1).
 */

const Z = '2026-10-10T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const al = <T>(deger: T) => ({ deger, kaynak: 'kullanici' as const, kim: KIM, zaman: Z });
const HESAP = U(1);
const BASKA_HESAP = U(3);

const IZMIR = { tur: 'region' as const, key: '2347', etiket: 'İzmir', ulkeKodu: 'TR' };
const ILGILER = [
  { id: '6003107902433', name: 'Gayrimenkul' },
  { id: '6003020834693', name: 'Ev dekorasyonu' },
];
const ozel = (id: string, mod: 'dahil' | 'haric', hesapId = HESAP) => ({ id, name: `Kitle ${id}`, tip: 'ozel' as const, mod, hesapId, hesapAdi: hesapId === HESAP ? 'Ege Birlik Reklam 1' : 'Ege Birlik Reklam 2' });

const temelHedef = { konumlar: [IZMIR], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null, advantageAudience: 1 as const, kategoriler: [] };

describe('hedeflemeUret: kitlenin Meta parçası', () => {
  it('ilgiler TEK flexible_spec öğesinde; dahil ve hariç ayrı; Advantage+ kitle AÇIK kalır', () => {
    const r = hedeflemeUret({ ...temelHedef, ilgiler: ILGILER, ozelKitleler: [ozel('11', 'dahil'), ozel('22', 'haric')] });
    expect(r.tur).toBe('tamam');
    if (r.tur !== 'tamam') return;
    expect(r.targeting.flexible_spec).toEqual([{ interests: ILGILER }]);
    expect(r.targeting.custom_audiences).toEqual([{ id: '11' }]);
    expect(r.targeting.excluded_custom_audiences).toEqual([{ id: '22' }]);
    expect(r.targeting.targeting_automation).toEqual({ advantage_audience: 1 });
  });

  it('kitle yoksa hiçbir kitle anahtarı yazılmaz (eski gövde)', () => {
    const r = hedeflemeUret(temelHedef);
    if (r.tur !== 'tamam') throw new Error('ret');
    for (const k of ['flexible_spec', 'custom_audiences', 'excluded_custom_audiences']) expect(k in r.targeting).toBe(false);
  });

  it('yalnız hariç kitle: custom_audiences YAZILMAZ (boş dizi göndermek yok)', () => {
    const r = hedeflemeUret({ ...temelHedef, ozelKitleler: [ozel('22', 'haric')] });
    if (r.tur !== 'tamam') throw new Error('ret');
    expect('custom_audiences' in r.targeting).toBe(false);
    expect(r.targeting.excluded_custom_audiences).toEqual([{ id: '22' }]);
  });

  it('KISITLI KATEGORİ: ilgi ve özel kitle gönderilmez, kapatılanlarda adıyla yazar', () => {
    const r = hedeflemeUret({ ...temelHedef, kategoriler: ['HOUSING'], ilgiler: ILGILER, ozelKitleler: [ozel('11', 'dahil'), ozel('22', 'haric')] });
    if (r.tur !== 'tamam') throw new Error('ret');
    for (const k of ['flexible_spec', 'custom_audiences', 'excluded_custom_audiences']) expect(k in r.targeting).toBe(false);
    expect(r.kapatilanlar).toEqual(expect.arrayContaining(['2 ilgi alanı (bu reklam türünde kullanılamıyor)', '2 özel kitle (bu reklam türünde kullanılamıyor)']));
  });
});

const META_KITLESI: RehberMetaKitlesi = {
  kitleId: U(40),
  ad: 'İzmir ev sahipleri',
  cinsiyet: 'kadin',
  ilgiler: ILGILER,
  ozelKitleler: [ozel('11', 'dahil'), ozel('22', 'haric')],
};

function rehber(ek: Partial<RehberAlanlari> = {}): RehberAlanlari {
  return {
    amac: al('SITE' as const),
    platformlar: al({ meta: true, google: false }),
    metaHesabiId: al(HESAP),
    sayfaId: al(U(4)),
    konumlar: al([IZMIR]),
    ekKategoriler: al([]),
    hedefAdres: al('https://ornek.com.tr'),
    metin: al({ anaMetin: 'Metin', basliklar: ['Başlık'], aciklamalar: [] }),
    butce: al({ tip: 'gunluk' as const, micros: '500000000' }),
    takvim: al({ baslangic: '2026-10-11', bitis: null }),
    ...ek,
  };
}
const meta = (a: RehberAlanlari) => {
  const r = rehberdenMeta(a, { meta: true, google: false }, 'TRY', Z, new Map(), 'bilinmiyor');
  if (r.tur !== 'tamam') throw new Error(`ret: ${r.kodlar.join(',')}`);
  return r.deger;
};

describe('rehber → Meta taslağı (seçim anında kopya, Ç6)', () => {
  it('kitle seçiliyse taslağa ilgi + özel kitle ve cinsiyet ipucu taşınır', () => {
    const t = meta(rehber({ metaKitlesi: al(META_KITLESI) }));
    expect(t.kitle?.deger).toEqual({ kitleId: U(40), ad: 'İzmir ev sahipleri', ilgiler: ILGILER, ozelKitleler: META_KITLESI.ozelKitleler });
    expect(t.ipucuCinsiyet?.deger).toBe('kadin');
    // Kaynağı taslağın kilidinden geçer (KAYNAK eksiği yok).
    expect(taslakEksikleri(t).filter((e) => e.kod === 'KAYNAK')).toEqual([]);
  });

  it('"kitle seçme" (null) ve hiç dokunulmamış rehber: anahtar YOK (kayıtlı provalar bayatlamaz)', () => {
    for (const a of [rehber(), rehber({ metaKitlesi: al(null) })]) {
      const t = meta(a);
      expect('kitle' in t).toBe(false);
      expect('ipucuCinsiyet' in t).toBe(false);
    }
  });

  it('tüm cinsiyetler: ipucu yazılmaz', () => {
    expect('ipucuCinsiyet' in meta(rehber({ metaKitlesi: al({ ...META_KITLESI, cinsiyet: null }) }))).toBe(false);
  });

  it('rehber şeması kopyayı kabul eder, geçersiz özel kitleyi reddeder', () => {
    expect(rehberAlanlariSchema.safeParse({ metaKitlesi: al(META_KITLESI) }).success).toBe(true);
    expect(rehberAlanlariSchema.safeParse({ metaKitlesi: al({ ...META_KITLESI, ozelKitleler: [{ id: 'x' }] }) }).success).toBe(false);
  });
});

const BAGLAM: RehberEksikBaglami = {
  ajansYoneticisi: true,
  onKosullar: null,
  yasalUyari: null,
  asgariGunluk: { meta: null, googleTalepYaratma: null },
  paraBirimi: 'TRY',
  paraBirimleriAyni: true,
};
const kodlar = (a: RehberAlanlari) => rehberEksikleri(a, BAGLAM).map((e) => `${e.kod}:${e.seviye}`);

describe('Ç8: başka hesabın özel kitlesi', () => {
  const yabanci = { ...META_KITLESI, ozelKitleler: [ozel('33', 'haric', BASKA_HESAP)] };

  it('rehber eksik listesinde ENGEL ve hesabın adını söyler', () => {
    const e = rehberEksikleri(rehber({ metaKitlesi: al(yabanci) }), BAGLAM).find((x) => x.kod === 'KITLE-HESAP');
    expect(e).toMatchObject({ seviye: 'engel', platform: 'meta', adim: 3 });
    expect(e!.metin).toContain('Ege Birlik Reklam 2');
  });

  it('aynı hesabın kitlesi engel değil', () => {
    expect(kodlar(rehber({ metaKitlesi: al(META_KITLESI) }))).not.toContain('KITLE-HESAP:engel');
  });

  it('YAYIN KAPISI: taslak eksik listesi de durdurur (hesap sonradan değişirse)', () => {
    const t: TaslakAlanlari = { ...meta(rehber({ metaKitlesi: al(META_KITLESI) })), reklamHesabiId: al(BASKA_HESAP) };
    expect(taslakEksikleri(t).map((e) => e.kod)).toContain('KITLE-HESAP');
  });
});

describe('kitle eksikleri: gitmeyen kitle sessiz kalmaz', () => {
  it('kısıtlı kategoride ilgi/özel kitle gönderilmez: UYARI', () => {
    expect(kodlar(rehber({ metaKitlesi: al(META_KITLESI), ekKategoriler: al(['HOUSING' as const]) }))).toContain('KITLE-KISITLI:uyari');
  });

  it('Google Arama amacında Google kitlesi: UYARI (Ç4)', () => {
    const a = rehber({
      platformlar: al({ meta: false, google: true }),
      googleHesabiId: al(U(2)),
      googleKitlesi: al({ kitleId: U(41), ad: 'G', cinsiyet: null, ilgiler: [], kelimeler: ['konut'] }),
    });
    expect(kodlar(a)).toContain('KITLE-ARAMA:uyari');
  });

  it('platform kapalıyken kalan kitle: UYARI', () => {
    expect(kodlar(rehber({ platformlar: al({ meta: false, google: true }), googleHesabiId: al(U(2)), metaKitlesi: al(META_KITLESI) }))).toContain('KITLE-META-KAPALI:uyari');
  });
});

// ── Geri okuma ──────────────────────────────────────────────────────────────

const temel: DerlemeGirdisi = {
  apiSurumu: 'v25.0',
  yayinKimligi: '7q2kab12-0000-4000-8000-000000000000',
  tarih: '2026-10-07',
  workspaceKisaAdi: 'Örnek',
  niyet: 'SITE',
  hesap: { platformId: 'act_1', paraBirimi: 'TRY' },
  sayfaPlatformId: '111',
  instagramPlatformId: '222',
  hedefleme: { konumlar: [IZMIR], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null, ilgiler: ILGILER, ozelKitleler: [ozel('11', 'dahil'), ozel('22', 'haric')] },
  kategoriler: { taban: [], ek: [] },
  butce: { tip: 'gunluk', micros: 500_000_000n, seviye: 'kampanya' },
  takvim: { baslangic: '2026-10-08T00:00:00+0300', bitis: null },
  atif: 'tik7_gor1',
  kavramlar: [{ gorselHash: 'h1', baslik: 'B1', metin: 'M1' }],
  hedefAdres: 'https://ornek.com.tr',
  formId: null,
  telefon: null,
  urlEtiketleri: null,
};
function derle(): MetaGovdesi[] {
  const r = derleMeta(temel);
  if (r.tur !== 'govde') throw new Error('ret');
  return r.govdeler;
}
function ayna(gs: MetaGovdesi[]): Record<string, Record<string, any>> {
  const doldur = (v: unknown): unknown =>
    typeof v === 'string' && /^\{.+\}$/.test(v) ? '123' : Array.isArray(v) ? v.map(doldur) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, doldur(x)])) : v;
  return Object.fromEntries(gs.map((g) => [g.ad, doldur(structuredClone(g.alanlar)) as Record<string, unknown>])) as Record<string, Record<string, any>>;
}
const karsilastir = (y: ReturnType<typeof beklenenYankilar>, o: Record<string, Record<string, unknown>>) => geriOkumaKarsilastir(y, o, { yasalUyariVar: false });

describe('geri okuma: kitle kimlik kümesiyle', () => {
  const gs = derle();
  const y = beklenenYankilar(gs);

  it('derlenen set gövdesi kitleyi taşıyor ve üç yol kimlik kümesiyle kıyaslanıyor, kabul edilemez', () => {
    const set = gs.find((g) => g.nesne === 'reklam_seti')!.alanlar.targeting as Record<string, unknown>;
    expect(set.flexible_spec).toEqual([{ interests: ILGILER }]);
    for (const yol of ['targeting.flexible_spec', 'targeting.custom_audiences', 'targeting.excluded_custom_audiences']) {
      expect(y.find((x) => x.alanYolu === yol)).toMatchObject({ karsilastirma: 'kimlik_kumesi', kabulEdilemez: true });
    }
  });

  it("Meta ad ekleyip sırayı değiştirse de AYNI kitle temiz", () => {
    const o = ayna(gs);
    const t = o.reklam_seti!.targeting;
    t.flexible_spec = [{ interests: [{ id: ILGILER[1]!.id, name: 'Home décor' }, { id: ILGILER[0]!.id, name: 'Real estate' }] }];
    t.custom_audiences = [{ id: '11', name: 'Kitle 11' }];
    t.excluded_custom_audiences = [{ id: '22', name: 'Kitle 22' }];
    expect(karsilastir(y, o).sonuc).toBe('temiz');
  });

  it('KRİTİK: hariç kitle DÜŞERSE fark (Advantage+ altında da dışarıda kalmalı)', () => {
    const o = ayna(gs);
    delete o.reklam_seti!.targeting.excluded_custom_audiences;
    const r = karsilastir(y, o);
    expect(r.sonuc).not.toBe('temiz');
  });

  it('bir ilgi düşerse ya da Meta başka bir hedefleme türü eklerse fark', () => {
    const eksik = ayna(gs);
    eksik.reklam_seti!.targeting.flexible_spec = [{ interests: [ILGILER[0]] }];
    expect(karsilastir(y, eksik).sonuc).toBe('fark');
    const ek = ayna(gs);
    ek.reklam_seti!.targeting.flexible_spec = [{ interests: ILGILER, behaviors: [{ id: '9' }] }];
    expect(karsilastir(y, ek).sonuc).toBe('fark');
  });

  it('kimlik kümesi: tanınmayan biçim null (eşit sayılmaz)', () => {
    expect(kitleKimlikleri([{ id: 2 }, { id: '1' }])).toEqual(['1', '2']);
    expect(kitleKimlikleri([{ interests: [{ id: '5' }] }])).toEqual(['interests:5']);
    expect(kitleKimlikleri('x')).toBeNull();
    expect(kitleKimlikleri([{ interests: [{ ad: 'kimliksiz' }] }])).toBeNull();
  });
});

// ── Seçim kopyası (panel ile aynı fonksiyon) ────────────────────────────────

const kayit = (ek: Partial<KitleSablonuRecord>): KitleSablonuRecord => ({
  id: U(40),
  clientId: U(9),
  platform: 'meta',
  name: 'İzmir ev sahipleri',
  locations: [{ type: 'region', key: '2347', label: 'İzmir, Türkiye', countryCode: 'TR' }],
  ageMin: 30,
  ageMax: 55,
  genders: 'female',
  interests: ILGILER,
  ozelKitleler: [ozel('11', 'dahil')],
  google: { ilgiler: [], kelimeler: [] },
  varsayilan: false,
  updatedAt: Z,
  ...ek,
});

describe('kitle seçimi kopyası', () => {
  it('Meta kopyası; Google kitlesi Meta seçicisine giremez', () => {
    expect(metaKitlesiKopyasi(kayit({}))).toEqual({ kitleId: U(40), ad: 'İzmir ev sahipleri', cinsiyet: 'kadin', ilgiler: ILGILER, ozelKitleler: [ozel('11', 'dahil')] });
    expect(metaKitlesiKopyasi(kayit({ platform: 'google' }))).toBeNull();
  });

  it('Google kopyası; Meta kitlesi Google seçicisine giremez', () => {
    const g = kayit({ platform: 'google', interests: [], ozelKitleler: [], genders: 'all', google: { ilgiler: [{ id: '1', ad: 'A', tur: 'affinity' }], kelimeler: ['konut'] } });
    expect(googleKitlesiKopyasi(g)).toEqual({ kitleId: U(40), ad: 'İzmir ev sahipleri', cinsiyet: null, ilgiler: [{ id: '1', ad: 'A', tur: 'affinity' }], kelimeler: ['konut'] });
    expect(googleKitlesiKopyasi(kayit({}))).toBeNull();
  });

  it('kopya kaynaktan BAĞIMSIZ: kayıt sonradan değişse de rehberdeki değişmez', () => {
    const k = kayit({});
    const kopya = metaKitlesiKopyasi(k)!;
    k.interests.push({ id: '999', name: 'Yeni' });
    k.ozelKitleler[0]!.mod = 'haric';
    expect(kopya.ilgiler).toHaveLength(2);
    expect(kopya.ozelKitleler[0]!.mod).toBe('dahil');
  });

  it('konum ve yaş çevirisi; 18-65 daraltma değil', () => {
    expect(kitleKonumlari(kayit({}))).toEqual([{ tur: 'region', key: '2347', etiket: 'İzmir, Türkiye', ulkeKodu: 'TR' }]);
    expect(kitleYasAraligi({ ageMin: 30, ageMax: 55 })).toEqual({ min: 30, max: 55 });
    expect(kitleYasAraligi({ ageMin: 18, ageMax: 65 })).toBeNull();
  });
});
