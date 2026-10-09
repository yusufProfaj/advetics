import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Satır içi durdur/başlat ucu İyileştir'in Uygula'sıyla AYNI yazma yolunu kullanıyor. */
const KOD = readFileSync(join(__dirname, 'campaign-actions.controller.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('varlık eylemi ucu', () => {
  const i = KOD.indexOf("@Post('varliklar/:seviye/:id/eylem')");
  const g = KOD.slice(i, KOD.indexOf('\n  }', i));
  it('dilim yakalandı', () => expect(g.length).toBeGreaterThan(200));
  it('KRİTİK: budget.write istiyor ve `uygula` yolundan geçiyor (geri okuma, şalter, denetim)', () => {
    expect(g).toContain("@RequirePermissions('budget.write')");
    expect(g).toContain('this.actions.uygula(ctx,');
    expect(g).not.toContain('applyAction(');
  });
  it('KRİTİK: düzey beyaz listeden; yalnız durdur/başlat (bütçe İyileştir önerisinden)', () => {
    expect(g).toContain('VARLIK_EYLEM_SEVIYELERI');
    expect(g).toContain('zodBody(varlikEylemiSchema)');
  });
});
