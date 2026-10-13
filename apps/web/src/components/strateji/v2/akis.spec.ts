import { describe, expect, it } from 'vitest';
import type { StratejiKalemi, StratejiListeSatiri, StratejiSihirbazGirdileri } from '@advetics/shared';
import {
  adrestekiHedefler,
  butceDurumu,
  gecerliAdim,
  hedefDegistir,
  hedefKarti,
  incelemeAcilisi,
  incelemeYuzdesi,
  kaydiriciAraligi,
  kurulabilirMi,
  kurulumSirasi,
  kurulumSatiri,
  olusturKarti,
  rayParcalari,
  siradakiKalem,
} from './akis';

/**
 * ═══ ADIM ADIM AKIŞIN KARARLARI — ÇALIŞTIRILARAK ═══
 * Kaynak taramaları `strateji-v2-sayfa.spec.ts`te; burada davranış.
 */

describe('ilerleme rayı ve adım', () => {
  it('yedi parça: öncekiler bitti, bulunulan şimdi, sonrakiler sırada', () => {
    const r = rayParcalari('bolge');
    expect(r).toHaveLength(7);
    expect(r.map((x) => x.hal)).toEqual(['bitti', 'bitti', 'simdi', 'sirada', 'sirada', 'sirada', 'sirada']);
  });
  it('KRİTİK: adresle kayıtlı adımın İLERİSİNE atlanamaz; plan yokken yalnız hedef ve bütçe', () => {
    expect(gecerliAdim('plan', 'bolge', true)).toBe('bolge');
    expect(gecerliAdim('kime', 'plan', true)).toBe('kime');
    expect(gecerliAdim('inceleme', null, false)).toBe('hedef');
    expect(gecerliAdim('butce', null, false)).toBe('butce');
  });
});

describe('1 · hedef', () => {
  it('KRİTİK: seçim sırası = öncelik; kaldırınca arkadakiler öne kayar', () => {
    let s = hedefDegistir([], 'FORM');
    s = hedefDegistir(s, 'SITE');
    s = hedefDegistir(s, 'VIDEO');
    expect(s).toEqual(['FORM', 'SITE', 'VIDEO']);
    expect(hedefDegistir(s, 'FORM')).toEqual(['SITE', 'VIDEO']);
  });
  it('adresteki liste temizlenir: bilinmeyen ve tekrar atılır', () => {
    expect(adrestekiHedefler('FORM,XYZ,SITE,FORM')).toEqual(['FORM', 'SITE']);
    expect(adrestekiHedefler(undefined)).toEqual([]);
  });
  it('KRİTİK: kapalı kart NEDENİYLE (motorun cümlesi, platform öneki atılmış); okunamayan hedef kapalı', () => {
    expect(hedefKarti({ amac: 'TELEFON', acik: false, platformlar: [], sebepler: ['Meta: “Beni arasınlar” bu platformda ölçülmüyor; Kurulum › Ölçüm.'] })).toEqual({
      kapali: true,
      neden: '“Beni arasınlar” bu platformda ölçülmüyor; Kurulum › Ölçüm.',
      platformlar: '',
    });
    expect(hedefKarti({ amac: 'SITE', acik: true, platformlar: ['meta', 'google'], sebepler: [] })).toEqual({ kapali: false, neden: null, platformlar: 'Meta + Google' });
    expect(hedefKarti(undefined).kapali).toBe(true);
  });
});

