import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  BoostablePostList,
  BoostablePostQuery,
  BoostablePostRecord,
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
import { INSTAGRAM_BOOST_UNSUPPORTED, isInstagramProfile } from './instagram-boost-guard';

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
  /** `facebook_page` | `instagram_business` — Instagram bugün boost edilemiyor. */
  profile_type: string;
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

/** `listBoostablePosts` ham satırı. */
interface BoostablePostRow {
  id: string;
  social_profile_id: string;
  social_profile_name: string;
  profile_type: string;
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
  has_live_boost: boolean;
  /** `COUNT(*) OVER ()` — sürücüye göre string ya da number. */
  total: string | number;
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
    const [p] = await tx.$queryRaw<
      Array<{ client_id: string | null; linked: string | null; profile_type: string }>
    >(
      Prisma.sql`
        SELECT client_id, linked_ad_account_id::text AS linked,
               profile_type::text AS profile_type
        FROM social_profiles WHERE id = ${input.socialProfileId}::uuid
      `,
    );
    if (!p) throw new NotFoundException('Sosyal profil bulunamadı');
    // DOĞRULAMA KULLANIM ANINDA DEĞİL GİRİŞ ANINDA. Instagram profiline kural
    // kurulabilseydi kullanıcı bunu ancak aylar sonra, hiç boost açılmadığını
    // fark ettiğinde öğrenirdi — ya da daha kötüsü, açılan boost'un yanlış
    // olduğunu hiç öğrenemezdi.
    if (isInstagramProfile(p.profile_type)) {
      throw new BadRequestException(
        `${INSTAGRAM_BOOST_UNSUPPORTED} Kuralı bir Facebook sayfasına kur.`,
      );
    }
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
  // Elle boost — gönderi seçim listesi
  // ---------------------------------------------------------------------------

  /**
   * Öne çıkarılabilecek gönderiler.
   *
   * ELLE BOOST'UN İLK EKRANI. `organic_posts` tablosu ve senkronizasyonu
   * baştan beri vardı ama tabloyu okuyan HİÇBİR uç nokta yoktu: gönderiler
   * yalnızca kural motorunun aday sorgusundan görünüyordu ve kullanıcı
   * "hangi gönderilerim var" sorusunu hiçbir yerde soramıyordu.
   *
   * ÖNE ÇIKARILAMAYAN GÖNDERİ GİZLENMİYOR, SEBEBİYLE GÖSTERİLİYOR. Süzmek
   * daha temiz bir liste verirdi ve tam da bu yüzden yanlış: Instagram
   * gönderisini aramaya gelen kullanıcı listede hiç bulamayınca
   * senkronizasyonun bozuk olduğunu düşünür. Üç engel sebebi var ve üçü de
   * satırın kendisinde yazılı.
   *
   * SIRA ETKİLEŞİME GÖRE DEĞİL TARİHE GÖRE. Kural motoru en çok etkileşim
   * alanı seçiyor çünkü kararı o veriyor; burada kararı kullanıcı veriyor ve
   * aradığı gönderi neredeyse her zaman "az önce paylaştığım" oluyor.
   * Kuralın asla seçemeyeceği yeni gönderiler (§7.2) tam olarak bunlar.
   */
  async listBoostablePosts(
    ctx: TenantContext,
    query: BoostablePostQuery,
  ): Promise<BoostablePostList> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const profileFilter = query.socialProfileId
        ? Prisma.sql`AND p.social_profile_id = ${query.socialProfileId}::uuid`
        : Prisma.empty;

