import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/* Boş durum kutusunun varsayılan ikonu "0" karakteri değil (sayı gibi okunuyordu). */
const K = readFileSync(join(__dirname, 'hal.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

describe('BosDurum ikonu', () => {
  it('KRİTİK: varsayılan çizgi ikon, "0" değil', () => {
    expect(K).toContain('ikon = <BosIkonu />,');
    expect(K).not.toContain("ikon = '0'");
    expect(K).toContain('stroke="currentColor"');
  });
});
