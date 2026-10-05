import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ RAPOR TRANSACTION'I VARSAYILAN 5 SANİYEYLE AÇILMIYOR ═══
 *
 * Önizlemeler üretimde 5,2–42 sn sürüp "Transaction already closed" ile
 * düştü ve panelde "Beklenmeyen bir hata oluştu" göründü (2026-10-05).
 * Davranış testiyle yakalanamıyor: PGlite'ta rapor milisaniyeler sürüyor.
 */
const KAYNAK = readFileSync(resolve(__dirname, 'reports.service.ts'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

describe('veriToplaK', () => {
  it('KRİTİK: withTenant açık süre sınırıyla çağrılıyor', () => {
    const bas = KAYNAK.indexOf('private async veriToplaK(');
    expect(bas, 'veriToplaK bulunamadı — tarama boşa düştü').toBeGreaterThan(0);
    const govde = KAYNAK.slice(bas, KAYNAK.indexOf('\n  }\n', bas));
    expect(govde).toContain('this.prisma.withTenant(ctx,');
    expect(govde).toContain('{ timeoutMs: RAPOR_OKUMA_SURESI_MS }');
    expect(KAYNAK).toMatch(/const RAPOR_OKUMA_SURESI_MS = \d{2}_000;/);
  });
});
