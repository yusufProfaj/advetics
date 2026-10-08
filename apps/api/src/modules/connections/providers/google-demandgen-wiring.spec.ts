import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demandGenAtomikIstek } from './google-demandgen';

/**
 * DEMAND GEN — ATOMİK İSTEK KAYNAKTA VE ÇALIŞTIRILARAK BAĞLI MI?
 *
 * Eski hâl yedi ayrı çağrı ve elle geri almaydı; bu dosya o zinciri kaynakta
 * tarıyordu. Zincir tek atomik isteğe indi (`demandGenAtomikIstek`) ve
 * istek artık ÇALIŞTIRILARAK sınanıyor (`youtube-yayin-sirasi.spec.ts`).
 * Burada kalan iki kilit: (1) yayın ve prova AYNI üreticiden geçiyor,
 * (2) üretici gövdeleri sınanmış Demand Gen kurucularından alıyor — arama
 * kampanyasının kurucusu yanlışlıkla kullanılsa kampanya SEARCH açılır ve
 * YouTube'da hiç görünmezdi.
 */
const SOURCE = readFileSync(join(__dirname, 'google.provider.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

function govde(bas: string): string {
  const i0 = SOURCE.indexOf(bas);
  if (i0 < 0) throw new Error(`${bas} bulunamadı — tarama boşa düşer`);
  // Gövdenin açılışı imzanın SONUNDAKİ "> {" ya da ") {": dönüş tipi de süslü
  // parantez taşıyor ve ilk "{"i almak gövde yerine tipi yakalardı.
  const m = /[>)] \{\n/.exec(SOURCE.slice(i0));
  if (!m) throw new Error(`${bas} gövdesi bulunamadı`);
  const i = i0 + m.index + 2;
  let d = 0;
  for (let j = i; j < SOURCE.length; j++) {
    if (SOURCE[j] === '{') d++;
    else if (SOURCE[j] === '}') {
      d--;
      if (d === 0) return SOURCE.slice(i, j + 1);
    }
  }
  throw new Error('gövde kapanmadı');
}

const YAYIN = govde('  async createVideoBoost(');
const PROVA = govde('  async videoBoostProva(');

describe('yayın ve prova AYNI istek', () => {
  it('tarama boşa düşmüyor', () => {
    expect(YAYIN.length).toBeGreaterThan(300);
    expect(PROVA.length).toBeGreaterThan(100);
  });

  it('KRİTİK: ikisi de aynı gövde üreticisinden, yalnızca bayrak farklı', () => {
    expect(YAYIN).toMatch(/this\.videoBoostGovdesi\([^)]*,\s*false\)/);
    expect(PROVA).toMatch(/this\.videoBoostGovdesi\([^)]*,\s*true\)/);
  });

  it('KRİTİK: yayın tek atomik istek — ayrı ayrı mutate ve geri alma YOK', () => {
    expect(YAYIN).toContain('this.mutateAtomik(');
    expect(YAYIN).not.toContain('this.mutate(');
    expect(YAYIN).not.toContain('removeBody');
  });

  it('bitiş tarihi SÜREDEN türetiliyor', () => {
    const uretici = govde('  private videoBoostGovdesi(');
    expect(uretici).toMatch(/endDate: googleDate\(new Date\(Date\.now\(\) \+ r\.durationDays \* 86_400_000\)\)/);
  });
});

describe('üretici Demand Gen gövdelerini kullanıyor', () => {
  const { govde: g } = demandGenAtomikIstek({
    customerId: '1',
    name: 'n',
    stamp: '2026-10-08 10:00',
    dailyBudgetMicros: 1n,
    endDate: '2026-10-11',
    acilis: 'ENABLED',
    konumlar: ['geoTargetConstants/2792'],
    yaslar: [],
    videoId: 'abcdefghijk',
    videoTitle: 't',
    logo: { resource: 'customers/1/assets/9' },
    businessName: 'b',
    finalUrl: 'https://x.com',
    headlines: ['h'],
    longHeadlines: ['l'],
    descriptions: ['d'],
    validateOnly: false,
  });
  const create = (tur: string) =>
    (g.mutateOperations.find((o) => tur in o)?.[tur] as { create: Record<string, unknown> }).create;

  it('KRİTİK: kampanya DEMAND_GEN, alt tür yok, Maksimum Tıklama, AB beyanı', () => {
    expect(create('campaignOperation')).toMatchObject({
      advertisingChannelType: 'DEMAND_GEN',
      targetSpend: {},
      containsEuPoliticalAdvertising: 'DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING',
      endDateTime: '2026-10-11 23:59:59',
    });
    expect(create('campaignOperation').advertisingChannelSubType).toBeUndefined();
  });

  it('reklam Demand Gen video reklamı; video YOUTUBE_VIDEO varlığı', () => {
    expect(create('adGroupAdOperation').ad).toHaveProperty('demandGenVideoResponsiveAd');
    expect(create('assetOperation')).toMatchObject({ type: 'YOUTUBE_VIDEO', youtubeVideoAsset: { youtubeVideoId: 'abcdefghijk' } });
  });

  it('grup kanalları açıkça: YouTube üçü açık, Discover/Gmail/Display kapalı', () => {
    expect(create('adGroupOperation')).toMatchObject({
      demandGenAdGroupSettings: {
        channelControls: {
          selectedChannels: { youtubeInStream: true, youtubeInFeed: true, youtubeShorts: true, discover: false, gmail: false, display: false },
        },
      },
    });
  });
});
