import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  degisiklikIsteSchema,
  planDegistirSchema,
  planEylemiSchema,
  planHazirlaSchema,
  planOnaylaSchema,
  planYenidenHazirlaSchema,
  uyumIsaretSchema,
  type DegisiklikIsteGirdisi,
  type OneriDurumu,
  type OneriKarti,
  type PilotBugun,
  type PilotHazirlaYaniti,
  type PilotKurulumYaniti,
  type PilotOneriListesi,
  type PilotPlanDetayi,
  type PilotPlanListesi,
  type PlanDegistirGirdisi,
  type PlanEylemiGirdisi,
  type PlanHazirlaGirdisi,
  type PlanOnaylaGirdisi,
  type PlanYenidenHazirlaGirdisi,
  type TenantContext,
  type UyumIsaretGirdisi,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { PilotPlanService } from './plan.service';
import { PilotService } from './pilot.service';

/**
 * Pilot uçları — `PILOT_UCLARI` (packages/shared/src/pilot/uclar.ts) TEK
 * KAYNAK. Her (yöntem, yol, izin) üçlüsü o listeyle birebir aynı;
 * `pilot-kayit.spec.ts` kaynak taramasıyla kilitliyor.
 *
 * BU TURDA YOK: `POST /pilot/oneriler/:id/uygula` ve `.../geri-al` (Tur 2,
 * platforma yazan iş). Listede duruyorlar, testte ADIYLA istisna.
 *
 * İzin dekoratörü kapının yarısı: rol (ajans/müşteri) ve durum kararı
 * serviste. Müşteri `strategy.read` ile `degisiklik-iste` çağırabiliyor
 * ama ajans çağıramıyor; bu ayrım izin değil rol.
 */
@Controller('pilot')
export class PilotController {
  constructor(
    private readonly plan: PilotPlanService,
    private readonly pilot: PilotService,
  ) {}

  @Get('planlar')
  @RequirePermissions('strategy.read')
  planlar(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<PilotPlanListesi> {
    return this.plan.listele(ctx, clientId);
  }

  @Post('planlar/hazirla')
  @RequirePermissions('strategy.write')
  hazirla(@CurrentTenant() ctx: TenantContext, @Body(zodBody(planHazirlaSchema)) dto: PlanHazirlaGirdisi): Promise<PilotHazirlaYaniti> {
    return this.plan.hazirla(ctx, dto);
  }

  @Get('planlar/:id')
  @RequirePermissions('strategy.read')
  detay(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<PilotPlanDetayi> {
    return this.plan.detay(ctx, id);
  }

  @Post('planlar/:id/yeniden-hazirla')
  @RequirePermissions('strategy.write')
  yenidenHazirla(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(planYenidenHazirlaSchema)) dto: PlanYenidenHazirlaGirdisi,
  ): Promise<PilotPlanDetayi> {
    return this.plan.yenidenHazirla(ctx, id, dto);
  }

  @Post('planlar/:id/degistir')
  @RequirePermissions('strategy.write')
  degistir(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(planDegistirSchema)) dto: PlanDegistirGirdisi,
  ): Promise<PilotPlanDetayi> {
    return this.plan.degistir(ctx, id, dto);
  }

  @Post('planlar/:id/uyum-isaret')
  @RequirePermissions('strategy.write')
  uyumIsaret(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(uyumIsaretSchema)) dto: UyumIsaretGirdisi,
  ): Promise<PilotPlanDetayi> {
    return this.plan.uyumIsaret(ctx, id, dto);
  }

  @Post('planlar/:id/eylem')
  @RequirePermissions('strategy.write')
  eylem(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(planEylemiSchema)) dto: PlanEylemiGirdisi,
  ): Promise<PilotPlanDetayi> {
    return this.plan.eylem(ctx, id, dto);
  }

  @Post('planlar/:id/degisiklik-iste')
  @RequirePermissions('strategy.read')
  degisiklikIste(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(degisiklikIsteSchema)) dto: DegisiklikIsteGirdisi,
  ): Promise<PilotPlanDetayi> {
    return this.plan.degisiklikIste(ctx, id, dto);
  }

  @Post('planlar/:id/onayla')
  @RequirePermissions('strategy.publish')
  onayla(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(planOnaylaSchema)) dto: PlanOnaylaGirdisi,
  ): Promise<PilotPlanDetayi> {
    return this.plan.onayla(ctx, id, dto);
  }

  @Get('planlar/:id/kurulum')
  @RequirePermissions('strategy.read')
  kurulum(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<PilotKurulumYaniti> {
    return this.plan.kurulum(ctx, id);
  }

  /** `@Res` ile ham bayt: Nest'in JSON serileştiricisi Buffer'ı nesneye çevirirdi. */
  @Get('planlar/:id/pdf')
  @RequirePermissions('strategy.read')
  async pdf(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const { bayt, dosyaAdi } = await this.plan.pdf(ctx, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi}"`);
    res.setHeader('Content-Length', String(bayt.byteLength));
    res.send(bayt);
  }

  @Get('bugun')
  @RequirePermissions('bulk.write')
  bugun(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<PilotBugun> {
    return this.pilot.bugun(ctx, clientId);
  }

  @Get('oneriler')
  @RequirePermissions('bulk.write')
  oneriler(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('durum') durum?: string,
  ): Promise<PilotOneriListesi> {
    return this.pilot.oneriler(ctx, clientId, (durum as OneriDurumu | undefined) ?? null);
  }

  @Post('oneriler/:id/gec')
  @RequirePermissions('bulk.write')
  gec(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<OneriKarti> {
    return this.pilot.gec(ctx, id);
  }
}
