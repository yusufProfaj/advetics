import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  monthToDate,
  type BudgetInput,
  type BudgetPacing,
  type BudgetQuery,
  type BudgetRecord,
  type ClientPacing,
  type PacingQuery,
  type Platform,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { computePacing } from './budget-pacing';

/**
 * Modül 5 — Aylık bütçe yönetimi ve pacing.
 *
 * İki ayrı iş yapıyor:
 *
 *   1. BÜTÇE KAYDI (CRUD). Kullanıcı biriminden micros'a çevrim burada, tek
 *      yerde. İstemciye bırakmak ondalık ayırıcı hatalarını dağıtmak olurdu —
 *      Türkçe arayüzde "45.000,50" yazan biri var.
 *
 *   2. PACING. Harcamayı bütçeyle karşılaştırıp "hızlı mı gidiyoruz"u
 *      söylüyor. Hesabın kendisi `budget-pacing.ts` içinde saf fonksiyonlarda;
 *      burası yalnızca veriyi topluyor.
 *
 * PARA BİRİMİ KARIŞIMI. `fx_rates` çevrimi henüz yok. Bir müşterinin hesapları
 * farklı para birimlerindeyse harcamalar TOPLANMIYOR: bütçe biriminde olanlar
 * sayılıyor, diğerleri `excludedCurrencies` ile bildiriliyor. Karışık toplam
 * anlamsız bir sayı olurdu ve o sayı müşteriye giden panelde görünürdü.
 */

/**
 * Harcamanın okunduğu seviye.
 *
 * `insights_daily` aynı harcamayı dört seviyede tutuyor; filtresiz toplamak
 * bütçe tüketimini 4 katına çıkarır ve her müşteri "bütçeyi aştın" uyarısı
 * alırdı. `MetricsService` ile AYNI seviye seçildi — iki ekranın aynı
 * harcamayı farklı okuması, bu projede bir kez yaşanan ve düzeltilen sorun.
 */
const SPEND_LEVEL = 'campaign';

interface SpendRow {
  ad_account_id: string;
  currency: string | null;
  spend_micros: string | number | bigint | null;
  day_count: string | number | null;
}