describe('2 · bütçe', () => {
  const g: Pick<StratejiSihirbazGirdileri, 'amaclar' | 'asgariGunluk' | 'paraBirimi'> = {
    amaclar: [
      { amac: 'FORM', acik: true, platformlar: ['meta'], sebepler: [] },
      { amac: 'SITE', acik: true, platformlar: ['meta', 'google'], sebepler: [] },
    ],
    asgariGunluk: { meta: '250000000', googleTalepYaratma: null },
    paraBirimi: 'TRY',
  };
  const temel = { sureAy: 1, baslangicAyi: '2026-11', amaclar: ['FORM', 'SITE'] as const, girdiler: g, kayitli: null };

  it('KRİTİK: aylık, günlük ve hedef başına günlük TAM SAYI aritmetiğiyle; asgarinin altında ilerlemez', () => {
    // 30.000 TL / 30 gün; FORM 2/3 = 20.000 → 666,66 TL/gün ≥ 250; SITE Google Arama sınırsız.
    const d = butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: '30.000' });
    expect(d.gun).toBe(30);
    expect(d.gunluk).toBe(1_000_000_000n);
    expect(d.kontrol!.satirlar.map((s) => s.durum)).toEqual(['yeter', 'yeter']);
    expect(d.ilerler).toBe(true);
    // 6.000 TL: FORM 4.000 / 30 = 133,33 TL/gün < 250 → yetmez.
    const az = butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: '6.000' });
    expect(az.ilerler).toBe(false);
    expect(az.kontrol!.satirlar[0]!.cumle).toContain('250,00 TL');
  });
  it('boş ya da geçersiz tutar ilerlemez ve kontrol koşmaz', () => {
    expect(butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: '' }).ilerler).toBe(false);
    expect(butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: 'abc' }).kontrol).toBeNull();
  });
  it('KRİTİK: kayıtlı planda bütçe/süre değişirse kampanyaların yeniden kurulacağı söylenir; değişmezse söylenmez', () => {
    const kayitli = { toplamMicros: '30000000000', baslangic: '2026-11-01', bitis: '2026-11-30', kalemSayisi: 2 };
    expect(butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: '30.000', kayitli }).planYenidenKurulur).toBe(false);
    expect(butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: '40.000', kayitli }).planYenidenKurulur).toBe(true);
    expect(butceDurumu({ ...temel, amaclar: [...temel.amaclar], sureAy: 2, metin: '30.000', kayitli }).planYenidenKurulur).toBe(true);
    expect(butceDurumu({ ...temel, amaclar: [...temel.amaclar], metin: '40.000', kayitli: { ...kayitli, kalemSayisi: 0 } }).planYenidenKurulur).toBe(false);
  });
  it('kaydırıcı yazılanı kırpmaz', () => {
    expect(kaydiriciAraligi(null).max).toBe(1_000_000);
    expect(kaydiriciAraligi(3_000_000n * 1_000_000n).max).toBeGreaterThanOrEqual(3_000_000);
  });
});

describe('5 · inceleme', () => {
  it('KRİTİK: kayıtlı kampanya varken inceleme KENDİLİĞİNDEN koşmaz (düzenlemeler sorulmadan silinmez)', () => {
    expect(incelemeAcilisi({ kalemSayisi: 0, kayitliImza: null, imza: 'a' })).toBe('kos');
    expect(incelemeAcilisi({ kalemSayisi: 0, kayitliImza: 'b', imza: 'a' })).toBe('kos');
    expect(incelemeAcilisi({ kalemSayisi: 3, kayitliImza: 'a', imza: 'a' })).toBe('ozet');
    // Girdi değişti ya da sihirbazdan önce açılmış plan (imza yok): SOR.
    expect(incelemeAcilisi({ kalemSayisi: 3, kayitliImza: 'b', imza: 'a' })).toBe('sor');
    expect(incelemeAcilisi({ kalemSayisi: 3, kayitliImza: null, imza: 'a' })).toBe('sor');
  });
  it('KRİTİK: yüzde SAYIM (biten + düşen), zaman değil', () => {
    expect(incelemeYuzdesi([{ tur: 'sirada' }, { tur: 'okunuyor' }])).toBe(0);
    expect(incelemeYuzdesi([{ tur: 'bitti', ozet: 'x', uyari: false }, { tur: 'dustu', mesaj: 'y' }, { tur: 'okunuyor' }, { tur: 'sirada' }])).toBe(50);
  });
});

