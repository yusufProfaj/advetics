/**
 * ═══ ÖLÇÜLEN RAPOR SORGULARI — AYRI DOSYADA, ÇÜNKÜ SINANIYORLAR ═══
 *
 * `olcum-metrik.ts` sorguları kendi içinde taşıyor ve spec'i yalnızca kaynak
 * taraması yapabiliyor: script `main()`i içe aktarıldığı anda koşuyor, yani
 * testten çağrılamıyor. Bedeli somut: sorgularda bir SQL hatası olsaydı
 * bunu ilk gören, üretimde bir arızanın ortasında aracı koşan kişi olurdu.
 *
 * Buradaki sorgular DIŞARI VERİLİYOR ve `olcum-rapor.spec.ts` hepsini PGlite
 * üzerinde GERÇEKTEN çalıştırıyor. Aynı test ikinci bir şeyi de kanıtlıyor:
 * iki süzgeç varyantı BİREBİR AYNI satırları döndürüyor. Ölçüm iki varyantı
 * karşılaştırıyor; farklı sonuç veren iki sorgunun süresini karşılaştırmak
 * hiçbir şey anlatmazdı.
 *
 * SORGULAR `reports.service.ts`TEN KOPYALANDI ve bu bir borç: ikisi
 * ayrışırsa ölçüm başka bir sorgunun planını gösterir. Bu yüzden
 * KISALTILMADAN duruyorlar ve her biri hangi metottan geldiğini yazıyor.
 */
import { CONVERSION_BUCKETS, type ConversionBucket } from '@advetics/shared';

/** `reports.service.ts` içindeki `LEVEL` ile AYNI olmak zorunda. */
export const SEVIYE = 'campaign';
/** `reports.service.ts` içindeki `TOP_ADS_LIMIT` ile AYNI olmak zorunda. */
export const TOP_ADS_LIMIT = 12;

/**
 * ═══ İKİ SÜZGEÇ VARYANTI ═══
 *
 * `@A@` sorgudaki tablo alias'ının yerini tutuyor. Alias'ı düşürmek
 * `ad_accounts`/`clients` JOIN'li sorgularda `client_id`yi BELİRSİZ yapıyor
 * ve bu hata metrik düzeltmesinde (f6972fe) bir kez gerçekten yapıldı;
 * oradaki kırılım testleri 12 hatayla yakaladı.
 */
export const SUZGEC_ALT = 'AND @A@.ad_account_id IN (SELECT id FROM ad_accounts WHERE sync_enabled = true)';
export const SUZGEC_DIZI = 'AND @A@.ad_account_id = ANY($1::uuid[])';

const alias = (suzgec: string, a: string) => suzgec.replace(/@A@/g, a);

/**
 * `ReportsService.bucketSelect()`in ölçüm karşılığı.
 *
 * Aksiyon türleri `@advetics/shared`tan OKUNUYOR, elle kopyalanmıyor: liste
 * uzunluğu `CROSS JOIN LATERAL`in ürettiği satır sayısını doğrudan
 * belirliyor ve kısaltılmış bir liste burada gerçekte olmayan bir ucuzluk
 * gösterirdi.
 */
function bucketSelect(grup: string, suzgec: string, clientId: string, from: string, to: string): string {
  const pick = (kova: ConversionBucket) =>
    'COALESCE(' +
    (CONVERSION_BUCKETS[kova].actionTypes as readonly string[])
      .map(
        (t) =>
          `NULLIF(SUM(CASE WHEN act->>'action_type' = '${t}' ` +
          `THEN COALESCE((act->>'value')::numeric, 0) END), 0)`,
      )
      .join(', ') +
    ', 0)';

  return `
    SELECT grp, SUM(form) AS form, SUM(message) AS message, SUM(purchase) AS purchase
    FROM (
      SELECT ${grup} AS grp,
             ${pick('form')} AS form,
             ${pick('message')} AS message,
             ${pick('purchase')} AS purchase
      FROM insights_daily i2
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(i2.raw_metrics -> 'actions') = 'array'
             THEN i2.raw_metrics -> 'actions'
             ELSE '[]'::jsonb END
      ) AS act
      WHERE i2.client_id = '${clientId}'::uuid ${alias(suzgec, 'i2')}
        AND i2.date BETWEEN '${from}'::date AND '${to}'::date
        AND i2.entity_level = '${SEVIYE}'::"EntityLevel"
      GROUP BY ${grup}, i2.entity_id, i2.date
    ) resolved
    GROUP BY grp`;
}

