import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TenantContext } from '@advetics/shared';
import { createHarness, seedTenant, IDS, type Harness } from '../../../test/pglite-harness';
import type { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignActionsService } from './campaign-actions.service';

/**
 * `CampaignActionsService` — GERÇEK Postgres motoruna (PGlite) karşı.
 *
 * EN KRİTİK İDDİALAR:
 *   1. Platform çağrısı İKİ AYRI transaction arasında kalıyor, tek bir
 *      transaction'ın içinde değil (CLAUDE.md: "platform çağrısı
 *      transaction'ın İÇİNDE olamaz").
 *   2. Bağlantı etkin değilse / yazma izni yoksa / kota doluysa platforma
 *      HİÇ ÇAĞRI YAPILMIYOR — ön koşul kontrolü maliyeti sıfır bir ret.
 *   3. Başarılı aksiyon `audit_logs`a düşüyor, `actorType='user'` ve
 *      gerçek kullanıcıyla (kural motorunun `actorType='rule'` yazdığı
 *      yoldan AYRI).
 */

let h: Harness;
const CAMPAIGN = '99999999-9999-9999-9999-999999999999';

const CTX: TenantContext = {
  orgId: IDS.org,
  userId: IDS.user,
  clientIds: [IDS.client],
  isOrgAdmin: true,
} as TenantContext;

function makeService(withTenantSpy: ReturnType<typeof vi.fn>) {
  const prisma = { withTenant: withTenantSpy } as unknown as PrismaService;
  const applyAction = vi.fn();
  const canWrite = vi.fn().mockReturnValue({ ok: true, missing: [] });
  const providers = { get: () => ({ platform: 'meta', applyAction, canWrite }) } as never;
  const vault = { getAccessToken: async () => 'token-123' } as never;
  const quota = {
    acquire: vi.fn().mockResolvedValue({ allowed: true, usagePercent: 5 }),
    record: vi.fn().mockResolvedValue(undefined),
  } as never;
  const audit = new AuditService({} as never);
  // Kopyalamadan sonra yapı taraması kuyruğa giriyor; testte kuyruk sahte.
  const enqueue = vi.fn().mockResolvedValue({ enqueued: true });
  const queue = { enqueue } as never;

  const svc = new CampaignActionsService(prisma, providers, vault, quota, audit, queue);
  return { svc, applyAction, canWrite, quota, enqueue };
}

beforeAll(async () => {
  h = await createHarness();
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.reset();
  await seedTenant(h);
  await h.q(
    `INSERT INTO campaigns
       (id, ad_account_id, client_id, platform, external_id, name, status,
        budget_mode, budget_amount_micros, updated_at)
     VALUES ($1, $2, $3, 'meta', 'ext_camp_1', 'Yaz Kampanyası', 'active',
             'daily', 200000000, now())`,
    [CAMPAIGN, IDS.adAccount, IDS.client],
  );
});

/** `withTenant`'ı gerçek PGlite bağlantısına köprüleyip çağrı SAYISINI da izliyor. */
function realWithTenant() {
  return vi.fn(async (_ctx: TenantContext, fn: (tx: unknown) => Promise<unknown>) => fn(h.db));
}

