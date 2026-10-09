import { Controller, Get, Query } from '@nestjs/common';
import {
  bekleyenIslerSorgusuSchema,
  type BekleyenIslerSorgusu,
  type BekleyenIslerYaniti,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodQuery } from '../../common/pipes/zod-validation.pipe';
import { GenelBakisService } from './genel-bakis.service';

/**
 * Genel Bakış'ın "bugün ne yapmalıyım" kutusu.
 *
 * KAPI `insights.read` — Genel Bakış'ın kendi kapısı. Tür başına yetki
 * (`BEKLEYEN_IS_YETKISI`) serviste: kapıyı türlerin en darına bağlamak,
 * müşteri hesabını (yalnız strateji onayı görür) kutudan tamamen dışarıda
 * bırakırdı.
 */
@Controller('genel-bakis')
export class GenelBakisController {
  constructor(private readonly genelBakis: GenelBakisService) {}

  @Get('bekleyenler')
  @RequirePermissions('insights.read')
  bekleyenler(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(bekleyenIslerSorgusuSchema)) sorgu: BekleyenIslerSorgusu,
  ): Promise<BekleyenIslerYaniti> {
    return this.genelBakis.bekleyenler(ctx, sorgu);
  }
}
