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
import {
  createMemberSchema,
  createMembershipSchema,
  updateMembershipSchema,
  type CreateMemberInput,
  type CreateMembershipInput,
  type TenantContext,
  type UpdateMembershipInput,
  updateMemberInfoSchema,
  type UpdateMemberInfoInput,
} from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { MembersService } from './members.service';

@Controller()
export class MembersController {
  constructor(private readonly members: MembersService) {}

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId };
  }

  /**
   * `?clientId=` VERİLİRSE o workspace'in erişim listesi, verilmezse ajans
   * ekibi. İkisi farklı soru ve müşteri hesapları yalnızca birincisinde var.
   *
   * YETKİ AYNI (`user.read`) ÇÜNKÜ SINIR RLS'TE: erişemediği bir müşterinin
   * kimliğini yazan biri boş liste alıyor, hata değil. İkinci bir yetki
   * kontrolü eklemek, aynı kuralı iki yerde tutmak olurdu.
   */
  @Get('members')
  @RequirePermissions('user.read')
  list(@CurrentTenant() ctx: TenantContext, @Query('clientId') clientId?: string) {
    return this.members.listMembers(ctx, clientId ?? null);
  }

  /**
   * Ekibe kullanıcı ekler.
   *
   * Davet uç noktalarının yerine geçti. Org yöneticisi işi: parolayı ekleyen
   * belirliyor ve kullanıcıya kendi iletiyor.
   */
  @Post('members')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  createMember(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createMemberSchema)) dto: CreateMemberInput,
    @Req() req: AuthedRequest,
  ) {
    return this.members.createMember(ctx, dto, this.meta(req));
  }

  /**
   * Mevcut kullanıcıya yeni müşteri yetkisi verir — parola SORULMUYOR.
   *
   * `POST /members` yeni kullanıcı oluşturmak için; var olan birine yetki
   * eklerken oradaki parola alanı boşa uydurulmuş bir değer olurdu.
   */
  /**
   * KULLANICI BİLGİSİ — ad, e-posta, parola.
   *
   * `@RequireOrgAdmin()` VE `user.write`: başka birinin parolasını
   * değiştirmek o hesabı devralmak demek. Yetkiyi müşteri düzeyi bir role
   * açmak, bir workspace yöneticisine ajans personelinin hesabını ele
   * geçirme imkânı verirdi.
   *
   * ROL BURADA DEĞİŞMİYOR — `PATCH /memberships/:id` ayrı duruyor, çünkü bir
   * kişi bir müşteride yönetici başkasında görüntüleyici olabiliyor.
   */
  @Patch('members/:userId')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  updateInfo(
    @CurrentTenant() ctx: TenantContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body(zodBody(updateMemberInfoSchema)) dto: UpdateMemberInfoInput,
    @Req() req: AuthedRequest,
  ) {
    return this.members.updateMemberInfo(ctx, userId, dto, this.meta(req));
  }

  @Post('memberships')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  addMembership(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createMembershipSchema)) dto: CreateMembershipInput,
    @Req() req: AuthedRequest,
  ) {
    return this.members.addMembership(ctx, dto, this.meta(req));
  }

  @Patch('memberships/:id')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  updateMembership(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateMembershipSchema)) dto: UpdateMembershipInput,
    @Req() req: AuthedRequest,
  ) {
    return this.members.updateMembership(ctx, id, dto, this.meta(req));
  }

  @Delete('memberships/:id')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  removeMembership(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.members.removeMembership(ctx, id, this.meta(req));
  }
}
