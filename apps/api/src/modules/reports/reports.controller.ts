import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  reportQuerySchema,
  reportTemplateInputSchema,
  shareInputSchema,
  type ReportTemplateInput,
  type ReportTemplateSummary,
  type ReportData,
  type ReportQuery,
  type ShareInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, Public, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';
import { ReportTemplatesService } from './report-templates.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly shares: ShareService,
    private readonly templates: ReportTemplatesService,
  ) {}

  /** Panelden önizleme — oturumlu, RLS'li. */
  @Get('preview')
  @RequirePermissions('report.read')
  preview(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(reportQuerySchema)) query: ReportQuery,
  ): Promise<ReportData> {
    return this.reports.build(ctx, query);
  }

  /**
   * Paylaşım linki üretir.
   *
   * `report.share` ayrı bir yetki: raporu GÖRMEK ile onu dışarıya AÇMAK farklı
   * kararlar. Bir analist rapor okuyabilir ama müşteriye link gönderme yetkisi
   * hesap yöneticisinde olmalı.
   */
  /**
   * ŞABLON CRUD.
   *
   * `report.write` izni PERMISSIONS listesinde baştan beri tanımlıydı ve
   * HİÇBİR uca bağlı değildi — şablon yalnızca paylaşım linki üretilirken
   * sessizce oluşturuluyor, kullanıcı onu bir daha hiç göremiyordu.
   */
  @Get('templates')
  @RequirePermissions('report.read')
  listTemplates(@CurrentTenant() ctx: TenantContext): Promise<ReportTemplateSummary[]> {
    return this.templates.list(ctx);
  }

  @Post('templates')
  @RequirePermissions('report.write')
  createTemplate(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(reportTemplateInputSchema)) dto: ReportTemplateInput,
    @Req() req: RequestMeta,
  ): Promise<{ id: string }> {
    return this.templates.create(ctx, dto, meta(req));
  }

  @Patch('templates/:id')
  @RequirePermissions('report.write')
  updateTemplate(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Body(zodBody(reportTemplateInputSchema)) dto: ReportTemplateInput,
    @Req() req: RequestMeta,
  ): Promise<{ id: string }> {
    return this.templates.update(ctx, id, dto, meta(req));
  }

  /**
   * Şablonu siler. Yanıt KAÇ PAYLAŞIM LİNKİNİN gittiğini söylüyor:
   * `report_shares.template_id` ON DELETE CASCADE ve müşteriye gönderilmiş
   * bir rapor haber vermeden 404 olurdu.
   */
  @Delete('templates/:id')
  @RequirePermissions('report.write')
  deleteTemplate(
    @CurrentTenant() ctx: TenantContext,
    @Param('id') id: string,
    @Req() req: RequestMeta,
  ): Promise<{ deleted: true; revokedShares: number }> {
    return this.templates.remove(ctx, id, meta(req));
  }

  @Post('shares')
  @RequirePermissions('report.share')
  createShare(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(shareInputSchema)) body: ShareInput,
  ): Promise<{ token: string; id: string; expiresAt: Date | null }> {
    return this.shares.create(ctx, body);
  }

  @Delete('shares/:id')
  @RequirePermissions('report.share')
  async revokeShare(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ revoked: true }> {
    await this.shares.revoke(ctx, id);
    return { revoked: true };
  }

  /**
   * ANONİM okuma — müşteriye gönderilen link.
   *
   * `@Public()`: oturum yok. Erişim kontrolü token'ın kendisi ve tarih aralığı
   * paylaşım kaydından geliyor — istemcinin verdiği bir parametreyle
   * değiştirilemiyor.
   *
   * Yol `reports/shared/:token` altında ve token URL'de. Bu, linkin tarayıcı
   * geçmişine ve olası bir referrer başlığına düşmesi demek; kabul edilebilir
   * çünkü linkin tamamı zaten paylaşılmak üzere üretiliyor. Yine de rapor
   * sayfası `Referrer-Policy: no-referrer` ile servis ediliyor.
   */
  @Get('shared/:token')
  @Public()
  readShared(@Param('token') token: string): Promise<ReportData> {
    return this.shares.readByToken(token);
  }
}

/** İstek üstverisi — denetim kaydına giriyor. */
type RequestMeta = Request & { requestId?: string };

function meta(req: RequestMeta): { ip: string | null; userAgent: string | null; requestId: string | null } {
  return {
    ip: req.ip ?? null,
    userAgent: req.get?.('user-agent') ?? null,
    requestId: req.requestId ?? null,
  };
}
