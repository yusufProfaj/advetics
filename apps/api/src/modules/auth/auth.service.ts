import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  AcceptInvitationInput,
  ChangePasswordInput,
  LoginInput,
  RegisterOrganizationInput,
  SessionResponse,
  TenantContext,
} from '@advetics/shared';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextService } from './tenant-context.service';
import { TokenService, type IssuedTokens } from './token.service';

const ARGON_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP önerisi
  timeCost: 2,
  parallelism: 1,
};

/**
 * Kullanıcı bulunamadığında da gerçek bir doğrulama maliyeti ödenir ki cevap
 * süresi "bu e-posta kayıtlı mı" bilgisini sızdırmasın.
 *
 * Sabit bir string yerine gerçek bir hash üretiyoruz — uydurma bir hash
 * argon2.verify() tarafından anında reddedilir ve tam da engellemek istediğimiz
 * zamanlama farkını yaratır.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  dummyHashPromise ??= argon2.hash(randomBytes(32).toString('hex'), ARGON_OPTIONS);
  return dummyHashPromise;
}

interface RequestMeta {
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuthResult {
  tokens: IssuedTokens;
  session: SessionResponse;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly admin: PrismaAdminService,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly tenantContext: TenantContextService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // Kayıt (ilk kurulum)
  // ---------------------------------------------------------------------------

  /**
   * Organizasyon + owner kullanıcı + varsayılan marka profilini tek
   * transaction'da oluşturur. Yarım kalmış bir organizasyon (owner'ı olmayan)
   * sistemde kilitlenmeye yol açar; bu yüzden ya hepsi ya hiçbiri.
   */
  async registerOrganization(
    input: RegisterOrganizationInput,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const slug = this.slugify(input.organizationName);

    const existingOrg = await this.admin.organization.findUnique({ where: { slug } });
    if (existingOrg) {
      throw new ConflictException('Bu isimde bir organizasyon zaten var');
    }

    const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);

    const user = await this.admin.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: input.organizationName, slug, plan: 'starter', status: 'active' },
      });

      const created = await tx.user.create({
        data: {
          orgId: org.id,
          email: input.email,
          passwordHash,
          fullName: input.fullName,
          locale: 'tr',
          status: 'active',
        },
      });

      await tx.membership.create({
        data: { userId: created.id, orgId: org.id, clientId: null, role: Role.owner },
      });

      await tx.brandingProfile.create({
        data: { orgId: org.id, clientId: null, emailFromName: input.organizationName },
      });

      return created;
    });

    await this.audit.recordUnauthenticated(user.orgId, {
      action: 'org.registered',
      targetType: 'organization',
      targetId: user.orgId,
      actorId: user.id,
      after: { organizationName: input.organizationName, ownerEmail: input.email },
      ...meta,
    });

    return this.completeLogin(user.id, user.orgId, meta);
  }

  // ---------------------------------------------------------------------------
  // Giriş
  // ---------------------------------------------------------------------------

  async login(input: LoginInput, meta: RequestMeta): Promise<AuthResult> {
    // E-posta org başına tekildir; aynı adres birden fazla organizasyonda
    // bulunabilir. Sessizce birini seçmek, kullanıcıyı yanlış hesaba sokar —
    // bu yüzden belirsizliği açıkça bildiriyoruz.
    const candidates = await this.admin.user.findMany({
      where: { email: input.email, status: 'active' },
      select: { id: true, orgId: true, passwordHash: true },
      take: 5,
    });

    if (candidates.length > 1) {
      throw new ConflictException(
        'Bu e-posta birden fazla organizasyona bağlı. Lütfen yöneticinizle iletişime geçin.',
      );
    }

    const user = candidates[0];

    // Zamanlama saldırısına karşı: kullanıcı yoksa da doğrulama maliyeti ödenir.
    const hash = user?.passwordHash ?? (await getDummyHash());
    let valid = false;
    try {
      valid = await argon2.verify(hash, input.password);
    } catch {
      valid = false;
    }

    if (!user || !valid) {
      this.logger.warn(`Başarısız giriş denemesi: ${input.email} (ip=${meta.ip ?? '-'})`);
      throw new UnauthorizedException('E-posta veya şifre hatalı');
    }

    return this.completeLogin(user.id, user.orgId, meta);
  }

  private async completeLogin(
    userId: string,
    orgId: string,
    meta: RequestMeta,
  ): Promise<AuthResult> {
    const tokens = await this.tokens.issueSession(userId, orgId, meta);

    await this.admin.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    const session = await this.buildSession(userId, null);

    await this.audit.recordUnauthenticated(orgId, {
      action: 'auth.login',
      targetType: 'user',
      targetId: userId,
      actorId: userId,
      ...meta,
    });

    return { tokens, session };
  }

  // ---------------------------------------------------------------------------
  // Oturum
  // ---------------------------------------------------------------------------

  async refresh(refreshToken: string, meta: RequestMeta): Promise<IssuedTokens> {
    return this.tokens.rotate(refreshToken, meta);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (refreshToken) await this.tokens.revokeByToken(refreshToken);
  }

  async logoutEverywhere(ctx: TenantContext): Promise<void> {
    await this.tokens.revokeAllForUser(ctx.userId, 'logout_all');
  }

  async buildSession(userId: string, activeClientId: string | null): Promise<SessionResponse> {
    const identity = await this.tenantContext.resolve(userId, activeClientId);

    const [user, org] = await Promise.all([
      this.admin.user.findUniqueOrThrow({
        where: { id: userId },
        select: {
          id: true,
          orgId: true,
          email: true,
          fullName: true,
          avatarUrl: true,
          locale: true,
          status: true,
        },
      }),
      this.admin.organization.findUniqueOrThrow({
        where: { id: identity.actor.orgId },
        select: { id: true, name: true, slug: true, plan: true },
      }),
    ]);

    return {
      user: {
        id: user.id,
        orgId: user.orgId,
        email: user.email,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        locale: user.locale,
        status: user.status,
      },
      organization: org,
      memberships: identity.memberships,
      activeClientId: identity.context.activeClientId,
      permissions: identity.context.permissions,
      isOrgAdmin: identity.context.isOrgAdmin,
    };
  }

  /** Aktif müşteri seçiminin geçerliliğini doğrular. */
  assertClientAccess(ctx: TenantContext, clientId: string | null): void {
    if (clientId === null) {
      if (!ctx.isOrgAdmin) {
        throw new BadRequestException(
          'Organizasyon geneli görünüm yalnızca yöneticiler için kullanılabilir',
        );
      }
      return;
    }
    if (!ctx.clientIds.includes(clientId)) {
      throw new BadRequestException('Bu müşteriye erişim yetkiniz yok');
    }
  }

  // ---------------------------------------------------------------------------
  // Davet kabulü
  // ---------------------------------------------------------------------------

  async acceptInvitation(input: AcceptInvitationInput, meta: RequestMeta): Promise<AuthResult> {
    const tokenHash = this.hashToken(input.token);

    const invitation = await this.admin.invitation.findUnique({
      where: { tokenHash },
      include: { organization: { select: { id: true, status: true } } },
    });

    if (!invitation || invitation.status !== 'pending') {
      throw new BadRequestException('Davet geçersiz veya daha önce kullanılmış');
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      await this.admin.invitation.update({
        where: { id: invitation.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('Davetin süresi dolmuş');
    }
    if (invitation.organization.status !== 'active') {
      throw new BadRequestException('Organizasyon askıya alınmış');
    }

    const passwordHash = await argon2.hash(input.password, ARGON_OPTIONS);

    const user = await this.admin.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({
        where: { orgId_email: { orgId: invitation.orgId, email: invitation.email } },
      });

      const target = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: {
              passwordHash: existing.passwordHash ?? passwordHash,
              fullName: input.fullName,
              status: 'active',
            },
          })
        : await tx.user.create({
            data: {
              orgId: invitation.orgId,
              email: invitation.email,
              passwordHash,
              fullName: input.fullName,
              status: 'active',
            },
          });

      // Aynı kapsam için membership zaten varsa rolü güncelle, çoğaltma.
      const existingMembership = await tx.membership.findFirst({
        where: { userId: target.id, clientId: invitation.clientId },
      });

      if (existingMembership) {
        await tx.membership.update({
          where: { id: existingMembership.id },
          data: { role: invitation.role },
        });
      } else {
        await tx.membership.create({
          data: {
            userId: target.id,
            orgId: invitation.orgId,
            clientId: invitation.clientId,
            role: invitation.role,
          },
        });
      }

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'accepted', acceptedAt: new Date() },
      });

      return target;
    });

    await this.audit.recordUnauthenticated(invitation.orgId, {
      action: 'invitation.accepted',
      targetType: 'user',
      targetId: user.id,
      actorId: user.id,
      clientId: invitation.clientId,
      after: { email: invitation.email, role: invitation.role },
      ...meta,
    });

    return this.completeLogin(user.id, user.orgId, meta);
  }

  // ---------------------------------------------------------------------------
  // Şifre işlemleri
  // ---------------------------------------------------------------------------

  /**
   * Sıfırlama talebi.
   *
   * Kullanıcı bulunamasa bile başarılı yanıt döner — aksi halde bu endpoint
   * bir e-posta numaralandırma aracına dönüşür.
   *
   * Dönen token yalnızca geliştirme ortamında kullanılabilir. E-posta gönderimi
   * Modül 1.5'te eklenecek; o zamana kadar token log'a düşer.
   */
  async requestPasswordReset(
    email: string,
    meta: RequestMeta,
  ): Promise<{ devToken?: string }> {
    const user = await this.admin.user.findFirst({
      where: { email, status: 'active' },
      select: { id: true, orgId: true },
    });

    if (!user) return {};

    const rawToken = randomBytes(32).toString('base64url');

    await this.admin.$transaction(async (tx) => {
      // Bekleyen eski talepleri geçersiz kıl — aynı anda birden fazla geçerli
      // sıfırlama linki dolaşımda olmamalı.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashToken(rawToken),
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 saat
          ip: meta.ip ?? null,
        },
      });
    });

    await this.audit.recordUnauthenticated(user.orgId, {
      action: 'password.reset_requested',
      targetType: 'user',
      targetId: user.id,
      actorId: user.id,
      ...meta,
    });

    if (process.env.NODE_ENV !== 'production') {
      this.logger.warn(`[DEV] Şifre sıfırlama token'ı: ${rawToken}`);
      return { devToken: rawToken };
    }
    return {};
  }

  async confirmPasswordReset(
    token: string,
    newPassword: string,
    meta: RequestMeta,
  ): Promise<void> {
    const record = await this.admin.passwordResetToken.findUnique({
      where: { tokenHash: this.hashToken(token) },
      include: { user: { select: { id: true, orgId: true } } },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('Sıfırlama bağlantısı geçersiz veya süresi dolmuş');
    }

    const passwordHash = await argon2.hash(newPassword, ARGON_OPTIONS);

    await this.admin.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
    });

    // Şifre değiştiyse tüm oturumlar düşmelidir. Aksi halde şifreyi ele
    // geçiren birinin açık oturumu, sıfırlamaya rağmen yaşamaya devam eder.
    await this.tokens.revokeAllForUser(record.userId, 'password_reset');

    await this.audit.recordUnauthenticated(record.user.orgId, {
      action: 'password.reset_completed',
      targetType: 'user',
      targetId: record.userId,
      actorId: record.userId,
      ...meta,
    });
  }

  async changePassword(
    ctx: TenantContext,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<void> {
    const user = await this.admin.user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { id: true, passwordHash: true },
    });

    if (!user.passwordHash) {
      throw new BadRequestException('Bu hesapta şifre tanımlı değil');
    }

    const valid = await argon2.verify(user.passwordHash, input.currentPassword);
    if (!valid) throw new UnauthorizedException('Mevcut şifre hatalı');

    const passwordHash = await argon2.hash(input.newPassword, ARGON_OPTIONS);
    await this.admin.user.update({ where: { id: user.id }, data: { passwordHash } });
    await this.tokens.revokeAllForUser(user.id, 'password_changed');

    await this.prisma.withTenant(ctx, (tx) =>
      this.audit.record(tx, ctx, {
        action: 'password.changed',
        targetType: 'user',
        targetId: user.id,
        ...meta,
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Yardımcılar
  // ---------------------------------------------------------------------------

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Sabit süreli karşılaştırma — token doğrulamasında kullanılmak üzere. */
  protected safeEquals(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  }

  private slugify(input: string): string {
    const map: Record<string, string> = {
      ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i',
      ö: 'o', Ö: 'o', ş: 's', Ş: 's', ü: 'u', Ü: 'u',
    };
    const slug = input
      .split('')
      .map((ch) => map[ch] ?? ch)
      .join('')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);

    if (!slug) throw new BadRequestException('Geçerli bir organizasyon adı girin');
    return slug;
  }
}

/** Prisma tipini dışa aç — modüller arası kullanım için. */
export type { Prisma };