export interface RaporSorgusu {
  /** `ReportsService` içindeki metot adı — planı hangi kodun ürettiği belli olsun. */
  ad: string;
  sql: (suzgec: string) => string;
}

export function raporSorgulari(p: { clientId: string; from: string; to: string }): RaporSorgusu[] {
  const { clientId, from, to } = p;
  return [
    {
      ad: 'platformBlocks',
      sql: (s) => `
        WITH base AS (
          SELECT i.platform,
                 SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks,
                 SUM(i.spend_micros) AS spend_micros, SUM(i.conversions) AS conversions,
                 SUM(i.conversion_value_micros) AS conversion_value_micros,
                 MAX(i.currency) AS currency
          FROM insights_daily i
          WHERE i.client_id = '${clientId}'::uuid ${alias(s, 'i')}
            AND i.date BETWEEN '${from}'::date AND '${to}'::date
            AND i.entity_level = '${SEVIYE}'::"EntityLevel"
          GROUP BY i.platform
        ), buckets AS (${bucketSelect('i2.platform', s, clientId, from, to)})
        SELECT b.platform::text AS platform, b.impressions, b.clicks, b.spend_micros,
               b.conversions, b.conversion_value_micros, b.currency,
               COALESCE(k.form, 0) AS form, COALESCE(k.message, 0) AS message,
               COALESCE(k.purchase, 0) AS purchase
        FROM base b LEFT JOIN buckets k ON k.grp::text = b.platform::text
        ORDER BY b.spend_micros DESC`,
    },
    {
      ad: 'campaignRows',
      sql: (s) => `
        WITH base AS (
          SELECT i.entity_id, i.platform,
                 SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks,
                 SUM(i.spend_micros) AS spend_micros, SUM(i.conversions) AS conversions,
                 SUM(i.conversion_value_micros) AS conversion_value_micros,
                 MAX(i.currency) AS currency, SUM(i.reach) AS reach_sum,
                 COUNT(DISTINCT i.date) AS day_count
          FROM insights_daily i
          WHERE i.client_id = '${clientId}'::uuid ${alias(s, 'i')}
            AND i.date BETWEEN '${from}'::date AND '${to}'::date
            AND i.entity_level = '${SEVIYE}'::"EntityLevel"
          GROUP BY i.entity_id, i.platform
        ), buckets AS (${bucketSelect('i2.entity_id', s, clientId, from, to)})
        SELECT b.entity_id, b.platform::text AS platform, b.impressions, b.clicks,
               b.spend_micros, b.conversions, b.conversion_value_micros, b.currency,
               b.reach_sum, b.day_count, c.name, c.status::text AS status, c.objective,
               COALESCE(k.form, 0) AS form, COALESCE(k.message, 0) AS message,
               COALESCE(k.purchase, 0) AS purchase
        FROM base b
        LEFT JOIN campaigns c ON c.id = b.entity_id
        LEFT JOIN buckets k ON k.grp::text = b.entity_id::text
        ORDER BY b.spend_micros DESC, b.entity_id`,
    },
    {
      ad: 'dailySeries',
      sql: (s) => `
        WITH base AS (
          SELECT i.date, SUM(i.spend_micros) AS spend_micros
          FROM insights_daily i
          WHERE i.client_id = '${clientId}'::uuid ${alias(s, 'i')}
            AND i.date BETWEEN '${from}'::date AND '${to}'::date
            AND i.entity_level = '${SEVIYE}'::"EntityLevel"
          GROUP BY i.date
        ), buckets AS (${bucketSelect('i2.date', s, clientId, from, to)})
        SELECT b.date, b.spend_micros, COALESCE(k.form, 0) AS form,
               COALESCE(k.message, 0) AS message, COALESCE(k.purchase, 0) AS purchase
        FROM base b LEFT JOIN buckets k ON k.grp::text = b.date::text
        ORDER BY b.date`,
    },
    {
      ad: 'topAds',
      sql: (s) => `
        WITH toplamlar AS (
          SELECT a.id, a.name, a.platform, c.name AS campaign_name,
                 cr.headline, cr.description, cr.display_url, cr.asset_urls,
                 cr.external_id AS creative_external_id,
                 a.ad_account_id::text AS ad_account_id,
                 SUM(i.impressions) AS impressions, SUM(i.clicks) AS clicks,
                 SUM(i.spend_micros) AS spend_micros, SUM(i.conversions) AS conversions
          FROM insights_daily i
          JOIN ads a ON a.id = i.entity_id
          JOIN ad_groups g ON g.id = a.ad_group_id
          JOIN campaigns c ON c.id = g.campaign_id
          LEFT JOIN creatives cr ON cr.id = a.creative_id
          WHERE i.client_id = '${clientId}'::uuid ${alias(s, 'i')}
            AND i.date BETWEEN '${from}'::date AND '${to}'::date
            AND i.entity_level = 'ad'::"EntityLevel"
          GROUP BY a.id, a.name, a.platform, c.name, cr.headline, cr.description,
                   cr.display_url, cr.asset_urls, cr.external_id, a.ad_account_id
        )
        SELECT id, name, platform::text AS platform, campaign_name, headline, description,
               display_url, creative_external_id, ad_account_id, impressions, clicks,
               spend_micros, conversions
        FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY platform ORDER BY spend_micros DESC, id) AS sira
          FROM toplamlar
        ) t
        WHERE sira <= ${TOP_ADS_LIMIT}
        ORDER BY platform, spend_micros DESC, id`,
    },
    {
      ad: 'topAdsMissingPlatforms',
      sql: (s) => `
        SELECT i.platform::text AS platform
        FROM insights_daily i
        WHERE i.client_id = '${clientId}'::uuid ${alias(s, 'i')}
          AND i.date BETWEEN '${from}'::date AND '${to}'::date
          AND i.spend_micros > 0
        GROUP BY i.platform
        HAVING COUNT(*) FILTER (WHERE i.entity_level = 'ad'::"EntityLevel") = 0
        ORDER BY 1`,
    },
    {
      /*
       * KIRILIM SORGUSU SÜZGECİ YARDIMCIDAN DEĞİL ELLE YAZIYOR
       * (`breakdownBlocks` içinde, `insight_breakdowns` üzerinde). Ölçümden
       * düşseydi, düzeltilecek yerlerin biri hiç görülmemiş olurdu — ve o
       * tablo `insights_daily` gibi partition'lı DEĞİL, yani planı da başka.
       */
      ad: 'breakdownBlocks',
      sql: (s) => `
        SELECT b.value, SUM(b.impressions) AS impressions, SUM(b.clicks) AS clicks,
               SUM(b.spend_micros) AS spend_micros, SUM(b.conversions) AS conversions
        FROM insight_breakdowns b
        WHERE b.client_id = '${clientId}'::uuid
          AND b.dimension = 'age'::"BreakdownDimension"
          AND b.date BETWEEN '${from}'::date AND '${to}'::date
          ${alias(s, 'b')}
        GROUP BY b.value
        ORDER BY SUM(b.spend_micros) DESC NULLS LAST, b.value`,
    },
    {
      ad: 'keywordRows',
      sql: (s) => `
        SELECT k.keyword, SUM(k.spend_micros) AS spend_micros,
               SUM(k.impressions) AS impressions, SUM(k.clicks) AS clicks
        FROM keyword_insights k
        WHERE k.client_id = '${clientId}'::uuid
          AND k.date BETWEEN '${from}'::date AND '${to}'::date
          ${alias(s, 'k')}
        GROUP BY k.keyword
        HAVING SUM(k.impressions) > 0
        ORDER BY SUM(k.spend_micros) DESC, k.keyword
        LIMIT 25`,
    },
    {
      ad: 'searchTermRows',
      sql: (s) => `
        SELECT t.search_term,
               (ARRAY_AGG(t.keyword_text ORDER BY t.spend_micros DESC))[1] AS keyword_text,
               SUM(t.spend_micros) AS spend_micros, SUM(t.impressions) AS impressions,
               SUM(t.clicks) AS clicks, SUM(t.conversions) AS conversions
        FROM search_term_insights t
        WHERE t.client_id = '${clientId}'::uuid
          AND t.date BETWEEN '${from}'::date AND '${to}'::date
          ${alias(s, 't')}
        GROUP BY t.search_term
        HAVING SUM(t.impressions) > 0
        ORDER BY SUM(t.spend_micros) DESC, t.search_term
        LIMIT 25`,
    },
  ];
}
