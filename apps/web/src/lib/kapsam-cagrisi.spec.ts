import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_RANGE, RANGE_PRESETS, enEskiGunGerekli, resolveRange } from './date-range';

/**
 * ═══ EN PAHALI İSTEK YALNIZCA GEREKİYORSA ATILIYOR ═══
 *
 * `/metrics/coverage` metrik tablosundaki TARİH SINIRI OLMAYAN tek sorgu:
 * `MIN(date)`/`MAX(date)` bütün partition'ları tarıyor. Üretimde ölçüldü —
 * 17.364 ms. Diğer beş metrik isteği toplam 12,5 saniyeydi ve onlar
 * PARALEL; bu ise `await` ile hepsinden ÖNCE bekliyordu.
 *
 * Değeri okuyan tek şey "Tüm zamanlar" ön ayarı. Yani ajans genel
 * bakışındaki beklemenin en büyük parçası, o yüklemede HİÇ KULLANILMAYAN
 * bir sayı içindi.
 *
 * İKİ YÖNLÜ RİSK: çağrıyı fazla kısmak "Tüm zamanlar"ı sessizce 90 güne
 * düşürür (kullanıcı tüm veriye baktığını sanır), fazla gevşetmek 17
 * saniyeyi geri getirir. İkisi de test ediliyor.
 */

describe('enEskiGunGerekli', () => {
  it('KRİTİK: "Tüm zamanlar" İÇİN GEREKLİ', () => {
    expect(enEskiGunGerekli('tum_zamanlar')).toBe(true);
  });

  it('KRİTİK: diğer ön ayarların HİÇBİRİ istemiyor', () => {
    /*
     * Liste tek tek yazılmıyor, ÖN AYARLARDAN türetiliyor: elle yazılan bir
     * liste yeni bir ön ayar eklendiğinde sessizce eksik kalırdı.
     */
    const isteyenler = RANGE_PRESETS.filter((p) => enEskiGunGerekli(p.key)).map((p) => p.key);
    expect(isteyenler).toEqual(['tum_zamanlar']);
  });

  it('özel aralık istemiyor — tarihler zaten URL’de', () => {
    /*
     * BU, VARSAYILANIN DAVRANIŞIDIR. `'ozel'` ön ayar listesinde yok ve
     * varsayılana düşüyor; ayrı bir dal yazmak ölü kod olurdu (denendi,
     * mutasyonla silindi, hiçbir test düşmedi). Aşağıdaki "varsayılan
     * istemiyor" testi bu satırı ayakta tutan şey — ikisi ayrılırsa özel
     * aralık boşuna 17 saniyelik sorguyu tetikler.
     */
    expect(enEskiGunGerekli('ozel')).toBe(false);
    expect(RANGE_PRESETS.some((p) => p.key === 'ozel')).toBe(false);
  });

  it('KRİTİK: BİLİNMEYEN anahtar `resolveRange` ile AYNI ön ayara düşüyor', () => {
    /*
     * `resolveRange` bilinmeyen anahtarı varsayılana düşürüyor. İki kural
     * ayrışsaydı `?aralik=saçma` yazan biri için sayfa kapsamı çekmeden
     * "Tüm zamanlar" hesaplamaya çalışır ya da boşuna 17 saniye beklerdi.
     */
    expect(enEskiGunGerekli('sacma')).toBe(enEskiGunGerekli(DEFAULT_RANGE));
    expect(enEskiGunGerekli(undefined)).toBe(enEskiGunGerekli(DEFAULT_RANGE));
    expect(resolveRange({ aralik: 'sacma' }).key).toBe(DEFAULT_RANGE);
  });

  it('KRİTİK: varsayılan aralık İSTEMİYOR — yoksa hiçbir şey kazanılmazdı', () => {
    // Varsayılan `30g` de isteseydi çağrı her yüklemede yine atılırdı ve
    // bütün değişiklik anlamsız olurdu.
    expect(enEskiGunGerekli(DEFAULT_RANGE)).toBe(false);
  });
});

