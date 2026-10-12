import { describe, expect, it } from 'vitest';
import {
  anomaliBul,
  bosNedenSayaci,
  donusumKesildiBulgusu,
  donusumPencereleri,
  gozlemKarari,
  gunDegeri,
  gunEkle,
  kampanyaToplami,
  okunacakGunler,
  reklamOnaysizBulgulari,
  sifirGosterimBulgulari,
  sureDolduMu,
  type GunSayilari,
  type VarlikSerisi,
} from './sinyal-hesap';

/**
 * SİNYAL HESABININ SAF PARÇALARI — ÇALIŞTIRILARAK (kaynak taraması değil).
 * Veritabanı yolu `sinyal-hesap.service.spec.ts`te.
 */

const GUN = '2026-10-11';
const n = (gosterim: number, harcama: number, tiklama = 100, donusum = 10): GunSayilari => ({ gosterim, tiklama, harcama, donusum });

function seri(gunler: Array<[string, GunSayilari]>, degerlendir = true): VarlikSerisi {
  return { seviye: 'campaign', varlikId: 'c1', varlikAdi: 'Kampanya', ustAdi: 'Hesap', gunler: new Map(gunler), degerlendir };
}

/** Haftanın aynı günü, altı hafta geçmiş + gözlem günü. */
function haftalik(gecmis: GunSayilari, gozlem: GunSayilari | null): Array<[string, GunSayilari]> {
  const out: Array<[string, GunSayilari]> = [];
  for (let k = 6; k >= 1; k--) out.push([gunEkle(GUN, -7 * k), gecmis]);
  if (gozlem) out.push([GUN, gozlem]);
  return out;
}

describe('eksik gün: sıfır mı, bilinmiyor mu', () => {
  it('KRİTİK: ilk görülen günden SONRAKİ eksik gün SIFIR (Meta sıfır teslimde satır döndürmüyor)', () => {
    const v = seri(haftalik(n(10_000, 100), null));
    expect(gunDegeri(v, GUN)).toEqual({ gosterim: 0, tiklama: 0, harcama: 0, donusum: 0 });
  });

  it('ilk görülen günden ÖNCEKİ gün bilinmiyor (yeni kampanyanın geçmişi "0" değil)', () => {
    const v = seri([[GUN, n(10, 1)]]);
    expect(gunDegeri(v, gunEkle(GUN, -7))).toBeNull();
  });

  it('KRİTİK: yayın TAMAMEN durunca (satır yok) gösterim düşüşü anomali ve yüksek önem', () => {
    const nedenler = bosNedenSayaci();
    const b = anomaliBul(seri(haftalik(n(10_000, 100), null)), GUN, nedenler);
    const g = b.find((x) => x.kod === 'gosterim');
    expect(g).toMatchObject({ yon: 'dusus', gozlenen: 0, onem: 'yuksek' });
  });
});

describe('anomali bulma', () => {
  it('harcama sıçraması: yön artış, seri ve bant dolu', () => {
    const b = anomaliBul(seri(haftalik(n(10_000, 100), n(10_000, 400))), GUN, bosNedenSayaci());
    const h = b.find((x) => x.kod === 'harcama')!;
    expect(h.yon).toBe('artis');
    expect(h.gun).toBe(GUN);
    expect(h.orta).toBe(100);
    const s = h.kanit.seri as { gunler: string[]; degerler: number[]; bant: { alt: number; ust: number } };
    expect(s.gunler).toHaveLength(7);
    expect(s.gunler[6]).toBe(GUN);
    expect(s.degerler[6]).toBe(400);
    expect(s.bant.ust).toBeLessThan(400);
  });

  it('dönüşüm metrikleri gecikme kadar GERİDEN değerlendiriliyor (Ç-10)', () => {
    const gunler = okunacakGunler(GUN);
    expect(gunler).toContain(gunEkle(GUN, -3));
    expect(gunler).toContain(gunEkle(GUN, -3 - 42));
  });

  it('KRİTİK: kullanıcının durdurduğu (değerlendirilmeyen) kampanya sinyal üretmiyor', () => {
    expect(anomaliBul(seri(haftalik(n(10_000, 100), null), false), GUN, bosNedenSayaci())).toEqual([]);
  });

  it('atılan değerlendirmeler NEDENİYLE sayılıyor', () => {
    const nedenler = bosNedenSayaci();
    anomaliBul(seri(haftalik(n(10_000, 100), n(10_000, 100))), GUN, nedenler);
    const toplam = Object.values(nedenler).reduce((a, b) => a + b, 0);
    expect(toplam).toBe(6);
    expect(nedenler.aralik_icinde).toBeGreaterThan(0);
  });

  it('hesap toplamı kampanya SAYILARINDAN (oran değil)', () => {
    const t = kampanyaToplami([seri([[GUN, n(10, 1, 1, 0)]]), seri([[GUN, n(30, 2, 3, 1)]])]);
    expect(t.get(GUN)).toEqual({ gosterim: 40, tiklama: 4, harcama: 3, donusum: 1 });
  });
});

