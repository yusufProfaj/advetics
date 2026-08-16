import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  simpleDraftInputSchema,
  type DraftCampaignRecord,
  type DraftGroupRecord,
  type SimpleDraftInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
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
  constructor(private readonly tree: DraftTreeService) {}

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

  @Delete(':id')
  @RequirePermissions('bulk.write')
  remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.tree.remove(ctx, id);
  }
}
