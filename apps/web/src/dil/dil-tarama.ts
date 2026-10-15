import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { MetinTuru } from './dil-tarama.istisnalar';

/**
 * ═══ ELLE YAZILMIŞ EKRAN METNİ TARAMASI (docs/i18n/MIMARI.md §5) ═══
 *
 * İki dilli panelde ekrana çıkan her metin sözlükten (`dil/sozlukler`)
 * gelmeli. Burası, sözlüğe GİRMEMİŞ metni DOSYA DOSYA sayıyor; sayılar
 * `dil-tarama.istisnalar.ts`te ve liste YALNIZ KÜÇÜLÜR
 * (`tasarim-sistemi.spec.ts` deseni).
 *
 * İKİ SAYAÇ, ÇÜNKÜ BİRİ YETMİYOR:
 *  - `turkce`: Türkçe harf (ç ğ ı ö ş ü İ…) taşıyan dizge ya da JSX metni.
 *    "Kaydet", "Ekle" gibi Türkçe harfsiz kelimeleri KAÇIRIR.
 *  - `jsx`: harf taşıyan JSX metin düğümü (`>Kaydet<`). Türkçe harfsiz
 *    metnin en sık durduğu yer. Prop olarak geçen dizge (`baslik="Ekle"`)
 *    ikisine de düşmeyebilir; bu bilinen kalıntı ve sözlüğe geçişte
 *    gözle aranıyor.
 * Sayım YORUMSUZ kaynakta (CLAUDE.md "TARAMAYI YORUMSUZ KAYNAKTA YAP").
 */
export const SRC = join(__dirname, '..');
/** Taranan kökler: panelin ekranları. `dil/` sözlüğün kendisi, taranmaz. */
const KOKLER = ['app', 'components', 'lib'].map((k) => join(SRC, k));

const TURKCE = /[çğıöşüÇĞİÖŞÜ]/;

export function yorumsuz(kod: string): string {
  // `://` adresleri yorum sanılmasın: satır yorumu yalnız satır başında ya da boşluktan sonra.
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[\s;,{}()])\/\/.*$/gm, '$1');
}

export function metinSay(kodHam: string): Record<MetinTuru, number> {
  const kod = yorumsuz(kodHam);
  let turkce = 0;
  for (const m of kod.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    if (TURKCE.test(m[2] ?? '')) turkce++;
  }
  let jsx = 0;
  for (const m of kod.matchAll(/>([^<>{}]*)</g)) {
    const metin = (m[1] ?? '').trim();
    // Harf taşımayan (boşluk, ·, sayı) ve kod gibi görünen parçalar metin değil:
    // `Promise<A> | B<` gibi tip parametreleri, `a > b && c <` gibi karşılaştırmalar.
    if (!/[A-Za-zçğıöşüÇĞİÖŞÜ]/.test(metin) || /[=;()|&]|=>/.test(metin)) continue;
    jsx++;
    if (TURKCE.test(metin)) turkce++;
  }
  return { turkce, jsx };
}

function dosyalar(dizin: string, biriktir: string[] = []): string[] {
  for (const g of readdirSync(dizin, { withFileTypes: true })) {
    const yol = join(dizin, g.name);
    if (g.isDirectory()) dosyalar(yol, biriktir);
    else if (/\.tsx?$/.test(g.name) && !/\.spec\.tsx?$/.test(g.name) && !g.name.includes('.istisnalar.')) {
      biriktir.push(yol);
    }
  }
  return biriktir;
}

export const TARANAN = KOKLER.flatMap((k) => dosyalar(k));

export function mevcutSayilar(): Record<string, Partial<Record<MetinTuru, number>>> {
  const sonuc: Record<string, Partial<Record<MetinTuru, number>>> = {};
  for (const f of TARANAN) {
    const s = metinSay(readFileSync(f, 'utf8'));
    const dolu = Object.fromEntries(Object.entries(s).filter(([, n]) => n > 0));
    if (Object.keys(dolu).length) sonuc[relative(SRC, f)] = dolu;
  }
  return sonuc;
}
