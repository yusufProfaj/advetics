import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BoostCondition,
  BoostQuery,
  BoostRecord,
  BoostRuleInput,
  BoostRuleRecord,
  BoostStatus,
  MediaType,
  OrganicPostRecord,
  TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';
import {
  fitsInCap,
  remainingCapMicros,
  selectPost,
  type PostSnapshot,
} from './boost-selector';

/**
 * Modül 7 — Auto-Boost veri katmanı.
 *
 * SEÇİM MANTIĞI BURADA DEĞİL, `boost-selector.ts` içinde ve saf. Bu servis
 * veriyi toplayıp adayları kaydediyor.
 *
 * ÜÇ AŞAMALI AKIŞ:
 *   1. Kural çalışır → ADAY üretir (`candidate`). Hiçbir şey harcanmaz.
 *   2. Yetkili onaylar (`boost.approve`) → `approved`.
 *   3. Uygulayıcı platformda oluşturur → `active`.
 *
 * `autoApprove` açıksa 1 ve 2 birleşiyor ama o karar da kaydediliyor: aday
 * satırında `approved_by` boş kalıyor ve arayüz bunu "kural otomatik onayladı"
 * diye gösteriyor.
 */

interface RuleRow {
  id: string;
  org_id: string;
  client_id: string;
  social_profile_id: string | null;
  social_profile_name: string | null;
  name: string;
  description: string | null;
  conditions: BoostCondition[];
  combinator: 'and' | 'or';
  min_post_age_hours: number;
  max_post_age_hours: number;
  /**
   * BIGINT kolonları SÜRÜCÜYE GÖRE string ya da bigint geliyor.
   *
   * Prisma+Postgres `bigint` veriyor, PGlite string. Tipi yalnızca `bigint`
   * yazmak derleyiciyi susturuyor ama çalışma anında
   * "Cannot mix BigInt and other types" ile patlıyor — ve bu yalnızca
   * gerçek bir sorgu çalıştığında görülüyor.
   */
  daily_budget_micros: string | number | bigint;
  duration_days: number;
  objective: string;
  monthly_cap_micros: string | number | bigint;
  max_boosts_per_run: number;
  auto_approve: boolean;
  enabled: boolean;
  last_run_at: Date | null;
  committed_micros: string | number | bigint | null;
}

interface PostRow {
  id: string;
  social_profile_id: string;
  social_profile_name: string;
  linked_ad_account_id: string | null;
  external_id: string;
  media_type: MediaType;
  message: string | null;
  permalink: string | null;
  thumbnail_url: string | null;
  published_at: Date;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  video_views: number;
  engagements: number;
  boosted_at: Date | null;
}

export interface SelectionOutcome {
  evaluated: number;
  created: number;
  /** Tavan yüzünden açılamayanlar — ajans bunu bilmeli. */
  cappedOut: number;
  notes: string[];
}

