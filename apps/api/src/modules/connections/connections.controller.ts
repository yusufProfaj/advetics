import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  PLATFORMS,
  assignToClientSchema,
  startOAuthSchema,
  toggleAccountSyncSchema,
  type AssignToClientInput,
  type Platform,
  type StartOAuthInput,
  type TenantContext,
  type ToggleAccountSyncInput,
} from '@advetics/shared';
import {
  CurrentTenant,
  Public,
  RequireOrgAdmin,
  RequirePermissions,
} from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { CONFIG, type AppConfig } from '../../config/configuration';
import { ConnectionsService } from './connections.service';
import { MetaWebhookService } from './meta-webhook.service';

@Controller('connections')
export class ConnectionsController {
  constructor(
    private readonly connections: ConnectionsService,
    private readonly metaWebhook: MetaWebhookService,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private meta(req: AuthedRequest) {
    return {
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      requestId: req.requestId,
    };
  }

  private assertPlatform(value: string): Platform {
    if (!(PLATFORMS as readonly string[]).includes(value)) {
      // Kapsam kilidi: yalnızca meta ve google. Bilinmeyen platform 404.
      throw new Error(`Desteklenmeyen platform: ${value}`);
    }
    return value as Platform;
  }

  /** Hangi platformlar yapılandırılmış — UI butonları buna göre aktif olur. */
  @Get('availability')
  @RequirePermissions('connection.read')
  availability() {
    return this.connections.availability();
  }

  @Get()
  @RequirePermissions('connection.read')
  list(@CurrentTenant() ctx: TenantContext, @Query('clientId') clientId?: string) {
    return this.connections.list(ctx, clientId ?? null);
  }

  /**
   * OAuth akışını başlatır ve yetkilendirme URL'sini döndürür.
   *
   * Sunucudan 302 vermek yerine URL döndürüyoruz: istek fetch ile geliyor ve
   * tarayıcı yönlendirmeyi kendisi yapmalı — XHR üzerinden gelen bir 302
   * platformun izin ekranını görünmez kılar.
   */
  /**
   * ORG YÖNETİCİSİ İŞİ — bağlantı artık ajansa kuruluyor.
   *
   * Tek bir Meta kimliği bütün müşterileri besliyor; onu bağlamak ya da
   * değiştirmek portföyün tamamını etkiliyor. RLS de aynı şeyi söylüyor
   * (`adv_oauth_states_insert`, ajans geneli state için `is_org_admin`), ama
   * decorator olmadan hata ham bir politika ihlali olarak çıkar ve sebebi
   * anlaşılmazdı.
   */
  @Post('authorize')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('connection.write')
  @RequireOrgAdmin()
  startOAuth(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(startOAuthSchema)) dto: StartOAuthInput,
    @Req() req: AuthedRequest,
  ) {
    return this.connections.startOAuth(
      ctx,
      dto.platform,
      { redirectTo: dto.redirectTo, forceReconsent: dto.forceReconsent },
      this.meta(req),
    );
  }

  /**
   * Platformdan dönüş.
   *
   * @Public: kullanıcı Meta/Google'dan üst düzey bir GET yönlendirmesiyle döner
   * ve access token'ı o sırada dolmuş olabilir. Yetki kaynağı `state` satırıdır
   * — tek kullanımlık, süreli, kim/hangi müşteri bilgisini taşır.
   */
  @Public()
  @Get(':platform/callback')
  async callback(
    @Param('platform') platformParam: string,
    @Res() res: Response,
    @Req() req: AuthedRequest,
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
    @Query('error_description') errorDescription?: string,
    // Meta bu iki parametreyi STANDART DIŞI olarak gönderiyor.
    //
    // OAuth 2.0 hata için `error` + `error_description` tanımlar ve kullanıcı
    // izni reddettiğinde Meta da onları kullanır. Ama "URL Yüklenemedi" gibi
    // yapılandırma hatalarında `error_code` + `error_message` gönderiyor.
    // Yalnızca standart isimleri okumak, bu hataları görünmez kılıyordu:
    // callback "kod yok" yoluna düşüp ham 400 döndürüyordu ve kullanıcı
    // panelde değil bir JSON hata sayfasında kalıyordu.
    @Query('error_code') errorCode?: string,
    @Query('error_message') errorMessage?: string,
  ) {
    const platform = this.assertPlatform(platformParam);

    const { redirectPath } = await this.connections.handleCallback(
      platform,
      { code, state, error, errorDescription, errorCode, errorMessage },
      this.meta(req),
    );

    // Paneli aynı origin'de servis ediyoruz; göreli yol yeterli ve açık
    // yönlendirme (open redirect) riski taşımıyor.
    const base = this.config.platforms.oauthRedirectBaseUrl ?? '';
    res.redirect(`${base}${redirectPath}`);
  }

  /** Yeniden yetkilendirme — needs_reauth durumundaki bağlantı için. */
  @Post(':id/reauthorize')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('connection.write')
  @RequireOrgAdmin()
  async reauthorize(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('platform') platformParam: string,
    @Req() req: AuthedRequest,
  ) {
    const platform = this.assertPlatform(platformParam);
    return this.connections.startOAuth(
      ctx,
      platform,
      { forceReconsent: true, redirectTo: '/ayarlar/baglantilar' },
      this.meta(req),
    );
  }

