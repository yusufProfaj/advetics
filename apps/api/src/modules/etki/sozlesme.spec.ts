import { describe, expect, it } from 'vitest';
import {
  ETKI,
  ETKI_ACIK_DURUMLARI,
  ETKI_DURUMLARI,
  ETKI_SON_DURUMLARI,
  ETKI_UCLARI,
  PERMISSIONS,
  birlikteOlculenler,
  degisiklikTuru,
  denetimEylemi,
  etkiCumlesi,
  etkiGecisi,
  etkiHukmu,
  etkiPencereleri,
  farkIcindeFark,
  hukumMetrigi,
  karisikMi,
  olcumKapsami,
  onKosulNedeni,
  resolvePermissions,
  type EtkiGirdisi,
  type PencereToplami,
} from '@advetics/shared';

/**
 * ═══ DEĞİŞİKLİK ETKİSİ SÖZLEŞMESİ (Paket C, Ajan 1) ═══
 *
 * Saf fonksiyonlar ÇALIŞTIRILARAK sınanıyor. Mutasyon yapılacaksa önce
 * `packages/shared` yeniden derlenmeli: testler `dist`i okuyor (CLAUDE.md).
 */

const p = (gun: number, harcama: number, tiklama: number, donusum: number): PencereToplami => ({ gun, harcama, tiklama, donusum });

/** Bol hacimli, sabit bir hesap: 14 gün öncesi, 7 gün sonrası. */
function girdi(deneySonraHarcama: number, kontrolSonraHarcama: number, ek: Partial<EtkiGirdisi> = {}): EtkiGirdisi {
  return {
    deney: { plasebo: p(14, 14_000, 1400, 140), once: p(14, 14_000, 1400, 140), sonra: p(7, deneySonraHarcama, 700, 70) },
    kontrol: { plasebo: p(14, 28_000, 2800, 280), once: p(14, 28_000, 2800, 280), sonra: p(7, kontrolSonraHarcama, 1400, 140) },
    sonNokta: false,
    ...ek,
  };
}

describe('pencereler', () => {
  it('KRİTİK: değişiklik günü hiçbir pencereye girmiyor', () => {
    const w = etkiPencereleri('2026-10-10', 7);
    expect(w.once.son).toBe('2026-10-09');
    expect(w.sonra.bas).toBe('2026-10-11');
    expect(w.once.bas).toBe('2026-09-26'); // 14 gün
    expect(w.sonra.son).toBe('2026-10-17'); // 7 gün
    expect(w.plasebo.son).toBe('2026-09-25');
    expect(w.plasebo.bas).toBe('2026-09-12');
  });

  it('dönüşüm olgunlaşmadan hesaplanmaz (Paket A ile aynı gecikme)', () => {
    const w = etkiPencereleri('2026-10-10', 7);
    expect(w.hesaplanabilir).toBe('2026-10-21'); // 17 + 3 + 1
    expect(ETKI.donusumBeklemeGun).toBe(3);
  });

  it('ölçüm noktaları artan ve sonlu (son nokta = kapanış)', () => {
    const n = ETKI.olcumNoktalariGun;
    expect(n.length).toBeGreaterThan(0);
    for (let i = 1; i < n.length; i++) expect(n[i]!).toBeGreaterThan(n[i - 1]!);
  });
});

describe('ölçüm kapsamı', () => {
  it('bütçede kendisi, durdurmada üstü', () => {
    expect(olcumKapsami('butce_artir', 'campaign')).toMatchObject({ seviye: 'campaign', hangi: 'kendisi', kontrol: true });
    expect(olcumKapsami('durdur', 'ad')).toMatchObject({ seviye: 'ad_group', hangi: 'ustu', kontrol: true });
    expect(olcumKapsami('durdur', 'ad_group')).toMatchObject({ seviye: 'campaign', hangi: 'ustu', kontrol: true });
  });

  it('KRİTİK: kampanya durdurmanın kontrol grubu yok (kapsam hesap)', () => {
    expect(olcumKapsami('durdur', 'campaign')).toMatchObject({ seviye: 'account', kontrol: false });
  });

  it('KRİTİK: reklam seti kapsamında aynı kampanyanın setleri kontrole girmez (CBO bütçe aktarımı)', () => {
    expect(olcumKapsami('durdur', 'ad').kontroldenCikar).toBe('ayni_kampanyanin_setleri');
    expect(olcumKapsami('butce_azalt', 'ad_group').kontroldenCikar).toBe('ayni_kampanyanin_setleri');
    expect(olcumKapsami('butce_artir', 'campaign').kontroldenCikar).toBe('yok');
  });
});

