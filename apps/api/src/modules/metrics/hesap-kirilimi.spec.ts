import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { MetricsAccountBreakdown, TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { MetricsService } from './metrics.service';

/**
 * ═══ MECRA VE HESAP KIRILIMI — workspace › mecra › hesap › kampanya ═══
 *
 * Gerçek veritabanıyla. Üç iddia kritik ve üçü de hata vermeden yanlış
 * sayı üretirdi:
 *   · ÇİFT SAYIM: `insights_daily` aynı harcamayı dört seviyede taşıyor;
 *     hesap satırı dördünü toplarsa harcama 4× görünür.
 *   · SESSİZ DÜŞME: harcaması olmayan, izlemesi kapalı hesap listede
 *     KALMALI; join'li bir sorgu onları eler ve "atandı" ile "atanmadı"
 *     aynı görünür.
 *   · KAPSAM: havuz hesabı ve başka workspace'in hesabı listeye girmemeli.
 */
let h: Harness;
let svc: MetricsService;

const MUSTERI_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const HESAP_B = 'bbbbbbbb-0000-0000-0000-bbbbbbbbbbbb';
const META_IKINCI = 'a2a2a2a2-0000-0000-0000-a2a2a2a2a2a2';
const GOOGLE = 'a3a3a3a3-0000-0000-0000-a3a3a3a3a3a3';
const LINKEDIN_KAPALI = 'a4a4a4a4-0000-0000-0000-a4a4a4a4a4a4';
const HAVUZ = 'a5a5a5a5-0000-0000-0000-a5a5a5a5a5a5';
const KAMPANYA = '66666666-6666-6666-6666-666666666666';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client, MUSTERI_B],
  activeClientId: IDS.client,
  isOrgAdmin: true,
} as TenantContext;

const ARALIK = { from: '2026-08-01', to: '2026-08-31' } as const;

async function hesap(
  id: string,
  clientId: string | null,
  platform: string,
  ad: string,
  izleniyor = true,
): Promise<void> {
  await h.q(
    `INSERT INTO ad_accounts
       (id, org_id, client_id, connection_id, platform, external_id, name, currency,
        timezone, sync_enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5::"Platform",$6,$7,'TRY','Europe/Istanbul',$8,now())`,
    [id, IDS.org, clientId, IDS.connection, platform, `x-${id.slice(0, 4)}`, ad, izleniyor],
  );
}

