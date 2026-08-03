import { Body, Controller, Get, NotFoundException, Post, Query, Req } from '@nestjs/common';
import { upsertBrandingSchema, type TenantContext, type UpsertBrandingInput } from '@advetics/shared';
import {
  CurrentTenant,
  Public,
  RequireOrgAdmin,
  RequirePermissions,
} from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { BrandingService } from './branding.service';

@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  /** Panelde gösterilecek etkin marka (aktif müşteri → org varsayılanı). */
  @Get()
  @RequirePermissions('branding.read')
  resolve(@CurrentTenant() ctx: TenantContext, @Query('clientId') clientId?: string) {
    return this.branding.resolve(ctx, clientId ?? ctx.activeClientId);
  }

  @Post()
  @RequireOrgAdmin()
  @RequirePermissions('branding.write')
  upsert(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(upsertBrandingSchema)) dto: UpsertBrandingInput,
    @Req() req: AuthedRequest,
  ) {
    return this.branding.upsert(ctx, dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
    });
  }

  /**
   * Custom domain → marka çözümlemesi.
   *
   * Next.js middleware'i, `rapor.musterim.com` isteğinde hangi markayı
   * göstereceğini buradan öğrenir. Oturum yoktur; yalnızca DOĞRULANMIŞ
   * domain'ler yanıtlanır ve dönen veri markalama ile sınırlıdır.
   */
  @Public()
  @Get('by-domain')
  async byDomain(@Query('host') host?: string) {
    if (!host) throw new NotFoundException('Alan adı belirtilmedi');
    const result = await this.branding.resolveByDomain(host);
    if (!result) throw new NotFoundException('Bu alan adı için doğrulanmış marka bulunamadı');
    return result;
  }
}
