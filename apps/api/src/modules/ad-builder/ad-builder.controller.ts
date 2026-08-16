import {
  Body,
  Controller,
  GoneException,
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
 * EMEKLİ AKIŞ — YALNIZCA OKUMA.
 *
 * Bu oluşturucu 2026-08-16'da emekliye ayrıldı; yerini kampanya taslağı ağacı
 * aldı (`/draft-campaigns`). Yazma uçları açık bir hatayla reddediyor.
 *
 * NEDEN SİLİNMEDİ: `ad_drafts` tablosunda üretim verisi var ve satır sayısı
 * bilinmiyor. Okuma yolları duruyor ki geçmiş kaybolmasın — panel eski
 * taslakları salt okunur bir bölümde gösteriyor.
 *
 * NEDEN YAZMA KAPATILDI: arayüzden erişilemiyor olması yetmez. Açık bir uç,
 * bir gün başka bir ekrandan ya da bir betikten sessizce yeniden kullanılır ve
 * o taslak yeni akışın hiçbir kontrolünden geçmez — özel reklam kategorisi
 * beyanı dahil.
 */

/**
 * Reklam Oluşturucu uç noktaları.
 *
 * YETKİLER TOPLU OLUŞTURUCUYLA PAYLAŞILIYOR (`bulk.*`). İkisi de aynı işi
 * yapıyor — reklam üretmek — ve ayrı bir yetki seti tanımlamak, yöneticinin
 * "toplu oluşturmayı kapattım ama tek tek oluşturabiliyor" gibi bir boşlukla
 * karşılaşması demek olurdu.
 */
/**
 * Emekli akışın yazma uçlarında dönen mesaj.
 *
 * 410 GONE, 404 DEĞİL: kaynak vardı ve bilerek kaldırıldı. 404 "yanlış adres"
 * dedirtirdi ve çağıran tarafı yolu düzeltmeye çalıştırırdı.
 */
const EMEKLI_MESAJ =
  'Bu reklam oluşturucu emekliye ayrıldı. Yeni akış: Reklamlar ekranından ' +
  'Hızlı Reklam ya da Kampanya Kur. Eski taslaklar silinmedi, salt okunur ' +
  'olarak duruyor.';

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
    void ctx;
    void input;
    throw new GoneException(EMEKLI_MESAJ);
  }

  @Put(':id')
  @RequirePermissions('bulk.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(adDraftInputSchema)) input: AdDraftInput,
  ): Promise<AdDraftRecord> {
    void ctx;
    void id;
    void input;
    throw new GoneException(EMEKLI_MESAJ);
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
    void ctx;
    void id;
    void file;
    throw new GoneException(EMEKLI_MESAJ);
  }

  /**
   * Kütüphaneden görsel ekler.
   *
   * AYRI UÇ NOKTA, yükleme ucunun bir varyantı değil: burada dosya gövdesi
   * yok, yalnızca bir kimlik var. Aynı uca iki farklı gövde biçimi kabul
   * ettirmek (multipart ya da JSON) hangi yolun çalıştığını belirsizleştirirdi.
   */
  @Post(':id/assets/from-library')
  @RequirePermissions('bulk.write')
  attachFromLibrary(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('assetId', ParseUUIDPipe) assetId: string,
  ): Promise<AdAssetRecord> {
    void ctx;
    void id;
    void assetId;
    throw new GoneException(EMEKLI_MESAJ);
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
    void ctx;
    void id;
    throw new GoneException(EMEKLI_MESAJ);
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
