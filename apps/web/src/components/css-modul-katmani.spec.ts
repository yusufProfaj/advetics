import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ CSS MODÜLÜNDE ELEMAN SIFIRLAMASI KATMANDA DURUR ═══
 *
 * `:where(.kok a) { color: inherit }` sıfır özgüllükte ama KATMANSIZ; katmansız
 * kural `@layer utilities` içindeki her Tailwind sınıfını özgüllükten bağımsız
 * eziyor. Genel Bakış'taki koyu "Sihirbazla tamamla" bağlantısı (`bg-ink
 * text-surface`) bu yüzden siyah üstüne siyah çıktı (canlı, 2026-10-15). Aynı
 * sıfırlama `button` için `background: none` taşıyor, yani modülün içindeki
 * her `Dugme`nin zeminini de silebiliyordu. Hata yok, log yok; yalnız
 * okunmaz bir düğme.
 */
const KOK = join(__dirname, '..');

function moduller(d: string, acc: string[] = []): string[] {
  for (const g of readdirSync(d, { withFileTypes: true })) {
    const y = join(d, g.name);
    if (g.isDirectory()) moduller(y, acc);
    else if (g.name.endsWith('.module.css')) acc.push(y);
  }
  return acc;
}

/** Katman dışında kalan ve eleman seçen `:where(...)` kurallarının seçicileri. */
function katmansizSifirlamalar(css: string): string[] {
  const kod = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const bulunan: string[] = [];
  // Açık blokların türü: katman mı, başka bir şey mi.
  const yigin: boolean[] = [];
  let bas = 0;
  for (let i = 0; i < kod.length; i++) {
    const c = kod[i];
    if (c === '{') {
      const secici = kod.slice(bas, i).trim();
      const katmanda = yigin.includes(true);
      if (
        !katmanda &&
        /:where\([^)]*(^|[\s,(])(a|button|input|select|textarea)\b/.test(secici)
      ) {
        bulunan.push(secici);
      }
      yigin.push(secici.startsWith('@layer'));
      bas = i + 1;
    } else if (c === '}') {
      yigin.pop();
      bas = i + 1;
    } else if (c === ';' && yigin.length === 0) {
      bas = i + 1;
    }
  }
  return bulunan;
}

describe('CSS modülü eleman sıfırlaması', () => {
  const dosyalar = moduller(KOK);

  it('BOŞA DÜŞME BEKÇİSİ: modüller bulundu ve dedektör yakalıyor', () => {
    // Sıfırlamayı taşıyan iki modül taramaya girmeli; yol değişirse sessizce
    // boş bir liste taranırdı.
    const adlar = dosyalar.map((d) => d.slice(KOK.length + 1));
    expect(adlar).toContain(join('components', 'taslak', 'taslak.module.css'));
    expect(adlar).toContain(join('components', 'rehber', 'rehber.module.css'));
    expect(katmansizSifirlamalar(':where(.kok a) { color: inherit; }')).toEqual([':where(.kok a)']);
    expect(katmansizSifirlamalar('@layer base { :where(.kok a) { color: inherit; } }')).toEqual([]);
    expect(katmansizSifirlamalar('.kok a { color: red; }')).toEqual([]);
  });

  it('KRİTİK: hiçbir modül eleman sıfırlamasını katmansız yazmıyor', () => {
    const suclu = dosyalar.flatMap((d) =>
      katmansizSifirlamalar(readFileSync(d, 'utf8')).map((s) => `${d.slice(KOK.length + 1)}: ${s}`),
    );
    expect(suclu).toEqual([]);
  });
});
