import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../common/decorators';
import type { AuthedRequest } from '../../../common/types/request';
import { ACCESS_COOKIE, ACTIVE_CLIENT_COOKIE } from '../cookies';
import { TenantContextService } from '../tenant-context.service';
import { TokenService } from '../token.service';

/**
 * Kimlik doğrulama + tenant bağlamı kurulumu.
 *
 * GLOBAL olarak bağlıdır: varsayılan davranış KİLİTLİDİR. Bir rotayı açmak
 * `@Public()` ile kasıtlı bir eylem gerektirir. Tersi tasarım (varsayılan açık)
 * er ya da geç korunmayı unutulmuş bir endpoint üretir.
 *
 * Bu guard'dan sonra `req.tenant` doludur ve o noktadan itibaren tüm
 * veritabanı erişimi `prisma.withTenant(req.tenant, ...)` üzerinden yapılır.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly tenantContext: TenantContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException('Oturum açmanız gerekiyor');
    }

    const payload = await this.tokens.verifyAccessToken(token);

    // Aktif müşteri seçimi: header öncelikli (API istemcileri için),
    // cookie yedek (tarayıcı için). Her ikisi de erişim listesine karşı
    // TenantContextService içinde doğrulanır — burada güvenilmez veri kabul
    // ediyoruz, orada süzülüyor.
    const requestedClientId =
      req.get('x-active-client') ?? (req.cookies?.[ACTIVE_CLIENT_COOKIE] as string | undefined);

    const identity = await this.tenantContext.resolve(payload.sub, requestedClientId ?? null);

    if (identity.actor.orgId !== payload.org) {
      // Token'daki org ile kullanıcının gerçek org'u uyuşmuyor.
      // Normal akışta imkansız; bir manipülasyon göstergesidir.
      throw new UnauthorizedException('Oturum geçersiz');
    }

    req.actor = identity.actor;
    req.tenant = identity.context;
    return true;
  }

  private extractToken(req: AuthedRequest): string | null {
    const authHeader = req.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7).trim() || null;
    }
    const cookieToken = req.cookies?.[ACCESS_COOKIE] as string | undefined;
    return cookieToken ?? null;
  }
}
