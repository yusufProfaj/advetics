import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CONVERSION_BUCKETS,
  REPORT_SECTIONS,
  type ConversionBucket,
  type ConversionCounts,
  type MetricTotals,
  type ReportCampaignRow,
  type ReportData,
  type ReportDailyPoint,
  type ReportPlatformBlock,
  type ReportSection,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { emptyCounts, roundCounts } from './conversion-buckets';

/**
 * Rapor verisi toplama.
 *
 * Panelin sorgu katmanından (MetricsService) ayrı olmasının sebebi, raporun
 * FARKLI SORULAR sorması:
 *
 *   · Panel "toplam dönüşüm" istiyor; rapor "Form / Mesaj / Satış" ayrı ayrı.
 *   · Panel tek para birimi varsayıp toplamı gösteriyor; rapor platform bazında
 *     blok + TOPLAM gösteriyor (referans belgenin 2. sayfası).
 *   · Panel erişimi hiç göstermiyor (toplanamaz); rapor kampanya bazında
 *     göstermek zorunda çünkü müşterinin alışkın olduğu belgede var.
 *
 * Aynı servise sıkıştırmak, ikisinin de sorularını bulanıklaştırırdı.
 */

/**
 * Toplamların okunduğu seviye.
 *
 * `campaign`, `account` DEĞİL — MetricsService ile aynı gerekçe: kampanya
 * satırları harcama olduğunda her zaman var, hesap seviyesi platforma göre
 * değişiyor. Canlı doğrulama: Meta'da ikisi kuruşuna kadar eşit.
 */
const LEVEL = Prisma.sql`'campaign'::"EntityLevel"`;

interface RawMetricRow {
  entity_id: string;
  impressions: string | number | null;
  clicks: string | number | null;
  spend_micros: string | number | bigint | null;
  conversions: string | number | null;
  conversion_value_micros: string | number | bigint | null;
  currency: string | null;
  reach_sum: string | number | null;
  day_count: string | number | null;
}

interface RawBucketRow {
  entity_id: string;
  form: string | number | null;
  message: string | number | null;
  purchase: string | number | null;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async build(
    ctx: TenantContext,
    params: { clientId: string; from: string; to: string; templateId?: string },
  ): Promise<ReportData> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [client] = await tx.$queryRaw<Array<{ id: string; name: string }>>(
        Prisma.sql`SELECT id, name FROM clients WHERE id = ${params.clientId}::uuid`,
      );
      // RLS nedeniyle başka müşterinin kaydı da "bulunamadı" görünüyor —
      // varlığını sızdırmamak doğru davranış.
      if (!client) throw new NotFoundException('Müşteri bulunamadı');

      const branding = await this.branding(tx, params.clientId);
      const template = await this.template(tx, params.clientId, params.templateId);

      const [platformBlocks, campaigns, daily, topAds] = await Promise.all([
        this.platformBlocks(tx, params),
        this.campaignRows(tx, params),
        this.dailySeries(tx, params),
        this.topAds(tx, params),
      ]);

      // Para birimi: tek ise toplam anlamlı, birden fazlaysa null.
      // `fx_rates` çevrimi henüz yok ve 1 USD + 1 TRY'yi toplamak sessizce
      // yanlış olur.
      const currencies = [...new Set(platformBlocks.map((b) => b.currency).filter(Boolean))];
      const currency = currencies.length === 1 ? currencies[0]! : null;

