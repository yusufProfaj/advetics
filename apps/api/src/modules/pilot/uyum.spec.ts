import { describe, expect, it } from 'vitest';
import {
  etkinPaketler,
  KATALOG_SURUMU,
  PAKETI_OLMAYAN_SEKTORLER,
  planKanonikIcerik,
  planUret,
  planUyumGirdisi,
  satirdanTaslak,
  sektorCoz,
  taslakUyumGirdisi,
  UYUM_KATALOGU,
  UYUM_SEKTORLERI,
  uyumDenetle,
  uyumDurumu,
  type UyumGirdisi,
  type UyumKitleBilgisi,
  type UyumSatiri,
} from '@advetics/shared';
import { planGirdisi, T, temizProfil, U } from '../../../test/pilot-fixture';

/**
 * ═══ UYUM DENETÇİSİ VE KATALOĞU (Ç-4, S-5) ═══
 *
 * Denetçi saf; testler onu ÇALIŞTIRIYOR. "KRİTİK" işaretli testler
 * mutasyonla doğrulandı (kural satırı bozuldu, test düştü, geri alındı) —
 * sonuçlar Ajan 2 devir notunda.
 */
const KITLE_TEMIZ: UyumKitleBilgisi = { yasMin: 18, yasMax: 65, cinsiyet: 'all', ozelKitleVar: false };
const kitleler = new Map<string, UyumKitleBilgisi>([
  [U(10), KITLE_TEMIZ],
  [U(11), KITLE_TEMIZ],
  [U(12), KITLE_TEMIZ],
]);

function planGirdi(over: Parameters<typeof planGirdisi>[0] = {}, k = kitleler): UyumGirdisi {
  const p = planUret(planGirdisi(over));
  return planUyumGirdisi(p, 'ozet-1', '2026-10-07', k);
}

function satir(over: Partial<UyumSatiri> = {}): UyumSatiri {
  return { yer: 'meta:soguk:x', platform: 'meta', niyet: 'SITE', kitle: KITLE_TEMIZ, metinler: [], ...over };
}
function girdi(satirlar: UyumSatiri[], an: UyumGirdisi['an'] = 'taslak'): UyumGirdisi {
  return { an, bugun: '2026-10-07', icerikOzeti: 'oz', satirlar, planMetinleri: [] };
}
const kimlikler = (g: UyumGirdisi, p = temizProfil()) => uyumDenetle(g, p, KATALOG_SURUMU, T).bulgular.map((b) => b.kuralKimligi);

describe('katalog', () => {
  it('kural kimlikleri tekil; her kuralın dayanağı, ne yapmalısı ve tarihleri var', () => {
    const k = UYUM_KATALOGU.map((x) => x.kimlik);
    expect(new Set(k).size).toBe(k.length);
    for (const r of UYUM_KATALOGU) {
      expect(r.kimlik, r.kimlik).toMatch(/^[A-Z]{3}-(\d{2}|SYS)$/);
      expect(r.dayanak.metin.trim().length, r.kimlik).toBeGreaterThan(5);
      expect(r.neYapmali.trim().length, r.kimlik).toBeGreaterThan(5);
      expect(r.yururlukTarihi).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.sonKontrol).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // Panel metin dili: uzun tire yok.
      expect(r.mesaj, r.kimlik).not.toContain('—');
    }
    expect(KATALOG_SURUMU).toMatch(/^\d{4}\.\d{1,2}\.\d+$/);
  });

  it('Tur 1 paketleri katalogda: GENEL + FORM_KVKK + KONUT + FINANS', () => {
    const paketler = new Set(UYUM_KATALOGU.map((r) => r.paket));
    for (const p of ['GENEL', 'FORM_KVKK', 'KONUT', 'FINANS'] as const) expect(paketler.has(p), p).toBe(true);
  });

  it('bilinmeyen katalog sürümüyle denetim FIRLATIR (rapor değişmez)', () => {
    expect(() => uyumDenetle(girdi([satir()]), temizProfil(), '2025.1.1', T)).toThrow(/katalog sürümü/);
  });
});

