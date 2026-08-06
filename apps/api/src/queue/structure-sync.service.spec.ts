import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createHarness, seedTenant, IDS, type Harness } from '../../test/pglite-harness';
import type { PrismaAdminService } from '../prisma/prisma-admin.service';
import type { ProviderRegistry } from '../modules/connections/provider.registry';
import type { TokenVaultService } from '../modules/connections/token-vault.service';
import {
  PlatformApiError,
  type FetchContext,
  type IAdPlatformProvider,
  type PlatformStructure,
} from '../modules/connections/provider.types';
import type { QuotaGuardService } from './quota-guard.service';
import { StructureSyncService } from './structure-sync.service';

/**
 * StructureSyncService — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * Test edilen şey ham SQL: kolon adları, enum cast'leri, `ON CONFLICT`
 * hedefleri, `COALESCE` ile creative bağının korunması ve soft delete
 * güvenlik kilitleri. Hiçbiri TypeScript tarafından görülmüyor.
 *
 * En kritik iddialar SİLME GÜVENLİĞİ etrafında: bu servis yanlış davranırsa
 * bir müşterinin tüm kampanya geçmişini silinmiş gösterebilir. Boş sonuç ve
 * kısmi sonuç senaryoları bu yüzden ayrı ayrı test ediliyor.
 */

let h: Harness;
let provider: IAdPlatformProvider & {
  next: PlatformStructure;
  lastSince?: Date;
  lastContext?: FetchContext;
};
let quotaRecords: Array<Record<string, unknown>>;
let brokenBreakers: Array<{ platform: string; account: string; seconds: number }>;
let svc: StructureSyncService;

const empty = (over: Partial<PlatformStructure> = {}): PlatformStructure => ({
  campaigns: [],
  adGroups: [],
  ads: [],
  creatives: [],
  complete: true,
  apiCalls: 3,
  ...over,
});

const CAMPAIGN = {
  externalId: 'c1',
  name: 'Kampanya 1',
  objective: 'OUTCOME_SALES',
  status: 'active' as const,
  effectiveStatus: 'ACTIVE',
  budgetMode: 'daily' as const,
  budgetAmountMicros: 5_000_000n,
  bidStrategy: 'LOWEST_COST_WITHOUT_CAP',
  startTime: new Date('2026-01-01T00:00:00Z'),
  platformUpdatedAt: new Date('2026-08-01T10:00:00Z'),
  raw: { id: 'c1' },
};
const AD_GROUP = {
  externalId: 'g1',
  name: 'Ad Set 1',
  campaignExternalId: 'c1',
  status: 'active' as const,
  budgetMode: 'none' as const,
  bidAmountMicros: 200_000n,
  targeting: { age_min: 25 },
  raw: { id: 'g1' },
};
const AD = {
  externalId: 'a1',
  name: 'Reklam 1',
  adGroupExternalId: 'g1',
  status: 'active' as const,
  creativeExternalId: 'cr1',
  reviewStatus: 'ACTIVE',
  raw: { id: 'a1' },
};
const CREATIVE = {
  externalId: 'cr1',
  creativeType: 'SHARE',
  headline: 'Başlık',
  primaryText: 'Metin',
  destinationUrl: 'https://example.com',
  assetUrls: ['https://img/1.jpg'],
  raw: { id: 'cr1' },
};

const fullTree = () =>
  empty({ campaigns: [CAMPAIGN], adGroups: [AD_GROUP], ads: [AD], creatives: [CREATIVE] });

/** Bir turda yazılan satırların "eski" görünmesi için synced_at'i geriye alır. */
async function ageRows(): Promise<void> {
  for (const t of ['campaigns', 'ad_groups', 'ads']) {
    await h.q(`UPDATE ${t} SET synced_at = now() - interval '10 minutes'`);
  }
}

const counts = async () => ({
  campaigns: Number((await h.q<{ n: string }>('SELECT count(*) n FROM campaigns'))[0]!.n),
  adGroups: Number((await h.q<{ n: string }>('SELECT count(*) n FROM ad_groups'))[0]!.n),
  ads: Number((await h.q<{ n: string }>('SELECT count(*) n FROM ads'))[0]!.n),
  creatives: Number((await h.q<{ n: string }>('SELECT count(*) n FROM creatives'))[0]!.n),
});

