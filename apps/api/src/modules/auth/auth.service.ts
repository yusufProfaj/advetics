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
import { TUM_SIRKETLER, isOrgScopedRole } from '@advetics/shared';
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
    /** Seçili üst hesap. Geçersizse `resolve` ilk üyeliğe düşürüyor. */
    activeManagerAccountId: string | null = null,
  ): Promise<SessionResponse> {
    const identity = await this.tenantContext.resolve(
      userId,
      activeClientId,
      activeOrgId,
      activeManagerAccountId,
    );

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
      erisilebilirSirketler: identity.erisilebilirSirketler,
      // ÜST HESAP SEÇİCİSİNİN LİSTESİ — tek elemanlıysa panel seçiciyi hiç
      // çizmiyor (geçilecek yer yokken açılır kutu, olmayan bir özelliği
      // aratır).
      secilebilirUstHesaplar: identity.secilebilirUstHesaplar,
      platformAdmin: identity.context.platformAdmin,
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

    /*
     * AKTİF ÜST HESAP BAĞLAMDAN GELİYOR.
     *
     * `findUnique({ userId })` bir kullanıcının BİRDEN ÇOK üst hesabı
     * olabildiği andan itibaren yanlış cevap veriyor: hangisi olduğunu
     * söylemiyor. `TenantContextService` çerezi zaten doğrulayıp seçiyor ve
     * askıya alınmış hesabı da eliyor — ikinci bir çözüm, ikisinin
     * ayrışması demekti.
     */
    const aktifUstHesapId = ctx.managerAccountId;
    const ustHesapVar = aktifUstHesapId !== null;

    /*
     * "TÜM ŞİRKETLER" ÜST HESABA ÖZEL ve öyle kalıyor: mod ajansın
     * GENEL BAKIŞI ve altındaki şirket kümesi üst hesaptan geliyor. Bir
     * danışmanın iki şirkette üyeliği olması onu ajans yapmıyor.
     */
    if (organizationId === TUM_SIRKETLER) {
      if (!ustHesapVar) {
        throw new BadRequestException('Bu hesabın bağlı olduğu bir üst hesap yok');
      }
      return TUM_SIRKETLER;
    }

    /*
     * ═══ İKİ YOL: ÜST HESAP VEYA ÜYELİK ═══
     *
     * Önce YALNIZCA üst hesap yolu vardı ve şirket seviyesi yetkiyi
     * KULLANILAMAZ yapıyordu: danışmana bir şirketin tamamına yetki
     * veriliyor, üyelik satırı o şirkette açılıyor, ama geçmeye
     * çalıştığında "Bu hesabın bağlı olduğu bir üst hesap yok" hatasını
     * alıyordu. Yetki var, kapı yok.
     *
     * İkinci yol `tenant-context.service.ts`teki `izinliOrgIdler` ile
     * AYNI kuralı uyguluyor: üyeliğin olduğu şirket erişilebilir. İkisinin
     * ayrışması, seçicide görünen ama tıklanınca reddedilen bir satır
     * demekti — kullanıcının gördüğü hâlin ta kendisi.
     */
    if (ustHesapVar) {
      const kardes = await this.admin.organization.findFirst({
        where: {
          id: organizationId,
          managerAccountId: aktifUstHesapId,
          status: 'active',
        },
        select: { id: true },
      });
      if (kardes) return kardes.id;
    }

    const kendiUyeligi = await this.admin.membership.findFirst({
      where: {
        userId: ctx.userId,
        orgId: organizationId,
        organization: { status: 'active' },
      },
      select: { id: true },
    });
    if (kendiUyeligi) return organizationId;

    throw new BadRequestException('Bu şirkete erişim yetkiniz yok');
  }

  /**
   * ═══ ÜST HESABA GEÇİŞ YETKİSİ ═══
   *
   * İki yol var ve ikisi de `TenantContextService`teki listeyle AYNI kuralı
   * uyguluyor:
   *   · ÜYELİK — kullanıcının o üst hesapta org geneli bir rolü var,
   *   · PLATFORM SAHİBİ — Advetics'i işleten taraf, henüz üyesi olmadığı
   *     hesaba da geçebiliyor (kurduğu hesabı ayarlaması gerekiyor).
   *
   * İKİSİNİN AYRIŞMASI, seçicide görünen ama tıklanınca reddedilen bir
   * satır demekti — bu depoda bir kez yaşanmış bir hâl.
   */
  async assertManagerAccountAccess(ctx: TenantContext, managerAccountId: string): Promise<void> {
    const hesap = await this.admin.managerAccount.findFirst({
      where: { id: managerAccountId, status: 'active' },
      select: { id: true },
    });
    if (!hesap) throw new BadRequestException('Bu üst hesap bulunamadı');

    if (ctx.platformAdmin) return;

    const uyelik = await this.admin.managerMembership.findFirst({
      where: { userId: ctx.userId, managerAccountId },
      select: { role: true },
    });
    if (!uyelik || !isOrgScopedRole(uyelik.role as Role)) {
      throw new BadRequestException('Bu üst hesaba erişim yetkiniz yok');
    }
  }

  /**
   * SEÇİLEN WORKSPACE HANGİ ŞİRKETTE — ve kullanıcı oraya erişebiliyor mu.
   *
   * ═══ NEDEN AYRI BİR METOT ═══
   *
   * Önce iki ayrı adım vardı: erişim kontrolü `ctx.clientIds` listesine
   * bakıyor, şirket çözümü AYRI bir metotta yapılıyordu. O liste YALNIZCA
   * AKTİF ŞİRKETİN workspace'lerini taşıyor ve kontrol çözümden ÖNCE
   * koşuyordu: A şirketindeyken B'nin bir workspace'ini seçmek HER ZAMAN
   * "Bu workspace'e erişim yetkiniz yok" ile düşüyordu. Seçici o
   * workspace'i listeliyor, tıklanınca reddediliyordu — kullanıcının
   * gördüğü hâl birebir buydu.
   *
   * İkiye bölünmüş olması hatanın SEBEBİYDİ: iki adımın sırası bir
   * kuraldı ve o kuralı hiçbir şey yazmıyordu. Bugün tek metot.
   *
   * "Tüm şirketler" modunda çalışıyordu çünkü orada liste bütün ajansı
   * kapsıyor; yani arıza yalnızca ŞİRKET kapsamındayken görünüyordu.
   *
   * SIRA ÖNEMLİ: önce hedef şirkete geçiş yetkisi (`assertOrgAccess` —
   * üst hesap VEYA üyelik), sonra O ŞİRKETTE bu workspace'e erişim.
   * Yalnızca ikincisine bakmak, şirkete geçemeyen birine workspace
   * açardı; yalnızca birincisine bakmak, şirketteki HER workspace'i.
   */
  async workspaceKapsami(ctx: TenantContext, clientId: string): Promise<string> {
    const client = await this.admin.client.findUnique({
      where: { id: clientId },
      select: { orgId: true, status: true, organization: { select: { status: true } } },
    });
    if (!client || client.status === 'archived' || client.organization.status !== 'active') {
      throw new BadRequestException('Bu workspace bulunamadı');
    }

    /*
     * AYNI ŞİRKET: bağlamdaki liste zaten doğru cevabı taşıyor ve
     * `TenantContextService` onu veritabanından kurmuş durumda. İkinci bir
     * sorgu, aynı kuralı iki yerde tutmak olurdu.
     */
    if (client.orgId === ctx.orgId) {
      if (!ctx.clientIds.includes(clientId)) {
        throw new BadRequestException('Bu workspace’e erişim yetkiniz yok');
      }
      return client.orgId;
    }

    // ŞİRKETE GEÇİŞ YETKİSİ — yoksa buradan atıyor.
    await this.assertOrgAccess(ctx, client.orgId);

    /*
     * ÜST HESAP AJANSIN TAMAMINI KAPSIYOR. Kardeş şirkette üyelik satırı
     * olmayabiliyor (erişim üst hesap rolünden geliyor) ve orada üyelik
     * aramak, ajans yöneticisini kendi ajansının workspace'lerinden
     * dışarıda bırakırdı.
     */
    if (ctx.managerAccountId) return client.orgId;

    const uyelik = await this.admin.membership.findFirst({
      where: {
        userId: ctx.userId,
        orgId: client.orgId,
        // ŞİRKET GENELİ üyelik o şirketin HEPSİNİ açıyor; workspace bazlı
        // üyelik yalnızca kendi satırını.
        OR: [{ clientId: null }, { clientId }],
      },
      select: { id: true },
    });
    if (!uyelik) {
      throw new BadRequestException('Bu workspace’e erişim yetkiniz yok');
    }
    return client.orgId;
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
