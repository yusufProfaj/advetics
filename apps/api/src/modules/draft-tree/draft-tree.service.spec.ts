import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SimpleDraftInput, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * DraftTreeService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * En kritik iddialar:
 *
 *   1. Basit yüzeyden gelen tek girdi, ÜÇ SEVİYELİ bir ağaç kuruyor ve geri
 *      okunabiliyor.
 *   2. Kapsam kontrolleri RLS'in yakalayamadığı hataları yakalıyor: başka
 *      müşterinin kreatifi, atanmamış hesap, platform uyuşmazlığı.
 *   3. Yazma TEK TRANSACTION — yarım ağaç kalmıyor.
 *   4. Yayınlanmış taslak silinemiyor.
 */

let h: Harness;
let svc: DraftTreeService;

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

const PAGE = '66666666-6666-6666-6666-666666666666';
const CREATIVE = 'a1a1a1a1-a1a1-a1a1-a1a1-a1a1a1a1a1a1';
const OTHER_CLIENT = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const OTHER_CREATIVE = 'b1b1b1b1-b1b1-b1b1-b1b1-b1b1b1b1b1b1';
const GOOGLE_ACC = '77777777-7777-7777-7777-777777777777';
const POOL_ACC = '88888888-8888-8888-8888-888888888888';

function input(patch: Partial<SimpleDraftInput> = {}): SimpleDraftInput {
  return {
    clientId: IDS.client,
    name: 'Yaz Kampanyası',
    goal: 'whatsapp',
    targets: [{ platform: 'meta', adAccountId: IDS.adAccount, dailyBudget: '200' }],
    socialProfileId: PAGE,
    creativeId: CREATIVE,
    durationDays: 7,
    ...patch,
  };
}

beforeAll(async () => {
  h = await createHarness();
  svc = new DraftTreeService({
    withTenant: async <T>(_c: TenantContext, fn: (tx: unknown) => Promise<T>) => fn(h.db),
  } as unknown as PrismaService);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'Diğer', 'diger', now())`,
    [OTHER_CLIENT, IDS.org],
  );
  await h.q(
    `INSERT INTO social_profiles
       (id, org_id, client_id, connection_id, profile_type, external_id, name, updated_at)
     VALUES ($1, $2, $3, $4, 'facebook_page', 'page-1', 'Sayfa', now())`,
    [PAGE, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, updated_at)
     VALUES ($1, $3, $4, $5, 'google', '1695129827', 'Google hesabı', 'TRY', 'Europe/Istanbul', now()),
            ($2, $3, NULL, $5, 'meta', 'act_pool', 'Havuz hesabı', 'TRY', 'Europe/Istanbul', now())`,
    [GOOGLE_ACC, POOL_ACC, IDS.org, IDS.client, IDS.connection],
  );
  await h.q(
    `INSERT INTO ad_creatives (id, org_id, client_id, name, texts, updated_at)
     VALUES ($1, $3, $4, 'Yaz kreatifi', '{"headlines":["Yaz indirimi"]}'::jsonb, now()),
            ($2, $3, $5, 'Başka müşterinin kreatifi', '{}'::jsonb, now())`,
    [CREATIVE, OTHER_CREATIVE, IDS.org, IDS.client, OTHER_CLIENT],
  );
});

describe('basit yüzeyden ağaç', () => {
  it('tek girdi ÜÇ SEVİYELİ ağaç kuruyor', async () => {
    const group = await svc.createFromSimple(CTX, input());

    expect(group.campaigns).toHaveLength(1);
    const c = group.campaigns[0]!;
    expect(c.platform).toBe('meta');
    expect(c.surface).toBe('simple');
    expect(c.goal).toBe('whatsapp');
    expect(c.budgetMode).toBe('daily');
    expect(c.budgetAmountMicros).toBe('200000000');
    expect(c.status).toBe('draft');

    expect(c.adGroups).toHaveLength(1);
    expect(c.adGroups[0]!.socialProfileName).toBe('Sayfa');
    expect(c.adGroups[0]!.ads).toHaveLength(1);
    expect(c.adGroups[0]!.ads[0]!.creativeName).toBe('Yaz kreatifi');
  });

  it('hedef eşlemesi veritabanına yazılıyor', async () => {
    // Eşleme hatası sessiz: kampanya kurulur, yanlış amaçla yayınlanır.
    const c = (await svc.createFromSimple(CTX, input())).campaigns[0]!;
    expect(c.settings).toEqual({ objective: 'OUTCOME_LEADS' });
    expect(c.adGroups[0]!.settings).toMatchObject({ optimizationGoal: 'CONVERSATIONS' });
  });

  it('tek platformda GRUP KİMLİĞİ YOK', async () => {
    // NULL burada "eşi yok" demek ve bu bilgi anlamlı: WhatsApp'ın Google'da
    // karşılığı yok, o taslağın hiçbir zaman ikinci platformu olmayacak.
    const group = await svc.createFromSimple(CTX, input());
    expect(group.groupId).toBeNull();
    expect(group.campaigns[0]!.groupId).toBeNull();
  });

  it('süre bitiş tarihine çevrilip yazılıyor', async () => {
    const c = (await svc.createFromSimple(CTX, input({ durationDays: 7 }))).campaigns[0]!;
    expect(c.endAt).not.toBeNull();
  });

  it('süresiz kampanyada bitiş NULL', async () => {
    const c = (await svc.createFromSimple(CTX, input({ durationDays: 0 }))).campaigns[0]!;
    expect(c.endAt).toBeNull();
  });
});

