import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ MCC GÖRÜNÜMÜ — "TÜM MÜŞTERİLER" TABLOSU ═══
 *
 * Bileşenler burada render edilmiyor (DOM kurulumu yok), bu yüzden iddialar
 * kaynağa çapalı — ama her biri tek bir karara ve o kararın koddaki tek
 * satırına.
 */
const TABLO = readFileSync(join(__dirname, 'musteri-tablosu.tsx'), 'utf8');
const SAYFA = readFileSync(
  join(__dirname, '..', 'app', '(dashboard)', 'dashboard', 'page.tsx'),
  'utf8',
);

/**
 * Yorum satırlarını atar.
 *
 * İki dosya da bu kuralları ANLATAN yorumlar taşıyor ve `toContain` yorumla
 * kodu ayırt etmiyor: kararı silmek, iki satır yukarıdaki açıklamaya takılıp
 * testi geçirirdi. Bu oturumda başka dosyalarda dört kez oldu.
 */
function kod(src: string): string {
  return src
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

const TABLO_KOD = kod(TABLO);
const SAYFA_KOD = kod(SAYFA);

describe('tarama gerçekten bir şey yakaladı', () => {
  it('dilimler boş değil', () => {
    // Dilim boşalırsa aşağıdaki "içeriyor" iddiaları BOŞ METİNDE hep yanlış,
    // "içermiyor" iddiaları ise hep DOĞRU olurdu — ikincisi sessiz.
    expect(TABLO_KOD.length).toBeGreaterThan(1500);
    expect(SAYFA_KOD).toContain('MusteriTablosu');
  });
});

describe('MCC koşulu', () => {
  it('KRİTİK: tablo yalnızca "Tüm müşteriler" seçiliyken ve BİRDEN ÇOK müşteri varsa', () => {
    /*
     * Tek müşterisi olan kullanıcıda da `activeClientId` null olabiliyor ve
     * orada tek satırlık bir müşteri tablosu, kampanya listesinden daha az
     * şey söylerdi.
     */
    expect(SAYFA_KOD).toContain(
      'const mcc = session.activeClientId === null && session.availableClients.length > 1;',
    );
  });

  it('KRİTİK: MCC modunda kampanya sorgusu KOŞULMUYOR', () => {
    /*
     * Gösterilmeyecek bir sorguyu koşmak, ekranın en ağır sorgusunun boşa
     * gitmesi demek. `breakdown` çağrısı `mcc` koşuluna bağlı.
     */
    const i = SAYFA_KOD.indexOf('/metrics/breakdown');
    expect(i).toBeGreaterThan(-1);
    // Koşul ÇAĞRIDAN GERİYE aranıyor: dosyanın başka bir yerindeki `mcc`
    // geçişine takılan bir iddia hiçbir zaman düşmez.
    expect(SAYFA_KOD.slice(0, i)).toMatch(/mcc\s*\n?\s*\? Promise\.resolve\(null\)/);
  });

  it('müşteri sorgusu da yalnızca MCC modunda koşuyor', () => {
    const i = SAYFA_KOD.indexOf('/metrics/clients');
    expect(i).toBeGreaterThan(-1);
    expect(SAYFA_KOD.slice(0, i)).toMatch(/mcc\s*\n?\s*\?\s*serverApiFetch/);
  });

  it('platform süzgeci müşteri sorgusuna da gidiyor', () => {
    // Üst kartlar "toplam" gösterirken tablonun tek platformu listelemesi,
    // aynı ekranda iki farklı gerçek demek olurdu.
    expect(SAYFA_KOD).toContain('/metrics/clients?${base}');
  });
});

describe('satıra tıklayınca workspace değişiyor', () => {
  it('KRİTİK: geçiş ucuna gidiyor', () => {
    expect(TABLO_KOD).toContain("'/auth/switch-client'");
    expect(TABLO_KOD).toContain('onClick={() => void gec(r.clientId)}');
  });

  it('KRİTİK: `?musteri=` şeridi TEMİZLENİYOR', () => {
    /*
     * Sayfalar aktif müşteriyi `params.musteri ?? session.activeClientId`
     * sırasıyla çözüyor, yani URL parametresi COOKIE'Yİ EZİYOR. Temizlenmezse
     * üst bar yeni müşteriyi yazarken gövde eskisinin verisini gösterir —
     * sızıntıdan ayırt edilemeyecek kadar kötü bir hâl.
     */
    expect(TABLO_KOD).toContain("router.replace('/dashboard')");
  });

  it('KRİTİK: geçiş hatası YUTULMUYOR', () => {
    /*
     * Sessizce başarısız olursa kullanıcı tıklıyor, hiçbir şey olmuyor ve
     * sebebi hiçbir yerde yazmıyor.
     *
     * İDDİA CATCH BLOĞUNA ÇAPALI. İlk hâli yalnızca `setHata(` arıyordu ve o
     * ad fonksiyonun başındaki `setHata(null)` ile durum tanımında da geçiyor:
     * catch gövdesini tamamen silmek testi DÜŞÜRMÜYORDU.
     */
    const i = TABLO_KOD.indexOf('} catch (e) {');
    expect(i, 'gec() içinde catch bloğu yok — tarama boşa düştü').toBeGreaterThan(-1);
    const yakala = TABLO_KOD.slice(i, TABLO_KOD.indexOf('\n    }', i));
    expect(yakala).toContain('setHata(');
    expect(yakala).toContain('e.message');
    expect(TABLO_KOD).toContain('role="alert"');
  });
});

describe('sayılar yalan söylemiyor', () => {
  it('KRİTİK: karışık para biriminde TUTAR değil UYARI yazılıyor', () => {
    /*
     * 1 USD + 1 TRY = 2 ne? Kur çevrimi yok; toplamı basmak ekranda anlamı
     * olmayan bir sayı göstermek olurdu.
     */
    const i = TABLO_KOD.indexOf("{r.currency === null ? (");
    expect(i).toBeGreaterThan(-1);
    expect(TABLO_KOD.slice(i, i + 300)).toContain('karışık');
  });

  it('TOPLAM satırı karışık para biriminde sayı basmıyor', () => {
    expect(TABLO_KOD).toContain(
      "new Set(rows.flatMap((r) => r.currencies)).size > 1 ? (",
    );
  });

  it('KRİTİK: CPA null iken "0" değil "—" yazılıyor', () => {
    /*
     * `null` "hesaplanamaz" demek, sıfır demek DEĞİL. "0,00 ₺ CPA" kampanyanın
     * bedava dönüşüm getirdiğini söyler.
     */
    expect(TABLO_KOD).toContain("{r.cpa === null || r.currency === null\n                      ? '—'");
  });

  it('micros çevrimi ORTAK fonksiyondan — üçüncü bir kopya yok', () => {
    /*
     * `microsOf` panelde ve rapor belgesinde ayrı ayrı yazılmıştı; üçüncüsünü
     * eklemek yuvarlama kuralı değiştiğinde aynı sayının iki ekranda farklı
     * görünmesi demekti.
     */
    expect(TABLO_KOD).toContain('microsOf(r.cpa)');
    expect(TABLO_KOD).not.toContain('* 1_000_000');
  });

  it('sessiz kesme yok: kaç müşteri ve kaçının harcaması olduğu yazılı', () => {
    expect(TABLO_KOD).toContain('tanesinin bu dönemde harcaması var');
  });

  it('KRİTİK: boş satırın SEBEBİ yazılı', () => {
    /*
     * "Hesap atanmamış" ile "hesabı var ama harcamamış" aynı boş satır olarak
     * görünüyordu ve ikisinin yapılacak işi farklı.
     */
    expect(TABLO_KOD).toContain('izlemede hesap yok');
    expect(TABLO_KOD).toContain('hesap izlemede`');
  });
});
