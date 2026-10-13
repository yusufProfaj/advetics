import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * ERİŞİM TURU (K4) — panelin "işletme adresinin çevresi" seçeneği ve Marka
 * Merkezi'nin harita konumu alanı. Bileşen render edilmiyor (vitest.config
 * bunu bilinçli reddediyor); iddialar YORUMSUZ kaynağa çapalı.
 */
const yorumsuz = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const KIME = yorumsuz(readFileSync(join(__dirname, 'adim-kime.tsx'), 'utf8'));
const FORM = yorumsuz(readFileSync(join(__dirname, '..', 'tenancy', 'musteri-bilgi-formu.tsx'), 'utf8'));

describe('Kime adımı — adres çevresi (ERİŞİM)', () => {
  it('KRİTİK: adres çevresi İLK seçenek ve yalnız erişimde; il/ilçe seçimi duruyor', () => {
    const blok = KIME.slice(KIME.indexOf('{erisim && ('), KIME.indexOf('İl ya da ilçe seç'));
    expect(blok.length, 'erişim bloğu bulunamadı').toBeGreaterThan(100);
    expect(blok).toContain('İşletme adresinin çevresi');
    expect(KIME).toContain("const erisim = b.a.amac?.deger === 'ERISIM';");
  });
  it('KRİTİK: seçenek konumu TEK ÜRETİCİDEN kuruyor ve listeyi DEĞİŞTİRİYOR (birleşim yok)', () => {
    expect(KIME).toContain('konumlariYaz([isletmeAdresiKonumu(adresKonumu, ERISIM_YARICAP.varsayilan, b.h.iletisim.adres ?? null)])');
  });
  it('konum yoksa seçenek kapalı ve sebebi yazıyor (adres metninden nokta tahmini yok)', () => {
    expect(KIME).toContain('disabled={!adresKonumu}');
    expect(KIME).toContain("Marka Merkezi'nde harita konumu yok");
  });
  it('il/ilçe listesi gizlenirken DOM’dan çıkmıyor (geçiş)', () => {
    expect(KIME).toContain('<div className={s.gizlenir} data-acik={!cevre}>');
  });
  it('KRİTİK: yarıçap GİRİŞ ANINDA doğrulanıyor; aralık dışı değer yazılmıyor', () => {
    const g = KIME.slice(KIME.indexOf('function YaricapGirdisi('), KIME.indexOf('function YasGirdisi('));
    expect(g).toContain('v >= ERISIM_YARICAP.enAz && v <= ERISIM_YARICAP.enCok');
    expect(g.indexOf('if (v !== deger) degisti(v);')).toBeGreaterThan(g.indexOf('v >= ERISIM_YARICAP.enAz'));
    expect(g).toContain('setHata(');
  });
});

describe('Marka Merkezi — harita konumu alanı', () => {
  it('alan TEK LİSTEDE ve giriş anında (alanı bırakınca) doğrulanıyor', () => {
    expect(FORM).toContain("{ anahtar: 'addressCoordinates', etiket: 'Adresin harita konumu (enlem, boylam)', tur: 'konum' }");
    expect(FORM).toContain("onBlur={(e) => setHata(koordinatCoz(e.target.value) === 'gecersiz' ? KOORDINAT_BICIM_MESAJI : null)}");
  });
  it('KRİTİK: bozuk konum sunucuya GİTMEDEN durduruluyor', () => {
    const k = FORM.slice(FORM.indexOf('async function kaydet('));
    expect(k.indexOf("koordinatCoz(String(deger.addressCoordinates ?? '')) === 'gecersiz'")).toBeGreaterThan(-1);
    expect(k.indexOf("koordinatCoz(String(deger.addressCoordinates ?? '')) === 'gecersiz'")).toBeLessThan(k.indexOf('await apiFetch('));
  });
});
