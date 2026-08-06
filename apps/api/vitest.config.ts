import { defineConfig } from 'vitest/config';

/**
 * Vitest — API birim testleri.
 *
 * Kapsam kasıtlı olarak dar: veritabanı veya Redis gerektirmeyen, saf karar
 * mantığını test ediyoruz. Entegrasyon testleri (RLS izolasyonu gibi) ayrı
 * çalışır ve gerçek bir Postgres ister; CI'da her PR'da koşması gereken şey
 * bu hızlı katman.
 *
 * NestJS dekoratörleri için `reflect-metadata` gerekiyor; setup dosyasında
 * yükleniyor. `esbuild` dekoratörleri çalıştırmıyor ama biz DI container'ı
 * kullanmadan servisleri doğrudan `new` ile kuruyoruz — dekoratör davranışına
 * bağımlı bir testimiz yok.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Testler saniyeler içinde bitmeli; takılan bir test CI'ı bekletmesin.
    testTimeout: 10_000,
  },
});
