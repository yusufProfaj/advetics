import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertAssigned } from '../common/utils/ad-account-assignment';
import { PrismaAdminService } from '../prisma/prisma-admin.service';
import { PlatformApiError, type PlatformStructure } from '../modules/connections/provider.types';
import { ProviderRegistry } from '../modules/connections/provider.registry';
import { TokenVaultService } from '../modules/connections/token-vault.service';
import { QuotaGuardService } from './quota-guard.service';

/**
 * L1 — reklam hiyerarşisini platformdan çekip veritabanına yazar.
 *
 * Bu servis üç zor problemi çözüyor:
 *
 *   1. TOPLU UPSERT. Prisma'nın `upsert`i satır başına bir sorgu atıyor; 2.000
 *      reklamlı bir hesapta bu 2.000 round-trip demek. Bunun yerine ham
 *      `INSERT … ON CONFLICT … RETURNING` kullanıyoruz: seviye başına TEK
 *      sorgu, ve `RETURNING` sayesinde dış kimlik → iç UUID eşlemesini aynı
 *      turda alıyoruz (alt seviyenin foreign key'i için gerekiyor).
 *
 *   2. YABANCI ANAHTAR SIRASI. creative → campaign → ad_group → ad. Ters sırada
 *      yazmak FK ihlali verir.
 *
 *   3. SİLİNME TESPİTİ. Platformda silinen varlık soft delete ediliyor; geçmiş
 *      metrikleri `insights_daily`'de duruyor ve raporlardan kaybolmamalı.
 *      KRİTİK: silme yalnızca sonuç TAM ise yapılıyor. Kısmi bir taramada
 *      (kota tükendi, sayfalama kesildi) eksik varlıkları silinmiş saymak, bir
 *      hesabın tüm kampanyalarını yok etmek olurdu.
 */

export interface StructureSyncResult {
  rows: number;
  apiCalls: number;
  softDeleted: number;
  note?: string;
}

/** Tek bir seviyenin upsert sonucu: dış kimlik → iç UUID. */
type IdMap = Map<string, string>;

@Injectable()
export class StructureSyncService {
  private readonly logger = new Logger(StructureSyncService.name);

