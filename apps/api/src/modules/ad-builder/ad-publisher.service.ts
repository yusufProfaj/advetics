import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AdDraftRecord, AssetRatio, TenantContext } from '@advetics/shared';
import { PlatformApiError } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { PrismaService } from '../../prisma/prisma.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { AdBuilderService } from './ad-builder.service';
import { AssetStorageService } from './asset-storage.service';
import {
  campaignSpec,
  customizationRules,
  defaultTargeting,
  endTimeFor,
  labelFor,
  placementsFor,
} from './goal-mapping';

/**
 * Taslağı Meta'da yayınlar.
 *
 * BEŞ ADIM ve hepsi başarılı olmalı:
 *   1. Görselleri Meta'ya yükle → image_hash
 *   2. (yalnızca form tipinde) Anlık form oluştur
 *   3. Kampanya (PAUSED)
 *   4. Ad set
 *   5. Kreatif + reklam, sonra kampanyayı ACTIVE'e al
 *
 * ORTADA KALMA SORUNU: 3. adım başarılı, 4. başarısız olursa bütçesiz bir
 * kampanya kalıyor. Bu yüzden oluşturulan her varlık kaydediliyor ve hata
 * durumunda TERS SIRADA siliniyor — boost akışıyla aynı desen.
 *
 * NOT: bu yol canlı Meta API'sinde hiç çalıştırılmadı (`ads_management` onayı
 * bekleniyor). Hata yolları ve eşlemeler test edildi, gerçek yanıt görülmedi.
 */
@Injectable()
export class AdPublisherService {
  private readonly logger = new Logger(AdPublisherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly drafts: AdBuilderService,
    private readonly storage: AssetStorageService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  async publish(ctx: TenantContext, draftId: string): Promise<AdDraftRecord> {
    const draft = await this.drafts.get(ctx, draftId);

    // ENGELLEYİCİLER YAYINDAN ÖNCE. Aynı kontroller arayüzde de çalışıyor ama
    // orada geçen bir istek burada da geçmeli — API doğrudan da çağrılabilir.
    const check = await this.drafts.publishCheck(ctx, draftId);
    if (!check.ok) {
      throw new BadRequestException(check.blockers.join(' '));
    }

    const auth = await this.resolveAuth(ctx, draft);
    const provider = this.providers.get('meta');
    const can = provider.canWrite(auth.grantedScopes);
    if (!can.ok) {
      throw new BadRequestException(
        `Yazma izni yok: ${can.missing.join(', ')}. ` +
          'Meta onayı gelene kadar reklam yayınlanamaz.',
      );
    }

    const gate = await this.quota.acquire({
      platform: 'meta',
      adAccountId: draft.adAccountId,
      // Kullanıcı ekranda bekliyor: öncelikli kova.
      layer: 'interactive',
    });
    if (!gate.allowed) {
      throw new BadRequestException(
        `Meta kotası şu an dolu (${gate.reason}). Birkaç dakika sonra tekrar dene.`,
      );
    }

    await this.setStatus(ctx, draftId, 'publishing', null);

    const accessToken = await this.vault.getAccessToken(auth.connectionId, provider);
    const fetchCtx = {
      accessToken,
      accountExternalId: auth.accountExternalId,
      onRateLimit: (snapshot: Parameters<NonNullable<typeof this.quota.record>>[0]['snapshot']) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: draft.adAccountId,
          endpoint: 'ad-builder:publish',
          snapshot,
        }),
    };