describe('KAPSAM — RLS\'in yakalayamadıkları', () => {
  it('KRİTİK: başka müşterinin kreatifi reddediliyor', async () => {
    /**
     * RLS bunu yakalamıyor: iki satır da aynı `org_id`'ye sahip ve politika
     * ikisini de geçiriyor. Bir müşterinin kreatifini diğerinin reklam
     * hesabında yayınlamak sessiz ve ciddi bir hata.
     */
    await expect(
      svc.createFromSimple(CTX, input({ creativeId: OTHER_CREATIVE })),
    ).rejects.toThrow(/başka bir müşteriye ait/i);
  });

  it('KRİTİK: atanmamış hesap için AYRI mesaj veriliyor', async () => {
    // Yapılacak şey taslağı düzeltmek değil, hesabı müşteriye atamak — mesaj
    // bunu söylemeli.
    await expect(
      svc.createFromSimple(
        CTX,
        input({ targets: [{ platform: 'meta', adAccountId: POOL_ACC, dailyBudget: '200' }] }),
      ),
    ).rejects.toThrow(/henüz bir müşteriye atanmamış/i);
  });

  it('KRİTİK: hesabın platformu kampanyanınkiyle uyuşmalı', async () => {
    /**
     * Google hesabına Meta kampanyası yazmak yayın anında düşerdi ve hata
     * "hesap bulunamadı" gibi okunurdu — yanlış teşhis. Girişte yakalanıyor.
     */
    await expect(
      svc.createFromSimple(
        CTX,
        input({ targets: [{ platform: 'meta', adAccountId: GOOGLE_ACC, dailyBudget: '200' }] }),
      ),
    ).rejects.toThrow(/google hesabı/i);
  });

  it('site hedefi adressiz reddediliyor', async () => {
    await expect(
      svc.createFromSimple(CTX, input({ goal: 'website', linkUrl: undefined })),
    ).rejects.toThrow(/Web sitesi adresi eksik/);
  });

  it('YARIM AĞAÇ KALMIYOR — reddedilen girdi hiçbir satır yazmıyor', async () => {
    /**
     * Kampanya yazılıp reklam grubu yazılamazsa geriye grupsuz bir kampanya
     * kalırdı: panelde görünür, yayınlanamaz ve kullanıcı sebebini anlamaz.
     */
    await expect(
      svc.createFromSimple(CTX, input({ creativeId: OTHER_CREATIVE })),
    ).rejects.toThrow();

    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(0);
    expect(await h.q(`SELECT id FROM draft_ad_groups`)).toHaveLength(0);
    expect(await h.q(`SELECT id FROM draft_ads`)).toHaveLength(0);
  });
});

describe('okuma', () => {
  it('liste aynı grubun kampanyalarını TEK SATIRDA topluyor', async () => {
    await svc.createFromSimple(CTX, input({ name: 'Birinci' }));
    await svc.createFromSimple(CTX, input({ name: 'İkinci' }));

    const groups = await svc.list(CTX, IDS.client);
    // İkisi de grupsuz, yani iki ayrı satır — grupsuzların tek satırda
    // birleşmemesi için anahtar kampanya kimliği.
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.campaigns.length === 1)).toBe(true);
  });

  it('grubu olmayan taslakta getGroup tek satır dönüyor', async () => {
    const created = await svc.createFromSimple(CTX, input());
    const group = await svc.getGroup(CTX, created.campaigns[0]!.id);
    expect(group.groupId).toBeNull();
    expect(group.campaigns).toHaveLength(1);
  });

  it('bulunamayan taslak 404', async () => {
    await expect(
      svc.get(CTX, '00000000-0000-0000-0000-000000000000'),
    ).rejects.toThrow(/bulunamadı/i);
  });
});

describe('silme', () => {
  it('taslak siliniyor ve ağacın tamamı gidiyor', async () => {
    const created = await svc.createFromSimple(CTX, input());
    await svc.remove(CTX, created.campaigns[0]!.id);

    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(0);
    expect(await h.q(`SELECT id FROM draft_ad_groups`)).toHaveLength(0);
    expect(await h.q(`SELECT id FROM draft_ads`)).toHaveLength(0);
    // Kreatif KALIYOR: kütüphaneye ait, kampanyaya değil.
    expect(await h.q(`SELECT id FROM ad_creatives`)).toHaveLength(2);
  });

  it('KRİTİK: yayınlanmış taslak SİLİNEMİYOR', async () => {
    /**
     * Silmek platformdaki kampanyayı durdurmuyor; yalnızca bizim kaydımızı yok
     * ediyor. Harcamaya devam eden ama panelde izi kalmayan bir kampanya, bu
     * projenin en pahalı sessiz hatası olurdu.
     */
    const created = await svc.createFromSimple(CTX, input());
    await h.q(
      `UPDATE draft_campaigns
       SET status = 'published', external_campaign_id = 'c-1', published_at = now()
       WHERE id = $1`,
      [created.campaigns[0]!.id],
    );

    await expect(svc.remove(CTX, created.campaigns[0]!.id)).rejects.toThrow(
      /yayınlandığı için silinemiyor/i,
    );
    expect(await h.q(`SELECT id FROM draft_campaigns`)).toHaveLength(1);
  });
});
