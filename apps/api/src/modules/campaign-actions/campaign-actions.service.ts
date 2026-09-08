import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Platform, TenantContext } from '@advetics/shared';
import { PrismaService, type TenantClient } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { AuditService } from '../audit/audit.service';
import { ProviderRegistry } from '../connections/provider.registry';
import type { PlatformActionRequest } from '../connections/provider.types';
import { TokenVaultService } from '../connections/token-vault.service';

/**
 * Yayınlanmış kampanyada elle tetiklenen aksiyon — panel butonu ya da AI
 * asistanı onay kartı.
 *
 * BU BİR `rule-executor.service.ts` KOPYASI DEĞİL, PAYLAŞILAN ÇEKİRDEK.
 * Kural motoru kendi toplu değerlendirmesinden gelen `PendingAction[]`
 * üzerinden, kendi `AccountAuth` çözümlemesiyle çalışıyor; bu servis TEK bir
 * kampanyayı, elle tetiklenen bir istekle işliyor. İkisi ayrı akış ama AYNI
 * platform çağrısına (`IAdPlatformProvider.applyAction`) ve aynı kota/audit
 * disiplinine çıkması gerekiyor — ikisi ayrı yazılırsa biri düzeltilen bir
 * hata diğerinde kalır (CLAUDE.md'nin `publishDraft`/`createBoost`/`createAd`
 * için anlattığı tam o hata sınıfı).
 */
export type CampaignAction =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'set_budget'; amountMicros: bigint; budgetMode: 'daily' | 'lifetime' };

export interface CampaignSummary {
  id: string;
  name: string;
  platform: Platform;
  status: string;
  budgetMode: string;
  budgetAmountMicros: bigint | null;
  /**
   * Kampanyanın bağlı olduğu REKLAM HESABININ para birimi.
   *
   * ÖZETİN İÇİNDE OLMAK ZORUNDA. Bu özet tek bir yerde kullanılıyor: canlı
   * para mutasyonundan önceki onay kartı. Kart tutarı bir yerden
   * biçimlendirmek zorunda ve para birimini taşımayan bir özet, çağıranı
   * TAHMİN ETMEYE zorluyor — nitekim `tools.ts` sabit `'TRY'` yazıyordu ve
   * USD bir hesapta kullanıcı "2.000,00 ₺" yazan kartı onaylayıp platformda
   * 2000 USD uyguluyordu. Yazma yolu (`toPlatformRequest`) `row.currency`
   * kullandığı için hata YALNIZCA kartta duruyordu: hiçbir log, hiçbir
   * istisna, yalnızca yanlış birim.
   */
  currency: string;
}

/**
 * Özet sorgusunun alan listesi — TEK YERDE.
 *
 * `include` DEĞİL `select`: `include` ilişkinin bütün kolonlarını çekiyor ve
 * `ad_accounts` içinde `raw` (tam platform yanıtı, JSONB), `rate_limit_state`
 * ve ŞİFRELİ sayfa token'ı var (CLAUDE.md). Buradan gereken tek şey
 * `currency`.
 *
 * Satır tipi listeden TÜRETİLİYOR (`GetPayload`): ayrı yazılsaydı biri
 * güncellenip diğeri unutulduğunda TypeScript susardı.
 */
const OZET_SECIM = {
  id: true,
  name: true,
  platform: true,
  status: true,
  budgetMode: true,
  budgetAmountMicros: true,
  adAccount: { select: { currency: true } },
} satisfies Prisma.CampaignSelect;

type OzetSatiri = Prisma.CampaignGetPayload<{ select: typeof OZET_SECIM }>;

function toSummary(row: OzetSatiri): CampaignSummary {
  return {
    id: row.id,
    name: row.name,
    platform: row.platform as Platform,
    status: row.status,
    budgetMode: row.budgetMode,
    budgetAmountMicros: row.budgetAmountMicros,
    currency: row.adAccount.currency,
  };
}

