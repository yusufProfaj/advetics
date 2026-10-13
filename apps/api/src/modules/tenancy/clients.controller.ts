import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import {
  createClientSchema,
  updateClientSchema,
  type CreateClientInput,
  type TenantContext,
  type UpdateClientInput,
  clientSetupSchema,
  type ClientSetupInput,
  type ClientSetupResult,
  type ClientChannels,
  type WorkspaceHazirlik,
} from '@advetics/shared';
import { CurrentTenant, RequireOrgAdmin, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AuthedRequest } from '../../common/types/request';
import { ClientsService } from './clients.service';
import { ClientSetupService } from './client-setup.service';
import { ClientChannelsService } from './client-channels.service';
import { HazirlikService } from './hazirlik.service';

@Controller('clients')
export class ClientsController {
  constructor(
    private readonly clients: ClientsService,
    private readonly setupService: ClientSetupService,
    private readonly channels: ClientChannelsService,
    private readonly hazirlik: HazirlikService,
  ) {}

  private meta(req: AuthedRequest) {
    return { ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null, requestId: req.requestId };
  }

  /**
   * `?arsiv=1` ARŞİVDEKİLERİ döndürüyor (Ayarlar › Şirketler ve
   * workspace'ler › Arşiv). Ayrı bir yol değil sorgu: aynı kaynağın başka
   * bir görünümü ve kapısı aynı (`client.read`); arşivliyi kimin göreceğine
   * RLS karar veriyor (yalnız org yöneticisi, bkz. `listArchived`).
   *
   * Tanınmayan değer (`?arsiv=evet`) ARŞİV DEĞİL normal liste: "1" dışında
   * bir şey yazan çağıran arşivi beklemiyordur ve normal listeyi alıp
   * farkı ekranda görür.
   */
  @Get()
  @RequirePermissions('client.read')
  list(@CurrentTenant() ctx: TenantContext, @Query('arsiv') arsiv?: string) {
    if (arsiv === '1') return this.clients.listArchived(ctx);
    return this.clients.list(ctx);
  }

  @Get(':id')
  @RequirePermissions('client.read')
  findOne(@CurrentTenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.clients.findById(ctx, id);
  }

  /*
   * MÜŞTERİ AÇMAK ARTIK `client.write` YETKİSİYLE — `@RequireOrgAdmin()` ile
   * DEĞİL. O bayrak aynı zamanda kullanıcı oluşturmayı, üyelik vermeyi ve
   * müşteri SİLMEYİ de açıyor; müşteri açabilsin diye personel hesabı açma
   * yetkisi vermek gerekiyordu. `client.write`i taşıyan roller: sahip,
   * yönetici, reklam yöneticisi. Kampanya yöneticisi TAŞIMIYOR, yani
   * kapı daralmadı da genişlemedi de — doğru yere taşındı.
   */
  @Post()
  @RequirePermissions('client.write')
  create(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(createClientSchema)) dto: CreateClientInput,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.create(ctx, dto, this.meta(req));
  }

  /**
   * KURULUM SİHİRBAZI — müşteri, hesap atamaları ve giriş hesabı tek çağrıda.
   *
   * `POST /clients` DURUYOR ve kaldırılmadı: yalnızca müşteri açmak isteyen
   * (ya da API'yi kendi akışında kullanan) biri için hâlâ doğru uç. Sihirbaz
   * onun üzerine bir ADIM, yerine geçen bir şey değil.
   *
   * Aynı yetkiler: `client.write` + org yöneticisi. Sihirbaz hesap ataması ve
   * kullanıcı oluşturma da yapıyor, yani en geniş yetkiyi gerektiren adımın
   * altında kalmamalı.
   */
  @Post('setup')
  @RequirePermissions('client.write')
  setup(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(clientSetupSchema)) dto: ClientSetupInput,
    @Req() req: AuthedRequest,
  ): Promise<ClientSetupResult> {
    return this.setupService.setup(ctx, dto, this.meta(req));
  }

  /**
   * BAĞLI KANALLAR — bu workspace’in Meta Ads / Google Ads / Facebook /
   * Instagram / YouTube görünümü.
   *
   * `client.read` YETİYOR: yalnızca okuyor. Atama ayrı uçlarda ve
   * `connection.write` istiyor — müşteri hesabı kendi kanallarını görebilmeli
   * ama değiştirememeli.
   */
  @Get(':id/channels')
  @RequirePermissions('client.read')
  listChannels(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ClientChannels> {
    return this.channels.list(ctx, id);
  }

  /**
   * MARKA MERKEZİ HAZIRLIK LİSTESİ — "bu workspace reklama hazır mı".
   *
   * `client.read` yetiyor: liste yalnızca okuyor ve müşterinin kendi hesabı
   * da kurulumunun neresinde olduğunu görebilmeli. Bütçe maddesi ayrıca
   * `budget.read` istiyor; yoksa `bilinmiyor` dönüyor (`hazirlik.service.ts`).
   */
  @Get(':id/hazirlik')
  @RequirePermissions('client.read')
  hazirlikListesi(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WorkspaceHazirlik> {
    return this.hazirlik.get(ctx, id);
  }

  /**
   * `status` alanı bu uçtan YALNIZ arşiv kapısını taşıyana açık; değilse
   * 403 (`durumYazabilirMi`, MIMARI Ç-4 — arka kapı kapandı).
   */
  @Patch(':id')
  @RequirePermissions('client.write')
  update(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(updateClientSchema)) dto: UpdateClientInput,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.update(ctx, id, dto, this.meta(req));
  }

  /**
   * ARŞİVDEN GERİ AL — arşivlemeyle AYNI kapı (`client.delete` + org
   * yöneticisi; panelde `PANEL_KAPILARI['workspace.geriAl']`). Arşivleyebilen
   * geri alabilmeli; daha geniş bir kapı arşivi bir oyuncağa, daha dar bir
   * kapı yanlışlıkla arşivlenen workspace'i kurtarılamaz yapardı.
   */
  @Post(':id/geri-al')
  @HttpCode(200)
  @RequireOrgAdmin()
  @RequirePermissions('client.delete')
  geriAl(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.restore(ctx, id, this.meta(req));
  }

  /** Arşivler — kalıcı silmez. Bkz. ClientsService.archive */
  @Delete(':id')
  @RequireOrgAdmin()
  @RequirePermissions('client.delete')
  archive(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: AuthedRequest,
  ) {
    return this.clients.archive(ctx, id, this.meta(req));
  }
}
