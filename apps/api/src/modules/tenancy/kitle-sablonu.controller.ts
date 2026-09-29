import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import {
  kitleSablonuInputSchema,
  varsayilanKitleInputSchema,
  type KitleSablonuInput,
  type KitleSablonuListesi,
  type KitleSablonuRecord,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { KitleSablonuService } from './kitle-sablonu.service';

const meta = (req: AuthedRequest) => ({
  ip: req.ip ?? null,
  userAgent: req.get('user-agent') ?? null,
  requestId: req.requestId,
});

/**
 * Kitle şablonları (Marka Merkezi Bölüm 4). Okuma `client.read` —
 * Hızlı Reklam da okuyor; yazma `client.write` (Bilgi Bankası ile aynı).
 */
@Controller('audience-templates')
export class KitleSablonuController {
  constructor(private readonly svc: KitleSablonuService) {}

  @Get()
  @RequirePermissions('client.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<KitleSablonuListesi> {
    return this.svc.list(ctx, clientId);
  }

  @Post()
  @RequirePermissions('client.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kitleSablonuInputSchema)) dto: KitleSablonuInput,
    @Req() req: AuthedRequest,
  ): Promise<KitleSablonuRecord> {
    return this.svc.create(ctx, dto, meta(req));
  }

  /*
   * `varsayilan` YOLU `:id`DEN ÖNCE: Nest yolları tanımlandığı sırayla
   * eşliyor ve `:id` önce gelseydi "varsayilan" bir kimlik sanılıp
   * ParseUUIDPipe'ta 400 dönerdi.
   */
  @Put('varsayilan')
  @HttpCode(204)
  @RequirePermissions('client.write')
  async varsayilan(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(varsayilanKitleInputSchema)) dto: { clientId: string; sablonId: string | null },
    @Req() req: AuthedRequest,
  ): Promise<void> {
    await this.svc.varsayilanYap(ctx, dto.clientId, dto.sablonId, meta(req));
  }

  @Put(':id')
  @RequirePermissions('client.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(kitleSablonuInputSchema)) dto: KitleSablonuInput,
    @Req() req: AuthedRequest,
  ): Promise<KitleSablonuRecord> {
    return this.svc.update(ctx, id, dto, meta(req));
  }

  @Delete(':id')
  @HttpCode(204)
  @RequirePermissions('client.write')
  async remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Req() req: AuthedRequest,
  ): Promise<void> {
    await this.svc.remove(ctx, clientId, id, meta(req));
  }
}