describe('sağlık kontrolleri', () => {
  const kampanya = {
    id: 'c1',
    ad: 'K',
    ustAd: 'H',
    etkin: true,
    etkinSetVar: true,
    kayitGunu: gunEkle(GUN, -30),
    gosterim: 0,
    sonGosterimGunu: null,
  };

  it('etkin, eski ve 7 gündür gösterimsiz kampanya bulgu', () => {
    expect(sifirGosterimBulgulari([kampanya], GUN, true)).toHaveLength(1);
  });

  it('KRİTİK: veri bayatken SUSUYOR (satır yok = 0 sayılıyor, çekim durmuşsa her şey sıfır görünür)', () => {
    expect(sifirGosterimBulgulari([kampanya], GUN, false)).toEqual([]);
  });

  it('yeni kampanya, durdurulmuş kampanya ve bütün setleri kapalı kampanya bulgu değil', () => {
    expect(sifirGosterimBulgulari([{ ...kampanya, kayitGunu: gunEkle(GUN, -3) }], GUN, true)).toEqual([]);
    expect(sifirGosterimBulgulari([{ ...kampanya, etkin: false }], GUN, true)).toEqual([]);
    expect(sifirGosterimBulgulari([{ ...kampanya, etkinSetVar: false }], GUN, true)).toEqual([]);
    expect(sifirGosterimBulgulari([{ ...kampanya, gosterim: 1 }], GUN, true)).toEqual([]);
  });

  it('reddedilen reklam yüksek önem; sorunsuz reklam bulgu değil', () => {
    const b = reklamOnaysizBulgulari(
      [
        { id: 'a1', ad: 'R1', ustAd: 'S', platform: 'meta', reviewStatus: 'DISAPPROVED', disapprovalReasons: null },
        { id: 'a2', ad: 'R2', ustAd: 'S', platform: 'meta', reviewStatus: 'APPROVED', disapprovalReasons: null },
      ],
      GUN,
    );
    expect(b.map((x) => x.varlikId)).toEqual(['a1']);
    expect(b[0]!.onem).toBe('yuksek');
  });

  it('dönüşüm "vardı, kesildi": hiç dönüşümü olmayan hesap uyarılmıyor', () => {
    const p = donusumPencereleri(GUN);
    const g = {
      hesapId: 'h',
      hesapAdi: 'H',
      pencere: { ...p.pencere, gosterim: 10_000, donusum: 0 },
      onceki: { ...p.onceki, donusum: 25 },
    };
    expect(donusumKesildiBulgusu(g, GUN, true)?.kod).toBe('donusum_kesildi');
    expect(donusumKesildiBulgusu({ ...g, onceki: { ...g.onceki, donusum: 0 } }, GUN, true)).toBeNull();
    expect(donusumKesildiBulgusu({ ...g, pencere: { ...g.pencere, gosterim: 100 } }, GUN, true)).toBeNull();
    expect(donusumKesildiBulgusu(g, GUN, false)).toBeNull();
    // Pencere gecikme kadar geride bitiyor ve önceki dönemle bitişik.
    expect(p.pencere.son).toBe(gunEkle(GUN, -3));
    expect(gunEkle(p.onceki.son, 1)).toBe(p.pencere.bas);
  });
});

describe('durum geçişi', () => {
  it('yeni bulgu açılıyor ve BİLDİRİLİYOR', () => {
    expect(gozlemKarari(null, 5)).toEqual({ olay: 'gozlendi', sonraki: 'acik', acildi: true });
  });

  it('açık sinyalin yeniden görülmesi bildirim DEĞİL (her sabah aynı sinyal kanalı susturur)', () => {
    expect(gozlemKarari({ durum: 'acik', kapatmaZ: null }, 5).acildi).toBe(false);
  });

  it('KRİTİK: kapatılmış sinyal aynı şiddette kapalı kalıyor, kötüleşince açılıyor', () => {
    expect(gozlemKarari({ durum: 'kapatildi', kapatmaZ: 10 }, 11)).toMatchObject({ sonraki: 'kapatildi', acildi: false });
    expect(gozlemKarari({ durum: 'kapatildi', kapatmaZ: 10 }, 16)).toMatchObject({ olay: 'kotulesti', sonraki: 'acik', acildi: true });
  });

  it('kendiliğinden kapanmış sinyal yeniden görülünce YENİ olay olarak açılıyor', () => {
    expect(gozlemKarari({ durum: 'kendiliginden_kapandi', kapatmaZ: null }, 3)).toMatchObject({ sonraki: 'acik', acildi: true });
  });

  it('süre: anomali 7 gün; sağlık YALNIZ kontrol koştuysa', () => {
    const simdi = new Date('2026-10-20T00:00:00Z');
    const eski = new Date('2026-10-12T00:00:00Z');
    const yeni = new Date('2026-10-15T00:00:00Z');
    expect(sureDolduMu({ tur: 'anomali', kod: 'harcama', sonGorulme: eski }, simdi, new Set())).toBe(true);
    expect(sureDolduMu({ tur: 'anomali', kod: 'harcama', sonGorulme: yeni }, simdi, new Set())).toBe(false);
    expect(sureDolduMu({ tur: 'saglik', kod: 'sifir_gosterim', sonGorulme: yeni }, simdi, new Set(['sifir_gosterim']))).toBe(true);
    // Veri bayatken kontrol koşmadı: düzelmemiş sorunu "düzeldi" diye kapatmak yok.
    expect(sureDolduMu({ tur: 'saglik', kod: 'sifir_gosterim', sonGorulme: eski }, simdi, new Set())).toBe(false);
  });
});