describe('KOPYALAMA — kopyayı platform çıkarıyor', () => {
  /*
   * Canlı bir kampanyayı KENDİ modelimizde kopyalamak, hedeflemeyi Meta'nın
   * ham biçiminden bizim şemamıza ÇEVİRMEK demekti ve çeviri, kaynağıyla
   * aynı sanılan ama farklı hedefleyen bir kampanya üretme riski taşıyor.
   * Platformun kendi `POST /{id}/copies` ucu bu riski tamamen kaldırıyor.
   */
  it('KRİTİK: istek sağlayıcıya `copy` olarak, derin kopya bayrağıyla gidiyor', async () => {
    const { svc, applyAction } = makeService(realWithTenant());
    applyAction.mockResolvedValue({
      afterState: { copiedCampaignId: '999' },
      createdExternalId: '999',
    });

    await svc.applyAction(CTX, CAMPAIGN, { type: 'copy', name: 'Yaz — kopya', deepCopy: true });

    expect(applyAction).toHaveBeenCalledWith(expect.anything(), {
      type: 'copy',
      level: 'campaign',
      externalId: 'ext_camp_1',
      name: 'Yaz — kopya',
      deepCopy: true,
    });
  });

  it('KRİTİK: kopyadan sonra YAPI TARAMASI kuyruğa giriyor', async () => {
    /*
     * Kopya platformda var ama BİZDE yok: `campaigns` tablosuna onu ancak
     * yapı taraması yazıyor ve o altı saatte bir koşuyor. Kuyruğa almamak,
     * kullanıcının az önce oluşturduğu kampanyayı panelde görememesi ve
     * ikinci kez kopyalaması demek.
     */
    const { svc, applyAction, enqueue } = makeService(realWithTenant());
    applyAction.mockResolvedValue({ afterState: {}, createdExternalId: '999' });

    await svc.applyAction(CTX, CAMPAIGN, { type: 'copy', deepCopy: true });

    expect(enqueue).toHaveBeenCalledWith(
      expect.objectContaining({ jobType: 'structure', interactive: true }),
    );
  });

  it('durdurma/sürdürme yapı taraması TETİKLEMİYOR', async () => {
    // Ters yön: her aksiyondan sonra tarama kuyruğa atan bir kısayol da
    // yukarıdaki testi geçerdi ve her düğme basışında kota harcardı.
    const { svc, applyAction, enqueue } = makeService(realWithTenant());
    applyAction.mockResolvedValue({ afterState: { status: 'PAUSED' } });

    await svc.applyAction(CTX, CAMPAIGN, { type: 'pause' });

    expect(enqueue).not.toHaveBeenCalled();
  });

  it('KRİTİK: kuyruk düşerse KOPYA KAYBOLMUYOR', async () => {
    /*
     * Kampanya platformda gerçekten oluştu. Kuyruk hatasını yukarı
     * fırlatmak, kullanıcıya "kopyalama başarısız" dedirtir ve ikinci bir
     * kampanya açtırır — para harcayan mükerrerlik.
     */
    const { svc, applyAction, enqueue } = makeService(realWithTenant());
    applyAction.mockResolvedValue({
      afterState: { copiedCampaignId: '999' },
      createdExternalId: '999',
    });
    enqueue.mockRejectedValue(new Error('redis yok'));

    const sonuc = await svc.applyAction(CTX, CAMPAIGN, { type: 'copy', deepCopy: true });

    expect(sonuc.after).toMatchObject({ copiedCampaignId: '999' });
    expect(String((sonuc.after as Record<string, unknown>).senkronNotu)).toContain('redis yok');
  });
});

describe('applyAction — mutlu yol', () => {
  it('pause: bağlam ÇÖZÜLÜYOR, platforma çağrı yapılıyor, audit_logs yazılıyor', async () => {
    const withTenantSpy = realWithTenant();
    const { svc, applyAction } = makeService(withTenantSpy);
    applyAction.mockResolvedValue({ afterState: { status: 'PAUSED' } });

    const result = await svc.applyAction(CTX, CAMPAIGN, { type: 'pause' });

    expect(result.before.status).toBe('active');
    expect(result.after).toEqual({ status: 'PAUSED' });
    expect(applyAction).toHaveBeenCalledWith(
      expect.objectContaining({ accountExternalId: 'act_999', accessToken: 'token-123' }),
      { type: 'pause', level: 'campaign', externalId: 'ext_camp_1' },
    );

    const logs = await h.q<{ action: string; actor_type: string; target_id: string }>(
      `SELECT action, actor_type, target_id FROM audit_logs`,
    );
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      action: 'campaign.pause',
      actor_type: 'user',
      target_id: CAMPAIGN,
    });
  });

  it('İKİ AYRI transaction — platform çağrısı ikisinin ARASINDA', async () => {
    // Tek bir withTenant çağrısına sarılsaydı, Meta/Google çağrısı 5 saniyelik
    // transaction penceresini aşabilirdi (CLAUDE.md). Burada withTenant TAM
    // İKİ KEZ çağrılmalı: biri okuma, biri denetim kaydı.
    const withTenantSpy = realWithTenant();
    const { svc, applyAction } = makeService(withTenantSpy);
    applyAction.mockResolvedValue({ afterState: { status: 'PAUSED' } });

    await svc.applyAction(CTX, CAMPAIGN, { type: 'pause' });

    expect(withTenantSpy).toHaveBeenCalledTimes(2);
  });

  it('set_budget: doğru micros/mod/para birimiyle platforma gidiyor', async () => {
    const { svc, applyAction } = makeService(realWithTenant());
    applyAction.mockResolvedValue({ afterState: { budgetAmountMicros: '500000000' } });

    await svc.applyAction(CTX, CAMPAIGN, {
      type: 'set_budget',
      amountMicros: 500_000_000n,
      budgetMode: 'daily',
    });

    expect(applyAction).toHaveBeenCalledWith(expect.anything(), {
      type: 'set_budget',
      level: 'campaign',
      externalId: 'ext_camp_1',
      amountMicros: 500_000_000n,
      budgetMode: 'daily',
      currency: 'TRY',
    });
  });
});

