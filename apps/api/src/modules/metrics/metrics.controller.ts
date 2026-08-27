import { Controller, Get, Query } from '@nestjs/common';
import {
  breakdownQuerySchema,
  clientBreakdownQuerySchema,
  metricsQuerySchema,
  type BreakdownQuery,
  type ClientBreakdownQuery,
  type MetricsClientRow,
  type MetricsBreakdownRow,
  type MetricsQuery,
  type MetricsSummary,
  type MetricsTimeseries,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import { MetricsService } from './metrics.service';

/**
 * Unified Dashboard veri uç noktaları.
 *
 * Üçe ayrılmalarının sebebi önbellekleme ve gecikme: özet kartları hemen
 * gelmeli, grafik ve tablo ise daha ağır. Tek uç noktada birleştirmek en
 * yavaş sorgunun tüm ekranı bekletmesi demek olurdu.
 *
 * Hepsi `insights.read` izni ve tenant bağlamı istiyor; RLS son savunma hattı
 * olarak servis katmanında ayrıca uygulanıyor.
 */
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('summary')
  @RequirePermissions('insights.read')
  summary(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(metricsQuerySchema)) query: MetricsQuery,
  ): Promise<MetricsSummary> {
    return this.metrics.summary(ctx, query);
  }

  /**
   * Veri kapsamı — "Tüm zamanlar" ön ayarının dayanağı.
   *
   * Tarih parametreleri şemadan geliyor ama SORGUDA KULLANILMIYOR: uç, aralık
   * değil hesap/platform süzgeci için bağlam istiyor. Ayrı bir şema yazmak,
   * aynı süzgeci ikinci kez tanımlamak olurdu.
   */
  @Get('coverage')
  @RequirePermissions('insights.read')
  coverage(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(metricsQuerySchema)) query: MetricsQuery,
  ): Promise<{ earliestDate: string | null; latestDate: string | null }> {
    return this.metrics.coverage(ctx, query);
  }

  @Get('timeseries')
  @RequirePermissions('insights.read')
  timeseries(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(metricsQuerySchema)) query: MetricsQuery,
  ): Promise<MetricsTimeseries> {
    return this.metrics.timeseries(ctx, query);
  }

  /**
   * MÜŞTERİ KIRILIMI — "Tüm müşteriler" görünümünün tablosu.
   *
   * Ayrı bir uç, `breakdown`ın bir seviyesi DEĞİL: müşteri satırı varlık
   * satırından farklı alanlar taşıyor (kaç hesap izlemede, platform dağılımı,
   * hangi workspace'e geçileceği) ve varlık alanlarının (dış kimlik, üst
   * varlık, platformdaki durum) hiçbiri müşteride yok.
   */
  @Get('clients')
  @RequirePermissions('insights.read')
  byClient(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(clientBreakdownQuerySchema)) query: ClientBreakdownQuery,
  ): Promise<MetricsClientRow[]> {
    return this.metrics.byClient(ctx, query);
  }

  @Get('breakdown')
  @RequirePermissions('insights.read')
  breakdown(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(breakdownQuerySchema)) query: BreakdownQuery,
  ): Promise<MetricsBreakdownRow[]> {
    return this.metrics.breakdown(ctx, query);
  }
}
