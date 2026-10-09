import { describe, expect, it } from 'vitest';
import {
  REHBER_ACILIS,
  REHBER_AMACLARI,
  REHBER_AMAC_KODLARI,
  NIYET_KATALOGU,
  acikPlatformlar,
  amacGorunurMu,
  butceBol,
  gunlukEsdeger,
  kararTablosu,
  platformAcilabilirMi,
  platformGorunurMu,
  reklamGucu,
  rehberAlanlariSchema,
  rehberEksikleri,
  rehberdenGoogle,
  rehberdenMeta,
  taslakAlanlariSchema,
  taslakEksikleri,
  uyumDenetle,
  yayinaEngelVarMi,
  type RehberAlanlari,
  type RehberEksikBaglami,
} from '@advetics/shared';

const TL = (n: number) => BigInt(n) * 1_000_000n;
const Z = '2026-10-10T09:00:00.000+03:00';
const KIM = '11111111-1111-4111-8111-111111111111';
const al = <T>(deger: T, kaynak: 'kullanici' | 'derleyici' | 'marka_merkezi' | 'workspace_profili' | 'ai_onerisi' = 'kullanici') => ({
  deger,
  kaynak,
  kim: KIM,
  zaman: Z,
});
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Ege Birlik Yapı · Garden Villas benzeri, SITE + iki platform, eksiksiz. */
function tamSite(): RehberAlanlari {
  return {
    amac: al('SITE' as const),
    platformlar: al({ meta: true, google: true }, 'derleyici'),
    metaHesabiId: al(U(1), 'workspace_profili'),
    googleHesabiId: al(U(2), 'workspace_profili'),
    sayfaId: al(U(3), 'workspace_profili'),
    instagramId: al(U(4), 'workspace_profili'),
    konumlar: al(
      [{ tur: 'city' as const, key: '2347574', etiket: 'İzmir', ulkeKodu: 'TR', google: { kaynak: 'geoTargetConstants/1012782', ad: 'İzmir' } }],
      'marka_merkezi',
    ),
    ekKategoriler: al([]),
    hedefAdres: al('https://gardenvillaskusadasi.com/', 'marka_merkezi'),
    medya: al([{ varlikId: U(10) }, { varlikId: U(11) }]),
    metin: al({
      anaMetin: "Kuşadası'nda denize 5 dakika, özel havuzlu villalar.",
      basliklar: ['Özel Havuzlu Villalar', 'Kuşadası Garden Villas', 'Denize 5 Dakika Yürüme'],
      aciklamalar: ['3+1 bahçeli villalar, site içinde havuz.', 'Taksit seçenekleriyle teslime hazır villalar.'],
    }),
    anahtarKelimeler: al([
      { metin: 'kuşadası satılık villa', aylikArama: 2900 },
      { metin: 'havuzlu villa kuşadası', aylikArama: 880 },
      { metin: 'kuşadası villa projeleri', aylikArama: 590 },
      { metin: 'denize yakın villa', aylikArama: 1600 },
      { metin: 'kuşadası villa', aylikArama: null },
    ]),
    butce: al({ tip: 'gunluk' as const, micros: TL(500).toString() }),
    metaPayiYuzde: al(50, 'derleyici'),
    takvim: al({ baslangic: '2026-10-11', bitis: '2026-11-09' }),
  };
}

const B: RehberEksikBaglami = {
  ajansYoneticisi: true,
  onKosullar: {
    metaFormKosullari: true,
    metaWhatsapp: true,
    metaSatisOlcumu: true,
    googleSatisOlcumu: true,
    googleDonusumEtkin: false,
    googleLogoVeAd: true,
    gizlilikAdresi: true,
  },
  yasalUyari: null,
  asgariGunluk: { meta: 49_340_000n, googleTalepYaratma: TL(250) },
  paraBirimi: 'TRY',
  paraBirimleriAyni: true,
};
const kodlar = (a: RehberAlanlari, b: RehberEksikBaglami = B) => rehberEksikleri(a, b).map((e) => e.kod);

