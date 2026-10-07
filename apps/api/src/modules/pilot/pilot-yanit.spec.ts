import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * YANIT ZARFI İKİ YERDE: sunucunun döndürdüğü (`packages/shared/src/pilot/
 * yanitlar.ts`) ve panelin beklediği (`apps/web/.../pilot/yanitlar.ts`,
 * Ajan 3). Panel içe aktarmasını shared'a çevirene kadar ikisi METİN olarak
 * aynı kalmak zorunda; biri değişip diğeri unutulursa TypeScript iki tarafı
 * ayrı ayrı yeşil geçirir ve ayrışma ancak ekranda boş alan olarak görünür.
 */
const govde = (yol: string) => {
  const s = readFileSync(join(__dirname, yol), 'utf8');
  const i = s.indexOf('/** Panelin çizdiği eylemler');
  if (i < 0) throw new Error(`${yol}: zarf başlangıcı bulunamadı — tarama boşa düşerdi`);
  return s.slice(i).trim();
};

describe('pilot yanıt zarfı', () => {
  it('KRİTİK: shared ve panel kopyası birebir aynı', () => {
    expect(govde('../../../../../packages/shared/src/pilot/yanitlar.ts')).toBe(govde('../../../../web/src/components/pilot/yanitlar.ts'));
  });
});
