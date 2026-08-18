import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { BoostsModule } from '../boosts/boosts.module';
import { ConnectionsModule } from '../connections/connections.module';
import { AutoBoostQueueService } from './autoboost-queue.service';
import { AutoBoostLaunchService } from './autoboost-launch.service';
import { AutoBoostPresetService } from './autoboost-preset.service';
import { AutoBoostReadService } from './autoboost-read.service';
import { YouTubeApiService } from './youtube-api.service';
import { YouTubeSubscribeService } from './youtube-subscribe.service';
import { AutoBoostController } from './autoboost.controller';
import { YouTubeWebSubController } from './youtube-websub.controller';
import { YouTubeWebSubService } from './youtube-websub.service';

/**
 * Advetics 1.0 — otomatik boost.
 *
 * Kuyruk servisi DIŞA AÇILIYOR: organik gönderi süpürmesi (Instagram yolu)
 * onu çağırıyor ve Instagram'da "yeni gönderi" webhook'u olmadığı için kart
 * oradan besleniyor.
 */
@Module({
  // BoostsModule: yayın mevcut ve DOĞRULANMIŞ yürütücüden geçiyor.
  // İkinci bir yayın yolu yazmak, canlıda öğrenilmiş her dersi ikinci kez
  // öğrenmek demekti.
  imports: [AssetsModule, BoostsModule, ConnectionsModule],
  controllers: [AutoBoostController, YouTubeWebSubController],
  providers: [
    AutoBoostQueueService,
    AutoBoostLaunchService,
    AutoBoostPresetService,
    AutoBoostReadService,
    YouTubeApiService,
    YouTubeSubscribeService,
    YouTubeWebSubService,
  ],
  exports: [AutoBoostQueueService, YouTubeApiService, YouTubeSubscribeService],
})
export class AutoBoostModule {}
