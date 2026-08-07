import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  WINDOW_DAYS,
  type ActionOutcome,
  type RuleAction,
  type RuleActionRecord,
  type RuleCondition,
  type RuleGuard,
  type RuleInput,
  type RuleLevel,
  type RuleQuery,
  type RuleRecord,
  type RuleRunRecord,
  type RuleWindow,
  type TenantContext,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import {
  evaluate,
  nextBudgetMicros,
  type EntitySnapshot,
  type WindowTotals,
} from './rule-evaluator';

/**
 * Modül 5 — Kural motoru veri katmanı.
 *
 * Karar mantığı BURADA DEĞİL, `rule-evaluator.ts` içinde ve saf. Bu servis
 * yalnızca veriyi toplayıp kararı kaydediyor. Ayrım bilinçli: karar mantığının
 * veritabanı olmadan test edilebilmesi, bu modülde diğerlerinden daha önemli
 * çünkü hatanın bedeli veriyi yanlış göstermek değil, kampanyayı yanlış
 * durdurmak.
 *
 * PENCERE HESAPLARI BUGÜNÜ DIŞLIYOR. Panel, rapor ve bütçe sayfasıyla aynı
 * kural. Gün bitmeden gelen kısmi veri EBM'yi düşük gösterir ve "EBM düşükse
 * bütçeyi artır" kuralı her sabah tetiklenirdi.
 */

/** Seviyeye göre varlık tablosu ve bütçe alanlarının varlığı. */
const LEVEL_TABLE: Record<RuleLevel, { table: string; hasBudget: boolean }> = {
  campaign: { table: 'campaigns', hasBudget: true },
  ad_group: { table: 'ad_groups', hasBudget: true },
  // Reklam seviyesinde bütçe yok — bütçe ad set ya da kampanyada.
  ad: { table: 'ads', hasBudget: false },
};

interface EntityRow {
  id: string;
  name: string;
  external_id: string;
  status: string;
  ad_account_id: string;
  budget_mode: string | null;
  budget_amount_micros: bigint | null;
  currency: string;
}

interface WindowRow {
  entity_id: string;
  spend_micros: string | number | bigint | null;
  impressions: string | number | null;
  clicks: string | number | null;
  conversions: string | number | null;
  conversion_value_micros: string | number | bigint | null;
  reach: string | number | null;
  days: string | number | null;
  newest: Date | null;
}

interface RuleRow {
  id: string;
  org_id: string;
  client_id: string;
  ad_account_id: string | null;
  ad_account_name: string | null;
  name: string;
  description: string | null;
  level: RuleLevel;
  conditions: RuleCondition[];
  combinator: 'and' | 'or';
  action: RuleAction;
  guard: RuleGuard;
  cooldown_minutes: number;
  max_actions_per_run: number;
  max_data_age_hours: number;
  enabled: boolean;
  dry_run: boolean;
  last_run_at: Date | null;
  last_triggered_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** Değerlendirmenin ürettiği, henüz kaydedilmemiş karar. */
export interface PendingAction {
  entityId: string;
  entityName: string;
  entityExternalId: string;
  entityLevel: RuleLevel;
  /** Platforma yazmak için gereken kimlik. */
  adAccountId: string;
  outcome: ActionOutcome | 'eligible';
  reason: string;
  beforeState: Record<string, unknown> | null;
  /** `adjust_budget` için hesaplanmış yeni bütçe. */
  targetBudgetMicros: bigint | null;
}

export interface EvaluationOutcome {
  evaluatedCount: number;
  matchedCount: number;
  actions: PendingAction[];
}

@Injectable()
export class RulesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async list(ctx: TenantContext, query: RuleQuery): Promise<RuleRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const parts: Prisma.Sql[] = [];
      if (query.clientId) parts.push(Prisma.sql`AND r.client_id = ${query.clientId}::uuid`);
      if (query.enabled !== undefined) parts.push(Prisma.sql`AND r.enabled = ${query.enabled}`);
      const filters = parts.length > 0 ? Prisma.join(parts, ' ') : Prisma.empty;

