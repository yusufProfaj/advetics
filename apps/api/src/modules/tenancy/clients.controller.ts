import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type TenantContext,
  type UpdateClientInput,
} from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { ClientsService } from './clients.service';

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId };
  }

  @Get()
  @RequirePermissions('client.read')
  list(@CurrentTenant() ctx: TenantContext) {
    return this.clients.list(ctx);
  }

  @Get(':id')
  @RequirePermissions('client.read')
  findOne(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findById(ctx, id);
  }

  @Post()
  @RequireOrgAdmin()
  @RequirePermissions('client.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createClientSchema)) dto: CreateClientInput,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.create(ctx, dto, this.meta(req));
  }

  @Patch(':id')
  @RequirePermissions('client.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateClientSchema)) dto: UpdateClientInput,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.update(ctx, id, dto, this.meta(req));
  }

  /** Arşivler — kalıcı silmez. Bkz. ClientsService.archive */
  @Delete(':id')
  @RequireOrgAdmin()
  @RequirePermissions('client.delete')
  archive(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.archive(ctx, id, this.meta(req));
  }
}
