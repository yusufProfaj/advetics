import { Global, Module } from '@nestjs/common';
import { QuotaGuardService } from './quota-guard.service';
import { SyncQueueService } from './sync-queue.service';
import { SyncProcessorService } from './sync-processor.service';

/**
 * Kuyruk ve kota altyapısı.
 *
 * @Global: hem API süreci (iş kuyruğa koymak için) hem worker süreci (işleri
 * tüketmek için) aynı servisleri kullanıyor. İki ayrı entrypoint, tek modül.
 */
@Global()
@Module({
  providers: [QuotaGuardService, SyncQueueService, SyncProcessorService],
  exports: [QuotaGuardService, SyncQueueService, SyncProcessorService],
})
export class QueueModule {}
