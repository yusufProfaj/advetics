import { Body, Controller, Post } from '@nestjs/common';
import {
  kitleOneriIstegiSchema,
  type KitleOneriIstegi,
  type KitleOnerisi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { KitleOnerisiService } from './kitle-onerisi.service';

/**
 * Doğal dilden kitle önerisi. `client.write` — Bilgi Bankası taslağıyla aynı
 * gerekçe: kaydetmiyor ama model ve Meta çağrısı yapıyor, okuma yetkisiyle
 * aynı kefeye konamaz. Yol `audience-templates` altında çünkü ekranı orası;
 * servis burada çünkü yapay zekâ istemcisi ve bağlantı servisi bu modülde.
 */
@Controller('audience-templates')
export class KitleOnerisiController {
  constructor(private readonly svc: KitleOnerisiService) {}

  @Post('ai-oneri')
  @RequirePermissions('client.write')
  oner(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kitleOneriIstegiSchema)) dto: KitleOneriIstegi,
  ): Promise<KitleOnerisi> {
    return this.svc.oner(ctx, dto.clientId, dto.metin);
  }
}