// Koşum ortamı dosya başına BİR kez kuruluyor; testler arası izolasyonu
// TRUNCATE sağlıyor. Her testte yeniden kurmak migration'ları 18 kez koşturur.
beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);

  quotaRecords = [];
  brokenBreakers = [];

  provider = {
    platform: 'meta',
    next: empty(),
    fetchStructure: async function (ctx: FetchContext, since?: Date) {
      provider.lastContext = ctx;
      provider.lastSince = since;
      if (ctx.onRateLimit) {
        await ctx.onRateLimit({ usagePercent: 42, observedAt: new Date().toISOString() });
      }
      return provider.next;
    },
  } as never;

  svc = new StructureSyncService(
    h.db as unknown as PrismaAdminService,
    { get: () => provider } as unknown as ProviderRegistry,
    { getAccessToken: async () => 'token' } as unknown as TokenVaultService,
    {
      record: async (p: Record<string, unknown>) => void quotaRecords.push(p),
      tripBreaker: async (platform: string, account: string, seconds: number) =>
        void brokenBreakers.push({ platform, account, seconds }),
    } as unknown as QuotaGuardService,
  );
});

describe('StructureSyncService', () => {
  describe('tam tarama', () => {
    it('hiyerarşiyi doğru bağlarla yazar', async () => {
      provider.next = fullTree();
      const r = await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      expect(r.rows).toBe(4);
      expect(r.apiCalls).toBe(3);

      const camp = (await h.q<Record<string, unknown>>('SELECT * FROM campaigns'))[0]!;
      const grp = (await h.q<Record<string, unknown>>('SELECT * FROM ad_groups'))[0]!;
      const ad = (await h.q<Record<string, unknown>>('SELECT * FROM ads'))[0]!;
      const cr = (await h.q<Record<string, unknown>>('SELECT * FROM creatives'))[0]!;

      expect(grp.campaign_id).toBe(camp.id);
      expect(ad.ad_group_id).toBe(grp.id);
      expect(ad.creative_id).toBe(cr.id);
    });

    it('enum cast ve micros değerleri bozulmadan yazılır', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      const camp = (await h.q<Record<string, unknown>>('SELECT * FROM campaigns'))[0]!;
      expect(camp.status).toBe('active');
      expect(camp.budget_mode).toBe('daily');
      // Para micros olarak korunmalı; float'a düşerse kuruş kayar.
      expect(String(camp.budget_amount_micros)).toBe('5000000');
      // Platformun ham durumu ayrıca saklanıyor.
      expect(camp.effective_status).toBe('ACTIVE');
      expect(camp.platform_updated_at).not.toBeNull();

      const grp = (await h.q<Record<string, unknown>>('SELECT * FROM ad_groups'))[0]!;
      expect(String(grp.bid_amount_micros)).toBe('200000');
      expect((grp.targeting as { age_min: number }).age_min).toBe(25);
    });

    it('kota telemetrisini yukarı akıtır', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      expect(quotaRecords).toHaveLength(1);
      expect((quotaRecords[0]!.snapshot as { usagePercent: number }).usagePercent).toBe(42);
      expect(quotaRecords[0]!.adAccountId).toBe(IDS.adAccount);
    });

    it('idempotenttir — tekrar çalışmak satır çoğaltmaz ve kimlikleri korur', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      const firstId = (await h.q<{ id: string }>('SELECT id FROM campaigns'))[0]!.id;

      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      expect(await counts()).toEqual({ campaigns: 1, adGroups: 1, ads: 1, creatives: 1 });
      // Kimliğin değişmemesi ŞART: insights_daily satırları buna bağlı.
      expect((await h.q<{ id: string }>('SELECT id FROM campaigns'))[0]!.id).toBe(firstId);
    });

    it('değişen alanları günceller', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      provider.next = empty({
        campaigns: [
          { ...CAMPAIGN, name: 'Yeni ad', status: 'paused', budgetAmountMicros: 9_990_000n },
        ],
      });
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      const camp = (await h.q<Record<string, unknown>>('SELECT * FROM campaigns'))[0]!;
      expect(camp.name).toBe('Yeni ad');
      expect(camp.status).toBe('paused');
      expect(String(camp.budget_amount_micros)).toBe('9990000');
    });
  });

  describe('silme güvenliği', () => {
    it('platformdan kaybolan varlığı soft delete eder, satırı SİLMEZ', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      await ageRows();

      provider.next = empty({
        campaigns: [
          { ...CAMPAIGN, externalId: 'c2', name: 'Kampanya 2', budgetAmountMicros: 1_000_000n },
        ],
      });
      const r = await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      // kampanya + ad group + reklam
      expect(r.softDeleted).toBe(3);
      const gone = await h.q<{ external_id: string }>(
        'SELECT external_id FROM campaigns WHERE deleted_at IS NOT NULL',
      );
      expect(gone.map((g) => g.external_id)).toEqual(['c1']);
      // Geçmiş metrikler bu satırlara bağlı — fiziksel silme olmamalı.
      expect((await counts()).campaigns).toBe(2);
    });

    it('geri gelen varlıkta deleted_at temizlenir', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      await ageRows();
      provider.next = empty();
      // Boş sonuç silmeyi atlıyor; elle işaretleyip geri dönüşü test ediyoruz.
      await h.q('UPDATE campaigns SET deleted_at = now()');

      provider.next = empty({ campaigns: [CAMPAIGN] });
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      const camp = (await h.q<{ deleted_at: Date | null }>(
        `SELECT deleted_at FROM campaigns WHERE external_id = 'c1'`,
      ))[0]!;
      expect(camp.deleted_at).toBeNull();
    });

    it('KRİTİK: boş tarama sonucu hiçbir şeyi silmez', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      await ageRows();

      // 0 kampanya neredeyse kesinlikle bir arıza (yetki kaybı, yanlış hesap
      // kimliği), platformun gerçekten boşaldığı anlamına gelmez.
      provider.next = empty();
      const r = await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      expect(r.softDeleted).toBe(0);
      const alive = await h.q<{ n: string }>(
        'SELECT count(*) n FROM campaigns WHERE deleted_at IS NULL',
      );
      expect(Number(alive[0]!.n)).toBe(1);
    });

    it('KRİTİK: kısmi sonuç silme yapmaz', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      await ageRows();

      // Kota tükendi / sayfalama kesildi: eksik varlıklar silinmiş değil.
      provider.next = empty({
        campaigns: [{ ...CAMPAIGN, externalId: 'c2' }],
        complete: false,
      });
      const r = await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      expect(r.softDeleted).toBe(0);
      expect(r.note).toContain('KISMİ');
    });

    it('delta turunda silme yapılmaz', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      await ageRows();

      // Delta: dönmeyen varlık "değişmemiş" demek.
      provider.next = empty({ campaigns: [{ ...CAMPAIGN, externalId: 'c2' }] });
      const r = await svc.syncAccount({ adAccountId: IDS.adAccount });

      expect(r.softDeleted).toBe(0);
      expect(r.note).toContain('delta');
    });
  });

  describe('delta senkronizasyonu', () => {
    it('ilk senkronizasyon tam taramadır', async () => {
      provider.next = empty();
      const r = await svc.syncAccount({ adAccountId: IDS.adAccount });
      expect(provider.lastSince).toBeUndefined();
      expect(r.note).toContain('tam tarama');
    });

    it('sonraki turlarda since verilir ve 1 saat geriye alınır', async () => {
      provider.next = empty();
      await svc.syncAccount({ adAccountId: IDS.adAccount });
      await svc.syncAccount({ adAccountId: IDS.adAccount });

      expect(provider.lastSince).toBeInstanceOf(Date);
      // Kayma toleransı: platform saati ile bizim saatimiz arasındaki farkın ve
      // senkronizasyon sırasında yapılan değişikliklerin kaçmaması için.
      expect(Date.now() - provider.lastSince!.getTime()).toBeGreaterThan(3_500_000);
    });

    it('REGRESYON: creative dönmediğinde mevcut bağ korunur', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      const creativeId = (await h.q<{ id: string }>('SELECT id FROM creatives'))[0]!.id;

      // Reklam değişti ama creative değişmediği için delta'da dönmedi.
      // COALESCE olmasa bu tur reklamın creative bağını koparırdı.
      provider.next = empty({
        campaigns: [CAMPAIGN],
        adGroups: [AD_GROUP],
        ads: [{ ...AD, name: 'Reklam 1 v2', creativeExternalId: undefined }],
      });
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      const ad = (await h.q<Record<string, unknown>>('SELECT * FROM ads'))[0]!;
      expect(ad.name).toBe('Reklam 1 v2');
      expect(ad.creative_id).toBe(creativeId);
    });
  });

  describe('dayanıklılık', () => {
    it('kolon sınırını aşan değerleri kırpar, 22001 ile düşmez', async () => {
      provider.next = empty({
        campaigns: [{ ...CAMPAIGN, name: 'X'.repeat(900) }], // varchar(512)
      });
      await expect(
        svc.syncAccount({ adAccountId: IDS.adAccount, full: true }),
      ).resolves.toBeDefined();

      const camp = (await h.q<{ name: string }>('SELECT name FROM campaigns'))[0]!;
      expect(camp.name).toHaveLength(512);
    });

    it('kampanyası bilinmeyen ad group FK hatası vermeden atlanır', async () => {
      provider.next = empty({
        campaigns: [CAMPAIGN],
        adGroups: [{ ...AD_GROUP, externalId: 'gX', campaignExternalId: 'OLMAYAN' }],
      });
      await expect(
        svc.syncAccount({ adAccountId: IDS.adAccount, full: true }),
      ).resolves.toBeDefined();
      expect((await counts()).adGroups).toBe(0);
    });

    it('ad group bu turda dönmese bile reklam veritabanından bağlanır', async () => {
      provider.next = fullTree();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      // Yalnızca reklam döndü — ad group değişmemiş.
      provider.next = empty({ ads: [{ ...AD, name: 'Sadece reklam' }] });
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });

      const ad = (await h.q<{ name: string }>('SELECT name FROM ads'))[0]!;
      expect(ad.name).toBe('Sadece reklam');
      expect((await counts()).ads).toBe(1);
    });

    it('MCC kimliği sağlayıcıya login-customer-id olarak geçilir', async () => {
      await h.q(`UPDATE ad_accounts SET manager_external_id = '1234567890'`);
      provider.next = empty();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      expect(provider.lastContext?.loginCustomerId).toBe('1234567890');
    });

    it('rate limit hatasında devre kesici açılır', async () => {
      // Bloklanmış bir hesaba yeniden yüklenmek bloğu UZATIYOR; hata anında
      // kesiciyi açmak tek doğru davranış.
      provider.fetchStructure = async () => {
        throw new PlatformApiError('meta', 'rate_limited', 'kota doldu', {
          retryAfterSeconds: 600,
        });
      };

      await expect(
        svc.syncAccount({ adAccountId: IDS.adAccount, full: true }),
      ).rejects.toThrow('kota doldu');

      expect(brokenBreakers).toEqual([
        { platform: 'meta', account: IDS.adAccount, seconds: 600 },
      ]);
    });

    it('rate limit DIŞI hatalarda devre kesici açılmaz', async () => {
      // Geçersiz alan gibi kalıcı bir hata hesabı bloklamamalı: 15 dakika
      // boyunca o hesabın tüm işlerini durdurmak bedava değil.
      provider.fetchStructure = async () => {
        throw new PlatformApiError('meta', 'permanent', 'geçersiz alan');
      };

      await expect(
        svc.syncAccount({ adAccountId: IDS.adAccount, full: true }),
      ).rejects.toThrow('geçersiz alan');
      expect(brokenBreakers).toEqual([]);
    });

    it('hata durumunda lastStructureSyncAt GÜNCELLENMEZ', async () => {
      // Aksi hâlde başarısız bir tur "senkronize edildi" sayılır ve bir
      // sonraki tur delta moduna geçerek eksik veriyi hiç tamamlamaz.
      provider.fetchStructure = async () => {
        throw new PlatformApiError('meta', 'transient', 'geçici hata');
      };
      await expect(svc.syncAccount({ adAccountId: IDS.adAccount })).rejects.toThrow();

      const acc = (await h.q<{ last_structure_sync_at: Date | null }>(
        'SELECT last_structure_sync_at FROM ad_accounts',
      ))[0]!;
      expect(acc.last_structure_sync_at).toBeNull();
    });

    it('lastStructureSyncAt güncellenir', async () => {
      provider.next = empty();
      await svc.syncAccount({ adAccountId: IDS.adAccount, full: true });
      const acc = (await h.q<{ last_structure_sync_at: Date | null }>(
        'SELECT last_structure_sync_at FROM ad_accounts',
      ))[0]!;
      expect(acc.last_structure_sync_at).not.toBeNull();
    });
  });
});
