import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

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
const KART = yorumsuz(join(__dirname, '..', '..', '..', 'components', 'ad-card.tsx'));
const ETIKET = yorumsuz(join(__dirname, '..', '..', '..', 'lib', 'reklam-etiketleri.ts'));

describe('tarama boşa düşmüyor', () => {
  it('kaynaklar okundu', () => {
    expect(SAYFA).toContain('Reklam Keşfi');
    expect(KART).toContain('export function AdCard');
    expect(ETIKET).toContain('export function ctaEtiketi');
  });
});

describe('süzgeçler', () => {
  it('KRİTİK: hepsi TEK kapta ve her boyut ETİKETLİ', () => {
    /*
     * Hesap, durum, kampanya ve sıralama dört ayrı satırdı; aralarında
     * çerçeve yoktu ve hepsi aynı yuvarlak çipe benziyordu. Kullanıcı hangi
     * satırın ne süzdüğünü ancak deneyerek öğreniyordu, üstelik dördü
     * birlikte ilk ekranın tamamını kaplıyordu.
     */
    expect(SAYFA).toContain('function SuzgecSatiri(');
    for (const e of ['Hesap', 'Durum', 'Kampanya', 'Sırala']) {
      expect(SAYFA, `${e} satırı etiketsiz`).toContain(`etiket="${e}"`);
    }
  });

  it('KRİTİK: kampanya listesi SESSİZCE kesilmiyor', () => {
    /*
     * Liste `slice(0, 6)` ile kırpılıyor ve kalanların VAR OLDUĞU hiçbir
     * yerde yazmıyordu: elli kampanyalı bir hesapta kullanıcı kırk dördünü
     * hiç göremiyor, süzgecin eksik olduğunu bilmiyordu. Bu depoda sessiz
     * kesme adı konmuş bir hata türü.
     */
    // Gizlenen sayı HESAPLANIYOR, sabit bir cümle değil.
    expect(SAYFA).toContain('const kalan = result.facets.campaigns.length - gosterilen.length;');

    /*
     * İDDİA KOŞULA ÇAPALI, DİZGENİN VARLIĞINA DEĞİL — ve bu mutasyonla
     * kazanıldı. Önce yalnızca "kampanya daha" metnini arıyordu; koşulu
     * `{false && (` yaptığımda test GEÇTİ, çünkü metin kaynakta duruyordu.
     * Çip görünmüyor ama tarama görüyordu.
     */
    const kosul = SAYFA.indexOf('{kalan > 0 && (');
    expect(kosul, 'gizlenen sayıyı gösteren koşul yok').toBeGreaterThan(-1);
    /*
     * DİLİM ÇİPİN KAPANIŞ ETİKETİNE KADAR. `indexOf(')}')` kullanmak
     * erken kapanıyordu: `linkWith({ ... })}` ifadesi aynı ikiliyi taşıyor
     * ve dilim çipin metnine varmadan bitiyordu.
     */
    const dilim = SAYFA.slice(kosul, SAYFA.indexOf('</FilterChip>', kosul));
    expect(dilim).toContain('kampanya daha');
    expect(dilim).toContain("tumkampanya: '1'");
  });

  it('KRİTİK: uzun çip adı satırı kaplamıyor ama TAM ad duruyor', () => {
    // Kampanya adları 80 karakteri bulabiliyor; kırpmak bilgiyi gizlemek
    // değil, ertelemek — tam ad `title` ile orada.
    expect(SAYFA).toContain('max-w-[16rem] truncate');
    expect(SAYFA).toContain("title={typeof children === 'string' ? children : undefined}");
  });

  it('sıralama seçimi ekran okuyucuya da bildiriliyor', () => {
    expect(SAYFA).toContain("aria-current={active ? 'true' : undefined}");
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
    expect(govde).toContain('text-base font-semibold tabular-nums');
    expect(govde).toContain('uppercase tracking-wider text-ink-muted');
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
