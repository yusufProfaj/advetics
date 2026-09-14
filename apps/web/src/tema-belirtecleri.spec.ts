import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KARANLIK TEMA: HAM PALET YAZILMIYOR ═══
 *
 * Yüzey belirteçleri (`--surface`, `--text`, `--border`) `prefers-color-
 * scheme: dark` ile dönüyor, yani işletim sistemi karanlıktaysa panel de
 * karanlık. Ama panelde 500'den fazla yerde sabit Tailwind paleti yazılıydı
 * (`bg-amber-50`, `text-rose-700`, `text-slate-500`…) ve 90 tanesi AÇIK
 * ZEMİNDİ. O sınıflar dönmüyor: koyu bir sayfanın ortasında bembeyaz uyarı
 * kutuları kalıyordu ve bunu yalnızca karanlık tema kullanan biri görüyordu.
 *
 * HATA VERMEYEN, LOG BIRAKMAYAN, YALNIZCA ÇİRKİN GÖRÜNEN bir arıza — yani
 * kendiliğinden fark edilmesi en zor olanı. Bu tarama yenisinin eklenmesini
 * engelliyor.
 *
 * ┌─ TEK İSTİSNA: RAPOR BELGESİ ───────────────────────────────────────────┐
 * │ `components/report/` PDF'in ekrandaki AYNASI ve o belge BEYAZ bir       │
 * │ kâğıt: beyaz zemin, ince gri çizgiler. CLAUDE.md PDF'in referansının    │
 * │ `report-document.tsx` olduğunu söylüyor. Karanlık temada dönmesi,       │
 * │ ekranla basılan belgenin AYRIŞMASI demek olurdu — düzeltmek değil,      │
 * │ yeni bir hata üretmek.                                                  │
 * └─────────────────────────────────────────────────────────────────────────┘
 */
const KOK = join(__dirname);
const ISTISNA = ['components/report/'];

/** Tailwind'in ham renk ailesi + tonu (`bg-amber-50` gibi). */
const HAM_PALET =
  /\b(bg|text|border|ring|from|to|via|decoration|outline|shadow|fill|stroke|divide|accent)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g;

function dosyalar(dizin: string, biriktir: string[] = []): string[] {
  for (const g of readdirSync(dizin, { withFileTypes: true })) {
    const yol = join(dizin, g.name);
    if (g.isDirectory()) dosyalar(yol, biriktir);
    else if (/\.tsx$/.test(g.name) && !g.name.includes('.spec.')) biriktir.push(yol);
  }
  return biriktir;
}

const TARANAN = dosyalar(KOK);
const KAPSAM = TARANAN.filter((f) => !ISTISNA.some((d) => f.includes(d)));

