import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  leadFormInputSchema,
  type EditPlan,
  type LeadFormInput,
  type LeadFormRecord,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { FormPublisherService } from './form-publisher.service';
import { FormsService } from './forms.service';

/**
 * Formlar kütüphanesi uç noktaları.
 *
 * YETKİLER REKLAM OLUŞTURUCUYLA PAYLAŞILIYOR (`bulk.*`).
 *
 * Form tek başına bir reklam değil ama reklamın parçası ve yayınlanması
 * platformda kalıcı bir kayıt üretiyor. Ayrı bir yetki seti, yöneticinin
 * "reklam yayınlamayı kapattım ama form yayınlayabiliyor" gibi bir boşlukla
 * karşılaşması demek olurdu.
 */
@Controller('lead-forms')
export class FormsController {
  constructor(
    private readonly forms: FormsService,
    private readonly publisher: FormPublisherService,
  ) {}

  @Get()
  @RequirePermissions('bulk.read')
  list(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<LeadFormRecord[]> {
    return this.forms.list(ctx, clientId);
  }

  @Get(':id')
  @RequirePermissions('bulk.read')
  get(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadFormRecord> {
    return this.forms.get(ctx, id);
  }

  /** Bir formun tüm sürümleri — detay ekranındaki geçmiş. */
  @Get(':id/versions')
  @RequirePermissions('bulk.read')
  versions(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadFormRecord[]> {
    return this.forms.versions(ctx, id);
  }

  @Get(':id/checks')
  @RequirePermissions('bulk.read')
  checks(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ blockers: string[]; warnings: string[] }> {
    return this.forms.checks(ctx, id);
  }

  @Post()
  @RequirePermissions('bulk.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(leadFormInputSchema)) body: LeadFormInput,
  ): Promise<LeadFormRecord> {
    return this.forms.create(ctx, body);
  }

  /**
   * Kaydetmeden ÖNCE ne olacağını söyler.
   *
   * Arayüz "Kaydet"e basılmadan bunu çağırıyor: yayınlanmış bir formda
   * düzenleme Meta'da geri alınamayan yeni bir kayıt üretiyor ve kullanıcı
   * bunu sonradan öğrenmemeli. Ayrı uç nokta çünkü yan etkisi yok.
   */
  @Post(':id/plan')
  @RequirePermissions('bulk.write')
  plan(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(leadFormInputSchema)) body: LeadFormInput,
  ): Promise<EditPlan> {
    return this.forms.planUpdate(ctx, id, body);
  }

  @Put(':id')
  @RequirePermissions('bulk.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(leadFormInputSchema)) body: LeadFormInput,
  ): Promise<LeadFormRecord> {
    return this.forms.update(ctx, id, body);
  }

  @Delete(':id')
  @RequirePermissions('bulk.write')
  async remove(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ ok: true }> {
    await this.forms.remove(ctx, id);
    return { ok: true };
  }

  @Post(':id/publish')
  @RequirePermissions('bulk.publish')
  publish(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<LeadFormRecord> {
    return this.publisher.publish(ctx, id);
  }
}
