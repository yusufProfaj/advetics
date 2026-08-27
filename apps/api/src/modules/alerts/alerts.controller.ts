import { Controller, Get } from '@nestjs/common';
import type { TenantContext, UyariYaniti } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { AlertsService } from './alerts.service';

/**
 * Uyarı bandının veri kaynağı.
 *
 * YETKİ `insights.read`: uyarılar müşterinin kendi hesaplarının durumunu
 * anlatıyor ve bu, verisini okuyabilen herkesin görmesi gereken bir bilgi.
 * Daha dar bir yetki istemek, müşterinin "veri neden gelmiyor" sorusunu
 * cevapsız bırakırdı.
 */
@Controller('alerts')
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get()
  @RequirePermissions('insights.read')
  list(@CurrentTenant() ctx: TenantContext): Promise<UyariYaniti> {
    return this.alerts.list(ctx);
  }
}
