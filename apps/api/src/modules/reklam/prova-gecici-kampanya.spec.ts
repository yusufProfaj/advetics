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

/*
 * AJAN 4 (Dalga 3) — kanıt testleri.
 *
 * (1) YAZMA KAPISI GEÇİCİ KAMPANYADAN ÖNCE. Kapının kontrolü
 * (`if (!kapi.acik) return bitir(...)`) silindiğinde reklam paketinin HİÇBİR
 * testi düşmüyordu; provanın artık GERÇEK bir nesne (geçici kampanya)
 * açtığı düşünülünce bu satır, para harcamayan ama gerçek bir yazmanın tek
 * bekçisi. Kaynak taraması: kapı, ilk port çağrısından ve geçici kampanya
 * çağrısından ÖNCE kontrol ediliyor.
 */
describe('Ajan 4 · provaKos yazma kapısı', () => {
  it('KRİTİK: kapı kontrolü ilk port çağrısından ve geçici kampanyadan ÖNCE', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const kaynak = readFileSync(join(__dirname, 'prova-isleyici.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const bas = kaynak.indexOf('export async function provaKos(');
    expect(bas, 'provaKos bulunamadı').toBeGreaterThan(0);
    const govde = kaynak.slice(bas);
    const kapi = govde.indexOf("if (!kapi.acik) return bitir('dogrulanamadi', [], kapi.sebep)");
    const ilkPort = govde.search(/\bport\.[a-zA-Z]+\(/);
    const gecici = govde.indexOf('setiGeciciKampanyaylaDogrula(port');
    expect(kapi, 'kapı kontrolü bulunamadı').toBeGreaterThan(0);
    expect(ilkPort, 'port çağrısı bulunamadı').toBeGreaterThan(0);
    expect(gecici).toBeGreaterThan(0);
    expect(kapi).toBeLessThan(ilkPort);
    expect(kapi).toBeLessThan(gecici);
  });
});

/*
 * (2) BULGU — SIZAN GEÇİCİ KAMPANYA SESSİZLEŞİYOR. Geçici kampanyalı set
 * provası belirsiz kalır (5xx) VE silme düşerse `not` "silinemedi" der;
 * ama ardından `kapsamaUygula` belirsiz seti "geçti"ye çevirirken nesneyi
 * YENİDEN KURUYOR ve o notu atıyor. Sonuç: Meta'da "[Advetics prova]
 * silinecek" adlı boş bir kampanya kalıyor ve ekranda tek kelime yok.
 * `it.fails`: düzeltilince bu test kırmızıya döner; o zaman `.fails`
 * kaldırılmalı.
 */
describe('Ajan 4 · BULGU: kapsama kuralı sızıntı notunu atıyor', () => {
  it.fails('geçici kampanya silinemediyse not, kapsama kuralından sonra da kalmalı', async () => {
    const { kapsamaUygula } = await import('./prova-isleyici');
    const set = await setiGeciciKampanyaylaDogrula(
      sahtePort({ dogrula: async () => { throw new MetaBelirsizHata('5xx'); }, sil: async () => { throw new MetaBelirsizHata('ağ'); } }).port,
      'act_1',
      GOVDELER,
    );
    expect(set).toMatchObject({ sonuc: 'dogrulanamadi', not: expect.stringMatching(/silinemedi/) });
    const sonuc = kapsamaUygula([set, { ad: 'reklam:1', sonuc: 'gecti' }]);
    expect(sonuc.find((x) => x.ad === 'reklam_seti')?.not).toMatch(/silinemedi/);
  });

  // Ön koşulun kendisi (it.fails yanlış sebeple "geçmesin"): silme notu
  // kapsama kuralından ÖNCE gerçekten var.
  it('ön koşul: belirsiz set + silme düştü → sonuç belirsiz ve not "silinemedi"', async () => {
    const set = await setiGeciciKampanyaylaDogrula(
      sahtePort({ dogrula: async () => { throw new MetaBelirsizHata('5xx'); }, sil: async () => { throw new MetaBelirsizHata('ağ'); } }).port,
      'act_1',
      GOVDELER,
    );
    expect(set).toMatchObject({ sonuc: 'dogrulanamadi', not: expect.stringMatching(/silinemedi/) });
  });
});
