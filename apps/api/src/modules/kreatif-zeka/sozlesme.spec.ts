import { describe, expect, it } from 'vitest';
import {
  alanDegerleri,
  anaMetrik,
  bekciKarari,
  briefIstemi,
  briefMetniDenetle,
  enBoyAnla,
  ETIKET_ALAN_ADLARI,
  ETIKET_EN_FAZLA_DENEME,
  ETIKET_ETIKETLERI,
  ETIKET_SINIRI,
  etiketCoz,
  etiketIsSonucu,
  ETIKETLENEMEZ_CUMLESI,
  ETIKETLENEMEZ_NEDENLERI,
  etiketKarsilastir,
  farkCumlesi,
  GORU_ALAN_ADLARI,
  GORU_ALANLARI,
  goruBicimi,
  goruJsonSemasi,
  grupOzeti,
  harcamaEsigiMicros,
  HAZIR_ISTEM_SINIRI,
  ICERIK_DURUMLARI,
  ICERIK_SON_DURUMLARI,
  icerikGecisi,
  KAYNAK_ANAHTARI_DESENI,
  karsilastirmaKumesi,
  KESIN_ALANLAR,
  KOVA_SINIRI,
  kovaCumlesi,
  KREATIF_ZEKA_UCLARI,
  kreatifKovasi,
  kreatifPuani,
  metrikDegeri,
  ONERI_TURU_ETIKETI,
  PERMISSIONS,
  resolvePermissions,
  type AgirlikliDeger,
  type EtiketIsSayimi,
  type IcerikHali,
} from '@advetics/shared';

/**
 * ═══ KREATİF ZEKÂSI SÖZLEŞMESİ (Paket D, Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor. Ajan 2 (iş, uçlar) ve Ajan 3
 * (ekran) bu sözleşmeden okuyor. MUTASYON: shared'da bir satırı bozarken
 * önce shared yeniden derlenmeli (testler `dist`i okuyor, CLAUDE.md).
 */

const TL = (x: number) => BigInt(Math.round(x * 1e6));
const g = (deger: number, harcama: number): AgirlikliDeger => ({ deger, harcamaMicros: TL(harcama) });

// ─── Etiket şeması ──────────────────────────────────────────────────────────

