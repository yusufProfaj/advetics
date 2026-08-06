import { Global, Module } from '@nestjs/common';
import { ConnectionsModule } from '../modules/connections/connections.module';
import { QuotaGuardService } from './quota-guard.service';
import { StructureSyncService } from './structure-sync.service';
import { SyncQueueService } from './sync-queue.service';
import { SyncProcessorService } from './sync-processor.service';

/**
 * Kuyruk ve kota altyapısı.
 *
 * @Global: hem API süreci (iş kuyruğa koymak için) hem worker süreci (işleri
 * tüketmek için) aynı servisleri kullanıyor. İki ayrı entrypoint, tek modül.
 *
 * ConnectionsModule'ü içe alıyoruz (ProviderRegistry + TokenVaultService için).
 * Ters yön YOK ve olmamalı: ConnectionsModule kuyruğa iş koymak istediğinde
 * bu modül @Global olduğu için import etmeye gerek duymuyor — etseydi döngüsel
 * bağımlılık oluşurdu.
 */
@Global()
@Module({
  imports: [ConnectionsModule],
  providers: [QuotaGuardService, SyncQueueService, SyncProcessorService, StructureSyncService],
  exports: [QuotaGuardService, SyncQueueService, SyncProcessorService, StructureSyncService],
})
export class QueueModule {}