      return {
        client,
        branding,
        title: template.title ?? 'Dijital Pazarlama Raporu',
        closingText: template.closingText,
        from: params.from,
        to: params.to,
        sections: template.sections,
        currency,
        platforms: platformBlocks,
        total: this.totalBlock(platformBlocks, currency),
        metaCampaigns: campaigns.filter((c) => c.platform === 'meta').map((c) => c.row),
        googleCampaigns: campaigns.filter((c) => c.platform === 'google').map((c) => c.row),
        daily,
        topAds,
        // `null` "veri yok" DEĞİL, "bu yetenek henüz yok": Google anahtar
        // kelime seviyesi senkronizasyonu yazılmadı ve Basic Access onayı
        // bekleniyor. Boş dizi "anahtar kelimen yok" demek olurdu.
        keywords: null,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Bölümler
  // ---------------------------------------------------------------------------

  private async branding(
    tx: TxLike,
    clientId: string,
  ): Promise<ReportData['branding']> {
    // Müşteriye özel profil varsa o, yoksa organizasyon varsayılanı.
    // `ORDER BY client_id NULLS LAST` müşteriye özel olanı öne alıyor.
    const rows = await tx.$queryRaw<
      Array<{
        logo_url: string | null;
        primary_color: string;
        accent_color: string;
        font_family: string;
        footer_text: string | null;
        hide_powered_by: boolean;
      }>
    >(
      Prisma.sql`
        SELECT logo_url, primary_color, accent_color, font_family, footer_text, hide_powered_by
        FROM branding_profiles
        WHERE client_id = ${clientId}::uuid OR client_id IS NULL
        ORDER BY client_id NULLS LAST
        LIMIT 1
      `,
    );

    const b = rows[0];
    return {
      logoUrl: b?.logo_url ?? null,
      primaryColor: b?.primary_color ?? '#E11D2E',
      accentColor: b?.accent_color ?? '#F97316',
      fontFamily: b?.font_family ?? 'Inter',
      footerText: b?.footer_text ?? null,
      hidePoweredBy: b?.hide_powered_by ?? false,
    };
  }

  private async template(
    tx: TxLike,
    clientId: string,
    templateId?: string,
  ): Promise<{ title: string | null; closingText: string | null; sections: ReportSection[] }> {
    const rows = await tx.$queryRaw<
      Array<{ title: string | null; closing_text: string | null; sections: unknown }>
    >(
      templateId
        ? Prisma.sql`
            SELECT title, closing_text, sections FROM report_templates
            WHERE id = ${templateId}::uuid
          `
        : Prisma.sql`
            SELECT title, closing_text, sections FROM report_templates
            WHERE client_id = ${clientId}::uuid OR client_id IS NULL
            ORDER BY client_id NULLS LAST
            LIMIT 1
          `,
    );

    const row = rows[0];
    return {
      title: row?.title ?? null,
      closingText: row?.closing_text ?? null,
      // Şablon yoksa TÜM bölümler. "Şablon tanımlanmadı" diye boş rapor
      // üretmek, kullanıcıyı hiçbir şey göstermeyen bir ekranla baş başa
      // bırakmak olurdu.
      sections: this.parseSections(row?.sections),
    };
  }

  private parseSections(value: unknown): ReportSection[] {
    if (!Array.isArray(value)) return [...REPORT_SECTIONS];
    const valid = value.filter((v): v is ReportSection =>
      REPORT_SECTIONS.includes(v as ReportSection),
    );
    return valid.length > 0 ? valid : [...REPORT_SECTIONS];
  }

  /** Platform bazında toplam blok — referans belgenin 2. sayfası. */
  private async platformBlocks(
    tx: TxLike,
    params: { clientId: string; from: string; to: string },
  ): Promise<ReportPlatformBlock[]> {
    const rows = await tx.$queryRaw<
      Array<RawMetricRow & { platform: 'meta' | 'google' }>
    >(
      Prisma.sql`
        WITH base AS (
          SELECT platform,
                 SUM(impressions) AS impressions,
                 SUM(clicks) AS clicks,
                 SUM(spend_micros) AS spend_micros,
                 SUM(conversions) AS conversions,
                 SUM(conversion_value_micros) AS conversion_value_micros,
                 MAX(currency) AS currency,
                 NULL::numeric AS reach_sum,
                 NULL::bigint AS day_count,
                 NULL::uuid AS entity_id
          FROM insights_daily
          WHERE client_id = ${params.clientId}::uuid
            AND date BETWEEN ${params.from}::date AND ${params.to}::date
            AND entity_level = ${LEVEL}
          GROUP BY platform
        ),
        buckets AS (${this.bucketSelect(params, Prisma.sql`platform`)})
        SELECT b.platform, b.impressions, b.clicks, b.spend_micros, b.conversions,
               b.conversion_value_micros, b.currency, b.reach_sum, b.day_count,
               b.entity_id,
               COALESCE(k.form, 0) AS form,
               COALESCE(k.message, 0) AS message,
               COALESCE(k.purchase, 0) AS purchase
        FROM base b
        LEFT JOIN buckets k ON k.grp::text = b.platform::text
        ORDER BY b.spend_micros DESC
      `,
    );

    return rows.map((r) => {
      const raw = r as unknown as RawBucketRow & typeof r;
      return {
        platform: r.platform,
        label: r.platform === 'meta' ? 'Meta Ads' : 'Google Ads',
        currency: r.currency,
        conversionCounts: roundCounts({
          form: Number(raw.form ?? 0),
          message: Number(raw.message ?? 0),
          purchase: Number(raw.purchase ?? 0),
        }),
        ...this.totals(r),
      };
    });
  }

  /** Kampanya satırları — erişim ve kova sayıları dâhil. */
  private async campaignRows(
    tx: TxLike,
    params: { clientId: string; from: string; to: string },
  ): Promise<Array<{ platform: 'meta' | 'google'; row: ReportCampaignRow }>> {
    const rows = await tx.$queryRaw<
      Array<
        RawMetricRow &
          RawBucketRow & {
            platform: 'meta' | 'google';
            name: string | null;
            status: string | null;
            objective: string | null;
          }
      >
    >(
      Prisma.sql`
        WITH base AS (
          SELECT i.entity_id,
                 i.platform,
                 SUM(i.impressions) AS impressions,
                 SUM(i.clicks) AS clicks,
                 SUM(i.spend_micros) AS spend_micros,
                 SUM(i.conversions) AS conversions,
                 SUM(i.conversion_value_micros) AS conversion_value_micros,
                 MAX(i.currency) AS currency,
                 -- ERİŞİM TOPLANMIYOR, ortalaması alınıyor: aynı kişi
                 -- kampanyayı iki gün de görmüş olabilir ve toplamak
                 -- müşteriye iki kat kitle söylemek olur.
                 SUM(i.reach) AS reach_sum,
                 COUNT(DISTINCT i.date) AS day_count
          FROM insights_daily i
          WHERE i.client_id = ${params.clientId}::uuid
            AND i.date BETWEEN ${params.from}::date AND ${params.to}::date
            AND i.entity_level = ${LEVEL}
          GROUP BY i.entity_id, i.platform
        ),
        buckets AS (${this.bucketSelect(params, Prisma.sql`entity_id`)})
        SELECT b.*, c.name, c.status::text AS status, c.objective,
               COALESCE(k.form, 0) AS form,
               COALESCE(k.message, 0) AS message,
               COALESCE(k.purchase, 0) AS purchase
        FROM base b
        LEFT JOIN campaigns c ON c.id = b.entity_id
        LEFT JOIN buckets k ON k.grp::text = b.entity_id::text
        ORDER BY b.spend_micros DESC
      `,
    );

    return rows.map((r) => {
      const days = Number(r.day_count ?? 0);
      const reachSum = r.reach_sum === null ? null : Number(r.reach_sum);

      return {
        platform: r.platform,
        row: {
          id: r.entity_id,
          // Yapı senkronizasyonu eksikse ad boş olabiliyor; kimliği
          // göstermek isimsiz satırdan iyi.
          name: r.name ?? r.entity_id.slice(0, 8),
          status: r.status ?? 'unknown',
          objective: r.objective,
          reach: reachSum === null || days === 0 ? null : Math.round(reachSum / days),
          reachIsDailyAverage: days > 1,
          conversionCounts: roundCounts({
            form: Number(r.form ?? 0),
            message: Number(r.message ?? 0),
            purchase: Number(r.purchase ?? 0),
          }),
          ...this.totals(r),
        },
      };
    });
  }

  /** Günlük dönüşüm serisi — referans belgedeki Form/Mesaj grafiği. */
  private async dailySeries(
    tx: TxLike,
    params: { clientId: string; from: string; to: string },
  ): Promise<ReportDailyPoint[]> {
    const rows = await tx.$queryRaw<
      Array<RawBucketRow & { date: Date; spend_micros: string | number | bigint | null }>
    >(
      Prisma.sql`
        WITH base AS (
          SELECT date, SUM(spend_micros) AS spend_micros
          FROM insights_daily
          WHERE client_id = ${params.clientId}::uuid
            AND date BETWEEN ${params.from}::date AND ${params.to}::date
            AND entity_level = ${LEVEL}
          GROUP BY date
        ),
        buckets AS (${this.bucketSelect(params, Prisma.sql`date`)})
        SELECT b.date, b.spend_micros,
               COALESCE(k.form, 0) AS form,
               COALESCE(k.message, 0) AS message,
               COALESCE(k.purchase, 0) AS purchase
        FROM base b
        LEFT JOIN buckets k ON k.grp::text = b.date::text
        ORDER BY b.date
      `,
    );

    return rows.map((r) => ({
      date: this.dateText(r.date),
      spendMicros: this.bigintText(r.spend_micros),
      conversionCounts: roundCounts({
        form: Number(r.form ?? 0),
        message: Number(r.message ?? 0),
        purchase: Number(r.purchase ?? 0),
      }),
    }));
  }

  /** En çok harcayan reklamlar — creative ile. */
  private async topAds(
    tx: TxLike,
    params: { clientId: string; from: string; to: string },
  ): Promise<ReportData['topAds']> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        name: string | null;
        campaign_name: string | null;
        headline: string | null;
        asset_urls: unknown;
        impressions: string | number | null;
        clicks: string | number | null;
        spend_micros: string | number | bigint | null;
        conversions: string | number | null;
      }>
    >(
      Prisma.sql`
        SELECT a.id, a.name, c.name AS campaign_name, cr.headline, cr.asset_urls,
               SUM(i.impressions) AS impressions,
               SUM(i.clicks) AS clicks,
               SUM(i.spend_micros) AS spend_micros,
               SUM(i.conversions) AS conversions
        FROM insights_daily i
        JOIN ads a ON a.id = i.entity_id
        JOIN ad_groups g ON g.id = a.ad_group_id
        JOIN campaigns c ON c.id = g.campaign_id
        LEFT JOIN creatives cr ON cr.id = a.creative_id
        WHERE i.client_id = ${params.clientId}::uuid
          AND i.date BETWEEN ${params.from}::date AND ${params.to}::date
          AND i.entity_level = 'ad'::"EntityLevel"
        GROUP BY a.id, a.name, c.name, cr.headline, cr.asset_urls
        ORDER BY SUM(i.spend_micros) DESC
        LIMIT 6
      `,
    );

