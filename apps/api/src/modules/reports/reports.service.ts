import { deriveRoas } from '@advetics/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  gorselAdresleri,
  CONVERSION_BUCKETS,
  REPORT_SECTIONS,
  sablonPlatformu,
  varsayilanSablon,
  reportOptionsSchema,
  type ReportOptions,
  type ConversionBucket,
  type ConversionCounts,
  type MetricTotals,
  type ReportBreakdownBlock,
  type ReportCampaignRow,
  type ReportData,
  type ReportDailyPoint,
  type ReportPlatformBlock,
  type ReportSection,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { emptyCounts, roundCounts } from './conversion-buckets';
import { KreatifAdresiService } from './kreatif-adresi.service';

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


/**
 * İZLENMEYEN HESAPLAR RAPORA GİRMİYOR — panelle AYNI kural.
 *
 * `sync_enabled = false` "bu müşteriyle çalışmayı bıraktık" demek ve o
 * hesabın harcaması rapora karışmaya devam ederse müşteriye yanlış bir tablo
 * gönderilmiş olur.
 *
 * TEK YERDE TANIMLI ve beş sorguya da aynı parça giriyor. Sorgu başına elle
 * yazmak, birinde unutmak demek — ve unutulan sorgu sessizce eski davranışı
 * sürdürürdü. Panelin karşılığı `MetricsService.filters()`.
 */
function trackedAccounts(alias = ''): Prisma.Sql {
  const column = alias ? `${alias}.ad_account_id` : 'ad_account_id';
  return Prisma.sql`AND ${Prisma.raw(column)} IN (
    SELECT id FROM ad_accounts WHERE sync_enabled = true
  )`;
}

/**
 * Bölüm başına gösterilecek reklam sayısı — PLATFORM BAŞINA.
 *
 * Tek listede 6 iken harcaması büyük olan platform listeyi tamamen
 * dolduruyordu: Meta'nın harcaması Google'ınkinden büyükse Google'ın en iyi
 * reklamı hiç görünmüyordu.
 */
const TOP_ADS_LIMIT = 12;

/**
 * Rapor bölümü → kırılım boyutu.
 *
 * Harita TEK YERDE. Bölüm adından boyut adını türetmek ("audience_age" →
 * "age") kısa görünüyor ama bir boyutun adı değiştiğinde sessizce çalışmayan
 * bir bölüm bırakırdı — eşleşme açık olsun.
 */
/**
 * Şablonun daralttığı platform için SQL süzgeci.
 *
 * TEK YERDE. Yedi ayrı sorguya elle yazılsaydı biri unutulduğunda "Google Ads
 * Şablonu" başlıklı raporun bir tablosunda Meta satırları görünürdü ve o
 * tablo toplamı özet kartlarını tutmazdı — aynı belgede iki farklı gerçek.
 * `rapor-platform-suzgeci.spec.ts` her sorgunun bunu kullandığını tarıyor.
 */
function platformFiltresi(platform: 'meta' | 'google' | undefined, alias = ''): Prisma.Sql {
  if (!platform) return Prisma.empty;
  const p = alias ? `${alias}.platform` : 'platform';
  return Prisma.sql`AND ${Prisma.raw(p)} = ${platform}::"Platform"`;
}

const BOYUT_BOLUMLERI = [
  { section: 'audience_age', dimension: 'age' },
  { section: 'audience_gender', dimension: 'gender' },
  { section: 'audience_placement', dimension: 'placement' },
  { section: 'audience_hour', dimension: 'hour' },
  { section: 'audience_city', dimension: 'city' },
] as const;

/**
 * Kırılım tablosunda gösterilen satır sayısı.
 *
 * Kalanı "Diğer" satırında toplanıyor — atmak tablo toplamını ana rakamdan
 * küçük gösterir ve müşteri "eksik" der.
 */
