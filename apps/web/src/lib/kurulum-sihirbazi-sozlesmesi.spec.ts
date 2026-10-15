import { describe, expect, it } from 'vitest';
import { adimBeyanlari } from '@/components/kurulum/sihirbaz-akisi';
import {
  KURULUM_BEYAN_OGELERI,
  REHBER_AMAC_KODLARI,
  SITE_YOK_KAPSAM_DISI_ADIMLAR,
  WORKSPACE_BEYAN_OGELERI,
  kurulumBeyaniSchema,
  siteYokKurulumKodlari,
  siteYokMu,
  siteYokRehberKapisi,
  sirketKurulumBeyaniSchema,
  type HazirlamaYaniti,
  type KurulumAdimKodu,
  type KurulumAdimDurumu,
  type KurulumBeyani,
  type KurulumYaniti,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import {
  KURULUM_LISTESI,
  SIHIRBAZ_ADI,
  eksikleriTamamlaKapsami,
  hicEksikYok,
  ilkEksikAdim,
  kurulumListesi,
  kurulumSayaci,
  sihirbazAdresi,
  sirketKurulumListesi,
  type KurulumListesiGirdisi,
  type SirketKurulumGirdisi,
} from './panel-adresleri';

/**
 * ═══ BİRLEŞİK KURULUM SİHİRBAZI — SÖZLEŞME TESTLERİ ═══
 * (docs/kurulum-sihirbazi/MIMARI.md § 10)
 *
 * Sözleşme `packages/shared`ta ve testleri burada koşuyor (panel `dist`i
 * okuyor): shared'da bir satırı bozarak mutasyon yaparken önce
 * `tsc -p packages/shared/tsconfig.json`, sonra bu dosya, sonra geri al ve
 * TEKRAR derle — derlenmeyen mutasyon hiçbir şeyi sınamaz.
 */

const KURULUM_KODLARI: KurulumAdimKodu[] = [
  'meta_hesap', 'meta_odeme', 'sayfa', 'google_hesap', 'google_odeme', 'google_izin', 'gtm_konteyner',
  'ga4_mulk', 'meta_piksel', 'ads_donusum', 'ga4_ads_bag', 'gtm_etiket', 'site_kodu', 'dogrulama', 'marka',
];

function kurulum(ozel: Partial<Record<KurulumAdimKodu, { durum: KurulumAdimDurumu; otomatik?: boolean }>> = {}): KurulumYaniti {
  return {
    clientId: 'ws-1',
    workspaceAdi: 'Narlıdere Konutları',
    site: null,
    hesapSahibi: null,
    kullanilmayanPlatformlar: [],
    platformBeyani: null,
    adimlar: KURULUM_KODLARI.map((kod) => ({
      kod,
      grup: 'hesaplar',
      durum: ozel[kod]?.durum ?? 'tamam',
      baslik: kod,
      neden: `${kod} nedeni`,
      eylem: null,
      otomatik: ozel[kod]?.otomatik ?? false,
    })),
    ozet: { tamam: 0, toplam: 0, otomatikYapilabilir: 0, kullanicida: 0 },
    siteKodu: null,
    donusumTetigi: null,
  };
}

function hazirlama(ozel: Partial<Record<string, 'tamam' | 'soru' | 'eksik' | 'hata' | 'atlandi'>> = {}, durum: HazirlamaYaniti['durum'] = 'hazir'): HazirlamaYaniti {
  return {
    clientId: 'ws-1',
    durum,
    adimlar: (['site', 'marka', 'olcum', 'piksel', 'kategori', 'konum', 'butce'] as const).map((kod) => ({
      kod,
      durum: ozel[kod] ?? 'tamam',
      baslik: kod,
      neden: `${kod} nedeni`,
    })),
    sorular: [],
    varsayilanlar: { pikselId: null, gunlukButceMicros: null, gunlukButceParaBirimi: null, kategoriCevaplandi: true },
    sonCalisma: null,
  };
}

function hazirlik(ozel: Partial<Record<string, 'tamam' | 'eksik' | 'bilinmiyor' | 'bekliyor'>> = {}): WorkspaceHazirlik {
  return {
    clientId: 'ws-1',
    clientName: 'Narlıdere Konutları',
    hazir: true,
    maddeler: ([
      'reklam_hesabi', 'veri_akisi', 'marka_bilgisi', 'logo', 'aylik_butce', 'sosyal_kanal', 'reklam_hazirligi',
      'site_adresi', 'iletisim', 'rapor_alicisi', 'adres', 'bildirim', 'erisim', 'youtube_kanali',
    ] as const).map((kod) => ({ kod, zorunlu: false, durum: ozel[kod] ?? 'tamam', aciklama: `${kod} açıklaması` })),
  };
}

const beyan = (oge: KurulumBeyani['oge']): KurulumBeyani => ({
  oge,
  clientId: oge === 'iki_adim' ? null : 'ws-1',
  gerekce: 'Deneme gerekçesi',
  beyanEden: { id: 'u-1', ad: 'Yusuf Algan' },
  tarih: '2026-10-13T12:00:00.000Z',
});

const girdi = (ek: Partial<KurulumListesiGirdisi> = {}): KurulumListesiGirdisi => ({
  kurulum: kurulum(),
  hazirlama: hazirlama(),
  hazirlik: hazirlik(),
  kullanilmayanlar: [],
  beyanlar: [],
  ...ek,
});

const adim = (g: KurulumListesiGirdisi, kod: string) => kurulumListesi(g).find((a) => a.kod === kod)!;

describe('beyanlar — parça kapsam dışı', () => {
  it('KRİTİK: beyanlı ve bitmemiş parça kapsam dışı; adım öteki parçalarla tamam', () => {
    const g = girdi({ hazirlik: hazirlik({ adres: 'eksik' }), beyanlar: [beyan('adres')] });
    const b = adim(g, 'bilgiler');
    expect(b.parcalar.find((p) => p.kod === 'adres')?.durum).toBe('kapsam_disi');
    expect(b.parcalar.find((p) => p.kod === 'adres')?.neden).toContain('Yusuf Algan');
    expect(b.durum).toBe('tamam');
  });

  it('beyan TAMAM parçayı kapatmaz (adres doluyken "adresimiz yok" adresi yok saymaz)', () => {
    const g = girdi({ beyanlar: [beyan('adres')] });
    expect(adim(g, 'bilgiler').parcalar.find((p) => p.kod === 'adres')?.durum).toBe('tamam');
  });

  it('beyansız eksik parça eksik kalır', () => {
    const g = girdi({ hazirlik: hazirlik({ bildirim: 'eksik' }) });
    expect(adim(g, 'bildirimler').durum).toBe('eksik');
  });

  it('KRİTİK: beyanlar OKUNAMADIYSA (null) beyanlı bitmemiş parça "bilinmiyor", eksik DEĞİL', () => {
    const g = girdi({ hazirlik: hazirlik({ erisim: 'eksik' }), beyanlar: null });
    expect(adim(g, 'bildirimler').parcalar.find((p) => p.kod === 'erisim')?.durum).toBe('bilinmiyor');
    expect(kurulumSayaci(kurulumListesi(g)).bitti).toBe(false);
  });

  it('KRİTİK: beyanlar ZORUNLU — geçiş (undefined = "beyan yok") KALKTI, verilmeyen alan derlenmez ve çalışma anında "okunamadı" gibi davranır', () => {
    // @ts-expect-error — alan zorunlu; eksik bırakan çağıran DERLENMEZ (entegrasyon 2026-10-13).
    const eksikAlan: KurulumListesiGirdisi = { kurulum: null, hazirlama: null, hazirlik: hazirlik({ erisim: 'eksik' }), kullanilmayanlar: [] };
    expect(eksikAlan.kullanilmayanlar).toEqual([]);
    // Bir JS çağıranı yine de alanı atlarsa beyanlı parça "eksik" DEĞİL (sessiz yanlış alarm yok).
    const g = girdi({ hazirlik: hazirlik({ erisim: 'eksik' }) });
    delete (g as { beyanlar?: unknown }).beyanlar;
    expect(adim(g, 'bildirimler').parcalar.find((p) => p.kod === 'erisim')?.durum).not.toBe('eksik');
  });

  it('bütün parçalar kapsam dışıysa adım kapsam dışı ve sayaçtan düşer, AYRI sayılır', () => {
    const g = girdi({ hazirlik: hazirlik({ bildirim: 'eksik', erisim: 'eksik' }), beyanlar: [beyan('bildirim'), beyan('erisim')] });
    const adimlar = kurulumListesi(g);
    expect(adimlar.find((a) => a.kod === 'bildirimler')?.durum).toBe('kapsam_disi');
    expect(kurulumSayaci(adimlar)).toEqual({ tamam: 10, toplam: 10, kapsamDisi: 1, bilinmiyor: 0, bitti: true });
  });
});

describe('"web sitemiz yok" beyanı', () => {
  const siteYok = (ek: Partial<KurulumListesiGirdisi> = {}) =>
    girdi({
      kurulum: kurulum({ gtm_konteyner: { durum: 'eksik', otomatik: true }, meta_piksel: { durum: 'eksik', otomatik: true }, site_kodu: { durum: 'kullanicida' } }),
      hazirlik: hazirlik({ site_adresi: 'eksik' }),
      hazirlama: hazirlama({ site: 'eksik' }),
      beyanlar: [beyan('site_yok')],
      ...ek,
    });

  it('KRİTİK: ölçüm ve piksel adımları BÜTÜNÜYLE kapsam dışı, beyanı taşıyor', () => {
    const adimlar = kurulumListesi(siteYok());
    for (const kod of SITE_YOK_KAPSAM_DISI_ADIMLAR) {
      const a = adimlar.find((x) => x.kod === kod)!;
      expect(a.durum, kod).toBe('kapsam_disi');
      expect(a.beyan?.oge, kod).toBe('site_yok');
    }
  });

  it('site adresi ve site taraması parçaları da kapsam dışı; adımları ötekilerle tamam', () => {
    const adimlar = kurulumListesi(siteYok());
    expect(adimlar.find((a) => a.kod === 'bilgiler')?.durum).toBe('tamam');
    expect(adimlar.find((a) => a.kod === 'marka')?.parcalar.find((p) => p.kod === 'site')?.durum).toBe('kapsam_disi');
    expect(kurulumSayaci(adimlar)).toMatchObject({ tamam: 9, toplam: 9, kapsamDisi: 2, bitti: true });
  });

  it('KRİTİK: "Eksikleri tamamla" site isteyen kurulum adımlarına DOKUNMAZ (konteyner, piksel)', () => {
    const k = eksikleriTamamlaKapsami(siteYok());
    expect(k.kurulumAdimlari).not.toContain('gtm_konteyner');
    expect(k.kurulumAdimlari).not.toContain('meta_piksel');
  });

  it('KRİTİK: beyanlar OKUNAMADIYSA site işleri de yapılmaz ve bitmemiş site parçaları "bilinmiyor"', () => {
    const g = siteYok({ beyanlar: null });
    expect(eksikleriTamamlaKapsami(g).kurulumAdimlari).not.toContain('gtm_konteyner');
    expect(adim(g, 'olcum').durum).toBe('bilinmiyor');
  });

  it('beyan yoksa site işleri yine kapsamda (süzgecin boşa düşmediğinin karşıtı)', () => {
    const k = eksikleriTamamlaKapsami(siteYok({ beyanlar: [] }));
    expect(k.kurulumAdimlari).toEqual(expect.arrayContaining(['gtm_konteyner', 'meta_piksel']));
  });

  it('API için türetilen kurulum kodları listeden geliyor ve ölçüm + pikselin hepsini kapsıyor', () => {
    const kodlar = siteYokKurulumKodlari();
    expect(kodlar.has('meta_piksel')).toBe(true);
    expect(kodlar.has('gtm_etiket')).toBe(true);
    expect(kodlar.has('meta_hesap')).toBe(false);
    expect(kodlar.has('google_odeme')).toBe(false);
  });

  it('siteYokMu üç hâlli', () => {
    expect(siteYokMu([beyan('site_yok')])).toBe(true);
    expect(siteYokMu([beyan('adres')])).toBe(false);
    expect(siteYokMu(null)).toBeNull();
  });
});

describe('AdvCampaign kapısı — site yok', () => {
  it('KRİTİK: Meta’da SITE ve SATIS kapalı, form/WhatsApp/arama/video/erişim açık', () => {
    const kapali = REHBER_AMAC_KODLARI.filter((a) => !siteYokRehberKapisi(a, 'meta', true).acik);
    expect(kapali.sort()).toEqual(['SATIS', 'SITE']);
  });

  it('KRİTİK: Google’da karşılığı olan HER amaç kapalı (Google’ın her kurgusu nihai adres istiyor)', () => {
    for (const a of REHBER_AMAC_KODLARI) {
      const k = siteYokRehberKapisi(a, 'google', true);
      if (a === 'WHATSAPP') expect(k.acik, a).toBe(true); // Google'da zaten yok; sebebi rehberin
      else expect(k.acik, a).toBe(false);
    }
  });

  it('beyan yoksa ya da OKUNAMADIYSA hiçbir amacı kapatmaz', () => {
    for (const a of REHBER_AMAC_KODLARI) {
      expect(siteYokRehberKapisi(a, 'meta', false).acik).toBe(true);
      expect(siteYokRehberKapisi(a, 'google', null).acik).toBe(true);
    }
  });
});

describe('sayaç ve adım seçimi', () => {
  it('ilkEksikAdim: tamam, kullanılmayan ve kapsam dışını atlar; okunamayanı ATLAMAZ', () => {
    const g = girdi({
      kullanilmayanlar: ['google'],
      kurulum: kurulum({ google_hesap: { durum: 'eksik' } }),
      hazirlik: hazirlik({ adres: 'eksik', bildirim: 'eksik' }),
      beyanlar: [beyan('adres')],
    });
    expect(ilkEksikAdim(kurulumListesi(g))).toBe('bildirimler');
    expect(ilkEksikAdim(kurulumListesi(girdi({ kurulum: null })))).toBe('meta');
    expect(ilkEksikAdim(kurulumListesi(girdi()))).toBeNull();
  });

  it('veri akışı "bekliyor" (ilk çekim sürüyor) eksik değil ama bitmiş de değil', () => {
    const adimlar = kurulumListesi(girdi({ hazirlik: hazirlik({ veri_akisi: 'bekliyor' }) }));
    expect(adimlar.find((a) => a.kod === 'veri')?.durum).toBe('bekliyor');
    expect(kurulumSayaci(adimlar).bitti).toBe(false);
  });

  it('yeni hazırlık maddesini sunucu döndürmüyorsa parça "bilinmiyor" — sessiz "tamam" DEĞİL', () => {
    const h = hazirlik();
    h.maddeler = h.maddeler.filter((m) => m.kod !== 'rapor_alicisi');
    expect(adim(girdi({ hazirlik: h }), 'bilgiler').durum).toBe('bilinmiyor');
  });
});

describe('Eksikleri tamamla — adım başına kapsam', () => {
  const g = girdi({
    kurulum: kurulum({
      meta_hesap: { durum: 'eksik', otomatik: false },
      google_hesap: { durum: 'eksik', otomatik: false },
      gtm_konteyner: { durum: 'eksik', otomatik: true },
      meta_piksel: { durum: 'eksik', otomatik: true },
    }),
  });

  it('adım verilince yalnız o adımın otomatik parçaları', () => {
    expect(eksikleriTamamlaKapsami(g, 'olcum').kurulumAdimlari).toEqual(['gtm_konteyner']);
    expect(eksikleriTamamlaKapsami(g, 'piksel').kurulumAdimlari).toEqual(['meta_piksel']);
    expect(eksikleriTamamlaKapsami(g, 'olcum').kullaniciyaKalan.every((k) => k.adim === 'olcum')).toBe(true);
  });

  it('hazırlama yeniden koşması yalnız hazırlama parçası olan adımda', () => {
    const h = girdi({ hazirlama: hazirlama({ site: 'eksik' }, 'eksik') });
    expect(eksikleriTamamlaKapsami(h, 'marka').hazirlamaYeniden).toBe(true);
    expect(eksikleriTamamlaKapsami(h, 'google').hazirlamaYeniden).toBe(false);
  });

  it('KRİTİK: sunucu "otomatik" dese bile gerçek hesap AÇAN kod hiçbir adımda kapsamda değil', () => {
    const hepsiOtomatik = girdi({
      kurulum: kurulum(Object.fromEntries(KURULUM_KODLARI.map((k) => [k, { durum: 'eksik' as const, otomatik: true }]))),
    });
    for (const a of [undefined, ...KURULUM_LISTESI.map((x) => x.kod)]) {
      const k = eksikleriTamamlaKapsami(hepsiOtomatik, a).kurulumAdimlari;
      expect(k, String(a)).not.toContain('meta_hesap');
      expect(k, String(a)).not.toContain('google_hesap');
    }
    // Süzgecin boşa düşmediğinin karşıtı: aynı girdide başka otomatik kodlar kapsamda.
    expect(eksikleriTamamlaKapsami(hepsiOtomatik).kurulumAdimlari).toContain('meta_odeme');
  });
});

describe('beyan şemaları', () => {
  it('KRİTİK: ödeme, hesap, piksel gibi kapanamaz öğeler beyan edilemez', () => {
    for (const oge of ['meta_odeme', 'google_odeme', 'meta_hesap', 'olcum', 'veri', 'marka']) {
      expect(kurulumBeyaniSchema.safeParse({ oge, kapsamDisi: true }).success, oge).toBe(false);
    }
  });

  it('iki adımlı doğrulama yalnız şirket şemasında; workspace şeması reddeder', () => {
    expect(kurulumBeyaniSchema.safeParse({ oge: 'iki_adim', kapsamDisi: true }).success).toBe(false);
    expect(sirketKurulumBeyaniSchema.safeParse({ oge: 'iki_adim', kapsamDisi: true }).success).toBe(true);
    expect(sirketKurulumBeyaniSchema.safeParse({ oge: 'adres', kapsamDisi: true }).success).toBe(false);
  });

  it('beyanlı her parça workspace beyan listesinde; listede kullanılmayan öğe yok (site_yok hariç: adım düzeyi)', () => {
    const parcaBeyanlari = new Set(
      KURULUM_LISTESI.flatMap((a) => (a.parcalar as ReadonlyArray<{ beyan?: string }>).map((p) => p.beyan).filter(Boolean)),
    );
    expect([...parcaBeyanlari].sort()).toEqual(WORKSPACE_BEYAN_OGELERI.filter((o) => o !== 'site_yok').sort());
    expect(KURULUM_BEYAN_OGELERI).toContain('iki_adim');
  });

  it('gerekçe 300 karakteri aşamaz', () => {
    expect(kurulumBeyaniSchema.safeParse({ oge: 'adres', kapsamDisi: true, gerekce: 'x'.repeat(301) }).success).toBe(false);
  });
});

describe('şirket kurulumu', () => {
  const sg = (ek: Partial<SirketKurulumGirdisi> = {}): SirketKurulumGirdisi => ({
    baglantilar: [
      { platform: 'meta', status: 'active', sahip: 'ajans' },
      { platform: 'google', status: 'active', sahip: 'ajans' },
    ],
    uygunluk: [
      { platform: 'meta', configured: true },
      { platform: 'google', configured: true },
    ],
    kullanilanPlatformlar: ['meta', 'google'],
    ikiAdimZorunlu: true,
    beyanlar: [],
    ...ek,
  });

  it('KRİTİK: ajansın etkin bağlantısı görünüyorsa adım tamam ve "bağla" eylemi ÜRETİLMEZ (Ç-2)', () => {
    const b = sirketKurulumListesi(sg())[0]!;
    expect(b.durum).toBe('tamam');
    expect(b.parcalar.every((p) => p.eylem === null)).toBe(true);
  });

  it('KRİTİK: tamam kararı `sahip`e bakmaz (üst hesap üyeliği olmayan kullanıcıda ajans bağlantısı "sirket" görünür)', () => {
    const b = sirketKurulumListesi(sg({ baglantilar: [{ platform: 'meta', status: 'active', sahip: 'sirket' }], kullanilanPlatformlar: ['meta'] }))[0]!;
    expect(b.durum).toBe('tamam');
    expect(b.parcalar[0]?.eylem).toBeNull();
  });

  it('ajansın bağlantısının yetkisi düştüyse şirket ekranı yeniden yetkilendirme SUNMAZ, ajansa yönlendirir', () => {
    const b = sirketKurulumListesi(sg({ baglantilar: [{ platform: 'meta', status: 'needs_reauth', sahip: 'ajans' }], kullanilanPlatformlar: ['meta'] }))[0]!;
    expect(b.durum).toBe('hata');
    expect(b.parcalar[0]?.eylem).toBe('ajansa_haber');
  });

  it('şirketin kendi bağlantısı düştüyse yeniden yetkilendir; hiç yoksa bağla; iptal edilmiş yok sayılır', () => {
    expect(sirketKurulumListesi(sg({ baglantilar: [{ platform: 'google', status: 'needs_reauth', sahip: 'sirket' }], kullanilanPlatformlar: ['google'] }))[0]!.parcalar[0]?.eylem).toBe('yeniden_yetkilendir');
    expect(sirketKurulumListesi(sg({ baglantilar: [{ platform: 'google', status: 'revoked', sahip: 'ajans' }], kullanilanPlatformlar: ['google'] }))[0]!.parcalar[0]?.eylem).toBe('bagla');
  });

  it('sunucu ayarı yoksa hata ve Advetics ekibine; okunamadıysa bilinmiyor', () => {
    expect(sirketKurulumListesi(sg({ uygunluk: [{ platform: 'meta', configured: false }], kullanilanPlatformlar: ['meta'] }))[0]!.parcalar[0]?.eylem).toBe('advetics_ekibine');
    expect(sirketKurulumListesi(sg({ baglantilar: null }))[0]!.durum).toBe('bilinmiyor');
  });

  it('KRİTİK: şirketin platform kullanımı OKUNAMADIYSA (null): etkin bağlantı tamam, olmayan "bilinmiyor" — "bağla" yok', () => {
    const b = sirketKurulumListesi(sg({ kullanilanPlatformlar: null, baglantilar: [{ platform: 'meta', status: 'active', sahip: 'ajans' }] }))[0]!;
    expect(b.parcalar.map((p) => [p.kod, p.durum])).toEqual([
      ['meta', 'tamam'],
      ['google', 'bilinmiyor'],
    ]);
    expect(b.parcalar.every((p) => p.eylem === null)).toBe(true);
    expect(b.durum).toBe('bilinmiyor');
    expect(kurulumSayaci(sirketKurulumListesi(sg({ kullanilanPlatformlar: null, baglantilar: [] }))).bitti).toBe(false);
  });

  it('hiçbir workspace platform kullanmıyorsa bağlantı adımı kullanılmıyor', () => {
    expect(sirketKurulumListesi(sg({ kullanilanPlatformlar: [] }))[0]!.durum).toBe('kullanilmiyor');
  });

  it('KRİTİK: 2FA — zorunlu tamam; kapalı + beyan kapsam dışı (kullanıcı kararı); kapalı + karar yok eksik; okunamadı bilinmiyor', () => {
    expect(sirketKurulumListesi(sg())[1]!.durum).toBe('tamam');
    expect(sirketKurulumListesi(sg({ ikiAdimZorunlu: false, beyanlar: [beyan('iki_adim')] }))[1]!.durum).toBe('kapsam_disi');
    expect(sirketKurulumListesi(sg({ ikiAdimZorunlu: false }))[1]!.durum).toBe('eksik');
    expect(sirketKurulumListesi(sg({ ikiAdimZorunlu: false, beyanlar: null }))[1]!.durum).toBe('bilinmiyor');
    expect(sirketKurulumListesi(sg({ ikiAdimZorunlu: null }))[1]!.durum).toBe('bilinmiyor');
  });

  it('hiç eksik yok = iki sayaç birlikte bitti', () => {
    const s = kurulumSayaci(sirketKurulumListesi(sg({ ikiAdimZorunlu: false, beyanlar: [beyan('iki_adim')] })));
    expect(s).toEqual({ tamam: 1, toplam: 1, kapsamDisi: 1, bilinmiyor: 0, bitti: true });
    const w = kurulumSayaci(kurulumListesi(girdi()));
    expect(hicEksikYok(s, w)).toBe(true);
    expect(hicEksikYok(s, { ...w, bitti: false })).toBe(false);
  });
});

describe('sihirbaz adresi', () => {
  it('tek üretici: musteri ve adım taşır, boş adım düşer', () => {
    expect(sihirbazAdresi('ws-1', 'olcum')).toBe('/kurulum?musteri=ws-1&adim=olcum');
    expect(sihirbazAdresi('ws-1')).toBe('/kurulum?musteri=ws-1');
    expect(sihirbazAdresi('ws-1', null)).toBe('/kurulum?musteri=ws-1');
    expect(SIHIRBAZ_ADI).toBe('Kurulum sihirbazı');
  });
});

describe('YouTube adımı (2026-10-15)', () => {
  it('KRİTİK: kanal yoksa eksik; Google hesabından hemen sonra geliyor', () => {
    const adimlar = kurulumListesi(girdi({ hazirlik: hazirlik({ youtube_kanali: 'eksik' }) }));
    const kodlar = adimlar.map((a) => a.kod);
    expect(kodlar.indexOf('youtube')).toBe(kodlar.indexOf('google') + 1);
    expect(adimlar.find((a) => a.kod === 'youtube')?.durum).toBe('eksik');
  });

  it('KRİTİK: "YouTube kanalımız yok" beyanı adımı kapatıyor ve sayaçtan düşürüyor', () => {
    const adimlar = kurulumListesi(girdi({ hazirlik: hazirlik({ youtube_kanali: 'eksik' }), beyanlar: [beyan('youtube_yok')] }));
    expect(adimlar.find((a) => a.kod === 'youtube')?.durum).toBe('kapsam_disi');
    expect(kurulumSayaci(adimlar).bitti).toBe(true);
  });

  it('Google kullanılmıyorsa adım düşüyor', () => {
    const adimlar = kurulumListesi(girdi({ hazirlik: hazirlik({ youtube_kanali: 'eksik' }), kullanilmayanlar: ['google'] }));
    expect(adimlar.find((a) => a.kod === 'youtube')?.durum).toBe('kullanilmiyor');
  });

  it('beyan seçeneği adımda sunuluyor', () => {
    expect(adimBeyanlari('youtube')).toContainEqual({ tur: 'oge', oge: 'youtube_yok' });
  });
});
