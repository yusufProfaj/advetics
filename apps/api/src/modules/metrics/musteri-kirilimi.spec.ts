import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MetricsClientRow, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * ═══ MÜŞTERİ KIRILIMI — "TÜM MÜŞTERİLER" GÖRÜNÜMÜ ═══
 *
 * En kritik iddia yine ÇİFT SAYIM etrafında ve burada daha da tehlikeli:
 * `insights_daily` aynı harcamayı DÖRT seviyede tutuyor (hesap, kampanya, ad
 * set, reklam). Bu ekran müşteri müşteri harcama gösteriyor, yani seviye
 * filtresi kaybolursa ajans HER MÜŞTERİYE dört katı harcama raporlar ve hata
 * hiçbir yere hata olarak düşmez.
 *
 * İkinci grup PLATFORM DAĞILIMI: ekranın istenme sebebi "Meta'ya ve Google'a
 * ne kadar harcadı" ve dağılım toplamı müşteri toplamına EŞİT olmak zorunda.
 * İkisi ayrı hesaplanırsa aynı satırda iki farklı gerçek yazar.
 */
let h: Harness;
let svc: MetricsService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const MUSTERI_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HESAP_B = 'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb';
const KAMPANYA_A = '66666666-6666-6666-6666-666666666666';
const GRUP_A = '77777777-7777-7777-7777-777777777777';
const REKLAM_A = '88888888-8888-8888-8888-888888888888';
const KAMPANYA_B = '99999999-9999-9999-9999-999999999999';

