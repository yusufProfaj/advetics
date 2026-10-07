import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { TenantContext } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { gorselKaydet, type YuklenenGorsel } from './gorsel-yukle';

/** Yükleme ucu için ince sarmalayıcı; org_id HEDEF workspace'ten. */
@Injectable()
export class ReklamGorselService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  async yukle(ctx: TenantContext, clientId: string, ad: string, bayt: Buffer): Promise<YuklenenGorsel> {
    const tx = (fn: (t: never) => Promise<unknown>) => this.prisma.withTenant(ctx, (t) => fn(t as never));
    const [c] = (await tx((t: { $queryRaw<T>(q: Prisma.Sql): Promise<T> }) =>
      t.$queryRaw<Array<{ org_id: string }>>(Prisma.sql`SELECT org_id::text FROM clients WHERE id = ${clientId}::uuid`),
    )) as Array<{ org_id: string }>;
    if (!c) throw new Error('Workspace bulunamadı');
    return gorselKaydet(tx as never, { orgId: c.org_id, clientId, kullaniciId: ctx.userId, ad, bayt, yuklemeKoku: this.config.uploads.dir });
  }
}