describe('KRİTİK: "Tüm zamanlar" HÂLÂ en eski günü kullanıyor', () => {
  it('değer verildiğinde pencere ORADAN başlıyor', () => {
    // Çağrıyı koşullu yapmak, değeri kullanmayı BIRAKMAK değil; bu test
    // ikisinin karışmasını engelliyor.
    const r = resolveRange({ aralik: 'tum_zamanlar', enEskiGun: '2026-02-03' });
    expect(r.from).toBe('2026-02-03');
  });
});

describe('KRİTİK: sayfalar çağrıyı KOŞULA bağlıyor', () => {
  /*
   * Saf fonksiyonun doğru olması yetmiyor — sayfaların onu KULLANDIĞI da
   * kilitlenmeli. Bu depoda boşa düşen mutasyonlardan biri tam olarak
   * buydu: fonksiyon test edilmiş ama çağrıldığı test edilmemişti.
   */
  const oku = (yol: string) =>
    readFileSync(resolve(__dirname, '..', 'app', '(dashboard)', yol), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
  const DASHBOARD = oku('dashboard/page.tsx');
  const RAPORLAR = oku('raporlar/page.tsx');

  it('BOŞA DÜŞME BEKÇİSİ: iki sayfa da okundu ve çağrıyı taşıyor', () => {
    expect(DASHBOARD).toContain('/metrics/coverage?');
    expect(RAPORLAR).toContain('/metrics/coverage?');
  });

  it('genel bakış: coverage KOŞULLU', () => {
    expect(DASHBOARD).toContain('enEskiGunGerekli(first(params.aralik))');
    // Koşulsuz `await serverApiFetch(.../coverage` deseni geri gelmemeli.
    expect(DASHBOARD).not.toContain('const kapsam = await serverApiFetch');
  });

  it('raporlar: coverage KOŞULLU — ve kendi varsayılanıyla', () => {
    /*
     * Rapor ekranının varsayılanı `gecen_ay`, panelinki `30g`. Koşula
     * panelin varsayılanı yazılsaydı rapor ekranı bilinmeyen anahtarda
     * yanlış dala girerdi.
     */
    expect(RAPORLAR).toContain("enEskiGunGerekli(first(params.aralik) ?? 'gecen_ay')");
    expect(RAPORLAR).not.toContain('const kapsam = await serverApiFetch');
  });
});

describe('KRİTİK: seçici değeri TIKLANDIĞINDA arıyor', () => {
  /*
   * Sayfa değeri artık getirmediği için panelde "Tüm zamanlar"a basan
   * kullanıcı 90 günlük bir TASLAK görürdü, "Uygula"ya basardı ve sunucu
   * BAŞKA bir pencere hesaplardı: ekranda yazan dönem ile bakılan dönem
   * farklı olurdu ve fark hiçbir yerde görünmezdi.
   */
  const SECICI = readFileSync(
    resolve(__dirname, '..', 'components', 'tarih-secici.tsx'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('BOŞA DÜŞME BEKÇİSİ: kaynak okundu', () => {
    expect(SECICI).toContain('function onAyarSec(');
    expect(SECICI.length).toBeGreaterThan(2000);
  });

  it('gerektiğinde ve YALNIZCA elde yoksa çağırıyor', () => {
    const bas = SECICI.indexOf('function onAyarSec(');
    const dilim = SECICI.slice(bas, SECICI.indexOf('\n  }', bas));
    expect(dilim.length, 'gövde bulunamadı — tarama boşa düştü').toBeGreaterThan(200);
    expect(dilim).toContain('enEskiGunGerekli(key) && bilinenEnEski === null');
    expect(dilim).toContain('enEskiGunuAra()');
  });

  it('KRİTİK: arama ve hata EKRANDA — sessiz düşüş yok', () => {
    expect(SECICI).toContain('En eski veri günü aranıyor…');
    expect(SECICI).toContain('setKapsamHatasi(');
    // `.catch(() => null)` ile sessizce 90 güne düşmek, "arıyorum",
    // "bulamadım" ve "veri yok" hâllerini aynı ekrana çevirirdi.
    expect(SECICI).not.toContain('.catch(() => null)');
  });
});