/** Aynı harcamayı DÖRT seviyeye de yazar — platformun yaptığı şey bu. */
async function metrikYaz(p: {
  clientId: string;
  adAccountId: string;
  platform: 'meta' | 'google';
  campaignId: string;
  date: string;
  spendMicros: string;
  impressions?: number;
  clicks?: number;
  conversions?: number;
  currency?: string;
  /** Yalnızca kampanya seviyesi yaz — hesap/grup/reklam satırı üretme. */
  yalnizKampanya?: boolean;
}): Promise<void> {
  const seviyeler: Array<[string, string, string]> = p.yalnizKampanya
    ? [['campaign', p.campaignId, 'c']]
    : [
        ['account', p.adAccountId, 'act'],
        ['campaign', p.campaignId, 'c'],
        ['ad_group', GRUP_A, 'g'],
        ['ad', REKLAM_A, 'a'],
      ];
  for (const [level, entityId, externalId] of seviyeler) {
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach)
       VALUES ($1,$2,$3::"Platform",$4::"EntityLevel",$5,$6,$7::date,'',$8,$9,$10,$11,0,$12,0)`,
      [
        p.clientId,
        p.adAccountId,
        p.platform,
        level,
        entityId,
        externalId,
        p.date,
        p.impressions ?? 100,
        p.clicks ?? 10,
        p.spendMicros,
        p.conversions ?? 1,
        p.currency ?? 'TRY',
      ],
    );
  }
}

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => h.close());

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  // İkinci müşteri ve onun kendi reklam hesabı — bu ekranın konusu tam olarak
  // birden çok müşteriyi YAN YANA göstermek.
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'B Firması', 'b-firmasi', now())`,
    [MUSTERI_B, IDS.org],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,'google','g-1','B hesabı','TRY','Europe/Istanbul',true,now())`,
    [HESAP_B, IDS.org, MUSTERI_B, IDS.connection],
  );
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'meta','c1','A Kampanya','active','daily',now())`,
    [KAMPANYA_A, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ad_groups (id, campaign_id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,$4,'meta','g1','A Set','active','none',now())`,
    [GRUP_A, KAMPANYA_A, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO ads (id, ad_group_id, ad_account_id, client_id, platform, external_id, name, status, updated_at)
     VALUES ($1,$2,$3,$4,'meta','a1','A Reklam','active',now())`,
    [REKLAM_A, GRUP_A, IDS.adAccount, IDS.client],
  );
  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'google','c2','B Kampanya','active','daily',now())`,
    [KAMPANYA_B, HESAP_B, MUSTERI_B],
  );

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (!ctx?.orgId || !ctx?.userId) throw new Error('Tenant bağlamı olmadan sorgu');
      return fn(h.db);
    },
  } as unknown as PrismaService;
  svc = new MetricsService(prisma);
});

const ARALIK = { from: '2026-08-01', to: '2026-08-31' } as const;

function bul(rows: MetricsClientRow[], ad: string): MetricsClientRow {
  const r = rows.find((x) => x.name === ad);
  if (!r) throw new Error(`${ad} satırı yok — testin dayanağı kayboldu`);
  return r;
}

describe('müşteri kırılımı — çift sayım koruması', () => {
  it('REGRESYON: dört seviyeye yazılmış harcamayı BİR kez sayar', async () => {
    /*
     * Seviye filtresi kaybolursa 4× çıkıyor ve hiçbir hata düşmüyor: panel
     * müşteriye dört katı harcama raporlar. Bu ekran müşteri müşteri para
     * gösterdiği için hatanın maliyeti doğrudan.
     */
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '7612190000',
    });

    const rows = await svc.byClient(CTX, ARALIK);
    expect(bul(rows, 'Müşteri').spendMicros).toBe('7612190000');
  });

  it('birden çok gün TOPLANIYOR', async () => {
    for (const d of ['2026-08-05', '2026-08-06']) {
      await metrikYaz({
        clientId: IDS.client,
        adAccountId: IDS.adAccount,
        platform: 'meta',
        campaignId: KAMPANYA_A,
        date: d,
        spendMicros: '1000000',
      });
    }
    expect(bul(await svc.byClient(CTX, ARALIK), 'Müşteri').spendMicros).toBe('2000000');
  });

  it('aralık DIŞINDAKİ gün sayılmıyor', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-09-05',
      spendMicros: '5000000',
    });
    expect(bul(await svc.byClient(CTX, ARALIK), 'Müşteri').spendMicros).toBe('0');
  });
});

describe('müşteri ayrımı', () => {
  beforeEach(async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '3000000',
    });
    await metrikYaz({
      clientId: MUSTERI_B,
      adAccountId: HESAP_B,
      platform: 'google',
      campaignId: KAMPANYA_B,
      date: '2026-08-05',
      spendMicros: '1000000',
      yalnizKampanya: true,
    });
  });

  it('her müşterinin harcaması KENDİ satırında', async () => {
    // İki müşterinin verisi karışırsa ajans yanlış müşteriye fatura okur.
    const rows = await svc.byClient(CTX, ARALIK);
    expect(bul(rows, 'Müşteri').spendMicros).toBe('3000000');
    expect(bul(rows, 'B Firması').spendMicros).toBe('1000000');
  });

  it('sıralama HARCAMAYA göre — en çok harcayan üstte', async () => {
    const rows = await svc.byClient(CTX, ARALIK);
    expect(rows.map((r) => r.name).slice(0, 2)).toEqual(['Müşteri', 'B Firması']);
  });

  it('HARCAMASI OLMAYAN müşteri listeden DÜŞMÜYOR', async () => {
    /*
     * "Hesabı var, harcaması yok" bu ekranın cevaplaması gereken bir hâl.
     * Satırı düşürmek onu "böyle bir müşteri yok" ile aynı gösterirdi ve
     * ajans o müşterinin durduğunu hiç fark etmezdi.
     */
    await h.q(
      `INSERT INTO clients (id, org_id, name, slug, updated_at)
       VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', $1, 'Sessiz', 'sessiz', now())`,
      [IDS.org],
    );
    const rows = await svc.byClient(CTX, ARALIK);
    const sessiz = bul(rows, 'Sessiz');
    expect(sessiz.spendMicros).toBe('0');
    expect(sessiz.adAccountCount).toBe(0);
  });

  it('ARŞİVLENMİŞ müşteri listede yok', async () => {
    await h.q(`UPDATE clients SET status = 'archived' WHERE id = $1`, [MUSTERI_B]);
    const rows = await svc.byClient(CTX, ARALIK);
    expect(rows.map((r) => r.name)).not.toContain('B Firması');
  });
});

describe('platform dağılımı', () => {
  it('Meta ve Google AYRI satırlarda ve toplamları müşteri toplamına EŞİT', async () => {
    /*
     * Ekranın istenme sebebi bu. Dağılım ile toplam ayrı hesaplanırsa aynı
     * satırda iki farklı gerçek yazar; toplam dağılımdan TÜRETİLİYOR.
     */
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '3000000',
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'google',
      campaignId: KAMPANYA_A,
      date: '2026-08-06',
      spendMicros: '1000000',
      yalnizKampanya: true,
    });

    const r = bul(await svc.byClient(CTX, ARALIK), 'Müşteri');
    expect(r.spendMicros).toBe('4000000');

    const toplam = r.byPlatform.reduce((a, p) => a + BigInt(p.spendMicros), 0n);
    expect(toplam.toString()).toBe(r.spendMicros);
    expect(r.byPlatform.map((p) => p.platform)).toEqual(['meta', 'google']);
    expect(r.byPlatform[0]!.spendMicros).toBe('3000000');
  });

  it('VERİSİ OLMAYAN platform hiç yazılmıyor', async () => {
    /*
     * Sıfırlı bir Google satırı basmak, Google'a hiç bağlı olmayan müşteride
     * "Google 0 ₺" yazmak demek ve o, "bağlı ama harcamıyor" ile "hiç bağlı
     * değil" hâllerini aynı gösterirdi.
     */
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '3000000',
    });
    expect(bul(await svc.byClient(CTX, ARALIK), 'Müşteri').byPlatform).toHaveLength(1);
  });
});