describe('denetim sonucu', () => {
  it('KRİTİK: temiz plan + beyanlı profil → bulgu yok ve uyum GEÇTİ', () => {
    const g = planGirdi();
    const d = uyumDenetle(g, temizProfil(), KATALOG_SURUMU, T);
    expect(d.bulgular).toEqual([]);
    expect(d.icerikOzeti).toBe('ozet-1');
    expect(d.katalogSurumu).toBe(KATALOG_SURUMU);
    expect(uyumDurumu(d, [], 'ozet-1')).toBe('gecti');
  });

  it('KRİTİK: sektör beyanı yoksa ENGEL (boş kanıt geçti değil)', () => {
    const d = uyumDenetle(planGirdi(), temizProfil({ sektorler: null, sektorMetni: null }), KATALOG_SURUMU, T);
    expect(d.bulgular.map((b) => [b.kuralKimligi, b.seviye, b.durum])).toContainEqual(['GNL-18', 'ENGEL', 'bilinmiyor']);
    expect(uyumDurumu(d, [], 'ozet-1')).toBe('engel');
  });

  it('KRİTİK: özel kategori sorusu cevaplanmadıysa (null) ENGEL; "Hayır" ([]) geçer', () => {
    expect(kimlikler(planGirdi(), temizProfil({ ozelKategoriler: null }))).toContain('GNL-20');
    expect(kimlikler(planGirdi(), temizProfil({ ozelKategoriler: [] }))).not.toContain('GNL-20');
  });

  it('KRİTİK: yaş 18 altı kitle ENGEL', () => {
    const k = new Map(kitleler);
    k.set(U(10), { ...KITLE_TEMIZ, yasMin: 16 });
    const d = uyumDenetle(planGirdi({}, k), temizProfil(), KATALOG_SURUMU, T);
    const b = d.bulgular.find((x) => x.kuralKimligi === 'GNL-01');
    expect(b).toMatchObject({ seviye: 'ENGEL', yer: `meta:soguk:${U(10)}` });
    expect(b!.mesaj).toContain('16');
  });

  it('siyasi kategori seçiliyse ENGEL', () => {
    expect(kimlikler(planGirdi(), temizProfil({ ozelKategoriler: ['ISSUES_ELECTIONS_POLITICS'] }))).toContain('OZK-SYS');
  });

  it('KRİTİK: paketi katalogda olmayan sektör geçti sayılmaz (GNL-21)', () => {
    expect(kimlikler(planGirdi(), temizProfil({ sektorler: ['OTEL_KONAKLAMA'] }))).toContain('GNL-21');
    // Liste dışı sektör tek başına bu engeli üretmez.
    expect(kimlikler(planGirdi(), temizProfil({ sektorler: ['B2B_URETICI'] }))).not.toContain('GNL-21');
    for (const s of PAKETI_OLMAYAN_SEKTORLER) expect(UYUM_SEKTORLERI).toContain(s);
  });
});

describe('paketler', () => {
  it('FORM niyetinde aydınlatma adresi yoksa FRM-01 ENGEL (bilinmiyor = kaldı)', () => {
    const g = planGirdi({ marka: { profilId: U(5), guncellendi: T, anaAmac: 'form' } });
    expect(etkinPaketler(g, temizProfil())).toContain('FORM_KVKK');
    const d = uyumDenetle(g, temizProfil(), KATALOG_SURUMU, T);
    expect(d.bulgular.filter((b) => b.kuralKimligi === 'FRM-01').every((b) => b.seviye === 'ENGEL' && b.durum === 'bilinmiyor')).toBe(true);
    expect(d.bulgular.some((b) => b.kuralKimligi === 'FRM-01')).toBe(true);
    // Geçerli adres verilince kalkar; PDF adresi kalkmaz.
    expect(kimlikler(g, temizProfil({ kvkkAydinlatmaAdresi: 'https://ornek.com/kvkk' }))).not.toContain('FRM-01');
    expect(kimlikler(g, temizProfil({ kvkkAydinlatmaAdresi: 'https://ornek.com/kvkk.pdf' }))).toContain('FRM-01');
  });

  it('KRİTİK: konutta kısıt seti — cinsiyet süzgeci ENGEL, satış yapan beyanı yoksa ENGEL', () => {
    const p = temizProfil({ sektorler: ['KONUT_GELISTIRICI'], ozelKategoriler: ['HOUSING'] });
    const ihlalli = girdi([satir({ kitle: { ...KITLE_TEMIZ, cinsiyet: 'female' } })]);
    const k = kimlikler(ihlalli, p);
    expect(k).toContain('KNT-01');
    expect(k).toContain('KNT-02');
    expect(kimlikler(girdi([satir()]), { ...p, konutSatisYapan: 'gelistirici' })).not.toContain('KNT-01');
  });

  it('konut metninde fiyat var, m² yoksa KNT-03; varsa geçer', () => {
    const p = temizProfil({ sektorler: ['KONUT_GELISTIRICI'], ozelKategoriler: ['HOUSING'], konutSatisYapan: 'gelistirici' });
    const m = (metin: string) => girdi([satir({ metinler: [{ alan: 'metin', metin, uretici: 'kullanici' }] })]);
    expect(kimlikler(m('2+1 daireler 4.500.000 TL'), p)).toContain('KNT-03');
    expect(kimlikler(m('2+1 daireler 4.500.000 TL, brüt 110 m², net 92 m²'), p)).not.toContain('KNT-03');
  });

  it('finans kategorisinde FIN-01 kısıt seti koşar', () => {
    const p = temizProfil({ ozelKategoriler: ['FINANCIAL_PRODUCTS_SERVICES'] });
    expect(kimlikler(girdi([satir({ kitle: { ...KITLE_TEMIZ, yasMax: 45 } })]), p)).toContain('FIN-01');
  });

  it('KRİTİK: "diğer" sektörde medikal sözcük ENGEL (sektör kaçağının ikinci ağı)', () => {
    const p = temizProfil({ sektorler: ['DIGER'], sektorMetni: 'Güzellik' });
    const g = girdi([satir({ metinler: [{ alan: 'metin', metin: 'Botoks kampanyası bu ay', uretici: 'kullanici' }] })]);
    expect(kimlikler(g, p)).toContain('SGL-05');
    // Sektör metninde geçmesi de yeter.
    expect(kimlikler(girdi([satir()]), temizProfil({ sektorler: ['DIGER'], sektorMetni: 'Diş kliniği' }))).toContain('SGL-05');
  });
});

