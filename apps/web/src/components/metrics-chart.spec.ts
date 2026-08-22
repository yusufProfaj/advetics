import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * GRAFİKTE ÖNCEKİ DÖNEM.
 *
 * Grafik satır içi SVG ve sunucuda render ediliyor — DOM'u sınayacak bir
 * kurulum yok. O yüzden iddialar KAYNAĞA çapalı, ama her biri tek bir karara
 * ve o kararın koddaki tek satırına.
 */
const SRC = readFileSync(join(__dirname, 'metrics-chart.tsx'), 'utf8');

/** `--` yorum satırlarını değil, JSX/TS yorumlarını atar. */
function kodSatirlari(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

describe('zaman serisi karşılaştırması', () => {
  const kod = kodSatirlari(SRC);

  it('KRİTİK: önceki dönem GÜN SIRASINA göre hizalanıyor, takvime göre değil', () => {
    /*
     * Karşılaştırma penceresinin tarihleri farklı. `xOf(date)` ile çizmek onu
     * grafiğin tamamen dışına atardı — ve dışarı taşan bir çizgi hiçbir hata
     * vermiyor, sadece görünmüyor.
     */
    expect(kod).toContain('const xOfGun = (gun: number): number =>');
    const i = kod.indexOf('oncekiNoktalar');
    expect(i, 'önceki nokta hesabı bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = kod.slice(i, kod.indexOf('const maxSpend', i));
    expect(dilim).toContain('oncekiBasi');
    expect(dilim).not.toContain('xOf(');
  });

  it('KRİTİK: pencereden TAŞAN günler çizilmiyor', () => {
    // Pencere uzunlukları eşit olmayabilir (31 vs 30 gün, ya da 364 günlük
    // "geçen yıl"). Taşan nokta, olmayan bir tarihte veri varmış gibi
    // görünürdü.
    expect(kod).toContain('.filter((n) => n.gun >= 0 && n.gun < totalDays)');
  });

  it('KRİTİK: ÖLÇEK iki dönemi birden kapsıyor', () => {
    /*
     * Ayrı ölçek, yarıya düşen bir harcamayı "aynı kalmış" gibi gösterirdi —
     * karşılaştırmanın tam tersi ve tek bakışta fark edilmez.
     */
    const i = kod.indexOf('const maxSpend =');
    expect(i, 'maxSpend bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const satir = kod.slice(i, kod.indexOf('\n', i));
    expect(satir).toContain('oncekiNoktalar');
  });

  it('KRİTİK: efsane `previous === null` ile boş diziyi AYIRIYOR', () => {
    // "Karşılaştırma kapalı" ile "o dönemde veri yok" farklı iki şey.
    expect(kod).toContain('{previous !== null && previous !== undefined && (');
    expect(kod).toContain('Önceki dönem');
  });

  it('önceki dönem çizgisi barlardan ÖNCE çiziliyor — altta kalsın', () => {
    // SVG'de sıra = katman. Üstte olsaydı cari harcamanın barlarını keserdi.
    const cizgi = kod.indexOf('oncekiVar && oncekiNoktalar.length > 1');
    const barlar = kod.indexOf('{points.map((p, i) => {');
    expect(cizgi, 'önceki dönem çizgisi bulunamadı').toBeGreaterThan(-1);
    expect(barlar, 'bar döngüsü bulunamadı').toBeGreaterThan(-1);
    expect(cizgi).toBeLessThan(barlar);
  });

  it('KRİTİK: boş grafik, önceki dönemde veri VARSA bunu söylüyor', () => {
    /*
     * "Hiç reklam koşmamış hesap" ile "önceki dönemde koşup bu dönemde
     * tamamen durmuş hesap" aynı boş kutuya çevriliyordu. İkincisi acil bir
     * durum ve karşılaştırmanın göstermesi gereken şeyin ta kendisi.
     */
    const i = kod.indexOf('if (points.length === 0)');
    expect(i, 'boş durum bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = kod.slice(i, kod.indexOf('const W = 1000', i));
    // İDDİA TANIMIN KENDİSİNE ÇAPALI: yalnızca `oncekindeVardi` adını aramak,
    // onu `= false` yapan bir mutasyonu kaçırıyordu.
    const tanim = dilim.slice(dilim.indexOf('const oncekindeVardi'));
    expect(tanim.slice(0, tanim.indexOf('\n'))).toContain('previous.length > 0');
    expect(dilim).toContain('Kampanyalar durmuş olabilir');
  });

  it('karşılaştırma dönemi aria etiketinde de geçiyor', () => {
    // Kesikli çizgi "önceki dönem" diyor ama HANGİ dönem olduğu yalnızca
    // tarih seçicide yazılı; ekran okuyucuda o bağ hiç kurulamıyordu.
    const i = kod.indexOf('aria-label=');
    expect(i, 'aria etiketi bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = kod.slice(i, i + 500);
    expect(dilim).toContain('Karşılaştırma dönemi');
    expect(dilim).toContain('compareTo');
  });

  it('tek noktalı önceki dönem çizgi olarak çizilmiyor', () => {
    // İki noktası olmayan bir `path` görünmez; koşul bunu açıkça söylüyor.
    expect(kod).toContain('oncekiNoktalar.length > 1');
  });
});
