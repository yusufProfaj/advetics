import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ PANEL YERLEŞİMİ: MOBİL GEZİNME VE GENİŞLİK ═══
 *
 * İki karar da bu dosyada kilitli çünkü ikisi de SESSİZCE bozulabiliyor:
 * kimse hata almıyor, yalnızca panel kullanılamaz ya da tutarsız görünüyor.
 */
const DIZIN = __dirname;
const LAYOUT = readFileSync(join(DIZIN, 'layout.tsx'), 'utf8');
const MOBIL = readFileSync(
  join(DIZIN, '..', '..', 'components', 'mobil-menu.tsx'),
  'utf8',
);
const KENAR = readFileSync(
  join(DIZIN, '..', '..', 'components', 'kenar-cubugu.tsx'),
  'utf8',
);

describe('mobil gezinme', () => {
  it('BOŞA DÜŞME BEKÇİSİ: kaynaklar okundu', () => {
    expect(LAYOUT).toContain('<main');
    expect(MOBIL).toContain('export function MobilMenu');
  });

  it('KRİTİK: panelin mobil gezinmesi VAR', () => {
    /*
     * Kenar çubuğu `hidden lg:flex` idi ve panelde tek bir `lg:hidden`
     * YOKTU: 1024px altında menü tamamen kayboluyor ve yerine hiçbir şey
     * gelmiyordu. Telefonla giren kullanıcı Genel Bakış'ta kilitli kalıyor,
     * başka hiçbir sayfaya geçemiyordu. Hata yok, log yok.
     */
    expect(LAYOUT).toContain('<MobilMenu');
    expect(MOBIL).toContain('lg:hidden');
  });

  it('KRİTİK: menü ve çekmece AYNI içerikten çiziliyor', () => {
    /*
     * Markup iki yere kopyalansaydı biri güncellenmediğinde telefondaki
     * menü masaüstündekinden farklı kalırdı ve bunu yalnızca telefonla
     * giren kullanıcı görürdü.
     */
    expect(KENAR).toContain('export function KenarIcerigi');
    expect(LAYOUT).toContain('<KenarIcerigi veri={kenarVerisi} />');
    expect(MOBIL).toContain('<KenarIcerigi');
  });

  it('KRİTİK: sayfa değişince çekmece kapanıyor', () => {
    /*
     * Next.js gezinmesi bileşeni söküp takmıyor, yani durum kendiliğinden
     * sıfırlanmıyor: bağlantıya basınca yeni sayfa çekmecenin ARKASINDA
     * açılıyor ve kullanıcı hiçbir şey olmadı sanıyor.
     */
    expect(MOBIL).toContain('usePathname()');
    const bas = MOBIL.indexOf('setAcik(false);\n  }, [pathname]);');
    expect(bas, 'pathname etkisi yok').toBeGreaterThan(-1);
  });

  it('çekmece Esc ile kapanıyor ve arka plan kaymıyor', () => {
    expect(MOBIL).toContain("e.key === 'Escape'");
    expect(MOBIL).toContain("document.body.style.overflow = 'hidden'");
    // Kapanışta ESKİ değer geri veriliyor: sabit `''` yazmak, gövdede
    // başka bir sebeple kurulmuş bir kaydırma kilidini kaldırırdı.
    expect(MOBIL).toContain('document.body.style.overflow = onceki');
  });

  it('çekmece erişilebilir: rol, etiket ve odak', () => {
    expect(MOBIL).toContain('aria-modal="true"');
    expect(MOBIL).toContain('aria-label="Menüyü aç"');
    expect(MOBIL).toContain('panelRef.current?.focus()');
  });
});

describe('içerik genişliği', () => {
  it('KRİTİK: genişlik sınırı `main`de, TEK yerde', () => {
    /*
     * Sayfaların yalnızca altısı kendi içinde `max-w-*` koyuyordu: Genel
     * Bakış geniş ekranda kenardan kenara yayılıyor, Şirketler'e geçince
     * içerik aniden ortalanıyordu. Gezinirken panel "oynuyor".
     */
    const bas = LAYOUT.indexOf('<main');
    expect(bas).toBeGreaterThan(-1);
    const etiket = LAYOUT.slice(bas, LAYOUT.indexOf('>', bas));
    expect(etiket).toContain('mx-auto');
    expect(etiket).toMatch(/max-w-/);
  });

  it('KRİTİK: hiçbir sayfa `main`in yatay dolgusunu TEKRARLAMIYOR', () => {
    /*
     * `main` zaten `px-5` veriyor. Sayfa da verirse o sayfa diğerlerinden
     * farklı hizalanıyor ve fark yalnızca iki sayfa arasında gidip gelirken
     * görünüyor. Sayfalar yalnızca DAHA DAR bir okuma genişliği isteyebilir.
     */
    const sayfalar: string[] = [];
    (function gez(d: string): void {
      for (const g of readdirSync(d, { withFileTypes: true })) {
        const y = join(d, g.name);
        if (g.isDirectory()) gez(y);
        else if (g.name === 'page.tsx') sayfalar.push(y);
      }
    })(DIZIN);
    expect(sayfalar.length, 'sayfa bulunamadı — tarama boşa düştü').toBeGreaterThan(10);

    const suclu: string[] = [];
    for (const s of sayfalar) {
      const kod = readFileSync(s, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      // En dış sarmalayıcıda `px-*` + `max-w-*` birlikte geçiyorsa dolgu
      // tekrarlanıyor demek.
      for (const sinif of kod.match(/className="[^"]*max-w-[^"]*"/g) ?? []) {
        if (/\bpx-\d/.test(sinif)) suclu.push(`${s.slice(DIZIN.length + 1)}: ${sinif.slice(0, 70)}`);
      }
    }
    expect(suclu).toEqual([]);
  });
});
