import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import {
  reportQuerySchema,
  shareInputSchema,
  type ReportData,
  type ReportQuery,
  type ShareInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, Public, RequirePermissions } from '../../common/decorators';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly shares: ShareService,
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
