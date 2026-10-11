import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { hazirlamaCevapSchema, type HazirlamaCevabi, type HazirlamaYaniti, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { HazirlamaService } from './hazirlama.service';

/**
 * Hazır workspace (HAZIR-WORKSPACE-PLANI.md § Dalga 3). Okuma hazırlığı da
 * TETİKLER (imza değiştiyse): hesap atandıktan sonra bölüm açıldığında iş
 * kendiliğinden koşar.
 */
@Controller('clients')
export class HazirlamaController {
  constructor(private readonly hazirlama: HazirlamaService) {}

  @Get(':id/hazirlama')
  @RequirePermissions('client.read')
  oku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<HazirlamaYaniti> {
    return this.hazirlama.oku(ctx, id);
  }

  @Post(':id/hazirlama')
  @RequirePermissions('client.write')
  yeniden(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<HazirlamaYaniti> {
    return this.hazirlama.yeniden(ctx, id);
  }

  @Post(':id/hazirlama/cevap')
  @RequirePermissions('client.write')
  cevap(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(hazirlamaCevapSchema)) dto: HazirlamaCevabi,
  ): Promise<HazirlamaYaniti> {
    return this.hazirlama.cevap(ctx, id, dto);
  }
}