const BREAKDOWN_LIMIT = 12;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kreatifAdresi: KreatifAdresiService,
  ) {}

  async build(
    ctx: TenantContext,
    params: {
      clientId: string;
      from: string;
      to: string;
      templateId?: string;
      /**
       * VARSAYILAN ŞABLON KODU (`genel` | `google` | `meta`).
       *
       * `templateId` verilmişse YOK SAYILIYOR: kullanıcının kendi şablonu,
       * bir ön ayardan daha açık bir tercih.
       */
      sablon?: 'genel' | 'google' | 'meta';
      /**
       * ŞABLONUN DARALTTIĞI PLATFORM.
       *
       * Google şablonunda Meta kampanyaları yok ve bu yalnızca bölüm
       * listesiyle çözülmüyor: ÖZET KARTLARI, günlük seri ve kitle
       * kırılımları da o platformla sınırlı olmalı. Aksi hâlde "Google Ads
       * Şablonu" başlıklı raporun özetinde Meta harcaması görünür ve
       * tablolar toplamı tutmaz — aynı belgede iki farklı gerçek.
       */
      platform?: 'meta' | 'google';
    },
  ): Promise<ReportData> {
    const data = await this.veriToplaK(ctx, params);

    /*
     * KREATİF GÖRSEL ADRESLERİ TRANSACTION KAPANDIKTAN SONRA TAZELENİYOR.
     *
     * İkisi de zorunlu: (1) saklanan Meta CDN adresi imzalı ve ölüyor, taze
     * adres olmadan müşteriye giden PDF görselsiz çıkıyor; (2) platform
     * çağrısı transaction'ın İÇİNDE olamaz — `withTenant` etkileşimli bir
     * transaction ve Prisma'nın sınırı 5 saniye, Meta çağrısı üretimde 12
     * saniye sürdü.
     *
     * TEK YERDE: hem PDF hem panel hem paylaşım bağlantısı `build()`ten
     * geçiyor. Yalnızca PDF yolunda tazeleseydim panel kırık kalırdı ve iki
     * gösterim yine ayrışırdı.
     */
    return this.kreatifAdresi.tazele(ctx, data);
  }

  /** Rapor verisinin TAMAMI tek transaction'da — platform çağrısı yok. */
  private async veriToplaK(
    ctx: TenantContext,
    params: {
      clientId: string;
      from: string;
      to: string;
      templateId?: string;
      sablon?: 'genel' | 'google' | 'meta';
      platform?: 'meta' | 'google';
    },
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

      /*
       * VARSAYILAN ŞABLON BÖLÜM LİSTESİNİ EZİYOR — ama başlığı ve kapanış
       * metnini EZMİYOR. O ikisi ajansın markası ve müşteriye göre
       * yazılmış; "Google Ads Şablonu" seçmek kapak başlığını sıfırlamamalı.
       */
      /*
       * ÖN AYAR YALNIZCA KULLANICI SEÇTİYSE UYGULANIYOR.
       *
       * İlk hâlim `sablon` verilmediğinde de genel ön ayarı uyguluyordu ve
       * bu KAYITLI ŞABLONU EZİYORDU: org varsayılanı olarak kaydedilmiş bir
       * şablonun bölüm sırası sessizce yok sayılıyor, kullanıcı Rapor
       * Şablonları ekranında yaptığı düzenlemeyi raporda hiç göremiyordu.
       * Mevcut testler yakaladı.
       *
       * Sıra: kendi şablonu (`templateId`) > seçilen ön ayar (`sablon`) >
       * kayıtlı varsayılan şablon.
       */
      const onAyar =
        params.templateId || !params.sablon ? null : varsayilanSablon(params.sablon);
      const bolumler = onAyar ? [...onAyar.sections] : template.sections;

      /*
       * PLATFORM SÜZGECİ ŞABLONDAN TÜRÜYOR ve BÜTÜN sorgulara gidiyor.
       *
       * Yalnızca bölüm listesini daraltmak yetmiyordu: "Google Ads Şablonu"
       * başlıklı raporun ÖZET KARTLARINDA Meta harcaması görünürdü ve
       * tablolar toplamı tutmazdı — aynı belgede iki farklı gerçek.
       */
      const sorgu = { ...params, platform: params.platform ?? sablonPlatformu(params.sablon) ?? undefined };

      const [platformBlocks, campaigns, daily, topAds, topAdsMissingPlatforms] = await Promise.all([
        this.platformBlocks(tx, sorgu),
        this.campaignRows(tx, sorgu),
        this.dailySeries(tx, sorgu),
        this.topAds(tx, sorgu),
        this.topAdsMissingPlatforms(tx, sorgu),
      ]);

      // Para birimi: tek ise toplam anlamlı, birden fazlaysa null.
      // `fx_rates` çevrimi henüz yok ve 1 USD + 1 TRY'yi toplamak sessizce
      // yanlış olur.
      const currencies = [...new Set(platformBlocks.map((b) => b.currency).filter(Boolean))];
      const currency = currencies.length === 1 ? currencies[0]! : null;

      const keywords = await this.keywordRows(tx, sorgu);
      const searchTerms = await this.searchTermRows(tx, sorgu);

      /*
       * KIRILIMLAR YALNIZCA ŞABLONDA SEÇİLİYSE ÇEKİLİYOR.
       *
       * Beşini de üretip gösterimde elemek, dört sorguyu boşa koşmak
       * demekti. Genel şablonda hiçbiri seçili değil ve orada tek bir ek
       * sorgu bile koşmuyor.
       */
      const breakdowns = await this.breakdownBlocks(tx, sorgu, bolumler);

      return {
        client,
        branding,
        title: template.title ?? 'Dijital Pazarlama Raporu',
        closingText: template.closingText,
        from: params.from,
        to: params.to,
        sections: bolumler,
        options: template.options,
        rangeDays: this.dayCount(params.from, params.to),
        currency,
        platforms: platformBlocks,
        total: this.totalBlock(platformBlocks, currency),
        metaCampaigns: campaigns.filter((c) => c.platform === 'meta').map((c) => c.row),
        googleCampaigns: campaigns.filter((c) => c.platform === 'google').map((c) => c.row),
        daily,
        breakdowns,
        topAds,
        topAdsMissingPlatforms,
        // `null` HÂLÂ "bu yetenek yok" demek — ama artık yalnızca Google
        // bağlantısı olmayan müşteriler için. Meta-only bir müşteride boş dizi
        // döndürmek "anahtar kelimen yok" demek olurdu; oysa o platformda
        // anahtar kelime diye bir şey yok.
        keywords,
        searchTerms,
        generatedAt: new Date().toISOString(),
      };
    });
  }

  /**
   * Anahtar kelime performansı — yalnızca Google.
   *
   * `null` DÖNÜŞÜ ANLAMLI: müşterinin hiç Google hesabı yoksa bu bölüm
   * "yetenek yok" olarak gösteriliyor. Boş dizi ise "Google var ama bu dönemde
   * gösterim alan kelime yok" demek. İkisi farklı ve rapor ikisini farklı
   * anlatıyor.
   *
   * EN ÇOK HARCAYAN 25 kelime. Bir arama hesabında binlerce kelime olabiliyor
   * ve müşteriye giden belgede hepsini listelemek raporu okunamaz kılar;
   * harcamanın büyük kısmı zaten ilk onlarcada toplanıyor.
   */
  /**
   * ARAMA TERİMLERİ — kullanıcının gerçekten YAZDIĞI sorgular.
   *
   * `keywordRows` ile aynı `null` kuralı: Google bağlantısı yoksa "bu yetenek
   * yok" demek için `null`, bağlantı varsa boş dizi.
   *
   * SIRALAMA HARCAMAYA GÖRE ve LİMİT VAR: yüzlerce terim bir raporda
   * okunamaz. Kesme sessiz kalmıyor — arayüz kaç terimin gösterildiğini ve
   * kaçının harcama yaptığını yazıyor.
   */
  private async searchTermRows(
    tx: TxLike,
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
  ): Promise<ReportData['searchTerms']> {
    /*
     * META ŞABLONUNDA HİÇ SORULMUYOR. İkisi de yalnızca Google'da var ve
     * Meta raporunda o bölümler zaten yok; sorguyu yine de koşmak, hiç
     * gösterilmeyecek satırları taramak demekti.
     */
    if (params.platform === 'meta') return null;

    const [hasGoogle] = await tx.$queryRaw<Array<{ n: string | number }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM ad_accounts
      WHERE client_id = ${params.clientId}::uuid AND platform = 'google'::"Platform"
        AND sync_enabled = true
    `);
    if (Number(hasGoogle?.n ?? 0) === 0) return null;

    const rows = await tx.$queryRaw<
      Array<{
        search_term: string;
        keyword_text: string | null;
        status: string;
        spend_micros: string | number | bigint | null;
        impressions: string | number | null;
        clicks: string | number | null;
        conversions: string | number | null;
      }>
    >(Prisma.sql`
      SELECT t.search_term,
             -- EN ÇOK HARCAYAN eşleşmenin kelimesi: aynı terim birden fazla
             -- kelimeyle eşleşebiliyor ve rastgele birini göstermek
             -- "bu kelime bunu mu çekti" sorusuna yanlış cevap verirdi.
             (ARRAY_AGG(t.keyword_text ORDER BY t.spend_micros DESC))[1] AS keyword_text,
             -- DURUMDA "TANIMLI" OLAN KAZANIYOR. Terim bir gün eklenmiş,
             -- başka bir gün tanımsız görünmüş olabilir; "NONE" göstermek
             -- kullanıcıyı zaten yaptığı işi tekrar yapmaya iterdi.
             COALESCE(
               (ARRAY_AGG(t.status ORDER BY (t.status <> 'NONE') DESC, t.date DESC))[1],
               'NONE'
             ) AS status,
             SUM(t.spend_micros) AS spend_micros,
             SUM(t.impressions) AS impressions,
             SUM(t.clicks) AS clicks,
             SUM(t.conversions) AS conversions
      FROM search_term_insights t
      WHERE t.client_id = ${params.clientId}::uuid
        AND t.date BETWEEN ${params.from}::date AND ${params.to}::date
        ${trackedAccounts('t')}
      GROUP BY t.search_term
      HAVING SUM(t.impressions) > 0
      ORDER BY SUM(t.spend_micros) DESC
      LIMIT 25
    `);

    return rows.map((r) => {
      const impressions = Number(r.impressions ?? 0);
      const clicks = Number(r.clicks ?? 0);
      const spendMicros = BigInt(String(r.spend_micros ?? 0).split('.')[0] || '0');
      return {
        term: r.search_term,
        keyword: r.keyword_text,
        status: r.status,
        spendMicros: spendMicros.toString(),
        impressions,
        clicks,
        conversions: Number(r.conversions ?? 0),
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
      };
    });
  }

  /**
   * ═══ KİTLE KIRILIMLARI ═══
   *
   * Boyut başına bir blok, YALNIZCA şablonda seçilmiş boyutlar için.
   *
   * EN ÇOK HARCAYAN N SATIR ve kalanı "Diğer"de toplanıyor. 81 ilin hepsini
   * listelemek raporu okunamaz kılar; ama kesilen satırları ATMAK tablo
   * toplamını ana rakamdan küçük gösterir ve müşteri "eksik" der. "Diğer"
   * satırı ikisini birden çözüyor.
   *
   * PAY YÜZDESİ SUNUCUDA HESAPLANIYOR: panel ve PDF aynı sayıyı göstermeli
   * ve iki tarafta ayrı hesaplamak yuvarlama farkı üretirdi.
   */
  private async breakdownBlocks(
    tx: TxLike,
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
    sections: readonly string[],
  ): Promise<ReportBreakdownBlock[]> {
    const istenen = BOYUT_BOLUMLERI.filter((b) => sections.includes(b.section));
    if (istenen.length === 0) return [];

    const bloklar: ReportBreakdownBlock[] = [];

    for (const { dimension } of istenen) {
      const rows = await tx.$queryRaw<
        Array<{
          value: string;
          impressions: string | number;
          clicks: string | number;
          spend_micros: string | number | bigint;
          conversions: string | number;
        }>
      >(
        Prisma.sql`
          SELECT b.value,
                 SUM(b.impressions)  AS impressions,
                 SUM(b.clicks)       AS clicks,
                 SUM(b.spend_micros) AS spend_micros,
                 SUM(b.conversions)  AS conversions
          FROM insight_breakdowns b
          WHERE b.client_id = ${params.clientId}::uuid
            -- ═══ BOYUT SUZGECI — BU SATIR EKSIKTI ═══
            --
            -- Yoktu ve sonucu suydu: "Yas Dagilimi" tablosunda Erkek, Kadin,
            -- "facebook feed" satirlari gorunuyor ve "Cinsiyet Dagilimi"
            -- tablosu BIREBIR ayni satirlari basiyordu — her tablo bes boyutu
            -- birden gosteriyordu. Rakamlar da yanlisti: bir tablonun toplami
            -- bes boyutun toplamiydi ve pay yuzdeleri o yanlis toplama gore
            -- hesaplaniyordu.
            --
            -- Hicbir hata dusmedi: boyut alani yalnizca blogun ETIKETINDE
            -- kullaniliyordu, sorguya hic girmedigi icin TypeScript de bir
            -- sey demedi.
            --
            -- (SQL yorumunda BACKTICK YOK: sablonu ortasindan kapatiyor ve
            --  hata TS1005 olarak cikip sebebini hic soylemiyor. Bu yorumun
            --  ilk hali tam o tuzaga dustu.)
            AND b.dimension = ${dimension}::"BreakdownDimension"
            AND b.date BETWEEN ${params.from}::date AND ${params.to}::date
            ${
              params.platform
                ? Prisma.sql`AND b.platform = ${params.platform}::"Platform"`
                : Prisma.empty
            }
            -- İZLENMEYEN HESAP GİRMİYOR — panelin geri kalanıyla aynı kural.
            -- Kapatılmış bir hesabın kitlesi raporda görünürse tablo toplamı
            -- özet kartlarını tutmaz.
            AND b.ad_account_id IN (SELECT id FROM ad_accounts WHERE sync_enabled = true)
          GROUP BY b.value
          ORDER BY SUM(b.spend_micros) DESC NULLS LAST
        `,
      );

      /*
       * DESTEKLENMEYEN PLATFORMLAR AYRI SORULUYOR.
       *
       * Boş satır listesi "bu dönemde veri yok" demek; "bu platform bu
       * kırılımı hiç vermiyor" bambaşka bir şey ve raporda açıkça yazılmalı.
       * Ayrımı `sync_jobs` notundan değil, harcaması olduğu hâlde bu boyutta
       * hiç satırı olmayan platformlardan çıkarıyoruz — not biçimine
       * bağlanmak, not metni değiştiğinde sessizce bozulurdu.
       */
      const eksik = await tx.$queryRaw<Array<{ platform: string }>>(
        Prisma.sql`
          SELECT DISTINCT i.platform
          FROM insights_daily i
          WHERE i.client_id = ${params.clientId}::uuid
            AND i.date BETWEEN ${params.from}::date AND ${params.to}::date
            AND i.entity_level = 'campaign'::"EntityLevel"
            AND i.spend_micros > 0
            ${
              params.platform
                ? Prisma.sql`AND i.platform = ${params.platform}::"Platform"`
                : Prisma.empty
            }
            AND NOT EXISTS (
              SELECT 1 FROM insight_breakdowns b
              WHERE b.client_id = i.client_id
                AND b.platform = i.platform
                AND b.dimension = ${dimension}::"BreakdownDimension"
                AND b.date BETWEEN ${params.from}::date AND ${params.to}::date
            )
        `,
      );

      const toplam = rows.reduce((a, r) => a + BigInt(this.bigintText(r.spend_micros)), 0n);
      const gosterilen = rows.slice(0, BREAKDOWN_LIMIT);
      const kalan = rows.slice(BREAKDOWN_LIMIT);
      const kalanHarcama = kalan.reduce((a, r) => a + BigInt(this.bigintText(r.spend_micros)), 0n);

      bloklar.push({
        dimension,
        rows: gosterilen.map((r) => {
          const harcama = BigInt(this.bigintText(r.spend_micros));
          return {
            value: r.value,
            impressions: Number(r.impressions ?? 0),
            clicks: Number(r.clicks ?? 0),
            spendMicros: harcama.toString(),
            conversions: Number(r.conversions ?? 0),
            // TOPLAM SIFIRSA PAY DA SIFIR — bölme yok. Harcaması olmayan bir
            // dönemde NaN yazmak, tabloyu tamamen okunmaz yapardı.
            sharePct: toplam > 0n ? Number((harcama * 10000n) / toplam) / 100 : 0,
          };
        }),
        unsupportedPlatforms: eksik.map((e) => e.platform),
        otherCount: kalan.length,
        otherSpendMicros: kalanHarcama.toString(),
      });
    }

    return bloklar;
  }

  private async keywordRows(
    tx: TxLike,
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
  ): Promise<ReportData['keywords']> {
    /*
     * META ŞABLONUNDA HİÇ SORULMUYOR. İkisi de yalnızca Google'da var ve
     * Meta raporunda o bölümler zaten yok; sorguyu yine de koşmak, hiç
     * gösterilmeyecek satırları taramak demekti.
     */
    if (params.platform === 'meta') return null;

    const [hasGoogle] = await tx.$queryRaw<Array<{ n: string | number }>>(Prisma.sql`
      SELECT COUNT(*) AS n FROM ad_accounts
      WHERE client_id = ${params.clientId}::uuid AND platform = 'google'::"Platform"
        AND sync_enabled = true
    `);
    if (Number(hasGoogle?.n ?? 0) === 0) return null;

    const rows = await tx.$queryRaw<
      Array<{
        keyword: string;
        spend_micros: string | number | bigint | null;
        impressions: string | number | null;
        clicks: string | number | null;
      }>
    >(Prisma.sql`
      SELECT k.keyword,
             SUM(k.spend_micros) AS spend_micros,
             SUM(k.impressions) AS impressions,
             SUM(k.clicks) AS clicks
      FROM keyword_insights k
      WHERE k.client_id = ${params.clientId}::uuid
        AND k.date BETWEEN ${params.from}::date AND ${params.to}::date
        ${trackedAccounts('k')}
      -- AYNI METİNLİ kelimeler birleştiriliyor: aynı kelime birden fazla ad
      -- group'ta tanımlı olabiliyor ve müşteriye üç ayrı satır göstermek
      -- "aynı kelimeye üç kez mi para verdik" sorusunu doğurur.
      GROUP BY k.keyword
      HAVING SUM(k.impressions) > 0
      ORDER BY SUM(k.spend_micros) DESC
      LIMIT 25
    `);

    return rows.map((r) => {
      const impressions = Number(r.impressions ?? 0);
      const clicks = Number(r.clicks ?? 0);
      const spendMicros = BigInt(String(r.spend_micros ?? 0).split('.')[0] || '0');
      const spend = Number(spendMicros) / 1_000_000;
      return {
        keyword: r.keyword,
        spendMicros: spendMicros.toString(),
        impressions,
        clicks,
        ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
        cpc: clicks > 0 ? spend / clicks : null,
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
  ): Promise<{
    title: string | null;
    closingText: string | null;
    sections: ReportSection[];
    options: ReportOptions;
  }> {
    const rows = await tx.$queryRaw<
      Array<{
        title: string | null;
        closing_text: string | null;
        sections: unknown;
        options: unknown;
      }>
    >(
      templateId
        ? Prisma.sql`
            SELECT title, closing_text, sections, options FROM report_templates
            WHERE id = ${templateId}::uuid
              -- SAHİPLİK KONTROLÜ: şablon kimliği adres çubuğundan geliyor.
              -- Org yöneticisi RLS'i geçtiği için bu satır olmadan başka bir
              -- müşterinin şablonuyla rapor üretilebiliyordu.
              AND (client_id = ${clientId}::uuid OR client_id IS NULL)
          `
        : Prisma.sql`
            SELECT title, closing_text, sections, options FROM report_templates
            WHERE client_id = ${clientId}::uuid OR client_id IS NULL
            -- MÜŞTERİYE ÖZEL ŞABLON ÖNCE, sonra org varsayılanı. Aynı
            -- müşteride birden fazla şablon varsa EN SON GÜNCELLENEN
            -- geliyor: eskiden sıra belirsizdi ve hangi şablonun
            -- kullanıldığı çağrıdan çağrıya değişebilirdi.
            ORDER BY client_id NULLS LAST, updated_at DESC
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
      options: this.parseOptions(row?.options),
    };
  }

  /**
   * `options` JSONB'sini ALAN ALAN doğrular.
   *
   * Ham JSON'u belgeye geçirmek, uydurulmuş bir anahtarın sessizce yok
   * sayılması demek olurdu. Bozuk kayıt boş nesneye düşüyor ve rapor
   * varsayılan sütunlarına dönüyor.
   */
  private parseOptions(value: unknown): ReportOptions {
    const r = reportOptionsSchema.safeParse(value);
    return r.success ? r.data : {};
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
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
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
          WHERE client_id = ${params.clientId}::uuid ${trackedAccounts()}
            ${platformFiltresi(params.platform)}
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
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
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
          WHERE i.client_id = ${params.clientId}::uuid ${trackedAccounts('i')}
            ${platformFiltresi(params.platform, 'i')}
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
          dayCount: days,
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
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
  ): Promise<ReportDailyPoint[]> {
    const rows = await tx.$queryRaw<
      Array<RawBucketRow & { date: Date; spend_micros: string | number | bigint | null }>
    >(
      Prisma.sql`
        WITH base AS (
          SELECT date, SUM(spend_micros) AS spend_micros
          FROM insights_daily
          WHERE client_id = ${params.clientId}::uuid ${trackedAccounts()}
            ${platformFiltresi(params.platform)}
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

  /**
   * Bu dönemde HARCAMASI OLAN ama REKLAM SEVİYESİ satırı bulunmayan platformlar.
   *
   * NEDEN GEREKLİ: "Öne Çıkan Reklamlar" harcamaya göre sıralıyor ve platform
   * ayırmıyor. Bir platformun ad seviyesi satırı hiç yoksa bölüm sessizce
   * yalnızca diğerini gösteriyor ve okuyan "Meta'nın öne çıkan reklamı
   * yokmuş" diye anlıyor.
   *
   * Sebep yapısal: 90 günlük ilk çekim (`initial_backfill`) bilerek YALNIZCA
   * kampanya seviyesinde koşuyor — ad seviyesinde 90 gün çekmek hesabın
   * kotasını saatlerce bloklar. Reklam seviyesi yalnızca gecelik iş (dün) ve
   * 7 günlük geri düzeltmeden geliyor; hesap o dönemde gecelik senkronize
   * etmiyorsa o dönemin reklam verisi hiçbir zaman gelmiyor.
   *
   * TEK SORGU, İKİ KÜME: harcaması olan platformlar EKSİ reklam satırı olan
   * platformlar. İki ayrı tur atmak aynı satırları ikinci kez taramak olurdu.
   */
  private async topAdsMissingPlatforms(
    tx: TxLike,
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
  ): Promise<Array<'meta' | 'google'>> {
    const rows = await tx.$queryRaw<Array<{ platform: 'meta' | 'google' }>>(
      Prisma.sql`
        SELECT platform
        FROM insights_daily i
        WHERE i.client_id = ${params.clientId}::uuid ${trackedAccounts('i')}
          ${platformFiltresi(params.platform, 'i')}
          AND i.date BETWEEN ${params.from}::date AND ${params.to}::date
          AND i.spend_micros > 0
        GROUP BY platform
        HAVING COUNT(*) FILTER (WHERE i.entity_level = 'ad'::"EntityLevel") = 0
      `,
    );
    return rows.map((r) => r.platform);
  }

    /** En çok harcayan reklamlar — platform başına, creative ile. */
  private async topAds(
    tx: TxLike,
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
  ): Promise<ReportData['topAds']> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        name: string | null;
        platform: 'meta' | 'google';
        campaign_name: string | null;
        headline: string | null;
        description: string | null;
        display_url: string | null;
        asset_urls: unknown;
        creative_external_id: string | null;
        ad_account_id: string;
        impressions: string | number | null;
        clicks: string | number | null;
        spend_micros: string | number | bigint | null;
        conversions: string | number | null;
      }>
    >(
      Prisma.sql`
        /*
         * PLATFORM BAŞINA EN ÇOK HARCAYAN REKLAMLAR (sayı: TOP_ADS_LIMIT).
         *
         * SAYI YORUMA DEĞER OLARAK YAZILMIYOR. Etiketli şablonda yorumun
         * içindeki bir interpolasyon da metin değil BAĞLI PARAMETRE olur ve
         * sorgunun ortasına yerleşip onu bozar. Backtick tuzağının kardeşi
         * (bkz. CLAUDE.md); sabitin adı yazılıyor, değeri değil.
         *
         * Öncesinde tek bir "en çok harcayan 6" listesi vardı ve platform
         * ayrımı yoktu: Meta'nın harcaması Google'ınkinden büyükse liste
         * tamamen Meta oluyordu ve Google'ın en iyi reklamı hiç görünmüyordu.
         * Rapor iki platformu ayrı ayrı anlatıyor; bu bölüm de öyle olmalı.
         *
         * ROW_NUMBER pencere fonksiyonu, platform başına AYRI bir LIMIT'in
         * tek sorgudaki karşılığı. İki ayrı sorgu atmak aynı satırları ikinci
         * kez taramak olurdu.
         */
        WITH toplamlar AS (
          SELECT a.id, a.name, a.platform, c.name AS campaign_name,
                 cr.headline, cr.description, cr.display_url, cr.asset_urls,
                 /*
                  * TAZE GÖRSEL ADRESİ İÇİN İKİ ALAN.
                  *
                  * Saklanan CDN adresi imzalı ve süresi doluyor; rapor
                  * üretilirken platformdan yenisi isteniyor. Kreatif kimliği
                  * NEYİ soracağımızı, hesap kimliği HANGİ token ile
                  * soracağımızı söylüyor. İkisi de burada çekilmezse
                  * tazeleme için ayrı bir sorgu gerekirdi.
                  */
                 cr.external_id AS creative_external_id,
                 a.ad_account_id::text AS ad_account_id,
                 SUM(i.impressions) AS impressions,
                 SUM(i.clicks) AS clicks,
                 SUM(i.spend_micros) AS spend_micros,
                 SUM(i.conversions) AS conversions
          FROM insights_daily i
          JOIN ads a ON a.id = i.entity_id
          JOIN ad_groups g ON g.id = a.ad_group_id
          JOIN campaigns c ON c.id = g.campaign_id
          LEFT JOIN creatives cr ON cr.id = a.creative_id
          WHERE i.client_id = ${params.clientId}::uuid ${trackedAccounts('i')}
            ${platformFiltresi(params.platform, 'i')}
            AND i.date BETWEEN ${params.from}::date AND ${params.to}::date
            AND i.entity_level = 'ad'::"EntityLevel"
          GROUP BY a.id, a.name, a.platform, c.name, cr.headline, cr.description,
                   cr.display_url, cr.asset_urls, cr.external_id, a.ad_account_id
        )
        SELECT * FROM (
          SELECT *, ROW_NUMBER() OVER (PARTITION BY platform ORDER BY spend_micros DESC) AS sira
          FROM toplamlar
        ) t
        WHERE sira <= ${TOP_ADS_LIMIT}
        ORDER BY platform, spend_micros DESC
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
      /*
       * SÜZGEÇ PAYLAŞILAN YARDIMCIDAN. Burada `typeof u === 'string'` vardı ve
       * Google'ın KAYNAK ADI (`customers/…/assets/…`) ondan geçiyordu: adres
       * sanılıp `imageUrl`e yazılıyor, PDF metin önizlemesi yerine "görsel
       * alınamadı" dalına giriyor ve dipnottaki sayaç şişiyordu. Panel yolu
       * (`ads.service.ts`) bu kontrolü zaten yapıyordu; iki süzgeç ayrışmıştı.
       */
      const urls = gorselAdresleri(r.asset_urls);
      return {
        id: r.id,
        name: r.name ?? '—',
        campaignName: r.campaign_name ?? '—',
        platform: r.platform,
        imageUrl: urls[0] ?? null,
        // Tazeleme `build()` sonunda koşuyor; buradan çıkarken hata yok.
        imageUrlHatasi: null,
        creativeExternalId: r.creative_external_id,
        adAccountId: r.ad_account_id,
        headline: r.headline,
        description: r.description,
        displayUrl: r.display_url,
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
   * KRİTİK 1 — LATERAL ÇOĞALTMASI. `jsonb_array_elements` satırları çoğaltıyor:
   * 5 aksiyon taşıyan bir gün 5 satıra açılıyor. Metrik toplamlarını aynı
   * sorguda yapmak harcamayı 5 katına çıkarırdı ve hata hiçbir yere hata
   * olarak düşmezdi. Bu yüzden metrikler ve kovalar ayrı CTE'lerde.
   *
   * KRİTİK 2 — ÖNCELİK TOPLANABİLİR DEĞİL. Kova çözümü (ilk dolu tür kazanır)
   * SATIR BAZLI bir işlem; önce toplayıp sonra çözmek yanlış sonuç veriyor.
   *
   * Örnek: kampanya A'da `lead=68`, kampanya D'de `lead=0` ama
   * `onsite_conversion.lead_grouped=7`.
   *   · Satır bazlı çöz, sonra topla:  68 + 7 = 75   ✅
   *   · Topla, sonra çöz:              SUM(lead)=68 dolu → 68   ❌ (7 kayıp)
   *
   * Canlı raporda tam bu oldu: `Dönüşüm 132` ile `Form 86 + Mesaj 39 = 125`
   * çelişiyordu, çünkü `conversions` satır bazlı çözülüp saklanıyor, rapor ise
   * toplandıktan sonra çözüyordu.
   *
   * Bu yüzden iki aşama: ÖNCE `(entity_id, date)` greninde — yani
   * `raw_metrics`in doğal greninde — çözülüyor, SONRA istenen gruba toplanıyor.
   *
   * Aksiyon türü listeleri `packages/shared`'daki tek kaynaktan geliyor; SQL'e
   * elle yazmak iki listenin zamanla ayrışması demek olurdu.
   */
  private bucketSelect(
    params: { clientId: string; from: string; to: string; platform?: 'meta' | 'google' },
    groupBy: Prisma.Sql,
  ): Prisma.Sql {
    /**
     * Tek satırda kovayı öncelik sırasıyla çözer.
     *
     * `NULLIF(x, 0)` sıfırı da "dolu değil" sayıyor: sıfır değerli bir tür,
     * dolu olan bir yedeği engellememeli. `SUM(CASE WHEN ... THEN v END)`
     * eşleşme yoksa NULL döndürüyor — `ELSE 0` YAZMAMAK kasıtlı, aksi hâlde
     * COALESCE hep ilk türde dururdu.
     */
    const pickFor = (bucket: ConversionBucket): Prisma.Sql => {
      const candidates = CONVERSION_BUCKETS[bucket].actionTypes.map(
        (t) => Prisma.sql`NULLIF(
          SUM(CASE WHEN act->>'action_type' = ${t}
                   THEN COALESCE((act->>'value')::numeric, 0) END),
          0
        )`,
      );
      return Prisma.sql`COALESCE(${Prisma.join(candidates, ', ')}, 0)`;
    };

    return Prisma.sql`
      SELECT grp, SUM(form) AS form, SUM(message) AS message, SUM(purchase) AS purchase
      FROM (
        -- 1. AŞAMA: satır greninde (varlık + gün) öncelik çözümü.
        SELECT ${groupBy} AS grp,
               ${pickFor('form')} AS form,
               ${pickFor('message')} AS message,
               ${pickFor('purchase')} AS purchase
        FROM insights_daily i2
        -- jsonb_array_elements boş/eksik dizide satır üretmiyor; CASE olmadan
        -- aksiyonsuz günler tamamen kayboluyor.
        CROSS JOIN LATERAL jsonb_array_elements(
          CASE WHEN jsonb_typeof(i2.raw_metrics -> 'actions') = 'array'
               THEN i2.raw_metrics -> 'actions'
               ELSE '[]'::jsonb END
        ) AS act
        WHERE i2.client_id = ${params.clientId}::uuid ${trackedAccounts('i2')}
          AND i2.date BETWEEN ${params.from}::date AND ${params.to}::date
          AND i2.entity_level = ${LEVEL}
        -- Gren: istenen grup + varlık + gün. Böylece öncelik her ham satırda
        -- ayrı çözülüyor, sonra 2. aşamada toplanıyor.
        GROUP BY ${groupBy}, i2.entity_id, i2.date
      ) resolved
      GROUP BY grp
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
      // Panelle AYNI kural — bkz. deriveRoas. İki yerde ayrı yazmak, panelin
      // ve müşteriye giden raporun aynı soruya farklı cevap vermesi demek;
      // bu projede bir kez yaşandı. Yer tutucu gelirden üretilmiş bir ROAS
      // raporda daha da zararlı olurdu.
      roas: deriveRoas(spend, value, conversions),
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
      // Panelle AYNI kural — bkz. deriveRoas. İki yerde ayrı yazmak, panelin
      // ve müşteriye giden raporun aynı soruya farklı cevap vermesi demek;
      // bu projede bir kez yaşandı. Yer tutucu gelirden üretilmiş bir ROAS
      // raporda daha da zararlı olurdu.
      roas: deriveRoas(spend, value, conversions),
    };
  }

  /** Aralıktaki gün sayısı, iki uç dâhil. */
  private dayCount(from: string, to: string): number {
    return (
      Math.round(
        (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
      ) + 1
    );
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
