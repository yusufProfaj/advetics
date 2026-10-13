import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { IhlalTuru } from './tasarim-sistemi.istisnalar';

/**
 * Tasarım sistemi bekçisinin TARAMASI (`tasarim-sistemi.spec.ts`). Ayrı
 * dosyada: istisna listesi bugünkü sayılarla bu fonksiyonlardan üretildi ve
 * sayfa ajanları bir dosyayı düzelttiğinde yeni sayıyı aynı yerden okuyor.
 */
export const SRC = join(__dirname, '..');
export const UI = join(SRC, 'components', 'ui');

function dosyalar(dizin: string, biriktir: string[] = []): string[] {
  for (const g of readdirSync(dizin, { withFileTypes: true })) {
    const yol = join(dizin, g.name);
    if (g.isDirectory()) {
      if (yol === UI) continue; // Ortak bileşenler kalıbın KENDİSİ.
      dosyalar(yol, biriktir);
    } else if (/\.(tsx|module\.css)$/.test(g.name) && !g.name.includes('.spec.')) {
      biriktir.push(yol);
    }
  }
  return biriktir;
}

/** Blok ve satır yorumlarını atar; satır içi `//` URL'lere dokunmamak için yalnız satır BAŞINDAKİNİ. */
export function yorumsuz(kod: string): string {
  return kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Kılavuz renkleri: beyaz, siyah, gri, kırmızı (kısa ve uzun yazımlarıyla). */
export const KILAVUZ = new Set(['#fff', '#ffffff', '#000', '#000000', '#302e2d', '#ff2400']);

/** Bir string literal içindeki sınıf dizilerini sırayla döndürür. */
function literaller(kod: string): string[] {
  return [...kod.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)].map((m) => m[2] ?? '');
}

export function ihlalSay(kodHam: string, css: boolean): Record<IhlalTuru, number> {
  const kod = yorumsuz(kodHam);
  const say = (re: RegExp) => (kod.match(re) ?? []).length;

  // RENK: kılavuz dışı onaltılık renk + eski yarı-mavi gölge tonu.
  const hex = [...kod.matchAll(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g)]
    .map((m) => m[0].toLowerCase())
    // `href="#bolum"` gibi çapalar hex'e benzemez ama `#add` gibi kelimeler benzer: yalnız renk bağlamı.
    .filter((h) => !KILAVUZ.has(h));
  const renk = hex.length + say(/rgba?\(\s*16[ ,]+24[ ,]+40/g);

  // DEGRADE: maske dışındaki her degrade (maske bir solma, renk değil).
  const degrade = (kod.match(/(?<!mask-image:\s?)(?:linear|radial)-gradient\(|bg-gradient-to-/g) ?? []).length;

  if (css) return { renk, degrade, dugme: 0, modal: 0, h1: 0 };

  // ELLE BİRİNCİL/TEHLİKE DÜĞME: dolu marka ya da tehlike zemini + beyaz yazı taşıyan sınıf dizisi.
  const dugme = literaller(kod).filter(
    (l) => /(?:^|\s)(?:bg-brand|bg-danger)(?:\s|$)/.test(l) && /(?:^|\s)text-white(?:\s|$)/.test(l),
  ).length;
  // ELLE MODAL: ekranı kaplayan katman (`Pencere`/`YanPanel` yerine).
  const modal = say(/\bfixed inset-0\b/g);
  // ELLE SAYFA BAŞLIĞI (`SayfaBasligi` yerine).
  const h1 = say(/<h1\b/g);
  return { renk, degrade, dugme, modal, h1 };
}

export const TARANAN = dosyalar(SRC);

export function mevcutSayilar(): Record<string, Partial<Record<IhlalTuru, number>>> {
  const sonuc: Record<string, Partial<Record<IhlalTuru, number>>> = {};
  for (const f of TARANAN) {
    const s = ihlalSay(readFileSync(f, 'utf8'), f.endsWith('.css'));
    const dolu = Object.fromEntries(Object.entries(s).filter(([, n]) => n > 0));
    if (Object.keys(dolu).length) sonuc[relative(SRC, f)] = dolu;
  }
  return sonuc;
}

