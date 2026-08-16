import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  coverageFor,
  matchRatio,
  packTextsFor,
  type AssetCoverage,
  type AssetRatio,
  type CreativeTexts,
  type DraftCampaignRecord,
  type DraftGroupRecord,
  type PublishCheck,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { PlatformApiError } from '../connections/provider.types';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { AssetUploaderService } from '../assets/asset-uploader.service';
import {
  campaignSpec,
  defaultTargeting,
  labelFor,
  placementsFor,
} from '../ad-builder/goal-mapping';
import { DraftTreeService } from './draft-tree.service';

/**
 * Kampanya taslağı ağacını platformda yayınlar.
 *
 * MEVCUT YAYIN YOLU YENİDEN KULLANILIYOR (`provider.publishDraft`) ve
 * `goal-mapping.ts`'e HİÇ DOKUNULMUYOR. Sebebi §3'ün kendisi: o dosyadaki her
 * karar canlıda öğrenilmiş bir hatanın karşılığı ve ikinci bir eşleme yazmak,
 * altı hatanın düzeltmesinin yalnızca bir yola gitmesi hikâyesini tekrarlamak
 * olurdu.
 *
 * BUNUN BEDELİ BİR KISIT: `publishDraft` tek kampanya + tek ad set + tek
 * reklam yazıyor. Ağaç daha fazlasını TAŞIYABİLİYOR ama yayınlayamıyor ve bu
 * durum kullanıcıya AÇIKÇA söyleniyor. Çok varlıklı yazma yolunu canlıda
 * doğrulamadan yazmak, bu projenin en açık kuralına aykırı: tahmin etmektense
 * kısıtla, kısıtı kullanıcıya söyle.
 */
@Injectable()
export class DraftPublishService {
  private readonly logger = new Logger(DraftPublishService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: DraftTreeService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
    private readonly assetUploader: AssetUploaderService,
  ) {}

  // ---------------------------------------------------------------------------
  // Kontrol
  // ---------------------------------------------------------------------------

