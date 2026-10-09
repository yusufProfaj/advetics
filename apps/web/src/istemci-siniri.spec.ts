import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ SUNUCU BİLEŞENİ İSTEMCİ DOSYASINDAN DEĞER AKTARAMAZ ═══
 *
 * `'use client'` dosyasından sunucu tarafına aktarılan her şey bir İSTEMCİ
 * REFERANSI oluyor. Bileşen için doğru (sunucu onu render etmiyor, yerini
 * işaretliyor) ama SABİT ve FONKSİYON için sessiz bir hata: değer sayı ya
 * da fonksiyon değil, bir vekil nesne. 2026-10-09'da `ILK_SATIR` böyle
 * aktarıldı; `slice(0, ILK_SATIR)` boş döndü ve canlıda bekleyen işler
 * kartı "3 / 50 gösteriliyor" yazıp tek satır göstermedi. TypeScript,
 * derleme ve vitest üçü de bunu görmüyor; yalnız tarayıcı görüyor.
 *
 * KURAL: istemci dosyası OLMAYAN bir dosya, istemci dosyasından yalnızca
 * BİLEŞEN (Büyük harfle başlayan, ama TAMAMI büyük harf OLMAYAN ad) ya da
 * `type` aktarabilir. Testler (`.spec.ts`) hariç: onlar Next.js'te koşmuyor.
 */
const SRC = __dirname;

function dosyalar(dizin: string): string[] {
  const out: string[] = [];
  for (const ad of readdirSync(dizin)) {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) out.push(...dosyalar(yol));
    else if (/\.tsx?$/.test(ad) && !/\.spec\.tsx?$/.test(ad)) out.push(yol);
  }
  return out;
}

const istemciMi = (kod: string) => /^\s*['"]use client['"]/.test(kod);

function coz(kaynak: string, yol: string): string | null {
  const taban = yol.startsWith('@/') ? join(SRC, yol.slice(2)) : yol.startsWith('.') ? resolve(dirname(kaynak), yol) : null;
  if (!taban) return null;
  for (const aday of [`${taban}.tsx`, `${taban}.ts`, join(taban, 'index.tsx'), join(taban, 'index.ts')]) {
    if (existsSync(aday)) return aday;
  }
  return null;
}

const bilesenAdi = (ad: string) => /^[A-Z]/.test(ad) && /[a-z]/.test(ad);

function ihlaller(): string[] {
  const out: string[] = [];
  for (const dosya of dosyalar(SRC)) {
    const kod = readFileSync(dosya, 'utf8');
    if (istemciMi(kod)) continue;
    for (const m of kod.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+['"]([^'"]+)['"]/g)) {
      if (m[1]) continue;
      const hedef = coz(dosya, m[3]!);
      if (!hedef || !istemciMi(readFileSync(hedef, 'utf8'))) continue;
      for (const parca of m[2]!.split(',')) {
        const p = parca.trim();
        if (!p || p.startsWith('type ')) continue;
        const ad = p.split(/\s+as\s+/)[0]!.trim();
        if (!bilesenAdi(ad)) out.push(`${dosya.slice(SRC.length + 1)} → ${ad} (${m[3]})`);
      }
    }
  }
  return out;
}

describe('istemci sınırı', () => {
  it('tarama boşa düşmüyor: istemci dosyası ve sunucu aktarımı gerçekten bulunuyor', () => {
    const hepsi = dosyalar(SRC);
    expect(hepsi.length).toBeGreaterThan(100);
    expect(hepsi.filter((d) => istemciMi(readFileSync(d, 'utf8'))).length).toBeGreaterThan(20);
    expect(coz(join(SRC, 'app', 'x.tsx'), '@/components/taslak/genel-bakis-parcalari')).not.toBeNull();
  });

  it('KRİTİK: sunucu tarafı istemci dosyasından yalnız bileşen ve tip aktarıyor', () => {
    expect(ihlaller()).toEqual([]);
  });
});
