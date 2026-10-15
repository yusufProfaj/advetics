import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { kabukSozlugu } from '@/dil/sozlukler/kabuk';

/**
 * ═══ REKLAM KEŞFİ: DÜZEN VE DİL KARARLARI ═══
 *
 * Hiçbiri hata üretmiyor: bozulduklarında sayfa çalışmaya devam ediyor,
 * yalnızca okunmaz ya da anlaşılmaz hâle geliyor. O yüzden yazılılar.
 */
const yorumsuz = (yol: string): string =>
  readFileSync(yol, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//'))
    .join('\n');

const SAYFA = yorumsuz(join(__dirname, 'page.tsx'));
const KART = yorumsuz(join(__dirname, '..', '..', '..', '..', 'components', 'ad-card.tsx'));
const ETIKET = yorumsuz(join(__dirname, '..', '..', '..', '..', 'lib', 'reklam-etiketleri.ts'));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SAYFA).toContain('Reklam Galerisi');
    expect(KART).toContain('export function AdCard');
    expect(ETIKET).toContain('export function ctaEtiketi');
  });
});

const MENU = yorumsuz(join(__dirname, '..', '..', '..', '..', 'components', 'suzgec-menusu.tsx'));

describe('süzgeçler', () => {
  it('KRİTİK: hepsi TEK araç çubuğunda ve her boyut ETİKETLİ', () => {
    /*
     * Önce dört ayrı çip satırıydı, sonra tek kutuda dört satır; uzun
     * hesap ve kampanya adları satırları bölüyor ve süzgeçler ilk ekranın
     * yarısını kaplıyordu. Artık her boyut etiketli bir açılır menü:
     * "Tümü" dediğinde neyin tümü olduğu yazıyor.
     */
    for (const e of ['Hesap', 'Durum', 'Kampanya', 'Sırala']) {
      expect(SAYFA, `${e} menüsü etiketsiz`).toContain(`etiket="${e}"`);
    }
    expect(SAYFA.match(/<SuzgecMenusu/g)?.length).toBe(4);
    expect(MENU).toContain('{etiket}:');
  });

  it('KRİTİK: kampanya listesi SESSİZCE kesilmiyor', () => {
    /*
     * Liste bir zaman `slice(0, 6)` ile kırpılıyor ve kalanların VAR
     * OLDUĞU hiçbir yerde yazmıyordu. Menü artık HİÇ kesmiyor (kaydırılıyor)
     * ve arama sonucu kaç tanesinin göründüğünü yazıyor.
     */
    const kampanya = SAYFA.slice(SAYFA.indexOf('etiket="Kampanya"'), SAYFA.indexOf('etiket="Sırala"'));
    expect(kampanya, 'kampanya menüsü bulunamadı').toContain('result.facets.campaigns.map(');
    expect(kampanya).not.toMatch(/campaigns\.slice\(/);
    // Metin sözlükte (D2); menü anahtarı GÖRÜNEN ve TOPLAM sayıyla çağırıyor.
    expect(MENU).toContain('{s.gosteriliyor(gorunen.length, secenekler.length)}');
    expect(kabukSozlugu.tr.suzgec.gosteriliyor(3, 12)).toBe('3 / 12 gösteriliyor');
    expect(kabukSozlugu.en.suzgec.gosteriliyor(3, 12)).toBe('Showing 3 / 12');
    // Boş arama sonucu SEBEBİYLE yazılıyor, boş liste olarak değil.
    expect(MENU).toContain('{s.eslesmeYok(ara)}');
    expect(kabukSozlugu.tr.suzgec.eslesmeYok('x')).toContain('ile eşleşen yok.');
    expect(kabukSozlugu.en.suzgec.eslesmeYok('x')).not.toBe(kabukSozlugu.tr.suzgec.eslesmeYok('x'));
  });

  it('KRİTİK: uzun ad satırı kaplamıyor ama TAM ad duruyor', () => {
    // Kampanya adları 80 karakteri bulabiliyor; kırpmak bilgiyi gizlemek
    // değil, ertelemek. Tam ad `title` ile hem düğmede hem seçenekte.
    expect(MENU).toContain('<b className="min-w-0 truncate" title={deger}>');
    expect(MENU).toContain('title={s.ad}');
  });

  it('seçili seçenek ekran okuyucuya da bildiriliyor', () => {
    // 2026-10-14: seçenekler ortak `MenuOgesi`; seçili öğe `aria-current` orada.
    expect(MENU).toContain('secili={s.aktif}');
    const ortak = yorumsuz(join(__dirname, '..', '..', '..', '..', 'components', 'ui', 'acilir-menu.tsx'));
    expect(ortak).toContain("aria-current={secili ? 'true' : undefined}");
  });

  it('KRİTİK: "Sorunlu" menüye gömülmüyor, görünür bir düğme', () => {
    // Sayısı sıfırdan büyükse dikkat istiyor; bir menünün içinde kaybolurdu.
    const i = SAYFA.indexOf('{result.facets.issueCount > 0 && (');
    expect(i).toBeGreaterThan(-1);
    expect(SAYFA.slice(i, i + 400)).toContain('<Link');
  });

  it('seçili süzgeçler tek tıkla kalkıyor ve hepsi birden temizlenebiliyor', () => {
    expect(SAYFA).toContain('süzgecini kaldır');
    expect(SAYFA).toContain('Tümünü temizle');
  });

  it('menü dışarı tıklayınca ve Esc ile kapanıyor', () => {
    // 2026-10-14: açılır katman ortak `AcilirMenu` (DOM'da kalır, ok tuşları, Esc).
    expect(MENU).toContain('<AcilirMenu');
    const ortak = yorumsuz(join(__dirname, '..', '..', '..', '..', 'components', 'ui', 'acilir-menu.tsx'));
    expect(ortak).toContain("document.addEventListener('mousedown', disari)");
    expect(ortak).toContain("e.key === 'Escape'");
  });
});


describe('süzgeç toplamı', () => {
  it('KRİTİK: dipnot değil, okunur bir blok', () => {
    /*
     * Ekrandaki en önemli sayı bloğu bu (seçilen süzgecin toplam harcaması)
     * ve 12 piksellik gri bir satır olarak duruyordu.
     */
    expect(SAYFA).toContain('function Total(');
    const bas = SAYFA.indexOf('function Total(');
    const govde = SAYFA.slice(bas, SAYFA.indexOf('\nfunction ', bas + 1));
    // 2026-10-14: metrik kutusu ölçüsü (Montserrat, hizalı rakam); etiket BÜYÜK HARF DEĞİL.
    expect(govde).toContain('font-baslik text-[22px] font-extrabold');
    expect(govde).toContain('tabular-nums');
    expect(govde).not.toMatch(/\buppercase\b/);
  });
});

describe('ekrandaki dil', () => {
  it('KRİTİK: ham platform kodu basılmıyor', () => {
    /*
     * `SHOP_NOW`, `RESPONSIVE_SEARCH_AD`, `DISAPPROVED` ekrana ham
     * basılıyordu. Paneli kullanan kişi reklamcı bile olmayabilir ve bu
     * ürünün kurucu vaadi tam olarak o.
     */
    expect(KART).not.toContain('{ad.creative.creativeType}');
    expect(KART).not.toContain('{ad.creative.ctaType}');
    expect(KART).toContain('kreatifTuruEtiketi(ad.creative.creativeType)');
    expect(KART).toContain('ctaEtiketi(ad.creative.ctaType)');
    expect(KART).toContain('incelemeEtiketi(ad.reviewStatus)');
  });

  it('KRİTİK: bilinmeyen kod UYDURULMUYOR', () => {
    /*
     * Platformlar bu listelere sürekli yeni değer ekliyor. Eşleşmeyen kod
     * okunabilir hâle geliyor ama Türkçeye çevrilmiş gibi gösterilmiyor:
     * yanlış bir çeviri, anlaşılmayan bir koddan daha kötü.
     */
    expect(ETIKET).toContain('function okunabilir(');
    expect(ETIKET).toContain('?? okunabilir(ham)');
  });

  it('KRİTİK: hata kodu ve HTTP durumu EKRANDA değil', () => {
    // `(AD_LIST_FAILED, HTTP 500)` paneli kullanana hiçbir şey anlatmıyor ve
    // ürkütücü görünüyor; sunucunun kendi cümlesi teşhis için yeterli.
    expect(SAYFA).not.toContain('HTTP ${err.status}');
    expect(SAYFA).toContain('? err.message');
  });

  it('ekran metinlerinde uzun tire yok', () => {
    // Panel metin kuralı: uzun tire kullanılmıyor.
    const uiSatirlari = SAYFA.split('\n').filter((l) => l.includes('—'));
    expect(uiSatirlari).toEqual([]);
  });
});