describe('metin kuralları', () => {
  const metinli = (metin: string, uretici: 'ai' | 'kullanici') => girdi([satir({ metinler: [{ alan: 'metin', metin, uretici }] })]);

  it('KRİTİK: kişisel nitelik kalıbı kullanıcıda UYARI, yapay zekâda ENGEL', () => {
    const k = metinli('Borçların mı var? Hemen ara', 'kullanici');
    const a = metinli('Borçların mı var? Hemen ara', 'ai');
    expect(uyumDenetle(k, temizProfil(), KATALOG_SURUMU, T).bulgular.find((b) => b.kuralKimligi === 'GNL-09')?.seviye).toBe('UYARI');
    expect(uyumDenetle(a, temizProfil(), KATALOG_SURUMU, T).bulgular.find((b) => b.kuralKimligi === 'GNL-09')?.seviye).toBe('ENGEL');
  });

  it('kelime sınırı Türkçe harflerle: "dairesel" konut sinyali değil', () => {
    expect(kimlikler(metinli('Dairesel tasarım', 'kullanici'))).not.toContain('GNL-13');
    expect(kimlikler(metinli('Kiralık daire fırsatı', 'kullanici'))).toContain('GNL-13');
    // Çekim eki eşleşir: "dairesi".
    expect(kimlikler(metinli('Sitenin en güzel dairesi', 'kullanici'))).toContain('GNL-13');
  });

  it('KRİTİK: yasal uyarı tanımlıysa ve metinde yoksa ENGEL; planda (metin yokken) sessiz', () => {
    const p = temizProfil({ yasalUyari: 'Kampanya 31 Ekim’e kadar geçerlidir.' });
    expect(kimlikler(metinli('Yeni sezon geldi', 'ai'), p)).toContain('GNL-14');
    expect(kimlikler(metinli('Yeni sezon. Kampanya 31 Ekim’e kadar geçerlidir.', 'ai'), p)).not.toContain('GNL-14');
    expect(kimlikler(planGirdi(), p)).not.toContain('GNL-14');
  });

  it('fiyat var ama "KDV dahil" yoksa UYARI', () => {
    expect(kimlikler(metinli('Sadece 1.299 TL', 'kullanici'))).toContain('GNL-10');
    expect(kimlikler(metinli('Sadece 1.299 TL, KDV dahil', 'kullanici'))).not.toContain('GNL-10');
  });

  it('UYARI işaretlenince uyum geçer; mesaj değişirse işaret düşer', () => {
    const g = metinli('Türkiye’nin en iyi kahvesi', 'kullanici');
    const d = uyumDenetle({ ...g, icerikOzeti: 'o' }, temizProfil(), KATALOG_SURUMU, T);
    const b = d.bulgular.find((x) => x.kuralKimligi === 'GNL-08')!;
    expect(uyumDurumu(d, [], 'o')).toBe('uyari_isaret_bekliyor');
    expect(uyumDurumu(d, [{ kuralKimligi: 'GNL-08', mesaj: b.mesaj, userId: U(9), zaman: T }], 'o')).toBe('gecti');
    expect(uyumDurumu(d, [{ kuralKimligi: 'GNL-08', mesaj: 'eski metin', userId: U(9), zaman: T }], 'o')).toBe('uyari_isaret_bekliyor');
  });
});