  @Post(':id/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('connection.read')
  verify(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.connections.verify(ctx, id);
  }

  @Post(':id/refresh-accounts')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('connection.write')
  refreshAccounts(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.connections.refreshAccounts(ctx, id, this.meta(req));
  }

  /**
   * Reklam hesabının senkronizasyonunu aç/kapat.
   *
   * Bu bayrak API kotası tüketimini doğrudan belirler: her açık hesap Modül 3'te
   * saatte birden fazla kez sorgulanacak. Keşfedilen hesaplar bu yüzden kapalı
   * başlar.
   */
  @Patch('ad-accounts/:id/sync')
  @RequirePermissions('connection.write')
  setAccountSync(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(toggleAccountSyncSchema)) dto: ToggleAccountSyncInput,
    @Req() req: AuthedRequest,
  ) {
    return this.connections.setAccountSync(ctx, id, dto.syncEnabled, this.meta(req));
  }

  /**
   * Reklam hesabını bir müşteriye ata / havuza geri koy.
   *
   * ORG YÖNETİCİSİ İŞİ. Havuz, ajansın erişebildiği TÜM reklam hesaplarının
   * listesi (Meta'da 157) ve çoğu başka müşterilere ait; RLS de havuz
   * satırlarını yalnızca org yöneticisine gösteriyor. Decorator olmasaydı
   * müşteri düzeyindeki bir kullanıcı için sorgu 0 satır etkiler ve hata
   * "kayıt bulunamadı" olurdu — yetki sorunu olduğu hiç anlaşılmazdı.
   */
  @Patch('ad-accounts/:id/client')
  @RequirePermissions('connection.write')
  @RequireOrgAdmin()
  assignAdAccount(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(assignToClientSchema)) dto: AssignToClientInput,
    @Req() req: AuthedRequest,
  ) {
    return this.connections.assignAdAccount(ctx, id, dto.clientId, this.meta(req));
  }

  /**
   * Facebook sayfasını / Instagram hesabını bir müşteriye ata — havuz modeli
   * reklam hesaplarındakiyle aynı.
   */
  @Patch('social-profiles/:id/client')
  @RequirePermissions('connection.write')
  @RequireOrgAdmin()
  assignSocialProfile(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(assignToClientSchema)) dto: AssignToClientInput,
    @Req() req: AuthedRequest,
  ) {
    return this.connections.assignSocialProfile(ctx, id, dto.clientId, this.meta(req));
  }

  /**
   * ORG YÖNETİCİSİ İŞİ: ajans geneli bir bağlantıyı kaldırmak BÜTÜN
   * müşterilerin senkronizasyonunu birden durdurur.
   */
  @Post(':id/disconnect')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('connection.write')
  @RequireOrgAdmin()
  disconnect(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.connections.disconnect(ctx, id, this.meta(req));
  }

  // ---------------------------------------------------------------------------
  // Meta sunucudan sunucuya çağrıları
  //
  // @Public: Meta'nın bizim oturumumuz yok. Kimlik doğrulama gövdedeki
  // `signed_request` HMAC imzasıyla yapılıyor — imzayı yalnızca app secret'a
  // sahip olan üretebilir.
  // ---------------------------------------------------------------------------

  /**
   * Kullanıcı Facebook'tan uygulamayı kaldırdı.
   *
   * Bu uç nokta olmadan iptal edilmiş bir bağlantı sistemde "aktif" görünmeye
   * devam ediyor ve senkronizasyon her denemede 401 alıyor.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('meta/deauthorize')
  async metaDeauthorize(
    @Body('signed_request') signedRequest: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!signedRequest) throw new BadRequestException('signed_request gerekli');
    const payload = this.metaWebhook.verifySignedRequest(signedRequest);
    const result = await this.metaWebhook.handleDeauthorize(payload.user_id!, {
      ip: req.ip ?? null,
    });
    return { ok: true, ...result };
  }

  /**
   * Kullanıcı verilerinin silinmesini talep etti.
   *
   * Meta bu yanıt biçimini bekliyor: `{ url, confirmation_code }`. Kullanıcı
   * `url` adresinden talebin durumunu görebiliyor.
   */
  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('meta/data-deletion')
  async metaDataDeletion(
    @Body('signed_request') signedRequest: string | undefined,
    @Req() req: AuthedRequest,
  ) {
    if (!signedRequest) throw new BadRequestException('signed_request gerekli');
    const payload = this.metaWebhook.verifySignedRequest(signedRequest);
    const { confirmationCode, statusUrl } = await this.metaWebhook.handleDataDeletion(
      payload.user_id!,
      { ip: req.ip ?? null },
    );
    // Alan adları Meta'nın şartnamesine göre snake_case olmak ZORUNDA.
    return { url: statusUrl, confirmation_code: confirmationCode };
  }

  /** Silme talebinin durumu — kullanıcı Meta'dan gelen kodla sorgular. */
  @Public()
  @Get('meta/data-deletion/:code')
  async metaDataDeletionStatus(@Param('code') code: string) {
    const status = await this.metaWebhook.getDeletionStatus(code);
    if (!status) throw new NotFoundException('Bu koda ait talep bulunamadı');
    return status;
  }

}
