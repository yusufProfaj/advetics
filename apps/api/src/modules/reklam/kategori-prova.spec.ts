import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { KATEGORI_PROVA_NOTU, derleMeta, provaGovdeleri, provaNotu, type OzelKategori } from '@advetics/shared';

/**
 * ÖZEL KATEGORİLİ META PROVASI (AdvCampaign Ö-7, canlı tur 2, 2026-10-10).
 *
 * Satır içi `campaign_spec` içindeki `special_ad_categories`i Meta her
 * biçimde `got "2"` ile reddediyor (`meta-kategori-prova` ile ölçüldü);
 * kampanya kendi ucunda kategoriyle geçiyor. Kural: kampanya provası
 * kategoriyi TAŞIR, satır içi kampanya taşımaz ve o parçalar geçerse
 * kapsama notu ekranda söylenir.
 */
const VARLIK = '66666666-0000-4000-8000-000000000001';

function govdeler(kategori: OzelKategori[]) {
  const r = derleMeta({
    apiSurumu: 'v25.0', yayinKimligi: 'p-1234', tarih: '2026-10-10', workspaceKisaAdi: 'Ö', niyet: 'SITE',
    hesap: { platformId: 'act_1', paraBirimi: 'TRY' }, sayfaPlatformId: '111', instagramPlatformId: null,
    hedefleme: { konumlar: [{ tur: 'country', key: 'TR', etiket: 'TR', ulkeKodu: 'TR' }], enDusukYas: 18, ipucuYas: null, ipucuCinsiyet: null },
    kategoriler: { taban: [], ek: kategori }, butce: { tip: 'gunluk', micros: 250_000_000n, seviye: 'kampanya' },
    takvim: { baslangic: '2026-10-11T00:00:00+0300', bitis: null }, atif: 'tik7',
    kavramlar: [
      { gorselHash: `{medya:${VARLIK}}`, baslik: 'B1', metin: 'M1' },
      { gorselHash: `{medya:${VARLIK}}`, baslik: 'B2', metin: 'M2' },
    ],
    hedefAdres: 'https://ornek.com.tr', formId: null, urlEtiketleri: null,
  });
  if (r.tur !== 'govde') throw new Error(`derlenemedi: ${JSON.stringify(r)}`);
  return provaGovdeleri(r.govdeler, new Map([[VARLIK, 'HASH']]));
}

type Spec = Record<string, unknown>;
const setSpec = (p: ReturnType<typeof govdeler>) => p.find((x) => x.nesne === 'reklam_seti')!.alanlar.campaign_spec as Spec;
const reklamSpecleri = (p: ReturnType<typeof govdeler>) =>
  p.filter((x) => x.nesne === 'reklam').map((x) => (x.alanlar.adset_spec as Spec).campaign_spec as Spec);

describe('konut kategorili prova', () => {
  const p = govdeler(['HOUSING']);

  it('kampanya provası kategoriyi ve ülkesini TAŞIYOR — Meta orada kabul ediyor', () => {
    const k = p.find((x) => x.nesne === 'kampanya')!;
    expect(k.alanlar.special_ad_categories).toEqual(['HOUSING']);
    expect(k.alanlar.special_ad_category_country).toEqual(['TR']);
    expect(k.not).toBeUndefined();
  });

  it('reklam setinin satır içi kampanyası kategorisiz — got "2" yolu kapalı', () => {
    expect(setSpec(p).special_ad_categories).toEqual([]);
    expect(setSpec(p)).not.toHaveProperty('special_ad_category_country');
    // Kategori dışındaki her şey yerinde: bütçe ve amaç sınanmaya devam ediyor.
    expect(setSpec(p)).toMatchObject({ objective: 'OUTCOME_TRAFFIC', daily_budget: '25000' });
  });

  it('her reklamın adset_spec.campaign_spec de kategorisiz', () => {
    const specler = reklamSpecleri(p);
    expect(specler).toHaveLength(2);
    for (const s of specler) {
      expect(s.special_ad_categories).toEqual([]);
      expect(s).not.toHaveProperty('special_ad_category_country');
    }
  });

  it('kategorisi çıkarılan her parça kapsama notunu taşıyor', () => {
    const notlu = p.filter((x) => x.not === KATEGORI_PROVA_NOTU).map((x) => x.nesne);
    expect(notlu).toEqual(['reklam_seti', 'reklam', 'reklam']);
  });

  it('prova gövdelerinde çözülmemiş kampanya kimliği yok', () => {
    // Prova dönüşümü derleyicinin çıktısını değiştirmemeli; kurulum kategoriyi
    // kampanyada ve campaign_id ile taşıyor.
    expect(JSON.stringify(p)).not.toMatch(/"campaign_id"/);
  });
});

describe('kategorisiz prova değişmedi', () => {
  const p = govdeler([]);
  it('satır içi kampanya kampanyanın kendisiyle aynı, not yok', () => {
    const { adlabels: _a, status: _s, execution_options: _e, ...kampanya } = p.find((x) => x.nesne === 'kampanya')!.alanlar;
    expect(setSpec(p)).toEqual(kampanya);
    expect(p.every((x) => x.not === undefined)).toBe(true);
  });
});

describe('provaNotu', () => {
  it('tekrar eden notu bir kez yazar, not yoksa null', () => {
    expect(provaNotu([{ not: 'A' }, {}, { not: 'A' }, { not: 'B' }])).toBe('A B');
    expect(provaNotu([{}, { not: null }])).toBeNull();
  });
});

describe('not ekrana kadar taşınıyor (kaynak taraması)', () => {
  const yorumsuz = (f: string) =>
    readFileSync(join(__dirname, f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');

  it('prova işleyicisi geçen parçaya gövdenin notunu iliştiriyor', () => {
    const k = yorumsuz('prova-isleyici.ts');
    const satir = k.split('\n').find((l) => l.includes("sonuc: 'gecti'") && l.includes('ad: g.ad'));
    if (!satir) throw new Error('geçti satırı bulunamadı');
    expect(satir).toContain('g.not');
  });

  it('rehber Meta sonucunu provaNotu ile kuruyor — iki yolda da (prova + sayfa yenileme)', () => {
    const k = yorumsuz('rehber/rehber.service.ts');
    expect(k.match(/provaNotu\(/g)?.length).toBe(2);
    expect(k).not.toMatch(/tur: 'gecti', zaman(: new Date\(\)\.toISOString\(\))?, not: null/);
  });
});