      const rows = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        SELECT r.*, a.name AS ad_account_name
        FROM rules r
        LEFT JOIN ad_accounts a ON a.id = r.ad_account_id
        WHERE r.org_id = ${ctx.orgId}::uuid ${filters}
        ORDER BY r.enabled DESC, r.name
      `);
      return rows.map((r) => this.toRecord(r));
    });
  }

  async get(ctx: TenantContext, id: string): Promise<RuleRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        SELECT r.*, a.name AS ad_account_name
        FROM rules r
        LEFT JOIN ad_accounts a ON a.id = r.ad_account_id
        WHERE r.id = ${id}::uuid AND r.org_id = ${ctx.orgId}::uuid
      `);
      if (!row) throw new NotFoundException('Kural bulunamadı');
      return this.toRecord(row);
    });
  }

  /**
   * Worker için kural okuma — KİRACI BAĞLAMI OLMADAN.
   *
   * Zamanlanmış değerlendirme worker'da çalışıyor ve orada oturum yok.
   * `withTenant` kullanan `get()` bu bağlamda hiçbir satır göremezdi (RLS
   * boş sonuç döndürür, hata değil — sessiz bir boşluk).
   *
   * `orgId` ve `clientId` AYRICA dönüyor: çağıran bunlardan sentetik bir
   * kiracı bağlamı kuruyor ve uygulayıcı o bağlamla yazıyor.
   */
  async getForWorker(
    tx: TxLike,
    ruleId: string,
  ): Promise<{ record: RuleRecord; orgId: string; clientId: string } | null> {
    const [row] = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
      SELECT r.*, a.name AS ad_account_name
      FROM rules r
      LEFT JOIN ad_accounts a ON a.id = r.ad_account_id
      WHERE r.id = ${ruleId}::uuid
    `);
    if (!row) return null;
    return { record: this.toRecord(row), orgId: row.org_id, clientId: row.client_id };
  }

  async create(ctx: TenantContext, input: RuleInput): Promise<RuleRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.assertScope(tx, input);
      const [row] = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        INSERT INTO rules (
          id, org_id, client_id, ad_account_id, name, description, level,
          conditions, combinator, action, guard,
          cooldown_minutes, max_actions_per_run, max_data_age_hours,
          enabled, dry_run, created_by, updated_at
        ) VALUES (
          gen_random_uuid(), ${ctx.orgId}::uuid, ${input.clientId}::uuid,
          ${input.adAccountId ?? null}::uuid, ${input.name}, ${input.description ?? null},
          ${input.level}::"EntityLevel",
          ${JSON.stringify(input.conditions)}::jsonb, ${input.combinator},
          ${JSON.stringify(input.action)}::jsonb, ${JSON.stringify(input.guard)}::jsonb,
          ${input.cooldownMinutes}, ${input.maxActionsPerRun}, ${input.maxDataAgeHours},
          ${input.enabled},
          -- PROVA MODUNDA DOĞUYOR, HER ZAMAN.
          --
          -- Girdi şemasında dryRun alanı YOK: kuralı oluştururken canlı
          -- işaretleyebilmek, rule.activate yetkisini anlamsız kılardı.
          -- Canlıya geçiş ayrı bir uç nokta ve ayrı bir yetki.
          true,
          ${ctx.userId}::uuid, now()
        )
        RETURNING *, NULL::varchar AS ad_account_name
      `);
      if (!row) throw new NotFoundException('Kural oluşturulamadı');
      return this.toRecord(row);
    });
  }

  async update(ctx: TenantContext, id: string, input: RuleInput): Promise<RuleRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      await this.assertScope(tx, input);
      const [row] = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        UPDATE rules SET
          client_id = ${input.clientId}::uuid,
          ad_account_id = ${input.adAccountId ?? null}::uuid,
          name = ${input.name},
          description = ${input.description ?? null},
          level = ${input.level}::"EntityLevel",
          conditions = ${JSON.stringify(input.conditions)}::jsonb,
          combinator = ${input.combinator},
          action = ${JSON.stringify(input.action)}::jsonb,
          guard = ${JSON.stringify(input.guard)}::jsonb,
          cooldown_minutes = ${input.cooldownMinutes},
          max_actions_per_run = ${input.maxActionsPerRun},
          max_data_age_hours = ${input.maxDataAgeHours},
          enabled = ${input.enabled},
          -- KOŞUL DEĞİŞTİYSE PROVAYA GERİ DÖNÜYOR.
          --
          -- Canlı bir kuralın eşiğini değiştirmek, onu yeni bir kural yapıyor.
          -- Eski kuralın onayına dayanarak yenisini canlı çalıştırmak,
          -- rule.activate yetkisini fiilen atlatmanın en kolay yolu olurdu:
          -- zararsız bir kural onaylatıp sonra koşulunu değiştirmek.
          --
          -- KARŞILAŞTIRMA JSONB ÜZERİNDEN, metin üzerinden DEĞİL.
          --
          -- conditions::text JSONB'nin kendi normalleştirdiği biçimi verir
          -- (boşluklar atılmış, anahtarlar yeniden sıralanmış) ve JS'in
          -- JSON.stringify çıktısıyla neredeyse hiç eşleşmez. Metin
          -- karşılaştırması yazıldığında sonuç şuydu: kuralın ADINI
          -- düzeltmek bile onu provaya döndürüyordu ve ajans kuralın hâlâ
          -- çalıştığını sanıyordu. JSONB eşitliği anlamsaldır — anahtar
          -- sırası önemsiz.
          dry_run = CASE
            WHEN conditions IS DISTINCT FROM ${JSON.stringify(input.conditions)}::jsonb
              OR action IS DISTINCT FROM ${JSON.stringify(input.action)}::jsonb
            THEN true ELSE dry_run
          END,
          updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
        RETURNING *, NULL::varchar AS ad_account_name
      `);
      if (!row) throw new NotFoundException('Kural bulunamadı');
      return this.toRecord(row);
    });
  }

  /**
   * Prova ↔ canlı geçişi. `rule.activate` yetkisiyle korunuyor.
   *
   * Ayrı metot ve ayrı uç nokta: `update` içinde bir alan olsaydı, kuralı
   * düzenleme yetkisi olan herkes onu canlıya alabilirdi.
   */
  async setMode(ctx: TenantContext, id: string, dryRun: boolean): Promise<RuleRecord> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const [row] = await tx.$queryRaw<RuleRow[]>(Prisma.sql`
        UPDATE rules SET dry_run = ${dryRun}, updated_at = now()
        WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
        RETURNING *, NULL::varchar AS ad_account_name
      `);
      if (!row) throw new NotFoundException('Kural bulunamadı');
      return this.toRecord(row);
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    await this.prisma.withTenant(ctx, async (tx) => {
      const n = await tx.$executeRaw(Prisma.sql`
        DELETE FROM rules WHERE id = ${id}::uuid AND org_id = ${ctx.orgId}::uuid
      `);
      if (n === 0) throw new NotFoundException('Kural bulunamadı');
    });
  }

  private async assertScope(tx: TxLike, input: RuleInput): Promise<void> {
    const [client] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT id FROM clients WHERE id = ${input.clientId}::uuid
    `);
    if (!client) throw new NotFoundException('Müşteri bulunamadı');

    if (input.adAccountId) {
      const [acc] = await tx.$queryRaw<Array<{ client_id: string }>>(Prisma.sql`
        SELECT client_id FROM ad_accounts WHERE id = ${input.adAccountId}::uuid
      `);
      if (!acc) throw new NotFoundException('Reklam hesabı bulunamadı');
      // Başka müşterinin hesabına kural yazmak sessiz bir hata olurdu: kural
      // hiçbir varlık bulamaz ve "hiç tetiklenmiyor" diye görünür.
      if (acc.client_id !== input.clientId) {
        throw new BadRequestException('Reklam hesabı bu müşteriye bağlı değil');
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Değerlendirme
  // ---------------------------------------------------------------------------

  /**
   * Kuralı değerlendirir — HİÇBİR ŞEY YAZMADAN.
   *
   * Hem prova önizlemesi hem canlı çalıştırma bu metodu kullanıyor. Aksiyonu
   * uygulamak ayrı bir adım (`RuleExecutor`); böylece "ne olurdu" ile "ne
   * oldu" aynı kodla hesaplanıyor ve ikisinin ayrışması mümkün değil.
   */
  async evaluateRule(
    ctx: TenantContext,
    ruleId: string,
    now = new Date(),
  ): Promise<EvaluationOutcome> {
    const rule = await this.get(ctx, ruleId);
    return this.prisma.withTenant(ctx, (tx) => this.runEvaluation(tx, rule, now));
  }

  async runEvaluation(
    tx: TxLike,
    rule: RuleRecord,
    now: Date,
  ): Promise<EvaluationOutcome> {
    const { table, hasBudget } = LEVEL_TABLE[rule.level];

    const accountFilter = rule.adAccountId
      ? Prisma.sql`AND e.ad_account_id = ${rule.adAccountId}::uuid`
      : Prisma.empty;

    const budgetCols = hasBudget
      ? Prisma.sql`e.budget_mode::text AS budget_mode, e.budget_amount_micros`
      : Prisma.sql`NULL::text AS budget_mode, NULL::bigint AS budget_amount_micros`;

    const entities = await tx.$queryRaw<EntityRow[]>(Prisma.sql`
      SELECT e.id::text AS id, e.name, e.external_id, e.status::text AS status,
             e.ad_account_id::text AS ad_account_id, ${budgetCols},
             a.currency
      FROM ${Prisma.raw(table)} e
      JOIN ad_accounts a ON a.id = e.ad_account_id
      WHERE e.client_id = ${rule.clientId}::uuid ${accountFilter}
        -- SİLİNMİŞ varlıklar değerlendirilmiyor. Platform onları zaten
        -- reddederdi ve her tur aynı hatayı kaydederdik.
        AND e.status <> 'deleted'
    `);

    if (entities.length === 0) {
      return { evaluatedCount: 0, matchedCount: 0, actions: [] };
    }

    const ids = entities.map((e) => e.id);
    const windows = [...new Set(rule.conditions.map((c) => c.window))];

    const [windowData, lastActions, budgetRatios] = await Promise.all([
      this.loadWindows(tx, rule.level, ids, windows, now),
      this.loadLastActions(tx, rule.id, ids),
      rule.conditions.some((c) => c.metric === 'budget_spent_ratio')
        ? this.loadBudgetRatios(tx, rule.clientId, now)
        : Promise.resolve(new Map<string, number>()),
    ]);

    const actions: PendingAction[] = [];
    let matchedCount = 0;
    let applied = 0;

    for (const e of entities) {
      const snapshot: EntitySnapshot = {
        entityId: e.id,
        entityName: e.name,
        entityExternalId: e.external_id,
        status: e.status,
        budgetMode: (e.budget_mode as EntitySnapshot['budgetMode']) ?? 'none',
        budgetAmountMicros: e.budget_amount_micros === null ? null : BigInt(e.budget_amount_micros),
        currency: e.currency,
        windows: windowData.get(e.id)?.windows ?? {},
        budgetSpentRatio: budgetRatios.get(e.ad_account_id) ?? null,
        newestDataAt: windowData.get(e.id)?.newestAt ?? null,
        lastActionAt: lastActions.get(e.id) ?? null,
      };

      const result = evaluate(snapshot, {
        conditions: rule.conditions,
        combinator: rule.combinator,
        guard: rule.guard,
        cooldownMinutes: rule.cooldownMinutes,
        maxDataAgeHours: rule.maxDataAgeHours,
        actionType: rule.action.type,
        now,
      });

      if (result.outcome === null) continue;
      if (result.matched) matchedCount++;

      let outcome = result.outcome;
      let targetBudget: bigint | null = null;

      if (outcome === 'eligible' && rule.action.type === 'adjust_budget') {
        targetBudget = nextBudgetMicros(snapshot.budgetAmountMicros!, rule.action.percent, {
          maxBudget: rule.action.maxBudget,
          minBudget: rule.action.minBudget,
        });
        // Hesaplanan bütçe mevcutla aynıysa yazacak bir şey yok — kota
        // harcayan boş bir platform çağrısı olurdu.
        if (targetBudget === null) {
          outcome = 'skipped_noop';
        }
      }

      /**
       * TUR SINIRI — kazaya karşı son emniyet.
       *
       * Yanlış yazılmış bir eşik 400 reklamı birden duraklatabilir. Sınır
       * bunu keser ama SESSİZCE KESMİYOR: kalanlar `skipped_capped` olarak
       * kaydediliyor. "20 reklam duraklatıldı" ile "400'den 20'si
       * duraklatıldı, 380'i sınıra takıldı" farklı bilgiler.
       */
      if (outcome === 'eligible') {
        if (applied >= rule.maxActionsPerRun) {
          outcome = 'skipped_capped';
        } else {
          applied++;
        }
      }

      actions.push({
        entityId: e.id,
        entityName: e.name,
        entityExternalId: e.external_id,
        entityLevel: rule.level,
        adAccountId: e.ad_account_id,
        outcome,
        reason:
          outcome === 'skipped_capped' && result.outcome === 'eligible'
            ? `${result.reason} — tur sınırına (${rule.maxActionsPerRun}) takıldı.`
            : result.reason,
        beforeState: this.beforeState(rule, snapshot),
        targetBudgetMicros: targetBudget,
      });
    }

    return { evaluatedCount: entities.length, matchedCount, actions };
  }

  /**
   * Aksiyon öncesi durum — geri alma (`rule.revert`) ve denetim için.
   *
   * Yalnızca DEĞİŞTİRİLEN alan saklanıyor. Varlığın tamamını kopyalamak,
   * geri almayı "her şeyi eski hâline döndür"e çevirirdi; oysa aradan geçen
   * sürede insan eliyle yapılmış değişiklikler de geri alınırdı.
   */
  private beforeState(rule: RuleRecord, s: EntitySnapshot): Record<string, unknown> | null {
    if (rule.action.type === 'pause' || rule.action.type === 'resume') {
      return { status: s.status };
    }
    if (rule.action.type === 'adjust_budget') {
      return {
        budgetAmountMicros: s.budgetAmountMicros?.toString() ?? null,
        budgetMode: s.budgetMode,
      };
    }
    return null;
  }

  /**
   * Pencere toplamları — TEK SORGUDA, pencere başına bir satır kümesi.
   *
   * Pencere başına ayrı sorgu atmak 5 koşullu bir kuralda 5 tur demek. `UNION
   * ALL` ile tek gidiş: satır sayısı küçük (varlık × pencere) ve planlayıcı
   * her parçayı ayrı ayrı indeksten okuyor.
   */
  private async loadWindows(
    tx: TxLike,
    level: RuleLevel,
    entityIds: string[],
    windows: RuleWindow[],
    now: Date,
  ): Promise<Map<string, EntityWindows>> {
    // BUGÜN DIŞARIDA. Panel, rapor ve bütçe sayfasıyla aynı kural: gün
    // bitmeden gelen kısmi veri EBM'yi düşük gösterir.
    const yesterday = shiftDate(toDateText(now), -1);

    const parts = windows.map((w) => {
      const from = shiftDate(yesterday, -(WINDOW_DAYS[w] - 1));
      return Prisma.sql`
        SELECT ${w} AS win, entity_id::text AS entity_id,
               SUM(spend_micros) AS spend_micros,
               SUM(impressions) AS impressions,
               SUM(clicks) AS clicks,
               SUM(conversions) AS conversions,
               SUM(conversion_value_micros) AS conversion_value_micros,
               -- ERİŞİM TOPLANAMAZ ama frekans için bir paydaya ihtiyaç var.
               -- Günlük erişimlerin ORTALAMASI alınıyor: toplamak aynı kişiyi
               -- her gün yeniden sayardı ve frekansı olduğundan düşük
               -- gösterirdi — yorgunluk kuralını tam ters yönde bozar.
               COALESCE(AVG(NULLIF(reach, 0)), 0)::bigint AS reach,
               COUNT(DISTINCT date) AS days,
               MAX(fetched_at) AS newest
        FROM insights_daily
        WHERE entity_level = ${level}::"EntityLevel"
          AND entity_id = ANY(${entityIds}::uuid[])
          AND date BETWEEN ${from}::date AND ${yesterday}::date
        GROUP BY entity_id
      `;
    });

    const rows = await tx.$queryRaw<Array<WindowRow & { win: RuleWindow }>>(
      Prisma.join(parts, ' UNION ALL '),
    );

    const out = new Map<string, EntityWindows>();
    for (const r of rows) {
      const entry = out.get(r.entity_id) ?? { windows: {}, newestAt: null };
      entry.windows[r.win] = {
        spendMicros: toBigInt(r.spend_micros),
        impressions: Number(r.impressions ?? 0),
        clicks: Number(r.clicks ?? 0),
        conversions: Number(r.conversions ?? 0),
        conversionValueMicros: toBigInt(r.conversion_value_micros),
        reach: Number(r.reach ?? 0),
        days: Number(r.days ?? 0),
      };
      // TAZELİK PENCERE BAZLI DEĞİL VARLIK BAZLI: hangi pencereden gelirse
      // gelsin, o varlığın en taze satırı hangisiyse o. Dar pencerenin
      // tazeliğini kullanmak, 30 günlük bir kuralda dünkü veriyi "yok"
      // sayardı; geniş pencereninkini kullanmak da eski bir satırı taze
      // gösterirdi.
      if (r.newest && (!entry.newestAt || r.newest > entry.newestAt)) {
        entry.newestAt = r.newest;
      }
      out.set(r.entity_id, entry);
    }

    return out;
  }

  private async loadLastActions(
    tx: TxLike,
    ruleId: string,
    entityIds: string[],
  ): Promise<Map<string, Date>> {
    const rows = await tx.$queryRaw<Array<{ entity_id: string; last_at: Date }>>(Prisma.sql`
      SELECT entity_id::text AS entity_id, MAX(created_at) AS last_at
      FROM rule_action_logs
      WHERE rule_id = ${ruleId}::uuid
        AND entity_id = ANY(${entityIds}::uuid[])
        -- ATLANAN KAYITLAR BEKLEME BAŞLATMIYOR.
        --
        -- "Örneklem yetersiz" diye atlanan bir varlık 24 saat boyunca
        -- yeniden değerlendirilemezse, örneklem dolduğu anda değil ertesi gün
        -- karar verilirdi. Bekleme süresinin amacı SALINIMI engellemek ve
        -- salınım ancak gerçekten aksiyon alındığında olur.
        AND outcome IN ('applied', 'simulated')
      GROUP BY entity_id
    `);
    return new Map(rows.map((r) => [r.entity_id, r.last_at]));
  }

  /**
   * Reklam hesabı → bu ayki bütçe tüketim oranı.
   *
   * Hesabın KENDİ bütçesi varsa o, yoksa müşteri geneli şemsiye bütçe
   * kullanılıyor. Şemsiyeye düşmemek, yalnızca toplam bütçe tanımlamış bir
   * ajansta bütçe kurallarını tamamen kullanılamaz kılardı.
   */
  private async loadBudgetRatios(
    tx: TxLike,
    clientId: string,
    now: Date,
  ): Promise<Map<string, number>> {
    const today = toDateText(now);
    const monthStart = `${today.slice(0, 7)}-01`;
    const throughDate = shiftDate(today, -1);

    if (throughDate < monthStart) return new Map();

    const rows = await tx.$queryRaw<
      Array<{ ad_account_id: string; ratio: string | number | null }>
    >(Prisma.sql`
      WITH spend AS (
        SELECT ad_account_id, SUM(spend_micros) AS spent
        FROM insights_daily
        WHERE client_id = ${clientId}::uuid
          AND entity_level = 'campaign'::"EntityLevel"
          AND date BETWEEN ${monthStart}::date AND ${throughDate}::date
        GROUP BY ad_account_id
      ),
      client_total AS (
        SELECT COALESCE(SUM(spent), 0) AS spent FROM spend
      ),
      umbrella AS (
        SELECT amount_micros FROM monthly_budgets
        WHERE client_id = ${clientId}::uuid AND ad_account_id IS NULL
          AND month = ${monthStart}::date
      )
      SELECT a.id::text AS ad_account_id,
             CASE
               WHEN b.amount_micros IS NOT NULL AND b.amount_micros > 0
                 THEN COALESCE(s.spent, 0)::numeric / b.amount_micros
               WHEN u.amount_micros IS NOT NULL AND u.amount_micros > 0
                 -- ŞEMSİYEYE DÜŞÜNCE ORAN MÜŞTERİ GENELİ: hesabın kendi
                 -- harcaması değil, müşterinin toplam harcaması bölünüyor.
                 -- Hesap harcamasını müşteri bütçesine bölmek, üç hesaplı bir
                 -- müşteride oranı üçe böler ve kural hiç tetiklenmezdi.
                 THEN ct.spent::numeric / u.amount_micros
               ELSE NULL
             END AS ratio
      FROM ad_accounts a
      LEFT JOIN spend s ON s.ad_account_id = a.id
      LEFT JOIN monthly_budgets b
             ON b.ad_account_id = a.id AND b.month = ${monthStart}::date
      LEFT JOIN umbrella u ON true
      CROSS JOIN client_total ct
      WHERE a.client_id = ${clientId}::uuid
    `);

    const out = new Map<string, number>();
    for (const r of rows) {
      if (r.ratio === null) continue;
      out.set(r.ad_account_id, Number(r.ratio));
    }
    return out;
  }

  // ---------------------------------------------------------------------------
  // Tur kaydı
  // ---------------------------------------------------------------------------

  async listRuns(ctx: TenantContext, ruleId: string, limit = 20): Promise<RuleRunRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          rule_id: string;
          rule_name: string;
          dry_run: boolean;
          started_at: Date;
          finished_at: Date | null;
          evaluated_count: number;
          matched_count: number;
          action_count: number;
          error: string | null;
        }>
      >(Prisma.sql`
        SELECT run.id, run.rule_id, r.name AS rule_name, run.dry_run,
               run.started_at, run.finished_at, run.evaluated_count,
               run.matched_count, run.action_count, run.error
        FROM rule_runs run
        JOIN rules r ON r.id = run.rule_id
        WHERE run.rule_id = ${ruleId}::uuid AND run.org_id = ${ctx.orgId}::uuid
        ORDER BY run.started_at DESC
        LIMIT ${limit}
      `);
      return rows.map((r) => ({
        id: r.id,
        ruleId: r.rule_id,
        ruleName: r.rule_name,
        dryRun: r.dry_run,
        startedAt: r.started_at.toISOString(),
        finishedAt: r.finished_at?.toISOString() ?? null,
        evaluatedCount: r.evaluated_count,
        matchedCount: r.matched_count,
        actionCount: r.action_count,
        error: r.error,
      }));
    });
  }

  async listActions(ctx: TenantContext, runId: string): Promise<RuleActionRecord[]> {
    return this.prisma.withTenant(ctx, async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          id: string;
          rule_id: string;
          run_id: string;
          entity_level: RuleLevel;
          entity_id: string;
          entity_name: string;
          entity_external_id: string;
          action_type: string;
          outcome: string;
          reason: string;
          before_state: Record<string, unknown> | null;
          after_state: Record<string, unknown> | null;
          error: string | null;
          created_at: Date;
        }>
      >(Prisma.sql`
        SELECT * FROM rule_action_logs
        WHERE run_id = ${runId}::uuid AND org_id = ${ctx.orgId}::uuid
        ORDER BY created_at, entity_name
      `);
      return rows.map((r) => ({
        id: r.id,
        ruleId: r.rule_id,
        runId: r.run_id,
        entityLevel: r.entity_level,
        entityId: r.entity_id,
        entityName: r.entity_name,
        entityExternalId: r.entity_external_id,
        actionType: r.action_type as RuleActionRecord['actionType'],
        outcome: r.outcome as ActionOutcome,
        reason: r.reason,
        beforeState: r.before_state,
        afterState: r.after_state,
        error: r.error,
        createdAt: r.created_at.toISOString(),
      }));
    });
  }

  private toRecord(row: RuleRow): RuleRecord {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      clientId: row.client_id,
      adAccountId: row.ad_account_id,
      adAccountName: row.ad_account_name,
      level: row.level,
      conditions: row.conditions,
      combinator: row.combinator,
      action: row.action,
      guard: row.guard,
      cooldownMinutes: row.cooldown_minutes,
      maxActionsPerRun: row.max_actions_per_run,
      maxDataAgeHours: row.max_data_age_hours,
      enabled: row.enabled,
      dryRun: row.dry_run,
      lastRunAt: row.last_run_at?.toISOString() ?? null,
      lastTriggeredAt: row.last_triggered_at?.toISOString() ?? null,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}

