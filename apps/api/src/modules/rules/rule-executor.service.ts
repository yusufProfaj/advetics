import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { ActionOutcome, RuleRecord, TenantContext } from '@advetics/shared';
import { PlatformApiError, type PlatformActionRequest } from '../connections/provider.types';
import { ProviderRegistry } from '../connections/provider.registry';
import { TokenVaultService } from '../connections/token-vault.service';
import { QuotaGuardService } from '../../queue/quota-guard.service';
import { RulesService, type PendingAction, type TxLike } from './rules.service';

/**
 * Kural turunu yürütür: değerlendir → uygula (ya da prova et) → kaydet.
 *
 * DEĞERLENDİRME VE UYGULAMA AYRI. Prova ile canlı AYNI değerlendirme kodunu
 * çalıştırıyor; tek fark son adımda platforma dokunup dokunmamak. İki ayrı yol
 * yazmak, provanın canlıyı yanlış tahmin etmesi demek olurdu — provanın tek
 * değeri doğru tahmin etmesi.
 *
 * HER KARAR KAYDEDİLİYOR, atlananlar dâhil. "Kuralım neden hiç çalışmıyor"
 * sorusunun cevabı bu tabloda.
 */

interface AccountAuth {
  connectionId: string;
  externalId: string;
  platform: 'meta' | 'google';
  currency: string;
  grantedScopes: string[];
}

@Injectable()
export class RuleExecutorService {
  private readonly logger = new Logger(RuleExecutorService.name);

  constructor(
    private readonly rules: RulesService,
    private readonly providers: ProviderRegistry,
    private readonly vault: TokenVaultService,
    private readonly quota: QuotaGuardService,
  ) {}

