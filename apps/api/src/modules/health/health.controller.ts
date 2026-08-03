import { Controller, Get } from '@nestjs/common';
import { CurrentTenant, Public } from '../../common/decorators';
import type { TenantContext } from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async check() {
    const start = Date.now();
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: { status: 'ok', latencyMs: Date.now() - start },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * RLS'in gerçekten devrede olduğunu doğrular.
   *
   * Bu endpoint bir formalite değil: RLS politikaları migration'dan sonra
   * `pnpm db:rls` çalıştırılmayı unutulursa sessizce devre dışı kalır ve
   * uygulama sorunsuz çalışmaya devam eder — ta ki bir müşteri diğerinin
   * verisini görene kadar. Deploy sonrası smoke test bunu çağırmalıdır.
   */
  @Get('rls')
  async rls(@CurrentTenant() ctx: TenantContext) {
    const contextApplied = await this.prisma.assertRlsActive(ctx);

    const policies = await this.prisma.$queryRaw<Array<{ tablename: string; count: bigint }>>`
      SELECT tablename, COUNT(*) AS count
      FROM pg_policies
      WHERE schemaname = 'public' AND policyname LIKE 'adv_%'
      GROUP BY tablename
      ORDER BY tablename
    `;

    const unprotected = await this.prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT c.relname AS tablename
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND c.relrowsecurity = false
        AND c.relname NOT LIKE '_prisma%'
      ORDER BY c.relname
    `;

    return {
      contextApplied,
      protectedTables: policies.map((p) => ({
        table: p.tablename,
        policies: Number(p.count),
      })),
      // Boş olmalı. Dolu ise: yeni bir tablo eklenmiş ama 02_rls.sql'deki
      // tablo listesine yazılmamış demektir.
      tablesWithoutRls: unprotected.map((t) => t.tablename),
      healthy: contextApplied && unprotected.length === 0,
    };
  }
}
