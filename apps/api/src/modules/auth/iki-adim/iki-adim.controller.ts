import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ikiAdimKodSchema,
  ikiAdimKurulumOnaySchema,
  ikiAdimSirketSchema,
  ikiAdimUygulamaKoduSchema,
  type IkiAdimDurumu,
  type IkiAdimGirisSonucu,
  type IkiAdimKodGirdisi,
  type IkiAdimKurulumOnayGirdisi,
  type IkiAdimKurtarmaKodlari,
  type IkiAdimKurulumBilgisi,
  type IkiAdimSirketGirdisi,
  type IkiAdimUygulamaKoduGirdisi,
  type TenantContext,
} from '@advetics/shared';
import { CurrentTenant, Public, RequireOrgAdmin, RequirePermissions } from '../../../common/decorators';
import { zodBody } from '../../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../../common/types/request';
import { CONFIG, type AppConfig } from '../../../config/configuration';
import { AuthService } from '../auth.service';
import {
  IKI_ADIM_COOKIE,
  REFRESH_COOKIE,
  clearIkiAdimCookie,
  setAuthCookies,
} from '../cookies';
import { TokenService } from '../token.service';
import { IkiAdimService } from './iki-adim.service';

/**
 * ═══ İKİ ADIMLI DOĞRULAMA UÇLARI ═══
 *
 * İki grup var ve kimlikleri FARKLI yerden geliyor:
 *
 *   · GİRİŞ (`/auth/2fa/giris...`) — `@Public()`. Oturum henüz yok; kimlik
 *     ara çerezdeki imzalı token'dan (`adv_mfa`). Bekçi bu uçlara hiç
 *     karışmıyor, doğrulama `TokenService.verifyIkiAdimToken` içinde.
 *   · HESAP (`/auth/2fa`, `/auth/2fa/...`) — normal oturum; kimlik
 *     `ctx.userId`. Gövdede kullanıcı kimliği ALINMIYOR: başkasının 2FA'sına
 *     dokunan tek uç yöneticinin sıfırlaması ve o RLS'ten geçiyor.
 */
