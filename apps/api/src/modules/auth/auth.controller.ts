import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  changePasswordSchema,
  confirmPasswordResetSchema,
  loginSchema,
  registerOrganizationSchema,
  requestPasswordResetSchema,
  switchClientSchema,
  type ChangePasswordInput,
  type ConfirmPasswordResetInput,
  type LoginInput,
  type RegisterOrganizationInput,
  type RequestPasswordResetInput,
  type SwitchClientInput,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, Public } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { AuthService } from './auth.service';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setActiveClientCookie,
  setAuthCookies,
} from './cookies';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private meta(req: AuthedRequest) {
    return {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
    };
  }

  // ---------------------------------------------------------------------------
  // Kayıt & giriş
  // ---------------------------------------------------------------------------

  /**
   * İlk kurulum. Organizasyon + owner kullanıcıyı birlikte oluşturur.
   *
   * NOT: Bu endpoint MVP'de açıktır çünkü henüz tek bir organizasyon var.
   * Çok kiracılı satışa geçildiğinde davet zorunlu hale getirilmeli veya
   * bu rota kapatılmalıdır — aksi halde herkes kendine organizasyon açar.
   */
  @Public()
  @Post('register')
  async register(
    @Body(zodBody(registerOrganizationSchema)) dto: RegisterOrganizationInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.registerOrganization(dto, this.meta(req));
    setAuthCookies(res, this.config, result.tokens);
    return result.session;
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('login')
  async login(
    @Body(zodBody(loginSchema)) dto: LoginInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.auth.login(dto, this.meta(req));
    setAuthCookies(res, this.config, result.tokens);
    return result.session;
  }

  /**
   * Access token yenileme.
   *
   * @Public çünkü access token'ın süresi dolmuş olabilir — bu endpoint'in var
   * olma sebebi tam olarak budur. Yetki, refresh cookie'sinin kendisidir.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  async refresh(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw new UnauthorizedException('Oturum bulunamadı');

    const tokens = await this.auth.refresh(token, this.meta(req));
    setAuthCookies(res, this.config, tokens);
    return { ok: true, expiresAt: tokens.refreshExpiresAt };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('logout')
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE] as string | undefined);
    clearAuthCookies(res, this.config);
    return { ok: true };
  }

  /** Tüm cihazlardan çıkış. Şifre sızıntısı şüphesinde kullanılır. */
  @HttpCode(HttpStatus.OK)
  @Post('logout-all')
  async logoutAll(
    @CurrentTenant() ctx: TenantContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logoutEverywhere(ctx);
    clearAuthCookies(res, this.config);
    return { ok: true };
  }

  // ---------------------------------------------------------------------------
  // Oturum durumu
  // ---------------------------------------------------------------------------

  /** Frontend'in açılışta çağırdığı endpoint. Kullanıcı, org, yetkiler, müşteriler. */
  @Get('session')
  async session(@CurrentTenant() ctx: TenantContext) {
    return this.auth.buildSession(ctx.userId, ctx.activeClientId);
  }

  /**
   * Aktif müşteri değişimi.
   *
   * Seçim cookie'de tutulur ve HER İSTEKTE yeniden doğrulanır — cookie'yi elle
   * değiştirmek erişim kazandırmaz, çünkü TenantContextService seçimi
   * kullanıcının gerçek membership listesine karşı süzer.
   */
  @HttpCode(HttpStatus.OK)
  @Post('switch-client')
  async switchClient(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(switchClientSchema)) dto: SwitchClientInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.auth.assertClientAccess(ctx, dto.clientId);
    setActiveClientCookie(res, this.config, dto.clientId);
    return this.auth.buildSession(ctx.userId, dto.clientId);
  }

  // ---------------------------------------------------------------------------
  // Şifre
  // ---------------------------------------------------------------------------

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('password/reset-request')
  async requestPasswordReset(
    @Body(zodBody(requestPasswordResetSchema)) dto: RequestPasswordResetInput,
    @Req() req: AuthedRequest,
  ) {
    const result = await this.auth.requestPasswordReset(dto.email, this.meta(req));
    // Kullanıcı var mı yok mu bilgisini sızdırmamak için yanıt daima aynı.
    return { ok: true, ...(result.devToken ? { devToken: result.devToken } : {}) };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('password/reset-confirm')
  async confirmPasswordReset(
    @Body(zodBody(confirmPasswordResetSchema)) dto: ConfirmPasswordResetInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.confirmPasswordReset(dto.token, dto.password, this.meta(req));
    clearAuthCookies(res, this.config);
    return { ok: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('password/change')
  async changePassword(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(changePasswordSchema)) dto: ChangePasswordInput,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.changePassword(ctx, dto, this.meta(req));
    // Şifre değişince tüm oturumlar düşer — bu isteğin oturumu dahil.
    clearAuthCookies(res, this.config);
    return { ok: true, message: 'Şifre değiştirildi. Lütfen tekrar giriş yapın.' };
  }
}
