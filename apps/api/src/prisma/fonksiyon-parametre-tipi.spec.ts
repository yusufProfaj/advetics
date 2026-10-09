import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ BAĞLI SAYI PARAMETRESİ FONKSİYONA TİPSİZ GİDEMEZ ═══
 *
 * Prisma `$queryRaw`/`$executeRaw` içinde `${sayi}` bir BAĞLI PARAMETRE ve
 * JS sayısını `bigint` (int8) olarak gönderiyor. Postgres'te
 * `make_interval(mins => bigint)` gibi aşırı yüklemeler YOK: istek
 * "42883 function ... does not exist" ile düşüyor. 2026-10-09'da Akıllı
 * Boost listesinin tamamı bu yüzden açılmadı ("İçerik listesi açılamadı ·
 * kod 42883").
 *
 * PGLITE BUNU YAKALAYAMIYOR: parametre tipini sorgudan kendisi çıkarıyor ve
 * aynı sorgu testte yeşil geçiyor. Bu yüzden kural kaynak taramasıyla:
 * `make_interval(… => ${…})` ya `::int` taşımalı ya da sabit `Prisma.raw`
 * olmalı (`metrik-isleri.ts` deseni). İlk yazılan sorgu tam olarak bu
 * tuzağa düştü; depoda bunu önceden bilen tek iz o dosyadaki `Prisma.raw`
 * kullanımıydı.
 */
const KOK = join(__dirname, '..');

function dosyalar(dizin: string): string[] {
  return readdirSync(dizin).flatMap((ad) => {
    const yol = join(dizin, ad);
    if (statSync(yol).isDirectory()) return dosyalar(yol);
    return ad.endsWith('.ts') && !ad.endsWith('.spec.ts') ? [yol] : [];
  });
}

const DESEN = /make_interval\(\s*\w+\s*=>\s*\$\{([^}]+)\}(::\w+)?/g;

describe('make_interval parametre tipi', () => {
  const kaynaklar = dosyalar(KOK).map((y) => ({ yol: relative(KOK, y), kod: readFileSync(y, 'utf8') }));

  it('tarama boşa düşmüyor — desen depoda en az iki yerde var', () => {
    const say = kaynaklar.reduce((n, k) => n + [...k.kod.matchAll(DESEN)].length, 0);
    expect(say).toBeGreaterThanOrEqual(2);
  });

  it('KRİTİK: her bağlı parametre ::int taşıyor ya da sabit Prisma.raw', () => {
    const ihlaller: string[] = [];
    for (const { yol, kod } of kaynaklar) {
      for (const m of kod.matchAll(DESEN)) {
        const ifade = m[1]!.trim();
        const tip = m[2];
        if (tip) continue;
        // `Prisma.raw` ile kurulmuş sabit (metrik-isleri.ts: `const gun = Prisma.raw(...)`).
        const raw = new RegExp(`const ${ifade.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*=\\s*Prisma\\.raw\\(`).test(kod);
        // Düz şablon (Prisma.raw içine yazılmış metin): `${SABIT}` metne gömülüyor, parametre değil.
        const satirBasi = kod.lastIndexOf('Prisma.', m.index);
        const rawSablon = kod.slice(satirBasi, satirBasi + 12).startsWith('Prisma.raw(');
        if (!raw && !rawSablon) ihlaller.push(`${yol}: make_interval(… \${${ifade}})`);
      }
    }
    expect(ihlaller).toEqual([]);
  });
});
