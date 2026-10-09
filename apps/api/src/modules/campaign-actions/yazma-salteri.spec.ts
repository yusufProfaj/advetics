import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * AJANSIN ACİL ŞALTERİ İKİ YAZMA YOLUNDA DA (Ajan 4 bulgusu, 2026-10-09).
 * İyileştir'in Uygula'sı ve asistan kartı `uygula`, eski uç `applyAction`
 * üzerinden yazıyor; ikisi de şalteri platform çağrısından ve kotadan ÖNCE
 * okumalı. Yorumsuz kaynakta, fonksiyon gövdesi süslü sayılarak çıkarılıyor.
 */
const KOD = readFileSync(join(__dirname, 'campaign-actions.service.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

function govde(ad: string): string {
  const i = KOD.indexOf(`async ${ad}(`);
  if (i < 0) throw new Error(`bulunamadı: ${ad}`);
  const ac = KOD.indexOf('{', KOD.indexOf(')', KOD.indexOf('): Promise', i)));
  let d = 0;
  for (let j = ac; j < KOD.length; j++) {
    if (KOD[j] === '{') d++;
    else if (KOD[j] === '}' && --d === 0) return KOD.slice(i, j + 1);
  }
  throw new Error(`sonu bulunamadı: ${ad}`);
}

describe('acil yazma şalteri', () => {
  for (const ad of ['uygula', 'applyAction']) {
    it(`KRİTİK: ${ad} şalteri kotadan ve platform çağrısından ÖNCE okuyor`, () => {
      const g = govde(ad);
      expect(g.length).toBeGreaterThan(300);
      const kapi = g.indexOf('await this.yazmaKapisi(ctx, row.platform, row.clientId)');
      expect(kapi, 'şalter okunmuyor').toBeGreaterThan(-1);
      expect(g).toContain('if (!kapi.acik) throw new BadRequestException(kapi.sebep);');
      expect(kapi).toBeLessThan(g.indexOf('this.quota.acquire('));
      expect(kapi).toBeLessThan(g.indexOf('provider.applyAction('));
    });
  }

  it('KRİTİK: Google Video kampanyası platforma GİTMEDEN reddediliyor (MUTATE_NOT_ALLOWED, canlıda 2026-10-10)', () => {
    const g = govde('uygula');
    const ret = g.indexOf('if (googleYazilamazMi(row.platform, row.kampanyaKanali)) {');
    expect(ret, 'Video koruması yok').toBeGreaterThan(-1);
    expect(ret).toBeLessThan(g.indexOf('this.quota.acquire('));
    expect(ret).toBeLessThan(g.indexOf('provider.applyAction('));
    // Kanal varlığın KAMPANYASINDAN okunuyor (set ve reklam için de).
    expect(KOD).toContain('(SELECT k.objective FROM campaigns k WHERE k.id = g.campaign_id)');
  });

  it('KRİTİK: Meta ve Google kendi şalterini okuyor', () => {
    expect(KOD).toContain("if (platform === 'meta') return metaYazmaAcikMi(tx, clientId);");
    expect(KOD).toContain("if (platform === 'google') return googleYazmaAcikMi(tx, clientId);");
  });
});
