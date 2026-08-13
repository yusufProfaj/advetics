import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import {
  ASSET_KINDS,
  MAX_IMAGE_BYTES,
  assetQuerySchema,
  assetRenameSchema,
  type AssetKind,
  type AssetListResult,
  type AssetRecord,
  type AssetRenameInput,
  type AssetUploadResult,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { AssetsService } from './assets.service';

/**
 * Varlık arşivi uç noktaları.
 *
 * YETKİLER REKLAM OLUŞTURUCUYLA PAYLAŞILIYOR (`bulk.*`) — aynı gerekçe:
 * arşiv reklam üretiminin bir parçası ve ayrı bir yetki seti, yöneticinin
 * "reklam oluşturmayı kapattım ama görsel yükleyebiliyor" gibi bir boşlukla
 * karşılaşması demek olurdu.
 */
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Get()
  @RequirePermissions('bulk.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query() query: Record<string, string>,
  ): Promise<AssetListResult> {
    return this.assets.list(ctx, assetQuerySchema.parse(query));
  }

  /**
   * Önizleme — KİMLİK DOĞRULAMALI.
   *
   * Görseller müşteri verisi. Statik dosya sunucusundan servis etmek, anahtarı
   * bilen herkesin erişmesi demek olurdu; anahtar da URL'lerde dolaşıyor.
   */
  @Get(':id/preview')
  @RequirePermissions('bulk.read')
  async preview(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, mimeType } = await this.assets.bytes(ctx, id);
    res.setHeader('Content-Type', mimeType);
    // Değişmez içerik: aynı kimlik her zaman aynı baytları veriyor (yeni
    // yükleme yeni kayıt açıyor). Uzun önbellek güvenli.
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buffer);
  }

  @Post()
  @RequirePermissions('bulk.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  upload(
    @CurrentTenant() ctx: TenantContext,
    // `Express.Multer.File` yerine yapısal tip: @types/multer bu projede yok
    // ve reklam oluşturucu da aynı deseni kullanıyor.
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('kind') kind?: string,
    @Query('name') name?: string,
  ): Promise<AssetUploadResult> {
    return this.assets.upload(ctx, {
      clientId,
      // Tür verilmediyse reklam görseli: en sık durum ve logo bilinçli bir
      // seçim olmalı.
      kind: (ASSET_KINDS as readonly string[]).includes(kind ?? '')
        ? (kind as AssetKind)
        : 'image',
      fileName: file.originalname,
      mimeType: file.mimetype,
      bytes: file.buffer,
      name,
    });
  }

  @Put(':id')
  @RequirePermissions('bulk.write')
  rename(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(assetRenameSchema)) body: AssetRenameInput,
  ): Promise<AssetRecord> {
    return this.assets.rename(ctx, id, body.name);
  }

  @Delete(':id')
  @RequirePermissions('bulk.write')
  async remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.assets.remove(ctx, id);
    return { ok: true };
  }
}
