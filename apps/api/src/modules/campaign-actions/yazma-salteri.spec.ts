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
  /*
   * `uygula`nın platforma gitmeyen kontrolleri 2026-10-19'dan beri
   * `onKontrol`de: MCP onay önizlemesi (`onizle`) aynı kapıdan geçsin diye
   * (docs/okuma-api/MCP-YAZMA-MIMARI.md § 2). Şalter ve Video koruması orada
   * aranıyor; `uygula` ile `onizle`nin onu kotadan ve platform çağrısından
   * ÖNCE çağırdığı ayrıca kilitli.
   */
  for (const ad of ['onKontrol', 'applyAction']) {
    it(`KRİTİK: ${ad} şalteri kotadan ve platform çağrısından ÖNCE okuyor`, () => {
      const g = govde(ad);
      expect(g.length).toBeGreaterThan(300);
      const kapi = g.indexOf('await this.yazmaKapisi(ctx, row.platform, row.clientId)');
      expect(kapi, 'şalter okunmuyor').toBeGreaterThan(-1);
      expect(g).toContain('if (!kapi.acik) throw new BadRequestException(kapi.sebep);');
      if (ad === 'applyAction') {
        expect(kapi).toBeLessThan(g.indexOf('this.quota.acquire('));
        expect(kapi).toBeLessThan(g.indexOf('provider.applyAction('));
      } else {
        // Ön kontrol platforma ve kotaya HİÇ dokunmuyor (önizleme de bunu çağırıyor).
        expect(g).not.toContain('this.quota.acquire(');
        expect(g).not.toContain('provider.applyAction(');
      }
    });
  }

  it('KRİTİK: uygula ön kontrolü kotadan ve platform çağrısından ÖNCE çağırıyor; önizleme de aynı kapıdan geçiyor', () => {
    const g = govde('uygula');
    const on = g.indexOf('await this.onKontrol(ctx, hedef, eylem)');
    expect(on, 'uygula ön kontrolü çağırmıyor').toBeGreaterThan(-1);
    expect(on).toBeLessThan(g.indexOf('this.quota.acquire('));
    expect(on).toBeLessThan(g.indexOf('provider.applyAction('));
    const o = govde('onizle');
    expect(o).toContain('await this.onKontrol(ctx, hedef, eylem)');
    expect(o).not.toContain('provider.applyAction(');
    expect(o).not.toContain('this.quota.acquire(');
  });

  it('KRİTİK: Google Video kampanyası platforma GİTMEDEN reddediliyor (MUTATE_NOT_ALLOWED, canlıda 2026-10-10)', () => {
    const g = govde('onKontrol');
    const ret = g.indexOf('if (googleYazilamazMi(row.platform, row.kampanyaKanali)) {');
    expect(ret, 'Video koruması yok').toBeGreaterThan(-1);
    // Kanal varlığın KAMPANYASINDAN okunuyor (set ve reklam için de).
    expect(KOD).toContain('(SELECT k.objective FROM campaigns k WHERE k.id = g.campaign_id)');
  });

  it('KRİTİK: Meta ve Google kendi şalterini okuyor', () => {
    expect(KOD).toContain("if (platform === 'meta') return metaYazmaAcikMi(tx, clientId);");
    expect(KOD).toContain("if (platform === 'google') return googleYazmaAcikMi(tx, clientId);");
  });
});