    return rows.map((r) => {
      const t = this.totals({
        impressions: r.impressions,
        clicks: r.clicks,
        spend_micros: r.spend_micros,
        conversions: r.conversions,
        conversion_value_micros: null,
      });
      const urls = Array.isArray(r.asset_urls)
        ? r.asset_urls.filter((u): u is string => typeof u === 'string')
        : [];
      return {
        id: r.id,
        name: r.name ?? '—',
        campaignName: r.campaign_name ?? '—',
        imageUrl: urls[0] ?? null,
        headline: r.headline,
        spendMicros: t.spendMicros,
        conversions: t.conversions,
        cpa: t.cpa,
        ctr: t.ctr,
      };
    });
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  /**
   * Aksiyon kovalarını AYRI bir alt sorguda topluyor.
   *
   * KRİTİK: `jsonb_array_elements` bir LATERAL join ve satırları ÇOĞALTIYOR —
   * 5 aksiyon taşıyan bir gün 5 satıra açılıyor. Metrik toplamlarını aynı
   * sorguda yapmak harcamayı 5 katına çıkarırdı ve hata hiçbir yere hata
   * olarak düşmezdi; müşteriye 5 kat harcama raporlanırdı.
   *
   * Bu yüzden iki ayrı CTE: biri metrikleri (join'siz), diğeri kovaları
   * (LATERAL ile), sonra `grp` üzerinden birleştiriliyor.
   *
   * Aksiyon türü listeleri `packages/shared`'daki tek kaynaktan geliyor —
   * SQL'e elle yazmak iki listenin zamanla ayrışması demek olurdu.
   */
  private bucketSelect(
    params: { clientId: string; from: string; to: string },
    groupBy: Prisma.Sql,
  ): Prisma.Sql {
    const sumFor = (bucket: ConversionBucket): Prisma.Sql => {
      const types = CONVERSION_BUCKETS[bucket].actionTypes.map((t) => Prisma.sql`${t}`);
      return Prisma.sql`
        SUM(
          CASE WHEN act->>'action_type' IN (${Prisma.join(types)})
               THEN COALESCE((act->>'value')::numeric, 0)
               ELSE 0 END
        )`;
    };

    return Prisma.sql`
      SELECT ${groupBy} AS grp,
             ${sumFor('form')} AS form,
             ${sumFor('message')} AS message,
             ${sumFor('purchase')} AS purchase
      FROM insights_daily i2
      -- jsonb_array_elements boş/eksik dizide satır üretmiyor; COALESCE
      -- olmadan aksiyonsuz günler tamamen kayboluyor.
      CROSS JOIN LATERAL jsonb_array_elements(
        COALESCE(
          CASE WHEN jsonb_typeof(i2.raw_metrics -> 'actions') = 'array'
               THEN i2.raw_metrics -> 'actions'
               ELSE '[]'::jsonb END,
          '[]'::jsonb
        )
      ) AS act
      WHERE i2.client_id = ${params.clientId}::uuid
        AND i2.date BETWEEN ${params.from}::date AND ${params.to}::date
        AND i2.entity_level = ${LEVEL}
      GROUP BY ${groupBy}
    `;
  }

