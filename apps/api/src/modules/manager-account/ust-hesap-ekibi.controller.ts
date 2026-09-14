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
  Req,
} from '@nestjs/common';
import {
  ustHesapUyesiEkleSchema,
  ustHesapUyesiGuncelleSchema,
  type TenantContext,
  type UstHesapUyesiEkleInput,
  type UstHesapUyesiGuncelleInput,
} from '@advetics/shared';
import { CurrentTenant } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { UstHesapEkibiService } from './ust-hesap-ekibi.service';

/**
 * ÜST HESAP EKİBİ uçları — `/manager-account/members`.
 *
 * `@RequireOrgAdmin()` ve `@RequirePermissions` KULLANILMIYOR ve bu
 * `manager-account.controller.ts` ile aynı karar: kapı bir izin adına değil
 * ÜST HESAP ÜYELİĞİNİN ROLÜNE bağlı (servisteki `assertYonetici`).
 * `isOrgAdmin` tek bir şirketin yöneticisinde de açık; onu buraya kapı
 * yapmak şirket yöneticisinin kendini bütün şirketlerin yöneticisi
 * yapabilmesi demekti.
 */
@Controller('manager-account/members')
export class UstHesapEkibiController {
  constructor(private readonly ekip: UstHesapEkibiService) {}

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId };
  }

  @Get()
  liste(@CurrentTenant() ctx: TenantContext) {
    return this.ekip.liste(ctx);
  }

  @HttpCode(HttpStatus.CREATED)
  @Post()
  ekle(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ustHesapUyesiEkleSchema)) dto: UstHesapUyesiEkleInput,
    @Req() req: AuthedRequest,
  ) {
    return this.ekip.ekle(ctx, dto, this.meta(req));
  }

  @Patch(':id')
  rolDegistir(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(ustHesapUyesiGuncelleSchema)) dto: UstHesapUyesiGuncelleInput,
    @Req() req: AuthedRequest,
  ) {
    return this.ekip.rolDegistir(ctx, id, dto, this.meta(req));
  }

  @Delete(':id')
  kaldir(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.ekip.kaldir(ctx, id, this.meta(req));
  }
}
