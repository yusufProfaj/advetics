import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import type { AutoBoostQueueList } from '@advetics/shared';
import {
  autoBoostDecisionSchema,
  autoBoostPresetInputSchema,
  type AutoBoostPresetInput,
  type AutoBoostPresetRecord,
  type AutoBoostSubscriptionHealth,
} from '@advetics/shared';
import { AutoBoostPresetService } from './autoboost-preset.service';
import { AutoBoostLaunchService } from './autoboost-launch.service';
import { AutoBoostReadService } from './autoboost-read.service';
import { YouTubeSubscribeService } from './youtube-subscribe.service';

/**
 * Tek tıkla yayın gövdesi — SADECE müşteri kimliği.
 *
 * `strict()` KASITLI: gövdeye bütçe ya da hedefleme sızarsa istek REDDEDİLİR.
 * Sessizce yok saymak, "ön ayar uygulandı" sanılan ama aslında istemcinin
 * gönderdiği bir alanın uygulandığı bir gelecek bırakırdı.
 */
const presetLaunchSchema = z.object({ clientId: z.string().uuid() }).strict();

/**
 * Advetics 1.0 — otomatik boost yönetimi.
 *
 * WEBHOOK UCU AYRI BİR CONTROLLER'DA (`YouTubeWebSubController`) ve bu
 * bilinçli: orası `@Public()`, burası değil. İkisini aynı sınıfta tutmak,
 * `@Public()`'in yanlışlıkla sınıf seviyesine kayması ve BÜTÜN uçların
 * açılması riskini taşırdı.
 */

const kanalEkleSchema = z.object({
  clientId: z.string().uuid(),
  /**
   * Kullanıcının yapıştırdığı şey — kanal kimliği, @tanıtıcı ya da adres.
   * Hangi biçim olduğu sunucuda çözülüyor; kullanıcıya "kanal kimliğini gir"
   * demek, o kavramı bilmesini beklemek olurdu.
   */
  channelInput: z.string().min(1).max(500),
});

@Controller('autoboost')
export class AutoBoostController {
  constructor(
    private readonly subscribe: YouTubeSubscribeService,
    private readonly read: AutoBoostReadService,
    private readonly launch: AutoBoostLaunchService,
    private readonly presets: AutoBoostPresetService,
  ) {}

  /**
   * YouTube aboneliklerinin sağlığı — ölü adam düğmesi.
   *
   * `boost.read` yetiyor: yalnızca okuyor.
   */
  @Get('subscriptions/health')
  @RequirePermissions('boost.read')
  health(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AutoBoostSubscriptionHealth[]> {
    return this.read.subscriptionHealth(ctx, clientId);
  }

  /** Bilgi Bankası — bu müşterinin ön ayarları. */
  @Get('presets')
  @RequirePermissions('boost.read')
  listPresets(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AutoBoostPresetRecord[]> {
    return this.presets.list(ctx, clientId);
  }

  /**
   * Ön ayarı kaydeder.
   *
   * `boost.write` İSTİYOR, `boost.approve` DEĞİL. Ön ayar yazmak para
   * harcamıyor — harcamayı başlatan şey kartın onaylanması ve o ayrı bir
   * yetkide. Modül 7'nin baştan beri taşıdığı ayrım.
   */
  @Put('presets')
  @RequirePermissions('boost.write')
  savePreset(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(autoBoostPresetInputSchema)) input: AutoBoostPresetInput,
  ): Promise<AutoBoostPresetRecord> {
    return this.presets.upsert(ctx, input);
  }

  /**
   * "ONAYLA VE BOOSTLA" — kartı yayına alır ya da reddeder.
   *
   * `boost.approve` İSTİYOR, `boost.read` DEĞİL. Bu uç ara onay adımı olmadan
   * PARA TAAHHÜT EDİYOR; okuma yetkisiyle aynı kefeye koymak, kartları
   * görebilen herkesin harcama başlatabilmesi demekti. Modül 7'nin baştan
   * beri taşıdığı ayrım.
   */
  @Post('queue/:id/decision')
  @RequirePermissions('boost.approve')
  decide(
    @CurrentTenant() ctx: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(zodBody(autoBoostDecisionSchema)) body: { approve: boolean },
  ): Promise<{ status: string; message: string }> {
    return this.launch.decide(ctx, id, body.approve);
  }

  /**
   * TEK TIKLA YAYIN — gönderi listesindeki "Yayınla" düğmesi.
   *
   * GÖVDE YALNIZCA MÜŞTERİ KİMLİĞİ TAŞIYOR: bütçe, süre, hedefleme ve ad
   * Bilgi Bankası ön ayarından geliyor. İstemcinin gönderebileceği bir bütçe
   * alanı OLMAMASI kasıtlı — olsaydı "kullanıcı hiçbir şey girmiyor" iddiası
   * yalnızca arayüzde doğru olurdu ve API'yi doğrudan çağıran biri ön ayarı
   * atlayabilirdi.
   *
   * `boost.approve` İSTİYOR: bu uç ara onay adımı olmadan PARA TAAHHÜT
   * EDİYOR. `boost.read` ile aynı kefeye koymak, gönderileri görebilen
   * herkesin harcama başlatabilmesi demekti.
   */
  @Post('posts/:postId/launch')
  @RequirePermissions('boost.approve')
  launchPost(
    @CurrentTenant() ctx: TenantContext,
    @Param('postId', ParseUUIDPipe) postId: string,
    @Body(zodBody(presetLaunchSchema)) body: { clientId: string },
  ): Promise<{ status: string; message: string }> {
    return this.launch.gonderiyiYayinla(ctx, body.clientId, postId);
  }

  /**
   * BİLDİRİM HAVUZU — onay bekleyen kartlar.
   *
   * `boost.read` yetiyor: yalnızca okuyor. Onaylamak ayrı bir yetki ve ayrı
   * bir uç nokta — Modül 7'nin baştan beri taşıdığı ayrım.
   */
  @Get('queue')
  @RequirePermissions('boost.read')
  queue(
    @CurrentTenant() ctx: TenantContext,
    @Query('clientId', ParseUUIDPipe) clientId: string,
  ): Promise<AutoBoostQueueList> {
    return this.read.listQueue(ctx, clientId);
  }

  /**
   * YouTube kanalı ekler ve bildirim aboneliğini başlatır.
   *
   * `connection.write` İSTİYOR: kanal eklemek bir bağlantı kurulumu işi ve
   * CLAUDE.md'ye göre bağlantı kurmak/kaldırmak org yöneticisi işi. Boost
   * yetkileriyle karıştırmak, kart onaylayabilen herkesin yeni kanal
   * bağlayabilmesi demekti.
   */
  @Post('youtube/channels')
  @RequirePermissions('connection.write')
  addYouTubeChannel(
    @CurrentTenant() ctx: TenantContext,
    @Body(zodBody(kanalEkleSchema)) input: z.infer<typeof kanalEkleSchema>,
  ): Promise<{ socialProfileId: string; channelId: string; title: string }> {
    return this.subscribe.addChannel(ctx, input);
  }
}