describe('etiket şeması', () => {
  it('Gemini JSON şeması şemadan türüyor; kesin alanlar modele GİTMİYOR', () => {
    const s = goruJsonSemasi() as { required: string[]; properties: Record<string, { enum: string[] }> };
    expect(s.required).toEqual(GORU_ALAN_ADLARI);
    for (const a of GORU_ALAN_ADLARI) expect(s.properties[a]!.enum).toEqual([...GORU_ALANLARI[a]]);
    for (const k of Object.keys(KESIN_ALANLAR)) expect(s.properties[k]).toBeUndefined();
  });

  it('her alanın her değerinin Türkçe karşılığı var (iki yönlü)', () => {
    for (const a of ETIKET_ALAN_ADLARI) {
      expect(Object.keys(ETIKET_ETIKETLERI[a].degerler).sort(), a).toEqual([...alanDegerleri(a)].sort());
    }
  });

  it('her alan en çok üç değerli (gruplar küçülmesin)', () => {
    for (const a of ETIKET_ALAN_ADLARI) expect(alanDegerleri(a).length, a).toBeLessThanOrEqual(3);
  });

  const tam = Object.fromEntries(GORU_ALAN_ADLARI.map((a) => [a, GORU_ALANLARI[a][0]]));

  it('geçerli cevap çözülüyor', () => {
    const r = etiketCoz(JSON.stringify(tam));
    expect(r.ok).toBe(true);
  });

  it('KRİTİK: eksik, fazla ya da liste dışı alan varsayılanla DOLDURULMAZ', () => {
    const { insan: _yok, ...eksik } = tam;
    expect(etiketCoz(JSON.stringify(eksik)).ok).toBe(false);
    expect(etiketCoz(JSON.stringify({ ...tam, ruh_hali: 'neseli' })).ok).toBe(false);
    expect(etiketCoz(JSON.stringify({ ...tam, insan: 'belirsiz' })).ok).toBe(false);
    expect(etiketCoz('```json\n{}\n```').ok).toBe(false);
  });

  it('en-boy: kare, 4:5 dikey, 1,91:1 yatay', () => {
    expect(enBoyAnla(1080, 1080)).toBe('kare');
    expect(enBoyAnla(1080, 1350)).toBe('dikey');
    expect(enBoyAnla(1080, 1920)).toBe('dikey');
    expect(enBoyAnla(1200, 628)).toBe('yatay');
    expect(enBoyAnla(0, 100)).toBeNull();
  });

  it('görsel biçimi gövdeden; WebP kabul, RIFF/WAVE ve GIF ret', () => {
    expect(goruBicimi(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('jpg');
    expect(goruBicimi(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe('png');
    const riff = (t: string) => new Uint8Array([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from(t)]);
    expect(goruBicimi(riff('WEBP'))).toBe('webp');
    expect(goruBicimi(riff('WAVE'))).toBeNull();
    expect(goruBicimi(new Uint8Array([...Buffer.from('GIF89a')]))).toBeNull();
  });

  it('kaynak anahtarı: Meta image_hash HESAPLA birlikte, Google kaynak ADI değil kimlik', () => {
    expect(KAYNAK_ANAHTARI_DESENI.test('meta:img:act_123:0123456789abcdef0123456789abcdef')).toBe(true);
    expect(KAYNAK_ANAHTARI_DESENI.test('meta:img:0123456789abcdef0123456789abcdef')).toBe(false);
    expect(KAYNAK_ANAHTARI_DESENI.test('meta:vid:1234567890')).toBe(true);
    expect(KAYNAK_ANAHTARI_DESENI.test('google:asset:98765')).toBe(true);
    expect(KAYNAK_ANAHTARI_DESENI.test('google:asset:customers/1/assets/2')).toBe(false);
  });
});

// ─── Durum, bekçi, iş sonucu ────────────────────────────────────────────────

describe('etiketleme durum makinesi', () => {
  const bas: IcerikHali = { durum: 'bekliyor', deneme: 0, neden: null };

  it('KRİTİK: geçici hata sonsuza kadar denenmez, satır bir son duruma varır', () => {
    let h = bas;
    let adim = 0;
    while (!ICERIK_SON_DURUMLARI.includes(h.durum)) {
      h = icerikGecisi(h, { tur: 'gecici', neden: 'gemini_kota' });
      adim++;
      expect(adim).toBeLessThanOrEqual(ETIKET_EN_FAZLA_DENEME);
    }
    expect(h).toMatchObject({ durum: 'etiketlenemez', neden: 'deneme_tukendi' });
  });

  it('geçici hata satırı bekliyor bırakır ve nedeni yazar', () => {
    expect(icerikGecisi(bas, { tur: 'gecici', neden: 'adres_alinamadi' })).toEqual({ durum: 'bekliyor', deneme: 1, neden: 'adres_alinamadi' });
  });

  it('şema sürümü artınca yalnız etiketlenmiş satır yeniden sıraya girer', () => {
    expect(icerikGecisi({ durum: 'etiketlendi', deneme: 1, neden: null }, { tur: 'sema_yukseldi' }).durum).toBe('bekliyor');
    const metin: IcerikHali = { durum: 'etiketlenemez', deneme: 1, neden: 'metin_reklami' };
    expect(icerikGecisi(metin, { tur: 'sema_yukseldi' })).toEqual(metin);
  });

  it('son durumlar durum listesinin alt kümesi; her kalıcı nedenin cümlesi var', () => {
    for (const d of ICERIK_SON_DURUMLARI) expect(ICERIK_DURUMLARI).toContain(d);
    expect(Object.keys(ETIKETLENEMEZ_CUMLESI).sort()).toEqual([...ETIKETLENEMEZ_NEDENLERI].sort());
  });
});

describe('maliyet bekçisi', () => {
  it('sınırın altında izin, sınırda ret', () => {
    expect(bekciKarari({ workspaceBugun: ETIKET_SINIRI.workspaceGunluk - 1, workspaceBuAy: 0, kureselBugun: 0 })).toEqual({ izin: true });
    expect(bekciKarari({ workspaceBugun: ETIKET_SINIRI.workspaceGunluk, workspaceBuAy: 0, kureselBugun: 0 })).toEqual({ izin: false, neden: 'workspace_gunluk' });
    expect(bekciKarari({ workspaceBugun: 0, workspaceBuAy: ETIKET_SINIRI.workspaceAylik, kureselBugun: 0 })).toEqual({ izin: false, neden: 'workspace_aylik' });
  });

  it('küresel sınır önce söylenir (workspace\'e yanlış "senin payın doldu" denmesin)', () => {
    const r = bekciKarari({ workspaceBugun: ETIKET_SINIRI.workspaceGunluk, workspaceBuAy: 0, kureselBugun: ETIKET_SINIRI.kureselGunluk });
    expect(r).toEqual({ izin: false, neden: 'kuresel_gunluk' });
  });

  it('aylık sınır günlük sınırın katı (günlük sınır ölü kod olmasın)', () => {
    expect(ETIKET_SINIRI.workspaceAylik).toBeGreaterThan(ETIKET_SINIRI.workspaceGunluk);
    expect(ETIKET_SINIRI.kureselGunluk).toBeGreaterThan(ETIKET_SINIRI.workspaceGunluk);
  });
});

describe('iş sonucu', () => {
  const sifir: EtiketIsSayimi = { secilen: 0, etiketlendi: 0, baglandi: 0, kalici: 0, gecici: 0, ertelendi: 0, bekciNedeni: null };

  it('KRİTİK: satır 0 olan başarılı sonuç NOTSUZ olamaz', () => {
    const durumlar: EtiketIsSayimi[] = [
      sifir,
      { ...sifir, secilen: 10, ertelendi: 10, bekciNedeni: 'workspace_gunluk' },
      { ...sifir, secilen: 3, gecici: 1, ertelendi: 2, bekciNedeni: 'kuresel_gunluk' },
    ];
    for (const s of durumlar) {
      const r = etiketIsSonucu(s);
      if (r.sonuc === 'basarili' && r.satir === 0) expect(r.not.length, JSON.stringify(s)).toBeGreaterThan(0);
    }
    expect(etiketIsSonucu({ ...sifir, secilen: 10, ertelendi: 10, bekciNedeni: 'workspace_gunluk' })).toMatchObject({
      sonuc: 'basarili',
      not: expect.stringContaining('workspace_gunluk'),
    });
  });

  it('KRİTİK: her şey geçici hatayla düştüyse iş TEKRAR DENENİR (sessiz succeeded+0 yok)', () => {
    expect(etiketIsSonucu({ ...sifir, secilen: 4, gecici: 4 }).sonuc).toBe('tekrar_dene');
  });

  it('bekçi reddi tekrar denenmez (yarın açılıyor, beş deneme beş ret)', () => {
    expect(etiketIsSonucu({ ...sifir, secilen: 4, ertelendi: 4, bekciNedeni: 'workspace_gunluk' }).sonuc).toBe('basarili');
  });

  it('kısmi başarı başarılıdır ve ertelenenleri sayar', () => {
    const r = etiketIsSonucu({ ...sifir, secilen: 5, etiketlendi: 2, baglandi: 1, gecici: 2 });
    expect(r).toMatchObject({ sonuc: 'basarili', satir: 3 });
    expect(r.not).toContain('2 geçici');
  });
});

// ─── İstatistik ─────────────────────────────────────────────────────────────

describe('metrik ve küme', () => {
  it('harcamasız kreatif maliyet metriğine girmez', () => {
    const o = { creativeId: 'x', gosterim: 1000, tiklama: 10, donusum: 0, harcamaMicros: 0n };
    expect(metrikDegeri(o, 'donusum_verimi')).toBeNull();
    expect(metrikDegeri(o, 'tiklama_orani')).toBeCloseTo(0.01);
  });

  it('KRİTİK: dönüşüm veriminin harcama ağırlıklı ortalaması toplamların oranına EŞİT', () => {
    const k = [
      { creativeId: 'a', gosterim: 0, tiklama: 0, donusum: 10, harcamaMicros: TL(1000) },
      { creativeId: 'b', gosterim: 0, tiklama: 0, donusum: 0, harcamaMicros: TL(3000) },
      { creativeId: 'c', gosterim: 0, tiklama: 0, donusum: 30, harcamaMicros: TL(2000) },
    ];
    const oz = grupOzeti(k.map((x) => ({ deger: metrikDegeri(x, 'donusum_verimi')!, harcamaMicros: x.harcamaMicros })))!;
    expect(oz.ortalama).toBeCloseTo(40 / 6000, 10);
  });

  it('etkin örneklem: eşit harcama = kreatif sayısı, tek dev kreatif ≈ 1', () => {
    expect(grupOzeti([g(1, 100), g(2, 100), g(3, 100), g(4, 100)])!.etkinOrneklem).toBeCloseTo(4);
    expect(grupOzeti([g(1, 100000), g(2, 1), g(3, 1), g(4, 1), g(5, 1)])!.etkinOrneklem).toBeLessThan(1.01);
  });

  it('küme: aynı platform + aynı amaç; arama ve LinkedIn kümesiz', () => {
    expect(karsilastirmaKumesi('meta', 'OUTCOME_SALES')?.anahtar).toBe('meta:satis');
    expect(karsilastirmaKumesi('meta', 'CONVERSIONS')?.anahtar).toBe('meta:satis');
    expect(karsilastirmaKumesi('google', 'DEMAND_GEN')?.anahtar).toBe('google:demand_gen');
    expect(karsilastirmaKumesi('google', 'SEARCH')).toBeNull();
    expect(karsilastirmaKumesi('linkedin', 'OUTCOME_SALES')).toBeNull();
    expect(karsilastirmaKumesi('meta', null)).toBeNull();
  });

  it('dönüşüm az olan dönüşüm kümesi tıklama oranına iner ve bunu SÖYLER', () => {
    expect(anaMetrik('satis', 29)).toEqual({ metrik: 'tiklama_orani', dusus: true });
    expect(anaMetrik('satis', 30)).toEqual({ metrik: 'donusum_verimi', dusus: false });
    expect(anaMetrik('bilinirlik', 0).metrik).toBe('gosterim_verimi');
  });
});

describe('etiket karşılaştırması', () => {
  const gurultulu = (orta: number) => [0.8, 1.2, 0.9, 1.1, 1.0, 0.7, 1.3].map((c, i) => g(orta * c, 1000 + i * 100));

  it('grupta beş kreatiften az ise yetersiz ve nedeni yazılı', () => {
    const r = etiketKarsilastir([g(0.02, 2000), g(0.03, 2000)], gurultulu(0.01));
    expect(r.karar).toBe('yetersiz');
    expect(r.yetersizNedeni).toContain('5');
    expect(r.aralik).toBeNull();
  });

  it('KRİTİK: aynı dağılımdan iki grup "anlamlı" çıkmaz', () => {
    const r = etiketKarsilastir(gurultulu(0.01), gurultulu(0.0105));
    expect(r.karar).toBe('belirsiz');
    expect(r.aralik![0]).toBeLessThan(0);
    expect(r.aralik![1]).toBeGreaterThan(0);
  });

  it('belirgin farkta anlamlı, aralık sıfırı kapsamıyor, örneklem dolu', () => {
    const r = etiketKarsilastir(gurultulu(0.02), gurultulu(0.01));
    expect(r.karar).toBe('anlamli');
    expect(r.aralik![0]).toBeGreaterThan(0);
    expect(r.goreliFark).toBeCloseTo(1, 1);
    expect(r.a!.kreatif).toBe(7);
  });

  it('KRİTİK: harcaması tek kreatifte toplanmış grup büyük farkla bile yetersiz', () => {
    const tekDev = [g(0.05, 100000), g(0.01, 10), g(0.01, 10), g(0.01, 10), g(0.01, 10), g(0.01, 10)];
    expect(etiketKarsilastir(tekDev, gurultulu(0.01)).karar).toBe('yetersiz');
  });
});

// ─── Puan ve kova ───────────────────────────────────────────────────────────

describe('puan', () => {
  const benzer = [1, 2, 3, 4, 5, 6, 7, 8];

  it('KRİTİK: sıra puanı; en iyi 100, en kötü 0, hepsi eşitse 50', () => {
    expect(kreatifPuani(9, true, benzer).puan).toBe(100);
    expect(kreatifPuani(0, true, benzer).puan).toBe(0);
    expect(kreatifPuani(5, true, [5, 5, 5, 5, 5]).puan).toBe(50);
    expect(kreatifPuani(4.5, true, benzer)).toMatchObject({ puan: 50, altinda: 4, benzer: 8 });
  });

  it('harcama azsa ya da benzer azsa puan yok, neden yazılı', () => {
    expect(kreatifPuani(9, false, benzer)).toMatchObject({ puan: null, neden: 'harcama_az' });
    expect(kreatifPuani(9, true, [1, 2, 3, 4])).toMatchObject({ puan: null, neden: 'benzer_az', benzer: 4 });
    expect(kreatifPuani(null, true, benzer)).toMatchObject({ puan: null, neden: 'metrik_yok' });
  });

  it('KRİTİK: maliyet metriğinde UCUZ olan yüksek puan alır (verim ölçeği)', () => {
    const ucuz = { creativeId: 'u', gosterim: 0, tiklama: 0, donusum: 20, harcamaMicros: TL(1000) }; // 50 ₺/dönüşüm
    const pahali = [100, 120, 150, 200, 300].map((cpa, i) => ({ creativeId: `p${i}`, gosterim: 0, tiklama: 0, donusum: 10, harcamaMicros: TL(cpa * 10) }));
    const p = kreatifPuani(metrikDegeri(ucuz, 'donusum_verimi'), true, pahali.map((x) => metrikDegeri(x, 'donusum_verimi')!));
    expect(p.puan).toBe(100);
  });

  it('harcama eşiği: TL\'de 1.000 ₺, kursuz yabancı parada YOK', () => {
    expect(harcamaEsigiMicros('TRY', null)).toBe(1_000_000_000n);
    expect(harcamaEsigiMicros('USD', null)).toBeNull();
    expect(harcamaEsigiMicros('USD', 40)).toBe(25_000_000n);
  });
});

describe('kova', () => {
  const p = (puan: number) => ({ puan, benzer: 10, altinda: Math.round(puan / 10), esit: 0 });

  it('ortanca sınırı', () => {
    expect(kreatifKovasi({ puan: p(KOVA_SINIRI), esikBiliniyor: true, yorgunlukOnerisi: false }).kova).toBe('iyi_gidiyor');
    expect(kreatifKovasi({ puan: p(KOVA_SINIRI - 1), esikBiliniyor: true, yorgunlukOnerisi: false }).kova).toBe('dikkat');
  });

  it('kur bilinmiyorsa veri yetersiz (eşik 40 kat büyümesin)', () => {
    expect(kreatifKovasi({ puan: p(90), esikBiliniyor: false, yorgunlukOnerisi: false })).toMatchObject({ kova: 'veri_yetersiz', neden: 'kur_yok' });
  });

  it('KRİTİK: yorgunluk önerisi varsa cümle önerinin AYNI adıyla ona bağlanır', () => {
    const k = kreatifKovasi({ puan: p(20), esikBiliniyor: true, yorgunlukOnerisi: true });
    expect(k.kova).toBe('dikkat');
    const c = kovaCumlesi(k, p(20), '1.200 ₺', '1.000 ₺');
    expect(c).toContain(ONERI_TURU_ETIKETI.kreatif_yorgunlugu);
    expect(c).not.toContain('benzerinden');
  });
});

describe('fark cümlesi (sayılar şablondan)', () => {
  const anlamli = (gf: number, a: number, b: number) =>
    ({ karar: 'anlamli', yetersizNedeni: null, a: { kreatif: 23 }, b: { kreatif: 41 }, goreliFark: gf, aralik: [a, b] }) as never;

  it('tıklama oranında yön ve örneklem', () => {
    expect(farkCumlesi('insan', 'var', 'tiklama_orani', anlamli(0.2, 0.12, 0.31))).toBe('İnsan var: tıklama oranı %12 ile %31 arası daha yüksek (23 ve 41 kreatif)');
  });

  it('KRİTİK: maliyet metriğinde verim farkı maliyet farkına çevrilir', () => {
    // Verim %25 yüksek = dönüşüm başı maliyet %20 düşük.
    expect(farkCumlesi('insan', 'var', 'donusum_verimi', anlamli(0.25, 0.25, 0.25))).toBe(
      'İnsan var: dönüşüm başı maliyet %20 ile %20 arası daha düşük (23 ve 41 kreatif)',
    );
  });
});

// ─── Brief ──────────────────────────────────────────────────────────────────

describe('brief', () => {
  const bulgular = [{ alan: 'insan' as const }, { alan: 'metin_yogunlugu' as const }];
  const cevap = {
    yon: 'Ürünü kullanan bir kişiyle, az yazıyla',
    talimatlar: [
      { alan: 'insan', talimat: 'Ürünü elinde tutan bir kişi kullan' },
      { alan: 'metin_yogunlugu', talimat: 'Görselde tek kısa cümle bırak' },
    ],
    kacin: ['Görselin tamamını kaplayan yazı'],
  };

  it('geçerli cevap geçer', () => {
    expect(briefMetniDenetle(cevap, bulgular)).toEqual({ ok: true });
  });

  it('KRİTİK: rakam taşıyan yapay zekâ metni reddedilir (sayı uydurma yapısal olarak kapalı)', () => {
    expect(briefMetniDenetle({ ...cevap, yon: 'Tıklama oranını belirgin artırır' }, bulgular).ok).toBe(true);
    expect(briefMetniDenetle({ ...cevap, yon: 'Tıklama oranı %30 artar' }, bulgular).ok).toBe(false);
    expect(briefMetniDenetle({ ...cevap, kacin: ['9:16 dışı oran'] }, bulgular).ok).toBe(false);
  });

  it('modelin bulgu uydurması ya da atlaması ret', () => {
    expect(briefMetniDenetle({ ...cevap, talimatlar: [cevap.talimatlar[0]!] }, bulgular).ok).toBe(false);
    expect(briefMetniDenetle({ ...cevap, talimatlar: [...cevap.talimatlar].reverse() }, bulgular).ok).toBe(false);
  });

  it('AdvCampaign aktarımı sınırı aşmaz ve kesildiğini söyler', () => {
    const uzun = { bulgular: Array.from({ length: 5 }, () => ({ cumle: 'x'.repeat(1500) })), cevap } as never;
    const m = briefIstemi(uzun, 'Meta · Satış');
    expect(m.length).toBeLessThanOrEqual(HAZIR_ISTEM_SINIRI);
    expect(m.endsWith('(brief kısaltıldı)')).toBe(true);
  });
});

// ─── Uçlar ──────────────────────────────────────────────────────────────────

describe('uçlar', () => {
  it('izinler gerçek; müşteri hesabı hiçbir ucu göremez', () => {
    for (const u of KREATIF_ZEKA_UCLARI) expect(PERMISSIONS).toContain(u.izin);
    const musteri = resolvePermissions('client_viewer');
    for (const u of KREATIF_ZEKA_UCLARI) expect(musteri.has(u.izin), `${u.yontem} ${u.yol}`).toBe(false);
  });

  it('yol + yöntem tekil', () => {
    const anahtarlar = KREATIF_ZEKA_UCLARI.map((u) => `${u.yontem} ${u.yol}`);
    expect(new Set(anahtarlar).size).toBe(anahtarlar.length);
  });
});
