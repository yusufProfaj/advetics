import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  budgetInputSchema,
  budgetQuerySchema,
  pacingQuerySchema,
  type BudgetInput,
  type BudgetQuery,
  type BudgetRecord,
  type ClientPacing,
  type PacingQuery,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { BudgetsService } from './budgets.service';

/**
 * Modül 5 — Aylık bütçe uç noktaları.
 *
 * OKUMA ve YAZMA AYRI İZİNDE. `budget.read` analistte ve müşteri
 * görüntüleyicisinde de var; `budget.write` yalnızca yöneticide.
 *
 * Ayrımın sebebi: bütçe limiti aynı zamanda otomatik durdurmanın eşiği.
 * Yanlış girilen bir rakam kampanyaları durdurabilir — bütçeyi görmekle
 * değiştirmek aynı ağırlıkta kararlar değil.
 */
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Get()
  @RequirePermissions('budget.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(budgetQuerySchema)) query: BudgetQuery,
  ): Promise<BudgetRecord[]> {
    return this.budgets.list(ctx, query);
  }

  /**
   * Pacing — panelin ve uyarıların okuduğu uç nokta.
   *
   * `budget.read` yetiyor: müşteri kendi bütçe tüketimini görebilmeli, zaten
   * kendisine ait bir bilgi.
   */
  @Get('pacing')
  @RequirePermissions('budget.read')
  pacing(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(pacingQuerySchema)) query: PacingQuery,
  ): Promise<ClientPacing> {
    return this.budgets.pacing(ctx, query);
  }

  /**
   * POST hem oluşturuyor hem güncelliyor.
   *
   * PUT + ayrı bir id yolu olabilirdi ama istemcinin önce kaydın var olup
   * olmadığını bilmesi gerekirdi. Kullanıcı için bu tek bir eylem: "Ağustos
   * bütçesi 45.000".
   */
  @Post()
  @RequirePermissions('budget.write')
  upsert(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(budgetInputSchema)) input: BudgetInput,
  ): Promise<BudgetRecord> {
    return this.budgets.upsert(ctx, input);
  }

  @Delete(':id')
  @RequirePermissions('budget.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.budgets.remove(ctx, id);
  }
}
