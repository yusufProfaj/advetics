import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  sinyalKapatSchema,
  sinyalListeSorgusuSchema,
  sinyalUygulaSchema,
  type Sinyal,
  type SinyalKapatGirdisi,
  type SinyalListeSorgusu,
  type SinyalListesi,
  type SinyalUygulaGirdisi,
  type SinyalUygulamaSonucu,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, CurrentUser, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import type { RequestActor } from '../../common/types/request';
import { SinyalService } from './sinyal.service';

/**
 * SİNYAL UÇLARI — yol ve izin `SINYAL_UCLARI` (shared/sinyal/uclar.ts) ile
 * BİREBİR; `sinyal-kayit.spec.ts` kaynak taramasıyla karşılaştırıyor. İzin
 * düz dize: kayarsa TypeScript susar ve müşteri hesabı ekranı açar.
 */
@Controller('sinyaller')
export class SinyalController {
  constructor(private readonly sinyal: SinyalService) {}

  @Get()
  @RequirePermissions('rule.read')
  liste(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(sinyalListeSorgusuSchema)) sorgu: SinyalListeSorgusu,
  ): Promise<SinyalListesi> {
    return this.sinyal.liste(ctx, sorgu);
  }

  @Get(':id')
  @RequirePermissions('rule.read')
  tek(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<Sinyal> {
    return this.sinyal.tek(ctx, id);
  }

  @Post(':id/kapat')
  @RequirePermissions('rule.write')
  kapat(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(sinyalKapatSchema)) dto: SinyalKapatGirdisi,
  ): Promise<Sinyal> {
    return this.sinyal.kapat(ctx, id, dto.not);
  }

  @Post(':id/geri-ac')
  @RequirePermissions('rule.write')
  geriAc(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<Sinyal> {
    return this.sinyal.geriAc(ctx, id);
  }

  @Post(':id/uygula')
  @RequirePermissions('budget.write')
  uygula(
    @CurrentTenant() ctx: TenantContext,
    @CurrentUser() actor: RequestActor | undefined,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(sinyalUygulaSchema)) dto: SinyalUygulaGirdisi,
  ): Promise<SinyalUygulamaSonucu> {
    return this.sinyal.uygula(ctx, actor?.fullName ?? 'Bilinmeyen kullanıcı', id, dto.ozet);
  }
}