describe('para birimi', () => {
  it('tek para birimi satırda yazılı', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '1000000',
      currency: 'TRY',
    });
    const r = bul(await svc.byClient(CTX, ARALIK), 'Müşteri');
    expect(r.currency).toBe('TRY');
    expect(r.currencies).toEqual(['TRY']);
  });

  it('KARIŞIK para birimi gizlenmiyor — currency null', async () => {
    /*
     * 1 USD + 1 TRY = 2 ne? Kur çevrimi yok. `null` dönmek panele "tutar
     * yerine uyarı göster" demek; sessizce toplamak ekranda anlamı olmayan
     * bir sayı üretirdi. Özet ucundaki kuralın aynısı.
     */
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '1000000',
      currency: 'TRY',
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-06',
      spendMicros: '1000000',
      currency: 'USD',
      yalnizKampanya: true,
    });
    const r = bul(await svc.byClient(CTX, ARALIK), 'Müşteri');
    expect(r.currency).toBeNull();
    expect(r.currencies).toEqual(['TRY', 'USD']);
  });
});

describe('izlenmeyen hesap', () => {
  it('izlemesi KAPALI hesabın harcaması sayılmıyor', async () => {
    // `sync_enabled = false` "bu müşteriyle çalışmayı bıraktık" demek ve o
    // harcamanın toplama karışması yanlış bir tablo gösterir.
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '9000000',
    });
    await h.q(`UPDATE ad_accounts SET sync_enabled = false WHERE id = $1`, [IDS.adAccount]);
    const r = bul(await svc.byClient(CTX, ARALIK), 'Müşteri');
    expect(r.spendMicros).toBe('0');
    expect(r.adAccountCount).toBe(0);
  });
});

describe('önceki dönem', () => {
  it('karşılaştırma istenmediğinde previous NULL', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '1000000',
    });
    expect(bul(await svc.byClient(CTX, ARALIK), 'Müşteri').previous).toBeNull();
  });

  it('önceki dönemde veri VARSA doluyor, YOKSA null kalıyor', async () => {
    /*
     * Sıfırlı bir nesne döndürmek her yeni müşteriyi "-%100" gösterirdi.
     * Panelde yeni açılmış bir müşterinin battığını söylemek, doğru
     * çalışırken yanlış karar aldıran gösterimin ta kendisi.
     */
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-07-15',
      spendMicros: '4000000',
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '1000000',
      yalnizKampanya: true,
    });
    await metrikYaz({
      clientId: MUSTERI_B,
      adAccountId: HESAP_B,
      platform: 'google',
      campaignId: KAMPANYA_B,
      date: '2026-08-05',
      spendMicros: '1000000',
      yalnizKampanya: true,
    });

    const rows = await svc.byClient(CTX, {
      ...ARALIK,
      compareFrom: '2026-07-01',
      compareTo: '2026-07-31',
    });
    expect(bul(rows, 'Müşteri').previous?.spendMicros).toBe('4000000');
    // B'nin temmuzda hiç verisi yok — sıfır değil, YOK.
    expect(bul(rows, 'B Firması').previous).toBeNull();
  });
});

describe('platform süzgeci', () => {
  it('tek platform seçilince yalnızca o platform sayılıyor', async () => {
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'meta',
      campaignId: KAMPANYA_A,
      date: '2026-08-05',
      spendMicros: '3000000',
    });
    await metrikYaz({
      clientId: IDS.client,
      adAccountId: IDS.adAccount,
      platform: 'google',
      campaignId: KAMPANYA_A,
      date: '2026-08-06',
      spendMicros: '1000000',
      yalnizKampanya: true,
    });
    const r = bul(await svc.byClient(CTX, { ...ARALIK, platform: 'google' }), 'Müşteri');
    expect(r.spendMicros).toBe('1000000');
    expect(r.byPlatform.map((p) => p.platform)).toEqual(['google']);
  });
});
