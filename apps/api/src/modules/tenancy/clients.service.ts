import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  CreateClientInput,
  TenantContext,
  UpdateClientInput,
} from '@advetics/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { uniqueSlug } from '../../common/utils/slug';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

/**
 * Müşteri (client) yönetimi.
 *
 * Dikkat: hiçbir sorguda `orgId` filtresi YAZILMIYOR. Bu bilinçlidir —
 * RLS zaten kullanıcının organizasyonu dışındaki satırları görünmez kılar.
 * Uygulama katmanına ikinci bir filtre yazmak, iki filtrenin zamanla
 * ayrışması riskini doğurur; tek doğruluk kaynağı politikalardır.
 */
@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.client.findMany({
        where: { status: { not: 'archived' } },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          timezone: true,
          reportingCurrency: true,
          status: true,
          createdAt: true,
          /**
           * Reklam hesabı ve ekip sayıları listede GÖRÜNMEK ZORUNDA.
           *
           * Müşteriler ekranının tek işi "hangi müşteride ne var" sorusuna
           * cevap vermek. Sayılar olmadan liste yalnızca isimlerden ibaret
           * kalıyor ve hesabı olmayan bir müşteri — yani hiç veri gelmeyecek
           * bir müşteri — hesabı olandan ayırt edilemiyor.
           *
           * `syncEnabled` ayrı sayılıyor: bağlı olmak ile İZLENİYOR olmak
           * farklı. Portföy seed'i 27 hesabı bağladı ama hiçbirini açmamıştı
           * ve panel "veri yok" gösteriyordu; ekranda ayrı görünseydi sebep
           * bir bakışta anlaşılırdı.
           */
          _count: { select: { adAccounts: true, memberships: true } },
          adAccounts: {
            where: { syncEnabled: true },
            select: { id: true },
          },
        },
      }),
    );
  }

  async findById(ctx: TenantContext, id: string) {
    const client = await this.prisma.withTenant(ctx, (tx) =>
      tx.client.findUnique({
        where: { id },
        include: {
          branding: true,
          _count: { select: { memberships: true } },
        },
      }),
    );
    // RLS erişim yoksa satırı yok sayar; "bulunamadı" ile "yetkin yok" aynı
    // cevabı verir. Bu kasıtlıdır — 403 dönmek, kaydın var olduğunu sızdırır.
    if (!client) throw new NotFoundException('Müşteri bulunamadı');
    return client;
  }

  async create(ctx: TenantContext, input: CreateClientInput, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const slug = await uniqueSlug(input.slug ?? input.name, async (candidate) => {
        const found = await tx.client.findFirst({
          where: { orgId: ctx.orgId, slug: candidate },
          select: { id: true },
        });
        return found !== null;
      });

      const client = await tx.client.create({
        data: {
          orgId: ctx.orgId,
          name: input.name,
          slug,
          timezone: input.timezone,
          reportingCurrency: input.reportingCurrency,
        },
      });

      // Müşteriye özel marka profili baştan oluşturulur; boş bırakılan alanlar
      // organizasyon varsayılanından devralınır (bkz. BrandingService.resolve).
      await tx.brandingProfile.create({
        data: { orgId: ctx.orgId, clientId: client.id, emailFromName: input.name },
      });

      await this.audit.record(tx, ctx, {
        action: 'client.created',
        targetType: 'client',
        targetId: client.id,
        clientId: client.id,
        after: { name: client.name, slug: client.slug, timezone: client.timezone },
        ...meta,
      });

      return client;
    });
  }

  async update(ctx: TenantContext, id: string, input: UpdateClientInput, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Müşteri bulunamadı');

      const after = await tx.client.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
          ...(input.reportingCurrency !== undefined
            ? { reportingCurrency: input.reportingCurrency }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          ...(input.status === 'archived' ? { archivedAt: new Date() } : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'client.updated',
        targetType: 'client',
        targetId: id,
        clientId: id,
        before: {
          name: before.name,
          timezone: before.timezone,
          reportingCurrency: before.reportingCurrency,
          status: before.status,
        },
        after: {
          name: after.name,
          timezone: after.timezone,
          reportingCurrency: after.reportingCurrency,
          status: after.status,
        },
        ...meta,
      });

      return after;
    });
  }

  /**
   * Arşivleme — silme DEĞİL.
   *
   * Bir müşteriyi gerçekten silmek, ona bağlı tüm reklam verisini, kural
   * geçmişini ve denetim kaydını da götürür. Ajans ürününde bu veri
   * sözleşmesel olarak saklanmak zorundadır. Kalıcı silme ayrı ve bilinçli
   * bir işlemdir (Modül 1.5: veri saklama politikası).
   */
  async archive(ctx: TenantContext, id: string, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.client.findUnique({ where: { id } });
      if (!before) throw new NotFoundException('Müşteri bulunamadı');

      const archived = await tx.client.update({
        where: { id },
        data: { status: 'archived', archivedAt: new Date() },
      });

      await this.audit.record(tx, ctx, {
        action: 'client.archived',
        targetType: 'client',
        targetId: id,
        clientId: id,
        before: { status: before.status },
        after: { status: archived.status },
        ...meta,
      });

      return archived;
    });
  }
}
