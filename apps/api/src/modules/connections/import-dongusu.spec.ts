import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ DÖNGÜSEL IMPORT — ÜRETİMİ DÜŞÜRDÜ, HİÇBİR ŞEY YAKALAMADI ═══
 *
 * 2026-09-08: LinkedIn sağlayıcısı `queue/insights-sync.service`ten saf bir
 * fonksiyon import etti ve şu döngü oluştu:
 *
 *   linkedin.provider.ts → queue/insights-sync.service.ts
 *                        → modules/connections/provider.registry.ts
 *                        → linkedin.provider.ts
 *
 * Nest açılışta `ProviderRegistry`yi çözemedi
 * (*"can't resolve dependencies of the InsightsSyncService ... argument at
 * index [1]"*), API ve worker "too many unstable restarts" ile durdu ve
 * ÜRETİM ÇÖKTÜ.
 *
 * ┌─ NEDEN HİÇBİR BEKÇİ TUTMADI ──────────────────────────────────────────┐
 * │ · `tsc` TEMİZ GEÇTİ — TypeScript döngüsel import'u hata saymıyor.      │
 * │ · 2.326 TEST GEÇTİ — depoda Nest bağımlılık grafiğini ayağa kaldıran   │
 * │   tek bir test yok (`vitest.config.ts` bunu bilinçli reddediyor:       │
 * │   servisler DI container'sız, doğrudan `new` ile kuruluyor).           │
 * │ · Sağlayıcı kaydını kontrol eden kaynak taraması da geçti — o, sınıfın │
 * │   `providers` listesinde OLUP OLMADIĞINA bakıyor, import grafiğine     │
 * │   değil.                                                               │
 * │                                                                        │
 * │ CLAUDE.md zaten yazıyordu: "NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA  │
 * │ PATLIYOR." Uyarı vardı; tuzağın İKİNCİ biçimine düşüldü.               │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * Bu dosya import grafiğini gerçekten yürüyor ve döngü bulursa düşüyor.
 */

const API_SRC = resolve(__dirname, '..', '..');

/** `.ts` kaynakları — testler ve derleme çıktıları hariç. */
function kaynaklar(kok: string): string[] {
  const out: string[] = [];
  const gez = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const tam = join(d, e.name);
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name === 'dist') continue;
        gez(tam);
      } else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts')) {
        out.push(tam);
      }
    }
  };
  gez(kok);
  return out;
}

/**
 * Bir dosyanın DEĞER import'ları — `import type` HARİÇ.
 *
 * AYRIM KRİTİK: `import type` derlemede siliniyor, yani çalışma anında döngü
 * ÜRETMİYOR. Onları da saymak bu taramayı yanlış alarm makinesine çevirirdi
 * ve yanlış alarm veren bir bekçi kapatılır.
 */
function degerImportlari(dosya: string): string[] {
  const src = readFileSync(dosya, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  const re = /(?:^|\n)\s*import\s+(type\s+)?([\s\S]*?)from\s+'(\.[^']+)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    // `import type { X } from ...` → çalışma anında yok.
    if (m[1]) continue;
    // `import { type X, type Y } from ...` → hepsi tip ise yine yok.
    const govde = (m[2] ?? '').trim();
    if (govde.startsWith('{') && govde.endsWith('}')) {
      const parcalar = govde
        .slice(1, -1)
        .split(',')
        .map((p) => p.trim())
        .filter((p) => p !== '');
      if (parcalar.length > 0 && parcalar.every((p) => p.startsWith('type '))) continue;
    }
    out.push(m[3]!);
  }
  return out;
}

/** Göreli yolu gerçek dosyaya çözer. */
function coz(kaynak: string, yol: string): string | null {
  const taban = resolve(dirname(kaynak), yol);
  for (const aday of [`${taban}.ts`, join(taban, 'index.ts')]) {
    if (existsSync(aday)) return aday;
  }
  return null;
}

describe('import grafiği', () => {
  const dosyalar = kaynaklar(API_SRC);

  it('tarama gerçekten dosya buldu', () => {
    // Dizin yapısı değişirse aşağıdaki iddia BOŞ KÜMEDE doğru olurdu.
    expect(dosyalar.length).toBeGreaterThan(150);
    expect(dosyalar.some((d) => d.endsWith('linkedin.provider.ts'))).toBe(true);
  });

  it('KRİTİK: DEĞER import\'larında döngü YOK', () => {
    /*
     * Bu iddia üretimi düşüren arızanın ta kendisi. Döngü bulunduğunda hata
     * mesajı ZİNCİRİ YAZIYOR — "bir yerde döngü var" demek, onu aramakla
     * geçen yarım günü geri getirmez.
     */
    const graf = new Map<string, string[]>();
    for (const d of dosyalar) {
      graf.set(
        d,
        degerImportlari(d)
          .map((y) => coz(d, y))
          .filter((y): y is string => y !== null),
      );
    }

    const durum = new Map<string, number>(); // 0 yok, 1 sürüyor, 2 bitti
    const yol: string[] = [];
    const donguler: string[][] = [];

    const gez = (d: string): void => {
      if (durum.get(d) === 2) return;
      if (durum.get(d) === 1) {
        donguler.push([...yol.slice(yol.indexOf(d)), d]);
        return;
      }
      durum.set(d, 1);
      yol.push(d);
      for (const k of graf.get(d) ?? []) gez(k);
      yol.pop();
      durum.set(d, 2);
    };
    for (const d of dosyalar) gez(d);

    const okunur = donguler.map((c) => c.map((f) => relative(API_SRC, f)).join('\n     → '));
    expect(okunur, `değer import'larında döngü:\n\n     ${okunur.join('\n\n     ')}\n`).toEqual([]);
  });

  it('KRİTİK: `providers/` bir `queue/` SERVİSİNDEN import etmiyor', () => {
    /*
     * Döngünün doğduğu desen buydu ve kuralı ayrıca yazmak ucuz: sağlayıcılar
     * kuyruk servislerinin ALTINDA duruyor, tersi değil. Ortak olan şey saf
     * bir fonksiyonsa `queue/istek-pencereleri.ts` gibi bağımsız bir dosyaya
     * taşınır — o dosya hiçbir Nest sağlayıcısı tanımıyor.
     */
    const suclular: string[] = [];
    for (const d of dosyalar.filter((f) => f.includes('/connections/providers/'))) {
      for (const y of degerImportlari(d)) {
        const hedef = coz(d, y);
        if (hedef && /\/queue\/.*\.service\.ts$/.test(hedef)) {
          suclular.push(`${relative(API_SRC, d)} → ${relative(API_SRC, hedef)}`);
        }
      }
    }
    expect(suclular, 'sağlayıcı bir kuyruk servisinden import ediyor').toEqual([]);
  });
});