describe('tema belirteçleri', () => {
  it('BOŞA DÜŞME BEKÇİSİ: tarama gerçekten dosya okudu', () => {
    // Dizin adı ya da uzantı deseni değişirse liste boşalır ve aşağıdaki
    // "ham palet yok" iddiası HER ZAMAN doğru olurdu.
    expect(TARANAN.length).toBeGreaterThan(100);
    expect(KAPSAM.length).toBeGreaterThan(100);
  });

  it('KRİTİK: rapor belgesi dışında hiçbir ekranda ham Tailwind rengi yok', () => {
    const bulunan: string[] = [];
    for (const dosya of KAPSAM) {
      const kod = readFileSync(dosya, 'utf8');
      for (const eslesme of kod.match(HAM_PALET) ?? []) {
        bulunan.push(`${dosya.slice(KOK.length + 1)}: ${eslesme}`);
      }
    }
    expect(bulunan).toEqual([]);
  });

  it('istisna GERÇEKTEN kullanılıyor — liste bayat değil', () => {
    /*
     * İstisna listesi bir gün gereksizleşirse (rapor belgesi de
     * belirteçlere geçerse) bu test düşer ve liste temizlenir. Bayat bir
     * istisna, bir gün başka bir dosyayı sessizce kapsam dışında bırakır.
     */
    const rapor = TARANAN.filter((f) => f.includes('components/report/'));
    expect(rapor.length).toBeGreaterThan(0);
    const hepsi = rapor.map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(hepsi.match(HAM_PALET)?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('marka rengi METİN olarak okunur tonda', () => {
  it('KRİTİK: `text-brand` yerine `text-brand-strong` kullanılıyor', () => {
    /*
     * Ham marka rengi metin olarak her zemine yetmiyor: varsayılan kırmızı
     * (#e11d2e) koyu yüzeyde 3.80 kontrast veriyor ve eşik 4.5 (globals.css
     * içinde ÖLÇÜLMÜŞ). Depo bunun için `text-brand-strong` yardımcısını
     * tanımlamış ama panelde 36 yerde hâlâ ham `text-brand` yazılıydı:
     * bağlantılar, aktif menü satırı, seçili şirket adı.
     *
     * `bg-brand`, `border-brand`, `ring-brand` KAPSAM DIŞI: kontrast kuralı
     * metin için. Yorum satırları da dışarıda — kuralı ANLATAN cümleyi
     * yasaklamak gerekçeyi siler.
     */
    const bulunan: string[] = [];
    for (const dosya of KAPSAM) {
      const satirlar = readFileSync(dosya, 'utf8').split('\n');
      satirlar.forEach((satir, i) => {
        const t = satir.trim();
        if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
        if (/text-brand(?![-a-z])/.test(satir)) {
          bulunan.push(`${dosya.slice(KOK.length + 1)}:${i + 1}`);
        }
      });
    }
    expect(bulunan).toEqual([]);
  });

  it('okunur ton GERÇEKTEN tanımlı ve temaya göre YÖN değiştiriyor', () => {
    /*
     * Tek yönlü karıştırma (yalnızca siyaha) karanlık temada rengi daha da
     * koyultuyor ve kontrastı 2.95'e düşürüyordu: okunabilirlik için
     * eklenen katman okunabilirliği bozuyordu.
     */
    const css = readFileSync(join(KOK, 'app', 'globals.css'), 'utf8');
    expect(css).toContain('@utility text-brand-strong');
    expect(css).toContain('--brand-legible');
    const karanlik = css.slice(css.indexOf('--brand-legible'));
    expect(karanlik).toContain('white');
  });
});

describe('durum belirteçleri tanımlı', () => {
  const CSS = readFileSync(join(KOK, 'app', 'globals.css'), 'utf8');

  it('her durum renginin zemin ve metin tonu var', () => {
    for (const ad of ['ok', 'warn', 'danger', 'info']) {
      expect(CSS, `--${ad}-soft tanımsız`).toContain(`--${ad}-soft:`);
      expect(CSS, `--${ad}-strong tanımsız`).toContain(`--${ad}-strong:`);
      expect(CSS, `--color-${ad}-soft köprüsü yok`).toContain(`--color-${ad}-soft:`);
      expect(CSS, `--color-${ad}-strong köprüsü yok`).toContain(`--color-${ad}-strong:`);
    }
  });

  it('KRİTİK: hepsi KARANLIK temada da yeniden tanımlanıyor', () => {
    /*
     * Belirteç tanımlamak yetmiyor: karanlık blokta dönmeyen bir `-soft`
     * değeri, düzeltmeye çalıştığımız beyaz kutunun aynısını üretir.
     * İddia karanlık bloğun İÇİNE bakıyor.
     */
    const bas = CSS.indexOf('@media (prefers-color-scheme: dark)');
    expect(bas, 'karanlık blok bulunamadı — tarama boşa düştü').toBeGreaterThan(-1);
    const blok = CSS.slice(bas, CSS.indexOf('@theme inline'));
    for (const ad of ['ok', 'warn', 'danger', 'info']) {
      expect(blok, `--${ad}-soft karanlıkta dönmüyor`).toContain(`--${ad}-soft:`);
      expect(blok, `--${ad}-strong karanlıkta dönmüyor`).toContain(`--${ad}-strong:`);
    }
  });
});
