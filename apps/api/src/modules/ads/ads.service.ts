import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AdCreative,
  AdDetail,
  AdExplorerRow,
  AdStatus,
  AdsExploreQuery,
  AdsExploreResult,
  MetricTotals,
  Platform,
  TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { hasReviewIssue, parseReviewIssues } from './review-issues';

/**
 * Ads Explorer sorgu katmanı.
 *
 * Modül 3'ün panelinden ayrı bir servis olmasının sebebi sorunun farklı olması:
 * orada "nasıl gidiyoruz" (toplamlar, eğilim), burada "hangi reklam neyi
 * yapıyor" (creative içeriği, inceleme durumu, tek tek karşılaştırma).
 *
 * Dört zor karar:
 *
 *   1. METRİKSİZ REKLAM DA GÖRÜNÜYOR. `insights_daily` ile LEFT JOIN: harcaması
 *      olmayan reklam listeden düşmüyor. Duraklatılmış ya da yeni bir reklamı
 *      gizlemek "reklamım nerede" sorusunu üretir ve kullanıcı panelin bozuk
 *      olduğunu düşünür.
 *
 *   2. TÜRETİLMİŞ METRİKLERE GÖRE SIRALAMA SQL'DE. İstemcide sıralamak yalnızca
 *      o SAYFAYI sıralar ve "en yüksek CPA'lı reklam" sorusunu yanlış yanıtlar.
 *
 *   3. ERİŞİM DETAYDA, LİSTEDE DEĞİL. Reklam düzeyinde erişim toplanamıyor
 *      (aynı kişi iki gün de görmüş olabilir) ve listede her satır için
 *      "günlük ortalama" etiketi taşımak okunmaz. Detayda doğru etiketle var.
 *
 *   4. REDDEDİLME SEBEPLERİ NORMALİZE. Meta ve Google bu bilgiyi tamamen farklı
 *      yapılarda veriyor; arayüzün platform bilmesi gerekmiyor.
 */

/** Sıralama alanı → SQL ifadesi. */
const SORT_SQL: Record<AdsExploreQuery['sort'], string> = {
  spend: 'COALESCE(m.spend_micros, 0)',
  impressions: 'COALESCE(m.impressions, 0)',
  clicks: 'COALESCE(m.clicks, 0)',
  conversions: 'COALESCE(m.conversions, 0)',
  // Türetilmiş: bölen sıfırsa NULL, sıfır DEĞİL — böylece "veri yok" satırlar
  // sıralamada en sona düşüyor ve gerçek sıfırla karışmıyor.
  ctr: 'CASE WHEN COALESCE(m.impressions,0) > 0 THEN m.clicks::numeric / m.impressions ELSE NULL END',
  cpa: 'CASE WHEN COALESCE(m.conversions,0) > 0 THEN m.spend_micros::numeric / m.conversions ELSE NULL END',
  name: 'a.name',
};

interface RawAdRow {
  id: string;
  external_id: string;
  name: string;
  status: string;
  effective_status: string | null;
  platform: Platform;
  deleted_at: Date | null;
  review_status: string | null;
  disapproval_reasons: unknown;
  preview_url: string | null;
  ad_group_id: string;
  ad_group_name: string | null;
  campaign_id: string;
  campaign_name: string | null;
  campaign_objective: string | null;
  currency: string | null;
  creative_external_id: string | null;
  creative_type: string | null;
  headline: string | null;
  primary_text: string | null;
  description: string | null;
  cta_type: string | null;
  destination_url: string | null;
  display_url: string | null;
  asset_urls: unknown;
  impressions: string | number | null;
  clicks: string | number | null;
  spend_micros: string | number | bigint | null;
  conversions: string | number | null;
  conversion_value_micros: string | number | bigint | null;
}

@Injectable()
export class AdsService {
  constructor(private readonly prisma: PrismaService) {}

  async explore(ctx: TenantContext, query: AdsExploreQuery): Promise<AdsExploreResult> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const where = this.whereClauses(query);