@Controller()
export class IkiAdimController {
  constructor(
    private readonly ikiAdim: IkiAdimService,
    private readonly auth: AuthService,
    private readonly tokens: TokenService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId };
  }

  private araToken(req: AuthedRequest): string {
    const t = req.cookies?.[IKI_ADIM_COOKIE] as string | undefined;
    if (!t) {
      throw new UnauthorizedException(
        'Doğrulama adımının süresi doldu. E-posta ve şifrenle yeniden giriş yap.',
      );
    }
    return t;
  }

  // ---------------------------------------------------------------------------
  // Girişin ikinci adımı
  // ---------------------------------------------------------------------------

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/giris')
  async giris(
    @Body(zodBody(ikiAdimKodSchema)) dto: IkiAdimKodGirdisi,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IkiAdimGirisSonucu> {
    const sonuc = await this.auth.ikiAdimlaGiris(this.araToken(req), dto.kod, this.meta(req));
    clearIkiAdimCookie(res, this.config);
    setAuthCookies(res, this.config, sonuc.tokens);
    return {
      kurtarmaKoduKullanildi: sonuc.kurtarmaKoduKullanildi,
      kalanKurtarmaKodu: sonuc.kalanKurtarmaKodu,
    };
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/giris/kurulum')
  girisKurulum(@Req() req: AuthedRequest): Promise<IkiAdimKurulumBilgisi> {
    return this.auth.girisKurulumBaslat(this.araToken(req));
  }

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/giris/kurulum/onay')
  async girisKurulumOnay(
    @Body(zodBody(ikiAdimUygulamaKoduSchema)) dto: IkiAdimUygulamaKoduGirdisi,
    @Req() req: AuthedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<IkiAdimKurtarmaKodlari> {
    const sonuc = await this.auth.girisKurulumOnayla(this.araToken(req), dto.kod, this.meta(req));
    clearIkiAdimCookie(res, this.config);
    setAuthCookies(res, this.config, sonuc.tokens);
    return { kurtarmaKodlari: sonuc.kurtarmaKodlari };
  }

  // ---------------------------------------------------------------------------
  // Kendi hesabı (Hesabım ekranı)
  // ---------------------------------------------------------------------------

  @Get('auth/2fa')
  durum(@CurrentTenant() ctx: TenantContext): Promise<IkiAdimDurumu> {
    return this.ikiAdim.durum(ctx);
  }

  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/kurulum')
  kurulum(@CurrentTenant() ctx: TenantContext): Promise<IkiAdimKurulumBilgisi> {
    return this.ikiAdim.kurulumBaslat(ctx.userId);
  }

  /**
   * Kurulumu onaylar. BU TARAYICI DIŞINDAKİ OTURUMLAR KAPANIYOR: parolası
   * sızmış bir hesapta saldırganın açık oturumu 2FA açıldıktan sonra da
   * yaşardı. Refresh çerezi `/api/auth` altında bu uca da geliyor; ailesi
   * istisna tutuluyor.
   */
  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/kurulum/onay')
  async kurulumOnay(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ikiAdimKurulumOnaySchema)) dto: IkiAdimKurulumOnayGirdisi,
    @Req() req: AuthedRequest,
  ): Promise<IkiAdimKurtarmaKodlari> {
    // PAROLA YENİDEN SORULUYOR (Ö-1): oturum çerezi tek başına 2FA kurmaya yetmemeli.
    const kurtarmaKodlari = await this.ikiAdim.kurulumOnayla(ctx.userId, dto.kod, dto.parola);
    await this.tokens.revokeOthersForUser(
      ctx.userId,
      req.cookies?.[REFRESH_COOKIE] as string | undefined,
      'iki_adim_acildi',
    );
    return { kurtarmaKodlari };
  }

  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/kapat')
  async kapat(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ikiAdimKodSchema)) dto: IkiAdimKodGirdisi,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    await this.ikiAdim.kapat(ctx, dto.kod, this.meta(req));
    return { ok: true };
  }

  @HttpCode(HttpStatus.OK)
  @Post('auth/2fa/kurtarma-kodlari')
  kurtarmaKodlari(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ikiAdimUygulamaKoduSchema)) dto: IkiAdimUygulamaKoduGirdisi,
    @Req() req: AuthedRequest,
  ): Promise<IkiAdimKurtarmaKodlari> {
    return this.ikiAdim
      .kurtarmaKodlariniYenile(ctx, dto.kod, this.meta(req))
      .then((kurtarmaKodlari) => ({ kurtarmaKodlari }));
  }

  // ---------------------------------------------------------------------------
  // Yönetici
  // ---------------------------------------------------------------------------

  @Patch('auth/2fa/sirket')
  @RequireOrgAdmin()
  async sirket(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(ikiAdimSirketSchema)) dto: IkiAdimSirketGirdisi,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    await this.ikiAdim.sirketZorunluAyarla(ctx, dto.zorunlu, this.meta(req));
    return { ok: true };
  }

  /**
   * Başka bir kullanıcının 2FA'sını sıfırlar. `members/:userId` altında ve
   * aynı kapılarla (`@RequireOrgAdmin` + `user.write`): parola değiştirmekle
   * aynı ağırlıkta bir işlem.
   */
  @HttpCode(HttpStatus.OK)
  @Post('members/:userId/2fa/sifirla')
  @RequireOrgAdmin()
  @RequirePermissions('user.write')
  async sifirla(
    @CurrentTenant() ctx: TenantContext,
    @Param('userId', ParseUUIDPipe) userId: string,
    @Req() req: AuthedRequest,
  ): Promise<{ ok: true }> {
    await this.ikiAdim.kullaniciyiSifirla(ctx, userId, this.meta(req));
    return { ok: true };
  }
}
