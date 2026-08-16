import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  buildDraftTree,
  buildExpertTree,
  type CampaignGoal,
  type DraftAdGroupRecord,
  type DraftAdRecord,
  type DraftBudgetMode,
  type DraftCampaignRecord,
  type DraftGroupRecord,
  type DraftPlatform,
  type DraftStatus,
  type DraftSurface,
  type DraftTreePlan,
  type ExpertDraftInput,
  type SimpleDraftInput,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';

/**
 * Kampanya taslağı ağacı — veri katmanı.
 *
 * AĞAÇ TEK YERDEN KURULUYOR. Basit yüzey `buildDraftTree` ile bir plan üretiyor
 * ve bu servis onu yazıyor; uzman yüzeyi ileride aynı tabloları doğrudan
 * düzenleyecek. İki ayrı yazma yolu olsaydı, birinde düzeltilen bir hata
 * diğerinde kalırdı — bu projede tam olarak yaşandı: `publishDraft`,
 * `createBoost` ve `createAd` üç ayrı yol ve altı hatanın düzeltmesi yalnızca
 * birine gitti.
 */

interface CampaignRow {
  id: string;
  client_id: string;
  group_id: string | null;
  platform: DraftPlatform;
  ad_account_id: string;
  ad_account_name: string;
  name: string;
  surface: DraftSurface;
  goal: CampaignGoal | null;
  settings: Record<string, unknown> | null;
  budget_mode: DraftBudgetMode;
  budget_amount_micros: string | number | bigint | null;
  start_at: Date | null;
  end_at: Date | null;
  status: DraftStatus;
  external_campaign_id: string | null;
  error: string | null;
  published_at: Date | null;
  created_at: Date;
}

interface AdGroupRow {
  id: string;
  campaign_id: string;
  name: string;
  position: number;
  social_profile_id: string | null;
  social_profile_name: string | null;
  lead_form_id: string | null;
  settings: Record<string, unknown> | null;
  budget_mode: DraftBudgetMode;
  budget_amount_micros: string | number | bigint | null;
  external_ad_set_id: string | null;
  error: string | null;
}

interface AdRow {
  id: string;
  ad_group_id: string;
  name: string;
  position: number;
  creative_id: string;
  creative_name: string;
  external_ad_id: string | null;
  error: string | null;
}

