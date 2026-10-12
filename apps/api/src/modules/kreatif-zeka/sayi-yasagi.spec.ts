import { describe, expect, it } from 'vitest';
import { briefMetniDenetle, farkCumlesi, sayiTasiyor, type EtiketFarki } from '@advetics/shared';

/**
 * ═══ Ö-1 + Ö-2 DÜZELTMELERİ: SAYI UYDURMA HİÇBİR YOLDAN GEÇMESİN ═══
 *
 * Ö-2'nin karşı tarafı da kilitli: kural AŞIRI GENİŞ olursa brief'in olağan
 * dili ("bir kişi", "birlikte", "ikinci el") reddedilir ve her brief
 * "üretilemedi" der. Ret de, kabul de sınanıyor.
 */

describe('Ö-2 sayı yasağı', () => {
  it.each([
    'Tıklama %30 artar',
    'Tıklama ３０％ artar',
    'İnsanlı görsel tıklamayı yüzde otuz artırır',
    'Yüzde elli daha ucuz',
    'İnsanlı görseller iki kat daha iyi',
    'Maliyet otuz beş oranında düşer',
    'Dönüşümlerin dörtte biri bu görselden',
    'Arapça rakam ٣٠ de sayılır',
  ])('REDDEDİLİYOR: %s', (m) => {
    expect(sayiTasiyor(m)).toBe(true);
  });

  it.each([
    'Görselin merkezinde bir kişi olsun',
    'Ürünü ve kişiyi birlikte göster',
    'İkinci el izlenimi veren arka plan kullanma',
    'Ön planda tek bir ürün, sade zemin',
    'Onaylanmış logo köşede dursun',
    'Binanın önünde çekilmiş bir fotoğraf',
    'Yüzü görünen bir kişi kullan',
  ])('KABUL EDİLİYOR (aşırı geniş değil): %s', (m) => {
    expect(sayiTasiyor(m)).toBe(false);
  });

  it('briefMetniDenetle kaçın listesini de tarıyor', () => {
    const c = { yon: 'İnsanlı görseller', talimatlar: [{ alan: 'insan', talimat: 'Bir kişi kullan' }], kacin: ['yüzde yüz kırmızı zemin'] };
    expect(briefMetniDenetle(c, [{ alan: 'insan' }]).ok).toBe(false);
    expect(briefMetniDenetle({ ...c, kacin: ['kırmızı zemin'] }, [{ alan: 'insan' }]).ok).toBe(true);
  });
});

describe('Ö-1 fark cümlesi sonsuz/NaN üretmiyor', () => {
  const f = (alt: number, ust: number, goreli: number): EtiketFarki => ({
    karar: 'anlamli',
    yetersizNedeni: null,
    a: { ortalama: 1, kreatif: 8, etkinOrneklem: 6, standartHata: 0.1, harcamaMicros: 1n },
    b: { ortalama: 2, kreatif: 9, etkinOrneklem: 7, standartHata: 0.1, harcamaMicros: 1n },
    goreliFark: goreli,
    aralik: [alt, ust],
  });

  it('alt uç ≤ -1 → tek uçlu "en az"', () => {
    expect(farkCumlesi('insan', 'var', 'donusum_verimi', f(-1.24, -0.26, -0.75))).toBe(
      'İnsan var: dönüşüm başı maliyet en az %35 daha yüksek (8 ve 9 kreatif)',
    );
  });

  it('iki uç da ≤ -1 → sayısız cümle, sonsuz yok', () => {
    const c = farkCumlesi('insan', 'var', 'gosterim_verimi', f(-3, -1.2, -2));
    expect(c).toBe('İnsan var: 1.000 gösterim maliyeti belirgin biçimde daha yüksek (8 ve 9 kreatif)');
  });

  it('tıklama oranında (ters çevirme yok) iki uç da yazılıyor; maliyette iyi yön iki uçlu', () => {
    expect(farkCumlesi('insan', 'var', 'tiklama_orani', f(0.12, 0.31, 0.2))).toContain('%12 ile %31 arası daha yüksek');
    expect(farkCumlesi('insan', 'var', 'donusum_verimi', f(0.25, 1, 0.5))).toContain('%20 ile %50 arası daha düşük');
  });

  it('taranan hiçbir aralıkta Infinity/NaN yok', () => {
    for (let a = -3; a <= 2; a += 0.25) {
      for (let b = a; b <= 2.5; b += 0.25) {
        for (const m of ['donusum_verimi', 'gosterim_verimi', 'tiklama_orani'] as const) {
          expect(farkCumlesi('insan', 'var', m, f(a, b, (a + b) / 2 || 0.1))).not.toMatch(/Infinity|NaN/);
        }
      }
    }
  });
});

describe('sayı yasağı — Türkçe büyük harf ve deyim (Ajan 4 yeniden kapı)', () => {
  it('KRİTİK: cümle başındaki büyük "İ" yasaktan KAÇMIYOR', () => {
    expect(sayiTasiyor('İki kat daha fazla tıklama')).toBe(true);
    expect(sayiTasiyor('İKİ KAT DAHA FAZLA')).toBe(true);
    expect(sayiTasiyor('Yüzde otuz daha iyi')).toBe(true);
  });

  it('"bir kat daha" deyimi oran sayılmıyor; başka sayı önündeyse sayılıyor', () => {
    expect(sayiTasiyor('Görseli bir kat daha sade tut')).toBe(false);
    expect(sayiTasiyor('Bir kat daha sade')).toBe(false);
    expect(sayiTasiyor('iki kat daha sade')).toBe(true);
    expect(sayiTasiyor('yüz bir kat daha')).toBe(true);
  });
});