      const rows = await tx.$queryRaw<BoostablePostRow[]>(Prisma.sql`
        SELECT p.id::text AS id, p.social_profile_id::text AS social_profile_id,
               sp.name AS social_profile_name, sp.profile_type::text AS profile_type,
               sp.linked_ad_account_id::text AS linked_ad_account_id,
               p.external_id, p.media_type, p.message, p.permalink, p.thumbnail_url,
               p.published_at, p.impressions, p.reach, p.likes, p.comments,
               p.shares, p.saves, p.video_views, p.engagements, p.boosted_at,
               -- CANLI BOOST VARLIĞI, boost SAYISI değil.
               --
               -- Kısmi tekil indeks aynı gönderi için ikinci canlı boost'u
               -- zaten reddediyor; ekranın bunu YAYINDAN ÖNCE bilmesi
               -- gerekiyor, yoksa kullanıcı formu doldurup ham bir kısıt
               -- ihlaliyle karşılaşır.
               EXISTS (
                 SELECT 1 FROM boosts b
                 WHERE b.organic_post_id = p.id
                   AND b.status IN ('candidate', 'approved', 'creating', 'active')
               ) AS has_live_boost,
               COUNT(*) OVER () AS total
        FROM organic_posts p
        JOIN social_profiles sp ON sp.id = p.social_profile_id
        WHERE p.client_id = ${query.clientId}::uuid ${profileFilter}
        ORDER BY p.published_at DESC
        LIMIT ${query.limit}
      `);

