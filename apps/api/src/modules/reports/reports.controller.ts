import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import {
  reportQuerySchema,
  reportSendSchema,
  type ReportMailDraft,
  type ReportSendInput,
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
import {
  raporPlaniInputSchema,
  FATURA_PLATFORMLARI,
  donemSchema,
  type FaturaOzeti,
  type FaturaPlatformu,
  type RaporPlaniInput,
  type RaporPlaniOzeti,
} from '@advetics/shared';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { ReportsService } from './reports.service';
import { ShareService } from './share.service';
import { ReportTemplatesService } from './report-templates.service';
import { RaporPdfService } from './rapor-pdf.service';
import { RaporGonderService } from './rapor-gonder.service';
import { RaporPlaniService } from './rapor-plani.service';
import { FaturaService } from './fatura.service';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly shares: ShareService,
    private readonly templates: ReportTemplatesService,
    private readonly pdfService: RaporPdfService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly gonderService: RaporGonderService,
    private readonly plans: RaporPlaniService,
    private readonly faturalar: FaturaService,
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
  /**
   * RAPOR PDF'İ — İNDİRME.
   *
   * Tarayıcı yazdırması yerine sunucuda üretiliyor: aynı belge e-posta EKİ
   * olarak da gidecek ve worker'da `window` yok. İki ayrı üretim yolu
   * olsaydı indirilen PDF ile müşteriye giden PDF ayrışırdı.
   *
   * DENETİM KAYDI: rapor organizasyonun dışına çıkıyor. Potansiyel müşteri
   * CSV'si bu emsali kurdu — "kim, ne zaman, hangi müşterinin raporunu
   * indirdi" sorusunun cevabı olmalı.
   */
  @Get('pdf')
  @RequirePermissions('report.read')
  async pdf(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(reportQuerySchema)) query: ReportQuery,
    @Req() req: RequestMeta,
    @Res() res: Response,
  ): Promise<void> {
    const data = await this.reports.build(ctx, query);
    const bayt = await this.pdfService.uret(data);

    /*
     * DENETİM ÜRETİMDEN SONRA, AYRI BİR TRANSACTION'DA.
     *
     * PDF üretimi saniyeler sürebiliyor ve `withTenant` etkileşimli bir
     * transaction açıyor — Prisma'nın sınırı 5 saniye. Üretimi transaction
     * içine almak, büyük bir raporda transaction'ın ölmesi ve denetim
     * kaydının da yazılamaması demek olurdu.
     */
    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: 'report.pdf_download',
        targetType: 'client',
        targetId: query.clientId,
        clientId: query.clientId,
        after: { from: query.from, to: query.to, bytes: bayt.byteLength },
        ...meta(req),
      }),
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${dosyaAdi(data)}"`);
    res.setHeader('Content-Length', String(bayt.byteLength));
    res.send(bayt);
  }

  /**
   * MAİL TASLAĞI — sayılar rapordan, anlatı şablondan.
   *
   * Sunucu üretip DOĞRUDAN GÖNDERMİYOR: "Urla bölgesindeki konut
   * aramalarında..." gibi cümleler veriden çıkarılamıyor ve uydurmak
   * müşteriye yanlış bir strateji anlatmak olurdu. Taslak ekranda
   * düzenleniyor.
   */
  @Get('mail-draft')
  @RequirePermissions('report.share')
  mailDraft(
    @CurrentTenant() ctx: TenantContext,
    @Query(zodQuery(reportQuerySchema)) query: ReportQuery,
  ): Promise<ReportMailDraft> {
    return this.gonderService.taslak(ctx, query);
  }

  /** Raporu müşteriye gönderir. Doğrulanmamış e-posta kimliğiyle reddediyor. */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('report.share')
  send(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(reportSendSchema)) dto: ReportSendInput,
    @Req() req: RequestMeta,
    /*
     * REDDEDİLEN ALICILAR YANITTA. nodemailer bazı alıcılar reddedilse bile
     * fırlatmıyor; ekran yalnızca `sent: true` görüp "gönderildi" yazsaydı
     * kullanıcı müşterisinin raporu almadığını günler sonra öğrenirdi.
     */
  ): Promise<{ sent: true; to: string[]; reddedilen: Array<{ adres: string; sebep: string }> }> {
    return this.gonderService.gonder(ctx, dto, meta(req));
  }

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

  /**
   * ═══ ZAMANLANMIŞ RAPOR ═══
   *
   * `report.share` YETKİSİ — `report.write` DEĞİL.
   *
   * Planlama bir şablon düzenlemesi değil, MÜŞTERİYE MAIL GÖNDERME kararı;
   * üstelik tek seferlik değil, tekrarlayan. Şablon yazabilen ama rapor
   * paylaşamayan birinin otomatik gönderim kurabilmesi, `report.share`
   * kapısını arka yoldan açmak olurdu.
   */
  @Get('schedules')
  @RequirePermissions('report.share')
  listSchedules(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<RaporPlaniOzeti[]> {
    return this.plans.listele(ctx, clientId);
  }

  @Post('schedules')
  @RequirePermissions('report.share')
  createSchedule(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(raporPlaniInputSchema)) body: RaporPlaniInput,
  ): Promise<{ id: string }> {
    return this.plans.olustur(ctx, body);
  }

  @Patch('schedules/:id')
  @RequirePermissions('report.share')
  updateSchedule(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(raporPlaniInputSchema)) body: RaporPlaniInput,
  ): Promise<{ id: string }> {
    return this.plans.guncelle(ctx, id, body);
  }

  @Delete('schedules/:id')
  @RequirePermissions('report.share')
  deleteSchedule(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<{ silindi: true }> {
    return this.plans.sil(ctx, id, clientId);
  }

  /**
   * ═══ PLATFORM FATURALARI ═══
   *
   * `report.share` YETKİSİ — okuma değil PAYLAŞMA kapısı. Fatura müşteriye
   * GİDEN bir belge; raporu paylaşamayan birinin mail ekine belge koyabilmesi
   * o kapıyı arka yoldan açmak olurdu.
   */
  @Get('faturalar')
  @RequirePermissions('report.share')
  listInvoices(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<FaturaOzeti[]> {
    return this.faturalar.listele(ctx, clientId);
  }

  @Post('faturalar')
  @RequirePermissions('report.share')
  @UseInterceptors(FileInterceptor('file'))
  uploadInvoice(
    @CurrentTenant() ctx: TenantContext,
    // `Express.Multer.File` yerine yapısal tip: @types/multer bu projede yok
    // ve varlık arşivi de aynı deseni kullanıyor.
    @UploadedFile() file: { originalname: string; mimetype: string; buffer: Buffer },
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Query('platform') platform: string,
    @Query('donem') donem: string,
    @Query('aciklama') aciklama?: string,
  ): Promise<{ id: string }> {
    if (!file) throw new BadRequestException('Dosya gelmedi.');
    if (!(FATURA_PLATFORMLARI as readonly string[]).includes(platform)) {
      throw new BadRequestException(`Geçersiz platform: ${platform}`);
    }
    // Dönem biçimi BURADA da doğrulanıyor: uç doğrudan çağrılabiliyor ve
    // bozuk bir dönem eşleştirmeyi sessizce boşa düşürürdü.
    const d = donemSchema.safeParse(donem);
    if (!d.success) throw new BadRequestException(d.error.issues[0]?.message ?? 'Geçersiz dönem.');

    return this.faturalar.yukle(
      ctx,
      {
        clientId,
        platform: platform as FaturaPlatformu,
        donem: d.data,
        aciklama: aciklama?.trim() || null,
      },
      { fileName: file.originalname, mimeType: file.mimetype, bytes: file.buffer },
    );
  }

  @Get('faturalar/:id/dosya')
  @RequirePermissions('report.share')
  async downloadInvoice(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('clientId', ParseUUIDPipe) clientId: string,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, fileName } = await this.faturalar.bytes(ctx, id, clientId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(fileName)}"`);
    res.send(buffer);
  }

  @Delete('faturalar/:id')
  @RequirePermissions('report.share')
  deleteInvoice(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<{ silindi: true }> {
    return this.faturalar.sil(ctx, id, clientId);
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

/**
 * PDF DOSYA ADI — müşteri ve dönem.
 *
 * Müşteri adı dosya adına giriyor ama TEMİZLENEREK: Türkçe karakterler ve
 * boşluklar bazı istemcilerde `Content-Disposition` ayrıştırmasını bozuyor ve
 * indirilen dosya "download" adıyla kaydediliyor.
 */
function dosyaAdi(data: ReportData): string {
  const ad = data.client.name
    .replace(/[ğĞ]/g, 'g')
    .replace(/[üÜ]/g, 'u')
    .replace(/[şŞ]/g, 's')
    .replace(/[ıİ]/g, 'i')
    .replace(/[öÖ]/g, 'o')
    .replace(/[çÇ]/g, 'c')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase();
  return `${ad || 'rapor'}-${data.from}_${data.to}.pdf`;
}
