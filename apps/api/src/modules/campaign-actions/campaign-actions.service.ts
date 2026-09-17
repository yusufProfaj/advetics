import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CanliKampanyaListesi,
  CanliKampanyaOzeti,
  Platform,
  TenantContext,
} from '@advetics/shared';
import { PrismaService, type TenantClient } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { SyncQueueService } from '../../queue/sync-queue.service';
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
  | { type: 'copy'; name?: string; deepCopy: boolean }
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
    private readonly queue: SyncQueueService,
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
  /**
   * ═══ PANELDEKİ "YAYINDA OLANLAR" LİSTESİ ═══
   *
   * `list()`ten farkı: bu liste EKRAN için ve satır başına durum, hesap adı,
   * son senkron ve SON 7 GÜNÜN performansı taşıyor. `list()` asistanın
   * "hangi kampanyayı kastediyorsun" sorusu için yazılmıştı ve orada bu
   * alanların hiçbiri gerekmiyor.
   *
   * YENİ PLATFORM ÇAĞRISI YOK. Metrikler `insights_daily`den; gecelik
   * süpürme onu zaten dolduruyor ve bir liste ekranı için kota harcamak,
   * kotayı asıl işten (senkronizasyon) çalmak olurdu.
   *
   * `LEFT JOIN ad_accounts` — İÇ BİRLEŞTİRME DEĞİL. `ad_accounts`
   * politikası ATANMIŞ satırı aktif workspace'e daraltıyor; reklam hesabı
   * başka bir workspace'e taşınmışsa iç birleştirme, o hesapla kurulmuş
   * YAYINDAKİ kampanyayı listeden sessizce düşürürdü. Aynı tuzağa taslak
   * listesinde düşüldü ve `taslak-listesi-rls.spec.ts` ile kilitlendi.
   */
  async canliListe(ctx: TenantContext, clientId: string): Promise<CanliKampanyaListesi> {
    const scoped = { ...ctx, activeClientId: clientId };
    return this.prisma.withTenant(scoped, async (tx) => {
      const rows = await tx.$queryRaw<CanliSatir[]>(Prisma.sql`
        SELECT c.id::text AS id, c.name, c.platform::text AS platform,
               c.objective, c.status::text AS status, c.effective_status,
               c.budget_mode::text AS budget_mode,
               c.budget_amount_micros::text AS budget_amount_micros,
               c.ad_account_id::text AS ad_account_id,
               a.name AS ad_account_name, a.currency,
               c.synced_at,
               m.spend_micros::text AS spend_micros, m.impressions, m.clicks,
               m.conversions::float8 AS conversions
          FROM campaigns c
          LEFT JOIN ad_accounts a ON a.id = c.ad_account_id
          LEFT JOIN LATERAL (
            SELECT SUM(i.spend_micros) AS spend_micros,
                   SUM(i.impressions)  AS impressions,
                   SUM(i.clicks)       AS clicks,
                   SUM(i.conversions)  AS conversions
              FROM insights_daily i
             WHERE i.entity_level = 'campaign'::"EntityLevel"
               AND i.entity_id = c.id
               -- KIRILIMSIZ SATIRLAR. Kırılım satırlarını da toplamak aynı
               -- harcamayı yaş/cinsiyet sayısı kadar tekrar saymak olurdu.
               AND i.breakdown_key = ''
               AND i.date >= CURRENT_DATE - INTERVAL '7 days'
          ) m ON TRUE
         WHERE c.client_id = ${clientId}::uuid AND c.deleted_at IS NULL
         ORDER BY (c.status = 'active'::"EntityStatus") DESC,
                  m.spend_micros DESC NULLS LAST,
                  c.name
         LIMIT ${CANLI_LISTE_SINIRI}
      `);

      // SAYIM AYRI SORGUDA: liste kesiliyor ve kaçının dışarıda kaldığını
      // söylemek zorundayız.
      const [sayim] = await tx.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
        SELECT count(*) AS n FROM campaigns
         WHERE client_id = ${clientId}::uuid AND deleted_at IS NULL
      `);

      return {
        rows: rows.map(toCanliOzet),
        toplam: Number(sayim?.n ?? rows.length),
      };
    });
  }

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

    /*
     * ═══ KOPYA PANELDE GÖRÜNMELİ — YAPI TARAMASI KUYRUĞA ═══
     *
     * Kopya platformda oluştu ama BİZDE yok: `campaigns` tablosuna onu
     * ancak yapı taraması yazıyor ve o tarama altı saatte bir koşuyor.
     * Kuyruğa almadan bırakmak, kullanıcının az önce oluşturduğu kampanyayı
     * panelde görememesi ve ikinci kez kopyalaması demek.
     *
     * KUYRUK HATASI KOPYAYI GEÇERSİZ KILMIYOR: kampanya platformda duruyor
     * ve dönüş değeri onu söylüyor. Bu yüzden hata yutulmuyor ama
     * fırlatılmıyor da — yalnızca not olarak dönüyor.
     */
    let senkronNotu: string | null = null;
    if (action.type === 'copy') {
      try {
        await this.queue.enqueue({
          clientId: row.clientId,
          platform: row.platform,
          jobType: 'structure',
          adAccountId: row.adAccountId,
          // Kullanıcı ekranda bekliyor: takılmış bir yapı taraması varsa
          // kaldırılıp yenisi konsun.
          interactive: true,
        });
      } catch (err) {
        senkronNotu =
          'Kopya oluştu ama senkronizasyon kuyruğa alınamadı: ' +
          (err instanceof Error ? err.message : String(err));
      }
    }

    return {
      campaignId,
      campaignName: row.name,
      platform: row.platform,
      before,
      after: { ...result.afterState, ...(senkronNotu ? { senkronNotu } : {}) },
    };
  }

  private toPlatformRequest(row: ResolvedCampaign, action: CampaignAction): PlatformActionRequest {
    if (action.type === 'copy') {
      return {
        type: 'copy',
        level: 'campaign',
        externalId: row.campaignExternalId,
        name: action.name,
        deepCopy: action.deepCopy,
      };
    }
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

/**
 * Ekran listesinin üst sınırı.
 *
 * Büyük bir hesapta yüzlerce kampanya var ve hepsini tek sayfaya basmak
 * ekranı okunmaz yapıyor. Sınırın kendisi zararsız, SESSİZ OLMASI zararlı:
 * `toplam` ayrıca dönüyor ve ekran kaçının gösterildiğini yazıyor.
 */
const CANLI_LISTE_SINIRI = 50;

interface CanliSatir {
  id: string;
  name: string;
  platform: string;
  objective: string | null;
  status: string;
  effective_status: string | null;
  budget_mode: string;
  budget_amount_micros: string | null;
  ad_account_id: string;
  ad_account_name: string | null;
  currency: string | null;
  synced_at: Date;
  spend_micros: string | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
}

function toCanliOzet(r: CanliSatir): CanliKampanyaOzeti {
  return {
    id: r.id,
    name: r.name,
    platform: r.platform as Platform,
    objective: r.objective,
    status: r.status,
    effectiveStatus: r.effective_status,
    budgetMode: r.budget_mode,
    budgetAmountMicros: r.budget_amount_micros,
    currency: r.currency,
    adAccountId: r.ad_account_id,
    adAccountName: r.ad_account_name,
    syncedAt: r.synced_at.toISOString(),
    /*
     * HİÇ SATIR YOKSA `null` — SIFIR DEĞİL.
     *
     * "Bu kampanya 7 gündür hiç harcamadı" ile "bu kampanyanın verisi
     * gelmedi" aynı şey değil ve ikisinin yapılacak işi farklı: birincisinde
     * kampanyaya bakılır, ikincisinde senkronizasyona.
     */
    son7Gun:
      r.spend_micros === null
        ? null
        : {
            spendMicros: r.spend_micros,
            impressions: Number(r.impressions ?? 0),
            clicks: Number(r.clicks ?? 0),
            conversions: Number(r.conversions ?? 0),
          },
  };
}