  /**
   * Bir kuralı çalıştırır.
   *
   * `tx` dışarıdan geliyor: API'den manuel çalıştırmada kiracı bağlamlı
   * istemci, worker'da BYPASSRLS istemcisi. Servisin hangisi olduğunu bilmesi
   * gerekmiyor ve bilmemesi daha iyi — worker'ın kiracı bağlamı yok.
   */
  async execute(
    tx: TxLike,
    ctx: TenantContext,
    rule: RuleRecord,
    now = new Date(),
  ): Promise<{ runId: string; actionCount: number; matchedCount: number }> {
    const [run] = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO rule_runs (id, org_id, rule_id, dry_run, started_at)
      VALUES (gen_random_uuid(), ${ctx.orgId}::uuid, ${rule.id}::uuid, ${rule.dryRun}, ${now})
      RETURNING id
    `);
    if (!run) throw new Error('Kural turu açılamadı');

    let evaluated = 0;
    let matched = 0;
    let acted = 0;
    let failure: string | null = null;

    try {
      const outcome = await this.rules.runEvaluation(tx, rule, now);
      evaluated = outcome.evaluatedCount;
      matched = outcome.matchedCount;

      // Yetki kontrolü TUR BAŞINA BİR KEZ, aksiyon başına değil.
      //
      // `ads_management` yoksa 20 varlık için 20 ayrı yetki hatası
      // kaydetmek, gerçek sebebi 20 satıra dağıtmak olurdu. Tek sebep, tek
      // kez ve her satırda aynı açık mesajla.
      const auth = rule.dryRun ? null : await this.resolveAuth(tx, outcome.actions);

      for (const action of outcome.actions) {
        const result = await this.applyOne(tx, ctx, rule, run.id, action, auth, now);
        if (result === 'applied' || result === 'simulated') acted++;
      }
    } catch (err) {
      // Tur hatası TURA yazılıyor, sessizce yutulmuyor. Bir kuralın
      // patlaması diğer kuralları durdurmamalı — çağıran bu istisnayı
      // yakalamıyor, tur kaydında görüyor.
      failure = err instanceof Error ? err.message : String(err);
      this.logger.error(`Kural ${rule.name} turu başarısız: ${failure}`);
    }

    await tx.$executeRaw(Prisma.sql`
      UPDATE rule_runs SET
        finished_at = now(),
        evaluated_count = ${evaluated},
        matched_count = ${matched},
        action_count = ${acted},
        error = ${failure?.slice(0, 2000) ?? null}
      WHERE id = ${run.id}::uuid
    `);

    await tx.$executeRaw(Prisma.sql`
      UPDATE rules SET
        last_run_at = ${now},
        -- TETİKLENME ANI yalnızca gerçekten aksiyon alındığında güncelleniyor.
        -- Her turda güncellemek "en son ne zaman bir şey yaptı" sorusunu
        -- "en son ne zaman çalıştı"ya çevirirdi; ikisi çok farklı.
        last_triggered_at = CASE WHEN ${acted} > 0 THEN ${now} ELSE last_triggered_at END
      WHERE id = ${rule.id}::uuid
    `);

    return { runId: run.id, actionCount: acted, matchedCount: matched };
  }

  /**
   * Tek bir kararı uygular ve kaydeder.
   *
   * Dönen değer kaydedilen `outcome` — çağıran sayaç tutuyor.
   */
  private async applyOne(
    tx: TxLike,
    ctx: TenantContext,
    rule: RuleRecord,
    runId: string,
    action: PendingAction,
    auth: Map<string, AccountAuth | string> | null,
    now: Date,
  ): Promise<ActionOutcome> {
    // Atlanmış kararlar olduğu gibi kaydediliyor.
    if (action.outcome !== 'eligible') {
      await this.writeLog(tx, ctx, rule, runId, action, action.outcome, null, null);
      return action.outcome;
    }

    // `notify` platforma DOKUNMUYOR — prova modunun eş anlamlısı değil,
    // canlıda da yalnızca haber veren bir aksiyon. Ajans çoğu kuralı önce
    // böyle çalıştırmak istiyor.
    if (rule.action.type === 'notify' || rule.dryRun) {
      await this.writeLog(tx, ctx, rule, runId, action, 'simulated', null, null);
      return 'simulated';
    }

    const entry = auth?.get(action.adAccountId);
    if (typeof entry === 'string' || entry === undefined) {
      const msg = typeof entry === 'string' ? entry : 'Reklam hesabı bağlantısı çözülemedi';
      await this.writeLog(tx, ctx, rule, runId, action, 'failed', null, msg);
      return 'failed';
    }

    const provider = this.providers.get(entry.platform);

    // KOTA — `rule_action` katmanı öncelikli kovadan harcıyor.
    //
    // Senkronizasyon kotayı doldurmuş olsa bile kural aksiyonu geçiyor:
    // veri güncellenememek, bütçe değiştirilememekten ucuz.
    const gate = await this.quota.acquire({
      platform: entry.platform,
      adAccountId: action.adAccountId,
      layer: 'rule_action',
    });
    if (!gate.allowed) {
      await this.writeLog(
        tx,
        ctx,
        rule,
        runId,
        action,
        'failed',
        null,
        `Kota engeli: ${gate.reason}. Bir sonraki turda yeniden denenecek.`,
      );
      return 'failed';
    }

    try {
      const accessToken = await this.vault.getAccessToken(entry.connectionId, provider);
      const request = this.toPlatformRequest(rule, action, entry);
      const res = await provider.applyAction(
        {
          accessToken,
          accountExternalId: entry.externalId,
          onRateLimit: (snapshot) =>
            this.quota.record({
              platform: entry.platform,
              adAccountId: action.adAccountId,
              endpoint: `rule:${rule.action.type}`,
              snapshot,
            }),
        },
        request,
      );

      await this.writeLog(tx, ctx, rule, runId, action, 'applied', res.afterState, null);
      await this.writeAudit(tx, ctx, rule, action, res.afterState, now);
      return 'applied';
    } catch (err) {
      const message =
        err instanceof PlatformApiError
          ? `${err.kind}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err);
      await this.writeLog(tx, ctx, rule, runId, action, 'failed', null, message);
      return 'failed';
    }
  }

  private toPlatformRequest(
    rule: RuleRecord,
    action: PendingAction,
    entry: AccountAuth,
  ): PlatformActionRequest {
    if (rule.action.type === 'adjust_budget') {
      const before = action.beforeState as { budgetMode?: string } | null;
      return {
        type: 'set_budget',
        // Reklam seviyesinde bütçe yok; değerlendirici bunu zaten
        // `skipped_noop` ile eliyor, buraya yalnızca kampanya/ad set geliyor.
        level: action.entityLevel === 'ad' ? 'ad_group' : action.entityLevel,
        externalId: action.entityExternalId,
        amountMicros: action.targetBudgetMicros!,
        budgetMode: before?.budgetMode === 'lifetime' ? 'lifetime' : 'daily',
        currency: entry.currency,
      };
    }
    return {
      type: rule.action.type === 'resume' ? 'resume' : 'pause',
      level: action.entityLevel,
      externalId: action.entityExternalId,
    };
  }

  /**
   * Hesap → bağlantı bilgisi. Yazma yapılamıyorsa sebebi string olarak.
   *
   * Sebebi string olarak taşımak, "bağlantı yok" ile "izin yok"u ayırmayı
   * sağlıyor; ikisi de aynı `failed` sonucuna düşüyor ama ajans için
   * tamamen farklı işler.
   */
  private async resolveAuth(
    tx: TxLike,
    actions: PendingAction[],
  ): Promise<Map<string, AccountAuth | string>> {
    const ids = [...new Set(actions.filter((a) => a.outcome === 'eligible').map((a) => a.adAccountId))];
    const out = new Map<string, AccountAuth | string>();
    if (ids.length === 0) return out;

    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        connection_id: string;
        external_id: string;
        platform: 'meta' | 'google';
        currency: string;
        granted_scopes: string[];
        status: string;
      }>
    >(Prisma.sql`
      SELECT a.id::text AS id, a.connection_id::text AS connection_id,
             a.external_id, a.platform::text AS platform, a.currency,
             c.granted_scopes, c.status::text AS status
      FROM ad_accounts a
      JOIN platform_connections c ON c.id = a.connection_id
      WHERE a.id = ANY(${ids}::uuid[])
    `);

    for (const r of rows) {
      if (r.status !== 'active') {
        out.set(r.id, `Platform bağlantısı etkin değil (${r.status}) — yeniden bağlanmak gerekiyor.`);
        continue;
      }
      const provider = this.providers.get(r.platform);
      const can = provider.canWrite(r.granted_scopes ?? []);
      if (!can.ok) {
        // EN SIK KARŞILAŞILACAK DURUM: Meta App Review `ads_management`i
        // henüz onaylamamış. Mesaj bunu açıkça söylüyor, yoksa ajans kuralın
        // bozuk olduğunu sanır.
        out.set(
          r.id,
          `Yazma izni yok: ${can.missing.join(', ')}. ` +
            'Platform onayı gelene kadar kural prova modunda çalıştırılmalı.',
        );
        continue;
      }
      out.set(r.id, {
        connectionId: r.connection_id,
        externalId: r.external_id,
        platform: r.platform,
        currency: r.currency,
        grantedScopes: r.granted_scopes ?? [],
      });
    }
    return out;
  }

  private async writeLog(
    tx: TxLike,
    ctx: TenantContext,
    rule: RuleRecord,
    runId: string,
    action: PendingAction,
    outcome: ActionOutcome,
    afterState: Record<string, unknown> | null,
    error: string | null,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      INSERT INTO rule_action_logs (
        id, org_id, rule_id, run_id, entity_level, entity_id, entity_name,
        entity_external_id, action_type, outcome, reason, before_state,
        after_state, error
      ) VALUES (
        gen_random_uuid(), ${ctx.orgId}::uuid, ${rule.id}::uuid,
        ${runId}::uuid, ${action.entityLevel}::"EntityLevel",
        ${action.entityId}::uuid, ${action.entityName.slice(0, 300)},
        ${action.entityExternalId}, ${rule.action.type}, ${outcome},
        ${action.reason.slice(0, 500)},
        ${action.beforeState === null ? null : JSON.stringify(action.beforeState)}::jsonb,
        ${afterState === null ? null : JSON.stringify(afterState)}::jsonb,
        ${error?.slice(0, 1000) ?? null}
      )
    `);
  }

  /**
   * Denetim kaydı — YALNIZCA gerçekten uygulanan aksiyonlar için.
   *
   * `actorType = 'rule'`. Müşteriye "bütçemi kim değiştirdi" sorusunun cevabı
   * bu tablodan üretiliyor ve orada "sistem" yazması yeterli değil: hangi
   * kuralın, hangi eşikle tetiklendiği `actorLabel` ve `after` alanında.
   *
   * Prova kayıtları BURAYA YAZILMIYOR: denetim kaydı olan biteni anlatır,
   * olabilecekleri değil. Prova zaten `rule_action_logs` içinde.
   */
  private async writeAudit(
    tx: TxLike,
    ctx: TenantContext,
    rule: RuleRecord,
    action: PendingAction,
    afterState: Record<string, unknown>,
    now: Date,
  ): Promise<void> {
    await tx.$executeRaw(Prisma.sql`
      -- id KOLONU VERİLMİYOR: audit_logs.id BIGSERIAL, UUID değil.
      -- Diğer tablolar uuid kullandığı için buraya da gen_random_uuid()
      -- yazmak kolay bir refleks — ve sonucu sessiz: istisna yakalanıp
      -- aksiyon 'failed' olarak kaydediliyordu, yani platforma yazma
      -- BAŞARILI olduğu hâlde kayıt başarısız görünüyordu.
      INSERT INTO audit_logs (
        org_id, client_id, actor_type, actor_id, actor_label,
        action, target_type, target_id, before, after, created_at
      ) VALUES (
        ${ctx.orgId}::uuid, ${rule.clientId}::uuid,
        'rule'::"ActorType", NULL, ${rule.name.slice(0, 255)},
        ${`rule.${rule.action.type}`}, ${action.entityLevel},
        ${action.entityExternalId},
        ${action.beforeState === null ? null : JSON.stringify(action.beforeState)}::jsonb,
        ${JSON.stringify({ ...afterState, reason: action.reason })}::jsonb,
        ${now}
      )
    `);
  }
}
