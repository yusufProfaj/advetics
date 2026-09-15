import { describe, expect, it } from 'vitest';
import { aramaAdresi } from './arama-adresi';

/**
 * ═══ ARAMA SONUCUNDAKİ ADRES SATIRI ═══
 *
 * Bu paket bir GÖRÜNÜMÜ değil bir DÖNÜŞÜMÜ sınıyor ve çalıştırarak sınıyor:
 * adres ayrıştırması JSX'in içinde kalsaydı yalnızca kaynak taramasıyla
 * kontrol edilebilirdi ve tarama "yolu üç parçada kesiyor" gibi bir kuralı
 * ölçemez.
 */
describe('alan adı', () => {
  it('KRİTİK: reklamverenin GÖSTERDİĞİ adres kazanıyor', () => {
    /*
     * Google'da görünen adres reklamverenin seçimi ve gerçek hedeften farklı
     * olabiliyor. Hedeften türetmek, reklamda yazmayan bir alan adı
     * göstermek olurdu.
     */
    /*
     * FİKSTÜR HEDEFTEN FARKLI OLMAK ZORUNDA ve bu mutasyonla öğrenildi: ilk
     * hâlde gösterilen adres de hedefin alan adı da "fenbay.com.tr"ye
     * düşüyordu, yani `gosterilen ?? host` yerine düz `host` yazan bir
     * mutasyon testi GEÇİYORDU. İki kaynak ancak DEĞERLERİ ayrıştığında
     * ayırt edilebilir.
     */
    const a = aramaAdresi('https://www.fenbay.com.tr/fenbay/projeler', 'fenbay.com.tr/projeler');
    expect(a.alanAdi).toBe('fenbay.com.tr/projeler');
  });

  it('gösterilen adres yoksa hedeften türüyor ve `www.` düşüyor', () => {
    const a = aramaAdresi('https://www.fenbay.com.tr/fenbay', null);
    expect(a.alanAdi).toBe('fenbay.com.tr');
  });

  it('boş dize gösterilen adres SAYILMIYOR', () => {
    // `''` "adres yok" demek; onu alan adı diye basmak boş bir satır bırakır.
    const a = aramaAdresi('https://fenbay.com.tr/x', '   ');
    expect(a.alanAdi).toBe('fenbay.com.tr');
  });
});

describe('kırıntı yolu', () => {
  it('KRİTİK: tam adres ve yol parçaları oklarla', () => {
    const a = aramaAdresi('https://www.fenbay.com.tr/fenbay/projeler', 'fenbay.com.tr');
    expect(a.kirintiYolu).toBe('https://www.fenbay.com.tr › fenbay › projeler');
  });

  it('KRİTİK: kırıntı yolu `www.`yi KORUYOR — alan adı satırıyla aynı olmasın', () => {
    /*
     * İki satır aynı şeyi yazsaydı ikisini birden göstermenin anlamı
     * kalmazdı: üstte kısa alan adı, altta tam adres.
     */
    const a = aramaAdresi('https://www.fenbay.com.tr/fenbay', 'fenbay.com.tr');
    expect(a.kirintiYolu).toContain('www.fenbay.com.tr');
    expect(a.alanAdi).not.toContain('www.');
  });

  it('yolu olmayan adreste yalnızca taban', () => {
    const a = aramaAdresi('https://fenbay.com.tr/', 'fenbay.com.tr');
    expect(a.kirintiYolu).toBe('https://fenbay.com.tr');
  });

  it('KRİTİK: uzun yol ÜÇ parçada kesiliyor ve kesildiği BELLİ oluyor', () => {
    // Sekiz parçalı bir yol satırı taşırıp önizlemeyi bozuyordu. Sessiz
    // kesme yok: sonda üç nokta duruyor.
    const a = aramaAdresi('https://site.com/a/b/c/d/e', null);
    expect(a.kirintiYolu).toBe('https://site.com › a › b › c › …');
  });

  it('üç parçada TAM BİTEN yolda üç nokta YOK', () => {
    // Ters yön: her yola üç nokta koyan bir kısayol da yukarıdaki testi
    // geçerdi.
    const a = aramaAdresi('https://site.com/a/b/c', null);
    expect(a.kirintiYolu).toBe('https://site.com › a › b › c');
  });

  it('adres kodlaması çözülüyor', () => {
    const a = aramaAdresi('https://site.com/deniz%20manzara', null);
    expect(a.kirintiYolu).toBe('https://site.com › deniz manzara');
  });
});

describe('KRİTİK: çözülemeyen adres UYDURULMUYOR', () => {
  it('geçersiz adres PATLAMIYOR, yol da yazılmıyor', () => {
    /*
     * `new URL()` geçersiz değerde fırlatıyor ve reklamverenin girdiği adres
     * her zaman geçerli değil (şablon parametresi, eksik şema). Kart bir
     * reklam yüzünden tamamen düşmemeli.
     */
    const a = aramaAdresi('{lpurl}?utm_source=google', 'fenbay.com.tr');
    expect(a.alanAdi).toBe('fenbay.com.tr');
    expect(a.kirintiYolu).toBeNull();
  });

  it('hiçbir adres yoksa iki satır da boş', () => {
    // Boş yer tutucu çizmemek için: bileşen `null` alanı hiç basmıyor.
    const a = aramaAdresi(null, null);
    expect(a).toEqual({ alanAdi: null, kirintiYolu: null });
  });
});
