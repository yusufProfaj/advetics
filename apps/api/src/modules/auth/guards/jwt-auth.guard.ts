import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY, OKUMA_ANAHTARI_KEY } from '../../../common/decorators';
import type { AuthedRequest } from '../../../common/types/request';
import {
  ACCESS_COOKIE,
  ACTIVE_CLIENT_COOKIE,
  ACTIVE_MANAGER_COOKIE,
  ACTIVE_ORG_COOKIE,
} from '../cookies';
import { okumaAnahtariMi } from '../okuma-anahtari';
import { OkumaAnahtariDogrulayici } from '../okuma-anahtari-dogrulayici.service';
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
    private readonly okumaAnahtari: OkumaAnahtariDogrulayici,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    /*
     * ═══ OKUMA ANAHTARI — İKİ YÖNLÜ AYRIM ═══
     *
     * Anahtar YALNIZCA işaretli uçlarda geçer, işaretli uçlar YALNIZCA
     * anahtarla çağrılır. İlk yön anahtarı okuma dışına taşımıyor (yazan
     * bir uca ulaşamıyor); ikinci yön MCP ucunu çerezli oturumdan
     * ayırıyor (tarayıcıdan sahte istek, oturum çerezini taşıyarak ona
     * ulaşamıyor). Anahtar yalnızca `Authorization` başlığından okunuyor;
     * çerezden okumak ikinci yönü delerdi.
     */
    const okumaUcu =
      this.reflector.getAllAndOverride<boolean | undefined>(OKUMA_ANAHTARI_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) === true;
    const bearer = this.bearer(req);
    if (bearer !== null && okumaAnahtariMi(bearer)) {
      if (!okumaUcu) {
        throw new ForbiddenException(
          'Okuma anahtarı yalnızca okuma API uçlarında (MCP) kullanılabilir',
        );
      }
      return this.okumaAnahtariyla(req, bearer);
    }
    if (okumaUcu) {
      throw new UnauthorizedException(
        'Bu uç yalnızca okuma anahtarıyla çağrılır (Authorization: Bearer adv_ro_…)',
      );
    }

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

    /*
     * SEÇİLİ ŞİRKET — üst hesap (MCC) altında geçiş yapılmışsa.
     *
     * `x-active-client` ile aynı desen ve aynı güven seviyesi: burada
     * güvenilmez veri kabul ediliyor, `TenantContextService` içinde
     * veritabanından hesaplanan izin listesine karşı süzülüyor.
     */
    const requestedOrgId =
      req.get('x-active-org') ?? (req.cookies?.[ACTIVE_ORG_COOKIE] as string | undefined);

    /*
     * SEÇİLİ ÜST HESAP — bir kullanıcı birden çok üst hesaba üye olabiliyor
     * ve Advetics'i işleten taraf hepsine geçebiliyor. Aynı desen, aynı
     * güven seviyesi: burada kabul, orada süzgeç.
     */
    const requestedManagerAccountId =
      req.get('x-active-manager') ?? (req.cookies?.[ACTIVE_MANAGER_COOKIE] as string | undefined);

    const identity = await this.tenantContext.resolve(
      payload.sub,
      requestedClientId ?? null,
      requestedOrgId ?? null,
      requestedManagerAccountId ?? null,
    );

    /*
     * KARŞILAŞTIRMA `actor.orgId` İLE — `context.orgId` İLE DEĞİL.
     *
     * `actor.orgId` kullanıcının EV organizasyonu ve token da onu taşıyor;
     * `context.orgId` ise şu an SEÇİLİ olan şirket ve üst hesap altında
     * ondan farklı olabiliyor. Buraya `context.orgId` yazmak, kardeş şirkete
     * geçen kullanıcının HER isteğini "Oturum geçersiz" ile düşürürdü.
     */
    if (identity.actor.orgId !== payload.org) {
      // Token'daki org ile kullanıcının gerçek org'u uyuşmuyor.
      // Normal akışta imkansız; bir manipülasyon göstergesidir.
      throw new UnauthorizedException('Oturum geçersiz');
    }

    req.actor = identity.actor;
    req.tenant = identity.context;
    return true;
  }

  /**
   * Okuma anahtarıyla gelen istek. Bağlam EV bağlamı (seçim yok): MCP
   * araçları kapsamı her çağrıda kendi parametresinden yeniden çözüyor
   * (`okuma-araclari.service.ts`), yani burada çerez/başlık seçimi okumak
   * gereksiz ve istemcinin elindeki ikinci bir kapsam kanalı olurdu.
   */
  private async okumaAnahtariyla(req: AuthedRequest, anahtar: string): Promise<boolean> {
    const { userId, anahtarId } = await this.okumaAnahtari.dogrula(anahtar, req.ip ?? null);
    const identity = await this.tenantContext.resolve(userId, null, null, null);
    // Doğrulayıcı bayrağı zaten okudu; bağlam ayrı bir sorgudan geliyor ve
    // ikisinin arasında bayrak geri alınmış olabilir. İkinci kapı ucuz.
    if (!identity.context.platformAdmin) {
      throw new UnauthorizedException('Okuma anahtarının sahibi artık platform sahibi değil');
    }
    req.actor = identity.actor;
    req.tenant = identity.context;
    req.okumaAnahtariId = anahtarId;
    return true;
  }

  private bearer(req: AuthedRequest): string | null {
    const authHeader = req.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7).trim() || null;
    }
    return null;
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
