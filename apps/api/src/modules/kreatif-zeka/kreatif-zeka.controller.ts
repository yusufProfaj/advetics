import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  kreatifBriefIstegiSchema,
  kreatifZekaSorgusuSchema,
  type KreatifBrief,
  type KreatifBriefIstegi,
  type KreatifZekaSorgusu,
  type KreatifZekaYaniti,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { KreatifZekaService, type EtiketleYaniti } from './kreatif-zeka.service';

const etiketleSchema = z.object({ clientId: z.string().uuid() });

/**
 * KREATİF ZEKÂSI UÇLARI — yol ve izin `KREATIF_ZEKA_UCLARI` (shared) ile
 * BİREBİR; `kreatif-zeka-kayit.spec.ts` kaynak taramasıyla karşılaştırıyor.
 * İzin düz dize: kayarsa TypeScript susar ve müşteri hesabı (`rule.read`
 * yok) ekranı açar ya da (`sync.trigger` ile) Gemini'ye para harcatır.
 */
@Controller('kreatif-zeka')
export class KreatifZekaController {
  constructor(private readonly kz: KreatifZekaService) {}

  @Get()
  @RequirePermissions('rule.read')
  oku(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(kreatifZekaSorgusuSchema)) sorgu: KreatifZekaSorgusu,
  ): Promise<KreatifZekaYaniti> {
    return this.kz.oku(ctx, sorgu);
  }

  /**
   * GÖRSEL AKIŞI. Hata 200 + boş görsel DEĞİL: 502 ve nedeni ("sunucu
   * 403"); panel kartta onu yazıyor. Önbellek kısa ve özel: adres imzalı ve
   * ölüyor, tarayıcıda uzun tutmak ölü bir kopyayı saklamak olurdu.
   */
  @Get('kreatifler/:creativeId/gorsel')
  @RequirePermissions('rule.read')
  async gorsel(
    @CurrentTenant() ctx: TenantContext,
    @Param('creativeId', ParseUUIDPipe) creativeId: string,
    @Res() res: Response,
  ): Promise<void> {
    const g = await this.kz.gorsel(ctx, creativeId);
    res.setHeader('Content-Type', g.mime);
    res.setHeader('Cache-Control', 'private, max-age=600');
    res.send(Buffer.from(g.bytes));
  }

  @Post('etiketle')
  @RequirePermissions('rule.write')
  etiketle(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(etiketleSchema)) govde: z.infer<typeof etiketleSchema>,
  ): Promise<EtiketleYaniti> {
    return this.kz.etiketle(ctx, govde.clientId);
  }

  @Post('brief')
  @RequirePermissions('rule.write')
  brief(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kreatifBriefIstegiSchema)) istek: KreatifBriefIstegi,
  ): Promise<KreatifBrief> {
    return this.kz.brief(ctx, istek);
  }

  @Post('brief/:id/advcampaign')
  @RequirePermissions('bulk.write')
  advcampaign(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ oturumId: string; clientId: string }> {
    return this.kz.advcampaign(ctx, id);
  }
}