describe('kaynak', () => {
  it('kampanya eylemi denetim satırı ayrışıyor', () => {
    expect(denetimEylemi('campaign.pause')).toEqual({ seviye: 'campaign', eylem: 'pause' });
    expect(denetimEylemi('ad_group.set_budget')).toEqual({ seviye: 'ad_group', eylem: 'set_budget' });
  });

  it('KRİTİK: kural denetim satırı (rule.*) kampanya eylemi sayılmaz (iki kez ölçülmesin)', () => {
    expect(denetimEylemi('rule.pause')).toBeNull();
    expect(denetimEylemi('rule.adjust_budget')).toBeNull();
    expect(denetimEylemi('client.updated')).toBeNull();
  });

  it('bütçe yönü tutarlardan; eşit ya da okunamazsa ölçülmez', () => {
    expect(degisiklikTuru('set_budget', '500000000', '600000000')).toBe('butce_artir');
    expect(degisiklikTuru('adjust_budget', '600000000', '500000000')).toBe('butce_azalt');
    expect(degisiklikTuru('set_budget', '500000000', '500000000')).toBeNull();
    expect(degisiklikTuru('set_budget', null, '500000000')).toBeNull();
    expect(degisiklikTuru('pause', null, null)).toBe('durdur');
    // Başlatma ve kopya ölçülmez (öncesi yok).
    expect(degisiklikTuru('resume', null, null)).toBeNull();
    expect(degisiklikTuru('copy', null, null)).toBeNull();
  });
});

describe('fark içinde fark', () => {
  it('KRİTİK: kontrol grubu da aynı oranda değiştiyse etki sıfır', () => {
    // Deney maliyeti %20 arttı ama kontrol de %20 arttı: değişikliğin payı yok.
    const e = farkIcindeFark(
      'donusum_basi_maliyet',
      { once: p(14, 10_000, 1000, 100), sonra: p(7, 6000, 500, 50) },
      { once: p(14, 20_000, 2000, 200), sonra: p(7, 12_000, 1000, 100) },
    );
    expect(e).toBeCloseTo(0, 10);
  });

  it('kontrolsüz hâl düz önce/sonra', () => {
    const e = farkIcindeFark('donusum_basi_maliyet', { once: p(14, 10_000, 1000, 100), sonra: p(7, 6000, 500, 50) }, null);
    expect(e).toBeCloseTo(0.2, 10);
  });

  it('günlük sayımlar pencere uzunluğuna bölünüyor (14 ve 7 gün)', () => {
    const e = farkIcindeFark('gunluk_harcama', { once: p(14, 14_000, 0, 0), sonra: p(7, 7000, 0, 0) }, null);
    expect(e).toBeCloseTo(0, 10);
  });

  it('payda sıfırsa null (uydurma sıfır yok)', () => {
    expect(farkIcindeFark('donusum_basi_maliyet', { once: p(14, 100, 10, 0), sonra: p(7, 100, 10, 2) }, null)).toBeNull();
  });
});

