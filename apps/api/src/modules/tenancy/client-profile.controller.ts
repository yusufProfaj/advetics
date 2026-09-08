import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import {
  upsertClientProfileSchema,
  type ClientProfileRecord,
  type TenantContext,
  type UpsertClientProfileInput,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { ClientProfileService } from './client-profile.service';

/** Bilgi Bankası — müşterinin genel profili (Kütüphane altında). */
@Controller('client-profile')
export class ClientProfileController {
  constructor(private readonly profile: ClientProfileService) {}

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
