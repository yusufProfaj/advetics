import { describe, expect, it } from 'vitest';
import {
  buildDraftTree,
  moneyToMicros,
  supportsGoal,
  type SimpleDraftInput,
} from '@advetics/shared';

/**
 * Basit yüzeyin ağaç üreticisi.
 *
 * `goal-mapping.spec.ts` ile aynı sınıfta: bir eşleme hatası SESSİZ. Kampanya
 * kurulur, yanlış amaçla yayınlanır ve para harcar; hata mesajı yok.
 */

const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACC_META = '44444444-4444-4444-4444-444444444444';
const ACC_GOOGLE = '55555555-5555-5555-5555-555555555555';
const PAGE = '66666666-6666-6666-6666-666666666666';
const CREATIVE = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';

const NOW = new Date('2026-08-16T12:00:00.000Z');

function input(patch: Partial<SimpleDraftInput> = {}): SimpleDraftInput {
  return {
    clientId: CLIENT,
    name: 'Yaz Kampanyası',
    goal: 'whatsapp',
    targets: [{ platform: 'meta', adAccountId: ACC_META, dailyBudget: '200' }],
    socialProfileId: PAGE,
    creativeId: CREATIVE,
    durationDays: 7,
    ...patch,
  };
}

describe('tek platform', () => {
  it('bir kampanya, bir grup, bir reklam', () => {
    const plan = buildDraftTree(input(), NOW);

    expect(plan.blockers).toEqual([]);
    expect(plan.campaigns).toHaveLength(1);
    expect(plan.groupRequired).toBe(false);

    const c = plan.campaigns[0]!;
    expect(c.adGroups).toHaveLength(1);
    expect(c.adGroups[0]!.ads).toHaveLength(1);
    expect(c.adGroups[0]!.ads[0]!.creativeId).toBe(CREATIVE);
  });

  it('KRİTİK: hedefin Meta karşılığı doğru eşleniyor', () => {
    /**
     * WhatsApp'ta `CONVERSATIONS` optimizasyonu, `LINK_CLICKS` değil: tıklayıp
     * WhatsApp'ı kapatan değil GERÇEKTEN yazan kişi optimize ediliyor. Fark
     * büyük ve bu, ajansın en çok kullanacağı tip.
     */
    const c = buildDraftTree(input({ goal: 'whatsapp' }), NOW).campaigns[0]!;
    expect(c.settings).toEqual({ objective: 'OUTCOME_LEADS' });
    expect(c.adGroups[0]!.settings).toMatchObject({
      optimizationGoal: 'CONVERSATIONS',
      billingEvent: 'IMPRESSIONS',
      destinationType: 'WHATSAPP',
    });
  });

  it('site hedefi LANDING_PAGE_VIEWS ile eşleniyor', () => {
    // `LINK_CLICKS` tıklamayı sayıyor, sayfanın açılmasını değil.
    const c = buildDraftTree(
      input({ goal: 'website', linkUrl: 'https://site.com' }),
      NOW,
    ).campaigns[0]!;
    expect(c.settings).toEqual({ objective: 'OUTCOME_TRAFFIC' });
    expect(c.adGroups[0]!.settings).toMatchObject({
      optimizationGoal: 'LANDING_PAGE_VIEWS',
      linkUrl: 'https://site.com',
    });
  });

  it('bütçe kampanya seviyesinde ve micros', () => {
    const c = buildDraftTree(input({ targets: [{ platform: 'meta', adAccountId: ACC_META, dailyBudget: '250,50' }] }), NOW)
      .campaigns[0]!;
    expect(c.budgetMode).toBe('daily');
    expect(c.budgetAmountMicros).toBe('250500000');
  });

  it('süresiz kampanyada bitiş YOK', () => {
    // 0 = süresiz ve Meta'ya `end_time` gönderilmiyor.
    expect(buildDraftTree(input({ durationDays: 0 }), NOW).campaigns[0]!.endAt).toBeNull();
  });

  it('süre bitiş tarihine çevriliyor', () => {
    expect(buildDraftTree(input({ durationDays: 7 }), NOW).campaigns[0]!.endAt).toBe(
      '2026-08-23T12:00:00.000Z',
    );
  });
});

