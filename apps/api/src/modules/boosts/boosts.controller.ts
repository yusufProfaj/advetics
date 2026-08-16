import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  boostablePostQuerySchema,
  boostDecisionSchema,
  boostQuerySchema,
  boostRuleInputSchema,
  type BoostablePostList,
  type BoostablePostQuery,
  type BoostQuery,
  type BoostRecord,
  type BoostRuleInput,
  type BoostRuleRecord,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';
import { BoostsService } from './boosts.service';
import { BoostExecutorService } from './boost-executor.service';

/**
 * Modül 7 — Auto-Boost uç noktaları.
 *
 * ÜÇ AYRI YETKİ:
 *   · `boost.read`    — kuralları ve adayları görmek
 *   · `boost.write`   — kural yazmak, kuralı çalıştırmak (aday üretmek)
 *   · `boost.approve` — ADAYI ONAYLAMAK, yani para taahhüt etmek
 *
 * Üçüncüsünün ayrı olması Modül 5'teki `rule.activate` ile aynı gerekçeye
 * dayanıyor ama daha sert: orada aksiyon harcamayı durduruyordu, burada
 * başlatıyor.
 */
@Controller('boosts')
export class BoostsController {
  constructor(
    private readonly boosts: BoostsService,
    private readonly executor: BoostExecutorService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @RequirePermissions('boost.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(boostQuerySchema)) query: BoostQuery,
  ): Promise<BoostRecord[]> {
    return this.boosts.listBoosts(ctx, query);
  }

  /**
   * Öne çıkarılabilecek gönderiler — elle boost ekranının ilk adımı.
   *
   * `boost.read` yetiyor: bu uç yalnızca okuyor, hiçbir şey taahhüt etmiyor.
   * Para taahhüdü `boost.approve` altında ve orada kalıyor.
   */
  @Get('posts')
  @RequirePermissions('boost.read')
  listPosts(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(boostablePostQuerySchema)) query: BoostablePostQuery,
  ): Promise<BoostablePostList> {
    return this.boosts.listBoostablePosts(ctx, query);
  }

  @Get('rules')
  @RequirePermissions('boost.read')
  listRules(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId') clientId: string,
  ): Promise<BoostRuleRecord[]> {
    return this.boosts.listRules(ctx, clientId);
  }

  @Post('rules')
  @RequirePermissions('boost.write')
  createRule(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(boostRuleInputSchema)) input: BoostRuleInput,
  ): Promise<BoostRuleRecord> {
    return this.boosts.createRule(ctx, input);
  }

  @Put('rules/:id')
  @RequirePermissions('boost.write')
  updateRule(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(boostRuleInputSchema)) input: BoostRuleInput,
  ): Promise<BoostRuleRecord> {
    return this.boosts.updateRule(ctx, id, input);
  }

  @Delete('rules/:id')
  @RequirePermissions('boost.write')
  removeRule(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.boosts.removeRule(ctx, id);
  }

  /**
   * Kuralı ŞİMDİ çalıştır — aday üretir, platforma DOKUNMAZ.
   *
   * `boost.write` yetiyor: aday üretmek para harcamıyor. Adayı onaylamak
   * ayrı bir yetki ve ayrı bir uç nokta.
   */
  @Post('rules/:id/run')
  @RequirePermissions('boost.write')
  async runRule(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.prisma.withTenant(ctx, (tx) => this.boosts.runRule(tx, id, new Date()));
  }

  /**
   * Adayı onayla ya da reddet.
   *
   * ONAY PARA TAAHHÜDÜ. Bu yüzden `boost.approve` — kural yazma yetkisi olan
   * herkes onaylayamıyor.
   */
  @Post(':id/decision')
  @RequirePermissions('boost.approve')
  decide(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(boostDecisionSchema)) body: { approve: boolean },
  ): Promise<BoostRecord> {
    return this.boosts.decide(ctx, id, body.approve);
  }

  /**
   * Onaylanmışları platformda oluştur.
   *
   * `boost.approve` istiyor: onaylama ile oluşturma arasında ikinci bir karar
   * yok, dolayısıyla bu düğme fiilen onayın devamı. `boost.write` yetseydi,
   * onay yetkisi olmayan biri onaylanmış bir boost'u yayına alabilirdi.
   */
  @Post('create-approved')
  @RequirePermissions('boost.approve')
  async createApproved(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId') clientId: string,
  ): Promise<{ created: number; failed: number }> {
    return this.prisma.withTenant(ctx, (tx) => this.executor.createApproved(tx, clientId));
  }
}