describe('giriş', () => {
  const satir = (o: Partial<StratejiListeSatiri>): StratejiListeSatiri => ({
    id: 'p1',
    bicim: 2,
    durum: 'taslak',
    baslangic: '2026-11-01',
    bitis: '2026-11-30',
    donem: null,
    toplamButceMicros: '1',
    paraBirimi: 'TRY',
    surum: 1,
    guncellendi: '2026-10-13T00:00:00Z',
    kalemSayisi: 0,
    ...o,
  });
  it('KRİTİK: açık taslak varsa "devam", onay bekleyen varsa yeni oluşturulamaz, yoksa yeni', () => {
    expect(olusturKarti([])).toEqual({ tur: 'yeni' });
    expect(olusturKarti([satir({ durum: 'onaylandi' })])).toEqual({ tur: 'yeni' });
    expect(olusturKarti([satir({ durum: 'taslak' })])).toEqual({ tur: 'devam', planId: 'p1', revizyon: false });
    expect(olusturKarti([satir({ durum: 'revizyon' })])).toEqual({ tur: 'devam', planId: 'p1', revizyon: true });
    expect(olusturKarti([satir({ durum: 'onayda' })])).toEqual({ tur: 'onayda', planId: 'p1' });
    expect(olusturKarti([satir({ bicim: 1, durum: 'taslak' })])).toEqual({ tur: 'yeni' });
  });
});

describe('kampanyaları kur (tek tek)', () => {
  const k = (id: string, aktarildi = false): Pick<StratejiKalemi, 'id' | 'durum'> => ({
    id,
    durum: aktarildi ? { tur: 'aktarildi', rehberId: `r-${id}`, rehberDurumu: 'taslak', platformlar: {} } : { tur: 'aktarilmadi' },
  });
  it('KRİTİK: sıradaki = adresteki geçerliyse o, değilse açılmamış ilk; hepsi açıldıysa bitiş', () => {
    const l = [k('a', true), k('b'), k('c')];
    expect(siradakiKalem(l, null, new Set())).toBe('b');
    expect(siradakiKalem(l, 'c', new Set())).toBe('c');
    expect(siradakiKalem(l, 'yok', new Set())).toBe('b');
    expect(siradakiKalem(l, null, new Set(['b']))).toBe('c');
    expect(siradakiKalem([k('a', true)], null, new Set())).toBeNull();
  });
  it('liste: açılan bitti, sıradaki şimdi', () => {
    expect(kurulumSirasi([k('a', true), k('b'), k('c')], 'b').map((x) => x.hal)).toEqual(['bitti', 'simdi', 'sirada']);
  });
  it('KRİTİK: karar SUNUCUNUN; engel nedeniyle bekler, önizlemede olmayan "bilinmiyor"', () => {
    expect(kurulumSatiri(k('a'), { tur: 'aktarilabilir', platformlar: { meta: true, google: false }, dusenler: [] }).hal).toBe('hazir');
    const e = kurulumSatiri(k('a'), { tur: 'engel', engel: 'kaynak_silinmis' });
    expect(e.hal).toBe('bekliyor');
    expect(e.neden).toBeTruthy();
    expect(kurulumSatiri(k('a'), null).hal).toBe('bilinmiyor');
    expect(kurulumSatiri(k('a', true), null).hal).toBe('acildi');
  });
  it('KRİTİK: yalnız onaylı ve onaylanan sürüm bu sürümse kurulur', () => {
    expect(kurulabilirMi({ durum: 'onaylandi', surum: 3, onaylananSurum: 3 })).toBe(true);
    expect(kurulabilirMi({ durum: 'onaylandi', surum: 4, onaylananSurum: 3 })).toBe(false);
    expect(kurulabilirMi({ durum: 'onayda', surum: 3, onaylananSurum: null })).toBe(false);
  });
});
