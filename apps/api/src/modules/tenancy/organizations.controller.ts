import { Body, Controller, Get, Patch, Req } from '@nestjs/common';
import {
  updateOrganizationSchema,
  type TenantContext,
  type UpdateOrganizationInput,
} from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { slugify } from '../../common/utils/slug';

@Controller('organization')
export class OrganizationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions('org.read')
  async get(@CurrentTenant() ctx: TenantContext) {
    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * KİMLİK AÇIKÇA VERİLİYOR — `findFirst()` ARTIK TEK SATIR DEĞİL.
       *
       * Burada "RLS zaten tek satır bırakır" yazıyordu ve o cümle üst hesap
       * (MCC) katmanı geldiğinde ÇÜRÜDÜ: `adv_organizations_select`
       * politikası aynı ajansın BÜTÜN şirketlerini görünür kılıyor (şirket
       * seçicinin listesi oradan geliyor). Yüklemsiz bir `findFirst`
       * rastgele bir kardeş şirketi döndürür ve ekranda başka bir şirketin
       * adı yazardı — hiçbir hata vermeden.
       *
       * "Tüm şirketler" modunda `ctx.orgId` EV şirketi; bu uç o zaman da
       * tek ve belirli bir şirketi anlatıyor.
       */
      const org = await tx.organization.findFirst({
        where: { id: ctx.orgId },
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
          createdAt: true,
          _count: { select: { clients: true, users: true } },
        },
      });
      return org;
    });
  }

  @Patch()
  @RequireOrgAdmin()
  @RequirePermissions('org.write')
  async update(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(updateOrganizationSchema)) dto: UpdateOrganizationInput,
    @Req() req: AuthedRequest,
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      /*
       * YÜKLEM ZORUNLU — okuma ucuyla aynı sebep. Yüklemsiz `findFirstOrThrow`
       * kardeş bir şirketi seçebiliyor; UPDATE politikası (`id =
       * app.current_org_id()`) onu reddettiği için sonuç veri bozulması değil
       * ANLAŞILMAZ BİR HATA olurdu: "kayıt bulunamadı" diyen bir kaydet
       * düğmesi.
       */
      const before = await tx.organization.findFirstOrThrow({ where: { id: ctx.orgId } });

      const after = await tx.organization.update({
        where: { id: before.id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.slug !== undefined ? { slug: slugify(dto.slug) } : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'org.updated',
        targetType: 'organization',
        targetId: after.id,
        before: { name: before.name, slug: before.slug },
        after: { name: after.name, slug: after.slug },
        ip: req.ip ?? null,
        userAgent: req.get('user-agent') ?? null,
        requestId: req.requestId,
      });

      return after;
    });
  }
}