      // Metrikler önce reklam bazında toplanıyor, SONRA join ediliyor.
      //
      // Doğrudan join edip GROUP BY yapmak da olurdu ama o zaman süzgeç ve
      // sıralama ifadeleri toplama fonksiyonlarının içine giriyor ve sorgu
      // okunamaz hâle geliyor. Alt sorgu ayrıca partition pruning'i koruyor:
      // tarih filtresi doğrudan `insights_daily` üzerinde.
      const metricsCte = Prisma.sql`
        SELECT entity_id,
               SUM(impressions) AS impressions,
               SUM(clicks) AS clicks,
               SUM(spend_micros) AS spend_micros,
               SUM(conversions) AS conversions,
               SUM(conversion_value_micros) AS conversion_value_micros,
               MAX(currency) AS currency
        FROM insights_daily
        WHERE date BETWEEN ${query.from}::date AND ${query.to}::date
          AND entity_level = 'ad'::"EntityLevel"
        GROUP BY entity_id
      `;

      const orderBy = Prisma.raw(
        `${SORT_SQL[query.sort]} ${query.dir === 'asc' ? 'ASC' : 'DESC'} NULLS LAST, a.name ASC`,
      );

      const rows = await tx.$queryRaw<RawAdRow[]>(
        Prisma.sql`
          WITH m AS (${metricsCte})
          SELECT a.id, a.external_id, a.name, a.status::text AS status, a.effective_status,
                 a.platform, a.deleted_at, a.review_status, a.disapproval_reasons, a.preview_url,
                 a.ad_group_id, g.name AS ad_group_name,
                 g.campaign_id, c.name AS campaign_name, c.objective AS campaign_objective,
                 m.currency,
                 cr.external_id AS creative_external_id, cr.creative_type, cr.headline,
                 cr.primary_text, cr.description, cr.cta_type, cr.destination_url,
                 cr.display_url, cr.asset_urls,
                 m.impressions, m.clicks, m.spend_micros, m.conversions,
                 m.conversion_value_micros
          FROM ads a
          JOIN ad_groups g ON g.id = a.ad_group_id
          JOIN campaigns c ON c.id = g.campaign_id
          LEFT JOIN creatives cr ON cr.id = a.creative_id
          -- LEFT JOIN: metriği olmayan reklam listeden DÜŞMÜYOR.
          LEFT JOIN m ON m.entity_id = a.id
          WHERE ${where}
          ORDER BY ${orderBy}
          LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}
        `,
      );

      const [countRow] = await tx.$queryRaw<Array<{ total: string | number }>>(
        Prisma.sql`
          WITH m AS (${metricsCte})
          SELECT COUNT(*) AS total
          FROM ads a
          JOIN ad_groups g ON g.id = a.ad_group_id
          JOIN campaigns c ON c.id = g.campaign_id
          LEFT JOIN creatives cr ON cr.id = a.creative_id
          LEFT JOIN m ON m.entity_id = a.id
          WHERE ${where}
        `,
      );

      // Toplamlar SAYFANIN değil, SÜZGECİN tamamının. Sayfa toplamı göstermek
      // "25 reklamın harcaması" gibi görünür ve yanlış karar verdirir.
      const [totalsRow] = await tx.$queryRaw<
        Array<{
          impressions: string | number | null;
          clicks: string | number | null;
          spend_micros: string | number | bigint | null;
          conversions: string | number | null;
          conversion_value_micros: string | number | bigint | null;
          currency_count: string | number;
          currency: string | null;
        }>
      >(
        Prisma.sql`
          WITH m AS (${metricsCte})
          SELECT SUM(m.impressions) AS impressions,
                 SUM(m.clicks) AS clicks,
                 SUM(m.spend_micros) AS spend_micros,
                 SUM(m.conversions) AS conversions,
                 SUM(m.conversion_value_micros) AS conversion_value_micros,
                 COUNT(DISTINCT m.currency) AS currency_count,
                 MIN(m.currency) AS currency
          FROM ads a
          JOIN ad_groups g ON g.id = a.ad_group_id
          JOIN campaigns c ON c.id = g.campaign_id
          LEFT JOIN creatives cr ON cr.id = a.creative_id
          LEFT JOIN m ON m.entity_id = a.id
          WHERE ${where}
        `,
      );

      const facets = await this.facets(tx, query);

      const mapped = rows.map((r) => this.toRow(r));

