import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REHBER_AMACLARI, type RehberAmacKodu, type RehberPlatformu } from '@advetics/shared';
import { amacPlatformlari, metaPayiHesapla, platformTabani, secimliMotor, sonucBasiMaliyet, stratejiMotoru, type GecmisSonucu, type MotorGirdisi } from './motor';

/**
 * Motor ÇALIŞTIRILARAK sınanıyor (YENIDEN-TASARIM.md § 6.5 madde 5). Kaynak
 * taraması burada yalnız "platformlar toplanmaz" kuralının ikinci kilidi.
 */
const M = 1_000_000n;
const YOK: GecmisSonucu = { tur: 'yok', neden: 'gecmis_yok' };

function girdi(o: Partial<MotorGirdisi> = {}): MotorGirdisi {
  return {
    toplamMicros: 30_000n * M,
    paraBirimi: 'TRY',
    donem: { baslangic: '2026-11-01', bitis: '2026-11-30' },
    bugun: '2026-10-20',
    anaAmac: null,
    siteYok: false,
    kullanilmayan: new Set(),
    hesap: { meta: true, google: true },
    ajansYoneticisi: true,
    olcum: {
      site_formu: { meta: true, google: true },
      satin_alma: { meta: true, google: true },
      arama: { meta: true, google: true },
      mesaj_ve_form: { meta: true, google: true },
    },
    asgari: { meta: 50n * M, googleTalepYaratma: 250n * M },
    gecmis: () => YOK,
    videoVarligiVar: false,
    adresKonumuVar: false,
    konumlar: [],
    kelimeGrubu: null,
    ...o,
  };
}

const aylar = (...cpa: number[]): GecmisSonucu => ({ tur: 'aylar', aylar: cpa.map((c) => ({ harcamaMicros: BigInt(c * 100) * M, sonuc: 100 })) });
const amaclar = (r: ReturnType<typeof stratejiMotoru>) => r.kalemler.map((k) => k.amac);

describe('kural 1 — dönüşüm önce, site ve ölçüm kapısı', () => {
  it('KRİTİK: "sitemiz yok" beyanında SITE ve SATIS HİÇ önerilmez (ana amaç site olsa da)', () => {
    for (const anaAmac of ['SITE', 'SATIS', null] as Array<RehberAmacKodu | null>) {
      const r = stratejiMotoru(girdi({ siteYok: true, anaAmac, olcum: { satin_alma: { meta: true, google: true }, site_formu: { meta: true, google: true } } }));
      expect(amaclar(r)).not.toContain('SITE');
      expect(amaclar(r)).not.toContain('SATIS');
      for (const k of r.kalemler) expect(k.google, `${k.amac} Google site ister`).toBe(false);
    }
  });

  it('KRİTİK: ölçüm hiçbir dönüşümde hazır değilse dönüşüm önerilmez, nedeni yazılır, siteye trafik önerilir', () => {
    const r = stratejiMotoru(
      girdi({ olcum: { mesaj_ve_form: { meta: false, google: false }, arama: { meta: false, google: false }, satin_alma: { meta: false, google: false } } }),
    );
    expect(amaclar(r)[0]).toBe('SITE');
    for (const a of ['FORM', 'WHATSAPP', 'TELEFON', 'SATIS']) expect(amaclar(r)).not.toContain(a);
    expect(r.notlar.join(' ')).toMatch(/Ölçümü hazır bir dönüşüm amacı yok/);
  });

  it('ölçümü "bilinmiyor" (null) olan amaç otomatik seçilmez ama ana amaç olarak verilmişse platformu düşmez', () => {
    const r = stratejiMotoru(girdi({ olcum: {} }));
    expect(amaclar(r)[0]).toBe('SITE');
    const r2 = stratejiMotoru(girdi({ anaAmac: 'FORM', olcum: {} }));
    expect(r2.kalemler[0]!.amac).toBe('FORM');
    expect(r2.kalemler[0]!.kaynaklar.amac).toBe('marka');
  });

  it('ana amaç verilmiş ve ölçümü KESİN yoksa nedeni yazılır ve otomatik seçime düşülür', () => {
    const r = stratejiMotoru(girdi({ anaAmac: 'FORM', olcum: { mesaj_ve_form: { meta: false, google: false }, arama: { meta: true, google: true } } }));
    expect(r.kalemler[0]!.amac).toBe('TELEFON');
    expect(r.notlar.join(' ')).toMatch(/ana amaç .*Form doldursunlar.* kurulamıyor/);
  });

  it('açılış tablosu: ajans yöneticisi olmayana deneme amaçlar önerilmez (rehberin kendi kapısı)', () => {
    const r = stratejiMotoru(girdi({ ajansYoneticisi: false }));
    for (const k of r.kalemler) {
      expect(['SITE']).toContain(k.amac);
    }
  });

  it('hesabı atanmamış ve "kullanmıyorum" denen platform kalemde kapalı ve nedeni gerekçede', () => {
    const r = stratejiMotoru(girdi({ anaAmac: 'SITE', hesap: { meta: true, google: false } }));
    expect(r.kalemler[0]!.google).toBe(false);
    expect(r.kalemler[0]!.gerekceler.join(' ')).toMatch(/Google reklam hesabı bu workspace’e atanmadı/);
    const r2 = stratejiMotoru(girdi({ anaAmac: 'SITE', kullanilmayan: new Set<RehberPlatformu>(['meta']) }));
    expect(r2.kalemler[0]!.meta).toBe(false);
    expect(r2.kalemler[0]!.gerekceler.join(' ')).toMatch(/kullanmıyoruz/);
  });
});