  /**
   * Yayınlamadan önce ne eksik, ne riskli.
   *
   * ENGELLEYENLER VE UYARILAR AYRI — mevcut `publishCheck` ile aynı sözleşme.
   * İkisini birleştirmek, "başlığın kısaltılacak" gibi bir notu yayını durduran
   * bir hataya çevirirdi.
   */
  async check(ctx: TenantContext, campaignId: string): Promise<PublishCheck> {
    const campaign = await this.tree.get(ctx, campaignId);
    const blockers: string[] = [];
    const warnings: string[] = [];

    if (campaign.status === 'published') blockers.push('Bu kampanya zaten yayınlanmış.');

    /**
     * GOOGLE HENÜZ YAZILMADI — erişim değil, kod eksik.
     *
     * Erişim 2026-08-16'da alındı ve okuma tarafı canlıda doğrulandı. Mesajın
     * bunu söylemesi önemli: "onay bekleniyor" demek kullanıcıyı çözülmüş bir
     * sorunu çözmeye gönderirdi.
     */
    if (campaign.platform !== 'meta') {
      blockers.push(
        'Google Ads reklam oluşturma henüz yazılmadı. Bağlantı ve okuma tarafı çalışıyor; ' +
          'eksik olan yazma kodu.',
      );
    }

    /**
     * UZMAN YÜZEYİ YAYINI HENÜZ YOK.
     *
     * `goal` NULL demek, kararları kullanıcının verdiği ve `campaignSpec`'in
     * üretemeyeceği bir taslak demek. O yolu yazmadan yayınlamaya çalışmak,
     * ayarların sessizce yok sayılması olurdu.
     */
    if (!campaign.goal) {
      blockers.push('Uzman yüzeyinden kurulan taslakların yayını henüz yazılmadı.');
    }

    /**
     * TEK GRUP, TEK REKLAM KISITI — sessiz değil.
     *
     * Ağaç çoklu taşıyor (K4) ama `publishDraft` tek yazıyor. Fazlasını
     * sessizce atlamak, kullanıcının üç varyant kurup birinin yayınlandığını
     * fark etmemesi demek olurdu.
     */
    if (campaign.adGroups.length !== 1) {
      blockers.push(
        `Bu kampanyada ${campaign.adGroups.length} reklam grubu var; şimdilik tek gruplu ` +
          'kampanyalar yayınlanabiliyor.',
      );
    }
    const group = campaign.adGroups[0];
    const ads = group?.ads ?? [];
    if (group && ads.length !== 1) {
      blockers.push(
        `Bu grupta ${ads.length} reklam var; şimdilik tek reklamlı gruplar yayınlanabiliyor.`,
      );
    }

    if (campaign.platform === 'meta' && !group?.socialProfileId) {
      blockers.push('Reklam bir Facebook sayfası adına yayınlanır — sayfa seçilmemiş.');
    }

    if (campaign.budgetMode === 'none' || !campaign.budgetAmountMicros) {
      blockers.push('Bütçe belirlenmemiş.');
    }

    const linkUrl = (group?.settings?.linkUrl as string | undefined) ?? undefined;
    if (campaign.goal === 'website' && !linkUrl) {
      blockers.push('Web sitesi adresi eksik.');
    }

    let coverage: AssetCoverage[] = [];

    const ad = ads[0];
    if (ad) {
      const creative = await this.loadCreative(ctx, ad.creativeId);

      /**
       * METİN HAVUZUNDAN META PAKETİ.
       *
       * Kreatif iki platformu birden besliyor; hangi metnin Meta'ya gideceğine
       * `packTextsFor` karar veriyor. Sığmayan metin kırpılmıyor, eleniyor ve
       * sebebi buraya uyarı olarak düşüyor — kullanıcı "yazdığım başlık nerede"
       * sorusunu sormak zorunda kalmıyor.
       */
      const packed = packTextsFor('meta_single_image', creative.texts);
      blockers.push(...packed.blockers);
      warnings.push(...packed.warnings);

      if (!packed.primaryText) {
        blockers.push('Ana metin boş — reklamın üstünde görünecek yazı olmadan yayınlanamaz.');
      }
      if (packed.headlines.length === 0) {
        warnings.push('Başlık boş — reklamın altında kalın yazıyla görünen kısım olmayacak.');
      }

      /**
       * KAPSAMA — kova değil, ÖLÇÜLEN BOYUT.
       *
       * `coverageFor` her yuvayı gerçek sayılarla değerlendiriyor ve kırpmanın
       * ne kadarını kaybettireceğini önceden söylüyor. Google bloğu da
       * hesaplanıyor ama yayını ENGELLEMİYOR: yazılmamış bir özellik yüzünden
       * çalışan bir akışı durdurmak olurdu.
       */
      const metaCoverage = coverageFor('meta', creative.assets);
      const googleCoverage = coverageFor('google', creative.assets);
      blockers.push(...metaCoverage.blockers);
      warnings.push(...metaCoverage.warnings);
      coverage = [metaCoverage, googleCoverage];
    } else {
      blockers.push('Kampanyada reklam yok.');
    }

    const budget = BigInt(campaign.budgetAmountMicros ?? '0');
    const days = campaign.endAt
      ? Math.max(
          1,
          Math.round(
            (new Date(campaign.endAt).getTime() - Date.now()) / 86_400_000,
          ),
        )
      : 0;
    const total = days > 0 ? budget * BigInt(days) : null;

    if (!campaign.endAt) {
      // SÜRESİZ KAMPANYA bu üründe en pahalı kullanıcı hatası: unutuluyor.
      warnings.push(
        'Süre sınırı yok — kampanya sen durdurana kadar her gün harcamaya devam eder.',
      );
    }

    const summary =
      total !== null
        ? `${platformLabel(campaign.platform)} · günde ${money(budget)} · ${days} gün · ` +
          `toplam ${money(total)}`
        : `${platformLabel(campaign.platform)} · günde ${money(budget)} · süresiz`;

    return {
      ok: blockers.length === 0,
      blockers,
      warnings,
      summary,
      totalBudgetMicros: (total ?? 0n).toString(),
      assetCoverage: coverage,
    };
  }

  // ---------------------------------------------------------------------------
  // Yayın
  // ---------------------------------------------------------------------------

