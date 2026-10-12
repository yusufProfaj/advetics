import { Body, Controller, ForbiddenException, Get, Post, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import {
  haftalikOzetPlaniSchema,
  ozetDenemeSchema,
  ozetOnizlemeSorgusuSchema,
  type HaftalikOzetOnizleme,
  type HaftalikOzetPlani,
  type HaftalikOzetPlaniGirdisi,
  type OzetKitlesi,
  type OzetOnizlemeSorgusu,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { RaporPlaniService } from '../reports/rapor-plani.service';
import { HaftalikOzetService } from './haftalik-ozet.service';

const planSorgusuSchema = z.object({ clientId: z.string().uuid() });

/**
 * HAFTALIK ÖZET UÇLARI — yol ve izin `OZET_UCLARI` (shared) ile BİREBİR;
 * `haftalik-ozet-kayit.spec.ts` kaynak taramasıyla karşılaştırıyor. İzin
 * düz dize: kayarsa TypeScript susar.
 *
 * `kitle=ajans` ek izni (`rule.read`) uçta değil SERVİSTE: aynı uç iki
 * kitleye hizmet ediyor ve dekoratör yalnız tek izin taşıyabiliyor.
 */
@Controller('haftalik-ozet')
export class HaftalikOzetController {
  constructor(
    private readonly ozet: HaftalikOzetService,
    private readonly planlar: RaporPlaniService,
  ) {}

  @Get('onizleme')
  @RequirePermissions('report.read')
  onizleme(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(ozetOnizlemeSorgusuSchema)) sorgu: OzetOnizlemeSorgusu,
  ): Promise<HaftalikOzetOnizleme> {
    return this.ozet.onizleme(ctx, sorgu);
  }

  @Get('plan')
  @RequirePermissions('report.share')
  plan(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(planSorgusuSchema)) sorgu: { clientId: string },
  ): Promise<HaftalikOzetPlani> {
    erisim(ctx, sorgu.clientId);
    return this.planlar.ozetPlani(ctx, sorgu.clientId);
  }

  @Put('plan')
  @RequirePermissions('report.share')
  planKaydet(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(haftalikOzetPlaniSchema)) dto: HaftalikOzetPlaniGirdisi,
  ): Promise<HaftalikOzetPlani> {
    erisim(ctx, dto.clientId);
    return this.planlar.ozetPlaniKaydet(ctx, dto);
  }

  @Post('deneme')
  @RequirePermissions('report.share')
  deneme(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ozetDenemeSchema)) dto: { clientId: string; kitle: OzetKitlesi },
  ): Promise<{ to: string[]; reddedilen: Array<{ adres: string; sebep: string }>; hafta: string }> {
    return this.ozet.deneme(ctx, dto);
  }
}

/** Başka workspace 403, boş cevap değil (Genel Bakış deseni). */
function erisim(ctx: TenantContext, clientId: string): void {
  if (!ctx.clientIds.includes(clientId)) throw new ForbiddenException('Bu workspace’e erişimin yok');
}
