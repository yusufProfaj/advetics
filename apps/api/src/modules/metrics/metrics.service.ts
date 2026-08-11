import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { deriveRoas } from '@advetics/shared';
import type {
  BreakdownQuery,
  MetricLevel,
  MetricTotals,
  MetricsBreakdownRow,
  MetricsQuery,
  MetricsSummary,
  MetricsTimeseriesPoint,
  Platform,
  ReachKind,
  TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import type { TxLike } from '../rules/rules.service';

/**
 * Unified Dashboard sorgu katmanı.
 *
 * Bu servisin çözdüğü dört problem:
 *
 *   1. ÇİFT SAYIM. `insights_daily` aynı harcamayı DÖRT seviyede tutuyor
 *      (hesap, kampanya, ad set, reklam). Seviye filtresi olmadan toplamak
 *      harcamayı 4 katına çıkarır. Toplamlar TEK seviyeden okunuyor.
 *
 *   2. REACH TOPLANAMAZ. Erişim tekil kullanıcı sayısı; iki kampanyanın
 *      erişimini toplamak aynı kişiyi iki kez sayar. Bu yüzden özet
 *      toplamlarında erişim HİÇ YOK — yanlış bir sayı göstermekten iyisi
 *      göstermemek.
 *
 *   3. KARIŞIK PARA BİRİMİ. 1 USD + 1 TRY = 2 ne? `fx_rates` çevrimi henüz
 *      yok; karışık durum gizlenmiyor, `currency: null` ile bildiriliyor.
 *
 *   4. RLS. Tüm sorgular `withTenant` içinde çalışıyor. Bağlam kurulmazsa
 *      RLS boş sonuç döndürüyor — sessiz boşluk, hata değil. Bu yüzden ham
 *      SQL bile `tx` üzerinden gidiyor; `PrismaAdminService` kullanmak
 *      müşteri izolasyonunu delerdi.
 */

/**
 * Toplamların okunduğu seviye.
 *
 * `campaign` seçildi, `account` DEĞİL. Gerekçe: kampanya satırları harcama
 * olduğunda her zaman var, hesap seviyesi satırı ise platforma göre değişiyor
 * (Google'da `customer` kaynağı farklı davranıyor). Canlı doğrulama: Meta'da
 * hesap seviyesi toplamı kampanya toplamına kuruşuna kadar eşit çıktı.
 */
const TOTALS_LEVEL: MetricLevel = 'campaign';

interface RawTotals {
  impressions: string | number | null;
  clicks: string | number | null;
  spend_micros: string | number | bigint | null;
  conversions: string | number | null;
  conversion_value_micros: string | number | bigint | null;
}

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(ctx: TenantContext, query: MetricsQuery): Promise<MetricsSummary> {
    // Önceki dönem AYNI UZUNLUKTA ve hemen öncesinde.
    //
    // "Geçen ay" gibi takvimsel bir pencere değil: 7 günlük bir bakışı 30
    // günlük bir dönemle karşılaştırmak yüzde değişimi anlamsız kılar.
    const days = this.dayCount(query.from, query.to);
    const prevTo = this.shift(query.from, -1);
    const prevFrom = this.shift(prevTo, -(days - 1));

    return this.prisma.withTenant(ctx, async (tx) => {
      const filters = this.filters(query);

      const hiddenAccounts = await this.hiddenAccountCount(tx, query);

      const [current] = await tx.$queryRaw<RawTotals[]>(
        Prisma.sql`
          SELECT SUM(impressions) AS impressions,
                 SUM(clicks) AS clicks,
                 SUM(spend_micros) AS spend_micros,
                 SUM(conversions) AS conversions,
                 SUM(conversion_value_micros) AS conversion_value_micros
          FROM insights_daily
          WHERE date BETWEEN ${query.from}::date AND ${query.to}::date
            AND entity_level = ${TOTALS_LEVEL}::"EntityLevel"
            ${filters}
        `,
      );

      const [previous] = await tx.$queryRaw<RawTotals[]>(
        Prisma.sql`
          SELECT SUM(impressions) AS impressions,
                 SUM(clicks) AS clicks,
                 SUM(spend_micros) AS spend_micros,
                 SUM(conversions) AS conversions,
                 SUM(conversion_value_micros) AS conversion_value_micros
          FROM insights_daily
          WHERE date BETWEEN ${prevFrom}::date AND ${prevTo}::date
            AND entity_level = ${TOTALS_LEVEL}::"EntityLevel"
            ${filters}
        `,
      );

      // Para birimi dağılımı ve tazelik aynı sorguda — ikisi de aynı satır
      // kümesinden geliyor, ayrı tur atmak gereksiz.
      const currencies = await tx.$queryRaw<
        Array<{ currency: string; spend_micros: string | number | bigint | null }>
      >(
        Prisma.sql`
          SELECT currency, SUM(spend_micros) AS spend_micros
          FROM insights_daily
          WHERE date BETWEEN ${query.from}::date AND ${query.to}::date
            AND entity_level = ${TOTALS_LEVEL}::"EntityLevel"
            ${filters}
          GROUP BY currency
          ORDER BY 2 DESC
        `,
      );

      const [meta] = await tx.$queryRaw<
        Array<{ last_fetched_at: Date | null; account_count: string | number }>
      >(
        Prisma.sql`
          SELECT MAX(fetched_at) AS last_fetched_at,
                 COUNT(DISTINCT ad_account_id) AS account_count
          FROM insights_daily
          WHERE date BETWEEN ${query.from}::date AND ${query.to}::date
            AND entity_level = ${TOTALS_LEVEL}::"EntityLevel"
            ${filters}
        `,
      );

      // ERİŞİM HESAP SEVİYESİNDEN OKUNUYOR.
      //
      // Kampanya seviyesinden toplamak mükerrer sayardı: aynı kişi iki
      // kampanyayı da görmüş olabilir ve platform hesap seviyesinde bunu
      // tekilleştirerek bildiriyor.
      //
      // Günler arası da toplanamıyor (aynı kişi iki gün de görmüş olabilir),
      // bu yüzden çok günlü aralıkta GÜNLÜK ORTALAMA veriliyor ve `reachKind`
      // ile işaretleniyor. Arayüz etiketi buna göre değişmek zorunda.
      const [reachRow] = await tx.$queryRaw<
        Array<{ total_reach: string | number | null; day_count: string | number }>
      >(
        Prisma.sql`
          SELECT SUM(reach) AS total_reach, COUNT(DISTINCT date) AS day_count
          FROM insights_daily
          WHERE date BETWEEN ${query.from}::date AND ${query.to}::date
            AND entity_level = 'account'::"EntityLevel"
            ${filters}
        `,
      );

      const reachDays = Number(reachRow?.day_count ?? 0);
      const reachTotal = reachRow?.total_reach === null || reachRow?.total_reach === undefined
        ? null
        : Number(reachRow.total_reach);
      const reachKind: ReachKind = reachDays <= 1 ? 'exact' : 'daily_average';
      const reach =
        reachTotal === null || reachDays === 0
          ? null
          : reachKind === 'exact'
            ? reachTotal
            : Math.round(reachTotal / reachDays);

      const byCurrency = currencies.map((c) => ({
        currency: c.currency,
        spendMicros: this.bigintText(c.spend_micros),
      }));

      return {
        from: query.from,
        to: query.to,
        ...this.totals(current),
        previous: this.hasData(previous) ? this.totals(previous) : null,
        // Tek para birimi varsa toplam anlamlı; birden fazlaysa null.
        currency: byCurrency.length === 1 ? byCurrency[0]!.currency : null,
        byCurrency,
        reach,
        reachKind,
        // Birden fazla hesapta erişim hesaplar arası tekilleştirilemiyor;
        // platform yalnızca hesap içinde tekilleştiriyor.
        reachAcrossAccounts: Number(meta?.account_count ?? 0) > 1,
        lastFetchedAt: meta?.last_fetched_at ? meta.last_fetched_at.toISOString() : null,
        accountCount: Number(meta?.account_count ?? 0),
        hiddenAccounts,
      };
    });
  }

  async timeseries(ctx: TenantContext, query: MetricsQuery): Promise<MetricsTimeseriesPoint[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<Array<RawTotals & { date: Date }>>(
        Prisma.sql`
          SELECT date,
                 SUM(impressions) AS impressions,
                 SUM(clicks) AS clicks,
                 SUM(spend_micros) AS spend_micros,
                 SUM(conversions) AS conversions,
                 SUM(conversion_value_micros) AS conversion_value_micros
          FROM insights_daily
          WHERE date BETWEEN ${query.from}::date AND ${query.to}::date
            AND entity_level = ${TOTALS_LEVEL}::"EntityLevel"
            ${this.filters(query)}
          GROUP BY date
          ORDER BY date
        `,
      );

      return rows.map((r) => ({
        // `toISOString().slice(0,10)` DEĞİL: Postgres DATE'i sürücü yerel
        // gece yarısı olarak veriyor ve UTC'ye çevirmek günü kaydırıyor.
        date: this.dateText(r.date),
        ...this.totals(r),
      }));
    });
  }

  async breakdown(ctx: TenantContext, query: BreakdownQuery): Promise<MetricsBreakdownRow[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      // Varlık adı ve üst varlık adı seviyeye göre farklı tablodan geliyor.
      // Üç ayrı sorgu yerine LEFT JOIN'lerle tek sorgu: seviye filtresi
      // sayesinde yalnızca biri eşleşiyor.
      const rows = await tx.$queryRaw<
        Array<
          RawTotals & {
            entity_id: string;
            entity_external_id: string;
            platform: Platform;
            currency: string;
            name: string | null;
            parent_name: string | null;
            status: string | null;
          }
        >
      >(
        Prisma.sql`
          SELECT i.entity_id, i.entity_external_id, i.platform, i.currency,
                 SUM(i.impressions) AS impressions,
                 SUM(i.clicks) AS clicks,
                 SUM(i.spend_micros) AS spend_micros,
                 SUM(i.conversions) AS conversions,
                 SUM(i.conversion_value_micros) AS conversion_value_micros,
                 COALESCE(c.name, g.name, a.name, acc.name) AS name,
                 COALESCE(gc.name, ag.name) AS parent_name,
                 COALESCE(c.status::text, g.status::text, a.status::text, acc.status::text) AS status
          FROM insights_daily i
          LEFT JOIN campaigns   c   ON i.entity_level = 'campaign' AND c.id = i.entity_id
          LEFT JOIN ad_groups   g   ON i.entity_level = 'ad_group' AND g.id = i.entity_id
          LEFT JOIN ads         a   ON i.entity_level = 'ad'       AND a.id = i.entity_id
          LEFT JOIN ad_accounts acc ON i.entity_level = 'account'  AND acc.id = i.entity_id
          -- Üst varlık: ad set'in kampanyası, reklamın ad set'i.
          LEFT JOIN campaigns   gc  ON i.entity_level = 'ad_group' AND gc.id = g.campaign_id
          LEFT JOIN ad_groups   ag  ON i.entity_level = 'ad'       AND ag.id = a.ad_group_id
          WHERE i.date BETWEEN ${query.from}::date AND ${query.to}::date
            AND i.entity_level = ${query.level}::"EntityLevel"
            ${this.filters(query, 'i')}
          GROUP BY i.entity_id, i.entity_external_id, i.platform, i.currency,
                   c.name, g.name, a.name, acc.name, gc.name, ag.name,
                   c.status, g.status, a.status, acc.status
          ORDER BY SUM(i.spend_micros) DESC
          LIMIT ${query.limit}
        `,
      );

      return rows.map((r) => ({
        entityId: r.entity_id,
        entityExternalId: r.entity_external_id,
        // Yapı senkronizasyonu çalışmamışsa ad boş olabiliyor; dış kimlik
        // hiçbir zaman boş değil ve kullanıcıya "isimsiz satır" göstermekten
        // iyi.
        name: r.name ?? r.entity_external_id,
        // Üst ad ile varlık adı AYNIYSA gösterilmiyor.
        //
        // Meta öne çıkarılan gönderilerde reklamı ad set'le aynı adlandırıyor
        // (ikisi de "18615114154063776 - 29 Tem 2026"). Aynı metni iki satırda
        // tekrarlamak bilgi taşımıyor, yalnızca gürültü. Kararı burada
        // veriyoruz çünkü bu bir VERİ gözlemi; her arayüzde tekrar etmek
        // gerekmesin.
        parentName: r.parent_name === r.name ? null : r.parent_name,
        platform: r.platform,
        status: r.status ?? 'unknown',
        currency: r.currency,
        ...this.totals(r),
      }));
    });
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  /**
   * Opsiyonel filtreler.
   *
   * `Prisma.sql` ile birleştiriliyor, string interpolasyonu YOK — bu değerler
   * kullanıcıdan geliyor ve şablona gömmek SQL enjeksiyonu olurdu.
   */
  private filters(query: MetricsQuery, alias = ''): Prisma.Sql {
    const p = alias ? `${alias}.` : '';
    const parts: Prisma.Sql[] = [];
    if (query.platform) {
      parts.push(Prisma.sql`AND ${Prisma.raw(`${p}platform`)} = ${query.platform}::"Platform"`);
    }
    if (query.adAccountId) {
      parts.push(Prisma.sql`AND ${Prisma.raw(`${p}ad_account_id`)} = ${query.adAccountId}::uuid`);
    }

    /**
     * İZLENMEYEN HESAPLAR PANELE GİRMİYOR.
     *
     * `sync_enabled` başlangıçta yalnızca operasyonel bir bayraktı: "bu hesap
     * için kota harcayalım mı". Ama ajansın kullanımında anlamı farklı —
     * hesabı kapatmak "bu müşteriyle çalışmayı bıraktık" demek ve o hesabın
     * harcaması genel toplama karışmaya devam ederse panel yanlış bir tablo
     * gösteriyor.
     *
     * VERİ SİLİNMİYOR. `insights_daily` satırları duruyor; hesap yeniden
     * açıldığında geçmişiyle birlikte geri geliyor. Silmek geri alınamaz bir
     * işlem olurdu ve "geçici olarak kapattım" senaryosunu felakete çevirirdi.
     *
     * Gizlenen hesap sayısı `hiddenAccounts` olarak yukarı taşınıyor: sessizce
     * kaybolan veri, bu projede tekrar eden hata deseninin ta kendisi.
     */
    parts.push(
      Prisma.sql`AND ${Prisma.raw(`${p}ad_account_id`)} IN (
        SELECT id FROM ad_accounts WHERE sync_enabled = true
      )`,
    );

    return Prisma.join(parts, ' ');
  }

  /**
   * Panelde gizlenen (izlenmeyen) hesap sayısı.
   *
   * Ayrı bir sorgu ve ucuz: `ad_accounts` küçük bir tablo. Metrik sorgusuna
   * gömmek, filtrenin kendisiyle sayımın aynı ifadeye bağlı olması demekti ve
   * filtre değiştiğinde sayım sessizce yanlışa düşerdi.
   */
  private async hiddenAccountCount(tx: TxLike, query: MetricsQuery): Promise<number> {
    const platformFilter = query.platform
      ? Prisma.sql`AND platform = ${query.platform}::"Platform"`
      : Prisma.empty;
    const [row] = await tx.$queryRaw<Array<{ n: string | number }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM ad_accounts
      WHERE sync_enabled = false ${platformFilter}
    `);
    return Number(row?.n ?? 0);
  }

  /** Ham toplamları türetilmiş oranlarla birlikte ortak şekle çevirir. */
  private totals(raw: RawTotals | undefined): MetricTotals {
    const impressions = Number(raw?.impressions ?? 0);
    const clicks = Number(raw?.clicks ?? 0);
    const spendMicros = BigInt(this.bigintText(raw?.spend_micros));
    const conversions = Number(raw?.conversions ?? 0);
    const valueMicros = BigInt(this.bigintText(raw?.conversion_value_micros));

    // Oranlar için para birimini `Number`a indiriyoruz: bölme sonucu zaten
    // ondalık ve oran hassasiyeti kuruş düzeyinde önemli değil. TOPLAM tutar
    // ise string olarak taşınıyor — orada hassasiyet önemli.
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
      // ROAS kuralı PAYLAŞILAN fonksiyonda: rapor da aynısını kullanıyor ve
      // iki yerde ayrı yazmak ikisinin ayrışması demek.
      //
      // Sıfır gelirin yanı sıra YER TUTUCU geliri de eliyor: Google dönüşüm
      // eylemine değer atanmadığında 1 birim varsayıyor ve sonuç
      // "değer == dönüşüm sayısı" oluyor. 0,02× göstermek gerçekte
      // söylenmeyen bir şey söylemek olurdu.
      roas: deriveRoas(spend, value, conversions),
    };
  }

  private hasData(raw: RawTotals | undefined): boolean {
    if (!raw) return false;
    return Number(raw.impressions ?? 0) > 0 || this.bigintText(raw.spend_micros) !== '0';
  }

  /** SUM() sonucu sürücüye göre string, number ya da bigint olabiliyor. */
  private bigintText(value: string | number | bigint | null | undefined): string {
    if (value === null || value === undefined) return '0';
    if (typeof value === 'bigint') return value.toString();
    // Ondalık gelirse (NUMERIC toplamı) kesirli kısmı atıyoruz — micros
    // tam sayı, kesir platformdan gelmiş bir yuvarlama artığı.
    return String(value).split('.')[0] || '0';
  }

  /**
   * `DATE` kolonunu YYYY-MM-DD'ye çevirir — SAAT DİLİMİ KAYMASI OLMADAN.
   *
   * Prisma `DATE`i yerel gece yarısı bir `Date` olarak veriyor.
   * `toISOString()` bunu UTC'ye çeviriyor ve UTC+3'te 2026-08-05 00:00
   * → 2026-08-04T21:00Z oluyor: grafikte tüm günler bir gün geriye kayıyor.
   */
  private dateText(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private dayCount(from: string, to: string): number {
    return (
      Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
      ) + 1
    );
  }

  private shift(date: string, days: number): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }
}
