import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaAdminService } from '../../prisma/prisma-admin.service';
import { CONFIG, type AppConfig } from '../../config/configuration';

export interface AccessTokenPayload {
  sub: string; // userId
  org: string; // orgId
  typ: 'access';
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

interface TokenMeta {
  ip?: string | null;
  userAgent?: string | null;
}

/** '15m' | '30d' | '12h' | '900s' → milisaniye */
export function parseTtl(ttl: string): number {
  const match = /^(\d+)\s*(ms|s|m|h|d)$/.exec(ttl.trim());
  if (!match) throw new Error(`Geçersiz TTL formatı: ${ttl}`);
  const value = Number(match[1]);
  const unit = match[2];
  const factors: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };
  return value * (factors[unit as string] ?? 0);
}

/**
 * Token üretimi, doğrulaması ve rotasyonu.
 *
 * Tasarım:
 *   - Access token kısa ömürlü JWT'dir (varsayılan 15 dk). Stateless doğrulanır.
 *   - Refresh token opak rastgele bir dizedir; veritabanında yalnızca SHA-256
 *     hash'i tutulur. DB sızsa bile token'lar kullanılamaz.
 *   - Her refresh kullanımı token'ı DÖNDÜRÜR (rotation) ve eskisini iptal eder.
 *   - Kullanılmış bir token tekrar sunulursa (reuse) bu bir hırsızlık sinyalidir:
 *     tüm token AİLESİ iptal edilir, kullanıcı her yerden düşer.
 *
 * Bu servis PrismaAdminService kullanır çünkü token doğrulaması kimlik
 * doğrulamadan ÖNCE gerçekleşir — henüz RLS bağlamı yoktur.
 */
@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly db: PrismaAdminService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async signAccessToken(userId: string, orgId: string): Promise<string> {
    const payload: AccessTokenPayload = { sub: userId, org: orgId, typ: 'access' };
    return this.jwt.signAsync({ ...payload }, {
      secret: this.config.jwt.accessSecret,
      // jsonwebtoken'ın tipleri '15m' gibi şablon literal bekliyor; bizim
      // değerimiz ortamdan gelen düz string. Format zaten parseTtl ile
      // doğrulanıyor, bu yüzden daraltma güvenli.
      expiresIn: this.config.jwt.accessTtl as JwtSignOptions['expiresIn'],
    });
  }

  async verifyAccessToken(token: string): Promise<AccessTokenPayload> {
    try {
      const payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.jwt.accessSecret,
      });
      if (payload.typ !== 'access') throw new Error('wrong token type');
      return payload;
    } catch {
      throw new UnauthorizedException('Oturum geçersiz veya süresi dolmuş');
    }
  }

  /** Yeni bir oturum başlatır (login / register / davet kabul). */
  async issueSession(userId: string, orgId: string, meta: TokenMeta = {}): Promise<IssuedTokens> {
    const familyId = randomUUID();
    return this.issueTokens(userId, orgId, familyId, meta);
  }

  private async issueTokens(
    userId: string,
    orgId: string,
    familyId: string,
    meta: TokenMeta,
    replacesTokenId?: string,
  ): Promise<IssuedTokens> {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + parseTtl(this.config.jwt.refreshTtl));

    const created = await this.db.refreshToken.create({
      data: {
        userId,
        tokenHash: this.hash(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
      },
      select: { id: true },
    });

    if (replacesTokenId) {
      await this.db.refreshToken.update({
        where: { id: replacesTokenId },
        data: { replacedById: created.id },
      });
    }

    const accessToken = await this.signAccessToken(userId, orgId);
    return { accessToken, refreshToken, refreshExpiresAt };
  }

  /**
   * Refresh token'ı döndürür.
   *
   * Reuse detection: sunulan token daha önce iptal edilmişse, aynı aileye ait
   * TÜM token'lar iptal edilir. Meşru kullanıcı bir kez yeniden giriş yapar;
   * saldırganın çaldığı token ise kalıcı olarak ölür.
   */
  async rotate(presentedToken: string, meta: TokenMeta = {}): Promise<IssuedTokens> {
    const tokenHash = this.hash(presentedToken);

    const existing = await this.db.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: { select: { id: true, orgId: true, status: true } } },
    });

    if (!existing) {
      throw new UnauthorizedException('Oturum bulunamadı, lütfen tekrar giriş yapın');
    }

    if (existing.revokedAt) {
      this.logger.error(
        `Refresh token yeniden kullanıldı (olası hırsızlık). userId=${existing.userId} family=${existing.familyId}`,
      );
      await this.revokeFamily(existing.familyId, 'reuse_detected');
      throw new UnauthorizedException(
        'Güvenlik nedeniyle tüm oturumlar sonlandırıldı. Lütfen tekrar giriş yapın.',
      );
    }

    if (existing.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Oturum süresi doldu, lütfen tekrar giriş yapın');
    }

    if (existing.user.status !== 'active') {
      await this.revokeAllForUser(existing.userId, 'user_disabled');
      throw new UnauthorizedException('Hesabınız devre dışı bırakılmış');
    }

    await this.db.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), revokedReason: 'rotated' },
    });

    return this.issueTokens(
      existing.user.id,
      existing.user.orgId,
      existing.familyId,
      meta,
      existing.id,
    );
  }

  async revokeByToken(presentedToken: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { tokenHash: this.hash(presentedToken), revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: 'logout' },
    });
  }

  async revokeFamily(familyId: string, reason: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  async revokeAllForUser(userId: string, reason: string): Promise<void> {
    await this.db.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }
}
