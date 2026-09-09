import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  createManagedOrganizationSchema,
  createManagerAccountSchema,
  type CreateManagedOrganizationInput,
  type CreateManagerAccountInput,
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
}
