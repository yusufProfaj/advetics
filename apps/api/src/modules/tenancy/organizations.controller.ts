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
      // RLS `organizations` üzerinde yalnızca kullanıcının org'unu görünür kılar;
      // findFirst tek satır döndürmesi garantidir.
      const org = await tx.organization.findFirst({
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
      const before = await tx.organization.findFirstOrThrow();

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
