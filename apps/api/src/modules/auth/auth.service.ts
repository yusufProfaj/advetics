import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
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
import { ARGON_OPTIONS } from '../../common/utils/password-hash';
import { TUM_SIRKETLER } from '@advetics/shared';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { mailGonder } from '../email/mail-gonderici';
import { sifirlamaMailiOlustur } from './sifre-sifirlama-maili';

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
    @Inject(CONFIG) private readonly config: AppConfig,
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

    return this.completeLogin(user.id, user.orgId, meta, input.rememberMe);
  }

  private async completeLogin(
    userId: string,
    orgId: string,
    meta: RequestMeta,
    /**
     * "Beni hatırla". Kayıt (`register`) yolunda parametre verilmiyor ve
     * kalıcı sayılıyor: yeni organizasyon kuran kişi o anda panelde
     * çalışmaya başlıyor, ilk işi tekrar giriş yapmak olmamalı.
     */
    persistent = true,
  ): Promise<AuthResult> {
    const tokens = await this.tokens.issueSession(userId, orgId, meta, persistent);

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

  async buildSession(
    userId: string,
    activeClientId: string | null,
    /** Üst hesap altında seçili şirket. Geçersizse `resolve` eve düşürüyor. */
    activeOrgId: string | null = null,
  ): Promise<SessionResponse> {
    const identity = await this.tenantContext.resolve(userId, activeClientId, activeOrgId);

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
      availableClients: identity.availableClients,
      activeClientId: identity.context.activeClientId,
      /*
       * `context.orgId` — `organization.id` DEĞİL. Birincisi seçili şirket,
       * ikincisi ev şirketi ve üst hesap altında ikisi farklı oluyor.
       */
      activeOrganizationId: identity.context.orgId,
      tumSirketler: identity.context.tumSirketler,
      managerAccount: identity.managerAccount,
      permissions: identity.context.permissions,
      isOrgAdmin: identity.context.isOrgAdmin,
    };
  }

  /**
   * Şirket geçişinin geçerliliğini doğrular ve hedefi döndürür.
   *
   * DOĞRULAMA BURADA DA YAPILIYOR, `resolve`a güvenilmiyor. `resolve`
   * geçersiz bir seçimi SESSİZCE eve düşürüyor (bayat cookie yüzünden
   * kullanıcıyı kilitlememek için) — ama kullanıcı düğmeye BASTIĞINDA
   * sessizce başka bir yere gitmek, "tıkladım ama değişmedi" hâli demek.
   * Açık istek açık cevap alıyor.
   */
  async assertOrgAccess(ctx: TenantContext, organizationId: string | null): Promise<string | null> {
    if (organizationId === null) return null;

    /*
     * "TÜM ŞİRKETLER" SENTINEL'İ DE DOĞRULANIYOR — sadece geçirilmiyor.
     * Üst hesabı olmayan biri cookie'sine `all` yazarsa sessizce eve
     * düşmek yerine açık bir cevap alıyor; sessiz düşüş "tıkladım ama
     * değişmedi" hâli demek.
     */

    const uyelik = await this.admin.managerMembership.findUnique({
      where: { userId: ctx.userId },
      select: { managerAccountId: true, managerAccount: { select: { status: true } } },
    });

    if (!uyelik || uyelik.managerAccount.status !== 'active') {
      throw new BadRequestException('Bu hesabın bağlı olduğu bir üst hesap yok');
    }

    if (organizationId === TUM_SIRKETLER) return TUM_SIRKETLER;

    const hedef = await this.admin.organization.findFirst({
      where: {
        id: organizationId,
        managerAccountId: uyelik.managerAccountId,
        status: 'active',
      },
      select: { id: true },
    });

    if (!hedef) {
      throw new BadRequestException('Bu şirkete erişim yetkiniz yok');
    }
    return hedef.id;
  }

  /**
   * Seçilen workspace HANGİ ŞİRKETTE — gerekiyorsa şirket de değişmeli.
   *
   * "Tüm şirketler" modunda seçici ajansın BÜTÜN workspace'lerini
   * listeliyor. Kullanıcı başka bir şirketin workspace'ini seçtiğinde
   * yalnızca `adv_client` cookie'sini yazmak yetmiyor: `resolve` o
   * workspace'i aktif şirketin listesinde bulamaz ve seçimi SESSİZCE
   * düşürür — kullanıcı tıklar, hiçbir şey olmaz ve sebebi hiçbir ekranda
   * yazmaz.
   *
   * `null` = şirket değişmiyor.
   */
  async workspaceSirketi(ctx: TenantContext, clientId: string): Promise<string | null> {
    const client = await this.admin.client.findUnique({
      where: { id: clientId },
      select: { orgId: true },
    });
    if (!client || client.orgId === ctx.orgId) return null;

    // ERİŞİM YİNE DOĞRULANIYOR: `clientIds` bağlamdan geliyor ama hedef
    // şirketin gerçekten üst hesabın altında olduğu ayrıca sorulmalı.
    return this.assertOrgAccess(ctx, client.orgId);
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
      throw new BadRequestException('Bu workspace’e erişim yetkiniz yok');
    }
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
   * ┌─ SIRA ÖNEMLİ: SMTP KONTROLÜ KULLANICI ARAMASINDAN ÖNCE ───────────────┐
   * │ SMTP eksikliği kullanıcı bulunduktan SONRA bildirilseydi, hata mesajı │
   * │ kusursuz bir numaralandırma aracına dönerdi: var olan adres hata      │
   * │ alır, olmayan adres "gönderildi" alır. Sunucunun yapılandırması       │
   * │ girilen adresten BAĞIMSIZ bir gerçek; önce o söyleniyor.              │
   * └──────────────────────────────────────────────────────────────────────┘
   *
   * GÖNDERİM HATASI (SMTP kurulu ama parola yanlış, sunucu reddetti…) ise
   * kullanıcıya yansıtılmıyor ve bu bilinçli bir taviz: o hata yalnızca
   * KAYITLI adreslerde çıkabildiği için yansıtmak yine aynı oracle'ı açardı.
   * Sessiz de kalmıyor — ERROR seviyesinde loglanıyor ve denetim kaydına
   * `password.reset_mail_failed` olarak yazılıyor.
   */
  async requestPasswordReset(
    email: string,
    meta: RequestMeta,
  ): Promise<{ devToken?: string }> {
    const smtp = this.config.mail.smtp;
    if (!smtp && this.config.isProduction) {
      throw new ServiceUnavailableException(
        'Şifre sıfırlama e-postası gönderilemiyor: sunucuda e-posta göndericisi tanımlı değil ' +
          `(eksik: ${this.config.mail.eksikSmtpDegiskenleri.join(', ')}). ` +
          'Yöneticine başvur.',
      );
    }

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

    const { konu, html, baglanti } = sifirlamaMailiOlustur(this.config.mail.appUrl, rawToken);

    if (!smtp) {
      /*
       * YALNIZCA GELİŞTİRMEDE BURAYA DÜŞÜLÜYOR (üretimde yukarıda fırlatıldı).
       * Yerelde kimse SMTP kurmuyor; akışın hiç denenememesi, sıfırlama
       * sayfasının canlıya ilk kez orada sınanması demek olurdu.
       */
      this.logger.warn(`[DEV] Şifre sıfırlama bağlantısı: ${baglanti}`);
      return { devToken: rawToken };
    }

    try {
      const sonuc = await mailGonder(smtp, { to: [email], subject: konu, html });
      if (sonuc.ret.length > 0) {
        // KISMİ RET SESSİZCE BAŞARILI DÖNÜYOR (`mail-gonderici.ts`). Tek
        // alıcı var, yani buraya düşmek "gitmedi" demek.
        throw new Error(sonuc.ret.map((r) => `${r.adres}: ${r.sebep}`).join('; '));
      }
    } catch (err) {
      const sebep = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Şifre sıfırlama maili GÖNDERİLEMEDİ (userId=${user.id}): ${sebep}`,
      );
      await this.audit.recordUnauthenticated(user.orgId, {
        action: 'password.reset_mail_failed',
        targetType: 'user',
        targetId: user.id,
        actorId: user.id,
        ...meta,
      });
    }

    if (!this.config.isProduction) {
      this.logger.warn(`[DEV] Şifre sıfırlama bağlantısı: ${baglanti}`);
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