describe('denetimin biçimi', () => {
  it('belirlenimci: aynı girdi aynı bulgu listesi, ENGEL önce', () => {
    const g = girdi([
      satir({ yer: 'b', metinler: [{ alan: 'metin', metin: 'en iyi fiyat 99 TL', uretici: 'kullanici' }] }),
      satir({ yer: 'a', kitle: { ...KITLE_TEMIZ, yasMin: 13 } }),
    ]);
    const p = temizProfil({ ozelKategoriler: null });
    const a = uyumDenetle(g, p, KATALOG_SURUMU, T);
    const b = uyumDenetle(g, p, KATALOG_SURUMU, T);
    expect(a).toEqual(b);
    const sira = a.bulgular.map((x) => x.seviye);
    expect(sira.indexOf('UYARI')).toBeGreaterThan(sira.lastIndexOf('ENGEL'));
  });

  it('yürürlüğü gelmemiş kural BİLGİ olarak görünür ve tarihini yazar', () => {
    const kural = UYUM_KATALOGU.find((k) => k.kimlik === 'GNL-08')!;
    const eski = kural.yururlukTarihi;
    try {
      (kural as { yururlukTarihi: string }).yururlukTarihi = '2027-01-01';
      const d = uyumDenetle(girdi([satir({ metinler: [{ alan: 'metin', metin: 'en iyi', uretici: 'kullanici' }] })]), temizProfil(), KATALOG_SURUMU, T);
      const b = d.bulgular.find((x) => x.kuralKimligi === 'GNL-08')!;
      expect(b.seviye).toBe('BILGI');
      expect(b.mesaj).toMatch(/^2027-01-01 itibarıyla zorunlu:/);
    } finally {
      (kural as { yururlukTarihi: string }).yururlukTarihi = eski;
    }
  });

  it('taslak girdisi: yapay zekâ metni `ai` sayılır, adres yolu sinyal kaynağı', () => {
    const p = planUret(planGirdisi());
    const s = p.satirlar.find((x) => x.platform === 'meta')!;
    const t = satirdanTaslak(s, {
      planId: U(50),
      planSurum: 1,
      onayKaynagi: { tur: 'onayli_plan', kimlik: `${U(50)}@1`, zaman: T },
      takvim: p.takvim!,
      hesap: null,
      sayfa: null,
      instagram: null,
      kitleKonumlari: new Map(),
      ozelKategoriler: null,
      hedefAdres: { deger: 'https://ornek.com/kiralik-daire', kaynak: { tur: 'marka_merkezi', kimlik: U(5), zaman: T } },
      formSablonuId: null,
      tabanNegatifler: null,
      zaman: T,
    });
    const g = taslakUyumGirdisi(
      { ...t, metinler: { dolu: true, deger: [{ varlikId: null, baslik: 'B', metin: 'Kilo mu vermek istiyorsun?' }], kaynak: { tur: 'yz_metin', kimlik: 'gemini', zaman: T } } },
      planKanonikIcerik(p),
      '2026-10-07',
      KITLE_TEMIZ,
    );
    const d = uyumDenetle(g, temizProfil(), KATALOG_SURUMU, T);
    expect(d.bulgular.find((b) => b.kuralKimligi === 'GNL-09')?.seviye).toBe('ENGEL');
    expect(d.bulgular.some((b) => b.kuralKimligi === 'GNL-13')).toBe(true);
  });
});

describe('sektör eşlemesi', () => {
  it('boş → null (beyan yok); tanınan → sektör; tanınmayan dolu → DIGER', () => {
    expect(sektorCoz(null)).toBeNull();
    expect(sektorCoz('  ')).toBeNull();
    expect(sektorCoz('İnşaat ve konut projeleri')).toEqual(['KONUT_GELISTIRICI']);
    expect(sektorCoz('Emlak ofisi')).toEqual(['EMLAK_ARACI']);
    expect(sektorCoz('Mobilya')).toEqual(['DIGER']);
    expect(sektorCoz('Diş kliniği')).toEqual(['SAGLIK_KURULUSU']);
  });
});
