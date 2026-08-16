import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  creativeInputSchema,
  simpleDraftInputSchema,
  type DraftCampaignRecord,
  type CreativeInput,
  type CreativeRecord,
  type DraftGroupRecord,
  type PublishCheck,
  type SimpleDraftInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CreativeService } from './creative.service';
import { DraftPublishService } from './draft-publish.service';
import { DraftTreeService } from './draft-tree.service';

/**
 * Kampanya taslağı ağacı uç noktaları.
 *
 * YETKİLER `bulk.*` — mevcut reklam oluşturucuyla aynı. İkisi de aynı işi
 * yapıyor (reklam üretmek) ve ayrı bir yetki seti tanımlamak, yöneticinin
 * "eski oluşturucuyu kapattım ama yenisinden açabiliyor" gibi bir boşlukla
 * karşılaşması demek olurdu.
 *
 * YOL `/draft-campaigns`, `/ad-drafts` DEĞİL. İki tablo bir süre yan yana
 * yaşayacak (tasarım belgesi K11) ve aynı yolu paylaşmaları, hangi uç noktanın
 * hangi modele yazdığını belirsiz bırakırdı.
 */
@Controller('draft-campaigns')
export class DraftTreeController {
  constructor(
    private readonly tree: DraftTreeService,
    private readonly publisher: DraftPublishService,
  ) {}

  /**
   * Müşterinin taslakları — GRUPLANMIŞ.
   *
   * Kullanıcı iki kampanya değil bir kampanya kurduğunu düşünüyor; aynı
   * niyetin iki platformdaki hâli tek satırda dönüyor ama durumları ayrı
   * duruyor.
   */
  @Get()
  @RequirePermissions('bulk.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<DraftGroupRecord[]> {
    return this.tree.list(ctx, clientId);
  }

  @Get(':id')
  @RequirePermissions('bulk.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DraftCampaignRecord> {
    return this.tree.get(ctx, id);
  }

  /** Bir niyetin bütün platformlardaki hâli — kısmi başarıyı gösteren yol. */
  @Get(':id/group')
  @RequirePermissions('bulk.read')
  getGroup(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DraftGroupRecord> {
    return this.tree.getGroup(ctx, id);
  }

  /**
   * Basit yüzeyden ağaç kurar.
   *
   * Kullanıcı hedefi ve bütçeyi söylüyor; kampanya, reklam grubu ve reklam
   * sunucuda üretiliyor. Meta'nın sorduğu hiçbir soru arayüze çıkmıyor.
   */
  @Post('simple')
  @RequirePermissions('bulk.write')
  createSimple(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(simpleDraftInputSchema)) input: SimpleDraftInput,
  ): Promise<DraftGroupRecord> {
    return this.tree.createFromSimple(ctx, input);
  }

  /** Yayın öncesi kontrol — engelleyenler, uyarılar ve yuva kapsaması. */
  @Get(':id/check')
  @RequirePermissions('bulk.read')
  check(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<PublishCheck> {
    return this.publisher.check(ctx, id);
  }

  /** Tek platform kampanyasını yayınlar. */
  @Post(':id/publish')
  @RequirePermissions('bulk.write')
  publish(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DraftCampaignRecord> {
    return this.publisher.publish(ctx, id);
  }

  /**
   * Niyetin bütün platformlarını yayınlar — her biri BAĞIMSIZ.
   *
   * HATA FIRLATMIYOR: Meta çıkıp Google düştüğünde tek bir hata döndürmek,
   * yayına girmiş ve o anda para harcamaya başlamış Meta kampanyasını
   * kullanıcıdan gizlemek olurdu. Yanıt her platformun kendi durumunu
   * taşıyor.
   */
  @Post(':id/publish-group')
  @RequirePermissions('bulk.write')
  publishGroup(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<DraftGroupRecord> {
    return this.publisher.publishGroup(ctx, id);
  }

  @Delete(':id')
  @RequirePermissions('bulk.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tree.remove(ctx, id);
  }
}

/**
 * Kreatif kütüphanesi uç noktaları.
 *
 * AYRI KONTROLCÜ çünkü yolu ayrı: kreatif bir kampanyaya ait değil, müşteriye
 * ait. `/draft-campaigns/:id/creatives` gibi bir yol, kreatifin ömrünü
 * kampanyaya bağlıymış gibi gösterirdi — oysa varlık sebebi tam tersi.
 */
@Controller('creatives')
export class CreativeController {
  constructor(private readonly creatives: CreativeService) {}

  @Get()
  @RequirePermissions('bulk.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<CreativeRecord[]> {
    return this.creatives.list(ctx, clientId);
  }

  @Get(':id')
  @RequirePermissions('bulk.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<CreativeRecord> {
    return this.creatives.get(ctx, id);
  }

  @Post()
  @RequirePermissions('bulk.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(creativeInputSchema)) input: CreativeInput,
  ): Promise<CreativeRecord> {
    return this.creatives.create(ctx, input);
  }

  @Delete(':id')
  @RequirePermissions('bulk.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.creatives.remove(ctx, id);
  }
}
