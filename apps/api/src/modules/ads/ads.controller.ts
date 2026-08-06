import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import {
  adsExploreQuerySchema,
  metricsQuerySchema,
  type AdDetail,
  type AdsExploreQuery,
  type AdsExploreResult,
  type MetricsQuery,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import { AdsService } from './ads.service';

/**
 * Modül 4 — Ads Explorer.
 *
 * `insights.read` izni yeterli: bu uç noktalar yalnızca OKUYOR. Reklam
 * durumunu değiştirmek Modül 5'in konusu ve orada ayrı bir yetki var
 * (`rule.write`) — okuma ile yazmayı aynı izne bağlamak, rapor görmesi
 * gereken bir kullanıcıya kampanya durdurma hakkı vermek olurdu.
 */
@Controller('ads')
export class AdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  @RequirePermissions('insights.read')
  explore(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(adsExploreQuerySchema)) query: AdsExploreQuery,
  ): Promise<AdsExploreResult> {
    return this.ads.explore(ctx, query);
  }

  @Get(':id')
  @RequirePermissions('insights.read')
  detail(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(zodQuery(metricsQuerySchema)) query: MetricsQuery,
  ): Promise<AdDetail> {
    return this.ads.detail(ctx, id, query.from, query.to);
  }
}
