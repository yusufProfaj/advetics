import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import { z } from 'zod';
import {
  upsertClientProfileSchema,
  type BilgiBankasiTaslak,
  type ClientProfileRecord,
  type TenantContext,
  type UpsertClientProfileInput,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { ClientProfileService } from './client-profile.service';
import { BilgiBankasiAiService } from './bilgi-bankasi-ai.service';

const aiTaslakSchema = z.object({ clientId: z.string().uuid() });

/** Bilgi Bankası — müşterinin genel profili (Kütüphane altında). */
@Controller('client-profile')
export class ClientProfileController {
  constructor(
    private readonly profile: ClientProfileService,
    private readonly ai: BilgiBankasiAiService,
  ) {}

  /**
   * ═══ TEK TUŞLA TASLAK ═══
   *
   * İşletmenin KENDİ sitesini okuyup bilgi bankası alanlarını dolduruyor.
   * Kaynak modelin belleği değil site: modelden bir markayı "hatırlamasını"
   * istemek, makul görünen ama yanlış cümleler üretiyor ve o cümleler
   * buradan reklam metnine geçiyor.
   *
   * KAYDETMİYOR — taslağı döndürüyor. `client.write` yine de isteniyor: bu
   * uç dışarı HTTP isteği yapıyor ve model çağırıyor, yani okuma yetkisiyle
   * aynı kefeye konamaz.
   */
  @Post('ai-taslak')
  @RequirePermissions('client.write')
  aiTaslak(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(aiTaslakSchema)) body: { clientId: string },
  ): Promise<BilgiBankasiTaslak> {
    return this.ai.taslak(ctx, body.clientId);
  }

  @Get()
  @RequirePermissions('client.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId') clientId: string,
  ): Promise<ClientProfileRecord> {
    return this.profile.get(ctx, clientId);
  }

  @Post()
  @RequirePermissions('client.write')
  upsert(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(upsertClientProfileSchema)) dto: UpsertClientProfileInput,
    @Req() req: AuthedRequest,
  ): Promise<ClientProfileRecord> {
    return this.profile.upsert(ctx, dto, {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
    });
  }
}