describe('hüküm', () => {
  it('maliyet kontrolden belirgin daha çok düştüyse iyileşti', () => {
    // Deney CPA 100 → 70, kontrol 100 → 100.
    const h = etkiHukmu(girdi(4900, 14_000));
    expect(h.sonuc).toBe('iyilesti');
    expect(h.metrik).toBe('donusum_basi_maliyet');
    expect(h.etki).toBeCloseTo(-0.3, 5);
  });

  it('maliyet arttıysa kötüleşti', () => {
    expect(etkiHukmu(girdi(9100, 14_000)).sonuc).toBe('kotulesti');
  });

  it('küçük etki, sakin hesapta "fark yok"', () => {
    expect(etkiHukmu(girdi(7350, 14_000)).sonuc).toBe('fark_yok'); // %5
  });

  it('KRİTİK: plasebo gürültülüyse aynı etki "henüz belli değil · gürültülü"', () => {
    // Değişiklikten önceki iki pencere arasında deney %30 oynamış: hesabın olağan gürültüsü büyük.
    const g = girdi(4900, 14_000);
    g.deney.plasebo = p(14, 20_000, 1400, 140);
    const h = etkiHukmu(g);
    expect(h.sonuc).toBe('henuz_belli_degil');
    expect(h.neden).toBe('gurultulu');
    expect(h.esik!).toBeGreaterThan(ETKI.enAzEtki);
  });

  it('dönüşüm azsa tıklama maliyetine düşülür, o da yoksa hacim yetersiz', () => {
    const az = (d: number, t: number) => p(7, 1000, t, d);
    expect(hukumMetrigi([az(20, 300), az(20, 300)])).toBe('donusum_basi_maliyet');
    expect(hukumMetrigi([az(20, 300), az(3, 300)])).toBe('tiklama_basi_maliyet');
    expect(hukumMetrigi([az(3, 300), az(3, 50)])).toBeNull();
  });

  it('KRİTİK: hacim yetmezse ara noktada "henüz belli değil", son noktada "belirsiz"', () => {
    const g = girdi(4900, 14_000);
    g.deney.sonra = p(7, 4900, 100, 5);
    expect(etkiHukmu(g)).toMatchObject({ sonuc: 'henuz_belli_degil', neden: 'hacim_yetersiz' });
    expect(etkiHukmu({ ...g, sonNokta: true })).toMatchObject({ sonuc: 'belirsiz', neden: 'hacim_yetersiz' });
  });

  it('kontrol yoksa hüküm verilmez', () => {
    expect(etkiHukmu(girdi(4900, 14_000, { kontrol: null })).neden).toBe('kontrol_grubu_yok');
  });
});

describe('karışık değişiklik', () => {
  const bu = { gun: '2026-10-10', tur: 'durdur' as const };

  it('aynı kapsamda pencere içinde başka değişiklik karışık', () => {
    expect(karisikMi(bu, [{ gun: '2026-10-13', tur: 'butce_artir' }], 7)).toBe(true);
    // Plasebo dahil: öncesi temiz değilse önce/sonra kıyası da temiz değil.
    expect(karisikMi(bu, [{ gun: '2026-09-15', tur: 'butce_artir' }], 7)).toBe(true);
  });

  it('pencere dışındaki değişiklik karıştırmaz; nokta uzayınca karıştırır', () => {
    const sonra = [{ gun: '2026-10-20', tur: 'butce_artir' as const }];
    expect(karisikMi(bu, sonra, 7)).toBe(false);
    expect(karisikMi(bu, sonra, 14)).toBe(true);
  });

  it('KRİTİK: aynı gün aynı tür birlikte ölçülür, karışık sayılmaz', () => {
    const kardes = [{ gun: '2026-10-10', tur: 'durdur' as const }];
    expect(karisikMi(bu, kardes, 7)).toBe(false);
    expect(birlikteOlculenler(bu, kardes)).toBe(1);
    expect(karisikMi(bu, [{ gun: '2026-10-10', tur: 'butce_artir' }], 7)).toBe(true);
  });
});