@Injectable()
export class DraftTreeService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Oluşturma
  // ---------------------------------------------------------------------------

  /**
   * Basit yüzeyden ağaç kurar.
   *
   * PLAN ÖNCE ÜRETİLİYOR, SONRA YAZILIYOR. `buildDraftTree` saf: engelleri ve
   * atlanan platformları veritabanına hiç dokunmadan söylüyor. Yazmaya
   * başlayıp ortada durmak, yarım bir ağaç bırakırdı.
   */
  async createFromSimple(
    ctx: TenantContext,
    input: SimpleDraftInput,
  ): Promise<DraftGroupRecord> {
    const plan = buildDraftTree(input, new Date());

    if (plan.blockers.length > 0) {
      // İLK ENGELİ DEĞİL HEPSİNİ SÖYLÜYORUZ: kullanıcı bir eksiği düzeltip
      // tekrar deneyip ikinci eksiği öğrenmek zorunda kalmamalı.
      throw new BadRequestException(plan.blockers.join(' '));
    }

    const ids = await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertScope(
        tx,
        {
          clientId: input.clientId,
          socialProfileId: input.socialProfileId,
          creativeIds: [input.creativeId],
        },
        plan,
      );
      return this.writePlan(tx, ctx, { clientId: input.clientId }, plan);
    });

    const campaigns = await Promise.all(ids.map((id) => this.get(ctx, id)));
    return {
      groupId: campaigns[0]?.groupId ?? null,
      name: input.name,
      campaigns,
    };
  }

  /**
   * Planı tek transaction'da yazar.
   *
   * TEK TRANSACTION ŞART. Kampanya yazılıp reklam grubu yazılamazsa geriye
   * grupsuz bir kampanya kalır: panelde görünür, yayınlanamaz ve kullanıcı
   * neden olduğunu anlamaz. `createBoost` aynı dersi Meta tarafında öğrendi ve
   * orada geri alma elle yazılmak zorunda kaldı; burada veritabanı hallediyor.
   */
  private async writePlan(
    tx: TxLike,
    ctx: TenantContext,
    /**
     * İKİ YÜZEYİN ORTAK ALANLARI — tam girdi tipi DEĞİL.
     *
     * `SimpleDraftInput` beklemek, uzman yüzeyinin kullanmadığı alanları
     * (hedef, süre) uydurmasını gerektirirdi. Yazıcının ihtiyacı yalnızca
     * bunlar; dar tip, ileride üçüncü bir yüzey eklendiğinde de yeter.
     */
    input: { clientId: string; leadFormId?: string },
    plan: DraftTreePlan,
  ): Promise<string[]> {
    /**
     * GRUP KİMLİĞİ TEK KAMPANYADA DA YAZILABİLİRDİ AMA YAZILMIYOR.
     *
     * NULL burada "eşi yok" demek ve bu bilgi anlamlı: WhatsApp'ın Google'da
     * karşılığı yok, dolayısıyla o taslağın hiçbir zaman ikinci bir platformu
     * olmayacak. Her satıra kimlik dağıtmak, "bu kampanyanın başka bir
     * platformdaki hâli var mı" sorusunu cevapsız bırakırdı.
     */
    const groupId = plan.groupRequired
      ? (
          await tx.$queryRaw<Array<{ id: string }>>(
            Prisma.sql`SELECT gen_random_uuid()::text AS id`,
          )
        )[0]!.id
      : null;

    const ids: string[] = [];

    for (const c of plan.campaigns) {
      const [campaign] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_campaigns (
          id, org_id, client_id, group_id, platform, ad_account_id, name, surface,
          goal, settings, budget_mode, budget_amount_micros, end_at, created_by, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${groupId}::uuid, ${c.platform}::"Platform", ${c.adAccountId}::uuid,
          ${c.name}, ${c.surface}, ${c.goal}, ${JSON.stringify(c.settings)}::jsonb,
          ${c.budgetMode}, ${c.budgetAmountMicros}::bigint,
          ${c.endAt}::timestamptz, ${ctx.userId}::uuid, now()
        )
        RETURNING id::text AS id
      `);
      if (!campaign) throw new BadRequestException('Kampanya taslağı oluşturulamadı');
      ids.push(campaign.id);

      for (const g of c.adGroups) {
        const [group] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          INSERT INTO draft_ad_groups (
            id, org_id, campaign_id, name, position, social_profile_id, lead_form_id,
            settings, updated_at
          ) VALUES (
            gen_random_uuid(), ${ctx.orgId}::uuid, ${campaign.id}::uuid, ${g.name},
            ${g.position}, ${g.socialProfileId ?? null}::uuid,
            ${input.leadFormId ?? null}::uuid,
            ${JSON.stringify(g.settings)}::jsonb, now()
          )
          RETURNING id::text AS id
        `);
        if (!group) throw new BadRequestException('Reklam grubu oluşturulamadı');

        for (const ad of g.ads) {
          await tx.$executeRaw(Prisma.sql`
            INSERT INTO draft_ads (
              id, org_id, ad_group_id, creative_id, name, position, updated_at
            ) VALUES (
              gen_random_uuid(), ${ctx.orgId}::uuid, ${group.id}::uuid,
              ${ad.creativeId}::uuid, ${ad.name}, ${ad.position}, now()
            )
          `);
        }
      }
    }

    return ids;
  }

  /**
   * Uzman yüzeyinden ağaç kurar.
   *
   * BASİT YÜZEYLE AYNI YAZMA YOLU (`writePlan`) ve bu bilinçli: iki ayrı
   * yazıcı, birinde düzeltilen bir hatanın diğerinde kalması demek olurdu.
   * Fark yalnızca planı ÜRETEN fonksiyonda — biri hedefi ayarlara çeviriyor,
   * diğeri kullanıcının ayarlarını olduğu gibi taşıyor.
   */
  async createFromExpert(
    ctx: TenantContext,
    input: ExpertDraftInput,
  ): Promise<DraftCampaignRecord> {
    const plan = buildExpertTree(input, new Date());
    if (plan.blockers.length > 0) {
      throw new BadRequestException(plan.blockers.join(' '));
    }

    const ids = await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertScope(
        tx,
        {
          clientId: input.clientId,
          socialProfileId: input.socialProfileId,
          creativeIds: input.creativeIds,
        },
        plan,
      );
      return this.writePlan(
        tx,
        ctx,
        { clientId: input.clientId, leadFormId: input.leadFormId },
        plan,
      );
    });

    return this.get(ctx, ids[0]!);
  }

  // ---------------------------------------------------------------------------
  // Okuma
  // ---------------------------------------------------------------------------

  async list(ctx: TenantContext, clientId: string): Promise<DraftGroupRecord[]> {
    const campaigns = await this.prisma.withTenant(ctx, (tx) =>
      this.selectTree(
        tx,
        ctx,
        Prisma.sql`c.org_id = ${ctx.orgId}::uuid AND c.client_id = ${clientId}::uuid`,
      ),
    );

    /**
     * AYNI GRUBUN KAMPANYALARI TEK SATIRDA TOPLANIYOR.
     *
     * Kullanıcı iki kampanya değil BİR kampanya kurduğunu düşünüyor; listede
     * iki satır görmek, ikinci bir şey açtığını sanmasına yol açar. Ama
     * durumlar ayrı gösteriliyor — kısmi başarının bütün mesele olduğu yer
     * burası ("Meta yayında · Google başarısız").
     */
    const groups = new Map<string, DraftGroupRecord>();
    for (const c of campaigns) {
      // Grubu olmayan kampanya kendi başına bir grup: anahtar olarak kendi
      // kimliği kullanılıyor, yoksa bütün grupsuzlar tek satırda birleşirdi.
      const key = c.groupId ?? c.id;
      const existing = groups.get(key);
      if (existing) existing.campaigns.push(c);
      else groups.set(key, { groupId: c.groupId, name: c.name, campaigns: [c] });
    }
    return [...groups.values()];
  }

  async get(ctx: TenantContext, id: string): Promise<DraftCampaignRecord> {
    const rows = await this.prisma.withTenant(ctx, (tx) =>
      this.selectTree(tx, ctx, Prisma.sql`c.id = ${id}::uuid AND c.org_id = ${ctx.orgId}::uuid`),
    );
    const row = rows[0];
    if (!row) throw new NotFoundException('Kampanya taslağı bulunamadı');
    return row;
  }

  /**
   * Bir niyetin bütün platformlardaki hâli.
   *
   * Grubu olmayan taslakta tek satır dönüyor — arayüzün iki durumu ayrı ayrı
   * ele almasına gerek kalmıyor.
   */
  async getGroup(ctx: TenantContext, id: string): Promise<DraftGroupRecord> {
    const campaign = await this.get(ctx, id);
    if (!campaign.groupId) {
      return { groupId: null, name: campaign.name, campaigns: [campaign] };
    }
    const campaigns = await this.prisma.withTenant(ctx, (tx) =>
      this.selectTree(
        tx,
        ctx,
        Prisma.sql`c.group_id = ${campaign.groupId}::uuid AND c.org_id = ${ctx.orgId}::uuid`,
      ),
    );
    return { groupId: campaign.groupId, name: campaign.name, campaigns };
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        DELETE FROM draft_campaigns
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
          -- YAYINLANMIŞ TASLAK SİLİNMİYOR.
          --
          -- Silmek platformdaki kampanyayı durdurmuyor; yalnızca bizim
          -- kaydımızı yok ediyor. Harcamaya devam eden ama panelde izi
          -- kalmayan bir kampanya, bu projenin en pahalı sessiz hatası olurdu.
          AND status <> 'published'
      `);
      if (n === 0) {
        throw new NotFoundException(
          'Taslak bulunamadı ya da yayınlandığı için silinemiyor.',
        );
      }
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Kapsam kontrolü — RLS'in YAKALAYAMADIĞI hatalar.
   *
   * RLS aynı organizasyon içinde iki müşteriyi ayırt ediyor ama bu kontroller
   * ondan farklı bir şeye bakıyor: hesabın, sayfanın ve kreatifin AYNI
   * müşteriye ait olup olmadığına. Üçü de aynı org'da olabilir ve politika
   * hepsini geçirir; sonuç, bir müşterinin kreatifinin başka bir müşterinin
   * reklam hesabında yayınlanması olur. Sessiz ve ciddi.
   */
  private async assertScope(
    tx: TxLike,
    input: { clientId: string; socialProfileId?: string; creativeIds: string[] },
    plan: DraftTreePlan,
  ): Promise<void> {
    for (const c of plan.campaigns) {
      const [acc] = await tx.$queryRaw<Array<{ client_id: string | null; platform: string }>>(
        Prisma.sql`
          SELECT client_id::text AS client_id, platform::text AS platform
          FROM ad_accounts WHERE id = ${c.adAccountId}::uuid
        `,
      );
      if (!acc) throw new NotFoundException('Reklam hesabı bulunamadı');
      // Atanmamış hesap için AYRI mesaj: yapılacak şey taslağı düzeltmek
      // değil, hesabı müşteriye atamak.
      if (acc.client_id === null) {
        throw new BadRequestException(
          'Bu reklam hesabı henüz bir müşteriye atanmamış. Platform Bağlantıları ekranından ata.',
        );
      }
      if (acc.client_id !== input.clientId) {
        throw new BadRequestException('Reklam hesabı bu müşteriye bağlı değil.');
      }
      /**
       * HESABIN PLATFORMU İLE KAMPANYANIN PLATFORMU AYNI OLMAK ZORUNDA.
       *
       * Google hesabına Meta kampanyası yazmak yayın anında düşerdi ve hata
       * "hesap bulunamadı" gibi okunurdu — yanlış teşhis. Burada girişte
       * yakalanıyor.
       */
      if (acc.platform !== c.platform) {
        throw new BadRequestException(
          `Seçilen reklam hesabı ${acc.platform} hesabı, kampanya ${c.platform} için kuruluyor.`,
        );
      }
    }

    if (input.socialProfileId) {
      const [profile] = await tx.$queryRaw<
        Array<{ client_id: string | null; profile_type: string }>
      >(Prisma.sql`
        SELECT client_id::text AS client_id, profile_type::text AS profile_type
        FROM social_profiles WHERE id = ${input.socialProfileId}::uuid
      `);
      if (!profile) throw new NotFoundException('Sayfa bulunamadı');
      if (profile.client_id === null) {
        throw new BadRequestException(
          'Bu sayfa henüz bir müşteriye atanmamış. Platform Bağlantıları ekranından ata.',
        );
      }
      if (profile.client_id !== input.clientId) {
        throw new BadRequestException('Sayfa bu müşteriye bağlı değil.');
      }
      if (profile.profile_type !== 'facebook_page') {
        throw new BadRequestException(
          'Reklam bir Facebook sayfası adına yayınlanmalı. Instagram hesabı tek başına yeterli değil.',
        );
      }
    }

    /**
     * KREATİFLERİN HEPSİ KONTROL EDİLİYOR, yalnızca ilki değil.
     *
     * Uzman yüzeyi aynı gruba birden çok kreatif koyabiliyor; birini
     * denetleyip diğerlerini geçmek, listenin sonuna başka müşterinin
     * kreatifini koymanın yeterli olması demek olurdu.
     */
    const creatives = await tx.$queryRaw<Array<{ id: string; client_id: string }>>(Prisma.sql`
      SELECT id::text AS id, client_id::text AS client_id
      FROM ad_creatives WHERE id = ANY(${input.creativeIds}::uuid[])
    `);
    if (creatives.length !== new Set(input.creativeIds).size) {
      throw new NotFoundException('Kreatif bulunamadı');
    }
    const yabanci = creatives.filter((c) => c.client_id !== input.clientId);
    if (yabanci.length > 0) {
      throw new BadRequestException(
        yabanci.length === 1
          ? 'Bu kreatif başka bir müşteriye ait.'
          : `${yabanci.length} kreatif başka bir müşteriye ait.`,
      );
    }
  }

  /**
   * Ağacı üç sorguyla okur.
   *
   * TEK SORGUDA JOIN EDİLMİYOR: kampanya × grup × reklam kartezyeni, tek
   * kampanyanın alanlarını reklam sayısı kadar tekrar getirir ve JSONB
   * `settings` alanları büyük. Üç sorgu, kimlikle eşleştirmek daha ucuz —
   * `ad-builder.service.ts` de aynı deseni kullanıyor.
   */
  private async selectTree(
    tx: TxLike,
    ctx: TenantContext,
    where: Prisma.Sql,
  ): Promise<DraftCampaignRecord[]> {
    const campaigns = await tx.$queryRaw<CampaignRow[]>(Prisma.sql`
      SELECT c.id::text AS id, c.client_id::text AS client_id, c.group_id::text AS group_id,
             c.platform::text AS platform, c.ad_account_id::text AS ad_account_id,
             a.name AS ad_account_name, c.name, c.surface, c.goal, c.settings,
             c.budget_mode, c.budget_amount_micros, c.start_at, c.end_at, c.status,
             c.external_campaign_id, c.error, c.published_at, c.created_at
      FROM draft_campaigns c
      JOIN ad_accounts a ON a.id = c.ad_account_id
      WHERE ${where}
      ORDER BY c.created_at DESC, c.platform
    `);
    if (campaigns.length === 0) return [];

    const campaignIds = campaigns.map((c) => c.id);

    const groups = await tx.$queryRaw<AdGroupRow[]>(Prisma.sql`
      SELECT g.id::text AS id, g.campaign_id::text AS campaign_id, g.name, g.position,
             g.social_profile_id::text AS social_profile_id, sp.name AS social_profile_name,
             g.lead_form_id::text AS lead_form_id, g.settings, g.budget_mode,
             g.budget_amount_micros, g.external_ad_set_id, g.error
      FROM draft_ad_groups g
      LEFT JOIN social_profiles sp ON sp.id = g.social_profile_id
      WHERE g.campaign_id = ANY(${campaignIds}::uuid[]) AND g.org_id = ${ctx.orgId}::uuid
      ORDER BY g.position
    `);

    const groupIds = groups.map((g) => g.id);
    const ads =
      groupIds.length === 0
        ? []
        : await tx.$queryRaw<AdRow[]>(Prisma.sql`
            SELECT d.id::text AS id, d.ad_group_id::text AS ad_group_id, d.name, d.position,
                   d.creative_id::text AS creative_id, cr.name AS creative_name,
                   d.external_ad_id, d.error
            FROM draft_ads d
            JOIN ad_creatives cr ON cr.id = d.creative_id
            WHERE d.ad_group_id = ANY(${groupIds}::uuid[]) AND d.org_id = ${ctx.orgId}::uuid
            ORDER BY d.position
          `);

    const adsByGroup = new Map<string, DraftAdRecord[]>();
    for (const a of ads) {
      const list = adsByGroup.get(a.ad_group_id) ?? [];
      list.push({
        id: a.id,
        name: a.name,
        position: a.position,
        creativeId: a.creative_id,
        creativeName: a.creative_name,
        externalAdId: a.external_ad_id,
        error: a.error,
      });
      adsByGroup.set(a.ad_group_id, list);
    }

    const groupsByCampaign = new Map<string, DraftAdGroupRecord[]>();
    for (const g of groups) {
      const list = groupsByCampaign.get(g.campaign_id) ?? [];
      list.push({
        id: g.id,
        name: g.name,
        position: g.position,
        socialProfileId: g.social_profile_id,
        socialProfileName: g.social_profile_name,
        leadFormId: g.lead_form_id,
        settings: g.settings,
        budgetMode: g.budget_mode,
        budgetAmountMicros: micros(g.budget_amount_micros),
        externalAdSetId: g.external_ad_set_id,
        error: g.error,
        ads: adsByGroup.get(g.id) ?? [],
      });
      groupsByCampaign.set(g.campaign_id, list);
    }

    return campaigns.map((c) => ({
      id: c.id,
      clientId: c.client_id,
      groupId: c.group_id,
      platform: c.platform,
      adAccountId: c.ad_account_id,
      adAccountName: c.ad_account_name,
      name: c.name,
      surface: c.surface,
      goal: c.goal,
      settings: c.settings,
      budgetMode: c.budget_mode,
      budgetAmountMicros: micros(c.budget_amount_micros),
      startAt: c.start_at?.toISOString() ?? null,
      endAt: c.end_at?.toISOString() ?? null,
      status: c.status,
      externalCampaignId: c.external_campaign_id,
      error: c.error,
      publishedAt: c.published_at?.toISOString() ?? null,
      createdAt: c.created_at.toISOString(),
      adGroups: groupsByCampaign.get(c.id) ?? [],
    }));
  }
}

/**
 * BigInt JSON'a giremiyor, string olarak taşınıyor.
 *
 * `null` KORUNUYOR: bütçesi olmayan seviyeyi "0" göstermek, sıfır bütçeli bir
 * kampanya gibi okunurdu ve ikisi bambaşka şeyler.
 */
function micros(v: string | number | bigint | null): string | null {
  return v === null ? null : String(v);
}
