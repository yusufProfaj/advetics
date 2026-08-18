import { Module } from '@nestjs/common';
import { AutoBoostQueueService } from './autoboost-queue.service';
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
  controllers: [AutoBoostController, YouTubeWebSubController],
  providers: [
    AutoBoostQueueService,
    AutoBoostReadService,
    YouTubeApiService,
    YouTubeSubscribeService,
    YouTubeWebSubService,
  ],
  exports: [AutoBoostQueueService, YouTubeApiService],
})
export class AutoBoostModule {}