      return {
        rows: mapped,
        total: Number(countRow?.total ?? 0),
        page: query.page,
        pageSize: query.pageSize,
        totals: this.totals(totalsRow),
        // Karışık para biriminde tek sembol göstermek yanlış olurdu.
        currency: Number(totalsRow?.currency_count ?? 0) === 1 ? totalsRow?.currency ?? null : null,
        facets,
      };
    });
  }

  async detail(ctx: TenantContext, adId: string, from: string, to: string): Promise<AdDetail> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<Array<RawAdRow & { raw: unknown }>>(
        Prisma.sql`
          WITH m AS (
            SELECT entity_id,
                   SUM(impressions) AS impressions,
                   SUM(clicks) AS clicks,
                   SUM(spend_micros) AS spend_micros,
                   SUM(conversions) AS conversions,
                   SUM(conversion_value_micros) AS conversion_value_micros,
                   MAX(currency) AS currency
            FROM insights_daily
            WHERE date BETWEEN ${from}::date AND ${to}::date
              AND entity_level = 'ad'::"EntityLevel"
              AND entity_id = ${adId}::uuid
            GROUP BY entity_id
          )
          SELECT a.id, a.external_id, a.name, a.status::text AS status, a.effective_status,
                 a.platform, a.deleted_at, a.review_status, a.disapproval_reasons, a.preview_url,
                 a.raw,
                 a.ad_group_id, g.name AS ad_group_name,
                 g.campaign_id, c.name AS campaign_name, c.objective AS campaign_objective,
                 m.currency,
                 cr.external_id AS creative_external_id, cr.creative_type, cr.headline,
                 cr.primary_text, cr.description, cr.cta_type, cr.destination_url,
                 cr.display_url, cr.asset_urls,
                 m.impressions, m.clicks, m.spend_micros, m.conversions,
                 m.conversion_value_micros
          FROM ads a
          JOIN ad_groups g ON g.id = a.ad_group_id
          JOIN campaigns c ON c.id = g.campaign_id
          LEFT JOIN creatives cr ON cr.id = a.creative_id
          LEFT JOIN m ON m.entity_id = a.id
          WHERE a.id = ${adId}::uuid
        `,
      );

      const row = rows[0];
      // RLS nedeniyle başka müşterinin reklamı da "bulunamadı" olarak görünüyor
      // — varlığını sızdırmamak doğru davranış.
      if (!row) throw new NotFoundException('Reklam bulunamadı');

      const daily = await tx.$queryRaw<
        Array<{
          date: Date;
          impressions: number;
          clicks: number;
          spend_micros: bigint | string | number;
          conversions: string | number;
          conversion_value_micros: bigint | string | number;
        }>
      >(
        Prisma.sql`
          SELECT date, impressions, clicks, spend_micros, conversions, conversion_value_micros
          FROM insights_daily
          WHERE entity_level = 'ad'::"EntityLevel"
            AND entity_id = ${adId}::uuid
            AND date BETWEEN ${from}::date AND ${to}::date
          ORDER BY date
        `,
      );

      // Erişim toplanamıyor: aynı kişi reklamı iki gün de görmüş olabilir.
      const [reachRow] = await tx.$queryRaw<
        Array<{ total_reach: string | number | null; day_count: string | number }>
      >(
        Prisma.sql`
          SELECT SUM(reach) AS total_reach, COUNT(DISTINCT date) AS day_count
          FROM insights_daily
          WHERE entity_level = 'ad'::"EntityLevel"
            AND entity_id = ${adId}::uuid
            AND date BETWEEN ${from}::date AND ${to}::date
        `,
      );
      const reachDays = Number(reachRow?.day_count ?? 0);
      const reachTotal =
        reachRow?.total_reach === null || reachRow?.total_reach === undefined
          ? null
          : Number(reachRow.total_reach);
      const reachKind = reachDays <= 1 ? ('exact' as const) : ('daily_average' as const);

      return {
        ...this.toRow(row),
        daily: daily.map((d) => ({
          date: this.dateText(d.date),
          ...this.totals({
            impressions: d.impressions,
            clicks: d.clicks,
            spend_micros: d.spend_micros,
            conversions: d.conversions,
            conversion_value_micros: d.conversion_value_micros,
          }),
        })),
        reach:
          reachTotal === null || reachDays === 0
            ? null
            : reachKind === 'exact'
              ? reachTotal
              : Math.round(reachTotal / reachDays),
        reachKind,
        raw: row.raw,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private whereClauses(query: AdsExploreQuery): Prisma.Sql {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (query.platform) parts.push(Prisma.sql`a.platform = ${query.platform}::"Platform"`);
    if (query.adAccountId) parts.push(Prisma.sql`a.ad_account_id = ${query.adAccountId}::uuid`);
    if (query.campaignId) parts.push(Prisma.sql`g.campaign_id = ${query.campaignId}::uuid`);
    if (query.adGroupId) parts.push(Prisma.sql`a.ad_group_id = ${query.adGroupId}::uuid`);
    if (query.status) parts.push(Prisma.sql`a.status = ${query.status}::"EntityStatus"`);

    if (query.onlyIssues) {
      // Reddedilme geri bildirimi olan ya da durumu sorunlu olanlar.
      // `PENDING_REVIEW` sorun DEĞİL — normal akış.
      parts.push(
        Prisma.sql`(a.disapproval_reasons IS NOT NULL
                    OR a.review_status IN ('DISAPPROVED', 'WITH_ISSUES'))`,
      );
    }

    if (query.q) {
      // Reklam adında VE creative metninde arama: kullanıcı çoğu zaman
      // reklamın adını değil içindeki cümleyi hatırlıyor.
      const like = `%${query.q}%`;
      parts.push(
        Prisma.sql`(a.name ILIKE ${like}
                    OR cr.headline ILIKE ${like}
                    OR cr.primary_text ILIKE ${like}
                    OR c.name ILIKE ${like}
                    OR a.external_id = ${query.q})`,
      );
    }

    return Prisma.join(parts, ' AND ');
  }

  /** Süzgeç panelini dolduran sayımlar. */
  private async facets(
    tx: { $queryRaw: <T>(sql: Prisma.Sql) => Promise<T> },
    query: AdsExploreQuery,
  ): Promise<AdsExploreResult['facets']> {
    // Facet'ler TARİH ARALIĞINDAN bağımsız: süzgeç panelinde bir kampanyanın
    // kaybolması ("dün harcama yoktu" diye) kullanıcıyı şaşırtıyor.
    const base = Prisma.sql`
      FROM ads a
      JOIN ad_groups g ON g.id = a.ad_group_id
      JOIN campaigns c ON c.id = g.campaign_id
      WHERE ${
        query.platform ? Prisma.sql`a.platform = ${query.platform}::"Platform"` : Prisma.sql`TRUE`
      }
    `;

    const adAccounts = await tx.$queryRaw<
      Array<{ id: string; name: string; platform: string; ad_count: string }>
    >(
      Prisma.sql`
        SELECT acc.id, acc.name, acc.platform::text AS platform, COUNT(a.id) AS ad_count
        FROM ads a
        JOIN ad_accounts acc ON acc.id = a.ad_account_id
        WHERE ${
          query.platform ? Prisma.sql`a.platform = ${query.platform}::"Platform"` : Prisma.sql`TRUE`
        }
        GROUP BY acc.id, acc.name, acc.platform
        ORDER BY COUNT(a.id) DESC, acc.name
        LIMIT 50
      `,
    );

    // Kampanya listesi SEÇİLİ HESABA göre daralıyor.
    //
    // Ajans görünümünde onlarca kampanya var; hepsini listelemek süzgeç
    // panelini kullanılamaz hâle getiriyor. Hesap seçiliyse yalnızca o hesabın
    // kampanyaları gösteriliyor.
    const campaignScope = query.adAccountId
      ? Prisma.sql`AND a.ad_account_id = ${query.adAccountId}::uuid`
      : Prisma.empty;

    const campaigns = await tx.$queryRaw<Array<{ id: string; name: string; ad_count: string }>>(
      Prisma.sql`
        SELECT c.id, c.name, COUNT(a.id) AS ad_count
        ${base}
        ${campaignScope}
        GROUP BY c.id, c.name
        ORDER BY COUNT(a.id) DESC, c.name
        LIMIT 50
      `,
    );

    const statuses = await tx.$queryRaw<Array<{ status: string; count: string }>>(
      Prisma.sql`
        SELECT a.status::text AS status, COUNT(*) AS count
        ${base}
        GROUP BY a.status
        ORDER BY COUNT(*) DESC
      `,
    );

    const [issues] = await tx.$queryRaw<Array<{ count: string }>>(
      Prisma.sql`
        SELECT COUNT(*) AS count
        ${base}
          AND (a.disapproval_reasons IS NOT NULL
               OR a.review_status IN ('DISAPPROVED', 'WITH_ISSUES'))
      `,
    );

    return {
      adAccounts: adAccounts.map((a) => ({
        id: a.id,
        name: a.name,
        platform: a.platform,
        adCount: Number(a.ad_count),
      })),
      campaigns: campaigns.map((c) => ({ id: c.id, name: c.name, adCount: Number(c.ad_count) })),
      statuses: statuses.map((s) => ({ status: s.status as AdStatus, count: Number(s.count) })),
      issueCount: Number(issues?.count ?? 0),
    };
  }

  private toRow(r: RawAdRow): AdExplorerRow {
    const issues = parseReviewIssues(r.platform, r.disapproval_reasons);

    return {
      id: r.id,
      externalId: r.external_id,
      name: r.name,
      status: r.status as AdStatus,
      effectiveStatus: r.effective_status,
      platform: r.platform,
      // Metrik yoksa para birimi de yok; satır yine gösteriliyor.
      currency: r.currency ?? '',
      adGroupId: r.ad_group_id,
      adGroupName: r.ad_group_name ?? '—',
      campaignId: r.campaign_id,
      campaignName: r.campaign_name ?? '—',
      campaignObjective: r.campaign_objective,
      deleted: r.deleted_at !== null,
      reviewStatus: r.review_status,
      issues,
      creative: this.toCreative(r),
      previewUrl: r.preview_url,
      ...this.totals(r),
      // `hasReviewIssue` burada çağrılmıyor: arayüz `issues.length` ve
      // `reviewStatus`a bakarak kendi kararını veriyor. Yine de süzgeçle
      // tutarlı kalması için aynı mantık `whereClauses` içinde.
    };
  }

  private toCreative(r: RawAdRow): AdCreative | null {
    if (!r.creative_external_id) return null;
    return {
      externalId: r.creative_external_id,
      creativeType: r.creative_type,
      headline: r.headline,
      primaryText: r.primary_text,
      description: r.description,
      ctaType: r.cta_type,
      destinationUrl: r.destination_url,
      displayUrl: r.display_url,
      assetUrls: Array.isArray(r.asset_urls)
        ? r.asset_urls.filter((u): u is string => typeof u === 'string')
        : [],
    };
  }

  private totals(raw: {
    impressions: string | number | null;
    clicks: string | number | null;
    spend_micros: string | number | bigint | null;
    conversions: string | number | null;
    conversion_value_micros: string | number | bigint | null;
  } | undefined): MetricTotals {
    const impressions = Number(raw?.impressions ?? 0);
    const clicks = Number(raw?.clicks ?? 0);
    const spendMicros = BigInt(this.bigintText(raw?.spend_micros));
    const conversions = Number(raw?.conversions ?? 0);
    const valueMicros = BigInt(this.bigintText(raw?.conversion_value_micros));
    const spend = Number(spendMicros) / 1_000_000;
    const value = Number(valueMicros) / 1_000_000;

    return {
      impressions,
      clicks,
      spendMicros: spendMicros.toString(),
      conversions,
      conversionValueMicros: valueMicros.toString(),
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      cpa: conversions > 0 ? spend / conversions : null,
      // Gelir takip edilmiyorsa ROAS uygulanamaz — "0.00×" kampanyanın
      // battığını söylerdi.
      roas: spend > 0 && value > 0 ? value / spend : null,
    };
  }

  private bigintText(value: string | number | bigint | null | undefined): string {
    if (value === null || value === undefined) return '0';
    if (typeof value === 'bigint') return value.toString();
    return String(value).split('.')[0] || '0';
  }

  /** `DATE` → YYYY-MM-DD, saat dilimi kayması olmadan. */
  private dateText(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}

export { hasReviewIssue };
