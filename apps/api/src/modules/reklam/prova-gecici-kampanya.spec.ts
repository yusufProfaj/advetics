import { describe, expect, it } from 'vitest';
import { setiGeciciKampanyaylaDogrula } from './prova-isleyici';
import { MetaBelirsizHata, MetaKesinHata } from './yayin-motoru';

/**
 * Reklam seti GEÇİCİ kampanyaya karşı doğrulanıyor (canlı ölçüm,
 * 2026-10-11): satır içi `campaign_spec`li set provası her biçimde 5xx
 * dönüyordu ve atıf (1, 0) ile konutlu şehir yarıçapı (#2909052) provada
 * "geçti", kurulumda RET aldı.
 */
const GOVDELER = [
  { ad: 'kampanya', alanlar: { name: 'Gerçek ad', objective: 'OUTCOME_LEADS', special_ad_categories: ['HOUSING'], status: 'PAUSED', adlabels: [{ name: 'adv-yayin-x' }] } },
  { ad: 'reklam_seti', alanlar: { name: 'Set', campaign_id: '{kampanya}', attribution_spec: [{ event_type: 'CLICK_THROUGH', window_days: 1 }], adlabels: [{ name: 'adv-yayin-x' }] } },
];

function sahtePort(o: { dogrula?: () => Promise<void>; sil?: () => Promise<void>; olustur?: () => Promise<{ id: string }> } = {}) {
  const cagrilar: Array<[string, unknown]> = [];
  return {
    cagrilar,
    port: {
      olustur: async (_h: string, uc: string, alanlar: Record<string, unknown>) => {
        cagrilar.push([`olustur:${uc}`, alanlar]);
        return o.olustur ? o.olustur() : { id: 'GECICI1' };
      },
      dogrula: async (_h: string, uc: string, alanlar: Record<string, unknown>) => {
        cagrilar.push([`dogrula:${uc}`, alanlar]);
        if (o.dogrula) await o.dogrula();
      },
      durumYaz: async (id: string, alanlar: { status: string }) => {
        cagrilar.push([`durum:${id}`, alanlar]);
        if (o.sil) await o.sil();
      },
    },
  };
}

describe('setiGeciciKampanyaylaDogrula', () => {
  it('KRİTİK: set GERÇEK geçici kampanyaya karşı validate_only ile sorulur, kampanya SİLİNİR', async () => {
    const { port, cagrilar } = sahtePort();
    const r = await setiGeciciKampanyaylaDogrula(port, 'act_1', GOVDELER);
    expect(r).toEqual({ ad: 'reklam_seti', sonuc: 'gecti' });
    const [olustur, dogrula, sil] = cagrilar;
    expect(olustur![0]).toBe('olustur:campaigns');
    // Kategori taşınıyor (konut kuralını Meta ancak o zaman denetliyor),
    // etiket ve ad prova kampanyasınınki, durum duraklatılmış.
    expect(olustur![1]).toMatchObject({ special_ad_categories: ['HOUSING'], status: 'PAUSED', adlabels: [{ name: 'adv-prova' }] });
    expect(dogrula).toEqual(['dogrula:adsets', expect.objectContaining({ campaign_id: 'GECICI1', execution_options: ['validate_only'] })]);
    expect((dogrula![1] as Record<string, unknown>).adlabels).toBeUndefined();
    expect(sil).toEqual(['durum:GECICI1', { status: 'DELETED' }]);
  });

  it('KRİTİK: Meta seti reddederse sonuç REDDEDİLDİ ve kampanya yine silinir', async () => {
    const { port, cagrilar } = sahtePort({ dogrula: async () => { throw new MetaKesinHata('desteklenen değerler 1 günlük', 100, 1885423); } });
    const r = await setiGeciciKampanyaylaDogrula(port, 'act_1', GOVDELER);
    expect(r).toMatchObject({ sonuc: 'reddedildi', kod: 100, altKod: 1885423 });
    expect(cagrilar.at(-1)).toEqual(['durum:GECICI1', { status: 'DELETED' }]);
  });

  it('silme düşerse sonuç değişmez ama ekranda söylenir; açılamazsa belirsiz', async () => {
    const a = await setiGeciciKampanyaylaDogrula(sahtePort({ sil: async () => { throw new MetaBelirsizHata('ağ'); } }).port, 'act_1', GOVDELER);
    expect(a.sonuc).toBe('gecti');
    expect(a.not).toMatch(/silinemedi/);
    const b = await setiGeciciKampanyaylaDogrula(sahtePort({ olustur: async () => { throw new MetaKesinHata('izin yok'); } }).port, 'act_1', GOVDELER);
    expect(b).toMatchObject({ sonuc: 'dogrulanamadi' });
  });
});

describe('provaKos çağırıyor (bir fonksiyonu test etmek ÇAĞRILDIĞINI test etmiyor)', () => {
  it('KRİTİK: belirsiz set sonucu kapsama kuralından ÖNCE geçici kampanyayla yeniden soruluyor', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const kaynak = readFileSync(join(__dirname, 'prova-isleyici.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const govde = kaynak.slice(kaynak.indexOf('export async function provaKos('));
    expect(govde.length, 'provaKos gövdesi bulunamadı').toBeGreaterThan(500);
    const cagri = govde.indexOf('await setiGeciciKampanyaylaDogrula(port, hesap, d.derleme.govdeler)');
    expect(cagri).toBeGreaterThan(0);
    expect(cagri).toBeLessThan(govde.indexOf('sonuclar = kapsamaUygula(sonuclar)'));
  });
});
