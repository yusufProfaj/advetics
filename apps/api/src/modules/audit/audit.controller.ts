import { Controller, Get, Query } from '@nestjs/common';
import { paginationSchema, type PaginationInput, type TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Denetim kaydı görüntüleme.
 *
 * Filtreleme uygulama katmanında YAPILMAZ — RLS zaten kullanıcının
 * göremeyeceği satırları elemiş durumdadır. Buradaki `where` yalnızca
 * kullanıcının istediği daraltmayı uygular.
 */
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('audit.read')
  async list(
    @CurrentTenant() ctx: TenantContext,
    @Query(new ZodValidationPipe(paginationSchema)) page: PaginationInput,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const where = {
        ...(ctx.activeClientId ? { clientId: ctx.activeClientId } : {}),
        ...(action ? { action } : {}),
        ...(targetType ? { targetType } : {}),
      };

      const [items, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: (page.page - 1) * page.pageSize,
          take: page.pageSize,
        }),
        tx.auditLog.count({ where }),
      ]);

      return {
        // BigInt JSON'a doğrudan serileştirilemez.
        items: items.map((i) => ({ ...i, id: i.id.toString() })),
        total,
        page: page.page,
        pageSize: page.pageSize,
      };
    });
  }
}