describe('amaç kataloğu ve açılış tablosu', () => {
  it('her amacın Meta dalı GERÇEK bir niyete bağlı (ikinci Meta eşlemesi yok)', () => {
    for (const k of REHBER_AMAC_KODLARI) expect(NIYET_KATALOGU[REHBER_AMACLARI[k].meta.niyet]).toBeDefined();
  });

  it('Google karşılığı olmayan amaç tablo "acik" dese bile görünmez', () => {
    expect(REHBER_AMACLARI.WHATSAPP.google.kurgu).toBeNull();
    const eski = REHBER_ACILIS.WHATSAPP.google;
    (REHBER_ACILIS.WHATSAPP as Record<string, string>).google = 'acik';
    try {
      expect(platformGorunurMu('WHATSAPP', 'google', true)).toBe(false);
    } finally {
      (REHBER_ACILIS.WHATSAPP as Record<string, string>).google = eski;
    }
  });

  it('deneme açılışı yalnız ajans yöneticisine görünür ve AÇILMAZ', () => {
    expect(REHBER_ACILIS.SITE.meta).toBe('deneme');
    expect(platformGorunurMu('SITE', 'meta', true)).toBe(true);
    expect(platformGorunurMu('SITE', 'meta', false)).toBe(false);
    expect(platformAcilabilirMi('SITE', 'meta')).toBe(false);
    expect(amacGorunurMu('WHATSAPP', true)).toBe(false);
  });
});

describe('butceBol — kuruş kaybı yok', () => {
  it('eşit pay: iki yarı ve toplam korunur', () => {
    expect(butceBol(TL(500), { meta: true, google: true }, 50, 'TRY')).toEqual({ meta: TL(250), google: TL(250) });
  });

  it('bölünmeyen tutar: Meta AŞAĞI yuvarlanır, Google kalanı alır, toplam aynı', () => {
    const r = butceBol(333_330_000n, { meta: true, google: true }, 35, 'TRY');
    expect(r.meta % 10_000n).toBe(0n); // kuruşa yuvarlı
    expect(r.meta + r.google).toBe(333_330_000n);
    expect(r.meta).toBe(116_660_000n);
  });

  it('tek platform tutarın tamamını alır; pay sınır dışıysa fırlatır', () => {
    expect(butceBol(TL(500), { meta: false, google: true }, 50, 'TRY')).toEqual({ meta: 0n, google: TL(500) });
    expect(() => butceBol(TL(500), { meta: true, google: true }, 95, 'TRY')).toThrow();
    expect(() => butceBol(0n, { meta: true, google: false }, 50, 'TRY')).toThrow();
  });

  it('toplam bütçenin günlük eşdeğeri dönem gününe bölünür; bitişsiz toplam null', () => {
    expect(gunlukEsdeger(TL(3000), 'toplam', { baslangic: '2026-10-11', bitis: '2026-10-20' })).toBe(TL(300));
    expect(gunlukEsdeger(TL(3000), 'toplam', { baslangic: '2026-10-11', bitis: null })).toBeNull();
    expect(gunlukEsdeger(TL(80), 'gunluk', null)).toBe(TL(80));
  });
});

