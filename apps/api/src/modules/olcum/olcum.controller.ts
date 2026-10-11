import { Body, Controller, Get, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { olcumBirincilYapSchema, type OlcumBirincilYap, type OlcumDurumuYaniti, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { OlcumService } from './olcum.service';

/**
 * Marka Merkezi › Ölçüm (docs/olcum/MIMARI.md). Okuma `client.read` (bölümün
 * kendisi gibi); platformda değişiklik yapan tek uç `client.write`.
 */
@Controller('olcum')
export class OlcumController {
  constructor(private readonly olcum: OlcumService) {}

  @Get()
  @RequirePermissions('client.read')
  durum(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('yenile') yenile?: string,
  ): Promise<OlcumDurumuYaniti> {
    return this.olcum.durum(ctx, clientId, yenile === '1');
  }

  @Post('birincil-yap')
  @RequirePermissions('client.write')
  birincilYap(@CurrentTenant() ctx: TenantContext, @Body(zodBody(olcumBirincilYapSchema)) dto: OlcumBirincilYap): Promise<OlcumDurumuYaniti> {
    return this.olcum.birincilYap(ctx, dto.clientId, dto.donusumId);
  }
}