    try {
      // 1. GÖRSELLER. Hash'ler taslağa kaydediliyor: yayın başarısız olup
      //    tekrar denenirse aynı görseller yeniden yüklenmesin.
      const hashes = await this.uploadImages(ctx, draft, fetchCtx);

      const result = await provider.publishDraft(fetchCtx, {
        adAccountExternalId: auth.accountExternalId,
        pageExternalId: auth.pageExternalId,
        name: draft.name,
        spec: campaignSpec(draft.goal, auth.pageExternalId),
        primaryText: draft.primaryText,
        headline: draft.headline ?? undefined,
        description: draft.description ?? undefined,
        linkUrl: draft.linkUrl ?? undefined,
        whatsappNumber: draft.whatsappNumber ?? undefined,
        dailyBudgetMicros: BigInt(draft.dailyBudgetMicros),
        endTime: endTimeFor(draft.durationDays, new Date()),
        currency: auth.currency,
        images: hashes,
        targeting: defaultTargeting(),
        placements: placementsFor(hashes.map((h) => h.ratio)),
        customizationRules:
          hashes.length > 1 ? customizationRules(hashes.map((h) => h.ratio)) : null,
      });

      await this.prisma.withTenant(ctx, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE ad_drafts SET
            status = 'published',
            external_campaign_id = ${result.campaignId},
            external_ad_set_id = ${result.adSetId},
            external_creative_id = ${result.creativeId},
            external_ad_id = ${result.adId},
            external_lead_form_id = ${result.leadFormId ?? null},
            error = NULL,
            published_at = now(),
            updated_at = now()
          WHERE id = ${draftId}::uuid AND org_id = ${ctx.orgId}::uuid
        `),
      );
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.setStatus(ctx, draftId, 'failed', message.slice(0, 2000));
      this.logger.error(`Reklam yayınlanamadı (${draftId}): ${message}`);
      throw new BadRequestException(message);
    }

    return this.drafts.get(ctx, draftId);
  }

  /**
   * Görselleri Meta'ya yükler ve hash'leri saklar.
   *
   * ZATEN YÜKLENMİŞ OLANLAR ATLANI YOR. Başarısız bir yayından sonra tekrar
   * denendiğinde aynı görselleri yeniden yüklemek hem kota harcar hem
   * Meta'da mükerrer kayıt bırakır.
   */
  private async uploadImages(
    ctx: TenantContext,
    draft: AdDraftRecord,
    fetchCtx: Parameters<ReturnType<ProviderRegistry['get']>['uploadAdImage']>[0],
  ): Promise<Array<{ ratio: AssetRatio; hash: string }>> {
    const provider = this.providers.get('meta');
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{ id: string; ratio: AssetRatio; storage_key: string; meta_image_hash: string | null }>
      >(Prisma.sql`
        SELECT id, ratio, storage_key, meta_image_hash
        FROM ad_draft_assets WHERE draft_id = ${draft.id}::uuid
      `),
    );

    const out: Array<{ ratio: AssetRatio; hash: string }> = [];
    for (const row of rows) {
      if (row.meta_image_hash) {
        out.push({ ratio: row.ratio, hash: row.meta_image_hash });
        continue;
      }
      const bytes = await this.storage.read(row.storage_key);
      const hash = await provider.uploadAdImage(fetchCtx, {
        // ETİKET ORANLA AYNI: kreatifteki `asset_customization_rules` bu
        // etiketle görseli eşleştiriyor. Rastgele bir ad kullanmak, kuralın
        // hiçbir görsele bağlanmaması demek olurdu.
        name: labelFor(row.ratio),
        bytes,
      });
      await this.prisma.withTenant(ctx, (tx) =>
        tx.$executeRaw(Prisma.sql`
          UPDATE ad_draft_assets SET meta_image_hash = ${hash} WHERE id = ${row.id}::uuid
        `),
      );
      out.push({ ratio: row.ratio, hash });
    }

    // KARE HER ZAMAN İLK. Kreatif tek görselli yolda ilk elemanı kullanıyor
    // ve orada kare olmalı; sıra veritabanından rastgele gelirse dikey görsel
    // akışta çıkardı.
    return out.sort((a, b) => (a.ratio === 'square' ? -1 : b.ratio === 'square' ? 1 : 0));
  }

  private async resolveAuth(
    ctx: TenantContext,
    draft: AdDraftRecord,
  ): Promise<{
    connectionId: string;
    accountExternalId: string;
    pageExternalId: string;
    currency: string;
    grantedScopes: string[];
  }> {
    const [row] = await this.prisma.withTenant(ctx, (tx) =>
      tx.$queryRaw<
        Array<{
          connection_id: string;
          account_external_id: string;
          page_external_id: string;
          currency: string;
          granted_scopes: string[];
          status: string;
        }>
      >(Prisma.sql`
        SELECT a.connection_id::text AS connection_id,
               a.external_id AS account_external_id,
               sp.external_id AS page_external_id,
               a.currency, c.granted_scopes, c.status::text AS status
        FROM ad_accounts a
        JOIN platform_connections c ON c.id = a.connection_id
        JOIN social_profiles sp ON sp.id = ${draft.socialProfileId}::uuid
        WHERE a.id = ${draft.adAccountId}::uuid
      `),
    );
    if (!row) throw new BadRequestException('Reklam hesabı bağlantısı bulunamadı');
    if (row.status !== 'active') {
      throw new BadRequestException(
        `Platform bağlantısı etkin değil (${row.status}) — yeniden bağlanmak gerekiyor.`,
      );
    }
    return {
      connectionId: row.connection_id,
      accountExternalId: row.account_external_id,
      pageExternalId: row.page_external_id,
      currency: row.currency,
      grantedScopes: row.granted_scopes ?? [],
    };
  }

  private async setStatus(
    ctx: TenantContext,
    draftId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE ad_drafts SET status = ${status}, error = ${error}, updated_at = now()
        WHERE id = ${draftId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
  }
}
