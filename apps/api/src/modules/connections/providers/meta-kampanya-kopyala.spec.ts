import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * ═══ KAMPANYA KOPYALAMA — PLATFORMUN KENDİ UCU ═══
 *
 * `POST /{campaign_id}/copies`. Kopyayı Meta çıkarıyor; biz hedeflemeyi
 * çevirmiyoruz. Bu paket, canlıda doğrulanamayan üç kararı kilitliyor —
 * üçü de yanlış olduğunda SESSİZ:
 *
 *   1. `status_option` AÇIKÇA yazılmalı. Belge varsayılanın PAUSED olduğunu
 *      söylüyor ama varsayılan bir gün değişirse kopya YAYINA GİRER, para
 *      harcar ve hiçbir hata vermez.
 *   2. Yeni kampanya kimliği KAYBEDİLMEMELİ. Kimliksiz bir kopya,
 *      platformda var olan ama panelde hiç görünmeyen bir kampanya demek.
 *   3. Ad verilemezse kopya YİNE DE DURUYOR. Hata fırlatmak, kullanıcıya
 *      "kopyalama başarısız" dedirtir ve ikinci bir kampanya açtırır.
 */
const KAYNAK = readFileSync(join(__dirname, 'meta.provider.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const GOVDE = ((): string => {
  const i = KAYNAK.indexOf('private async copyCampaign');
  if (i === -1) throw new Error('copyCampaign bulunamadı — tarama boşa düştü');
  const j = KAYNAK.indexOf('\n  }', i);
  if (j === -1) throw new Error('gövdenin sonu bulunamadı — tarama boşa düştü');
  return KAYNAK.slice(i, j);
})();

describe('tarama boşa düşmüyor', () => {
  it('gövde yakalandı', () => {
    expect(GOVDE.length).toBeGreaterThan(500);
    expect(GOVDE).toContain('/copies');
  });
});

describe('kopya güvenliği', () => {
  it('KRİTİK: `status_option` AÇIKÇA PAUSED', () => {
    // Platformun varsayılanına güvenmek bu depoda adı konmuş bir yasak.
    expect(GOVDE).toContain("body.set('status_option', 'PAUSED')");
  });

  it('KRİTİK: derin kopya bayrağı İSTEKTEN geliyor, sabit değil', () => {
    expect(GOVDE).toContain("body.set('deep_copy', action.deepCopy ? 'true' : 'false')");
  });

  it('KRİTİK: yeni kimlik iki alandan da okunuyor', () => {
    /*
     * Belge `copied_campaign_id` diyor, Graph bazı sürümlerde düz `id`
     * döndürüyor. Kimliği kaybetmek, platformda var olan ama panelde hiç
     * görünmeyen bir kampanya demek.
     */
    expect(GOVDE).toContain('res.data.copied_campaign_id ?? res.data.id');
  });

  it('KRİTİK: kimlik gelmezse SESSİZ GEÇİLMİYOR', () => {
    expect(GOVDE).toContain('PlatformApiError');
    expect(GOVDE).toContain('Ads Manager');
  });

  it('KRİTİK: ad konulamazsa hata FIRLATILMIYOR', () => {
    // Kopya duruyor; fırlatmak kullanıcıya ikinci bir kampanya açtırırdı.
    const i = GOVDE.indexOf('if (action.name)');
    expect(i, 'ad dalı yok').toBeGreaterThan(-1);
    const dilim = GOVDE.slice(i);
    expect(dilim).toContain('catch');
    expect(dilim).toContain('adHatasi =');
    expect(dilim).not.toContain('throw');
  });

  it('kopyanın durumu çağırana PAUSED olarak dönüyor', () => {
    expect(GOVDE).toContain("status: 'paused'");
    expect(GOVDE).toContain('createdExternalId');
  });
});