describe('kural 2-5 — taban, platform azaltma, pay, asgari', () => {
  it('KRİTİK: bütçe iki platformun öğrenme tabanına yetmiyorsa bir platform kapanır ve cümlesi yazılır', () => {
    // FORM: Meta 200 ₺/sonuç → 30 gün × 50/hafta ≈ 42.857 ₺; Google'da form kapalı → tek platform.
    // SITE ile iki platform: Meta 10 ₺, Google 20 ₺ → tabanlar ~2.142 + ~4.285; bütçe 5.000.
    const r = stratejiMotoru(
      girdi({ anaAmac: 'SITE', toplamMicros: 5_000n * M, gecmis: (_a, p) => (p === 'meta' ? aylar(10, 10, 10) : aylar(20, 20, 20)) }),
    );
    const k = r.kalemler[0]!;
    expect([k.meta, k.google].filter(Boolean)).toHaveLength(1);
    expect(k.gerekceler.join(' ')).toMatch(/iki yarım kampanya yerine bir tam kampanya/);
    expect(k.metaPayi).toBeNull();
  });

  it('KRİTİK: asgari altına düşen platform kapanır ve bütçe diğerine verilir (Google Talep Yaratma)', () => {
    // VIDEO tanıtım: Meta asgari 50, Google TY 250/gün; 30 gün × 250 = 7.500 > yarısı (3.000).
    // Meta asgarisi okunamadı → taban bilinmiyor, azaltma koşmaz; pay %50 →
    // Google'a 3.000 ₺ / 30 gün = 100 ₺/gün < 250 ₺ Talep Yaratma asgarisi.
    const r = stratejiMotoru(girdi({ anaAmac: 'VIDEO', asgari: { meta: null, googleTalepYaratma: 250n * M }, toplamMicros: 6_000n * M }));
    const video = r.kalemler.find((k) => k.amac === 'VIDEO');
    expect(video, JSON.stringify(r)).toBeDefined();
    expect(video!.google).toBe(false);
    expect(video!.meta).toBe(true);
    expect(video!.gerekceler.join(' ')).toMatch(/Google payı platformun günlük asgarisinin altında/);
    expect(video!.tahmin.google).toEqual({ tur: 'yok', neden: 'platform_kapali' });
  });

  it('KRİTİK: pay iki platformun KENDİ maliyetine ters orantılı ve 30-70 aralığına kırpılır', () => {
    expect(metaPayiHesapla(10n * M, 30n * M).pay).toBe(70); // ham 75 → 70
    expect(metaPayiHesapla(30n * M, 10n * M).pay).toBe(30); // ham 25 → 30
    expect(metaPayiHesapla(20n * M, 30n * M)).toMatchObject({ pay: 60, kaynak: 'veri' });
    expect(metaPayiHesapla(null, 30n * M)).toMatchObject({ pay: 50, kaynak: 'kural' });
    const r = stratejiMotoru(girdi({ anaAmac: 'SITE', toplamMicros: 100_000n * M, gecmis: (_a, p) => (p === 'meta' ? aylar(1) : aylar(9)) }));
    expect(r.kalemler[0]!.metaPayi).toBe(70);
    expect(r.kalemler[0]!.kaynaklar.metaPayi).toBe('veri');
  });

  it('kalan tutar dönüşüm tabanından sonra tanıtıma gider; toplam bütçe korunur', () => {
    const r = stratejiMotoru(
      girdi({ anaAmac: 'SITE', hesap: { meta: true, google: false }, toplamMicros: 50_000n * M, gecmis: (a) => (a === 'SITE' ? aylar(10, 10, 10) : YOK) }),
    );
    expect(amaclar(r)).toEqual(['SITE', 'ERISIM']);
    const toplam = r.kalemler.reduce((t, k) => t + BigInt(k.butceMicros), 0n);
    expect(toplam).toBe(50_000n * M);
    // Taban: 10 ₺ × 50 × 30 / 7 = 2.142,857142 ₺.
    expect(BigInt(r.kalemler[0]!.butceMicros)).toBe(platformTabani('SITE', 'meta', 30, girdi({ gecmis: () => aylar(10, 10, 10) })).taban);
  });

  it('taban bilinmiyorsa (geçmiş ve asgari yok) bütçenin tamamı ana kaleme, tanıtım önerilmez ve neden yazılır', () => {
    const r = stratejiMotoru(girdi({ anaAmac: 'SITE', asgari: { meta: null, googleTalepYaratma: null }, hesap: { meta: true, google: false } }));
    expect(amaclar(r)).toEqual(['SITE']);
    expect(r.notlar.join(' ')).toMatch(/öğrenme tabanı bilinmediği/);
  });
});

