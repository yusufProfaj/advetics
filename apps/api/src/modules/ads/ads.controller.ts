import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
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
import { PrismaService } from '../../prisma/prisma.service';
import { KreatifAdresiService } from '../reports/kreatif-adresi.service';
import { kreatifGorseliAkit } from '../reports/kreatif-gorsel-akisi';
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
  constructor(
    private readonly ads: AdsService,
    private readonly prisma: PrismaService,
    private readonly adres: KreatifAdresiService,
  ) {}

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

  /**
   * ÖNİZLEME GÖRSELİ — kullanım anında tazelenir (2026-10-14). Saklanan Meta
   * CDN adresi birkaç günde ölüyor ve kart "görsel alınamadı" diyordu. Panel
   * önce saklanan adresi deniyor; yalnız o düşünce buraya geliyor, yani
   * platform çağrısı kırık görsel başına ve 10 dk önbellekli. Yetki
   * `insights.read`: önizlemeyi müşteri hesabı da görüyor (İyileştir'in
   * ucu `rule.read` istiyor ve müşteride yok). 200 + boş görsel DEĞİL:
   * 502 ve nedeni.
   */
  @Get(':id/gorsel')
  @RequirePermissions('insights.read')
  async gorsel(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const g = await kreatifGorseliAkit(this.prisma, this.adres, ctx, { adId: id }, 'reklam_onizleme_gorsel');
    res.setHeader('Content-Type', g.mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(g.bytes));
  }
}
