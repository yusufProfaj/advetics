import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import type { ReklamHazirligi, TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { ReklamHazirlikService } from './hazirlik.service';

/**
 * Yeni reklam modülünün uçları. Önek `reklam`: eski `ad-builder`,
 * `draft-tree`, `bulk` uçlarından AYRI; ikisi aynı anda yaşayacak ve
 * Aşama 7'de eskiler silinecek.
 *
 * Okuma da `bulk.write` istiyor: hazırlık yalnızca reklam KURACAK kişinin
 * işi ve eski reklam oluşturma sayfası da aynı izinle açılıyor.
 */
@Controller('reklam')
export class ReklamController {
  constructor(private readonly hazirlik: ReklamHazirlikService) {}

  @Get('hazirlik')
  @RequirePermissions('bulk.write')
  hazirlikOku(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<ReklamHazirligi> {
    return this.hazirlik.oku(ctx, clientId);
  }
}
