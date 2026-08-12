import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  leadQuerySchema,
  leadUpdateSchema,
  type LeadListResult,
  type LeadRecord,
  type LeadUpdateInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, Public, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { LeadgenWebhookService, type LeadgenPayload } from './leadgen-webhook.service';
import { LeadsService } from './leads.service';

/**
 * Potansiyel müşteriler + Meta leadgen webhook.
 *
 * İKİ FARKLI GÜVENLİK MODELİ TEK CONTROLLER'DA:
 *
 *   · `/leads/*` — normal oturum + yetki.
 *   · `/leads/webhook` — oturum YOK, kimlik doğrulama İMZAYLA.
 *
 * Aynı dosyada durmaları kasıtlı: webhook'un `@Public()` olduğu, yetki
 * kontrollü uçların hemen yanında görünüyor. Ayrı dosyada olsaydı biri
 * "burada niye yetki yok" diye sormadan geçebilirdi.
 */
@Controller('leads')
export class LeadsController {
  constructor(
    private readonly leads: LeadsService,
    private readonly webhook: LeadgenWebhookService,
  ) {}

  // ---------------------------------------------------------------------------
  // Webhook — OTURUM YOK, İMZA VAR
  // ---------------------------------------------------------------------------

  /**
   * Abonelik el sıkışması.
   *
   * Meta uç noktayı kaydederken bir `hub.challenge` gönderiyor ve onu AYNEN
   * geri bekliyor — JSON değil, düz metin. JSON dönmek el sıkışmayı
   * başarısız kılıyor ve abonelik hiç kurulmuyor.
   */
  @Public()
  @Get('webhook')
  @Header('Content-Type', 'text/plain')
  verify(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    return this.webhook.verifySubscription({ mode, token, challenge });
  }

  /**
   * Bildirim alımı.
   *
   * SIRA: imza → kuyruk → 200. Graph API'ye çağrı YOK.
   *
   * Meta birkaç saniyede yanıt bekliyor; gecikirse isteği başarısız sayıyor,
   * tekrar deniyor ve tekrarlar sürerse ABONELİĞİ KAPATIYOR. Kapatılan
   * abonelik hiçbir yerde hata üretmiyor — bildirimler sessizce durur ve
   * kimse fark etmez.
   */
  @Public()
  @Post('webhook')
  async receive(
    @Req() req: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    this.webhook.verifySignature(
      req.rawBody,
      req.headers['x-hub-signature-256'] as string | undefined,
    );

    await this.webhook.handle(req.body as LeadgenPayload);

    /**
     * HER ZAMAN 200 ve HER ZAMAN AYNI GÖVDE.
     *
     * Tanınmayan sayfa ya da eksik alan bir HATA DEĞİL bizim açımızdan:
     * 4xx dönmek Meta'ya "tekrar gönder" demek ve tekrar da aynı sonucu
     * verirdi — sonsuz tekrar, sonunda kapatılan abonelik. Sorunlar
     * loglanıyor, yanıt sabit.
     */
    return { received: true };
  }

  // ---------------------------------------------------------------------------
  // Panel
  // ---------------------------------------------------------------------------

  @Get()
  @RequirePermissions('lead.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query() query: Record<string, string>,
  ): Promise<LeadListResult> {
    return this.leads.list(ctx, leadQuerySchema.parse(query));
  }

  /**
   * CSV dışa aktarma — DENETİM KAYDINA YAZILIYOR.
   *
   * Kişisel veri sistemden çıkıyor ve dosya bir kez indirildikten sonra
   * silinemiyor, izlenemiyor. "Kim, ne zaman, kaç kişinin bilgisini aldı"
   * sorusunun cevabı olmalı; KVKK ihlali iddiasında tek dayanağımız bu.
   */
  @Get('export')
  @RequirePermissions('lead.export')
  async export(
    @CurrentTenant() ctx: TenantContext,
    @Query() query: Record<string, string>,
    @Res() res: Response,
  ): Promise<void> {
    // Denetim kaydını SERVİS yazıyor: orada kiracı işlemi ve gerçek satır
    // sayısı var. Controller'da yeniden saymak, CSV'yi ayrıştırmak demek.
    const csv = await this.leads.exportCsv(ctx, leadQuerySchema.parse(query));

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="potansiyel-musteriler.csv"`,
    );
    res.send(csv);
  }

  @Get(':id')
  @RequirePermissions('lead.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadRecord> {
    return this.leads.get(ctx, id);
  }

  @Put(':id')
  @RequirePermissions('lead.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(leadUpdateSchema)) body: LeadUpdateInput,
  ): Promise<LeadRecord> {
    return this.leads.update(ctx, id, body);
  }
}
