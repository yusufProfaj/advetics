import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import {
  anahtarKelimeOnerSchema,
  rehberGuncelleSchema,
  rehberOlusturSchema,
  rehberYayinlaSchema,
  type AnahtarKelimeOnerisi,
  type MetinOnerisi,
  type RehberGuncelle,
  type RehberHazirligi,
  type RehberKaydi,
  type RehberListesi,
  type RehberProvaSonucu,
  type RehberYayinDurumu,
  type TenantContext,
  type YoutubeVideoListesi,
} from '@advetics/shared';
import type { z } from 'zod';
import { CurrentTenant, RequirePermissions } from '../../../common/decorators';
import { zodBody } from '../../../common/pipes/zod-validation.pipe';
import { RehberService } from './rehber.service';

/**
 * ADVCAMPAIGN REHBERİ UÇLARI (`packages/shared/src/reklam/rehber/api.ts`).
 *
 * `ReklamController`dan AYRI: rehber bağlantı modülüne (token kasası, Google
 * sağlayıcısı) ihtiyaç duyuyor ve reklam modülü eski modüllere bağlanmıyor.
 * Yetkiler mevcut reklam uçlarıyla aynı: okuma `bulk.read`, yazma
 * `bulk.write`, yayın `bulk.publish`. Müşteri hesabı bu uçlara erişmez.
 */
@Controller('reklam')
export class RehberController {
  constructor(private readonly rehber: RehberService) {}

  @Get('rehber/hazirlik')
  @RequirePermissions('bulk.read')
  hazirlik(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<RehberHazirligi> {
    return this.rehber.hazirlik(ctx, clientId);
  }

  @Get('rehber/youtube-videolari')
  @RequirePermissions('bulk.read')
  youtubeVideolari(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('kanalId', ParseUUIDPipe) kanalId: string,
  ): Promise<YoutubeVideoListesi> {
    return this.rehber.youtubeVideolari(ctx, clientId, kanalId);
  }

  @Get('rehberler')
  @RequirePermissions('bulk.read')
  listele(@CurrentTenant() ctx: TenantContext, @Query('clientId', ParseUUIDPipe) clientId: string): Promise<RehberListesi> {
    return this.rehber.listele(ctx, clientId);
  }

  @Post('rehberler')
  @RequirePermissions('bulk.write')
  olustur(@CurrentTenant() ctx: TenantContext, @Body(zodBody(rehberOlusturSchema)) dto: z.infer<typeof rehberOlusturSchema>): Promise<RehberKaydi> {
    return this.rehber.olustur(ctx, dto.clientId);
  }

  @Get('rehberler/:id')
  @RequirePermissions('bulk.read')
  oku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberKaydi> {
    return this.rehber.oku(ctx, id);
  }

  /** 409 = sürüm eski (başka sekme yazdı). */
  @Put('rehberler/:id')
  @RequirePermissions('bulk.write')
  guncelle(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(rehberGuncelleSchema)) dto: RehberGuncelle,
  ): Promise<RehberKaydi> {
    return this.rehber.guncelle(ctx, id, dto);
  }

  @Post('rehberler/:id/konum-esle')
  @RequirePermissions('bulk.write')
  konumEsle(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberKaydi> {
    return this.rehber.konumlariEsle(ctx, id);
  }

  @Post('rehberler/:id/anahtar-kelime-oner')
  @RequirePermissions('bulk.write')
  anahtarKelimeOner(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(anahtarKelimeOnerSchema)) dto: z.infer<typeof anahtarKelimeOnerSchema>,
  ): Promise<AnahtarKelimeOnerisi> {
    return this.rehber.anahtarKelimeOner(ctx, id, dto.tohumlar);
  }

  @Post('rehberler/:id/metin-oner')
  @RequirePermissions('bulk.write')
  metinOner(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<MetinOnerisi> {
    return this.rehber.metinOner(ctx, id);
  }

  @Post('rehberler/:id/prova')
  @RequirePermissions('bulk.write')
  prova(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberProvaSonucu> {
    return this.rehber.prova(ctx, id);
  }

  /** Son prova; hiç yapılmadıysa null. Meta provası kuyrukta koştuğu için sonucu burada okunur. */
  @Get('rehberler/:id/prova')
  @RequirePermissions('bulk.read')
  provaOku(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberProvaSonucu | null> {
    return this.rehber.provaOku(ctx, id);
  }

  @Post('rehberler/:id/yayinla')
  @RequirePermissions('bulk.publish')
  yayinla(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(rehberYayinlaSchema)) dto: z.infer<typeof rehberYayinlaSchema>,
  ): Promise<RehberYayinDurumu> {
    return this.rehber.yayinla(ctx, id, dto.icerikOzeti);
  }

  @Get('rehberler/:id/yayin')
  @RequirePermissions('bulk.read')
  yayin(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberYayinDurumu> {
    return this.rehber.yayinDurumu(ctx, id);
  }

  @Post('rehberler/:id/arsivle')
  @RequirePermissions('bulk.write')
  arsivle(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string): Promise<RehberKaydi> {
    return this.rehber.arsivle(ctx, id);
  }
}