describe('durum makinesi', () => {
  const hukum = (g: EtkiGirdisi) => etkiHukmu(g);

  it('KRİTİK: her açık durum, son noktada mutlaka kapanıyor (sonsuz tarama yok)', () => {
    const son = ETKI.olcumNoktalariGun[ETKI.olcumNoktalariGun.length - 1]!;
    const g = girdi(4900, 14_000);
    g.deney.sonra = p(son, 100, 10, 0);
    for (const d of ETKI_ACIK_DURUMLARI) {
      const s = etkiGecisi(d, son, null, hukum({ ...g, sonNokta: true }));
      expect(ETKI_SON_DURUMLARI).toContain(s.durum);
      expect(s.sonuc).not.toBe('henuz_belli_degil');
    }
  });

  it('ara noktada henüz belli değilse sonraki noktaya geçer', () => {
    const g = girdi(4900, 14_000);
    g.deney.sonra = p(7, 100, 10, 0);
    expect(etkiGecisi('bekliyor', 7, null, hukum(g))).toEqual({ durum: 'olcumde', sonrakiNoktaGun: 14, sonuc: 'henuz_belli_degil' });
  });

  it('son noktada yanlışlıkla gelen "henüz" bile satırı kapatır ve belirsiz yazar', () => {
    const son = ETKI.olcumNoktalariGun[ETKI.olcumNoktalariGun.length - 1]!;
    const g = girdi(4900, 14_000);
    g.deney.sonra = p(7, 100, 10, 0);
    expect(etkiGecisi('olcumde', son, null, hukum(g))).toEqual({ durum: 'sonuclandi', sonrakiNoktaGun: null, sonuc: 'belirsiz' });
  });

  it('KRİTİK: kontrol grubu yoksa ilk noktada ölçülemedi (28 gün beklemez)', () => {
    expect(etkiGecisi('bekliyor', 7, null, hukum(girdi(4900, 14_000, { kontrol: null })))).toMatchObject({ durum: 'olculemedi' });
  });

  it('ön koşul sırası: doğrulanmadı > taşındı > veri yok > karışık', () => {
    expect(onKosulNedeni({ dogrulandi: false, hesapTasindi: true, veriYok: true, karisik: true })).toBe('dogrulanmadi');
    expect(onKosulNedeni({ dogrulandi: true, hesapTasindi: true, veriYok: true, karisik: true })).toBe('hesap_tasindi');
    expect(onKosulNedeni({ dogrulandi: true, hesapTasindi: false, veriYok: true, karisik: true })).toBe('veri_yok');
    expect(onKosulNedeni({ dogrulandi: true, hesapTasindi: false, veriYok: false, karisik: true })).toBe('karisik');
    expect(etkiGecisi('bekliyor', 7, 'karisik', null)).toMatchObject({ durum: 'olculemedi' });
  });

  it('kapanmış satır yeniden değerlendirilemez (tarama süzgeci düştüyse patlar)', () => {
    expect(() => etkiGecisi('sonuclandi', 7, null, null)).toThrow();
  });

  it('açık ve son durumlar birlikte bütün durumları kapsıyor', () => {
    expect([...ETKI_ACIK_DURUMLARI, ...ETKI_SON_DURUMLARI].sort()).toEqual([...ETKI_DURUMLARI].sort());
  });
});

describe('ekran cümlesi', () => {
  it('sayılar alanlardan gelir, yön doğru', () => {
    const c = etkiCumlesi({ durum: 'sonuclandi', sonuc: 'iyilesti', neden: null, metrik: 'donusum_basi_maliyet', etkiOrani: -0.183, sonrakiOlcum: null, tur: 'butce_artir' });
    expect(c).toContain('%18');
    expect(c).toContain('düştü');
  });

  it('uzun tire yok (panel metin dili)', () => {
    const hepsi = [
      etkiCumlesi({ durum: 'olcumde', sonuc: 'henuz_belli_degil', neden: 'gurultulu', metrik: null, etkiOrani: null, sonrakiOlcum: '2026-10-24', tur: 'durdur' }),
      etkiCumlesi({ durum: 'olculemedi', sonuc: null, neden: 'kontrol_grubu_yok', metrik: null, etkiOrani: null, sonrakiOlcum: null, tur: 'durdur' }),
      etkiCumlesi({ durum: 'sonuclandi', sonuc: 'belirsiz', neden: 'hacim_yetersiz', metrik: null, etkiOrani: null, sonrakiOlcum: null, tur: 'durdur' }),
    ];
    for (const c of hepsi) expect(c).not.toMatch(/[—–]/);
  });
});

describe('uçlar ve izinler', () => {
  it('uç izinleri gerçek izinler', () => {
    for (const u of ETKI_UCLARI) expect(PERMISSIONS).toContain(u.izin);
  });

  it('KRİTİK: müşteri hesabı etki ekranını görmez (rule.read yok)', () => {
    const musteri = resolvePermissions('client_viewer');
    for (const u of ETKI_UCLARI) expect(musteri.has(u.izin)).toBe(false);
  });
});