  /**
   * Bir niyetin BÜTÜN platformlarını yayınlar — her biri BAĞIMSIZ.
   *
   * BU METOT HATA FIRLATMIYOR ve K13'ün bütün gerekçesi bu. Meta çıkar, Google
   * düşer; bu istisna değil normal sonuçtur. Tek bir hata fırlatmak, yayına
   * girmiş Meta kampanyasını kullanıcıdan gizlemek olurdu — hâlbuki o kampanya
   * o anda para harcamaya başlamış oluyor.
   *
   * Her satır kendi durumunu ve kendi hatasını taşıyor; düşen taraf tek başına
   * yeniden denenebiliyor.
   */
  async publishGroup(ctx: TenantContext, campaignId: string): Promise<DraftGroupRecord> {
    const group = await this.tree.getGroup(ctx, campaignId);

    for (const campaign of group.campaigns) {
      if (campaign.status === 'published') continue;
      try {
        await this.publish(ctx, campaign.id);
      } catch (err) {
        // Durum ve sebep zaten `publish` içinde satıra yazıldı; burada
        // yalnızca döngünün devam etmesi önemli.
        this.logger.warn(
          `Kampanya yayınlanamadı (${campaign.id}): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    return this.tree.getGroup(ctx, campaignId);
  }

  /** Tek platform kampanyasını yayınlar. */
  async publish(ctx: TenantContext, campaignId: string): Promise<DraftCampaignRecord> {
    const campaign = await this.tree.get(ctx, campaignId);

    // ENGELLEYİCİLER YAYINDAN ÖNCE. Aynı kontroller arayüzde de çalışıyor ama
    // orada geçen bir istek burada da geçmeli — API doğrudan çağrılabilir.
    const check = await this.check(ctx, campaignId);
    if (!check.ok) {
      await this.fail(ctx, campaignId, check.blockers.join(' '));
      throw new BadRequestException(check.blockers.join(' '));
    }

    const group = campaign.adGroups[0]!;
    const ad = group.ads[0]!;
    const creative = await this.loadCreative(ctx, ad.creativeId);
    const auth = await this.resolveAuth(ctx, campaign, group.socialProfileId!, group.leadFormId);

    const provider = this.providers.get('meta');
    const can = provider.canWrite(auth.grantedScopes);
    if (!can.ok) {
      const message =
        `Yazma izni yok: ${can.missing.join(', ')}. ` +
        'Meta onayı gelene kadar reklam yayınlanamaz.';
      await this.fail(ctx, campaignId, message);
      throw new BadRequestException(message);
    }

    const gate = await this.quota.acquire({
      platform: 'meta',
      adAccountId: campaign.adAccountId,
      // Kullanıcı ekranda bekliyor: öncelikli kova.
      layer: 'interactive',
    });
    if (!gate.allowed) {
      throw new BadRequestException(
        `Meta kotası şu an dolu (${gate.reason}). Birkaç dakika sonra tekrar dene.`,
      );
    }

    await this.setStatus(ctx, campaignId, 'publishing', null);

    const accessToken = await this.vault.getAccessToken(auth.connectionId, provider);
    const fetchCtx = {
      accessToken,
      accountExternalId: auth.accountExternalId,
      onRateLimit: (snapshot: Parameters<NonNullable<typeof this.quota.record>>[0]['snapshot']) =>
        this.quota.record({
          platform: 'meta',
          adAccountId: campaign.adAccountId,
          endpoint: 'draft-tree:publish',
          snapshot,
        }),
    };

    try {
      const images = await this.uploadImages(ctx, campaign.adAccountId, creative, fetchCtx);
      const packed = packTextsFor('meta_single_image', creative.texts);

      const result = await provider.publishDraft(fetchCtx, {
        adAccountExternalId: auth.accountExternalId,
        pageExternalId: auth.pageExternalId,
        name: campaign.name,
        /**
         * SPEC `goal-mapping.ts`'TEN — dosyaya dokunulmadı.
         *
         * `campaignSpec` bugün `ad_drafts` yolunu besliyor ve aynı kararları
         * burada da veriyor. İkinci bir eşleme yazmak, `LEAD_GENERATION` yerine
         * `LINK_CLICKS` sınıfı hataların bir yolda düzeltilip diğerinde
         * kalması demek olurdu.
         */
        spec: campaignSpec(campaign.goal!, auth.pageExternalId),
        primaryText: packed.primaryText ?? '',
        headline: packed.headlines[0],
        description: packed.descriptions[0],
        linkUrl: (group.settings?.linkUrl as string | undefined) ?? undefined,
        whatsappNumber: (group.settings?.whatsappNumber as string | undefined) ?? undefined,
        dailyBudgetMicros: BigInt(campaign.budgetAmountMicros!),
        endTime: campaign.endAt ? new Date(campaign.endAt) : null,
        startTime: campaign.startAt ? new Date(campaign.startAt) : null,
        budgetMode: campaign.budgetMode === 'lifetime' ? 'lifetime' : 'daily',
        leadFormExternalId: auth.leadFormExternalId,
        currency: auth.currency,
        images,
        /**
         * HEDEFLEME VE YERLEŞİM `goal-mapping.ts`'TEN.
         *
         * Yerleşim YÜKLENEN GÖRSELE göre kısıtlanıyor: dikey görsel yoksa
         * Hikâyeler açılmıyor, çünkü otomatik yerleşim kare görseli oraya
         * kırpıyor ve metin kesiliyor.
         */
        targeting: defaultTargeting(),
        placements: placementsFor(images.map((i) => i.ratio)),
        customizationRules: null,
      });

      await this.markPublished(ctx, campaignId, group.id, ad.id, result);
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.fail(ctx, campaignId, message.slice(0, 2000));
      this.logger.error(`Kampanya yayınlanamadı (${campaignId}): ${message}`);
      throw new BadRequestException(message);
    }

    return this.tree.get(ctx, campaignId);
  }

  // ---------------------------------------------------------------------------

  /**
   * Kreatifin görsellerini Meta'ya yükler.
   *
   * HASH HESAP BAŞINA ve önbellek `asset_platform_refs`'te. Aynı görselin iki
   * reklam hesabında iki ayrı hash'i var; A'nın hash'ini B'de kullanmak ya
   * reddediliyor ya da kreatifi GÖRSELSİZ oluşturuyor — reklam yayınlanır,
   * para harcar, boş görünür.
   *
   * `AssetUploaderService` bunu zaten çözüyor ve toplu oluşturucu da onu
   * kullanıyor; ikinci bir önbellek yazmak iki kaynağın ayrışması olurdu.
   */
  private async uploadImages(
    ctx: TenantContext,
    adAccountId: string,
    creative: LoadedCreative,
    fetchCtx: Parameters<AssetUploaderService['ensureExternalRef']>[1]['fetchCtx'],
  ): Promise<Array<{ ratio: AssetRatio; hash: string }>> {
    const out: Array<{ ratio: AssetRatio; hash: string }> = [];

    for (const asset of creative.assets) {
      const ratio = matchRatio(asset.width, asset.height);
      /**
       * ORANA OTURMAYAN GÖRSEL ATLANMIYOR, SAYILIYOR.
       *
       * Kapsama raporu bunu zaten söylüyor ve kontrol aşamasında görünüyor;
       * burada log'a düşmesi, canlıda "üç görsel yükledim ikisi gitti"
       * durumunun izini bırakıyor.
       */
      if (!ratio) {
        this.logger.warn(
          `Kreatif görseli Meta oranlarına oturmuyor, atlandı: ${asset.id} ` +
            `(${asset.width}×${asset.height})`,
        );
        continue;
      }

      // ETİKET ORANLA AYNI: kreatifteki `asset_customization_rules` bu
      // etiketle görseli eşleştiriyor.
      const hash = await this.assetUploader.ensureExternalRef(ctx, {
        assetId: asset.id,
        adAccountId,
        label: labelFor(ratio),
        fetchCtx,
      });
      out.push({ ratio, hash });
    }

    // KARE HER ZAMAN İLK. Kreatif tek görselli yolda ilk elemanı kullanıyor ve
    // orada kare olmalı; sıra veritabanından rastgele gelirse dikey görsel
    // akışta çıkardı.
    return out.sort((a, b) => (a.ratio === 'square' ? -1 : b.ratio === 'square' ? 1 : 0));
  }

  private async loadCreative(ctx: TenantContext, creativeId: string): Promise<LoadedCreative> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<Array<{ texts: CreativeTexts }>>(Prisma.sql`
        SELECT texts FROM ad_creatives
        WHERE id = ${creativeId}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new BadRequestException('Kreatif bulunamadı');

      const assets = await tx.$queryRaw<
        Array<{ id: string; width: number; height: number }>
      >(Prisma.sql`
        SELECT a.id::text AS id, a.width, a.height
        FROM ad_creative_assets ca
        JOIN assets a ON a.id = ca.asset_id
        WHERE ca.creative_id = ${creativeId}::uuid
        ORDER BY ca.position
      `);

      return { texts: normalizeTexts(row.texts), assets };
    });
  }

  private async resolveAuth(
    ctx: TenantContext,
    campaign: DraftCampaignRecord,
    socialProfileId: string,
    leadFormId: string | null,
  ): Promise<{
    connectionId: string;
    accountExternalId: string;
    pageExternalId: string;
    currency: string;
    grantedScopes: string[];
    leadFormExternalId?: string;
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
        JOIN social_profiles sp ON sp.id = ${socialProfileId}::uuid
        WHERE a.id = ${campaign.adAccountId}::uuid
      `),
    );
    if (!row) throw new BadRequestException('Reklam hesabı bağlantısı bulunamadı');
    if (row.status !== 'active') {
      throw new BadRequestException(
        `Platform bağlantısı etkin değil (${row.status}) — yeniden bağlanmak gerekiyor.`,
      );
    }

    let leadFormExternalId: string | undefined;
    if (leadFormId) {
      const [form] = await this.prisma.withTenant(ctx, (tx) =>
        tx.$queryRaw<Array<{ external_form_id: string | null }>>(Prisma.sql`
          SELECT external_form_id FROM lead_forms
          WHERE id = ${leadFormId}::uuid AND org_id = ${ctx.orgId}::uuid
        `),
      );
      // Meta'da var olmayan bir forma referans veren kreatif reddediliyor ve
      // hata mesajı ("Invalid parameter") sebebi hiç anlatmıyor.
      if (!form?.external_form_id) {
        throw new BadRequestException(
          'Seçilen form henüz Meta’da yayınlanmamış. Kütüphane > Formlar bölümünden yayınla.',
        );
      }
      leadFormExternalId = form.external_form_id;
    }

    return {
      connectionId: row.connection_id,
      accountExternalId: row.account_external_id,
      pageExternalId: row.page_external_id,
      currency: row.currency,
      grantedScopes: row.granted_scopes ?? [],
      leadFormExternalId,
    };
  }

  /**
   * Dış kimlikler AĞACIN KENDİ SEVİYELERİNE yazılıyor.
   *
   * Hepsini kampanyaya yığmak kolay olurdu ama sonra "bu reklam grubu
   * platformda hangisi" sorusunun cevabı olmazdı — ve o soru, ikinci bir grup
   * eklendiği gün sorulacak.
   */
  private async markPublished(
    ctx: TenantContext,
    campaignId: string,
    adGroupId: string,
    adId: string,
    result: { campaignId: string; adSetId: string; creativeId: string; adId: string },
  ): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await tx.$executeRaw(Prisma.sql`
        UPDATE draft_campaigns SET
          status = 'published',
          external_campaign_id = ${result.campaignId},
          error = NULL,
          published_at = now(),
          updated_at = now()
        WHERE id = ${campaignId}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE draft_ad_groups SET
          external_ad_set_id = ${result.adSetId}, error = NULL, updated_at = now()
        WHERE id = ${adGroupId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        UPDATE draft_ads SET
          external_ad_id = ${result.adId},
          external_creative_id = ${result.creativeId},
          error = NULL,
          updated_at = now()
        WHERE id = ${adId}::uuid
      `);
    });
  }

  private async fail(ctx: TenantContext, campaignId: string, error: string): Promise<void> {
    await this.setStatus(ctx, campaignId, 'failed', error);
  }

  private async setStatus(
    ctx: TenantContext,
    campaignId: string,
    status: string,
    error: string | null,
  ): Promise<void> {
    await this.prisma.withTenant(ctx, (tx) =>
      tx.$executeRaw(Prisma.sql`
        UPDATE draft_campaigns SET status = ${status}, error = ${error}, updated_at = now()
        WHERE id = ${campaignId}::uuid AND org_id = ${ctx.orgId}::uuid
      `),
    );
  }
}

interface LoadedCreative {
  texts: CreativeTexts;
  assets: Array<{ id: string; width: number; height: number }>;
}

/**
 * JSONB'den gelen havuzun eksik alanlarını tamamlar.
 *
 * Veritabanındaki eski bir satır yalnızca `headlines` taşıyor olabilir ve
 * `packTextsFor` dizileri okurken `undefined` üzerinde patlardı — okuma
 * anında normalize etmek, her çağıran yerde kontrol yazmaktan güvenli.
 */
function normalizeTexts(raw: Partial<CreativeTexts> | null): CreativeTexts {
  return {
    primaryText: raw?.primaryText,
    headlines: raw?.headlines ?? [],
    longHeadlines: raw?.longHeadlines ?? [],
    descriptions: raw?.descriptions ?? [],
  };
}

function platformLabel(platform: string): string {
  return platform === 'google' ? 'Google Ads' : 'Meta';
}

function money(micros: bigint): string {
  return `${(micros / 1_000_000n).toLocaleString('tr-TR')} ₺`;
}