describe('rehberEksikleri — tek "yayından önce" listesi', () => {
  it('eksiksiz SITE rehberinde engel yok', () => {
    const e = rehberEksikleri(tamSite(), B);
    expect(e.filter((x) => x.seviye === 'engel')).toEqual([]);
    expect(yayinaEngelVarMi(e)).toBe(false);
  });

  it('amaç yoksa YALNIZ amaç eksiği döner (geri kalan anlamsız)', () => {
    expect(kodlar({})).toEqual(['AMAC']);
  });

  it('"Metin öner"in metni onaylanmadan derlenmez (KAYNAK)', () => {
    const a = tamSite();
    a.metin = al(a.metin!.deger, 'ai_onerisi');
    expect(kodlar(a)).toContain('KAYNAK');
  });

  it('Google Arama: anahtar kelimesiz kampanya hiç harcamaz, ENGEL', () => {
    const a = tamSite();
    a.anahtarKelimeler = al([]);
    expect(kodlar(a)).toContain('G-KELIME');
    a.platformlar = al({ meta: true, google: false });
    expect(kodlar(a)).not.toContain('G-KELIME');
  });

  it('Google sınırları kesin: 31 karakterlik başlık ve 2 başlık ENGEL', () => {
    const a = tamSite();
    a.metin = al({ ...a.metin!.deger, basliklar: ['a'.repeat(31), 'İkinci başlık'] });
    const k = kodlar(a);
    expect(k).toContain('METIN-BASLIK-UZUN');
    expect(k).toContain('G-BASLIK-SAYI');
  });

  it('Google açıkken eşlenmemiş konum ENGEL; yalnız Meta açıkken değil', () => {
    const a = tamSite();
    a.konumlar = al([{ tur: 'city' as const, key: '1', etiket: 'Kuşadası', ulkeKodu: 'TR', google: null }]);
    expect(kodlar(a)).toContain('G-KONUM');
    a.platformlar = al({ meta: true, google: false });
    expect(kodlar(a)).not.toContain('G-KONUM');
  });

  it('kategori sorusu cevaplanmadan yayın yok; siyasi ENGEL', () => {
    const a = tamSite();
    delete a.ekKategoriler;
    expect(kodlar(a)).toContain('OZK-SORU');
    a.ekKategoriler = al(['ISSUES_ELECTIONS_POLITICS'] as const);
    expect(kodlar(a)).toContain('OZK-SIYASI');
  });

  it('konutta yaş daraltılamaz (Kime adımında söylenir)', () => {
    const a = tamSite();
    a.ekKategoriler = al(['HOUSING'] as const);
    expect(kodlar(a)).not.toContain('KTL-KISITLI');
    a.yasAraligi = al({ min: 35, max: 65 });
    expect(kodlar(a)).toContain('KTL-KISITLI');
  });

  it("Meta'ya düşen günlük asgarinin altında ENGEL; okunamayan asgari yalnız UYARI", () => {
    const a = tamSite();
    a.butce = al({ tip: 'gunluk' as const, micros: TL(80).toString() }); // 40 / 40
    const e = rehberEksikleri(a, B);
    expect(e.find((x) => x.kod === 'M-ASGARI')?.seviye).toBe('engel');
    const e2 = rehberEksikleri(a, { ...B, asgariGunluk: { meta: null, googleTalepYaratma: TL(250) } });
    expect(e2.find((x) => x.kod === 'M-ASGARI-BILINMIYOR')?.seviye).toBe('uyari');
    expect(e2.some((x) => x.kod === 'M-ASGARI')).toBe(false);
  });

  it('ön koşul false ENGEL, null (kontrol edilemedi) UYARI', () => {
    const a = { ...tamSite(), amac: al('FORM' as const), formSablonuId: al(U(20)) };
    const yok = rehberEksikleri(a, { ...B, onKosullar: { ...B.onKosullar!, metaFormKosullari: false } });
    expect(yok.find((x) => x.kod === 'M-FORM-KOSUL')?.seviye).toBe('engel');
    const bilinmiyor = rehberEksikleri(a, { ...B, onKosullar: { ...B.onKosullar!, metaFormKosullari: null } });
    expect(bilinmiyor.find((x) => x.kod === 'M-FORM-KOSUL-BILINMIYOR')?.seviye).toBe('uyari');
  });

  it('yasal uyarı: Meta ana metinde, Google en az bir açıklamada', () => {
    const a = tamSite();
    const k = kodlar(a, { ...B, yasalUyari: 'Görseller temsilidir.' });
    expect(k).toContain('YASAL-UYARI');
    expect(k).toContain('G-YASAL-UYARI');
  });

  it('iki hesabın para birimi farklıysa tek tutar bölünemez', () => {
    expect(kodlar(tamSite(), { ...B, paraBirimleriAyni: false })).toContain('PARA-BIRIMI');
  });

  it("ajans yöneticisi olmayan kullanıcıda 'deneme' platformlar kapalı sayılır", () => {
    expect(acikPlatformlar(tamSite(), false)).toEqual({ meta: false, google: false });
    expect(kodlar(tamSite(), { ...B, ajansYoneticisi: false })).toContain('PLT-YOK');
  });
});

describe('rehberdenMeta — mevcut Meta zincirine bağlanır', () => {
  it('türetilen taslak Meta şemasından geçer ve Meta eksik listesi temiz', () => {
    const r = rehberdenMeta(tamSite(), 'TRY', Z);
    expect(r.tur).toBe('tamam');
    if (r.tur !== 'tamam') return;
    expect(taslakAlanlariSchema.safeParse(r.deger).success).toBe(true);
    expect(r.deger.niyet?.deger).toBe('SITE');
    // Meta'ya YALNIZ kendi payı gider.
    expect(r.deger.butce?.deger.micros).toBe(TL(250).toString());
    expect(r.deger.butce?.kaynak).toBe('kullanici');
    expect(taslakEksikleri(r.deger)).toEqual([]);
  });

  it('her görsel bir kavram; başlıklar sırayla, metin TEK', () => {
    const r = rehberdenMeta(tamSite(), 'TRY', Z);
    if (r.tur !== 'tamam') throw new Error('ret');
    const k = r.deger.kavramlar!.deger;
    expect(k.map((x) => x.baslik)).toEqual(['Özel Havuzlu Villalar', 'Kuşadası Garden Villas']);
    expect(new Set(k.map((x) => x.metin)).size).toBe(1);
    // Google konum kimliği Meta taslağına SIZMAZ (Meta şeması strict).
    expect(JSON.stringify(r.deger.konumlar)).not.toContain('geoTargetConstants');
  });

  it('VIDEO amacı Meta tarafında VIDEO_IZLENME niyetine gider', () => {
    const a = { ...tamSite(), amac: al('VIDEO' as const) };
    const r = rehberdenMeta(a, 'TRY', Z);
    expect(r.tur === 'tamam' && r.deger.niyet?.deger).toBe('VIDEO_IZLENME');
  });
});

