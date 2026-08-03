import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import {
  isOrgScopedRole,
  type CreateInvitationInput,
  type Permission,
  type TenantContext,
  type UpdateMembershipInput,
} from '@advetics/shared';
import { PrismaService, type TenantClient } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

interface Meta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class MembersService {
  private readonly logger = new Logger(MembersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Ekip listesi.
   *
   * RLS `users` tablosunda org yöneticisi olmayanlara yalnızca kendi satırını
   * gösterir — bu endpoint bir client_viewer tarafından çağrılırsa tek satır
   * döner, hata değil. Bu davranış kasıtlıdır.
   */
  async listMembers(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.user.findMany({
        orderBy: { fullName: 'asc' },
        select: {
          id: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          status: true,
          lastLoginAt: true,
          createdAt: true,
          memberships: {
            select: {
              id: true,
              role: true,
              clientId: true,
              permissions: true,
              client: { select: { id: true, name: true } },
            },
          },
        },
      }),
    );
  }

  async listInvitations(ctx: TenantContext) {
    return this.prisma.withTenant(ctx, (tx) =>
      tx.invitation.findMany({
        where: { status: 'pending' },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          email: true,
          role: true,
          clientId: true,
          expiresAt: true,
          createdAt: true,
          client: { select: { id: true, name: true } },
        },
      }),
    );
  }

  /**
   * Davet oluşturur.
   *
   * Token yalnızca burada, düz metin olarak var olur; veritabanına SHA-256
   * hash'i yazılır. E-posta gönderimi Modül 1.5'te eklenecek — o zamana kadar
   * token yanıtta (yalnızca geliştirme ortamında) ve log'da döner.
   */
  async invite(ctx: TenantContext, input: CreateInvitationInput, meta: Meta) {
    // Şema zaten org geneli erişimi owner/admin ile sınırlıyor; burada
    // ikinci kez doğruluyoruz çünkü bu kural bir yetki yükseltme kapısıdır.
    if (input.clientId === null && !isOrgScopedRole(input.role)) {
      throw new BadRequestException(
        'Organizasyon geneli erişim yalnızca owner ve admin rollerine verilebilir',
      );
    }

    const rawToken = randomBytes(32).toString('base64url');

    const invitation = await this.prisma.withTenant(ctx, async (tx) => {
      if (input.clientId) {
        const client = await tx.client.findUnique({ where: { id: input.clientId } });
        if (!client) throw new NotFoundException('Müşteri bulunamadı');
      }

      const existingMember = await tx.user.findFirst({
        where: { email: input.email },
        select: { id: true, memberships: { select: { clientId: true } } },
      });
      if (existingMember?.memberships.some((m) => m.clientId === input.clientId)) {
        throw new ConflictException('Bu kullanıcının zaten bu kapsamda erişimi var');
      }

      const created = await tx.invitation.create({
        data: {
          orgId: ctx.orgId,
          clientId: input.clientId,
          email: input.email,
          role: input.role as Role,
          tokenHash: createHash('sha256').update(rawToken).digest('hex'),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          createdById: ctx.userId,
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'invitation.created',
        targetType: 'invitation',
        targetId: created.id,
        clientId: input.clientId,
        after: { email: input.email, role: input.role, clientId: input.clientId },
        ...meta,
      });

      return created;
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[DEV] Davet token'ı (${input.email}): ${rawToken}`);
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      clientId: invitation.clientId,
      expiresAt: invitation.expiresAt,
      ...(process.env.NODE_ENV !== 'production' ? { devToken: rawToken } : {}),
    };
  }

  async revokeInvitation(ctx: TenantContext, id: string, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const invitation = await tx.invitation.findUnique({ where: { id } });
      if (!invitation || invitation.status !== 'pending') {
        throw new NotFoundException('Bekleyen davet bulunamadı');
      }

      const updated = await tx.invitation.update({
        where: { id },
        data: { status: 'revoked', revokedAt: new Date() },
      });

      await this.audit.record(tx, ctx, {
        action: 'invitation.revoked',
        targetType: 'invitation',
        targetId: id,
        clientId: invitation.clientId,
        before: { email: invitation.email, status: 'pending' },
        ...meta,
      });

      return updated;
    });
  }

  async updateMembership(
    ctx: TenantContext,
    membershipId: string,
    input: UpdateMembershipInput,
    meta: Meta,
  ) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const before = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!before) throw new NotFoundException('Yetki kaydı bulunamadı');

      if (before.clientId === null && !isOrgScopedRole(input.role)) {
        throw new BadRequestException(
          'Organizasyon geneli bir yetki, müşteri düzeyi bir role çevrilemez',
        );
      }

      await this.assertNotLastOwner(tx, before.id, before.role, input.role as Role);

      const after = await tx.membership.update({
        where: { id: membershipId },
        data: {
          role: input.role as Role,
          ...(input.permissions !== undefined
            ? { permissions: input.permissions ?? undefined }
            : {}),
        },
      });

      await this.audit.record(tx, ctx, {
        action: 'membership.updated',
        targetType: 'membership',
        targetId: membershipId,
        clientId: before.clientId,
        before: { role: before.role, permissions: before.permissions },
        after: { role: after.role, permissions: after.permissions },
        ...meta,
      });

      return after;
    });
  }

  async removeMembership(ctx: TenantContext, membershipId: string, meta: Meta) {
    return this.prisma.withTenant(ctx, async (tx) => {
      const membership = await tx.membership.findUnique({ where: { id: membershipId } });
      if (!membership) throw new NotFoundException('Yetki kaydı bulunamadı');

      if (membership.userId === ctx.userId) {
        throw new BadRequestException('Kendi erişiminizi kaldıramazsınız');
      }

      await this.assertNotLastOwner(tx, membership.id, membership.role, null);

      await tx.membership.delete({ where: { id: membershipId } });

      await this.audit.record(tx, ctx, {
        action: 'membership.removed',
        targetType: 'membership',
        targetId: membershipId,
        clientId: membership.clientId,
        before: { userId: membership.userId, role: membership.role },
        ...meta,
      });

      return { ok: true };
    });
  }

  /**
   * Son owner'ın rolünün düşürülmesini veya silinmesini engeller.
   *
   * Bu kontrol olmadan bir organizasyon kendini kilitleyebilir: owner yetkisi
   * olan hiç kimse kalmadığında kimse yeni owner atayamaz. Kurtarma yolu
   * yalnızca veritabanına doğrudan müdahaledir.
   */
  private async assertNotLastOwner(
    tx: TenantClient,
    membershipId: string,
    currentRole: Role,
    nextRole: Role | null,
  ): Promise<void> {
    if (currentRole !== Role.owner) return;
    if (nextRole === Role.owner) return;

    const remainingOwners = await tx.membership.count({
      where: { role: Role.owner, id: { not: membershipId } },
    });

    if (remainingOwners === 0) {
      throw new BadRequestException(
        'Organizasyonda en az bir owner kalmalı. Önce başka bir kullanıcıyı owner yapın.',
      );
    }
  }
}

export type { Permission };