describe('kural 6 — tahmin YALNIZ veriden, platformlar toplanmaz', () => {
  it('KRİTİK: geçmiş yoksa tahmin YOK (yüzde uydurulmaz)', () => {
    const r = stratejiMotoru(girdi({ anaAmac: 'SITE' }));
    for (const t of Object.values(r.kalemler[0]!.tahmin) as Array<{ tur: string }>) expect(t.tur).toBe('yok');
  });

  it('KRİTİK: bir platformun verisi öbürünün tahminine GİRMEZ', () => {
    const r = stratejiMotoru(girdi({ anaAmac: 'SITE', toplamMicros: 100_000n * M, gecmis: (_a, p) => (p === 'meta' ? aylar(10, 20) : YOK) }));
    const k = r.kalemler[0]!;
    expect(k.meta && k.google).toBe(true);
    expect(k.tahmin.meta.tur).toBe('aralik');
    expect(k.tahmin.google).toEqual({ tur: 'yok', neden: 'gecmis_yok' });
  });

  it('tahmin aralığı en iyi ve en kötü ayın kendi maliyetinden; eşlenemeyen geçmiş kendi nedeniyle', () => {
    const r = stratejiMotoru(
      girdi({ anaAmac: 'SITE', hesap: { meta: true, google: false }, asgari: { meta: null, googleTalepYaratma: null }, toplamMicros: 3_000n * M, gecmis: () => aylar(10, 30) }),
    );
    expect(r.kalemler[0]!.tahmin.meta).toMatchObject({ tur: 'aralik', altSonuc: 100, ustSonuc: 300, aySayisi: 2 });
    const r2 = stratejiMotoru(girdi({ anaAmac: 'SITE', gecmis: () => ({ tur: 'yok', neden: 'eslenemedi' }) }));
    expect(r2.kalemler[0]!.tahmin.meta).toEqual({ tur: 'yok', neden: 'eslenemedi' });
  });

  it('sonuç başı maliyet sıfır sonuçlu ayı ortalamaya katmaz', () => {
    expect(sonucBasiMaliyet({ tur: 'aylar', aylar: [{ harcamaMicros: 100n * M, sonuc: 0 }, { harcamaMicros: 100n * M, sonuc: 10 }] })).toBe(10n * M);
    expect(sonucBasiMaliyet({ tur: 'aylar', aylar: [{ harcamaMicros: 100n * M, sonuc: 0 }] })).toBeNull();
  });

  it('KAYNAK TARAMASI: motorda Meta ve Google sonucu ya da harcaması toplanmıyor', () => {
    const kaynak = readFileSync(join(__dirname, 'motor.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(kaynak.length).toBeGreaterThan(2000);
    expect(kaynak).not.toMatch(/tahmin\.meta[^;\n]*\+[^;\n]*tahmin\.google/);
    expect(kaynak).not.toMatch(/sonuc\w*\(\s*'meta'[^;\n]*\+[^;\n]*'google'/);
    expect(kaynak).not.toMatch(/gecmis\([^)]*'meta'\)[^;\n]*\+[^;\n]*gecmis\([^)]*'google'\)/);
  });
});

describe('takvim', () => {
  it('dönemin başı geçmişteyse kalem YARIN başlar ve söylenir; gün kalmadıysa kalem yok', () => {
    const r = stratejiMotoru(girdi({ anaAmac: 'SITE', bugun: '2026-11-10' }));
    expect(r.kalemler[0]!.baslangic).toBe('2026-11-11');
    expect(r.notlar.join(' ')).toMatch(/2026-11-11 tarihinden başlıyor/);
    expect(stratejiMotoru(girdi({ bugun: '2026-11-30' })).kalemler).toEqual([]);
  });

  it('Google Arama kurgusunda kelime grubu taşınır, Google kapalıysa taşınmaz', () => {
    expect(stratejiMotoru(girdi({ anaAmac: 'SITE', kelimeGrubu: 'Kahve' })).kalemler[0]!.kelimeGrubu).toBe('Kahve');
    expect(stratejiMotoru(girdi({ anaAmac: 'SITE', kelimeGrubu: 'Kahve', hesap: { meta: true, google: false } })).kalemler[0]!.kelimeGrubu).toBeNull();
    expect(REHBER_AMACLARI.SITE.google.kurgu).toBe('ARAMA');
  });
});

describe('seçilen hedeflerle motor (adım adım akış)', () => {
  it('KRİTİK: hedefler SEÇİLDİĞİ SIRAYLA kalem olur; bütçe öncelik ağırlığıyla (2:1) ve toplamı tam', () => {
    const r = secimliMotor(girdi({ toplamMicros: 90_000n * M }), ['SITE', 'FORM']);
    expect(amaclar(r)).toEqual(['SITE', 'FORM']);
    expect(r.kalemler.map((k) => k.butceMicros)).toEqual([String(60_000n * M), String(30_000n * M)]);
    expect(r.kalemler.every((k) => k.kaynaklar.amac === 'ajans')).toBe(true);
    expect(r.kalemler[0]!.gerekceler.join(' ')).toMatch(/Öncelik sırası 1/);
  });

  it('KRİTİK: ölçümü KESİN olmayan dönüşüm hedefi plana alınmaz, NEDENİ not olur ve payı kalanlara gider', () => {
    const r = secimliMotor(girdi({ toplamMicros: 60_000n * M, olcum: { arama: { meta: false, google: false } } }), ['TELEFON', 'SITE']);
    expect(amaclar(r)).toEqual(['SITE']);
    expect(r.kalemler[0]!.butceMicros).toBe(String(60_000n * M));
    expect(r.notlar.join(' ')).toMatch(/Beni arasınlar.*plana alınmadı/);
  });

  it('KRİTİK: iki platformun payı da asgarinin altındaysa bütçenin TAMAMI asgarisi karşılanan platforma gider', () => {
    // 30 gün × 60 TL = 1.800 TL; pay %50 ile Meta 30 TL/gün (asgari 50) ve
    // Google Talep Yaratma 30 TL/gün (asgari 250). Tamamı Meta'ya: 60 TL ≥ 50.
    const r = secimliMotor(girdi({ toplamMicros: 1_800n * M, videoVarligiVar: true }), ['VIDEO']);
    const k = r.kalemler[0]!;
    expect(k.meta).toBe(true);
    expect(k.google).toBe(false);
    expect(k.gerekceler.join(' ')).toMatch(/İki platformun payı da/);
  });

  it('bölge seçildiyse konum kaynağı "ajans", seçilmediyse Marka Merkezi', () => {
    const izmir = { tur: 'region' as const, key: '35', etiket: 'İzmir', ulkeKodu: 'TR' };
    expect(secimliMotor(girdi({ konumlar: [izmir], konumKaynagi: 'ajans' }), ['SITE']).kalemler[0]!.kaynaklar.konumlar).toBe('ajans');
    expect(secimliMotor(girdi({ konumlar: [izmir] }), ['SITE']).kalemler[0]!.kaynaklar.konumlar).toBe('marka');
  });

  it('hiç hedef yoksa ya da hiçbiri kurulamıyorsa boş liste ve nedeni', () => {
    expect(secimliMotor(girdi(), []).notlar).toEqual(['Hedef seçilmedi.']);
    const r = secimliMotor(girdi({ hesap: { meta: false, google: false } }), ['SITE']);
    expect(r.kalemler).toEqual([]);
    expect(r.notlar[0]).toMatch(/plana alınmadı/);
  });

  it('KRİTİK: hedef kartının kapısı motorun kapısı (`amacPlatformlari`): ölçümsüz dönüşüm platformu düşer, tanıtım düşmez', () => {
    // TELEFON: Meta ve Google Arama ikisi de açık; ölçüm yalnız Google'da hazır.
    const g = girdi({ olcum: { arama: { meta: false, google: true } } });
    expect(amacPlatformlari('TELEFON', g).acik).toEqual(['google']);
    expect(amacPlatformlari('TELEFON', g).dusen.join(' ')).toMatch(/Meta: .*ölçülmüyor/);
    expect(amacPlatformlari('ERISIM', girdi({ olcum: {} })).acik).toContain('meta');
  });
});
