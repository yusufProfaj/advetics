import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ NEST BAĞIMLILIK GRAFİĞİ AÇILIŞTA ÇÖZÜLÜYOR MU (Ajan 4) ═══
 *
 * CLAUDE.md "NEST MODÜL KAYDI DERLEMEDE DEĞİL AÇILIŞTA PATLIYOR": `nest
 * build` başarılı olur, grafik çözülemez ve hata deploy'un ortasında, pm2
 * süreci ayağa kalkmazken görünür. Bu tura kadar her yeni modül (Sinyal,
 * Etki, GeriBesleme, VeriKaynagi, KreatifZeka, HaftalikOzet) ve QueueModule'e
 * eklenen servisler yalnız KAYNAK TARAMASIYLA kilitliydi: tarama "şu satır
 * var" diyor, grafiğin çözüldüğünü söylemiyor.
 *
 * Bu test AppModule'ün TAMAMINI (API ve worker aynı modülü açıyor) gerçek
 * Nest tarayıcısı ve enjektörüyle örnekliyor; yalnız Prisma ve CONFIG sahte,
 * Redis adresi yok. Ayrı süreç ve TypeScript'in kendi derleyicisi:
 * `test/nest-grafigi-calistir.cjs` başındaki not (esbuild kurucu tip meta
 * verisini üretmiyor).
 *
 * Mutasyonla doğrulandı: bir modülün `imports`undan gerekli modülü silmek
 * bu testi sağlayıcı adıyla düşürüyor.
 */
const KOSUCU = join(__dirname, '../test/nest-grafigi-calistir.cjs');

describe('Nest bağımlılık grafiği', () => {
  it('KRİTİK: AppModule bütün modülleriyle örneklenebiliyor (DI çözümü)', () => {
    const r = spawnSync(process.execPath, [KOSUCU], { encoding: 'utf8', timeout: 90_000, env: { ...process.env, REDIS_URL: '' } });
    const cikti = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const dustu = /GRAFIK_DUSTU (.*)/.exec(cikti)?.[1];
    // Düşüşte Nest'in kendi cümlesi ("Nest can't resolve dependencies of X
    // (?, Y)") test çıktısında görünsün: sebebi aramak için yeniden koşmak
    // gerekmesin.
    expect(dustu ?? null, cikti.slice(-3000)).toBeNull();
    expect(r.status, cikti.slice(-3000)).toBe(0);
    const m = /GRAFIK_TAMAM (\d+) (\S+)/.exec(cikti);
    expect(m, 'koşucu sonuç satırı yazmadı').not.toBeNull();
    // Boşa düşmesin: grafik gerçekten bu turun modüllerini taşıyor.
    const moduller = m![2]!.split(',');
    for (const ad of [
      'AppModule',
      'QueueModule',
      'SinyalModule',
      'SinyalIsModule',
      'EtkiModule',
      'EtkiIsModule',
      'GeriBeslemeModule',
      'VeriKaynagiModule',
      'KreatifZekaModule',
      'KreatifZekaIsModule',
      'HaftalikOzetModule',
      'HaftalikOzetIsModule',
    ]) {
      expect(moduller, ad).toContain(ad);
    }
    expect(Number(m![1])).toBeGreaterThan(40);
  }, 120_000);
});