  constructor(
    private readonly db: PrismaAdminService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * Bir reklam hesabının yapısını senkronize eder.
   *
   * `full` true ise delta atlanıp tam tarama yapılır — silinme tespiti yalnızca
   * böyle mümkün. Zamanlanmış işler delta çalışır, ilk bağlantı ve günlük bir
   * kez tam tarama.
   */
  async syncAccount(params: {
    adAccountId: string;
    full?: boolean;
  }): Promise<StructureSyncResult> {
    const found = await this.db.adAccount.findUniqueOrThrow({
      where: { id: params.adAccountId },
      select: {
        id: true,
        clientId: true,
        connectionId: true,
        platform: true,
        externalId: true,
        managerExternalId: true,
        lastStructureSyncAt: true,
      },
    });

    // ATANMAMIŞ HESAP BURADA DURUR. Yazılacak her satır (`campaigns`,
    // `ad_groups`, `ads`, `creatives`) `client_id` taşıyor ve NULL yazmak o
    // satırları RLS altında görünmez kılardı — iş "başarılı" biter, panelde
    // hiçbir şey çıkmaz.
    const account = assertAssigned(found);

    const provider = this.providers.get(account.platform);
    const accessToken = await this.vault.getAccessToken(account.connectionId, provider);

    // Delta penceresi: son senkronizasyondan 1 saat GERİYE alıyoruz.
    //
    // Platformun `updated_time` alanı ile bizim saatimiz arasındaki kayma ve
    // senkronizasyon sırasında yapılan değişiklikler yüzünden tam sınırdan
    // başlamak varlık kaçırıyor. Bir saatlik örtüşme, aynı satırı tekrar
    // yazmaktan başka maliyet üretmiyor (upsert idempotent).
    const since =
      params.full || !account.lastStructureSyncAt
        ? undefined
        : new Date(account.lastStructureSyncAt.getTime() - 3_600_000);

    let structure: PlatformStructure;
    try {
      structure = await provider.fetchStructure(
        {
          accessToken,
          accountExternalId: account.externalId,
          // Google alt hesap sorgularında MCC kimliği ZORUNLU; Meta yok sayar.
          loginCustomerId: account.managerExternalId ?? undefined,
          onRateLimit: (snapshot) =>
            this.quota.record({
              platform: account.platform,
              clientId: account.clientId,
              adAccountId: account.id,
              endpoint: 'structure',
              snapshot,
            }),
        },
        since,
      );
    } catch (err) {
      // Platform bizi bloklarsa devre kesiciyi aç: aynı hesaba yeniden
      // yüklenmek bloğu uzatır.
      if (err instanceof PlatformApiError && err.kind === 'rate_limited') {
        await this.quota.tripBreaker(
          account.platform,
          account.id,
          err.detail?.retryAfterSeconds ?? 900,
        );
      }
      throw err;
    }

    const creativeIds = await this.upsertCreatives(account, structure);
    const campaignIds = await this.upsertCampaigns(account, structure);
    const adGroupIds = await this.upsertAdGroups(account, structure, campaignIds);
    const adCount = await this.upsertAds(account, structure, adGroupIds, creativeIds);

    const rows =
      structure.creatives.length + structure.campaigns.length + structure.adGroups.length + adCount;

    // Silme yalnızca TAM taramada. Delta sonucunda dönmeyen varlık
    // "değişmemiş" demek, "silinmiş" demek değil.
    let softDeleted = 0;
    if (structure.complete && !since) {
      softDeleted = await this.softDeleteMissing(account, structure);
    }

    await this.db.adAccount.update({
      where: { id: account.id },
      data: { lastStructureSyncAt: new Date() },
    });

    const note = [
      since ? 'delta' : 'tam tarama',
      `${structure.campaigns.length} kampanya`,
      `${structure.adGroups.length} ad group`,
      `${adCount} reklam`,
      softDeleted > 0 ? `${softDeleted} silindi` : undefined,
      structure.complete ? undefined : 'KISMİ',
    ]
      .filter(Boolean)
      .join(' · ');

    return { rows, apiCalls: structure.apiCalls, softDeleted, note };
  }

  // ---------------------------------------------------------------------------
  // Seviye seviye upsert
  // ---------------------------------------------------------------------------

  private async upsertCreatives(
    account: { id: string; clientId: string; platform: 'meta' | 'google' },
    structure: PlatformStructure,
  ): Promise<IdMap> {
    if (structure.creatives.length === 0) return new Map();

    const values = structure.creatives.map(
      (c) => Prisma.sql`(
        gen_random_uuid(), ${account.id}::uuid, ${account.clientId}::uuid,
        ${account.platform}::"Platform", ${c.externalId}, ${c.creativeType ?? null},
        ${this.cap(c.headline, 512)}, ${c.primaryText ?? null}, ${c.description ?? null},
        ${this.cap(c.ctaType, 60)}, ${this.cap(c.destinationUrl, 2048)},
        ${this.cap(c.displayUrl, 512)}, ${this.json(c.assetUrls)}, ${this.json(c.raw)},
        now(), now()
      )`,
    );

    return this.runUpsert(
      Prisma.sql`
        INSERT INTO creatives (
          id, ad_account_id, client_id, platform, external_id, creative_type,
          headline, primary_text, description, cta_type, destination_url,
          display_url, asset_urls, raw, synced_at, updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (platform, external_id) DO UPDATE SET
          -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
          -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
          -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
          -- Kaynak HER ZAMAN hesabin o anki musterisi.
          client_id = EXCLUDED.client_id,
          ad_account_id = EXCLUDED.ad_account_id,
          creative_type = EXCLUDED.creative_type,
          headline = EXCLUDED.headline,
          primary_text = EXCLUDED.primary_text,
          description = EXCLUDED.description,
          cta_type = EXCLUDED.cta_type,
          destination_url = EXCLUDED.destination_url,
          display_url = EXCLUDED.display_url,
          asset_urls = EXCLUDED.asset_urls,
          raw = EXCLUDED.raw,
          synced_at = now(),
          updated_at = now()
        RETURNING id, external_id
      `,
    );
  }

  private async upsertCampaigns(
    account: { id: string; clientId: string; platform: 'meta' | 'google' },
    structure: PlatformStructure,
  ): Promise<IdMap> {
    if (structure.campaigns.length === 0) return new Map();

    const values = structure.campaigns.map(
      (c) => Prisma.sql`(
        gen_random_uuid(), ${account.id}::uuid, ${account.clientId}::uuid,
        ${account.platform}::"Platform", ${c.externalId}, ${this.cap(c.name, 512)},
        ${this.cap(c.objective, 60)}, ${c.status}::"EntityStatus",
        ${this.cap(c.effectiveStatus, 60)}, ${c.budgetMode}::"BudgetMode",
        ${c.budgetAmountMicros ?? null}, ${this.cap(c.bidStrategy, 60)},
        ${c.startTime ?? null}, ${c.stopTime ?? null}, ${this.json(c.raw)},
        ${c.platformUpdatedAt ?? null}, now(), now()
      )`,
    );

    return this.runUpsert(
      Prisma.sql`
        INSERT INTO campaigns (
          id, ad_account_id, client_id, platform, external_id, name, objective,
          status, effective_status, budget_mode, budget_amount_micros,
          bid_strategy, start_time, stop_time, raw, platform_updated_at, synced_at,
          updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (platform, external_id) DO UPDATE SET
          -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
          -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
          -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
          -- Kaynak HER ZAMAN hesabin o anki musterisi.
          client_id = EXCLUDED.client_id,
          name = EXCLUDED.name,
          objective = EXCLUDED.objective,
          status = EXCLUDED.status,
          effective_status = EXCLUDED.effective_status,
          budget_mode = EXCLUDED.budget_mode,
          budget_amount_micros = EXCLUDED.budget_amount_micros,
          bid_strategy = EXCLUDED.bid_strategy,
          start_time = EXCLUDED.start_time,
          stop_time = EXCLUDED.stop_time,
          raw = EXCLUDED.raw,
          platform_updated_at = EXCLUDED.platform_updated_at,
          synced_at = now(),
          updated_at = now(),
          -- Platformda yeniden görünen varlık "geri gelmiş" sayılır.
          deleted_at = NULL
        RETURNING id, external_id
      `,
    );
  }

  private async upsertAdGroups(
    account: { id: string; clientId: string; platform: 'meta' | 'google' },
    structure: PlatformStructure,
    campaignIds: IdMap,
  ): Promise<IdMap> {
    // Delta senkronizasyonda ad group'un kampanyası DEĞİŞMEMİŞ olabilir ve bu
    // turda dönmemiştir. O yüzden eksik kampanyaları veritabanından tamamlıyoruz;
    // aksi hâlde değişen bir ad group'u atlardık.
    const missing = [
      ...new Set(
        structure.adGroups
          .map((g) => g.campaignExternalId)
          .filter((id) => id.length > 0 && !campaignIds.has(id)),
      ),
    ];
    if (missing.length > 0) {
      const known = await this.db.campaign.findMany({
        where: { platform: account.platform, externalId: { in: missing } },
        select: { id: true, externalId: true },
      });
      known.forEach((c) => campaignIds.set(c.externalId, c.id));
    }

    const usable = structure.adGroups.filter((g) => campaignIds.has(g.campaignExternalId));
    const orphans = structure.adGroups.length - usable.length;
    if (orphans > 0) {
      // Kampanyası bilinmeyen ad group yazılamaz (FK). Bu, kampanya sorgusunun
      // eksik döndüğünü gösterir — sessizce atlamak veri kaybını gizler.
      this.logger.warn(
        `${account.platform} hesap ${account.id}: ${orphans} ad group kampanyası bulunamadığı için atlandı`,
      );
    }
    if (usable.length === 0) return new Map();

    const values = usable.map(
      (g) => Prisma.sql`(
        gen_random_uuid(), ${campaignIds.get(g.campaignExternalId)!}::uuid,
        ${account.id}::uuid, ${account.clientId}::uuid,
        ${account.platform}::"Platform", ${g.externalId}, ${this.cap(g.name, 512)},
        ${g.status}::"EntityStatus", ${this.cap(g.effectiveStatus, 60)},
        ${g.budgetMode}::"BudgetMode", ${g.budgetAmountMicros ?? null},
        ${g.bidAmountMicros ?? null}, ${this.cap(g.optimizationGoal, 60)},
        ${this.json(g.targeting)}, ${g.startTime ?? null}, ${g.stopTime ?? null},
        ${this.json(g.raw)}, ${g.platformUpdatedAt ?? null}, now(), now()
      )`,
    );

    return this.runUpsert(
      Prisma.sql`
        INSERT INTO ad_groups (
          id, campaign_id, ad_account_id, client_id, platform, external_id, name,
          status, effective_status, budget_mode, budget_amount_micros,
          bid_amount_micros, optimization_goal, targeting, start_time, stop_time,
          raw, platform_updated_at, synced_at, updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (platform, external_id) DO UPDATE SET
          -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
          -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
          -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
          -- Kaynak HER ZAMAN hesabin o anki musterisi.
          client_id = EXCLUDED.client_id,
          campaign_id = EXCLUDED.campaign_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          effective_status = EXCLUDED.effective_status,
          budget_mode = EXCLUDED.budget_mode,
          budget_amount_micros = EXCLUDED.budget_amount_micros,
          bid_amount_micros = EXCLUDED.bid_amount_micros,
          optimization_goal = EXCLUDED.optimization_goal,
          targeting = EXCLUDED.targeting,
          start_time = EXCLUDED.start_time,
          stop_time = EXCLUDED.stop_time,
          raw = EXCLUDED.raw,
          platform_updated_at = EXCLUDED.platform_updated_at,
          synced_at = now(),
          updated_at = now(),
          deleted_at = NULL
        RETURNING id, external_id
      `,
    );
  }

  private async upsertAds(
    account: { id: string; clientId: string; platform: 'meta' | 'google' },
    structure: PlatformStructure,
    adGroupIds: IdMap,
    creativeIds: IdMap,
  ): Promise<number> {
    const missing = [
      ...new Set(
        structure.ads.map((a) => a.adGroupExternalId).filter((id) => id.length > 0 && !adGroupIds.has(id)),
      ),
    ];
    if (missing.length > 0) {
      const known = await this.db.adGroup.findMany({
        where: { platform: account.platform, externalId: { in: missing } },
        select: { id: true, externalId: true },
      });
      known.forEach((g) => adGroupIds.set(g.externalId, g.id));
    }

    // Creative de delta'da dönmemiş olabilir.
    const missingCreatives = [
      ...new Set(
        structure.ads
          .map((a) => a.creativeExternalId)
          .filter((id): id is string => !!id && !creativeIds.has(id)),
      ),
    ];
    if (missingCreatives.length > 0) {
      const known = await this.db.creative.findMany({
        where: { platform: account.platform, externalId: { in: missingCreatives } },
        select: { id: true, externalId: true },
      });
      known.forEach((c) => creativeIds.set(c.externalId, c.id));
    }

    const usable = structure.ads.filter((a) => adGroupIds.has(a.adGroupExternalId));
    const orphans = structure.ads.length - usable.length;
    if (orphans > 0) {
      this.logger.warn(
        `${account.platform} hesap ${account.id}: ${orphans} reklam ad group'u bulunamadığı için atlandı`,
      );
    }
    if (usable.length === 0) return 0;

    const values = usable.map(
      (a) => Prisma.sql`(
        gen_random_uuid(), ${adGroupIds.get(a.adGroupExternalId)!}::uuid,
        ${account.id}::uuid, ${account.clientId}::uuid,
        ${account.platform}::"Platform", ${a.externalId}, ${this.cap(a.name, 512)},
        ${a.status}::"EntityStatus", ${this.cap(a.effectiveStatus, 60)},
        ${a.creativeExternalId ? (creativeIds.get(a.creativeExternalId) ?? null) : null}::uuid,
        ${this.cap(a.previewUrl, 1024)}, ${this.cap(a.reviewStatus, 60)},
        ${this.json(a.disapprovalReasons)}, ${this.json(a.raw)},
        ${a.platformUpdatedAt ?? null}, now(), now()
      )`,
    );

    const written = await this.runUpsert(
      Prisma.sql`
        INSERT INTO ads (
          id, ad_group_id, ad_account_id, client_id, platform, external_id, name,
          status, effective_status, creative_id, preview_url, review_status,
          disapproval_reasons, raw, platform_updated_at, synced_at, updated_at
        ) VALUES ${Prisma.join(values)}
        ON CONFLICT (platform, external_id) DO UPDATE SET
          -- MUSTERI DE GUNCELLENIYOR. Hesap baska bir musteriye atandiginda
          -- eski satirlarin client_id'si degismiyordu; upsert onu atladigi
          -- icin "yeniden senkronize et" tavsiyesi de ise yaramiyordu.
          -- Kaynak HER ZAMAN hesabin o anki musterisi.
          client_id = EXCLUDED.client_id,
          ad_group_id = EXCLUDED.ad_group_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          effective_status = EXCLUDED.effective_status,
          -- COALESCE: creative bu turda dönmediyse mevcut bağı KORU. EXCLUDED
          -- ile ezmek, delta senkronizasyonda her reklamın creative bağını
          -- koparırdı.
          creative_id = COALESCE(EXCLUDED.creative_id, ads.creative_id),
          preview_url = EXCLUDED.preview_url,
          review_status = EXCLUDED.review_status,
          disapproval_reasons = EXCLUDED.disapproval_reasons,
          raw = EXCLUDED.raw,
          platform_updated_at = EXCLUDED.platform_updated_at,
          synced_at = now(),
          updated_at = now(),
          deleted_at = NULL
        RETURNING id, external_id
      `,
    );
    return written.size;
  }

  /**
   * Platformda artık olmayan varlıkları soft delete eder.
   *
   * `syncedAt` karşılaştırması kullanıyoruz, dış kimlik listesi değil: binlerce
   * kimliği `NOT IN` ile göndermek sorguyu şişirir ve parametre sınırına
   * çarpar. Bu turda yazılan her satırın `synced_at`i güncellendi; dokunulmamış
   * olanlar platformdan dönmemiş olanlardır.
   */
  private async softDeleteMissing(
    account: { id: string; platform: 'meta' | 'google' },
    structure: PlatformStructure,
  ): Promise<number> {
    // Boş bir tarama sonucu neredeyse kesinlikle bir arıza (yetki kaybı, yanlış
    // hesap kimliği). Hesabın tamamını silmek yerine durup uyarıyoruz.
    if (structure.campaigns.length === 0) {
      this.logger.warn(
        `${account.platform} hesap ${account.id}: tam tarama 0 kampanya döndürdü — silme ATLANDI`,
      );
      return 0;
    }

    // Bu senkronizasyon turunun başlangıcı. Tur içinde yazılan satırların
    // synced_at'i bundan sonra; dokunulmayanların öncesinde.
    const cutoff = new Date(Date.now() - 60_000);
    let total = 0;

    for (const table of ['ads', 'ad_groups', 'campaigns'] as const) {
      const result = await this.db.$executeRaw(
        Prisma.sql`
          UPDATE ${Prisma.raw(table)}
          SET deleted_at = now(), updated_at = now()
          WHERE ad_account_id = ${account.id}::uuid
            AND deleted_at IS NULL
            AND synced_at < ${cutoff}
        `,
      );
      total += result;
    }

    if (total > 0) {
      this.logger.log(
        `${account.platform} hesap ${account.id}: ${total} varlık platformda bulunamadı, soft delete edildi`,
      );
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  /**
   * `updated_at` HER INSERT'te açıkça verilmek zorunda.
   *
   * Prisma'nın `@updatedAt` alanı UYGULAMA seviyesinde çalışıyor — veritabanı
   * kolonu `NOT NULL` ve DEFAULT'u YOK. Prisma istemcisini atlayıp ham SQL
   * yazdığımız için bu otomatizmayı da atlıyoruz; kolonu unutmak tüm
   * senkronizasyonu 23502 ile düşürüyordu.
   */
  private async runUpsert(query: Prisma.Sql): Promise<IdMap> {
    const rows = await this.db.$queryRaw<Array<{ id: string; external_id: string }>>(query);
    return new Map(rows.map((r) => [r.external_id, r.id]));
  }

  /**
   * Kolon uzunluğuna kırpar.
   *
   * Platformlar sözleşmede yazandan uzun değer döndürebiliyor (özellikle
   * `name` ve URL'ler). Kırpmamak tek uzun satır yüzünden TÜM hesabın
   * senkronizasyonunu 22001 hatasıyla düşürürdü.
   */
  private cap(value: string | undefined, max: number): string | null {
    if (value === undefined || value === null) return null;
    return value.length > max ? value.slice(0, max) : value;
  }

  /** `undefined` ile SQL NULL'ı ayır; Prisma.sql `undefined`ı kabul etmiyor. */
  private json(value: unknown): Prisma.Sql {
    if (value === undefined || value === null) return Prisma.sql`NULL`;
    return Prisma.sql`${JSON.stringify(value)}::jsonb`;
  }
}
