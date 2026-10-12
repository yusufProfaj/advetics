import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import {
  kanalDogrulaSchema,
  kanalGuncelleSchema,
  kanalListeSorgusuSchema,
  kanalOlusturSchema,
  type BildirimGonderimi,
  type BildirimGonderimleriYaniti,
  type BildirimKanali,
  type BildirimKanallariYaniti,
  type KanalDogrulaGirdisi,
  type KanalGuncelleGirdisi,
  type KanalOlusturGirdisi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { BildirimService } from './bildirim.service';

/**
 * BİLDİRİM KANALI UÇLARI — `SINYAL_UCLARI` ile birebir (kaynak taramasıyla
 * kilitli). `GET gonderimler` sorgusu sözleşmede ayrı bir şema taşımıyor;
 * kanal listesiyle AYNI şekil (`clientId` zorunlu) ve aynı şemayla doğrulanıyor.
 */
@Controller('bildirim')
export class BildirimController {
  constructor(private readonly bildirim: BildirimService) {}

  @Get('kanallar')
  @RequirePermissions('rule.read')
  kanallar(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(kanalListeSorgusuSchema)) sorgu: { clientId: string },
  ): Promise<BildirimKanallariYaniti> {
    return this.bildirim.liste(ctx, sorgu.clientId);
  }

  @Post('kanallar')
  @RequirePermissions('client.write')
  olustur(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kanalOlusturSchema)) dto: KanalOlusturGirdisi,
  ): Promise<BildirimKanali> {
    return this.bildirim.olustur(ctx, dto);
  }

  @Patch('kanallar/:id')
  @RequirePermissions('client.write')
  guncelle(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(kanalGuncelleSchema)) dto: KanalGuncelleGirdisi,
  ): Promise<BildirimKanali> {
    return this.bildirim.guncelle(ctx, id, dto);
  }

  @Delete('kanallar/:id')
  @RequirePermissions('client.write')
  sil(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ id: string; silindi: true; iptalEdilenGonderim: number }> {
    return this.bildirim.sil(ctx, id);
  }

  @Post('kanallar/:id/dene')
  @RequirePermissions('client.write')
  dene(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<BildirimGonderimi> {
    return this.bildirim.dene(ctx, id);
  }

  @Post('kanallar/:id/dogrula')
  @RequirePermissions('client.write')
  dogrula(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(kanalDogrulaSchema)) dto: KanalDogrulaGirdisi,
  ): Promise<BildirimKanali> {
    return this.bildirim.dogrula(ctx, id, dto.geldi);
  }

  @Get('gonderimler')
  @RequirePermissions('rule.read')
  gonderimler(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(kanalListeSorgusuSchema)) sorgu: { clientId: string },
  ): Promise<BildirimGonderimleriYaniti> {
    return this.bildirim.gonderimler(ctx, sorgu.clientId);
  }
}
