import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ESKİ GOOGLE ARAMA KURULUMU KAPALI (SENTEZ D-G3). O yol konum ve dil ölçütü
 * yazmıyordu: reklam bütün dünyada yayınlanır, Google hata vermezdi. Biri
 * kapıyı "geçici olarak" kaldırırsa bu test düşer.
 */
const KAYNAK = readFileSync(join(__dirname, 'google.provider.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function govde(ad: string): string {
  const i = KAYNAK.indexOf(`async ${ad}(`);
  if (i < 0) throw new Error(`${ad} bulunamadı`);
  const a = KAYNAK.indexOf('{', KAYNAK.indexOf('Promise<PublishDraftResult>', i));
  let d = 0;
  for (let j = a; j < KAYNAK.length; j++) {
    if (KAYNAK[j] === '{') d++;
    else if (KAYNAK[j] === '}' && --d === 0) return KAYNAK.slice(a, j + 1);
  }
  throw new Error('gövde kapanmadı');
}

describe('eski Google arama kurulumu', () => {
  it('tarama gövdeyi gerçekten buldu', () => {
    expect(govde('publishDraft').length).toBeGreaterThan(20);
  });

  it('KRİTİK: publishDraft platforma HİÇBİR çağrı yapmadan reddediyor', () => {
    const g = govde('publishDraft');
    expect(g).toContain('throw new PlatformApiError');
    expect(g).not.toContain('this.mutate');
  });
});
