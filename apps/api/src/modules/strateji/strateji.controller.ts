import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import {
  dagilimKaydetSchema,
  kelimeAraSchema,
  kelimeGuncelleSchema,
  matrisKaydetSchema,
  planEylemSchema,
  planOlusturSchema,
  planOnaySchema,
  type DagilimKaydetGirdisi,
  type DagilimOnerisi,
  type KelimeAraGirdisi,
  type KelimeGuncelleGirdisi,
  type MatrisKaydetGirdisi,
  type PlanDetayi,
  type PlanEylemGirdisi,
  type PlanListesi,
  type PlanOlusturGirdisi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { StratejiService } from './strateji.service';

/**
 * AdvStrategy uçları — `STRATEJI_UCLARI` (packages/shared/src/strateji/uclar.ts)
 * TEK KAYNAK. Her (yöntem, yol, izin) üçlüsü o listeyle birebir aynı;
 * `strateji-uclari.spec.ts` kaynak taramasıyla kilitliyor.
 *
 * BU TURDA YOK: `GET .../sezon` ve `GET .../pdf` (sonraki tur). Listede
 * duruyorlar, testte açıkça adı geçen istisna olarak.
 *
 * Gövde şemaları sözleşmeden; bu dosyada şema tanımı yok.
 */
@Controller('strateji')
export class StratejiController {
  constructor(private readonly strateji: StratejiService) {}

  @Get('planlar')
  @RequirePermissions('strategy.read')
  planlar(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<PlanListesi> {
    return this.strateji.listele(ctx, clientId);
  }

  @Post('planlar')
  @RequirePermissions('strategy.write')
  planOlustur(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(planOlusturSchema)) dto: PlanOlusturGirdisi,
  ): Promise<PlanDetayi> {
    return this.strateji.olustur(ctx, dto);
  }

  @Get('planlar/:id')
  @RequirePermissions('strategy.read')
  plan(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<PlanDetayi> {
    return this.strateji.detay(ctx, id);
  }

  @Put('planlar/:id/dagilim')
  @RequirePermissions('strategy.write')
  dagilim(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(dagilimKaydetSchema)) dto: DagilimKaydetGirdisi,
  ): Promise<PlanDetayi> {
    return this.strateji.dagilimKaydet(ctx, id, dto);
  }

  @Post('planlar/:id/dagilim-oner')
  @RequirePermissions('strategy.write')
  dagilimOner(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<DagilimOnerisi> {
    return this.strateji.dagilimOner(ctx, id);
  }

  @Put('planlar/:id/matris')
  @RequirePermissions('strategy.write')
  matris(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(matrisKaydetSchema)) dto: MatrisKaydetGirdisi,
  ): Promise<PlanDetayi> {
    return this.strateji.matrisKaydet(ctx, id, dto);
  }

  @Post('planlar/:id/kelime-ara')
  @RequirePermissions('strategy.write')
  kelimeAra(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(kelimeAraSchema)) dto: KelimeAraGirdisi,
  ): Promise<PlanDetayi> {
    return this.strateji.kelimeAra(ctx, id, dto);
  }

  @Patch('planlar/:id/kelimeler')
  @RequirePermissions('strategy.write')
  kelimeler(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(kelimeGuncelleSchema)) dto: KelimeGuncelleGirdisi,
  ): Promise<PlanDetayi> {
    return this.strateji.kelimeGuncelle(ctx, id, dto);
  }

  @Post('planlar/:id/eylem')
  @RequirePermissions('strategy.write')
  eylem(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(planEylemSchema)) dto: PlanEylemGirdisi,
  ): Promise<PlanDetayi> {
    return this.strateji.eylem(ctx, id, dto);
  }

  @Post('planlar/:id/onayla')
  @RequirePermissions('strategy.approve')
  onayla(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(planOnaySchema)) dto: { surum: number },
  ): Promise<PlanDetayi> {
    return this.strateji.onayla(ctx, id, dto.surum);
  }
}