describe('getSummary / list — ONAY KARTININ PARA BİRİMİ', () => {
  /**
   * Bu iki metot Prisma'nın MODEL API'sini kullanıyor (`campaign.findUnique`),
   * koşum ortamının `TestDb`si ise yalnızca `$queryRaw`/`$executeRaw` taşıyor
   * — o yüzden burada PGlite yerine çağrıyı YAKALAYAN sahte bir istemci var.
   * İddia iki parçalı: (1) dönen özet para birimini taşıyor, (2) sorgu onu
   * hesaptan GERÇEKTEN istiyor. Yalnızca (1) yazılsaydı, sahte satır zaten
   * `adAccount` taşıdığı için JOIN silindiğinde test yeşil kalırdı.
   */
  function fakePrisma(row: Record<string, unknown>) {
    const findUnique = vi.fn().mockResolvedValue(row);
    const findMany = vi.fn().mockResolvedValue([row]);
    const withTenant = vi.fn(async (_ctx: TenantContext, fn: (tx: unknown) => Promise<unknown>) =>
      fn({ campaign: { findUnique, findMany } }),
    );
    return { withTenant, findUnique, findMany };
  }

  const USD_SATIRI = {
    id: CAMPAIGN,
    name: 'ABD Kampanyası',
    platform: 'meta',
    status: 'active',
    budgetMode: 'daily',
    budgetAmountMicros: 1_000_000_000n,
    adAccount: { currency: 'USD' },
  };

  it('KRİTİK: para birimi REKLAM HESABINDAN geliyor, sabit TRY değil', async () => {
    // USD bir hesapta onay kartı "₺" gösterip platformda USD uygularsa,
    // canlı para mutasyonundan önceki TEK insan kontrolü yanlış bilgi
    // veriyor demektir — ve hiçbir log bunu göstermiyor.
    const p = fakePrisma(USD_SATIRI);
    const { svc } = makeService(p.withTenant as never);

    const summary = await svc.getSummary(CTX, CAMPAIGN);

    expect(summary.currency).toBe('USD');
  });

  it('KRİTİK: sorgu hesabın currency kolonunu gerçekten istiyor', async () => {
    const p = fakePrisma(USD_SATIRI);
    const { svc } = makeService(p.withTenant as never);

    await svc.getSummary(CTX, CAMPAIGN);

    const args = p.findUnique.mock.calls[0]![0] as { select: Record<string, unknown> };
    // `include` DEĞİL `select`: `include` `ad_accounts`ın `raw` JSONB'sini ve
    // ŞİFRELİ sayfa token'ını da belleğe alırdı (CLAUDE.md).
    expect(args.select.adAccount).toEqual({ select: { currency: true } });
  });

  it('list() de para birimi taşıyor — farklı birimli hesaplar karşılaştırılamaz', async () => {
    const p = fakePrisma(USD_SATIRI);
    const { svc } = makeService(p.withTenant as never);

    const rows = await svc.list(CTX, IDS.client);

    expect(rows[0]!.currency).toBe('USD');
    expect(rows[0]!.budgetAmountMicros).toBe(1_000_000_000n);
  });
});

describe('applyAction — ön koşullar (platforma HİÇ çağrı yapılmıyor)', () => {
  it('KRİTİK: bağlantı etkin değilse reddediliyor, platforma dokunulmuyor', async () => {
    await h.q(`UPDATE platform_connections SET status = 'revoked' WHERE id = $1`, [IDS.connection]);
    const { svc, applyAction } = makeService(realWithTenant());

    await expect(svc.applyAction(CTX, CAMPAIGN, { type: 'pause' })).rejects.toThrow(/etkin değil/);
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('KRİTİK: yazma izni yoksa reddediliyor, platforma dokunulmuyor', async () => {
    const { svc, applyAction, canWrite } = makeService(realWithTenant());
    canWrite.mockReturnValue({ ok: false, missing: ['ads_management'] });

    await expect(svc.applyAction(CTX, CAMPAIGN, { type: 'pause' })).rejects.toThrow(
      /Yazma izni yok.*ads_management/,
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('KRİTİK: kota doluysa reddediliyor, platforma dokunulmuyor', async () => {
    const { svc, applyAction, quota } = makeService(realWithTenant());
    (quota as { acquire: ReturnType<typeof vi.fn> }).acquire.mockResolvedValue({
      allowed: false,
      reason: 'Hesap %92 kullanımda',
    });

    await expect(svc.applyAction(CTX, CAMPAIGN, { type: 'pause' })).rejects.toThrow(
      /Kota engeli.*%92/,
    );
    expect(applyAction).not.toHaveBeenCalled();
  });

  it('bulunamayan kampanya 404', async () => {
    const { svc } = makeService(realWithTenant());
    await expect(
      svc.applyAction(CTX, '00000000-0000-0000-0000-000000000000', { type: 'pause' }),
    ).rejects.toThrow(/bulunamadı/i);
  });
});
