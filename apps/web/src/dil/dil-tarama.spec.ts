import { describe, expect, it } from 'vitest';
import { ISTISNALAR, KALICI_ISTISNALAR } from './dil-tarama.istisnalar';
import { TARANAN, metinSay, mevcutSayilar } from './dil-tarama';

/**
 * ═══ İKİ DİLLİ PANEL BEKÇİSİ: ELLE YAZILMIŞ METİN (docs/i18n/MIMARI.md §5) ═══
 *
 * Sözlüğe girmemiş metin İngilizce ekranda Türkçe görünür ve bunu yalnız
 * İngilizce kullanan müşteri fark eder. Sayılar dosya dosya
 * `dil-tarama.istisnalar.ts`te; liste YALNIZ KÜÇÜLÜR.
 */
describe('iki dil: elle yazılmış ekran metni yalnız azalır', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama dosya okudu ve sayaçlar gerçekten sayıyor', () => {
    expect(TARANAN.length).toBeGreaterThan(250);
    expect(
      metinSay(`const a = 'Kaydı sil'; <p>Kaydet</p> <b title="Göster">{x}</b> <span>Şimdi</span>`),
    ).toEqual({ turkce: 3, jsx: 2 });
    // Yorum, tip parametresi, karşılaştırma ve adres SAYILMIYOR.
    expect(
      metinSay(`/* Kaydı sil */ // Şimdi\nconst u: Promise<A> | Map<B>; if (a > b && c < d) {} const x = 'https://a.com/b';`),
    ).toEqual({ turkce: 0, jsx: 0 });
  });

  it('kalıcı istisna geçici listede İKİNCİ KEZ yok', () => {
    for (const d of Object.keys(KALICI_ISTISNALAR)) expect(ISTISNALAR[d], d).toBeUndefined();
  });

  it('KRİTİK: hiçbir dosyada listedekinden FAZLA metin yok, sözlüğe geçen dosya listede kalmıyor', () => {
    const mevcut = mevcutSayilar();
    const hatalar: string[] = [];
    const adlar = new Set([...Object.keys(mevcut), ...Object.keys(ISTISNALAR), ...Object.keys(KALICI_ISTISNALAR)]);
    for (const d of adlar) {
      for (const tur of ['turkce', 'jsx'] as const) {
        const simdi = mevcut[d]?.[tur] ?? 0;
        const izin = ISTISNALAR[d]?.[tur] ?? KALICI_ISTISNALAR[d]?.[tur] ?? 0;
        if (simdi > izin) {
          hatalar.push(`YENİ ELLE METİN ${d} · ${tur}: ${simdi} (izin ${izin}) — metni dil/sozlukler/ altına taşı`);
        } else if (simdi < izin) {
          hatalar.push(`LİSTEYİ KÜÇÜLT ${d} · ${tur}: ${izin} → ${simdi} (dil-tarama.istisnalar.ts)`);
        }
      }
    }
    expect(hatalar).toEqual([]);
  });
});
