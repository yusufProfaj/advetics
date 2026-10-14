import { describe, expect, it } from 'vitest';

import {
  AJANS,
  DENEME_GUN,
  PAKETLER,
  YILLIK_INDIRIM_YUZDE,
  ajansFiyatiSent,
  ajansKademeMetni,
  ajansKirilimi,
  donemFiyatiSent,
  eylemMetni,
  karsilastirmaSatirlari,
  paketBul,
  paketTalepAdresi,
  sinirMetni,
  usd,
} from './fiyat';

/**
 * ═══ FİYAT HESABI BEKÇİSİ ═══
 *
 * Fiyat bir söz: sitede yanlış yazılan bir rakam müşteriye verilmiş yanlış
 * bir teklif. Kademe sınırındaki bir birlik kayma (50 mi 51 mi) hata
 * vermiyor, yalnız her ajansa birkaç dolar fazla ya da eksik gösteriyor.
 * Rakamlar kullanıcı kararından (2026-10-14) ELLE yazıldı, formülden
 * türetilmedi: formülün kendisi sınanıyor.
 */
describe('paket fiyatları (kullanıcı kararı)', () => {
  it('Küçük İşletme $49, Şirket $149, Ajans $299 tabandan', () => {
    expect(paketBul('kucuk-isletme').aylikSent).toBe(4_900);
    expect(paketBul('sirket').aylikSent).toBe(14_900);
    expect(paketBul('ajans').aylikSent).toBe(29_900);
    expect(PAKETLER.map((p) => p.kod)).toEqual(['kucuk-isletme', 'sirket', 'ajans']);
  });

  it('yalnız Şirket "en çok seçilen"; deneme yalnız Küçük İşletme ve Şirket, ajans teklif', () => {
    expect(PAKETLER.filter((p) => p.one).map((p) => p.kod)).toEqual(['sirket']);
    expect(PAKETLER.filter((p) => p.eylem === 'deneme').map((p) => p.kod)).toEqual(['kucuk-isletme', 'sirket']);
    expect(eylemMetni(paketBul('sirket'))).toBe('14 gün ücretsiz dene');
    expect(eylemMetni(paketBul('ajans'))).toBe('Teklif al');
    expect(DENEME_GUN).toBe(14);
  });

  it('yıllık %20 indirim, kuruş kaybı yok', () => {
    expect(YILLIK_INDIRIM_YUZDE).toBe(20);
    expect(donemFiyatiSent(4_900, 'yil')).toBe(3_920);
    expect(donemFiyatiSent(14_900, 'yil')).toBe(11_920);
    expect(donemFiyatiSent(29_900, 'yil')).toBe(23_920);
    expect(donemFiyatiSent(4_900, 'ay')).toBe(4_900);
  });
});

describe('KRİTİK: ajans kademesi (10 dahil, 11-50 $19, 51+ $12)', () => {
  it.each([
    [1, 29_900],
    [10, 29_900],
    [11, 29_900 + 1_900],
    [50, 29_900 + 40 * 1_900],
    [51, 29_900 + 40 * 1_900 + 1_200],
    [100, 29_900 + 40 * 1_900 + 50 * 1_200],
  ])('%i workspace → aylık %i sent', (ws, beklenen) => {
    expect(ajansFiyatiSent(ws)).toBe(beklenen);
  });

  it('elle hesaplanmış dolar karşılıkları: 50 → $1,059 · 51 → $1,071 · 100 → $1,659', () => {
    expect(usd(ajansFiyatiSent(50))).toBe('$1,059');
    expect(usd(ajansFiyatiSent(51))).toBe('$1,071');
    expect(usd(ajansFiyatiSent(100))).toBe('$1,659');
  });

  it('yıllıkta her satır indirimli ve kırılım toplamı tutuyor', () => {
    const k = ajansKirilimi(51, 'yil');
    expect(k.tabanSent).toBe(23_920);
    expect(k.kademeBir).toEqual({ adet: 40, birimSent: 1_520, tutarSent: 60_800 });
    expect(k.kademeIki).toEqual({ adet: 1, birimSent: 960, tutarSent: 960 });
    expect(k.toplamSent).toBe(23_920 + 60_800 + 960);
    expect(usd(k.toplamSent)).toBe('$856.80');
    for (const ws of [1, 10, 11, 37, 50, 51, 77, 100]) {
      for (const d of ['ay', 'yil'] as const) {
        const x = ajansKirilimi(ws, d);
        expect(x.tabanSent + x.kademeBir.tutarSent + x.kademeIki.tutarSent, `${ws} ${d}`).toBe(x.toplamSent);
      }
    }
  });

  it('kademe metni sabitlerden: "Ek workspace (11-50: $19, 51+: $12)"', () => {
    expect(ajansKademeMetni('ay')).toBe('Ek workspace (11-50: $19, 51+: $12)');
    expect(ajansKademeMetni('yil')).toBe('Ek workspace (11-50: $15.20, 51+: $9.60)');
    expect(AJANS.enCokWorkspace).toBeGreaterThan(AJANS.kademeUst);
  });
});

describe('ekranda görünen metin', () => {
  it('dolar biçimi: tam dolar kuruşsuz, kesir iki basamak', () => {
    expect(usd(4_900)).toBe('$49');
    expect(usd(3_920)).toBe('$39.20');
    expect(usd(960)).toBe('$9.60');
    expect(usd(0)).toBe('$0');
  });

  it('sınır satırı paketin kendi sınırından', () => {
    expect(sinirMetni(paketBul('kucuk-isletme'))).toBe('1 workspace · 2 reklam hesabı · 2 kullanıcı');
    expect(sinirMetni(paketBul('sirket'))).toBe('5 workspace · 10 reklam hesabı · 10 kullanıcı');
    expect(sinirMetni(paketBul('ajans'))).toBe('Taban 10 workspace · sınırsız kullanıcı');
  });

  it('karşılaştırma tablosu: her satır üç paket, sınırlar paketle aynı', () => {
    const satirlar = karsilastirmaSatirlari();
    for (const s of satirlar) expect(s.degerler, s.ad).toHaveLength(PAKETLER.length);
    expect(satirlar[0]).toEqual({ ad: 'Workspace', degerler: ['1', '5', '10 + ek'] });
    expect(satirlar[1]).toEqual({ ad: 'Reklam hesabı', degerler: ['2', '10', 'Sınırsız'] });
  });

  it('KRİTİK: talep e-postasının konusunda paketin adı, ajansta workspace sayısı gövdede', () => {
    const deneme = decodeURIComponent(paketTalepAdresi(paketBul('sirket'), { donem: 'yil' }));
    expect(deneme).toMatch(/^mailto:hello@profaj\.com\?subject=Advetics Şirket paketi 14 günlük ücretsiz deneme&body=/);
    expect(deneme).toContain('Ödeme dönemi: Yıllık');
    const teklif = decodeURIComponent(paketTalepAdresi(paketBul('ajans'), { donem: 'ay', workspace: 37 }));
    expect(teklif).toContain('subject=Advetics Ajans paketi teklif talebi');
    expect(teklif).toContain('workspace (müşteri) sayısı: 37');
    // Ham adres kodlanmış: Türkçe harf ve satır sonu çıplak gitmiyor.
    expect(paketTalepAdresi(paketBul('sirket'), { donem: 'ay' })).not.toMatch(/[ŞşİıĞğ\n ]/);
  });
});
