import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type TenantContext,
  type UpdateClientInput,
  clientSetupSchema,
  type ClientSetupInput,
  type ClientSetupResult,
  type ClientChannels,
} from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { ClientsService } from './clients.service';
import { ClientSetupService } from './client-setup.service';
import { ClientChannelsService } from './client-channels.service';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly setupService: ClientSetupService,
    private readonly channels: ClientChannelsService,
  ) {}

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

  /**
   * KURULUM SİHİRBAZI — müşteri, hesap atamaları ve giriş hesabı tek çağrıda.
   *
   * `POST /clients` DURUYOR ve kaldırılmadı: yalnızca müşteri açmak isteyen
   * (ya da API'yi kendi akışında kullanan) biri için hâlâ doğru uç. Sihirbaz
   * onun üzerine bir ADIM, yerine geçen bir şey değil.
   *
   * Aynı yetkiler: `client.write` + org yöneticisi. Sihirbaz hesap ataması ve
   * kullanıcı oluşturma da yapıyor, yani en geniş yetkiyi gerektiren adımın
   * altında kalmamalı.
   */
  @Post('setup')
  @RequireOrgAdmin()
  @RequirePermissions('client.write')
  setup(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(clientSetupSchema)) dto: ClientSetupInput,
    @Req() req: AuthedRequest,
  ): Promise<ClientSetupResult> {
    return this.setupService.setup(ctx, dto, this.meta(req));
  }

  /**
   * BAĞLI KANALLAR — bu workspace'in Meta Ads / Google Ads / Facebook /
   * Instagram / YouTube görünümü.
   *
   * `client.read` YETİYOR: yalnızca okuyor. Atama ayrı uçlarda ve
   * `connection.write` istiyor — müşteri hesabı kendi kanallarını görebilmeli
   * ama değiştirememeli.
   */
  @Get(':id/channels')
  @RequirePermissions('client.read')
  listChannels(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClientChannels> {
    return this.channels.list(ctx, id);
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