describe('rehberdenGoogle — derleme girdisi', () => {
  const GB = { musteriId: '612-448-2093', paraBirimi: 'TRY', saatDilimi: 'Europe/Istanbul', donusumEtkin: false, isletmeAdi: 'Garden Villas', logoVarlikId: null, kategoriTabani: [] };

  it('SITE → ARAMA/site, kalan pay, tiresiz müşteri kimliği, taban negatifler', () => {
    const r = rehberdenGoogle(tamSite(), GB);
    expect(r.tur).toBe('tamam');
    if (r.tur !== 'tamam') return;
    expect(r.deger.kurgu).toBe('ARAMA');
    expect(r.deger.ulasma).toBe('site');
    expect(r.deger.musteriId).toBe('6124482093');
    expect(r.deger.butce.micros).toBe(TL(250));
    expect(r.deger.konumlar).toEqual(['geoTargetConstants/1012782']);
    expect(r.deger.negatifler).toContain('ücretsiz');
  });

  it('dönüşüm ölçülmüyorsa ya da bilinmiyorsa Maksimum tıklama', () => {
    const t = (donusumEtkin: boolean | null) => {
      const r = rehberdenGoogle(tamSite(), { ...GB, donusumEtkin });
      return r.tur === 'tamam' ? r.deger.teklif : null;
    };
    expect(t(false)).toBe('MAKS_TIKLAMA');
    expect(t(null)).toBe('MAKS_TIKLAMA');
    expect(t(true)).toBe('MAKS_DONUSUM');
  });

  it('eşlenmemiş konum ya da WhatsApp amacı ret', () => {
    const a = tamSite();
    a.konumlar = al([{ tur: 'city' as const, key: '1', etiket: 'X', ulkeKodu: 'TR' }]);
    expect(rehberdenGoogle(a, GB)).toEqual({ tur: 'ret', kodlar: ['G-KONUM'] });
    const w = { ...tamSite(), amac: al('WHATSAPP' as const) };
    const r = rehberdenGoogle(w, GB);
    expect(r.tur === 'ret' && r.kodlar).toContain('G-KARSILIK-YOK');
  });
});

describe('kararTablosu ve uyum denetçisi', () => {
  it('kapalı platformun hücresi boş; Google Arama ağ kapatmayı söyler', () => {
    const t = kararTablosu('SITE', { meta: false, google: true }, 'MAKS_TIKLAMA');
    expect(t.every((s) => s.meta === null)).toBe(true);
    expect(t.find((s) => s.kod === 'NEREDE')?.google?.not).toContain('Görüntülü Reklam Ağı kapalı');
  });

  it('uyum: siyasi, eksik yasal uyarı ve konutta daraltma durdurur; temiz girdi geçer', () => {
    const temel = { platformlar: { meta: true, google: true }, kategoriler: [], yasalUyari: null, metaAnaMetin: 'x', googleAciklamalar: ['y'], enDusukYas: 18, yasAraligi: null, cinsiyetDaraltmasi: false };
    expect(uyumDenetle(temel).tur).toBe('gecti');
    const d = uyumDenetle({ ...temel, kategoriler: ['HOUSING'], yasAraligi: { min: 25, max: 65 } });
    expect(d.tur === 'durdu' && d.bulgular.map((b) => b.kod)).toEqual(['UYUM-KISITLI-KITLE']);
    const y = uyumDenetle({ ...temel, yasalUyari: 'Görseller temsilidir.' });
    expect(y.tur === 'durdu' && y.bulgular.map((b) => b.kod)).toEqual(['UYUM-YASAL-META', 'UYUM-YASAL-GOOGLE']);
  });

  it('reklam gücü: tekrar eden başlık zayıf, 8+ benzersiz başlık iyi', () => {
    expect(reklamGucu({ anaMetin: '', basliklar: ['A', 'a', 'B'], aciklamalar: ['x', 'y'] }).gucu).toBe('zayif');
    expect(reklamGucu({ anaMetin: '', basliklar: 'ABCDEFGH'.split(''), aciklamalar: ['x', 'y'] }).gucu).toBe('iyi');
  });

  it('şema: tanınmayan alan reddedilir (strict)', () => {
    expect(rehberAlanlariSchema.safeParse({ uydurma: al(1) }).success).toBe(false);
    expect(rehberAlanlariSchema.safeParse(tamSite()).success).toBe(true);
  });
});
