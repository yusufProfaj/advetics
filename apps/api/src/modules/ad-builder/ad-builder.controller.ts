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
  MAX_IMAGE_BYTES,
  adDraftInputSchema,
  type AdAssetRecord,
  type AdDraftInput,
  type AdDraftRecord,
  type PublishCheck,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { AdBuilderService } from './ad-builder.service';
import { AdPublisherService } from './ad-publisher.service';

/**
 * Reklam Oluşturucu uç noktaları.
 *
 * YETKİLER TOPLU OLUŞTURUCUYLA PAYLAŞILIYOR (`bulk.*`). İkisi de aynı işi
 * yapıyor — reklam üretmek — ve ayrı bir yetki seti tanımlamak, yöneticinin
 * "toplu oluşturmayı kapattım ama tek tek oluşturabiliyor" gibi bir boşlukla
 * karşılaşması demek olurdu.
 */
@Controller('ad-drafts')
export class AdBuilderController {
  constructor(
    private readonly drafts: AdBuilderService,
    private readonly publisher: AdPublisherService,
  ) {}

  @Get()
  @RequirePermissions('bulk.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AdDraftRecord[]> {
    return this.drafts.list(ctx, clientId);
  }

  @Get(':id')
  @RequirePermissions('bulk.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdDraftRecord> {
    return this.drafts.get(ctx, id);
  }

  @Get(':id/check')
  @RequirePermissions('bulk.read')
  check(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublishCheck> {
    return this.drafts.publishCheck(ctx, id);
  }

  @Post()
  @RequirePermissions('bulk.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(adDraftInputSchema)) input: AdDraftInput,
  ): Promise<AdDraftRecord> {
    return this.drafts.create(ctx, input);
  }

  @Put(':id')
  @RequirePermissions('bulk.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(adDraftInputSchema)) input: AdDraftInput,
  ): Promise<AdDraftRecord> {
    return this.drafts.update(ctx, id, input);
  }

  /**
   * Görsel yükleme.
   *
   * BELLEKTE tutuluyor (`memoryStory` varsayılanı), diske multer yazmıyor:
   * doğrulama içeriği okumayı gerektiriyor ve reddedilen bir dosyayı önce
   * diske yazıp sonra silmek gereksiz. Sınır burada da veriliyor — multer'ın
   * kendi sınırı olmadan 2 GB'lık bir dosya belleğe alınırdı.
   */
  @Post(':id/assets')
  @RequirePermissions('bulk.write')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_IMAGE_BYTES } }))
  addAsset(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer },
  ): Promise<AdAssetRecord> {
    return this.drafts.addAsset(ctx, id, file);
  }

  /**
   * Görsel önizleme.
   *
   * DOSYA DOĞRUDAN SERVİS EDİLMİYOR — nginx ile statik sunmak, yükleme
   * dizinini herkese açık yapardı ve o dizinde müşterilerin henüz
   * yayınlamadığı kreatifleri var. Bu uç nokta kiracı kontrolünden geçiyor.
   */
  @Get(':id/assets/:assetId/preview')
  @RequirePermissions('bulk.read')
  async preview(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { bytes, mimeType } = await this.drafts.readAsset(ctx, id, assetId);
    res.setHeader('Content-Type', mimeType);
    // Özel önbellek: görsel kiracıya ait ve paylaşımlı bir önbellekte
    // durmamalı. `immutable` çünkü aynı kimlik hep aynı içeriği veriyor —
    // görsel değişirse yeni bir kimlik oluşuyor.
    res.setHeader('Cache-Control', 'private, max-age=3600, immutable');
    res.send(bytes);
  }

  @Delete(':id/assets/:assetId')
  @RequirePermissions('bulk.write')
  removeAsset(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<void> {
    return this.drafts.removeAsset(ctx, id, assetId);
  }

  /**
   * Yayınla — AYRI YETKİ (`bulk.publish`).
   *
   * Taslak yazmakla onu müşterinin hesabında yayınlamak farklı ağırlıkta
   * kararlar; kural motorundaki `rule.activate` ile aynı gerekçe.
   */
  @Post(':id/publish')
  @RequirePermissions('bulk.publish')
  publish(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<AdDraftRecord> {
    return this.publisher.publish(ctx, id);
  }

  @Delete(':id')
  @RequirePermissions('bulk.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.drafts.remove(ctx, id);
  }
}