/** Prisma transaction istemcisinin bu servisin kullandığı yüzeyi. */
export interface TxLike {
  /**
   * `T` SONUCUN TAMAMI, eleman tipi değil — Prisma'nın kendi imzası böyle.
   * `Promise<T[]>` yazmak `tx.$queryRaw<RuleRow[]>()` çağrısını
   * `Promise<RuleRow[][]>` yapıyor ve hata satırlarca uzakta patlıyor.
   */
  $queryRaw<T = unknown>(sql: Prisma.Sql): Promise<T>;
  $executeRaw(sql: Prisma.Sql): Promise<number>;
}

/**
 * Bir varlığın pencere toplamları + en taze veri anı.
 *
 * İkisi BİRLİKTE taşınıyor. İlk yazımda tazelik modül seviyesinde bir Map'te
 * tutuluyordu — istekler arası paylaşılan durum, yani bir kiracının tazelik
 * bilgisinin diğerine sızması. Sessiz ve teşhis edilmesi çok zor bir hata
 * türü olurdu.
 */
interface EntityWindows {
  windows: Partial<Record<RuleWindow, WindowTotals>>;
  newestAt: Date | null;
}

function toBigInt(value: string | number | bigint | null | undefined): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === 'bigint') return value;
  return BigInt(String(value).split('.')[0] || '0');
}

function toDateText(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