export interface CampaignActionResult {
  campaignId: string;
  campaignName: string;
  platform: Platform;
  before: { status: string; budgetMode: string; budgetAmountMicros: string | null };
  after: Record<string, unknown>;
}

interface ResolvedCampaign {
  id: string;
  clientId: string;
  name: string;
  platform: Platform;
  campaignExternalId: string;
  status: string;
  budgetMode: string;
  budgetAmountMicros: string | null;
  adAccountId: string;
  accountExternalId: string;
  currency: string;
  connectionId: string;
  connectionStatus: string;
  grantedScopes: string[];
}

@Injectable()
export class CampaignActionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Yayınlanmış kampanyaları listeler — "hangi kampanya" sorusunu çözmek için.
   *
   * Yalnızca `campaigns` tablosundan okuyor, Ads Explorer'ın metrik/tarih
   * aralığı makinesini (`AdsService.explore`) devreye SOKMUYOR: burada
   * gereken tek şey "bu isimde/platformdaki kampanyalardan hangisi", metrik
   * değil — panelin analiz ekranıyla aynı ağır sorguyu tekrar çalıştırmak
   * gereksiz yük olurdu.
   */
  async list(ctx: TenantContext, clientId: string): Promise<CampaignSummary[]> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.campaign.findMany({
        where: { clientId, deletedAt: null },
        orderBy: { name: 'asc' },
        select: OZET_SECIM,
      }),
    );
    // PARA BİRİMİ BURADA DA TAŞINIYOR. Liste `budgetAmountMicros` gösteriyor
    // ve bir müşterinin hesapları FARKLI para birimlerinde olabiliyor
    // (ajansın havuzunda TRY ve USD hesaplar birlikte duruyor); birimsiz bir
    // bütçe listesi iki hesabın rakamlarını karşılaştırılabilir gösterir.
    return rows.map(toSummary);
  }

  /**
   * Tek kampanya özeti — onay kartı önizlemesi için.
   *
   * `applyAction`'ın kendi `resolve()`'undan BİLEREK ayrı: o metot bağlantı/
   * yetki/kota çözümlemesi de yapıyor ve platforma yazmadan hemen önce
   * çağrılmalı. Bu metot yalnızca "kullanıcıya ne göstereceğiz" sorusuna
   * cevap veriyor — bağlantı süresi dolmuş olsa bile önizleme çalışmalı.
   */
  async getSummary(ctx: TenantContext, campaignId: string): Promise<CampaignSummary> {
    const row = await this.prisma.withTenant(ctx, (tx) =>
      tx.campaign.findUnique({
        where: { id: campaignId },
        select: OZET_SECIM,
      }),
    );
    if (!row) throw new NotFoundException('Kampanya bulunamadı');
    return toSummary(row);
  }

  /**
   * Bütçe/durum değiştirir.
   *
   * PLATFORM ÇAĞRISI TRANSACTION İÇİNDE DEĞİL. `withTenant` ~5 saniyelik bir
   * transaction açıyor ve Meta/Google çağrısı bunu aşabiliyor — üretimde üç-
   * dört çağrı 12,5 saniye sürmüştü (CLAUDE.md). Okuma ve denetim kaydı AYRI,
   * kısa transaction'lar; platform çağrısı ikisinin arasında kalıyor.
   */
  async applyAction(
    ctx: TenantContext,
    campaignId: string,
    action: CampaignAction,
  ): Promise<CampaignActionResult> {
    const row = await this.prisma.withTenant(ctx, (tx) => this.resolve(tx, campaignId));

    if (row.connectionStatus !== 'active') {
      throw new BadRequestException(
        `Platform bağlantısı etkin değil (${row.connectionStatus}) — yeniden bağlanmak gerekiyor.`,
      );
    }

    const provider = this.providers.get(row.platform);
    const can = provider.canWrite(row.grantedScopes);
    if (!can.ok) {
      throw new BadRequestException(
        `Yazma izni yok: ${can.missing.join(', ')}. Platform onayı gelene kadar bu aksiyon kullanılamaz.`,
      );
    }

    // KOTA — kural motoruyla AYNI katman ('rule_action'). Bütçe/durum
    // değiştirmek elle mi kuraldan mı geldiğine göre değil, İŞİN TÜRÜNE göre
    // önceliklendiriliyor: kota daraldığında veri güncellenememesi, bütçe
    // artırılamamasından ucuz.
    const gate = await this.quota.acquire({
      platform: row.platform,
      adAccountId: row.adAccountId,
      layer: 'rule_action',
    });
    if (!gate.allowed) {
      throw new BadRequestException(`Kota engeli: ${gate.reason}`);
    }

    const request = this.toPlatformRequest(row, action);
    const accessToken = await this.vault.getAccessToken(row.connectionId, provider);
    const result = await provider.applyAction(
      {
        accessToken,
        accountExternalId: row.accountExternalId,
        onRateLimit: (snapshot) =>
          this.quota.record({
            platform: row.platform,
            adAccountId: row.adAccountId,
            endpoint: `campaign_action:${action.type}`,
            snapshot,
          }),
      },
      request,
    );

    const before = {
      status: row.status,
      budgetMode: row.budgetMode,
      budgetAmountMicros: row.budgetAmountMicros,
    };

    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: `campaign.${action.type}`,
        targetType: 'campaign',
        targetId: campaignId,
        clientId: row.clientId,
        before,
        after: result.afterState as Prisma.InputJsonValue,
      }),
    );

    return {
      campaignId,
      campaignName: row.name,
      platform: row.platform,
      before,
      after: result.afterState,
    };
  }

  private toPlatformRequest(row: ResolvedCampaign, action: CampaignAction): PlatformActionRequest {
    if (action.type === 'set_budget') {
      return {
        type: 'set_budget',
        level: 'campaign',
        externalId: row.campaignExternalId,
        amountMicros: action.amountMicros,
        budgetMode: action.budgetMode,
        currency: row.currency,
      };
    }
    return { type: action.type, level: 'campaign', externalId: row.campaignExternalId };
  }

  private async resolve(tx: TenantClient, campaignId: string): Promise<ResolvedCampaign> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        client_id: string;
        name: string;
        platform: Platform;
        campaign_external_id: string;
        status: string;
        budget_mode: string;
        budget_amount_micros: string | null;
        ad_account_id: string;
        account_external_id: string;
        currency: string;
        connection_id: string;
        connection_status: string;
        granted_scopes: string[];
      }>
    >(Prisma.sql`
      SELECT c.id::text AS id, c.client_id::text AS client_id, c.name,
             c.platform::text AS platform, c.external_id AS campaign_external_id,
             c.status::text AS status, c.budget_mode::text AS budget_mode,
             c.budget_amount_micros::text AS budget_amount_micros,
             a.id::text AS ad_account_id, a.external_id AS account_external_id, a.currency,
             conn.id::text AS connection_id, conn.status::text AS connection_status,
             conn.granted_scopes
      FROM campaigns c
      JOIN ad_accounts a ON a.id = c.ad_account_id
      JOIN platform_connections conn ON conn.id = a.connection_id
      WHERE c.id = ${campaignId}::uuid
    `);
    const r = rows[0];
    if (!r) throw new NotFoundException('Kampanya bulunamadı');

    return {
      id: r.id,
      clientId: r.client_id,
      name: r.name,
      platform: r.platform,
      campaignExternalId: r.campaign_external_id,
      status: r.status,
      budgetMode: r.budget_mode,
      budgetAmountMicros: r.budget_amount_micros,
      adAccountId: r.ad_account_id,
      accountExternalId: r.account_external_id,
      currency: r.currency,
      connectionId: r.connection_id,
      connectionStatus: r.connection_status,
      grantedScopes: r.granted_scopes ?? [],
    };
  }
}