@Injectable()
export class BoostsService {
  private readonly logger = new Logger(BoostsService.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Kural CRUD
  // ---------------------------------------------------------------------------

  async listRules(ctx: TenantContext, clientId: string): Promise<BoostRuleRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.selectRules(
        tx,
        Prisma.sql`r.org_id = ${ctx.orgId}::uuid AND r.client_id = ${clientId}::uuid`,
      );
      return rows.map((r) => this.toRuleRecord(r));
    });
  }

  async createRule(ctx: TenantContext, input: BoostRuleInput): Promise<BoostRuleRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.assertProfile(tx, input);
      const [row] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO boost_rules (
          id, org_id, client_id, social_profile_id, name, description,
          conditions, combinator, min_post_age_hours, max_post_age_hours,
          daily_budget_micros, duration_days, objective, monthly_cap_micros,
          max_boosts_per_run, auto_approve, enabled, created_by, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${input.socialProfileId ?? null}::uuid, ${input.name}, ${input.description ?? null},
          ${JSON.stringify(input.conditions)}::jsonb, ${input.combinator},
          ${input.minPostAgeHours}, ${input.maxPostAgeHours},
          ${toMicros(input.dailyBudget)}::bigint, ${input.durationDays}, ${input.objective},
          ${toMicros(input.monthlyCap)}::bigint, ${input.maxBoostsPerRun},
          ${input.autoApprove}, ${input.enabled}, ${ctx.userId}::uuid, now()
        )
        RETURNING id
      `);
      if (!row) throw new NotFoundException('Kural oluşturulamadı');
      return this.getRule(ctx, row.id);
    });
  }

  async updateRule(
    ctx: TenantContext,
    id: string,
    input: BoostRuleInput,
  ): Promise<BoostRuleRecord> {
    await this.prisma.withTenant(ctx, async (tx) => {
      await this.assertProfile(tx, input);
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE boost_rules SET
          social_profile_id = ${input.socialProfileId ?? null}::uuid,
          name = ${input.name},
          description = ${input.description ?? null},
          conditions = ${JSON.stringify(input.conditions)}::jsonb,
          combinator = ${input.combinator},
          min_post_age_hours = ${input.minPostAgeHours},
          max_post_age_hours = ${input.maxPostAgeHours},
          daily_budget_micros = ${toMicros(input.dailyBudget)}::bigint,
          duration_days = ${input.durationDays},
          objective = ${input.objective},
          monthly_cap_micros = ${toMicros(input.monthlyCap)}::bigint,
          max_boosts_per_run = ${input.maxBoostsPerRun},
          -- OTOMATİK ONAYI AÇMAK KURALIN DAVRANIŞINI DEĞİŞTİRİYOR ve bu alan
          -- burada güncellenebiliyor. Modül 5'te dryRun ayrı bir yetkiye
          -- bağlıydı; burada ayrım ONAY ANINDA yapılıyor: otomatik onay açık
          -- olsa bile her boost boosts tablosunda kaydediliyor ve harcama
          -- tavanı bağımsız bir emniyet olarak duruyor.
          auto_approve = ${input.autoApprove},
          enabled = ${input.enabled},
          updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Kural bulunamadı');
    });
    return this.getRule(ctx, id);
  }

  async getRule(ctx: TenantContext, id: string): Promise<BoostRuleRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await this.selectRules(
        tx,
        Prisma.sql`r.id = ${id}::uuid AND r.org_id = ${ctx.orgId}::uuid`,
      );
      const row = rows[0];
      if (!row) throw new NotFoundException('Kural bulunamadı');
      return this.toRuleRecord(row);
    });
  }

  async removeRule(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        DELETE FROM boost_rules WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Kural bulunamadı');
    });
  }

  /**
   * Kural sorgusu + BU AYKİ TAAHHÜT.
   *
   * Taahhüt AYRI BİR SORGU DEĞİL, aynı sorgunun alt sorgusu: iki sorgu
   * yazmak, kural listesi ile tavan göstergesinin farklı anlara ait olması
   * demek olurdu ve "tavanı aşmadım ama boost açılmıyor" gibi açıklanamaz bir
   * durum üretirdi.
   */
  private async selectRules(tx: TxLike, where: Prisma.Sql): Promise<RuleRow[]> {
    return tx.$queryRaw<RuleRow[]>(Prisma.sql`
      SELECT r.*, sp.name AS social_profile_name,
             COALESCE((
               SELECT SUM(b.daily_budget_micros * b.duration_days)
               FROM boosts b
               WHERE b.boost_rule_id = r.id
                 -- REDDEDİLEN VE BAŞARISIZ boost'lar taahhüt SAYILMIYOR:
                 -- para taahhüt edilmedi. Saymak, bir kez reddedilen adayın
                 -- tavanı ay boyunca işgal etmesi demek olurdu.
                 AND b.status IN ('candidate', 'approved', 'creating', 'active')
                 AND b.created_at >= date_trunc('month', now())
             ), 0) AS committed_micros
      FROM boost_rules r
      LEFT JOIN social_profiles sp ON sp.id = r.social_profile_id
      WHERE ${where}
      ORDER BY r.enabled DESC, r.name
    `);
  }

  private async assertProfile(tx: TxLike, input: BoostRuleInput): Promise<void> {
    if (!input.socialProfileId) return;
    // `client_id` NULL OLABİLİR — sayfa ajansın havuzunda, henüz atanmamış.
    // Tip elle yazıldığı için derleyici bunu söylemiyor.
    const [p] = await tx.$queryRaw<Array<{ client_id: string | null; linked: string | null }>>(
      Prisma.sql`
        SELECT client_id, linked_ad_account_id::text AS linked
        FROM social_profiles WHERE id = ${input.socialProfileId}::uuid
      `,
    );
    if (!p) throw new NotFoundException('Sosyal profil bulunamadı');
    if (p.client_id === null) {
      throw new BadRequestException(
        'Bu sayfa henüz bir müşteriye atanmamış. Platform Bağlantıları ekranından ata — ' +
          'atanmamış sayfanın organik gönderileri çekilmiyor, dolayısıyla boost adayı da oluşmaz.',
      );
    }
    if (p.client_id !== input.clientId) {
      throw new BadRequestException('Sosyal profil bu müşteriye bağlı değil');
    }
    // FATURALANDIRMA HESABI OLMADAN BOOST AÇILAMAZ ve bunu kural KAYDEDİLİRKEN
    // söylemek, ayda bir "neden hiç boost açılmadı" sorusunu sordurmaktan iyi.
    if (!p.linked) {
      throw new BadRequestException(
        'Bu sosyal profile bağlı bir reklam hesabı yok — boost faturalandırılamaz. ' +
          'Platform bağlantıları sayfasından hesabı eşleştirin.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Aday üretimi
  // ---------------------------------------------------------------------------

  /**
   * Kuralı çalıştırır ve aday boost'lar üretir.
   *
   * PLATFORMA DOKUNMUYOR. Adaylar `candidate` (ya da `autoApprove` açıksa
   * `approved`) olarak kaydediliyor; platformda oluşturma ayrı bir adım.
   */
  async runRule(tx: TxLike, ruleId: string, now: Date): Promise<SelectionOutcome> {
    const rows = await this.selectRules(tx, Prisma.sql`r.id = ${ruleId}::uuid`);
    const rule = rows[0];
    if (!rule) throw new NotFoundException('Kural bulunamadı');

    const notes: string[] = [];
    const profileFilter = rule.social_profile_id
      ? Prisma.sql`AND p.social_profile_id = ${rule.social_profile_id}::uuid`
      : Prisma.empty;

    const posts = await tx.$queryRaw<PostRow[]>(Prisma.sql`
      SELECT p.*, sp.name AS social_profile_name,
             sp.linked_ad_account_id::text AS linked_ad_account_id
      FROM organic_posts p
      JOIN social_profiles sp ON sp.id = p.social_profile_id
      WHERE p.client_id = ${rule.client_id}::uuid ${profileFilter}
        -- Yaş penceresi SQL'de de daraltılıyor: 45 günlük tablonun tamamını
        -- belleğe çekip JS'te elemek gereksiz. Kesin karar yine saf
        -- fonksiyonda veriliyor.
        AND p.published_at >= ${new Date(now.getTime() - rule.max_post_age_hours * 3_600_000)}
      ORDER BY p.engagements DESC
    `);

    let created = 0;
    let cappedOut = 0;
    let committed = toBigInt(rule.committed_micros);
    const dailyBudget = toBigInt(rule.daily_budget_micros);
    const monthlyCap = toBigInt(rule.monthly_cap_micros);
    const perBoost = dailyBudget * BigInt(rule.duration_days);

    for (const p of posts) {
      if (created >= rule.max_boosts_per_run) break;

      const snapshot: PostSnapshot = {
        postId: p.id,
        publishedAt: p.published_at,
        impressions: p.impressions,
        reach: p.reach,
        likes: p.likes,
        comments: p.comments,
        shares: p.shares,
        saves: p.saves,
        videoViews: p.video_views,
        engagements: p.engagements,
        boostedAt: p.boosted_at,
      };

      const result = selectPost(snapshot, {
        conditions: rule.conditions,
        combinator: rule.combinator,
        minPostAgeHours: rule.min_post_age_hours,
        maxPostAgeHours: rule.max_post_age_hours,
        now,
      });
      if (!result.selected) continue;

      // FATURALANDIRMA HESABI YOKSA aday üretilmiyor — açılamayacak bir
      // boost'u onay kuyruğuna koymak, kullanıcıyı boşuna meşgul eder.
      if (!p.linked_ad_account_id) {
        notes.push(`${p.social_profile_name}: bağlı reklam hesabı yok, atlandı`);
        continue;
      }

      const remaining = remainingCapMicros(monthlyCap, committed);
      if (!fitsInCap(dailyBudget, rule.duration_days, remaining)) {
        // SESSİZCE DURMUYOR. Tavan dolduğunda "kural çalışmıyor" değil
        // "tavan doldu" denmeli; ikisi tamamen farklı işler.
        cappedOut++;
        continue;
      }

      const approved = rule.auto_approve;
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO boosts (
          id, org_id, client_id, boost_rule_id, organic_post_id, ad_account_id,
          status, daily_budget_micros, duration_days, objective, reason,
          approved_by, approved_at, updated_at
        ) VALUES (
          gen_random_uuid(), ${rule.org_id}::uuid, ${rule.client_id}::uuid,
          ${rule.id}::uuid, ${p.id}::uuid, ${p.linked_ad_account_id}::uuid,
          ${approved ? 'approved' : 'candidate'},
          ${dailyBudget}::bigint, ${rule.duration_days},
          ${rule.objective}, ${result.reason.slice(0, 500)},
          -- OTOMATİK ONAYDA approved_by BOŞ kalıyor ve bu bilinçli: onaylayan
          -- bir insan yok. Kuralın kimliğini buraya yazmak, denetim kaydında
          -- insan onayı ile otomatik onayı ayırt edilemez kılardı.
          NULL, ${approved ? now : null}, now()
        )
        -- AYNI GÖNDERİ İÇİN CANLI BİR BOOST VARSA ÇAKIŞIR ve atlanır.
        -- Kısmi tekil indeks bunu garanti ediyor; buradaki DO NOTHING,
        -- iki worker aynı anda çalıştığında turun patlamasını engelliyor.
        ON CONFLICT DO NOTHING
      `);
      created++;
      committed += perBoost;
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE boost_rules SET last_run_at = ${now} WHERE id = ${ruleId}::uuid
    `);

    if (cappedOut > 0) {
      notes.push(`${cappedOut} aday aylık tavana takıldı`);
    }
    return { evaluated: posts.length, created, cappedOut, notes };
  }

  // ---------------------------------------------------------------------------
  // Boost listesi ve onay
  // ---------------------------------------------------------------------------

  async listBoosts(ctx: TenantContext, query: BoostQuery): Promise<BoostRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const statusFilter = query.status
        ? Prisma.sql`AND b.status = ${query.status}`
        : Prisma.empty;
      const rows = await tx.$queryRaw<Array<Record<string, unknown>>>(Prisma.sql`
        SELECT b.*, r.name AS rule_name, a.name AS ad_account_name,
               p.external_id AS post_external_id, p.media_type, p.message,
               p.permalink, p.thumbnail_url, p.published_at, p.impressions,
               p.reach, p.likes, p.comments, p.shares, p.saves, p.video_views,
               p.engagements, p.boosted_at, p.social_profile_id,
               sp.name AS social_profile_name
        FROM boosts b
        JOIN organic_posts p ON p.id = b.organic_post_id
        JOIN social_profiles sp ON sp.id = p.social_profile_id
        JOIN ad_accounts a ON a.id = b.ad_account_id
        LEFT JOIN boost_rules r ON r.id = b.boost_rule_id
        WHERE b.org_id = ${ctx.orgId}::uuid AND b.client_id = ${query.clientId}::uuid
          ${statusFilter}
        ORDER BY
          -- ONAY BEKLEYENLER EN ÜSTTE. Bu ekranın tek eylemi onay vermek;
          -- kronolojik sıralama, yapılacak işi geçmişin içine gömerdi.
          CASE b.status WHEN 'candidate' THEN 0 ELSE 1 END,
          b.created_at DESC
      `);
      return rows.map((r) => this.toBoostRecord(r));
    });
  }

  /**
   * Onay ya da ret. `boost.approve` yetkisiyle korunuyor.
   *
   * YALNIZCA `candidate` DURUMUNDAN geçiş var. Zaten oluşturulmuş bir boost'u
   * "reddetmek" platformda çalışan bir kampanyayı durdurmuyor ve durum
   * kaydını gerçekle çelişir hâle getirirdi.
   */
  async decide(
    ctx: TenantContext,
    boostId: string,
    approve: boolean,
  ): Promise<BoostRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        UPDATE boosts SET
          status = ${approve ? 'approved' : 'rejected'},
          approved_by = ${approve ? ctx.userId : null}::uuid,
          approved_at = ${approve ? new Date() : null},
          updated_at = now()
        WHERE id = ${boostId}::uuid AND org_id = ${ctx.orgId}::uuid
          AND status = 'candidate'
      `);
      if (n === 0) {
        throw new NotFoundException(
          'Boost bulunamadı ya da artık onay bekleyen bir durumda değil.',
        );
      }
      const rows = await this.listBoosts(ctx, { clientId: ctx.clientIds[0]! });
      const found = rows.find((b) => b.id === boostId);
      if (!found) throw new NotFoundException('Boost bulunamadı');
      return found;
    });
  }

  // ---------------------------------------------------------------------------

  private toRuleRecord(row: RuleRow): BoostRuleRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      clientId: row.client_id,
      socialProfileId: row.social_profile_id,
      socialProfileName: row.social_profile_name,
      conditions: row.conditions,
      combinator: row.combinator,
      minPostAgeHours: row.min_post_age_hours,
      maxPostAgeHours: row.max_post_age_hours,
      dailyBudgetMicros: toBigInt(row.daily_budget_micros).toString(),
      durationDays: row.duration_days,
      objective: row.objective,
      monthlyCapMicros: toBigInt(row.monthly_cap_micros).toString(),
      maxBoostsPerRun: row.max_boosts_per_run,
      autoApprove: row.auto_approve,
      enabled: row.enabled,
      lastRunAt: row.last_run_at?.toISOString() ?? null,
      committedThisMonthMicros: toBigInt(row.committed_micros).toString(),
    };
  }

  private toBoostRecord(r: Record<string, unknown>): BoostRecord {
    const reach = Number(r.reach ?? 0);
    const engagements = Number(r.engagements ?? 0);
    const post: OrganicPostRecord = {
      id: String(r.organic_post_id),
      socialProfileId: String(r.social_profile_id),
      socialProfileName: String(r.social_profile_name),
      externalId: String(r.post_external_id),
      mediaType: r.media_type as MediaType,
      message: (r.message as string) ?? null,
      permalink: (r.permalink as string) ?? null,
      thumbnailUrl: (r.thumbnail_url as string) ?? null,
      publishedAt: (r.published_at as Date).toISOString(),
      impressions: Number(r.impressions ?? 0),
      reach,
      likes: Number(r.likes ?? 0),
      comments: Number(r.comments ?? 0),
      shares: Number(r.shares ?? 0),
      saves: Number(r.saves ?? 0),
      videoViews: Number(r.video_views ?? 0),
      engagements,
      engagementRate: reach > 0 ? (engagements / reach) * 100 : null,
      boostedAt: (r.boosted_at as Date | null)?.toISOString() ?? null,
    };

    const daily = toBigInt(r.daily_budget_micros as string);
    const days = Number(r.duration_days ?? 1);

    return {
      id: String(r.id),
      clientId: String(r.client_id),
      boostRuleId: (r.boost_rule_id as string) ?? null,
      boostRuleName: (r.rule_name as string) ?? null,
      post,
      adAccountId: String(r.ad_account_id),
      adAccountName: String(r.ad_account_name),
      status: r.status as BoostStatus,
      dailyBudgetMicros: daily.toString(),
      durationDays: days,
      totalBudgetMicros: (daily * BigInt(days)).toString(),
      objective: String(r.objective),
      reason: String(r.reason),
      externalCampaignId: (r.external_campaign_id as string) ?? null,
      externalAdId: (r.external_ad_id as string) ?? null,
      error: (r.error as string) ?? null,
      approvedAt: (r.approved_at as Date | null)?.toISOString() ?? null,
      createdAt: (r.created_at as Date).toISOString(),
    };
  }
}

/** Kullanıcı birimi → micros. STRING üzerinden, float'a uğramadan. */
export function toMicros(amount: string): bigint {
  const normalized = amount.trim().replace(',', '.');
  const parts = normalized.split('.');
  const whole = parts[0] || '0';
  const padded = ((parts[1] ?? '') + '000000').slice(0, 6);
  return BigInt(whole) * 1_000_000n + BigInt(padded);
}

function toBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  return BigInt(String(value).split('.')[0] || '0');
}
