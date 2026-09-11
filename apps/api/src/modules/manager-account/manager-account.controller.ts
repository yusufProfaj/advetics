import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  createManagedOrganizationSchema,
  createManagerAccountSchema,
  deleteOrganizationSchema,
  moveWorkspaceSchema,
  type CreateManagedOrganizationInput,
  type CreateManagerAccountInput,
  type DeleteOrganizationInput,
  type MoveWorkspaceInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { ManagerAccountService } from './manager-account.service';

/**
 * ÜST HESAP (MCC) uçları.
 *
 * `@RequirePermissions` KULLANILMIYOR: yetki kontrolü servis katmanında
 * (`assertOrgAdmin`) ve bu bilinçli. Bu uçlar bir izin adına değil, org
 * YÖNETİCİLİĞİNE bağlı; `permissions` listesinde "üst hesap yönet" diye
 * bir izin tanımlamak, o iznin bir gün başka bir role verilip
 * organizasyon sınırının sessizce genişlemesi demekti.
 */
@Controller('manager-account')
export class ManagerAccountController {
  constructor(private readonly service: ManagerAccountService) {}

  /** Üst hesap ağacı — yoksa `null` (hata değil: bağımsız şirket geçerli bir hâl). */
  @Get()
  async get(@CurrentTenant() ctx: TenantContext) {
    return this.service.get(ctx);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post()
  async create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createManagerAccountSchema)) dto: CreateManagerAccountInput,
  ) {
    return this.service.create(ctx, dto);
  }

  /** Üst hesabın altına YENİ şirket açar — MCC'deki "alt hesap ekle". */
  @HttpCode(HttpStatus.CREATED)
  @Post('organizations')
  async createOrganization(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createManagedOrganizationSchema)) dto: CreateManagedOrganizationInput,
  ) {
    return this.service.createOrganization(ctx, dto);
  }

  /**
   * ŞİRKET SİLME ÖZETİ — ne gideceğini SAYIYOR, hiçbir şey silmiyor.
   *
   * AYRI BİR UÇ çünkü ekran silmeden ÖNCE göstermek zorunda: silme otuz
   * tabloda cascade tetikliyor (workspace'ler, reklam hesapları,
   * KULLANICILAR, bütün metrik geçmişi) ve geri alma yolu yok. "Emin
   * misiniz?" deyip ne gideceğini söylememek, bu depoda `reset-clients`in
   * yarım kalıp metrik verisini götürmesiyle aynı sınıf hata.
   */
  @Get('organizations/:id/silme-ozeti')
  async silmeOzeti(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.silmeOzeti(ctx, id);
  }

  /** Şirketi ve altındaki her şeyi KALICI siler. Kapılar servis katmanında. */
  @HttpCode(HttpStatus.OK)
  @Delete('organizations/:id')
  async silOrganization(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(deleteOrganizationSchema)) dto: DeleteOrganizationInput,
  ) {
    return this.service.sil(ctx, id, dto);
  }

  /**
   * VAR OLAN workspace'i başka bir şirkete taşır.
   *
   * `POST /organizations`tan AYRI bir uç: biri boş bir kap yaratıyor,
   * diğeri 30 tabloda `org_id` güncelliyor. Aynı uçta toplamak, "şirket
   * ekle" düğmesinin bir gün veri taşımaya başlaması demekti.
   */
  @HttpCode(HttpStatus.OK)
  @Post('workspaces/move')
  async moveWorkspace(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(moveWorkspaceSchema)) dto: MoveWorkspaceInput,
  ) {
    return this.service.moveWorkspace(ctx, dto);
  }
}