  private totals(raw: {
    impressions: string | number | null;
    clicks: string | number | null;
    spend_micros: string | number | bigint | null;
    conversions: string | number | null;
    conversion_value_micros: string | number | bigint | null;
  }): MetricTotals {
    const impressions = Number(raw.impressions ?? 0);
    const clicks = Number(raw.clicks ?? 0);
    const spendMicros = BigInt(this.bigintText(raw.spend_micros));
    const conversions = Number(raw.conversions ?? 0);
    const valueMicros = BigInt(this.bigintText(raw.conversion_value_micros));
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
      roas: spend > 0 && value > 0 ? value / spend : null,
    };
  }

  /**
   * TOPLAM bloğu — referans belgede platform bloklarının yanında duruyor.
   *
   * Karışık para biriminde `null` dönüyor: 1 USD + 1 TRY'yi toplayıp tek bir
   * sayı göstermek müşteriye yanlış bir toplam vermek olur. Kur çevrimi
   * (`fx_rates`) geldiğinde burası dolacak.
   */
  private totalBlock(
    blocks: ReportPlatformBlock[],
    currency: string | null,
  ): ReportPlatformBlock | null {
    if (blocks.length === 0) return null;
    // TEK PLATFORM VARSA TOPLAM YOK.
    //
    // Aynı sayıları iki kez göstermek yer kaplıyor ve "bunlar neden farklı?"
    // sorusunu doğuruyor. Referans belgede TOPLAM bloğu var çünkü orada iki
    // platform yan yana duruyor.
    if (blocks.length === 1) return null;
    if (currency === null) return null;

    let impressions = 0;
    let clicks = 0;
    let spendMicros = 0n;
    let conversions = 0;
    let valueMicros = 0n;
    const counts: ConversionCounts = emptyCounts();

    for (const b of blocks) {
      impressions += b.impressions;
      clicks += b.clicks;
      spendMicros += BigInt(b.spendMicros);
      conversions += b.conversions;
      valueMicros += BigInt(b.conversionValueMicros);
      counts.form += b.conversionCounts.form;
      counts.message += b.conversionCounts.message;
      counts.purchase += b.conversionCounts.purchase;
    }

    const spend = Number(spendMicros) / 1_000_000;
    const value = Number(valueMicros) / 1_000_000;

    return {
      platform: 'meta',
      label: 'TOPLAM',
      currency,
      conversionCounts: counts,
      impressions,
      clicks,
      spendMicros: spendMicros.toString(),
      conversions,
      conversionValueMicros: valueMicros.toString(),
      ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      cpc: clicks > 0 ? spend / clicks : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      cpa: conversions > 0 ? spend / conversions : null,
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

/** Ham sorgu yüzeyi — hem gerçek Prisma tx'i hem test koşum ortamı sağlıyor. */
interface TxLike {
  $queryRaw<T>(sql: Prisma.Sql): Promise<T>;
}
