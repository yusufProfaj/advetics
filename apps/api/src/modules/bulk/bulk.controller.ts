import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  bulkBatchInputSchema,
  type BulkBatchDetail,
  type BulkBatchInput,
  type BulkBatchRecord,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { BulkService } from './bulk.service';

/**
 * Modül 8 — Toplu Oluşturucu uç noktaları.
 *
 * ÜÇ AYRI YETKİ:
 *   · `bulk.read`    — partileri görmek
 *   · `bulk.write`   — parti oluşturmak (doğrulama dâhil, platform yok)
 *   · `bulk.publish` — PLATFORMA YAZMAK
 *
 * Yayınlama ayrı çünkü 60 reklam oluşturmak geri alınması zor bir iş:
 * silinmeleri gerekirse Ads Manager'dan tek tek.
 */
@Controller('bulk')
export class BulkController {
  constructor(private readonly bulk: BulkService) {}

  @Get()
  @RequirePermissions('bulk.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId') clientId: string,
  ): Promise<BulkBatchRecord[]> {
    return this.bulk.list(ctx, clientId);
  }

  @Get(':id')
  @RequirePermissions('bulk.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<BulkBatchDetail> {
    return this.bulk.get(ctx, id);
  }

  /**
   * Parti oluştur — DOĞRULAMA DÂHİL, platforma dokunmadan.
   *
   * `bulk.write` yetiyor: bu adım hiçbir şey oluşturmuyor, yalnızca
   * yapıştırılan tabloyu kaydedip sorunları işaretliyor.
   */
  @Post()
  @RequirePermissions('bulk.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(bulkBatchInputSchema)) input: BulkBatchInput,
  ): Promise<BulkBatchDetail> {
    return this.bulk.create(ctx, input);
  }

  /**
   * Partiyi platformda YAYINLA.
   *
   * `bulk.publish` — ayrı yetki. Reklamlar PAUSED açılıyor ama yine de
   * platformda 60 varlık oluşuyor ve geri almak tek tek silmek demek.
   */
  @Post(':id/publish')
  @RequirePermissions('bulk.publish')
  publish(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ published: number; failed: number; skipped: number }> {
    return this.bulk.publish(ctx, id);
  }

  @Delete(':id')
  @RequirePermissions('bulk.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.bulk.remove(ctx, id);
  }
}