interface BudgetRow {
  id: string;
  client_id: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  platform: Platform | null;
  month: Date;
  amount_micros: bigint;
  currency: string;
  daily_cap_micros: bigint | null;
  alert_threshold_pct: number;
  auto_pause_at_pct: number | null;
  note: string | null;
  updated_at: Date;
}

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async list(ctx: TenantContext, query: BudgetQuery): Promise<BudgetRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const parts: Prisma.Sql[] = [];
      if (query.clientId) parts.push(Prisma.sql`AND b.client_id = ${query.clientId}::uuid`);
      if (query.month) parts.push(Prisma.sql`AND b.month = ${monthToDate(query.month)}::date`);
      const filters = parts.length > 0 ? Prisma.join(parts, ' ') : Prisma.empty;

      const rows = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
        SELECT b.id, b.client_id, b.ad_account_id,
               a.name AS ad_account_name, a.platform,
               b.month, b.amount_micros, b.currency, b.daily_cap_micros,
               b.alert_threshold_pct, b.auto_pause_at_pct, b.note, b.updated_at
        FROM monthly_budgets b
        LEFT JOIN ad_accounts a ON a.id = b.ad_account_id
        WHERE b.org_id = ${ctx.orgId}::uuid ${filters}
        ORDER BY b.month DESC, b.ad_account_id NULLS FIRST
      `);
      return rows.map((r) => this.toRecord(r));
    });
  }

  /**
   * Bütçeyi oluşturur ya da günceller.
   *
   * UPSERT, ayrı create/update değil: kullanıcı için "Ağustos bütçesi 45.000"
   * tek bir eylem. Kaydın daha önce var olup olmadığını istemciye sordurmak,
   * iki isteğin arasına sıkışan bir yarış durumu yaratırdı — ikinci istek
   * tekil indekse çarpıp anlamsız bir hata verirdi.
   */
  async upsert(ctx: TenantContext, input: BudgetInput): Promise<BudgetRecord> {
    const amountMicros = toMicros(input.amount);
    const dailyCapMicros = input.dailyCap ? toMicros(input.dailyCap) : null;

    if (dailyCapMicros !== null && dailyCapMicros > amountMicros) {
      throw new BadRequestException('Günlük limit aylık bütçeden büyük olamaz');
    }
    // Otomatik durdurma eşiği uyarı eşiğinin ALTINDA olamaz: önce durdurup
    // sonra uyarmak, uyarıyı işlevsiz kılar.
    if (input.autoPauseAtPct != null && input.autoPauseAtPct < input.alertThresholdPct) {
      throw new BadRequestException(
        'Otomatik durdurma eşiği uyarı eşiğinden küçük olamaz',
      );
    }

    return this.prisma.withTenant(ctx, async (tx) => {
      // Müşterinin varlığı ve para birimi. RLS zaten erişimi kısıtlıyor;
      // satır gelmiyorsa müşteri yok YA DA erişim yok — ikisini ayırt
      // etmiyoruz, çünkü ayırt etmek başka kiracının müşteri id'lerini
      // doğrulanabilir kılardı.
      const [client] = await tx.$queryRaw<Array<{ reporting_currency: string }>>(Prisma.sql`
        SELECT reporting_currency FROM clients WHERE id = ${input.clientId}::uuid
      `);
      if (!client) throw new NotFoundException('Müşteri bulunamadı');

      if (input.adAccountId) {
        const [acc] = await tx.$queryRaw<Array<{ client_id: string | null }>>(Prisma.sql`
          SELECT client_id FROM ad_accounts WHERE id = ${input.adAccountId}::uuid
        `);
        if (!acc) throw new NotFoundException('Reklam hesabı bulunamadı');
        // Hesabın BAŞKA bir müşteriye bağlı olması sessiz bir veri hatası
        // olurdu: bütçe hiçbir zaman eşleşmeyen bir harcamaya bakardı ve
        // pacing kalıcı olarak "hiç harcanmamış" gösterirdi.
        if (acc.client_id !== input.clientId) {
          throw new BadRequestException('Reklam hesabı bu müşteriye bağlı değil');
        }
      }

      const currency = input.currency ?? client.reporting_currency;
      const month = monthToDate(input.month);

      // ÇAKIŞMA HEDEFİ İKİ AYRI KISMİ İNDEKS olduğu için tek bir
      // `ON CONFLICT (...)` yazılamıyor: hangi indeksin geçerli olduğu
      // `ad_account_id`in NULL olup olmamasına bağlı. Postgres kısmi indeksi
      // ancak WHERE yüklemi de verilirse çakışma hedefi olarak kabul ediyor.
      const conflict = input.adAccountId
        ? Prisma.sql`(client_id, ad_account_id, month) WHERE ad_account_id IS NOT NULL`
        : Prisma.sql`(client_id, month) WHERE ad_account_id IS NULL`;

      const [row] = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
        WITH upserted AS (
          INSERT INTO monthly_budgets (
            id, org_id, client_id, ad_account_id, month,
            amount_micros, currency, daily_cap_micros,
            alert_threshold_pct, auto_pause_at_pct, note, created_by, updated_at
          ) VALUES (
            gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
            ${input.adAccountId ?? null}::uuid, ${month}::date,
            ${amountMicros}::bigint, ${currency}, ${dailyCapMicros}::bigint,
            ${input.alertThresholdPct}, ${input.autoPauseAtPct ?? null}::int,
            ${input.note ?? null}, ${ctx.userId}::uuid, now()
          )
          ON CONFLICT ${conflict} DO UPDATE SET
            amount_micros       = EXCLUDED.amount_micros,
            currency            = EXCLUDED.currency,
            daily_cap_micros    = EXCLUDED.daily_cap_micros,
            alert_threshold_pct = EXCLUDED.alert_threshold_pct,
            auto_pause_at_pct   = EXCLUDED.auto_pause_at_pct,
            note                = EXCLUDED.note,
            updated_at          = now()
          RETURNING *
        )
        SELECT u.id, u.client_id, u.ad_account_id,
               a.name AS ad_account_name, a.platform,
               u.month, u.amount_micros, u.currency, u.daily_cap_micros,
               u.alert_threshold_pct, u.auto_pause_at_pct, u.note, u.updated_at
        FROM upserted u
        LEFT JOIN ad_accounts a ON a.id = u.ad_account_id
      `);

      // RLS satırı reddetmişse INSERT ... RETURNING boş döner ve hata
      // fırlatmaz. Sessizce "kaydedildi" demek, kaydedilmemiş bir bütçeyi
      // kaydedilmiş göstermek olurdu.
      if (!row) throw new NotFoundException('Bütçe kaydedilemedi');
      return this.toRecord(row);
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const deleted = await tx.$executeRaw(Prisma.sql`
        DELETE FROM monthly_budgets WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (deleted === 0) throw new NotFoundException('Bütçe bulunamadı');
    });
  }

  // ---------------------------------------------------------------------------
  // Pacing
  // ---------------------------------------------------------------------------

  /**
   * Bir müşterinin bir aydaki bütçe tüketimi.
   *
   * Bütçesi OLMAYAN hesaplar da listeleniyor (harcamasıyla, `status:
   * no_budget`). Listeden düşürmek, ajansın bütçe tanımlamayı unuttuğu hesabı
   * görünmez kılardı — tam da görülmesi gereken durum.
   */
  async pacing(ctx: TenantContext, query: PacingQuery, now = new Date()): Promise<ClientPacing> {
    const today = now.toISOString().slice(0, 10);
    const month = query.month ?? today.slice(0, 7);
    const start = `${month}-01`;
    const end = lastDayOfMonth(month);

    return this.prisma.withTenant(ctx, async (tx) => {
      const budgetRows = await tx.$queryRaw<BudgetRow[]>(Prisma.sql`
        SELECT b.id, b.client_id, b.ad_account_id,
               a.name AS ad_account_name, a.platform,
               b.month, b.amount_micros, b.currency, b.daily_cap_micros,
               b.alert_threshold_pct, b.auto_pause_at_pct, b.note, b.updated_at
        FROM monthly_budgets b
        LEFT JOIN ad_accounts a ON a.id = b.ad_account_id
        WHERE b.org_id = ${ctx.orgId}::uuid
          AND b.client_id = ${query.clientId}::uuid
          AND b.month = ${start}::date
      `);

      /**
       * Harcama HESAP BAZINDA çekiliyor, tek toplam olarak değil.
       *
       * Müşteri geneli toplamı da buradan türetiliyor. Ayrı bir toplam
       * sorgusu yazmak, iki sorgunun zamanla ayrışması riski demek —
       * hesapların toplamı ile "toplam" satırının uyuşmaması, panelde
       * açıklanamaz bir fark olarak görünürdü.
       *
       * Tarih üst sınırı `end` DEĞİL, hesap kapsamı: bugünü dışarıda
       * bırakıyoruz. Ayın son gününü yazmak, içinde bulunulan ayda henüz
       * bitmemiş bugünü de toplamaya sokardı.
       */
      const throughDate = minDate(shift(today, -1), end);
      const spendRows =
        throughDate < start
          ? []
          : await tx.$queryRaw<SpendRow[]>(Prisma.sql`
              SELECT i.ad_account_id::text AS ad_account_id,
                     a.currency,
                     SUM(i.spend_micros) AS spend_micros,
                     COUNT(DISTINCT i.date) AS day_count
              FROM insights_daily i
              JOIN ad_accounts a ON a.id = i.ad_account_id
              -- insights_daily ve ad_accounts ORG_ID TAŞIMIYOR: org bağlantısı
              -- client_id üzerinden kuruluyor ve RLS de app.can_access_client()
              -- ile bunu kullanıyor. Olmayan bir kolona filtre yazmak sorguyu
              -- tamamen düşürüyordu; PGlite testi yakaladı.
              WHERE i.client_id = ${query.clientId}::uuid
                AND i.entity_level = ${SPEND_LEVEL}::"EntityLevel"
                AND i.date BETWEEN ${start}::date AND ${throughDate}::date
              GROUP BY i.ad_account_id, a.currency
            `);

      // Bütçesi olmayan ama harcaması olan hesaplar da görünsün diye
      // hesap listesi bütçelerden DEĞİL, iki kaynağın birleşiminden geliyor.
      const accountNames = await tx.$queryRaw<
        Array<{ id: string; name: string; currency: string | null }>
      >(Prisma.sql`
        SELECT id::text AS id, name, currency
        FROM ad_accounts
        WHERE client_id = ${query.clientId}::uuid
      `);

      return this.assemble({
        clientId: query.clientId,
        month,
        today,
        budgets: budgetRows.map((r) => this.toRecord(r)),
        spend: spendRows,
        accounts: accountNames,
      });
    });
  }

  /**
   * Toplanan satırları pacing özetine dönüştürür.
   *
   * Ayrı ve saf: veritabanı olmadan test edilebilsin diye. Buradaki para
   * birimi eşleme mantığı sessizce yanlış sonuç üretmeye en açık kısım.
   */
  private assemble(input: {
    clientId: string;
    month: string;
    today: string;
    budgets: BudgetRecord[];
    spend: SpendRow[];
    accounts: Array<{ id: string; name: string; currency: string | null }>;
  }): ClientPacing {
    const { clientId, month, today, budgets, spend, accounts } = input;

    const spendByAccount = new Map<string, { micros: bigint; days: number; currency: string | null }>();
    for (const row of spend) {
      spendByAccount.set(row.ad_account_id, {
        micros: toBigInt(row.spend_micros),
        days: Number(row.day_count ?? 0),
        currency: row.currency,
      });
    }

    const overallBudget = budgets.find((b) => b.adAccountId === null) ?? null;
    const accountBudgets = new Map(
      budgets.filter((b) => b.adAccountId !== null).map((b) => [b.adAccountId as string, b]),
    );

    // Müşteri geneli para birimi: tüm hesaplar aynıysa o, değilse null.
    // `MetricsService` ile aynı kural — iki ekranın "karışık" tanımı ayrışmasın.
    const currencies = [...new Set(accounts.map((a) => a.currency).filter(Boolean))] as string[];
    const clientCurrency = currencies.length === 1 ? currencies[0] : null;

    /**
     * Şemsiye bütçenin harcaması yalnızca EŞLEŞEN para biriminden toplanıyor.
     *
     * Bütçe yoksa karşılaştırılacak bir birim de yok; o durumda tümü
     * toplanıyor ve sonuç zaten yalnızca bilgilendirme amaçlı.
     */
    const targetCurrency = overallBudget?.currency ?? clientCurrency;
    let overallMicros = 0n;
    const excluded = new Set<string>();
    let maxDays = 0;

    for (const s of spendByAccount.values()) {
      if (targetCurrency && s.currency && s.currency !== targetCurrency) {
        excluded.add(s.currency);
        continue;
      }
      overallMicros += s.micros;
      maxDays = Math.max(maxDays, s.days);
    }

    const overall = computePacing({
      budget: overallBudget,
      spentMicros: overallMicros,
      month,
      today,
      // Hesapların gün sayıları farklı olabiliyor. EN GENİŞ kapsam
      // alınıyor: "en az bir hesapta veri olan gün sayısı". Toplamak
      // günleri çift sayardı, en darı almak tek bir geç senkronize hesabın
      // tüm müşteriyi eksik göstermesi demek olurdu.
      daysWithData: maxDays,
      excludedCurrencies: [...excluded].sort(),
    });

    const accountPacing = accounts
      .map((acc) => {
        const s = spendByAccount.get(acc.id);
        const pacing = computePacing({
          budget: accountBudgets.get(acc.id) ?? null,
          spentMicros: s?.micros ?? 0n,
          month,
          today,
          daysWithData: s?.days ?? 0,
        });
        return { ...pacing, adAccountId: acc.id, adAccountName: acc.name };
      })
      // Bütçesi olan hesaplar üstte, sonra harcaması yüksek olanlar.
      // Bütçesiz ve harcamasız bir hesap listenin dibinde kalıyor.
      .sort((a, b) => {
        if (!!a.budget !== !!b.budget) return a.budget ? -1 : 1;
        return Number(BigInt(b.spentMicros) - BigInt(a.spentMicros));
      });

    return { clientId, month, currency: clientCurrency ?? null, overall, accounts: accountPacing };
  }

  private toRecord(row: BudgetRow): BudgetRecord {
    return {
      id: row.id,
      clientId: row.client_id,
      adAccountId: row.ad_account_id,
      adAccountName: row.ad_account_name,
      platform: row.platform,
      // `DATE` kolonu yerel gece yarısı bir `Date` olarak geliyor;
      // `toISOString()` UTC+3'te bir gün geriye kaydırıyor ve ay yanlış
      // görünüyor. Yerel bileşenlerden okumak kaymayı önlüyor.
      month: `${row.month.getFullYear()}-${String(row.month.getMonth() + 1).padStart(2, '0')}`,
      amountMicros: row.amount_micros.toString(),
      currency: row.currency,
      dailyCapMicros: row.daily_cap_micros === null ? null : row.daily_cap_micros.toString(),
      alertThresholdPct: row.alert_threshold_pct,
      autoPauseAtPct: row.auto_pause_at_pct,
      note: row.note,
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

/**
 * Kullanıcı birimi → micros. STRING üzerinden, float'a uğramadan.
 *
 * `Math.round(Number('45000.10') * 1e6)` çoğu değer için doğru sonuç veriyor
 * ama bazıları için 1 micro kayıyor. Tek bir kayıt için önemsiz; aylık bütçe
 * karşılaştırmasında ise "bütçenin %100,0000001'i harcandı" gibi bir eşik
 * tetiklemesine yetiyor.
 */
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
  // NUMERIC toplamı ondalık gelebiliyor; micros tam sayı, kesir platform
  // tarafından bırakılmış bir yuvarlama artığı.
  const text = String(value).split('.')[0] || '0';
  return BigInt(text);
}

function lastDayOfMonth(month: string): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

export type { BudgetPacing };