      return {
        items: rows.map((r) => this.toBoostablePost(r)),
        // TOPLAM PENCERE FONKSİYONUNDAN, ikinci bir COUNT sorgusundan değil:
        // iki sorgu, liste ile sayının farklı anlara ait olması demek olurdu.
        total: rows.length > 0 ? Number(rows[0]!.total) : 0,
        limit: query.limit,
      };
    });
  }

  private toBoostablePost(r: BoostablePostRow): BoostablePostRecord {
    const reach = Number(r.reach ?? 0);
    const engagements = Number(r.engagements ?? 0);

    /**
     * ENGEL SIRASI ÖNEMLİ — kullanıcı TEK bir sebep görüyor.
     *
     * Instagram önce geliyor çünkü en temeli: bağlı hesap atansa da,
     * canlı boost olmasa da o gönderi bugün yayınlanamıyor. "Bağlı reklam
     * hesabı yok" demek, kullanıcıyı çözülse bile işe yaramayacak bir işe
     * göndermek olurdu.
     */
    let blockedReason: string | null = null;
    if (isInstagramProfile(r.profile_type)) {
      blockedReason = INSTAGRAM_BOOST_UNSUPPORTED;
    } else if (!r.linked_ad_account_id) {
      blockedReason =
        'Bu sayfaya bağlı bir reklam hesabı yok — boost faturalandırılamaz. ' +
        'Platform Bağlantıları ekranından hesabı eşleştir.';
    } else if (r.has_live_boost) {
      blockedReason =
        'Bu gönderi için zaten yayında ya da onay bekleyen bir boost var. ' +
        'Aynı gönderiye ikinci bir boost açmak bütçeyi iki katına çıkarırdı.';
    }

    /**
     * UYARI, ENGEL DEĞİL (K20).
     *
     * Daha önce öne çıkarılmış bir gönderiyi ikinci kez öne çıkarmak kural
     * yolunda yasak — kural aynı gönderiye ikinci kez para harcamamalı. Elle
     * yolda gönderiyi seçen kullanıcının kendisi ve kararı geri çevirmek
     * değil, bilgilendirmek doğru.
     */
    const warning =
      r.boosted_at && !r.has_live_boost
        ? `Bu gönderi daha önce (${r.boosted_at.toLocaleDateString('tr-TR')}) öne çıkarıldı.`
        : null;

    return {
      id: r.id,
      socialProfileId: r.social_profile_id,
      socialProfileName: r.social_profile_name,
      profileType: r.profile_type as BoostablePostRecord['profileType'],
      adAccountId: r.linked_ad_account_id,
      externalId: r.external_id,
      mediaType: r.media_type,
      message: r.message,
      permalink: r.permalink,
      thumbnailUrl: r.thumbnail_url,
      publishedAt: r.published_at.toISOString(),
      impressions: Number(r.impressions ?? 0),
      reach,
      likes: Number(r.likes ?? 0),
      comments: Number(r.comments ?? 0),
      shares: Number(r.shares ?? 0),
      saves: Number(r.saves ?? 0),
      videoViews: Number(r.video_views ?? 0),
      engagements,
      engagementRate: reach > 0 ? (engagements / reach) * 100 : null,
      boostedAt: r.boosted_at?.toISOString() ?? null,
      blockedReason,
      warning,
    };
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
             sp.linked_ad_account_id::text AS linked_ad_account_id,
             sp.profile_type::text AS profile_type
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
    let instagramSkipped = 0;
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

      /**
       * INSTAGRAM GÖNDERİSİ ATLANIYOR — ama SAYILARAK.
       *
       * Kuralın `social_profile_id`'si boşsa müşterinin bütün profilleri
       * taranıyor, Instagram dahil. `assertProfile` yalnızca profili AÇIKÇA
       * seçen kuralı engelliyor; buradaki yol onun kapsamadığı hâl.
       *
       * ÖLÇÜTLERDEN SONRA SAYILIYOR, önce değil: kuralın eşiğini zaten
       * geçemeyecek 14 Instagram gönderisini "atlandı" diye bildirmek,
       * kullanıcıya kaybettiği bir şey varmış hissi verirdi. Buradaki sayı
       * gerçekten boost edilecekken engellenmiş gönderilerin sayısı.
       */
      if (isInstagramProfile(p.profile_type)) {
        instagramSkipped++;
        continue;
      }

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
      const [boost] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
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
        -- RETURNING İLE ÇAKIŞMA AYIRT EDİLİYOR: DO NOTHING satır döndürmüyor
        -- ve boş sonuç "bu gönderi zaten alınmış" demek. Eskiden executeRaw
        -- kullanılıyordu ve çakışan tur da oluşturulmuş sayılıyordu — sayı bir
        -- fazla çıkıyordu ve kimse fark etmiyordu.
        RETURNING id::text AS id
      `);
      if (!boost) continue;

      await this.writeCandidateTree(tx, {
        boostId: boost.id,
        orgId: rule.org_id,
        clientId: rule.client_id,
        ruleId: rule.id,
        ruleName: rule.name,
        adAccountId: p.linked_ad_account_id,
        socialProfileId: p.social_profile_id,
        organicPostId: p.id,
        dailyBudgetMicros: dailyBudget,
        durationDays: rule.duration_days,
        objective: rule.objective,
        postExternalId: p.external_id,
        now,
      });

      created++;
      committed += perBoost;
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE boost_rules SET last_run_at = ${now} WHERE id = ${ruleId}::uuid
    `);

    if (cappedOut > 0) {
      notes.push(`${cappedOut} aday aylık tavana takıldı`);
    }
    // SESSİZ KESME YOK. Ölçütleri geçmiş ama açılamamış gönderi varsa sayısı
    // ve SEBEBİ yazılıyor; yoksa kullanıcı kuralın çalışmadığını sanar.
    if (instagramSkipped > 0) {
      notes.push(
        `${instagramSkipped} gönderi ölçütleri geçti ama Instagram'da. ` +
          INSTAGRAM_BOOST_UNSUPPORTED,
      );
    }
    return { evaluated: posts.length, created, cappedOut, notes };
  }

  /**
   * Adayla birlikte KAMPANYA TASLAĞI yazar.
   *
   * NEDEN ADAY AŞAMASINDA: bugüne kadar bir boost adayı yalnızca `boosts`
   * tablosunda vardı ve kampanya listesinde hiç görünmüyordu. Onay ekranı
   * "ne yayınlanacak" sorusuna tek cümlelik bir özetle cevap veriyordu; oysa
   * onaylanan şey PARA TAAHHÜDÜ ve kullanıcının tam olarak neyi onayladığını
   * görmesi gerekiyor.
   *
   * TASLAK OLARAK doğuyor (`status = 'draft'`), yayınlanmış olarak değil.
   * Onaylanan boost platformda oluşunca AYNI satır `published` oluyor —
   * ikinci bir kampanya doğmuyor.
   *
   * SESSİZ KALMIYOR ama ADAYI DA DÜŞÜRMÜYOR: taslak yazılamazsa aday yine
   * geçerli ve onaylanabilir; yalnızca listede görünmez. Hata fırlatmak,
   * kuralın bütün turunu bir görüntüleme sorunu yüzünden durdurmak olurdu.
   */
  private async writeCandidateTree(
    tx: TxLike,
    p: {
      boostId: string;
      orgId: string;
      clientId: string;
      ruleId: string;
      ruleName: string;
      adAccountId: string;
      socialProfileId: string;
      organicPostId: string;
      dailyBudgetMicros: bigint;
      durationDays: number;
      objective: string;
      postExternalId: string;
      now: Date;
    },
  ): Promise<void> {
    try {
      const name = `Boost — ${p.ruleName} — ${p.postExternalId.slice(-8)}`;
      const endAt = new Date(p.now.getTime() + p.durationDays * 86_400_000);

      const [campaign] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_campaigns (
          id, org_id, client_id, platform, ad_account_id, name, surface, goal,
          settings, budget_mode, budget_amount_micros, end_at, status,
          source, boost_rule_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${p.orgId}::uuid, ${p.clientId}::uuid, 'meta',
          ${p.adAccountId}::uuid, ${name}, 'simple', NULL,
          ${JSON.stringify({ objective: p.objective })}::jsonb,
          'daily', ${p.dailyBudgetMicros}::bigint, ${endAt}::timestamptz,
          'draft', 'boost_rule', ${p.ruleId}::uuid, now()
        )
        RETURNING id::text AS id
      `);
      if (!campaign) throw new Error('Kampanya taslağı yazılamadı');

      const [group] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        INSERT INTO draft_ad_groups (
          id, org_id, campaign_id, name, position, social_profile_id, updated_at
        ) VALUES (
          gen_random_uuid(), ${p.orgId}::uuid, ${campaign.id}::uuid, ${name}, 0,
          ${p.socialProfileId}::uuid, now()
        )
        RETURNING id::text AS id
      `);
      if (!group) throw new Error('Reklam grubu yazılamadı');

      // KREATİF YOK, GÖNDERİ VAR: boost edilen gönderinin metni ve görseli
      // zaten Meta'da.
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO draft_ads (
          id, org_id, ad_group_id, creative_id, organic_post_id, name, position, updated_at
        ) VALUES (
          gen_random_uuid(), ${p.orgId}::uuid, ${group.id}::uuid, NULL,
          ${p.organicPostId}::uuid, ${name}, 0, now()
        )
      `);

      await tx.$executeRaw(Prisma.sql`
        UPDATE boosts SET draft_campaign_id = ${campaign.id}::uuid, updated_at = now()
        WHERE id = ${p.boostId}::uuid
      `);
    } catch (err) {
      this.logger.error(
        `Boost adayı ağaca yazılamadı (${p.boostId}): ` +
          `${err instanceof Error ? err.message : String(err)}. ` +
          'Aday geçerli ve onaylanabilir; yalnızca kampanya listesinde görünmeyecek.',
      );
    }
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

      /**
       * REDDEDİLEN ADAYIN TASLAĞI SİLİNİYOR.
       *
       * Bırakmak, kampanya listesinde asla yayınlanmayacak bir taslak
       * bırakmak olurdu — ve kullanıcı onu görüp "bunu ben mi unuttum" diye
       * düşünürdü. Onay reddi, o kampanyanın hiç var olmaması demek.
       *
       * Yayınlanmış bir taslak zaten silinmiyor (`status <> 'published'`);
       * reddedilen aday hiç yayınlanmamış olduğu için koşul her zaman
       * tutuyor, ama koşul yine de duruyor: bir gün "reddet" yayındaki bir
       * boost için de çağrılabilir hâle gelirse, o kampanyayı silmemeli.
       */
      if (!approve) {
        await tx.$executeRaw(Prisma.sql`
          DELETE FROM draft_campaigns
          WHERE id = (SELECT draft_campaign_id FROM boosts WHERE id = ${boostId}::uuid)
            AND status <> 'published'
        `);
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
