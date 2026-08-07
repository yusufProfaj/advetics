import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ruleInputSchema,
  ruleModeSchema,
  ruleQuerySchema,
  type RuleActionRecord,
  type RuleInput,
  type RuleQuery,
  type RuleRecord,
  type RuleRunRecord,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { RulesService } from './rules.service';
import { RuleExecutorService } from './rule-executor.service';

/**
 * Modül 5 — Kural motoru uç noktaları.
 *
 * DÖRT AYRI YETKİ, üçü burada:
 *   · `rule.read`     — kuralları ve turları görmek
 *   · `rule.write`    — kural yazmak ve düzenlemek
 *   · `rule.activate` — PROVADAN CANLIYA geçirmek
 *
 * Üçüncüsünün ayrı olması bu modülün en önemli tasarım kararı: bir kuralı
 * yazmakla onu müşterinin hesabında çalıştırmak farklı ağırlıkta kararlar.
 */
@Controller('rules')
export class RulesController {
  constructor(
    private readonly rules: RulesService,
    private readonly executor: RuleExecutorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('rule.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(ruleQuerySchema)) query: RuleQuery,
  ): Promise<RuleRecord[]> {
    return this.rules.list(ctx, query);
  }

  @Get(':id')
  @RequirePermissions('rule.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RuleRecord> {
    return this.rules.get(ctx, id);
  }

  @Get(':id/runs')
  @RequirePermissions('rule.read')
  runs(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<RuleRunRecord[]> {
    return this.rules.listRuns(ctx, id);
  }

  @Get('runs/:runId/actions')
  @RequirePermissions('rule.read')
  actions(
    @CurrentTenant() ctx: TenantContext,
    @Param('runId', ParseUUIDPipe) runId: string,
  ): Promise<RuleActionRecord[]> {
    return this.rules.listActions(ctx, runId);
  }

  @Post()
  @RequirePermissions('rule.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ruleInputSchema)) input: RuleInput,
  ): Promise<RuleRecord> {
    return this.rules.create(ctx, input);
  }

  @Put(':id')
  @RequirePermissions('rule.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(ruleInputSchema)) input: RuleInput,
  ): Promise<RuleRecord> {
    return this.rules.update(ctx, id, input);
  }

  /**
   * Prova ↔ canlı. AYRI uç nokta ve AYRI yetki.
   *
   * `update` içinde bir alan olsaydı, kuralı düzenleme yetkisi olan herkes onu
   * canlıya alabilirdi ve `rule.activate` yetkisi hiçbir şey ifade etmezdi.
   */
  @Patch(':id/mode')
  @RequirePermissions('rule.activate')
  setMode(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(ruleModeSchema)) body: { dryRun: boolean },
  ): Promise<RuleRecord> {
    return this.rules.setMode(ctx, id, body.dryRun);
  }

  /**
   * Kuralı ŞİMDİ çalıştır.
   *
   * `rule.write` yetiyor, `rule.activate` GEREKMİYOR: kural prova modundaysa
   * bu çağrı da prova, yani hiçbir şeye dokunmuyor. Kural zaten canlıysa
   * onu canlıya alan kişi `rule.activate` yetkisini çoktan kullanmış oluyor.
   */
  @Post(':id/run')
  @RequirePermissions('rule.write')
  async run(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ runId: string; actionCount: number; matchedCount: number }> {
    const rule = await this.rules.get(ctx, id);
    return this.prisma.withTenant(ctx, (tx) => this.executor.execute(tx, ctx, rule));
  }

  @Delete(':id')
  @RequirePermissions('rule.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.rules.remove(ctx, id);
  }
}