describe('iki platform — K13', () => {
  it('site hedefinde İKİ kampanya ve ortak grup gerekiyor', () => {
    const plan = buildDraftTree(
      input({
        goal: 'website',
        linkUrl: 'https://site.com',
        targets: [
          { platform: 'meta', adAccountId: ACC_META, dailyBudget: '200' },
          { platform: 'google', adAccountId: ACC_GOOGLE, dailyBudget: '150' },
        ],
      }),
      NOW,
    );

    // Google için `website` hedefi 'not_yet': karşılığı var, kodu yok. Bu
    // yüzden kampanya kurulmuyor ama SEBEBİ dönüyor.
    expect(plan.campaigns.map((c) => c.platform)).toEqual(['meta']);
    expect(plan.skipped).toEqual([
      {
        platform: 'google',
        support: 'not_yet',
        reason: expect.stringContaining('henüz yazılmadı'),
      },
    ]);
  });

  it('BÜTÇE PLATFORM BAŞINA — bölme uydurulmuyor', () => {
    /**
     * "Günde 200 ₺"yi ikiye bölmek kullanıcının kararı. Uydurmak, hesabın
     * varsayılanına güvenmekle aynı hata sınıfı: aynı kod iki müşteride
     * farklı davranır.
     */
    const plan = buildDraftTree(
      input({
        goal: 'website',
        linkUrl: 'https://site.com',
        targets: [{ platform: 'meta', adAccountId: ACC_META, dailyBudget: '120' }],
      }),
      NOW,
    );
    expect(plan.campaigns[0]!.budgetAmountMicros).toBe('120000000');
  });
});

describe('desteklenmeyen hedef SESSİZCE elenmiyor — K15', () => {
  it('WhatsApp Google\'da "hiç olmayacak" diyor', () => {
    const fit = supportsGoal('google', 'whatsapp');
    expect(fit.support).toBe('never');
    expect(fit.reason).toContain('yok');
  });

  it('site Google\'da "henüz" diyor — ikisi FARKLI cümle', () => {
    /**
     * "Henüz yok" ile "hiç olmayacak"ı aynı göstermek, kullanıcının asla
     * gelmeyecek bir şeyi beklemesi demek.
     */
    expect(supportsGoal('google', 'website').support).toBe('not_yet');
    expect(supportsGoal('google', 'whatsapp').support).toBe('never');
  });

  it('hiçbir platform hedefi desteklemiyorsa ENGEL veriliyor', () => {
    const plan = buildDraftTree(
      input({
        goal: 'whatsapp',
        targets: [{ platform: 'google', adAccountId: ACC_GOOGLE, dailyBudget: '100' }],
      }),
      NOW,
    );
    expect(plan.campaigns).toHaveLength(0);
    expect(plan.blockers).toHaveLength(1);
    expect(plan.skipped[0]!.support).toBe('never');
  });
});

describe('engeller', () => {
  it('site hedefi adressiz kurulamıyor', () => {
    const plan = buildDraftTree(input({ goal: 'website', linkUrl: undefined }), NOW);
    expect(plan.blockers.join(' ')).toContain('Web sitesi adresi eksik');
  });

  it('KRİTİK: Meta sayfası olmadan kampanya kurulmuyor', () => {
    // Reklam her zaman bir Facebook sayfası adına yayınlanıyor; sayfasız
    // taslak yayın anında düşer ve mesaj yetki sorunu gibi okunur.
    const plan = buildDraftTree(input({ socialProfileId: undefined }), NOW);
    expect(plan.campaigns).toHaveLength(0);
    expect(plan.blockers.join(' ')).toContain('Facebook sayfası');
  });
});

describe('moneyToMicros', () => {
  it('float\'a hiç dönüşmüyor', () => {
    // `constants/platforms.ts` içindeki toMicros float çarpıyor:
    // 0.29 * 1e6 = 289999.99999999994. Para BigInt olarak saklanıyor.
    expect(moneyToMicros('0.29')).toBe('290000');
    expect(moneyToMicros('1234.56')).toBe('1234560000');
    expect(moneyToMicros('7,5')).toBe('7500000');
  });
});
