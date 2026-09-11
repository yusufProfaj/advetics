import {
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
  Res,
} from '@nestjs/common';
import {
  createManagedOrganizationSchema,
  createManagerAccountSchema,
  deleteOrganizationSchema,
  moveWorkspaceSchema,
  updateManagerAccountSchema,
  type CreateManagedOrganizationInput,
  type CreateManagerAccountInput,
  type DeleteOrganizationInput,
  type MoveWorkspaceInput,
  type UpdateManagerAccountInput,
  type TenantContext,
} from '@advetics/shared';
import type { Response } from 'express';
import { Inject } from '@nestjs/common';
import { CurrentTenant } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { setActiveClientCookie, setActiveOrgCookie } from '../auth/cookies';
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
  constructor(
    private readonly service: ManagerAccountService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

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

  /** Aktif üst hesabı düzenler — ad ve (platform sahibinde) paket. */
  @Patch()
  async update(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(updateManagerAccountSchema)) dto: UpdateManagerAccountInput,
  ) {
    return this.service.update(ctx, dto);
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

  /**
   * Şirketi ve altındaki her şeyi KALICI siler. Kapılar servis katmanında.
   *
   * ┌─ AKTİF ŞİRKET SİLİNİRSE KAPSAM TAŞINIYOR ─────────────────────────────┐
   * │ Silme bir süre aktif şirkette REDDEDİLİYORDU ve bu özelliği           │
   * │ kullanılamaz yapıyordu: şirketi düzenlemek için önce ona geçmek       │
   * │ gerekiyor (`/organization` RLS ile aktif şirkete çivili), geçince de  │
   * │ silme reddediliyordu.                                                 │
   * │                                                                       │
   * │ Reddetmek yerine SİLDİKTEN SONRA taşıyoruz: çerez kullanıcının ev     │
   * │ şirketine çekiliyor ve workspace seçimi sıfırlanıyor (silinen         │
   * │ şirketin workspace'i yeni kapsamda geçersiz).                         │
   * │                                                                       │
   * │ ÇEREZ AÇIKÇA YAZILIYOR. Yazmasaydık `TenantContextService` silinmiş   │
   * │ kimliği izin listesinde bulamayıp sessizce eve düşerdi — doğru sonuç  │
   * │ ama sessiz, ve sessiz düşüş bu depoda bir hata türü.                  │
   * └───────────────────────────────────────────────────────────────────────┘
   */
  @HttpCode(HttpStatus.OK)
  @Delete('organizations/:id')
  async silOrganization(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(deleteOrganizationSchema)) dto: DeleteOrganizationInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const sonuc = await this.service.sil(ctx, id, dto);
    if (id === ctx.orgId) {
      const ev = await this.service.evSirketi(ctx);
      setActiveOrgCookie(res, this.config, ev);
      setActiveClientCookie(res, this.config, null);
    }
    return sonuc;
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