/** `seviyeler` verilmezse platformun yaptığı gibi DÖRT seviyeye birden yazar. */
async function metrik(
  clientId: string,
  adAccountId: string,
  platform: string,
  spendMicros: string,
  seviyeler: string[] = ['account', 'campaign', 'ad_group', 'ad'],
  tarih = '2026-08-10',
): Promise<void> {
  for (const level of seviyeler) {
    await h.q(
      `INSERT INTO insights_daily
         (client_id, ad_account_id, platform, entity_level, entity_id, entity_external_id,
          date, breakdown_key, impressions, clicks, spend_micros, conversions,
          conversion_value_micros, currency, reach)
       VALUES ($1,$2,$3::"Platform",$4::"EntityLevel",gen_random_uuid(),$5,$6::date,'',100,10,$7,1,0,'TRY',0)`,
      [clientId, adAccountId, platform, level, `${level}-${adAccountId.slice(0, 4)}`, tarih, spendMicros],
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
  await h.q(
    `INSERT INTO clients (id, org_id, name, slug, updated_at)
     VALUES ($1, $2, 'B Firması', 'b-firmasi', now())`,
    [MUSTERI_B, IDS.org],
  );
  // IDS.adAccount: seedTenant'ın Meta hesabı, adı 'Hesap'.
  await hesap(META_IKINCI, IDS.client, 'meta', 'İkinci Meta');
  await hesap(GOOGLE, IDS.client, 'google', 'Google Hesabı');
  await hesap(LINKEDIN_KAPALI, IDS.client, 'linkedin', 'LinkedIn Kapalı', false);
  await hesap(HAVUZ, null, 'meta', 'Havuzdaki Hesap');
  await hesap(HESAP_B, MUSTERI_B, 'google', 'B Hesabı');

  await metrik(IDS.client, IDS.adAccount, 'meta', '100000000');
  await metrik(IDS.client, GOOGLE, 'google', '250000000', ['campaign']);
  // İzlenmeyen hesabın verisi DURUYOR ama panele girmemeli.
  await metrik(IDS.client, LINKEDIN_KAPALI, 'linkedin', '999000000', ['campaign']);
  await metrik(MUSTERI_B, HESAP_B, 'google', '777000000', ['campaign']);

  await h.q(
    `INSERT INTO campaigns (id, ad_account_id, client_id, platform, external_id, name, status, budget_mode, updated_at)
     VALUES ($1,$2,$3,'meta','c1','A Kampanya','active','daily',now())`,
    [KAMPANYA, IDS.adAccount, IDS.client],
  );

  const prisma = {
    withTenant: async <T>(ctx: TenantContext, fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (!ctx?.orgId || !ctx?.userId) throw new Error('Tenant bağlamı olmadan sorgu');
      return fn(h.db);
    },
  } as unknown as PrismaService;
  svc = new MetricsService(prisma);
});

function hesapSatiri(r: MetricsAccountBreakdown, ad: string) {
  const s = r.accounts.find((a) => a.name === ad);
  if (!s) throw new Error(`${ad} satırı yok`);
  return s;
}

describe('hesap satırları', () => {
  it('KRİTİK: harcama TEK seviyeden — dört seviyeye yazılan 100 ₺, 400 ₺ görünmüyor', async () => {
    const r = await svc.byAccount(CTX, ARALIK);
    expect(hesapSatiri(r, 'Hesap').spendMicros).toBe('100000000');
    expect(hesapSatiri(r, 'Google Hesabı').spendMicros).toBe('250000000');
  });

  it('KRİTİK: harcaması olmayan ve izlemesi kapalı hesap listede KALIYOR', async () => {
    const r = await svc.byAccount(CTX, ARALIK);
    const bos = hesapSatiri(r, 'İkinci Meta');
    expect(bos.spendMicros).toBe('0');
    expect(bos.currency).toBe('TRY');
    const kapali = hesapSatiri(r, 'LinkedIn Kapalı');
    expect(kapali.syncEnabled).toBe(false);
    // Verisi veritabanında duruyor ama izlenmeyen hesap panele girmiyor.
    expect(kapali.spendMicros).toBe('0');
  });

  it('KRİTİK: havuz hesabı ve başka workspace’in hesabı listeye girmiyor', async () => {
    const r = await svc.byAccount(CTX, ARALIK);
    const adlar = r.accounts.map((a) => a.name);
    expect(adlar).not.toContain('Havuzdaki Hesap');
    expect(adlar).not.toContain('B Hesabı');
    expect(adlar).toHaveLength(4);
  });

  it('harcamaya göre sıralı, harcamasızlar sonda ada göre', async () => {
    const r = await svc.byAccount(CTX, ARALIK);
    expect(r.accounts.map((a) => a.name)).toEqual([
      'Google Hesabı',
      'Hesap',
      'İkinci Meta',
      'LinkedIn Kapalı',
    ]);
  });

  it('platform süzgeci hem hesaplara hem mecralara uygulanıyor', async () => {
    const r = await svc.byAccount(CTX, { ...ARALIK, platform: 'meta' });
    expect(r.accounts.map((a) => a.name).sort()).toEqual(['Hesap', 'İkinci Meta']);
    expect(r.platforms.map((p) => p.platform)).toEqual(['meta']);
  });
});

describe('mecra satırları', () => {
  it('mecra toplamı hesaplarının toplamına EŞİT, hesap sayıları izlenmeyeni de sayıyor', async () => {
    const r = await svc.byAccount(CTX, ARALIK);
    const meta = r.platforms.find((p) => p.platform === 'meta')!;
    expect(meta.accountCount).toBe(2);
    expect(meta.spendMicros).toBe('100000000');
    const linkedin = r.platforms.find((p) => p.platform === 'linkedin')!;
    expect(linkedin.accountCount).toBe(1);
    expect(linkedin.unmonitoredCount).toBe(1);
    expect(r.platforms.map((p) => p.platform)).toEqual(['google', 'meta', 'linkedin']);

    const hesapToplami = r.accounts.reduce((t, a) => t + BigInt(a.spendMicros), 0n);
    const mecraToplami = r.platforms.reduce((t, p) => t + BigInt(p.spendMicros), 0n);
    expect(mecraToplami).toBe(hesapToplami);
  });

  it('karşılaştırma açıkken önceki dönem geliyor, verisi olmayanda null', async () => {
    await metrik(IDS.client, IDS.adAccount, 'meta', '40000000', ['campaign'], '2026-07-15');
    const r = await svc.byAccount(CTX, {
      ...ARALIK,
      compareFrom: '2026-07-01',
      compareTo: '2026-07-31',
    });
    expect(hesapSatiri(r, 'Hesap').previous?.spendMicros).toBe('40000000');
    expect(hesapSatiri(r, 'Google Hesabı').previous).toBeNull();
    expect(r.platforms.find((p) => p.platform === 'meta')!.previous?.spendMicros).toBe('40000000');
  });
});

describe('ekmek kırıntısı', () => {
  it('hesap adı kampanyadan TÜRETİLİYOR — adres hesap taşımasa da', async () => {
    const yol = await svc.hierarchyPath(CTX, { campaignId: KAMPANYA });
    expect(yol.adAccount).toEqual({ id: IDS.adAccount, name: 'Hesap', platform: 'meta' });
  });

  it('kampanya ile adres çelişirse kampanyanın gerçek hesabı kazanıyor', async () => {
    const yol = await svc.hierarchyPath(CTX, { campaignId: KAMPANYA, adAccountId: GOOGLE });
    expect(yol.adAccount?.id).toBe(IDS.adAccount);
  });

  it('yalnızca hesap verildiğinde hesap adı geliyor', async () => {
    const yol = await svc.hierarchyPath(CTX, { adAccountId: GOOGLE });
    expect(yol.adAccount?.name).toBe('Google Hesabı');
    expect(yol.campaign).toBeNull();
  });
});
