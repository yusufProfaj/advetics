import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * prisma/ altındaki CLI script'lerinin .env yolu — KAYNAK TARAMASI.
 *
 * Monorepo'da tek bir .env var ve DEPO KÖKÜNDE duruyor. `prisma/` içindeki
 * her script oraya üç seviye yukarıdan ulaşıyor (`../../../.env`).
 *
 * NEDEN BU TEST VAR: `seed-portfolio.ts` tek başına `../.env` yazıyordu, yani
 * var olmayan `apps/api/.env` dosyasını arıyordu. Sonuç, sebebini hiç
 * söylemeyen bir hata:
 *
 *   error: Environment variable not found: DATABASE_URL
 *
 * Mesaj "değişken tanımlı değil" diyor; oysa değişken .env içinde tanımlıydı,
 * yalnızca YANLIŞ DOSYA okunuyordu. İnsanı doğrudan yanlış yere — sunucudaki
 * ortam değişkenlerine ve DATABASE_URL'in kendisine — bakmaya gönderiyor.
 *
 * Hata üretime çıkalı aylar olmuştu ve kimse görmemişti: bu seed bugüne kadar
 * HİÇ çalıştırılmamıştı. Çalıştırılmayan kodun kırık olduğu ancak
 * çalıştırıldığı gün anlaşılıyor; bu test o günü öne çekiyor.
 *
 * Yeni bir script eklendiğinde de aynı yolu kullanmasını zorunlu kılıyor.
 */
const PRISMA_DIR = join(__dirname, '../../prisma');

/** Depo köküne çıkan tek doğru yol. */
const EXPECTED = '../../../.env';

function scriptsLoadingEnv(): Array<{ file: string; source: string }> {
  return readdirSync(PRISMA_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((file) => ({ file, source: readFileSync(join(PRISMA_DIR, file), 'utf8') }))
    .filter(({ source }) => source.includes('loadEnv('));
}

describe('prisma script .env yolu', () => {
  it('en az bir script taranıyor — tarama boşa düşmüyor', () => {
    // Klasör yeniden düzenlenir ya da import adı değişirse bu test sessizce
    // "hiçbir dosya bulamadım, demek ki hepsi doğru" derdi. Boş taramanın
    // yeşil yanması, testin olmamasından daha kötü.
    expect(scriptsLoadingEnv().length).toBeGreaterThanOrEqual(4);
  });

  it.each(scriptsLoadingEnv().map(({ file }) => file))(
    '%s depo kökündeki .env dosyasını okuyor',
    (file) => {
      const source = readFileSync(join(PRISMA_DIR, file), 'utf8');
      const paths = [...source.matchAll(/loadEnv\(\{\s*path:\s*resolve\([^,]+,\s*'([^']+)'/g)].map(
        (m) => m[1],
      );

      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) expect(p).toBe(EXPECTED);
    },
  );

  it('hiçbir script apps/api/.env aramıyor', () => {
    // Doğrudan bu regresyonun kendisi. `../.env` buradan bakınca masum
    // görünüyor ve kod incelemesinde gözden kaçıyor.
    for (const { file, source } of scriptsLoadingEnv()) {
      expect(source, `${file} apps/api/.env okuyor`).not.toMatch(
        /loadEnv\(\{\s*path:\s*resolve\([^,]+,\s*'\.\.\/\.env'/,
      );
    }
  });
});
