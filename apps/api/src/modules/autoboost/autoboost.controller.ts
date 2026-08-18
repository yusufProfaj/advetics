import { Body, Controller, Post } from '@nestjs/common';
import { z } from 'zod';
import type { TenantContext } from '@advetics/shared';
import { CurrentTenant, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { YouTubeSubscribeService } from './youtube-subscribe.service';

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
  constructor(private readonly subscribe: YouTubeSubscribeService) {}

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
