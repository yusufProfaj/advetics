import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * DELTA ROZETİ — TEK TANIM.
 *
 * Aynı karar üç yerde birden veriliyordu: KPI kartı, ikincil şerit ve kırılım
 * tablosu. `inverse` kuralı (CPA artışı KÖTÜ) bir kopyada güncellenmezse CPA
 * artışı YEŞİL görünür — ve yeşil bir sayı kimseyi durdurmaz.
 */
const ROZET = readFileSync(join(__dirname, 'delta-rozeti.tsx'), 'utf8');
const KART = readFileSync(join(__dirname, 'metric-card.tsx'), 'utf8');
const TABLO = readFileSync(join(__dirname, 'breakdown-table.tsx'), 'utf8');

describe('delta rozeti', () => {
  it('KRİTİK: null değişim HİÇ basılmıyor', () => {
    // "%0" yazmak "değişim yok" demek; anlamı ise "karşılaştırma yapılamadı".
    expect(ROZET).toContain('if (change === null || change === undefined) return null;');
  });

  it('KRİTİK: `inverse` kuralı BURADA — çağıranda değil', () => {
    expect(ROZET).toContain('const good = inverse ? change < 0 : change > 0;');
  });

  it('KPI kartı KENDİ kopyasını tutmuyor', () => {
    expect(KART).toContain('<DeltaRozeti');
    expect(KART).not.toContain('inverse ? change < 0 : change > 0');
  });

  it('kırılım tablosu da PAYLAŞILAN rozeti kullanıyor', () => {
    expect(TABLO).toContain('<DeltaRozeti');
    expect(TABLO).not.toContain('inverse ? change < 0 : change > 0');
  });

  it('KRİTİK: CPA sütununda `inverse` VERİLİYOR — artış kötü', () => {
    /*
     * İDDİA `<Delta …/>` ELEMANINA ÇAPALI. İlk yazımda CPA hücresinin
     * çevresindeki 400 karaktere bakıyordum ve o dilim "CPA'da ARTIŞ KÖTÜ —
     * `inverse`" YORUMUNU da içeriyordu: propu silmek testi düşürmüyordu.
     * Bu oturumda dördüncü kez aynı tuzak.
     */
    const i = TABLO.indexOf('once={r.previous?.cpa}');
    expect(i, 'CPA deltası bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const eleman = TABLO.slice(TABLO.lastIndexOf('<Delta', i), TABLO.indexOf('/>', i) + 2);
    expect(eleman).toContain('inverse');
  });

  it('KRİTİK: harcama sütununda `inverse` YOK — artış kötü değil', () => {
    // Harcama artışı kötü değil; `inverse` verilseydi büyüyen bir kampanya
    // kırmızı görünürdü.
    const i = TABLO.indexOf('once={mikroSayi(r.previous?.spendMicros)}');
    expect(i, 'harcama deltası bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const dilim = TABLO.slice(i, i + 60);
    expect(dilim).not.toContain('inverse');
  });

  it('delta YENİ SÜTUN değil, hücrenin ALTINDA', () => {
    // Tablo sabit genişlikte; altı ek sütun onu mobilde tamamen yatay
    // kaydırmaya mahkûm ederdi.
    expect(TABLO).toContain('DELTA HÜCRENİN ALTINDA, YENİ SÜTUN DEĞİL');
  });

  it('cari değer null ise delta basılmıyor', () => {
    // "Önceki dönemde CPA vardı, şimdi hesaplanamıyor" bir düşüş değil.
    expect(TABLO).toContain('if (simdi === null || simdi === undefined) return null;');
  });
});
