import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import {
  kurulumIstegiSchema,
  kurulumSecenekSorgusuSchema,
  type KurulumIstegi,
  type KurulumSecenekleri,
  type KurulumYaniti,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { KurulumService } from './kurulum.service';

interface IstekBilgisi {
  ip?: string;
  headers: Record<string, string | string[] | undefined>;
}

/**
 * Workspace kurulum rehberi (docs/kurulum/MIMARI.md). Okuma `client.read`;
 * platformda bir şey açan/yazan her uç `client.write`. Hesap açma ve atama
 * ayrıca `connection.write` istiyor (serviste).
 */
@Controller('clients/:id/kurulum')
export class KurulumController {
  constructor(private readonly kurulum: KurulumService) {}

  private meta(req: IstekBilgisi) {
    const ua = req.headers['user-agent'];
    return { ip: req.ip ?? null, userAgent: typeof ua === 'string' ? ua : null };
  }

  @Get()
  @RequirePermissions('client.read')
  oku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<KurulumYaniti> {
    return this.kurulum.oku(ctx, id);
  }

  @Get('secenekler')
  @RequirePermissions('client.read')
  secenekler(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Query('kod') kod: string): Promise<KurulumSecenekleri> {
    return this.kurulum.secenekler(ctx, id, kurulumSecenekSorgusuSchema.parse({ kod }).kod);
  }

  @Post('adim')
  @RequirePermissions('client.write')
  adim(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Body(zodBody(kurulumIstegiSchema)) dto: KurulumIstegi, @Req() req: IstekBilgisi) {
    return this.kurulum.adim(ctx, id, dto, this.meta(req));
  }

  @Post('tamamla')
  @RequirePermissions('client.write')
  tamamla(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string, @Req() req: IstekBilgisi) {
    return this.kurulum.tamamla(ctx, id, this.meta(req));
  }
}
