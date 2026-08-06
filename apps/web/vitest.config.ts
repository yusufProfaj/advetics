import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

/**
 * Vitest — panel birim testleri.
 *
 * Kapsam biçimlendirme ve saf mantık; React bileşenlerini render etmiyoruz
 * (jsdom + testing-library bu aşamada taşıdığı bakım yükünü hak etmiyor).
 * Test edilen şey panelin GÖSTERDİĞİ SAYILAR: para biçimlendirmesi BigInt
 * aritmetiği yapıyor ve buradaki bir hata müşteriye yanlış harcama raporlar.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
